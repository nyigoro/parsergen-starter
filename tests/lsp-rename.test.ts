import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { applyRename } from '../src/lsp/rename.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-rename', name)).toString();
}

describe('LSP rename', () => {
  test('renames declaration and cross-module references', () => {
    const utilsUri = makeUri('utils.lm');
    const mainUri = makeUri('main.lm');
    const utilsSource = [
      'pub fn compute(x: int) -> int {',
      '  return x + 1;',
      '}',
      '',
    ].join('\n');
    const mainSource = [
      'import { compute } from "./utils.lm";',
      'fn main() {',
      '  return compute(10);',
      '}',
      '',
    ].join('\n');

    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(utilsUri, utilsSource, 1);
    project.addOrUpdateDocument(mainUri, mainSource, 1);

    const doc = TextDocument.create(utilsUri, 'lumina', 1, utilsSource);
    const pos = doc.positionAt(utilsSource.indexOf('compute') + 1);
    const result = applyRename({
      project,
      doc,
      uri: utilsUri,
      position: pos,
      newName: 'calculate',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.edit).toBeTruthy();
    expect(Object.keys(result.edit?.changes ?? {})).toEqual(expect.arrayContaining([utilsUri, mainUri]));
    const allTexts = Object.values(result.edit?.changes ?? {}).flat().map((edit) => edit.newText);
    expect(allTexts.every((text) => text === 'calculate')).toBe(true);
  });

  test('rejects invalid rename target name', () => {
    const uri = makeUri('invalid.lm');
    const source = 'fn compute(x: int) -> int { return x; }\n';
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, source, 1);
    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const pos = doc.positionAt(source.indexOf('compute') + 1);
    const result = applyRename({
      project,
      doc,
      uri,
      position: pos,
      newName: '1bad',
    });
    expect(result.edit).toBeNull();
    expect(result.errors[0]?.kind).toBe('invalid_name');
  });

  test('reports conflicts when destination name already exists', () => {
    const uri = makeUri('conflict.lm');
    const source = [
      'fn first() -> int { return 1; }',
      'fn second() -> int { return first(); }',
      '',
    ].join('\n');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, source, 1);
    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const pos = doc.positionAt(source.indexOf('first') + 1);
    const result = applyRename({
      project,
      doc,
      uri,
      position: pos,
      newName: 'second',
    });
    expect(result.edit).toBeNull();
    expect(result.errors[0]?.kind).toBe('conflict');
  });

  test('blocks rename in dependency package paths', () => {
    const uri = 'file:///C:/workspace/.lumina/packages/pkg/src/lib.lm';
    const source = 'pub fn dep_fn() -> int { return 1; }\n';
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, source, 1);
    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const pos = doc.positionAt(source.indexOf('dep_fn') + 1);
    const result = applyRename({
      project,
      doc,
      uri,
      position: pos,
      newName: 'dep_fn2',
    });
    expect(result.edit).toBeNull();
    expect(result.errors[0]?.kind).toBe('cross_package');
  });
});
