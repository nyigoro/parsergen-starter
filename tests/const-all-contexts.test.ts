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

describe('Const Generics In All Contexts', () => {
  it('accepts extended const expressions in where clauses with explicit const args', () => {
    const source = `
      fn pick<const N: usize>(x: i32) -> i32 where if N > 0 && N <= 8 { max(N, 1) == N } else { false } {
        x
      }

      fn main() -> i32 {
        pick::<4>(9)
      }
    `.trim() + '\n';

    const hm = inferProgram(parseProgram(source));
    const errors = hm.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('rejects unsatisfied extended const where clauses', () => {
    const source = `
      fn pick<const N: usize>(x: i32) -> i32 where if N > 0 && N <= 8 { max(N, 1) == N } else { false } {
        x
      }

      fn main() -> i32 {
        pick::<0>(9)
      }
    `.trim() + '\n';

    const hm = inferProgram(parseProgram(source));
    expect(hm.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'HM_CONST_WHERE',
      })
    );
  });

  it('resolves const-generic trait impls with where clauses and trait bounds', () => {
    const source = `
      trait SizedMark<const N: usize> {
        fn mark(self: Self) -> i32;
      }

      impl<const N: usize> SizedMark<N> for [i32; N] where if N > 0 { true } else { false } {
        fn mark(self: Self) -> i32 {
          1
        }
      }

      fn first<T: SizedMark<3>>(value: T) -> i32 {
        value.mark()
      }

      fn main() -> i32 {
        let arr: [i32; 3] = [1, 2, 3];
        first(arr)
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
