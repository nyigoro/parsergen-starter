import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('GADT + trait integration', () => {
  test('resolves trait method calls for indexed impl targets', () => {
    const source = `
      trait Evaluable<T> {
        fn eval(self: Self) -> T;
      }

      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      impl Evaluable<i32> for Expr<i32> {
        fn eval(self: Self) -> i32 {
          match self {
            Expr.Lit(n) => n
          }
        }
      }

      fn main() -> i32 {
        let e: Expr<i32> = Expr.Lit(9);
        e.eval()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(analysis.traitMethodResolutions.size).toBeGreaterThan(0);

    const js = generateJSFromAst(ast, { traitMethodResolutions: analysis.traitMethodResolutions }).code;
    expect(js).toContain('$eval');
  });

  test('supports generic trait impl with branch-local GADT refinement', () => {
    const source = `
      trait Evaluable<T> {
        fn eval(self: Self) -> T;
      }

      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      impl<T> Evaluable<T> for Expr<T> {
        fn eval(self: Self) -> T {
          match self {
            Expr.Lit(n) => n,
            Expr.Bool(b) => b
          }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast, { useHm: true, hmSourceText: source });
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('dispatches to the most specific indexed impl when generic and concrete impls overlap', () => {
    const source = `
      trait Evaluable<T> {
        fn eval(self: Self) -> T;
      }

      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      impl<T> Evaluable<T> for Expr<T> {
        fn eval(self: Self) -> T {
          match self {
            Expr.Lit(n) => n,
            Expr.Bool(b) => b
          }
        }
      }

      impl Evaluable<i32> for Expr<i32> {
        fn eval(self: Self) -> i32 {
          42
        }
      }

      fn main() -> i32 {
        let e: Expr<i32> = Expr.Lit(9);
        e.eval()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const resolutions = Array.from(analysis.traitMethodResolutions.values());
    expect(resolutions.length).toBeGreaterThan(0);
    const evalCall = resolutions.find((entry) => entry.methodName === 'eval');
    expect(evalCall).toBeDefined();
    expect(evalCall?.traitType).toBe('Evaluable<i32>');
    expect(evalCall?.forType).toBe('Expr<i32>');
  });

  test('satisfies indexed trait bounds for generic parameters at call sites', () => {
    const source = `
      trait Evaluable<T> {
        fn eval(self: Self) -> T;
      }

      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      impl Evaluable<i32> for Expr<i32> {
        fn eval(self: Self) -> i32 {
          match self {
            Expr.Lit(n) => n
          }
        }
      }

      fn run<E: Evaluable<i32>>(value: E) -> i32 {
        1
      }

      fn main() -> i32 {
        let e: Expr<i32> = Expr.Lit(7);
        run(e)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('rejects indexed trait bound mismatch at call sites', () => {
    const source = `
      trait Evaluable<T> {
        fn eval(self: Self) -> T;
      }

      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      impl Evaluable<i32> for Expr<i32> {
        fn eval(self: Self) -> i32 {
          match self {
            Expr.Lit(n) => n
          }
        }
      }

      fn run<E: Evaluable<i32>>(value: E) -> i32 {
        1
      }

      fn main() -> i32 {
        let e: Expr<bool> = Expr.Bool(true);
        run(e)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(
      analysis.diagnostics.some((diag) => diag.severity === 'error' && String(diag.message).includes('does not satisfy bound'))
    ).toBe(true);
  });
});
