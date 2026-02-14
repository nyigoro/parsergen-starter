import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildModuleGraph, resolveSymbol } from '../src/lsp/module-graph.js';
import { formatHoverContents } from '../src/lsp/hover-format.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-lsp-pkg-'));
  tempDirs.push(dir);
  return dir;
}

function writeLockfile(dir: string, lockfile: object | null) {
  const lockPath = path.join(dir, 'lumina.lock.json');
  if (lockfile == null) {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    return;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lockfile, null, 2), 'utf-8');
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LSP package resolution', () => {
  test('resolves hover and definition for package imports', () => {
    const root = path.resolve(__dirname, 'fixtures/packages/consumer-app');
    const entryPath = path.join(root, 'main.lm');
    const source = fs.readFileSync(entryPath, 'utf-8');

    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(entryPath, source);
    const entryUri = pathToFileURL(entryPath).toString();
    const graph = buildModuleGraph(project, entryUri);

    const greetDef = resolveSymbol(graph, entryUri, 'greet');
    expect(greetDef).toBeTruthy();
    expect(greetDef?.uri).toContain('my-lib');
    const greetHover = formatHoverContents('greet(name: string) -> string', greetDef ?? undefined);
    expect(greetHover).toContain('Defined in `lib.lm');

    const fooDef = resolveSymbol(graph, entryUri, 'foo');
    expect(fooDef).toBeTruthy();
    expect(fooDef?.uri).toContain('scoped-lib');

    const utilDef = resolveSymbol(graph, entryUri, 'util');
    expect(utilDef).toBeTruthy();
    expect(utilDef?.uri).toContain('utils.lm');
  });

  test('emits diagnostics for missing package', () => {
    const dir = createTempDir();
    writeLockfile(dir, {
      lockfileVersion: 1,
      packages: {
        'good-pkg': {
          version: '0.1.0',
          resolved: 'node_modules/good-pkg',
          lumina: './lib.lm',
        },
      },
    });
    const filePath = path.join(dir, 'main.lm');
    const source = 'import { foo } from "missing-pkg";\nfn main() { }\n';
    fs.writeFileSync(filePath, source, 'utf-8');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(filePath, source);
    const diagnostics = project
      .getDiagnostics(filePath)
      .filter((diag) => typeof diag.code === 'string' && diag.code.startsWith('PKG-'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-001');
  });

  test('emits diagnostics for missing export subpath', () => {
    const dir = createTempDir();
    writeLockfile(dir, {
      lockfileVersion: 1,
      packages: {
        'good-pkg': {
          version: '0.1.0',
          resolved: 'node_modules/good-pkg',
          lumina: {
            '.': './lib.lm',
          },
        },
      },
    });
    const filePath = path.join(dir, 'main.lm');
    const source = 'import { foo } from "good-pkg/invalid";\nfn main() { }\n';
    fs.writeFileSync(filePath, source, 'utf-8');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(filePath, source);
    const diagnostics = project
      .getDiagnostics(filePath)
      .filter((diag) => typeof diag.code === 'string' && diag.code.startsWith('PKG-'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-003');
  });
});
