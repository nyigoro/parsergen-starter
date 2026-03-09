import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { createStdModuleRegistry, getPreludeExports } from '../src/lumina/module-registry.js';
import { resolveCompletions } from '../src/lsp/completion.js';
import { buildVaultRegistry } from '../src/lsp/vault-registry.js';
import { ProjectContext } from '../src/project/context.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const tempDirs: string[] = [];

function createWorkspace(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf-8');
}

function makeCompletionResult(workspaceRoot: string | null, source: string, marker: string) {
  const baseRegistry = createStdModuleRegistry();
  const moduleRegistry = buildVaultRegistry(workspaceRoot, baseRegistry);
  const preludeExportMap = new Map(getPreludeExports(moduleRegistry).map((exp) => [exp.name, exp]));
  const project = new ProjectContext(parser, undefined, undefined, { moduleRegistry });
  project.setHmDiagnostics(true);

  const cleanSource = source.replace(marker, '');
  const offset = source.indexOf(marker);
  const filePath = workspaceRoot ? path.join(workspaceRoot, 'main.lm') : path.join(process.cwd(), '.tmp-vault-completion-main.lm');
  const uri = pathToFileURL(filePath).toString();
  project.addOrUpdateDocument(uri, cleanSource, 1);

  const doc = TextDocument.create(uri, 'lumina', 1, cleanSource);
  const position = doc.positionAt(offset);
  const items = resolveCompletions({
    doc,
    position,
    symbols: project.getSymbols(uri),
    ast: project.getDocumentAst(uri),
    moduleBindings: project.getModuleBindings(uri),
    hmExprTypes: project.getHmExprTypes(uri),
    preludeExportMap,
    moduleRegistry,
    project,
    uri,
    resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, uri),
    resolveImportedMember: (base, member) => project.resolveImportedMember(base, member, uri),
  });
  return { items, labels: items.map((item) => item.label) };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('LSP vault-aware import completion', () => {
  test('installed packages appear in import-path completions alongside std modules', () => {
    const root = createWorkspace('lumina-vault-completion-');
    writeJson(path.join(root, 'lumina.lock'), {
      version: 1,
      packages: {
        'demo-pkg@1.2.3': {
          name: 'demo-pkg',
          version: '1.2.3',
          resolved: 'node_modules/demo-pkg',
          integrity: 'sha256:deadbeef',
          lumina: 'src/main.lm',
          deps: {},
        },
      },
    });

    const { labels } = makeCompletionResult(
      root,
      'import { value } from "__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('demo-pkg');
    expect(labels).toContain('@std/math');
  });

  test('empty lockfile falls back to std modules only', () => {
    const root = createWorkspace('lumina-vault-empty-');
    writeJson(path.join(root, 'lumina.lock'), { version: 1, packages: {} });

    const { labels } = makeCompletionResult(
      root,
      'import { value } from "@st__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('@std/math');
    expect(labels).not.toContain('demo-pkg');
  });

  test('malformed lockfile does not crash and still returns std modules', () => {
    const root = createWorkspace('lumina-vault-malformed-');
    writeText(path.join(root, 'lumina.lock'), '{not valid json');

    const { labels } = makeCompletionResult(
      root,
      'import { value } from "@st__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('@std/io');
  });

  test('package with lumina string entry is importable by package name', () => {
    const root = createWorkspace('lumina-vault-string-');
    writeJson(path.join(root, 'lumina.lock'), {
      version: 1,
      packages: {
        'solo-pkg@0.1.0': {
          name: 'solo-pkg',
          version: '0.1.0',
          resolved: 'node_modules/solo-pkg',
          integrity: 'sha256:deadbeef',
          lumina: 'src/lib.lm',
          deps: {},
        },
      },
    });

    const { labels } = makeCompletionResult(
      root,
      'import { value } from "solo__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('solo-pkg');
  });

  test('package with lumina record exposes named exports', () => {
    const root = createWorkspace('lumina-vault-record-');
    writeJson(path.join(root, 'lumina.lock'), {
      version: 1,
      packages: {
        'toolkit@1.0.0': {
          name: 'toolkit',
          version: '1.0.0',
          resolved: 'node_modules/toolkit',
          integrity: 'sha256:deadbeef',
          lumina: {
            parse: 'src/parse.lm',
            format: 'src/format.lm',
          },
          deps: {},
        },
      },
    });

    const { labels } = makeCompletionResult(
      root,
      'import { pa__CURSOR__ } from "toolkit"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('parse');
    expect(labels).not.toContain('toolkit');
  });

  test('package with no lumina field is importable by name but has no named exports', () => {
    const root = createWorkspace('lumina-vault-no-lumina-');
    writeJson(path.join(root, 'lumina.lock'), {
      version: 1,
      packages: {
        'plain-pkg@2.0.0': {
          name: 'plain-pkg',
          version: '2.0.0',
          resolved: 'node_modules/plain-pkg',
          integrity: 'sha256:deadbeef',
          deps: {},
        },
      },
    });

    const importPaths = makeCompletionResult(
      root,
      'import { value } from "plain__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );
    expect(importPaths.labels).toContain('plain-pkg');

    const importNames = makeCompletionResult(
      root,
      'import { __CURSOR__ } from "plain-pkg"\nfn main() {}\n',
      '__CURSOR__'
    );
    expect(importNames.items).toHaveLength(0);
  });

  test('all lockfile packages appear in completions', () => {
    const root = createWorkspace('lumina-vault-many-');
    writeJson(path.join(root, 'lumina.lock'), {
      version: 1,
      packages: {
        'alpha@1.0.0': { name: 'alpha', version: '1.0.0', resolved: 'a', integrity: 'sha256:1', lumina: 'src/a.lm', deps: {} },
        'beta@1.0.0': { name: 'beta', version: '1.0.0', resolved: 'b', integrity: 'sha256:2', lumina: 'src/b.lm', deps: {} },
        'gamma@1.0.0': { name: 'gamma', version: '1.0.0', resolved: 'c', integrity: 'sha256:3', lumina: 'src/c.lm', deps: {} },
      },
    });

    const { labels } = makeCompletionResult(
      root,
      'import { value } from "__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
  });

  test('missing workspace root gracefully falls back to std-only completions', () => {
    const { labels } = makeCompletionResult(
      null,
      'import { value } from "@st__CURSOR__"\nfn main() {}\n',
      '__CURSOR__'
    );

    expect(labels).toContain('@std/math');
    expect(labels).not.toContain('alpha');
  });
});
