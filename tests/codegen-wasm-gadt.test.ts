import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM GADT lowering parity', () => {
  test('prunes index-incompatible arms before emitting tag checks', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn eval(e: Expr<i32>) -> i32 {
        match e {
          Expr.Bool(b) => 41,
          Expr.Lit(n) => n
        }
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source), { exportMain: true });
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).not.toMatch(/i32\.const 1\s+i32\.eq/);
  });

  test('lowers nested indexed patterns without WASM-GADT fallback diagnostics', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>,
        If(Expr<bool>, Expr<T>, Expr<T>): Expr<T>
      }

      fn eval(e: Expr<i32>) -> i32 {
        match e {
          Expr.If(Expr.Bool(true), Expr.Lit(n), _) => n,
          Expr.If(Expr.Bool(false), _, Expr.Lit(m)) => m,
          Expr.Lit(v) => v
        }
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source), { exportMain: true });
    expect(result.diagnostics.some((diag) => diag.code === 'WASM-GADT-001')).toBe(false);
    expect((result.wat.match(/i32\.load/g) ?? []).length).toBeGreaterThan(10);
    expect((result.wat.match(/i32\.eq/g) ?? []).length).toBeGreaterThan(5);
  });
});
