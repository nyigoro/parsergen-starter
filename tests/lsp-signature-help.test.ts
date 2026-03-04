import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { resolveSignatureHelp } from '../src/lsp/hover-signature.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('LSP signature help stability', () => {
  test('prefers innermost call in nested expressions', () => {
    const source = `
fn add(a: int, b: int) -> int { a + b }
fn wrap(x: int) -> int { x }

fn main() {
  wrap(add(1, 2));
}
`.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-signature-help', 'nested.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const position = doc.positionAt(source.indexOf('add(1, 2)') + 'add(1,'.length + 1);
    const result = resolveSignatureHelp({
      doc,
      position,
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      ast: project.getDocumentAst(uri),
      hmCallSignatures: project.getHmCallSignatures(uri),
    });
    expect(result?.signature.label).toBe('add(a: i32, b: i32) -> i32');
    expect(result?.activeParam).toBe(1);
  });

  test('computes active parameter index with nested argument expressions', () => {
    const source = `
fn sum(a: int, b: int, c: int) -> int { a + b + c }
fn add(a: int, b: int) -> int { a + b }

fn main() {
  sum(1, add(2, 3), 4);
}
`.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-signature-help', 'arg-index.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const position = doc.positionAt(source.indexOf(', 4') + 2);
    const result = resolveSignatureHelp({
      doc,
      position,
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      ast: project.getDocumentAst(uri),
      hmCallSignatures: project.getHmCallSignatures(uri),
    });
    expect(result?.signature.label).toBe('sum(a: i32, b: i32, c: i32) -> i32');
    expect(result?.activeParam).toBe(2);
  });

  test('returns all overload candidates and marks active signature', () => {
    const source = `
import { math } from "@std";

fn main() {
  math.abs(1);
}
`.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-signature-help', 'overload.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const position = doc.positionAt(source.indexOf('math.abs(1)') + 'math.abs('.length);
    const result = resolveSignatureHelp({
      doc,
      position,
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      ast: project.getDocumentAst(uri),
      hmCallSignatures: project.getHmCallSignatures(uri),
      preludeExportMap: undefined,
      resolveImportedSymbol: (name) => project.resolveImportedSymbol(name, uri),
      resolveImportedMember: (base, member) => project.resolveImportedMember(base, member, uri),
    });
    expect(result).toBeDefined();
    expect((result?.signatures.length ?? 0)).toBeGreaterThan(1);
    const active = result?.signatures[result.activeSignature];
    expect(active?.label).toContain('abs(');
  });

  test('shows instantiated generic signature at call site', () => {
    const source = `
fn identity<T>(x: T) -> T { x }

fn main() {
  identity("hi");
}
`.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-signature-help', 'generic.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const position = doc.positionAt(source.indexOf('identity("hi")') + 'identity('.length);
    const result = resolveSignatureHelp({
      doc,
      position,
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      ast: project.getDocumentAst(uri),
      hmCallSignatures: project.getHmCallSignatures(uri),
    });
    expect(result?.signature.label).toBe('identity(x: string) -> string');
  });
});
