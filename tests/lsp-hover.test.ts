import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { resolveHoverLabel, resolveSignatureHelp } from '../src/lsp/hover-signature.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('LSP hover/signature across imports', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures', 'lsp-hover');
  const mainPath = path.join(fixturesDir, 'main.lm');
  const mainUri = pathToFileURL(mainPath).toString();
  const source = fs.readFileSync(mainPath, 'utf-8');

  const project = new ProjectContext(parser);
  project.addOrUpdateDocument(mainUri, source, 1);

  const doc = TextDocument.create(mainUri, 'lumina', 1, source);
  const moduleBindings = project.getModuleBindings(mainUri);
  const symbols = project.getSymbols(mainUri);

  test('hover resolves named imports and aliases', () => {
    const sumOffset = source.indexOf('sum(1, 2)') + 1;
    const sumPos = doc.positionAt(sumOffset);
    const sumLabel = resolveHoverLabel({
      doc,
      position: sumPos,
      symbols,
      moduleBindings,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(sumLabel).toBe('sum(a: int, b: int) -> int');

    const sum2Offset = source.indexOf('sum2(3, 4)') + 1;
    const sum2Pos = doc.positionAt(sum2Offset);
    const sum2Label = resolveHoverLabel({
      doc,
      position: sum2Pos,
      symbols,
      moduleBindings,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(sum2Label).toBe('sum2(a: int, b: int) -> int');
  });

  test('hover resolves namespace member functions', () => {
    const memberOffset = source.indexOf('m.add(5, 6)') + 3;
    const memberPos = doc.positionAt(memberOffset);
    const memberLabel = resolveHoverLabel({
      doc,
      position: memberPos,
      symbols,
      moduleBindings,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(memberLabel).toBe('add(a: int, b: int) -> int');
  });

  test('signature help uses imported signatures', () => {
    const sumOffset = source.indexOf('sum(1, 2)') + 'sum('.length;
    const sumPos = doc.positionAt(sumOffset);
    const sumSig = resolveSignatureHelp({
      doc,
      position: sumPos,
      symbols,
      moduleBindings,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(sumSig?.signature.label).toBe('sum(a: int, b: int) -> int');
    expect(sumSig?.activeParam).toBe(0);

    const memberOffset = source.indexOf('m.add(5, 6)') + 'm.add('.length;
    const memberPos = doc.positionAt(memberOffset);
    const memberSig = resolveSignatureHelp({
      doc,
      position: memberPos,
      symbols,
      moduleBindings,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(memberSig?.signature.label).toBe('add(a: int, b: int) -> int');
    expect(memberSig?.activeParam).toBe(0);
  });
});
