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

describe('HKT advanced features', () => {
  it('parses type-constructor constraints in where clauses', () => {
    const source = `
      trait Functor<F<_>> {}

      fn keep<F<_>, A>(value: F<A>) -> F<A> where F: Functor {
        value
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl).toBeDefined();
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    expect(fnDecl.whereTypeBounds).toHaveLength(1);
    expect(fnDecl.whereTypeBounds?.[0]?.name).toBe('F');
    expect(fnDecl.whereClauses).toHaveLength(0);
  });

  it('parses mixed const + type where clauses', () => {
    const source = `
      trait Functor<F<_>> {}

      fn choose<const N: usize, F<_>>(value: F<i32>) -> F<i32>
      where F: Functor, N > 0 {
        value
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl).toBeDefined();
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    expect(fnDecl.whereTypeBounds).toHaveLength(1);
    expect(fnDecl.whereClauses).toHaveLength(1);
  });

  it('supports HKT bounds with multi-parameter constructors in type params', () => {
    const source = `
      trait BiCtx<G<_,_>> {}

      fn use<G<_,_>: BiCtx<G>, A, B>(value: G<A, B>) -> G<A, B> {
        value
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('uses where-clause trait bounds during method resolution', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> i32;
      }

      struct User {}

      impl Printable for User {
        fn print(self: Self) -> i32 {
          1
        }
      }

      fn call_print<T>(value: T) -> i32 where T: Printable {
        value.print()
      }

      fn main() -> i32 {
        call_print(User {})
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('supports associated types with HKT arity in trait signatures', () => {
    const source = `
      import { vec } from "@std";

      trait Collection<C<_>> {
        type Wrapped<_>;
        fn wrap<A>(value: A) -> Self::Wrapped<A>;
      }

      struct VecCollection {}

      impl Collection<Vec> for VecCollection {
        type Wrapped<_> = Vec<any>;

        fn wrap<A>(value: A) -> Vec<A> {
          let out = vec.new();
          vec.push(out, value);
          out
        }
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports arity mismatch for HKT associated types in impls', () => {
    const source = `
      trait Collection<C<_>> {
        type Wrapped<_>;
      }

      struct VecCollection {}

      impl Collection<Vec> for VecCollection {
        type Wrapped = Vec<any>;
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    expect(sem.diagnostics.some((diag) => diag.code === 'TRAIT-017')).toBe(true);
  });

  it('keeps HM inference stable for multi-parameter HKT bounds', () => {
    const source = `
      trait BiCtx<G<_,_>> {}

      fn keep<G<_,_>: BiCtx<G>, A, B>(value: G<A, B>) -> G<A, B> {
        value
      }
    `.trim() + '\n';

    const hm = inferProgram(parseProgram(source));
    const errors = hm.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
