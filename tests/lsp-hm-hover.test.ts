import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { resolveHoverLabel } from '../src/lsp/hover-signature.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('LSP hover uses HM call-site instantiation', () => {
  const source = `
fn identity<T>(x: T) -> T {
  return x;
}

fn main() {
  let a = identity(1);
  let b = identity("hi");
  return a;
}
`.trim() + '\n';
  const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'main.lm')).toString();

  const project = new ProjectContext(parser);
  project.setHmDiagnostics(true);
  project.addOrUpdateDocument(uri, source, 1);

  const doc = TextDocument.create(uri, 'lumina', 1, source);
  const symbols = project.getSymbols(uri);
  const moduleBindings = project.getModuleBindings(uri);
  const ast = project.getDocumentAst(uri);
  const hmCallSignatures = project.getHmCallSignatures(uri);

  test('identity call infers int at call site', () => {
    const offset = source.indexOf('identity(1)') + 1;
    const position = doc.positionAt(offset);
    const label = resolveHoverLabel({
      doc,
      position,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
    });
    expect(label).toBe('identity(x: int) -> int');
  });

  test('identity call infers string at call site', () => {
    const offset = source.indexOf('identity("hi")') + 1;
    const position = doc.positionAt(offset);
    const label = resolveHoverLabel({
      doc,
      position,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
    });
    expect(label).toBe('identity(x: string) -> string');
  });
});

describe('LSP cross-file hover follows alias chains', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures', 'lsp-cross-file');
  const mainPath = path.join(fixturesDir, 'main.lm');
  const mainUri = pathToFileURL(mainPath).toString();
  const source = fs.readFileSync(mainPath, 'utf-8');

  const project = new ProjectContext(parser);
  project.setHmDiagnostics(true);
  project.addOrUpdateDocument(mainUri, source, 1);

  const doc = TextDocument.create(mainUri, 'lumina', 1, source);
  const symbols = project.getSymbols(mainUri);
  const moduleBindings = project.getModuleBindings(mainUri);
  const ast = project.getDocumentAst(mainUri);
  const hmCallSignatures = project.getHmCallSignatures(mainUri);

  test('hover resolves compute through math alias chain', () => {
    const offset = source.indexOf('compute(10)') + 1;
    const position = doc.positionAt(offset);
    const label = resolveHoverLabel({
      doc,
      position,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
    });
    expect(label).toBe('compute(x: int) -> int');
  });
});

describe('LSP namespace hover for module aliases', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures', 'lsp-namespace');
  const mathPath = path.join(fixturesDir, 'math.lm');

  test('hover resolves namespace member from local module', () => {
    const mainPath = path.join(fixturesDir, 'main-namespace.lm');
    const mainUri = pathToFileURL(mainPath).toString();
    const source = fs.readFileSync(mainPath, 'utf-8');

    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(pathToFileURL(mathPath).toString(), fs.readFileSync(mathPath, 'utf-8'), 1);
    project.addOrUpdateDocument(mainUri, source, 1);

    const doc = TextDocument.create(mainUri, 'lumina', 1, source);
    const symbols = project.getSymbols(mainUri);
    const moduleBindings = project.getModuleBindings(mainUri);
    const ast = project.getDocumentAst(mainUri);
    const hmCallSignatures = project.getHmCallSignatures(mainUri);

    const hoverOffset = source.indexOf('math.add') + 'math.'.length;
    const hoverPos = doc.positionAt(hoverOffset);
    const label = resolveHoverLabel({
      doc,
      position: hoverPos,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
      resolveImportedMember: (base, member) => project.resolveImportedMember(base, member, mainUri),
    });
    expect(label).toBe('add(a: int, b: int) -> int');
  });

  test('hover resolves multiple namespace aliases to same module', () => {
    const mainPath = path.join(fixturesDir, 'main-alias.lm');
    const mainUri = pathToFileURL(mainPath).toString();
    const source = fs.readFileSync(mainPath, 'utf-8');

    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(pathToFileURL(mathPath).toString(), fs.readFileSync(mathPath, 'utf-8'), 1);
    project.addOrUpdateDocument(mainUri, source, 1);

    const doc = TextDocument.create(mainUri, 'lumina', 1, source);
    const symbols = project.getSymbols(mainUri);
    const moduleBindings = project.getModuleBindings(mainUri);
    const ast = project.getDocumentAst(mainUri);
    const hmCallSignatures = project.getHmCallSignatures(mainUri);

    const hoverOffset = source.indexOf('calc.add') + 'calc.'.length;
    const hoverPos = doc.positionAt(hoverOffset);
    const label = resolveHoverLabel({
      doc,
      position: hoverPos,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
      resolveImportedMember: (base, member) => project.resolveImportedMember(base, member, mainUri),
    });
    expect(label).toBe('add(a: int, b: int) -> int');
  });

  test('shadowed namespace does not resolve to module hover', () => {
    const mainPath = path.join(fixturesDir, 'main-shadow.lm');
    const mainUri = pathToFileURL(mainPath).toString();
    const source = fs.readFileSync(mainPath, 'utf-8');

    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(pathToFileURL(mathPath).toString(), fs.readFileSync(mathPath, 'utf-8'), 1);
    project.addOrUpdateDocument(mainUri, source, 1);

    const doc = TextDocument.create(mainUri, 'lumina', 1, source);
    const symbols = project.getSymbols(mainUri);
    const moduleBindings = project.getModuleBindings(mainUri);
    const ast = project.getDocumentAst(mainUri);
    const hmCallSignatures = project.getHmCallSignatures(mainUri);

    const hoverOffset = source.indexOf('math.add') + 'math.'.length;
    const hoverPos = doc.positionAt(hoverOffset);
    const label = resolveHoverLabel({
      doc,
      position: hoverPos,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, mainUri),
      resolveImportedMember: (base, member) => project.resolveImportedMember(base, member, mainUri),
    });
    expect(label).toBeNull();
  });
});

describe('LSP hover shows HM-inferred map result types', () => {
  const source = `
import { Option } from "@std";

fn inc(x: int) -> int {
  return x + 1;
}

fn main() {
  let value = Option.Some(1);
  let mapped = Option.map(inc, value);
  return mapped;
}
`.trim() + '\n';
  const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'option-map.lm')).toString();

  const project = new ProjectContext(parser);
  project.setHmDiagnostics(true);
  project.addOrUpdateDocument(uri, source, 1);

  const doc = TextDocument.create(uri, 'lumina', 1, source);
  const symbols = project.getSymbols(uri);
  const moduleBindings = project.getModuleBindings(uri);
  const ast = project.getDocumentAst(uri);
  const hmCallSignatures = project.getHmCallSignatures(uri);
  const hmExprTypes = project.getHmExprTypes(uri);

  test('hovering mapped result shows Option<int>', () => {
    const offset = source.indexOf('return mapped') + 'return '.length;
    const position = doc.positionAt(offset);
    const label = resolveHoverLabel({
      doc,
      position,
      symbols,
      moduleBindings,
      ast,
      hmCallSignatures,
      hmExprTypes,
    });
    expect(label).toBe('Option<int>');
  });
});
