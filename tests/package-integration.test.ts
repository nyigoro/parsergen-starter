import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { ProjectContext } from '../src/project/context.js';
import { extractImports } from '../src/project/imports.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function bundleForTest(entryPath: string, ctx: ProjectContext) {
  const visited = new Set<string>();
  const order: string[] = [];
  const asts = new Map<string, { type?: string; body?: unknown[] }>();

  const visit = (filePath: string) => {
    const resolved = path.resolve(filePath);
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const text = fs.readFileSync(resolved, 'utf-8');
    const parsed = parser.parse(text) as { type?: string; body?: unknown[] };
    asts.set(resolved, parsed);
    const imports = extractImports(text);
    for (const imp of imports) {
      if (imp === '@std' || imp.startsWith('@std/')) continue;
      const fromUri = pathToFileURL(resolved).toString();
      const resolvedUri = ctx.resolveImportUri(fromUri, imp);
      const depPath = resolvedUri.startsWith('file://') ? fileURLToPath(resolvedUri) : resolvedUri;
      visit(depPath);
    }
    order.push(resolved);
  };

  visit(entryPath);

  const mergedBody: unknown[] = [];
  for (const filePath of order) {
    const ast = asts.get(filePath);
    if (!ast?.body) continue;
    for (const stmt of ast.body) {
      const node = stmt as { type?: string };
      if (node.type === 'Import') continue;
      mergedBody.push(stmt);
    }
  }
  return { type: 'Program', body: mergedBody };
}

describe('Package integration (fixtures)', () => {
  test('resolves packages and compiles consumer app', () => {
    const root = path.resolve(__dirname, 'fixtures/packages/consumer-app');
    const entry = path.join(root, 'main.lm');
    const source = fs.readFileSync(entry, 'utf-8');

    const ctx = new ProjectContext(parser);
    ctx.addOrUpdateDocument(entry, source);

    const diagnostics = ctx.getDiagnostics(entry);
    const pkgDiagnostics = diagnostics.filter((diag) => typeof diag.code === 'string' && diag.code.startsWith('PKG-'));
    expect(pkgDiagnostics).toHaveLength(0);

    const deps = ctx.getDependencies(entry);
    expect(deps.some((dep) => dep.includes('my-lib'))).toBe(true);
    expect(deps.some((dep) => dep.includes('scoped-lib'))).toBe(true);

    const bundled = bundleForTest(entry, ctx);
    const generated = generateJSFromAst(bundled as never, {
      target: 'esm',
      sourceMap: false,
      sourceFile: entry,
      sourceContent: source,
    }).code;

    expect(generated).toContain('function greet');
    expect(generated).toContain('function foo');
    expect(generated).toContain('function util');
    expect(generated).toContain('function main');
  });
});
