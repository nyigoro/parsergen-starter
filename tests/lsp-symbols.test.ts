import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { WorkspaceEdit } from 'vscode-languageserver/node';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { applyRename } from '../src/lsp/rename.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-symbols', name)).toString();
}

function applyWorkspaceEdit(textByUri: Map<string, string>, edit: WorkspaceEdit): Map<string, string> {
  const next = new Map(textByUri);
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    const current = next.get(uri) ?? '';
    const doc = TextDocument.create(uri, 'lumina', 1, current);
    const sorted = [...edits].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
      return b.range.start.character - a.range.start.character;
    });
    let out = current;
    for (const textEdit of sorted) {
      const start = doc.offsetAt(textEdit.range.start);
      const end = doc.offsetAt(textEdit.range.end);
      out = out.slice(0, start) + textEdit.newText + out.slice(end);
    }
    next.set(uri, out);
  }
  return next;
}

describe('LSP symbols coverage', () => {
  test('document and workspace symbol sets include expected kinds', () => {
    const aUri = makeUri('a.lm');
    const bUri = makeUri('b.lm');
    const aSource = [
      'type UserId = int;',
      'struct User { id: int }',
      'enum Role { Admin, User }',
      'fn make_user(id: int) -> User {',
      '  return User { id };',
      '}',
      '',
    ].join('\n');
    const bSource = [
      'import { make_user } from "./a.lm";',
      'fn main() {',
      '  let u = make_user(1);',
      '  return u;',
      '}',
      '',
    ].join('\n');

    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(aUri, aSource, 1);
    project.addOrUpdateDocument(bUri, bSource, 1);

    const docSymbols = project.getSymbols(aUri)?.list() ?? [];
    const kinds = new Set(docSymbols.map((sym) => sym.kind));
    expect(kinds.has('type')).toBe(true);
    expect(kinds.has('function')).toBe(true);

    const workspaceSymbols = project
      .listDocuments()
      .flatMap((doc) => doc.symbols?.list() ?? [])
      .filter((sym) => sym.name.toLowerCase().includes('make'));
    expect(workspaceSymbols.some((sym) => sym.name === 'make_user')).toBe(true);
  });

  test('symbol index reflects rename updates', () => {
    const uri = makeUri('rename.lm');
    const source = [
      'fn make_user(id: int) -> int {',
      '  return id;',
      '}',
      'fn main() {',
      '  return make_user(1);',
      '}',
      '',
    ].join('\n');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, source, 1);
    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const position = doc.positionAt(source.indexOf('make_user') + 1);
    const rename = applyRename({
      project,
      doc,
      uri,
      position,
      newName: 'build_user',
    });
    expect(rename.errors).toHaveLength(0);
    expect(rename.edit).toBeTruthy();

    const updated = applyWorkspaceEdit(new Map([[uri, source]]), rename.edit as WorkspaceEdit);
    project.addOrUpdateDocument(uri, updated.get(uri) ?? source, 2);
    const names = new Set((project.getSymbols(uri)?.list() ?? []).map((sym) => sym.name));
    expect(names.has('build_user')).toBe(true);
    expect(names.has('make_user')).toBe(false);
  });
});
