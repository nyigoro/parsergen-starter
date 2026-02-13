import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { getCodeActionsForDiagnostics } from '../src/lsp/code-actions.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const toLspDiagnostics = (
  uri: string,
  diagnostics: Array<{
    message: string;
    location: { start: { line: number; column: number }; end: { line: number; column: number } };
    code?: string;
    relatedInformation?: Array<{ message: string; location: { start: { line: number; column: number }; end: { line: number; column: number } } }>;
  }>
) =>
  diagnostics.map((d) => ({
    message: d.message,
    code: d.code,
    range: {
      start: { line: d.location.start.line - 1, character: d.location.start.column - 1 },
      end: { line: d.location.end.line - 1, character: d.location.end.column - 1 },
    },
    relatedInformation: d.relatedInformation?.map((info) => ({
      message: info.message,
      location: {
        uri,
        range: {
          start: { line: info.location.start.line - 1, character: info.location.start.column - 1 },
          end: { line: info.location.end.line - 1, character: info.location.end.column - 1 },
        },
      },
    })),
  }));

describe('LSP Code Actions (type holes)', () => {
  test('offers quick-fix for unresolved param hole', () => {
    const source = `
      fn foo(x: _) { return x; }
      fn main() { return 0; }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'holes-param.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);
    const diags = project.getDiagnostics(uri);
    const lsp = toLspDiagnostics(uri, diags);
    const actions = getCodeActionsForDiagnostics(source, uri, lsp);
    const action = actions.find((a) => a.title.startsWith("Replace '_'"));
    expect(action).toBeTruthy();
  });

  test('offers quick-fix for unresolved return hole', () => {
    const source = `
      fn foo() -> _ { }
      fn main() { return 0; }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'holes-return.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);
    const diags = project.getDiagnostics(uri);
    const lsp = toLspDiagnostics(uri, diags);
    const actions = getCodeActionsForDiagnostics(source, uri, lsp);
    const action = actions.find((a) => a.title.startsWith("Replace '_'"));
    expect(action).toBeTruthy();
  });

  test('offers quick-fix for hole inside generic type', () => {
    const source = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x: Option<_> = Option.None;
        return 0;
      }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'holes-generic.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);
    const diags = project.getDiagnostics(uri);
    const lsp = toLspDiagnostics(uri, diags);
    const actions = getCodeActionsForDiagnostics(source, uri, lsp);
    const action = actions.find((a) => a.title.startsWith("Replace '_'"));
    expect(action).toBeTruthy();
  });

  test('does not offer fix when hole is successfully inferred', () => {
    const source = `
      struct List<T> { value: T }
      fn main() {
        let x: List<_> = List { value: 1 };
        return 0;
      }
    `.trim() + '\n';
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-hm', 'holes-inferred.lm')).toString();
    const project = new ProjectContext(parser);
    project.setHmDiagnostics(true);
    project.addOrUpdateDocument(uri, source, 1);
    const diags = project.getDiagnostics(uri);
    const lsp = toLspDiagnostics(uri, diags);
    const actions = getCodeActionsForDiagnostics(source, uri, lsp);
    const action = actions.find((a) => a.title.startsWith("Replace '_'"));
    expect(action).toBeFalsy();
  });
});
