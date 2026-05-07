import { generateJSFromAst } from '../../src/lumina/codegen-js';
import type { BrowserProjectContext } from '../../src/project/browser-context';

export type RunnableModuleImport = {
  resolvedUri: string;
  statement: string;
};

export type RunnableModuleArtifact = {
  uri: string;
  code: string;
  sourceImports: RunnableModuleImport[];
};

export type RunnableModuleGraph = {
  entryUri: string;
  modules: RunnableModuleArtifact[];
};

const importStatementRegex = /(^\s*import\b[\s\S]*?\bfrom\s+["']([^"']+)["'];?\s*)/gm;

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

const collectSourceBackedImports = (
  project: BrowserProjectContext,
  uri: string,
  source: string,
  excludedNames: Set<string>
): RunnableModuleImport[] => {
  const imports: RunnableModuleImport[] = [];
  let match: RegExpExecArray | null;
  importStatementRegex.lastIndex = 0;
  while ((match = importStatementRegex.exec(source)) !== null) {
    const statementSource = match[1];
    const specifier = match[2];
    const resolvedUri = project.resolveImportUri(uri, specifier);
    if (!project.getDocumentText(resolvedUri)) continue;
    const statement = filterImportStatementNames(
      statementSource.trim(),
      specifier.startsWith('@std/') ? excludedNames : new Set<string>()
    );
    if (!statement) continue;
    imports.push({ resolvedUri, statement });
  }
  return imports;
};

export const rewriteRunnableImportSource = (statement: string, nextSpecifier: string): string =>
  statement.replace(/\bfrom\s+["'][^"']+["']/, `from ${JSON.stringify(nextSpecifier)}`);

export const buildRunnableModuleGraph = (options: {
  project: BrowserProjectContext;
  entryUri: string;
  runtimeUrl: string;
}): RunnableModuleGraph => {
  const artifacts = new Map<string, RunnableModuleArtifact>();
  const visiting = new Set<string>();

  const visit = (uri: string): void => {
    if (artifacts.has(uri)) return;
    if (visiting.has(uri)) {
      throw new Error(`Circular runnable module dependency detected for ${uri}`);
    }

    const source = options.project.getDocumentText(uri);
    const ast = options.project.getDocumentAst(uri);
    if (!source || !ast) {
      throw new Error(`Missing runnable module source for ${uri}`);
    }

    visiting.add(uri);

    const generated = generateJSFromAst(ast as never, {
      target: 'esm',
      includeRuntime: true,
      sourceMap: false,
      sourceFile: uri,
      sourceContent: source,
    }).code.replace(/from\s+["']\.\/lumina-runtime\.js["']/g, `from ${JSON.stringify(options.runtimeUrl)}`);

    const sourceImports = collectSourceBackedImports(
      options.project,
      uri,
      source,
      collectRuntimeImportNames(generated)
    );
    for (const sourceImport of sourceImports) {
      visit(sourceImport.resolvedUri);
    }

    artifacts.set(uri, {
      uri,
      code: appendExports(generated, collectPublicExports(source)),
      sourceImports,
    });
    visiting.delete(uri);
  };

  visit(options.entryUri);

  return {
    entryUri: options.entryUri,
    modules: Array.from(artifacts.values()),
  };
};
