import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readLockfileSync, LOCKFILE_FILENAME, LEGACY_LOCKFILE_FILENAME } from './lumina/lockfile.js';

type ViteModuleNode = {
  importers: Set<ViteModuleNode>;
};

type ViteDevServer = {
  moduleGraph: {
    getModuleById: (id: string) => ViteModuleNode | undefined;
    invalidateModule: (moduleNode: ViteModuleNode) => void;
  };
  ws: {
    send: (payload: { type: string }) => void;
  };
};

type ViteHotUpdateContext = {
  file: string;
  modules: ViteModuleNode[];
  server: ViteDevServer;
};

type ViteResolvedConfig = {
  root: string;
};

type LuminaVitePlugin = {
  name: string;
  enforce?: 'pre' | 'post';
  configResolved?: (config: ViteResolvedConfig) => void;
  resolveId?: (source: string, importer?: string) => string | null | Promise<string | null>;
  load?: (this: { error: (message: string) => never }, id: string) => string | null | Promise<string | null>;
  handleHotUpdate?: (
    context: ViteHotUpdateContext
  ) => ViteModuleNode[] | void | Promise<ViteModuleNode[] | void>;
};

type CompilerModule = {
  compileGrammar: (grammar: string, options?: Record<string, unknown>) => unknown;
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
const cwdRequire = createRequire(path.join(process.cwd(), '__lumina_vite_probe__.cjs'));

const defaultFileExtensions = ['.lm', '.lumina'];
const importStatementRegex = /^\s*import\s+.+?from\s+["']([^"']+)["'];?\s*$/gm;

const findPackageRoot = (): string => {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(process.cwd(), '../..'),
    typeof __dirname === 'string' ? path.resolve(__dirname, '..') : null,
  ].filter((candidate): candidate is string => typeof candidate === 'string');

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'package.json')) &&
      fs.existsSync(path.join(candidate, 'std')) &&
      (fs.existsSync(path.join(candidate, 'src', 'grammar', 'lumina.peg')) ||
        fs.existsSync(path.join(candidate, 'dist', 'index.js')))
    ) {
      return candidate;
    }
  }

  try {
    return path.dirname(cwdRequire.resolve('lumina-lang/package.json'));
  } catch {
    return process.cwd();
  }
};

const packageRoot = findPackageRoot();
const nodeRequire = createRequire(path.join(process.cwd(), '__lumina_vite_plugin_test__.cjs'));
const sourceBackedStdModules = new Set(
  fs.readdirSync(path.join(packageRoot, 'std'))
    .filter((entry) => entry.endsWith('.lm'))
    .map((entry) => entry.slice(0, -'.lm'.length))
);

const normalizeSpecifier = (fromDir: string, toFile: string): string => {
  let relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
};

