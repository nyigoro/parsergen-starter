import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { createStdModuleRegistry, getPreludeExports } from '../src/lumina/module-registry.js';
import { resolveCompletions } from '../src/lsp/completion.js';
import { ProjectContext } from '../src/project/context.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);
const moduleRegistry = createStdModuleRegistry();
const preludeExportMap = new Map(getPreludeExports(moduleRegistry).map((exp) => [exp.name, exp]));

function makeCompletionResult(
  source: string,
  marker: string,
  extraFiles?: Record<string, string>
) {
  const project = new ProjectContext(parser);
  project.setHmDiagnostics(true);

  if (extraFiles) {
    for (const [name, text] of Object.entries(extraFiles)) {
      project.registerVirtualFile(name, text.trim() + '\n', 1);
    }
  }

  const cleanSource = source.replace(marker, '');
  const offset = source.indexOf(marker);
  const uri = extraFiles
    ? 'virtual://main.lm'
    : pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-completion.lm')).toString();

  if (extraFiles) {
    project.registerVirtualFile('main.lm', cleanSource, 1);
  } else {
    project.addOrUpdateDocument(uri, cleanSource, 1);
  }

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

describe('LSP completion contexts', () => {
  test('completes struct fields after dot access', () => {
    const { labels } = makeCompletionResult(
      `
struct User { id: int, name: string }
fn main() {
  let user: User = User;
  user.__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toEqual(expect.arrayContaining(['id', 'name']));
  });

  test('completes namespace-imported module exports after dot access', () => {
    const { labels } = makeCompletionResult(
      `
import * as math from "@std/math";
fn main() {
  math.__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('abs');
    expect(labels).toContain('min');
  });

  test('completes methods for a typed value', () => {
    const { labels } = makeCompletionResult(
      `
struct User { id: int }
fn User_name(user: User) -> string { "ok" }

fn main() {
  let user: User = User;
  user.__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('name');
  });

  test('completes enum variants after namespace access', () => {
    const { labels } = makeCompletionResult(
      `
fn main() {
  Option::__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toEqual(expect.arrayContaining(['Some', 'None']));
  });

  test('completes module items after namespace access', () => {
    const { labels } = makeCompletionResult(
      `
import * as io from "@std/io";
fn main() {
  io::__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('println');
  });

  test('includes let bindings, params, functions, and imports in scope completion', () => {
    const { labels } = makeCompletionResult(
      `
import { abs } from "@std/math";
fn helper() -> int { 1 }
fn main(value: int) {
  let total = value;
  __CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('total');
    expect(labels).toContain('value');
    expect(labels).toContain('helper');
    expect(labels).toContain('abs');
  });

  test('does not include out-of-scope bindings', () => {
    const { labels } = makeCompletionResult(
      `
fn main() {
  if true {
    let hidden = 1;
  }
  hi__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).not.toContain('hidden');
  });

  test('completes stdlib import paths inside import source strings', () => {
    const { labels } = makeCompletionResult(
      `
import { math } from "@std/__CURSOR__"
fn main() {}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('@std/math');
    expect(labels).toContain('@std/io');
  });

  test('completes relative import paths from project files', () => {
    const { labels } = makeCompletionResult(
      `
import { parse } from "__CURSOR__"
fn main() {}
`,
      '__CURSOR__',
      {
        'parser.lm': `
pub fn parse(input: string) -> int { 42 }
`,
      }
    );

    expect(labels).toContain('./parser.lm');
  });

  test('completes imported names inside import braces', () => {
    const { labels } = makeCompletionResult(
      `
import { ab__CURSOR__ } from "@std/math"
fn main() {}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('abs');
  });

  test('returns keyword completions in generic scope contexts', () => {
    const { labels } = makeCompletionResult(
      `
fn main() {
  re__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(labels).toContain('return');
    expect(labels).toContain('ref');
  });

  test('does not duplicate completion labels', () => {
    const { labels } = makeCompletionResult(
      `
fn main() {
  ret__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(new Set(labels).size).toBe(labels.length);
  });

  test('returns no completions inside non-import strings', () => {
    const { items } = makeCompletionResult(
      `
fn main() {
  let text = "hel__CURSOR__lo";
}
`,
      '__CURSOR__'
    );

    expect(items).toHaveLength(0);
  });

  test('returns no completions inside comments', () => {
    const { items } = makeCompletionResult(
      `
fn main() {
  // hel__CURSOR__lo
}
`,
      '__CURSOR__'
    );

    expect(items).toHaveLength(0);
  });

  test('returns empty result for unknown member receiver types', () => {
    const { items } = makeCompletionResult(
      `
fn main() {
  mystery.__CURSOR__
}
`,
      '__CURSOR__'
    );

    expect(items).toHaveLength(0);
  });
});
