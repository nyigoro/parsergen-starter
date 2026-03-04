import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { collectReferencesByName, findReferencesAtPosition } from '../src/lsp/references.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(fileName: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-references', fileName)).toString();
}

describe('LSP references hardening', () => {
  test('collects declaration, import and call sites across modules', () => {
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
      '',
      'fn main() {',
      '  // compute should not be a symbol reference',
      '  let label = "compute";',
      '  let y: int = compute(10);',
      '  return y;',
      '}',
      '',
    ].join('\n');

    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(utilsUri, utilsSource, 1);
    project.addOrUpdateDocument(mainUri, mainSource, 1);

    const refs = collectReferencesByName(project, 'compute', {
      includeDeclaration: true,
      declarationHintUri: utilsUri,
    });

    const uris = new Set(refs.map((ref) => ref.uri));
    expect(uris.has(utilsUri)).toBe(true);
    expect(uris.has(mainUri)).toBe(true);
    // declaration + import + call at minimum
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  test('findReferencesAtPosition excludes declaration when requested', () => {
    const utilsUri = makeUri('utils-2.lm');
    const mainUri = makeUri('main-2.lm');
    const utilsSource = [
      'pub fn compute(x: int) -> int {',
      '  return x + 1;',
      '}',
      '',
    ].join('\n');
    const mainSource = [
      'import { compute } from "./utils-2.lm";',
      'fn main() {',
      '  return compute(10);',
      '}',
      '',
    ].join('\n');

    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(utilsUri, utilsSource, 1);
    project.addOrUpdateDocument(mainUri, mainSource, 1);

    const doc = TextDocument.create(mainUri, 'lumina', 1, mainSource);
    const pos = doc.positionAt(mainSource.indexOf('compute(10)') + 1);
    const refsWithoutDecl = findReferencesAtPosition(project, doc, mainUri, pos, false);
    const refsWithDecl = findReferencesAtPosition(project, doc, mainUri, pos, true);
    const decl = project.findSymbolLocation('compute', mainUri);

    expect(refsWithDecl.length).toBeGreaterThanOrEqual(refsWithoutDecl.length);
    expect(decl).toBeTruthy();
    const declRange = decl?.location;
    const hasDeclWithout = refsWithoutDecl.some((ref) => {
      if (ref.uri !== decl?.uri || !declRange) return false;
      return (
        ref.range.start.line === declRange.start.line - 1 &&
        ref.range.start.character === declRange.start.column - 1
      );
    });
    const hasDeclWith = refsWithDecl.some((ref) => {
      if (ref.uri !== decl?.uri || !declRange) return false;
      return (
        ref.range.start.line === declRange.start.line - 1 &&
        ref.range.start.character === declRange.start.column - 1
      );
    });
    expect(hasDeclWithout).toBe(false);
    expect(hasDeclWith).toBe(true);
  });
});
