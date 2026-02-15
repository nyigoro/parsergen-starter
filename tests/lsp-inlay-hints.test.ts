import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildInlayHints } from '../src/lsp/inlay-hints.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('LSP inlay hints', () => {
  test('shows inferred let type hints', () => {
    const source = `
      fn main() {
        let value = 42;
        return value;
      }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hints', 'let-type.lm')).toString();

    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const hints = buildInlayHints({
      doc,
      ast: project.getDocumentAst(uri),
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      hmExprTypes: project.getHmExprTypes(uri),
    });

    expect(hints.some((hint) => String(hint.label).includes(': i32'))).toBe(true);
  });

  test('shows parameter hints for calls', () => {
    const source = `
      fn add(a: int, b: int) -> int {
        return a + b;
      }

      fn main() {
        let x = add(1, 2);
        return x;
      }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hints', 'params.lm')).toString();

    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);

    const doc = TextDocument.create(uri, 'lumina', 1, source);
    const hints = buildInlayHints({
      doc,
      ast: project.getDocumentAst(uri),
      symbols: project.getSymbols(uri),
      moduleBindings: project.getModuleBindings(uri),
      hmExprTypes: project.getHmExprTypes(uri),
    });

    const labels = hints.map((hint) => String(hint.label));
    expect(labels).toContain('a:');
    expect(labels).toContain('b:');
  });
});

