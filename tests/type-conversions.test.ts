import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Type conversions (as)', () => {
  it('allows safe int widening', () => {
    const source = `
      fn convert() -> i64 {
        let x: i32 = 42;
        return x as i64;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast as never);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('warns on lossy float to int', () => {
    const source = `
      fn convert() -> i32 {
        let x: f64 = 3.14;
        return x as i32;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast as never);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'LOSSY-CAST', 'warning')).toBe(true);
  });

  it('errors on non-numeric casts', () => {
    const source = `
      fn convert() -> i32 {
        let x = "hi";
        return x as i32;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast as never);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'TYPE-CAST', 'error')).toBe(true);
  });

  it('generates JS truncation for f64 to i32', () => {
    const source = `
      fn convert(x: f64) -> i32 {
        return x as i32;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('Math.trunc');
  });

  it('generates WAT conversion for i32 to f64', () => {
    const source = `
      fn convert(x: i32) -> f64 {
        return x as f64;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const wat = generateWATFromAst(ast, { exportMain: false }).wat;
    expect(wat).toContain('f64.convert_i32');
  });
});
