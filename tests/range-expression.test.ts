import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Range expression', () => {
  it('parses and type checks ranges', () => {
    const source = `
      fn main() -> Range {
        1..10
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('emits range helper in JS', () => {
    const source = `
      fn main() -> Range {
        ..=5
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('__lumina_range');
    expect(js).toContain('false');
  });

  it('reports non-integer bounds', () => {
    const source = `
      fn main() -> Range {
        1.5..3.2
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'RANGE_TYPE', 'error')).toBe(true);
  });
});
