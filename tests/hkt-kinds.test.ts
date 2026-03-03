import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('HKT kind checking', () => {
  it('reports arity mismatch when too many type arguments are applied', () => {
    const source = `
      trait Functor<F<_>> {
        fn map(fa: F<i32, i32>) -> F<i32>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(true);
  });

  it('reports arity mismatch when HKT parameter is used without type application', () => {
    const source = `
      trait Functor<F<_>> {
        fn bad(fa: F) -> F<i32>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(true);
  });

  it('accepts arity-correct higher-kinded parameters', () => {
    const source = `
      trait Higher<F<_>, G<_,_>> {
        fn combine(left: F<i32>, right: G<i32, bool>) -> F<i32>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  it('accepts partial type-constructor application with placeholders', () => {
    const source = `
      trait Functor<F<_>> {}

      struct Demo {}

      impl Functor<Result<_, i32>> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(
      sem.diagnostics.some(
        (diag) => diag.code === 'HKT-001' && String(diag.message).includes("Result")
      )
    ).toBe(false);
  });

  it('reports concrete type used where constructor kind is required with help text', () => {
    const source = `
      trait Functor<F<_>> {}

      struct Demo {}

      impl Functor<i32> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const mismatch = sem.diagnostics.find((diag) => diag.code === 'HKT-001');
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("Expected kind '* -> *'");
    const relatedMessages = (mismatch?.relatedInformation ?? []).map((item) => item.message).join(' ');
    expect(relatedMessages).toContain('Help:');
  });

  it('accepts user-defined constructors in HKT positions', () => {
    const source = `
      trait Monad<M<_>> {}

      enum IntResult<T> {
        Ok(T),
        Err(i32)
      }

      struct Demo {}

      impl Monad<IntResult> for Demo {}
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(false);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('infers constructor kind for unconstrained type parameters', () => {
    const source = `
      trait Wrap<F> {
        fn wrap(x: F<i32>) -> F<i32>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  it('supports higher-order kinds inferred from usage', () => {
    const source = `
      trait Lift<G<_>, F<_>> {
        fn lift(x: G<F>) -> G<F>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  it('infers kinds in function signatures without explicit arity annotations', () => {
    const source = `
      fn wrap<F>(x: F<i32>) -> F<i32> {
        x
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'HKT-001')).toBe(false);
  });

  it('solves kind constraints across signatures and reports concrete examples', () => {
    const source = `
      trait Lift<G<_>> {
        fn first(x: G<i32>) -> G<i32>;
        fn second(x: G<Vec>) -> G<Vec>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const mismatch = sem.diagnostics.find((diag) => diag.code === 'HKT-001');
    expect(mismatch).toBeDefined();
    const relatedMessages = (mismatch?.relatedInformation ?? []).map((item) => item.message).join(' ');
    expect(relatedMessages).toContain('Help:');
    expect(relatedMessages).toContain('Example:');
  });
});
