import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

type CompilerModule = {
  compileGrammar: (grammar: string) => unknown;
  parseLumina: (parser: unknown, input: string, options?: Record<string, unknown>) => unknown;
  generateJSFromAst: (
    program: unknown,
    options?: {
      target?: 'esm' | 'cjs';
      includeRuntime?: boolean;
      sourceMap?: boolean;
      sourceFile?: string;
      sourceContent?: string;
    }
  ) => { code: string };
};

const runtimeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<CompilerModule>;

const findRepoRoot = (): string => {
  const candidates = [
    typeof __dirname === 'string' ? path.resolve(__dirname, '..') : null,
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ].filter((candidate): candidate is string => !!candidate);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'src', 'grammar', 'lumina.peg'))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '..');
};

const repoRoot = findRepoRoot();
const currentDir = path.join(repoRoot, 'demo');
const nodeRequire = createRequire(path.join(currentDir, 'vite-plugin-lumina.ts'));

const importStatementRegex = /^\s*import\s+.+?from\s+["']([^"']+)["'];?\s*$/gm;
const sourceBackedStdModules = new Set(
  fs.readdirSync(path.join(repoRoot, 'std'))
    .filter((entry) => entry.endsWith('.lm'))
    .map((entry) => entry.slice(0, -'.lm'.length))
);

const resolveStdModulePath = (repoRoot: string, moduleName: string): string | null => {
  if (!sourceBackedStdModules.has(moduleName)) {
    return null;
  }
  const stdlibPath = path.join(repoRoot, 'std', `${moduleName}.lm`);
  return fs.existsSync(stdlibPath) ? stdlibPath : null;
};

const normalizeSpecifier = (fromDir: string, toFile: string): string => {
  let relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
};

const collectPublicExports = (source: string): string[] => {
  const patterns = [
    /^\s*pub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^\s*pub\s+let\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^\s*pub\s+struct\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
    /^\s*pub\s+enum\s+([A-Za-z_][A-Za-z0-9_]*)/gm,
  ];
  const names = new Set<string>();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) names.add(match[1]);
    }
  }
  return Array.from(names);
};

const appendExports = (code: string, names: string[]): string => {
  if (names.length === 0) return code;
  const existingExports = collectExistingNamedExports(code);
  const missingExports = Array.from(new Set(names)).filter((name) => !existingExports.has(name));
  if (missingExports.length === 0) return code;
  return `${code.trimEnd()}\nexport { ${missingExports.join(', ')} };\n`;
};

const collectExistingNamedExports = (code: string): Set<string> => {
  const names = new Set<string>();
  const exportListRegex = /\bexport\s*\{([^}]*)\}/gm;
  for (const match of code.matchAll(exportListRegex)) {
    const specifiers = match[1]?.split(',') ?? [];
    for (const specifier of specifiers) {
      const trimmed = specifier.trim();
      if (!trimmed) continue;
      const [, exportedName = trimmed] = trimmed.split(/\s+as\s+/);
      const normalized = exportedName.trim();
      if (normalized) names.add(normalized);
    }
  }

  const declarationPatterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
    /\bexport\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm,
  ];
  for (const pattern of declarationPatterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) names.add(match[1]);
    }
  }

  return names;
};

const collectRuntimeImportNames = (code: string): Set<string> => {
  const names = new Set<string>();
  const runtimeImportRegex = /\bimport\s*\{([^}]*)\}\s*from\s+["'][^"']*lumina-runtime\.js["']/gm;
  for (const match of code.matchAll(runtimeImportRegex)) {
    const specifiers = match[1]?.split(',') ?? [];
    for (const specifier of specifiers) {
      const trimmed = specifier.trim();
      if (!trimmed) continue;
      const [, localName = trimmed] = trimmed.split(/\s+as\s+/);
      const normalized = localName.trim();
      if (normalized) names.add(normalized);
    }
  }
  return names;
};

const filterImportStatementNames = (statement: string, excludedNames: Set<string>): string | null => {
  if (excludedNames.size === 0) return statement;
  const match = statement.match(/^(\s*import\s*\{)([^}]*)(\}\s*from\s+["'][^"']+["'];?\s*)$/s);
  if (!match) return statement;
  const kept = match[2]
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => {
      if (!specifier) return false;
      const [, localName] = specifier.split(/\s+as\s+/);
      const normalized = (localName ?? specifier).trim();
      return !excludedNames.has(normalized);
    });
  if (kept.length === 0) return null;
  return `${match[1]} ${kept.join(', ')} ${match[3]}`.trim();
};

