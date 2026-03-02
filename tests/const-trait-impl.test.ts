import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic Trait Implementations', () => {
  it('resolves trait methods for const-generic impls on concrete arrays', () => {
    const source = `
      trait Index<const N: usize> {
        fn get(self: Self, index: i32) -> i32;
      }

      impl<const N: usize> Index<N> for [i32; N] {
        fn get(self: Self, index: i32) -> i32 {
          index
        }
      }

      fn main() -> i32 {
        let arr: [i32; 3] = [1, 2, 3];
        arr.get(2)
      }
    `.trim() + '\n';

    const { diagnostics, traitMethodResolutions } = analyzeLumina(parseProgram(source));
    const errors = diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(traitMethodResolutions?.size ?? 0).toBeGreaterThan(0);
  });

  it('reports trait const argument kind mismatch in impl', () => {
    const source = `
      trait Index<const N: usize> {
        fn get(self: Self, index: i32) -> i32;
      }

      impl<T> Index<Vec<i32>> for [i32; 3] {
        fn get(self: Self, index: i32) -> i32 {
          index
        }
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'TRAIT-016',
      })
    );
  });

  it('satisfies const-generic trait bounds for concrete array sizes', () => {
    const source = `
      trait Index<const N: usize> {
        fn get(self: Self, index: i32) -> i32;
      }

      impl<const N: usize> Index<N> for [i32; N] {
        fn get(self: Self, index: i32) -> i32 {
          index
        }
      }

      fn first<T: Index<3>>(value: T) -> i32 {
        value.get(0)
      }

      fn main() -> i32 {
        let arr: [i32; 3] = [1, 2, 3];
        first(arr)
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    const errors = diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
