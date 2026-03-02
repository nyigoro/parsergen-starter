import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('GADT HM inference', () => {
  test('reports constructor index mismatch', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let bad: Expr<bool> = Expr.Lit(1);
        match bad {
          Expr.Bool(v) => { return v; },
          _ => { return false; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(true);
  });

  test('refines pattern types using indexed variant result type', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let e: Expr<i32> = Expr.Lit(1);
        match e {
          Expr.Bool(b) => {
            if (b) { return 1; } else { return 0; }
          },
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(true);
  });

  test('treats indexed matches as exhaustive when impossible variants are excluded', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let e: Expr<i32> = Expr.Lit(1);
        match e {
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map((diag) => diag.code);
    expect(codes).not.toContain('LUM-003');
  });
});