const resolveLuminaImportSpecifier = (fromFile: string, spec: string): string | null => {
  if (spec.startsWith('./') || spec.startsWith('../')) {
    return spec;
  }
  if (spec.startsWith('@std/')) {
    const moduleName = spec.slice('@std/'.length);
    const stdlibPath = resolveStdModulePath(path.resolve(currentDir, '..'), moduleName);
    if (stdlibPath) {
      return normalizeSpecifier(path.dirname(fromFile), stdlibPath);
    }
  }
  return null;
};

const collectResolvedImportStatements = (
  source: string,
  fromFile: string,
  excludedNames: Set<string> = new Set()
): string[] => {
  const statements: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importStatementRegex.exec(source)) !== null) {
    const spec = match[1];
    const resolved = resolveLuminaImportSpecifier(fromFile, spec);
    if (resolved) {
      const statement = filterImportStatementNames(
        match[0].replace(spec, resolved).trim(),
        spec.startsWith('@std/') ? excludedNames : new Set()
      );
      if (statement) statements.push(statement);
    }
  }
  return statements;
};

export function luminaPlugin(): Plugin {
  const demoRoot = path.resolve(currentDir);
  const grammarPath = path.join(repoRoot, 'src', 'grammar', 'lumina.peg');
  const runtimePath = path.join(repoRoot, 'dist', 'lumina-runtime.js');
  const debug = process.env.LUMINA_VITE_DEBUG === '1';

  let compilerPromise: Promise<CompilerModule> | null = null;
  let parserPromise: Promise<unknown> | null = null;

  const resolveLmImport = (source: string, importer?: string): string | null => {
    if (source.startsWith('@std/')) {
      const moduleName = source.slice('@std/'.length);
      return resolveStdModulePath(repoRoot, moduleName);
    }
    if (
      (source.startsWith('./') || source.startsWith('../')) &&
      source.endsWith('.lm') &&
      importer
    ) {
      return path.resolve(path.dirname(importer), source);
    }
    return null;
  };

  const getCompiler = async (): Promise<CompilerModule> => {
    if (!compilerPromise) {
      if (process.env.JEST_WORKER_ID) {
        compilerPromise = Promise.resolve(
          nodeRequire(path.join(repoRoot, 'src', 'index.ts')) as CompilerModule
        );
      } else {
        compilerPromise = runtimeImport(
          pathToFileUrl(path.join(repoRoot, 'dist', 'index.js')).href
        );
      }
    }
    return compilerPromise;
  };

  const getParser = async (): Promise<unknown> => {
    if (!parserPromise) {
      parserPromise = (async () => {
        const compiler = await getCompiler();
        const grammar = fs.readFileSync(grammarPath, 'utf-8');
        return compiler.compileGrammar(grammar);
      })();
    }
    return parserPromise;
  };

  const compileModule = async (id: string): Promise<string> => {
    if (debug) {
      console.log(`[lumina-plugin] compiling ${path.relative(repoRoot, id)}`);
    }
    const compiler = await getCompiler();
    const parser = await getParser();
    const source = fs.readFileSync(id, 'utf-8');

    try {
      const ast = compiler.parseLumina(parser, source, { grammarSource: id });
      const generated = compiler.generateJSFromAst(ast, {
        target: 'esm',
        includeRuntime: true,
        sourceMap: false,
        sourceFile: id,
        sourceContent: source,
      });

      const runtimeSpecifier = normalizeSpecifier(path.dirname(id), runtimePath);
      const rewritten = generated.code.replace(
        /from\s+["']\.\/lumina-runtime\.js["']/g,
        `from ${JSON.stringify(runtimeSpecifier)}`
      );
      const runtimeImportNames = collectRuntimeImportNames(rewritten);
      const resolvedImports = collectResolvedImportStatements(source, id, runtimeImportNames);
      const withResolvedImports =
        resolvedImports.length > 0 ? `${resolvedImports.join('\n')}\n${rewritten}` : rewritten;
      const publicExports = collectPublicExports(source);
      const final = appendExports(withResolvedImports, publicExports);

      if (debug) {
        console.log(`[lumina-plugin] compiled ${path.relative(repoRoot, id)}`);
      }

      return final;
    } catch (error) {
      throw new Error(
        `Failed to compile ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  return {
    name: 'vite-plugin-lumina',
    enforce: 'pre',
    resolveId(source, importer) {
      const resolved = resolveLmImport(source, importer);
      if (resolved) {
        return resolved;
      }
      return null;
    },
    async load(id) {
      if (!id.endsWith('.lm')) return null;
      try {
        return await compileModule(id);
      } catch (error) {
        this.error(
          `Lumina plugin error in ${id}:\n${error instanceof Error ? error.message : String(error)}`
        );
      }
      return null;
    },
    handleHotUpdate({ file, server }) {
      if (!file.endsWith('.lm')) return;
      server.ws.send({ type: 'full-reload' });
    },
  };
}

function pathToFileUrl(filePath: string): URL {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return new URL(`file://${withLeadingSlash}`);
}
