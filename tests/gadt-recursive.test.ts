import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('recursive GADT hardening', () => {
  test('supports typed recursive lambda-calculus style encodings', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Var(string): Expr<i32>,
        Lam(string, Expr<i32>): Expr<Fn<i32, i32>>,
        App(Expr<Fn<i32, i32>>, Expr<i32>): Expr<i32>
      }

      fn eval(e: Expr<i32>) -> i32 {
        match e {
          Expr.Lit(n) => n,
          Expr.Var(_) => 0,
          Expr.App(Expr.Lam(_, body), Expr.Lit(_)) => eval(body)
        }
      }
    `.trim() + '\n';

    const result = inferProgram(parseProgram(source));
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('handles mutually recursive indexed enums without inference loops', () => {
    const source = `
      enum Even<T> {
        Zero: Even<i32>,
        Step(Odd<T>): Even<T>
      }

      enum Odd<T> {
        One: Odd<i32>,
        Step(Even<T>): Odd<T>
      }

      fn score(value: Even<i32>) -> i32 {
        match value {
          Even.Zero => 0,
          Even.Step(Odd.One) => 1,
          Even.Step(Odd.Step(_)) => 2
        }
      }
    `.trim() + '\n';

    const result = inferProgram(parseProgram(source));
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('caps runaway recursive refinement depth', () => {
    const wrapDepth = 40;
    let nestedPattern = 'Expr.Lit(n)';
    for (let i = 0; i < wrapDepth; i += 1) {
      nestedPattern = `Expr.Wrap(${nestedPattern})`;
    }

    const source = `
      enum Expr<T> {
        Wrap(Expr<T>): Expr<T>,
        Lit(i32): Expr<i32>
      }

      fn deep(e: Expr<i32>) -> i32 {
        match e {
          ${nestedPattern} => n,
          _ => 0
        }
      }
    `.trim() + '\n';

    const result = inferProgram(parseProgram(source));
    expect(result.diagnostics.some((diag) => diag.code === 'GADT-008')).toBe(true);
  });
});
