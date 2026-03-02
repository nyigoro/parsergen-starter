import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('HKT HM inference', () => {
  test('infers unary type constructor applications', () => {
    const program = `
      enum Option<T> { Some(T), None }

      fn id_hkt<F<_>, A>(x: F<A>) -> F<A> {
        x
      }

      fn main() {
        let o = Option.Some(1);
        let out = id_hkt(o);
        match out {
          Option.Some(v) => v,
          Option.None => 0
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('rejects inconsistent constructor instantiation', () => {
    const program = `
      enum Option<T> { Some(T), None }
      enum Result<T, E> { Ok(T), Err(E) }

      fn pair_same<F<_>, A, B>(x: F<A>, y: F<B>) -> F<A> {
        x
      }

      fn main() {
        let o = Option.Some(1);
        let r = Result.Ok(2);
        pair_same(o, r);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(true);
  });

  test('infers binary type constructor applications', () => {
    const program = `
      enum Pair<A, B> { Pair(A, B) }

      fn id2<F<_,_>, A, B>(x: F<A, B>) -> F<A, B> {
        x
      }

      fn main() {
        let p = Pair.Pair(1, true);
        let out = id2(p);
        match out {
          Pair.Pair(v, _) => v
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });
});

