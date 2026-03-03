import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('type constructor features', () => {
  test('supports partial application with placeholders', () => {
    const source = `
      trait Unary<F<_>> {}
      struct Demo {}
      impl Unary<Result<_, i32>> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  test('supports currying semantics for constructor prefix application', () => {
    const source = `
      trait Unary<F<_>> {}
      struct Demo {}
      impl Unary<Result<i32>> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors.some((diag) => diag.code === 'HKT-001')).toBe(false);
    expect(errors.some((diag) => diag.code === 'UNKNOWN_TYPE')).toBe(false);
  });

  test('supports type constructor composition aliases', () => {
    const source = `
      type Compose<F<_>, G<_>, A> = F<G<A>>;
      trait Unary<F<_>> {}
      struct Demo {}
      impl Unary<Compose<Option, Vec>> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  test('supports partially applied constructor aliases in trait positions', () => {
    const source = `
      type IntMap<V> = HashMap<i32, V>;
      trait Unary<F<_>> {}
      struct Demo {}
      impl Unary<IntMap> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  test('expands constructor aliases in HM inference', () => {
    const source = `
      type IntResult<T> = Result<T, i32>;

      fn use_alias(x: IntResult<i32>) -> Result<i32, i32> {
        x
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast);
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('supports composed aliases flowing through HKT-polymorphic functions', () => {
    const source = `
      type Compose<F<_>, G<_>, A> = F<G<A>>;

      fn id<F<_>, A>(x: F<A>) -> F<A> {
        x
      }

      fn demo(v: Compose<Option, Vec, i32>) -> Option<Vec<i32>> {
        id(v)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast);
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});