const resolveStdModulePath = (moduleName: string): string | null => {
  if (!sourceBackedStdModules.has(moduleName)) return null;
  const stdlibPath = path.join(packageRoot, 'std', `${moduleName}.lm`);
  return fs.existsSync(stdlibPath) ? stdlibPath : null;
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

const appendExports = (code: string, names: string[]): string => {
  if (names.length === 0) return code;
  const existingExports = collectExistingNamedExports(code);
  const missingExports = Array.from(new Set(names)).filter((name) => !existingExports.has(name));
  if (missingExports.length === 0) return code;
  return `${code.trimEnd()}\nexport { ${missingExports.join(', ')} };\n`;
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

const parsePackageSpecifier = (specifier: string): { pkgName: string; subpath: string | null } => {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) return { pkgName: specifier, subpath: null };
    const pkgName = `${parts[0]}/${parts[1]}`;
    const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : null;
    return { pkgName, subpath };
  }
  const slash = specifier.indexOf('/');
  if (slash === -1) return { pkgName: specifier, subpath: null };
  return { pkgName: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
};

const findLockfileRoot = (fromPath: string, projectRoot: string): string | null => {
  let current = path.dirname(path.resolve(fromPath));
  while (true) {
    if (
      fs.existsSync(path.join(current, LOCKFILE_FILENAME)) ||
      fs.existsSync(path.join(current, LEGACY_LOCKFILE_FILENAME))
    ) {
      return current;
    }
    if (current === projectRoot) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (
    fs.existsSync(path.join(projectRoot, LOCKFILE_FILENAME)) ||
    fs.existsSync(path.join(projectRoot, LEGACY_LOCKFILE_FILENAME))
  ) {
    return projectRoot;
  }

  return null;
};

const readLuminaFileExtensions = (projectRoot: string): string[] => {
  try {
    const configPath = path.join(projectRoot, 'lumina.config.json');
    if (!fs.existsSync(configPath)) return defaultFileExtensions;
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { fileExtensions?: unknown };
    if (!Array.isArray(parsed.fileExtensions) || parsed.fileExtensions.length === 0) {
      return defaultFileExtensions;
    }
    const normalized = parsed.fileExtensions
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => (value.startsWith('.') ? value : `.${value}`));
    return normalized.length > 0 ? normalized : defaultFileExtensions;
  } catch {
    return defaultFileExtensions;
  }
};

const resolveWithExtensions = (resolved: string, extensions: string[]): string | null => {
  if (path.extname(resolved)) {
    return fs.existsSync(resolved) ? resolved : null;
  }
  for (const ext of extensions) {
    const candidate = `${resolved}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const resolveBarePackageImport = (
  specifier: string,
  importer: string,
  projectRoot: string,
  extensions: string[]
): string | null => {
  const lockfileRoot = findLockfileRoot(importer, projectRoot);
  if (!lockfileRoot) return null;
  const lockfile = readLockfileSync(lockfileRoot);
  const { pkgName, subpath } = parsePackageSpecifier(specifier);
  const entry = Array.from(lockfile.packages.values()).find((pkg) => pkg.name === pkgName);
  if (!entry?.lumina) return null;

  let luminaEntry: string | undefined;
  if (subpath) {
    if (typeof entry.lumina === 'object') {
      luminaEntry = entry.lumina[subpath];
    }
  } else if (typeof entry.lumina === 'string') {
    luminaEntry = entry.lumina;
  } else {
    luminaEntry = entry.lumina['.'];
  }
  if (!luminaEntry) return null;

  let packagePath = entry.path ?? entry.resolved;
  if (!path.isAbsolute(packagePath)) {
    packagePath = path.resolve(lockfileRoot, packagePath);
  }
  return resolveWithExtensions(path.resolve(packagePath, luminaEntry), extensions);
};

const collectResolvedImportStatements = (
  source: string,
  fromFile: string,
  projectRoot: string,
  extensions: string[],
  excludedNames: Set<string> = new Set()
): string[] => {
  const statements: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importStatementRegex.exec(source)) !== null) {
    const spec = match[1];
    const resolved = resolveLuminaImport(spec, fromFile, projectRoot, extensions);
    if (!resolved) continue;
    const statement = filterImportStatementNames(
      match[0].replace(spec, normalizeSpecifier(path.dirname(fromFile), resolved)).trim(),
      spec.startsWith('@std/') ? excludedNames : new Set()
    );
    if (statement) statements.push(statement);
  }
  return statements;
};

function isLuminaFile(id: string, extensions: string[]): boolean {
  return extensions.some((ext) => id.endsWith(ext)) || id.endsWith('.lum');
}

function resolveLuminaImport(
  source: string,
  importer: string | undefined,
  projectRoot: string,
  extensions: string[]
): string | null {
  if (source === '@std') return null;
  if (source.startsWith('@std/')) {
    return resolveStdModulePath(source.slice('@std/'.length));
  }
  if (source.startsWith('/')) {
    return resolveWithExtensions(path.resolve(projectRoot, `.${source}`), extensions);
  }
  if ((source.startsWith('./') || source.startsWith('../')) && importer) {
    return resolveWithExtensions(path.resolve(path.dirname(importer), source), extensions);
  }
  if (importer) {
    return resolveBarePackageImport(source, importer, projectRoot, extensions);
  }
  return null;
}

export function luminaPlugin(): LuminaVitePlugin {
  const grammarPath = path.join(packageRoot, 'src', 'grammar', 'lumina.peg');
  const runtimePath = path.join(packageRoot, 'dist', 'lumina-runtime.js');

  let compilerPromise: Promise<CompilerModule> | null = null;
  let parserPromise: Promise<unknown> | null = null;
  let projectRoot = process.cwd();
  let luminaExtensions = [...defaultFileExtensions];

  const getCompiler = async (): Promise<CompilerModule> => {
    if (!compilerPromise) {
      if (process.env.JEST_WORKER_ID) {
        compilerPromise = Promise.resolve(
          nodeRequire(path.join(packageRoot, 'src', 'index.ts')) as CompilerModule
        );
      } else {
        compilerPromise = runtimeImport(pathToFileUrl(path.join(packageRoot, 'dist', 'index.js')).href);
      }
    }
    return compilerPromise;
  };

  const getParser = async (): Promise<unknown> => {
    if (!parserPromise) {
      parserPromise = (async () => {
        const compiler = await getCompiler();
        const grammar = fs.readFileSync(grammarPath, 'utf-8');
        return compiler.compileGrammar(grammar, { cache: true });
      })();
    }
    return parserPromise;
  };

  const compileModule = async (id: string): Promise<string> => {
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
      const resolvedImports = collectResolvedImportStatements(
        source,
        id,
        projectRoot,
        luminaExtensions,
        runtimeImportNames
      );
      const withResolvedImports =
        resolvedImports.length > 0 ? `${resolvedImports.join('\n')}\n${rewritten}` : rewritten;
      const publicExports = collectPublicExports(source);
      const final = appendExports(withResolvedImports, publicExports);

      return final;
    } catch (error) {
      throw new Error(
        `Failed to compile ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  const collectAffectedModules = (seed: Array<ViteModuleNode | undefined>): ViteModuleNode[] => {
    const queue = [...seed];
    const seen = new Set<ViteModuleNode>();
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      for (const importer of current.importers) {
        queue.push(importer);
      }
    }
    return Array.from(seen);
  };

  return {
    name: 'vite-plugin-lumina',
    enforce: 'pre',
    configResolved(config: ViteResolvedConfig) {
      projectRoot = path.resolve(config.root);
      luminaExtensions = readLuminaFileExtensions(projectRoot);
    },
    resolveId(source: string, importer?: string) {
      const resolved = resolveLuminaImport(
        source,
        importer,
        projectRoot,
        luminaExtensions
      );
      return resolved ?? null;
    },
    async load(this: { error: (message: string) => never }, id: string) {
      if (!isLuminaFile(id, luminaExtensions)) return null;
      try {
        return await compileModule(id);
      } catch (error) {
        this.error(
          `Lumina plugin error in ${id}:\n${error instanceof Error ? error.message : String(error)}`
        );
      }
      return null;
    },
    handleHotUpdate({ file, modules, server }: ViteHotUpdateContext) {
      if (!isLuminaFile(file, luminaExtensions)) return;
      const directModule = server.moduleGraph.getModuleById(file);
      const affected = collectAffectedModules([
        directModule,
        ...modules,
      ]);
      if (affected.length === 0) {
        server.ws.send({ type: 'full-reload' });
        return;
      }
      for (const mod of affected) {
        server.moduleGraph.invalidateModule(mod);
      }
      return affected;
    },
  };
}

function pathToFileUrl(filePath: string): URL {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return new URL(`file://${withLeadingSlash}`);
}
