import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildCompletionItems } from '../src/lsp/completion.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('LSP member completion', () => {
  test('suggests struct fields after dot', () => {
    const project = new ProjectContext(parser);
    const filePath = path.resolve(__dirname, '../fixtures/completion.lm');
    const uri = pathToFileURL(filePath).toString();
    const source = `
struct User { id: int, name: string }
fn main() {
  let user: User = User;
  user.id;
}
`.trim() + '\n';

    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const offset = source.indexOf('user.') + 'user.'.length;
    const position = doc.positionAt(offset);

    const items = buildCompletionItems({
      doc,
      position,
      symbols: project.getSymbols(uri),
      ast: project.getDocumentAst(uri),
    });

    const labels = new Set(items.map((item) => item.label));
    expect(labels.has('id')).toBe(true);
    expect(labels.has('name')).toBe(true);
  });

  test('suggests chained struct fields after dot', () => {
    const project = new ProjectContext(parser);
    const filePath = path.resolve(__dirname, '../fixtures/completion-chain.lm');
    const uri = pathToFileURL(filePath).toString();
    const source = `
struct Profile { bio: string, age: int }
struct User { id: int, profile: Profile }
fn main() {
  let user: User = User;
  user.profile.age;
}
`.trim() + '\n';

    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const offset = source.indexOf('user.profile.') + 'user.profile.'.length;
    const position = doc.positionAt(offset);

    const items = buildCompletionItems({
      doc,
      position,
      symbols: project.getSymbols(uri),
      ast: project.getDocumentAst(uri),
    });

    const labels = new Set(items.map((item) => item.label));
    expect(labels.has('bio')).toBe(true);
    expect(labels.has('age')).toBe(true);
  });

  test('suggests fields after chained call', () => {
    const project = new ProjectContext(parser);
    const filePath = path.resolve(__dirname, '../fixtures/completion-call.lm');
    const uri = pathToFileURL(filePath).toString();
    const source = `
struct Profile { bio: string, age: int }
fn getBio() -> Profile { return Profile; }
fn User_getBio() -> Profile { return Profile; }
struct User { profile: Profile }
fn main() {
  let user: User = User;
  // user.getBio().
  // user.profile.getBio().
}
`.trim() + '\n';

    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const offset = source.indexOf('user.getBio().') + 'user.getBio().'.length;
    const position = doc.positionAt(offset);

    const items = buildCompletionItems({
      doc,
      position,
      symbols: project.getSymbols(uri),
      ast: project.getDocumentAst(uri),
    });

    const labels = new Set(items.map((item) => item.label));
    expect(labels.has('bio')).toBe(true);
    expect(labels.has('age')).toBe(true);
  });
});
