import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import { formatDiagnosticExplanation } from '../src/lumina/diagnostic-explain.js';
import { getCodeActionsForDiagnostics } from '../src/lsp/code-actions.js';
import { runLumina } from '../src/bin/lumina-core.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const toLspDiagnostics = (
  uri: string,
  diagnostics: Array<{
    message: string;
    code?: string;
    location: { start: { line: number; column: number }; end: { line: number; column: number } };
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

describe('WASM-IS-001 UX', () => {
  const source = `
    enum Option<T> {
      Some(T),
      None
    }

    fn main(opt: Option<i32>) -> i32 {
      if (opt is Option.Some) {
        return 1;
      }
      return 0;
    }
  `.trim() + '\n';

  test('semantic diagnostic includes the checked variant and concrete match rewrite', () => {
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast, { target: 'wasm' });
    const diagnostic = analysis.diagnostics.find((diag) => diag.code === 'WASM-IS-001');
    expect(diagnostic).toBeTruthy();
    expect(diagnostic?.message).toContain(`'Option.Some'`);
    expect(diagnostic?.message).toContain('match opt { Option.Some(_) => true, _ => false }');
    expect(diagnostic?.code).toBe('WASM-IS-001');
  });

  test('explain text includes plain-language why and before/after rewrite guidance', () => {
    const explanation = formatDiagnosticExplanation('WASM-IS-001');
    expect(explanation).toContain('WASM-IS-001: `is` narrowing is not supported in the WASM target');
    expect(explanation).toContain('The `is` operator performs runtime type narrowing');
    expect(explanation).toContain('Before: if x is Foo { ... }');
    expect(explanation).toContain('After:  match x { Foo(_) => { ... }, _ => {} }');
  });

  test('LSP code actions offer a quick-fix rewrite to match expression', () => {
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast, { target: 'wasm' });
    const diagnostics = analysis.diagnostics.filter((diag) => diag.code === 'WASM-IS-001' && !!diag.location) as Array<{
      message: string;
      code?: string;
      location: { start: { line: number; column: number }; end: { line: number; column: number } };
      relatedInformation?: Array<{ message: string; location: { start: { line: number; column: number }; end: { line: number; column: number } } }>;
    }>;
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'wasm-is-001.lm')).toString();
    const lspDiagnostics = toLspDiagnostics(uri, diagnostics);
    const actions = getCodeActionsForDiagnostics(source, uri, lspDiagnostics);
    const action = actions.find((candidate) => candidate.title === 'Rewrite as match expression');
    expect(action).toBeTruthy();
    const edit = action?.edit?.changes?.[uri]?.[0];
    expect(edit?.newText).toBe('match opt { Option.Some(_) => true, _ => false }');
  });

  test('lumina explain WASM-IS-001 prints the polished explanation', async () => {
    const writes: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      writes.push(args.map((value) => String(value)).join(' '));
    };

    try {
      await runLumina(['explain', 'WASM-IS-001']);
    } finally {
      console.log = originalLog;
    }

    const output = writes.join('\n');
    expect(output).toContain('WASM-IS-001');
    expect(output).toContain('How to fix:');
    expect(output).toContain('Before: if x is Foo { ... }');
  });
});
