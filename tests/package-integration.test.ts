import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { ProjectContext } from '../src/project/context.js';
import { extractImports } from '../src/project/imports.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);
const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-pkg-integration-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

  test('resolves transitive package imports through lockfile dependency metadata', () => {
    const root = createTempDir();
    const fooRoot = path.join(root, '.lumina', 'packages', 'foo@1.0.0');
    const barRoot = path.join(root, '.lumina', 'packages', 'bar@1.0.0');
    const newerBarRoot = path.join(root, '.lumina', 'packages', 'bar@1.2.0');
    const entry = path.join(root, 'main.lm');
    fs.mkdirSync(path.join(fooRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(barRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(newerBarRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(barRoot, 'src', 'bar.lm'), 'pub fn bar() -> int { 7 }\n', 'utf-8');
    fs.writeFileSync(path.join(newerBarRoot, 'src', 'bar.lm'), 'pub fn bar() -> int { 12 }\n', 'utf-8');
    fs.writeFileSync(
      path.join(fooRoot, 'src', 'foo.lm'),
      'import { bar } from "bar";\npub fn foo() -> int { bar() }\n',
      'utf-8'
    );
    fs.writeFileSync(entry, 'import { foo } from "foo";\nfn main() -> int { foo() }\n', 'utf-8');
    fs.writeFileSync(
      path.join(root, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'foo@1.0.0': {
              name: 'foo',
              version: '1.0.0',
              resolved: 'https://registry.example.dev/foo-1.0.0.tgz',
              path: './.lumina/packages/foo@1.0.0',
              integrity: 'sha256:foo',
              lumina: './src/foo.lm',
              deps: { bar: '^1.0.0' },
              resolvedDeps: { bar: 'bar@1.0.0' },
            },
            'bar@1.0.0': {
              name: 'bar',
              version: '1.0.0',
              resolved: 'https://registry.example.dev/bar-1.0.0.tgz',
              path: './.lumina/packages/bar@1.0.0',
              integrity: 'sha256:bar',
              lumina: './src/bar.lm',
              deps: {},
            },
            'bar@1.2.0': {
              name: 'bar',
              version: '1.2.0',
              resolved: 'https://registry.example.dev/bar-1.2.0.tgz',
              path: './.lumina/packages/bar@1.2.0',
              integrity: 'sha256:bar12',
              lumina: './src/bar.lm',
              deps: {},
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const source = fs.readFileSync(entry, 'utf-8');
    const ctx = new ProjectContext(parser);
    ctx.addOrUpdateDocument(entry, source);

    const diagnostics = ctx.getDiagnostics().filter((diag) => diag.severity === 'error');
    expect(diagnostics).toHaveLength(0);
    const deps = ctx.getDependencies(path.join(fooRoot, 'src', 'foo.lm'));
    expect(deps.some((dep) => dep.includes('bar@1.0.0'))).toBe(true);
    expect(deps.some((dep) => dep.includes('bar@1.2.0'))).toBe(false);

    const bundled = bundleForTest(entry, ctx);
    const generated = generateJSFromAst(bundled as never, {
      target: 'esm',
      sourceMap: false,
      sourceFile: entry,
      sourceContent: source,
    }).code;

    expect(generated).toContain('function bar');
    expect(generated).toContain('function foo');
  });
});
