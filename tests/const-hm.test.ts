import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic Type Inference', () => {
  it('infers array-compatible struct literals with const size', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }

      fn test() -> Vec<i32, 3> {
        Vec { data: [1, 2, 3] }
      }
    `.trim() + '\n';

    const { diagnostics } = inferProgram(parseProgram(source));
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('detects size mismatch', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }

      fn test() -> Vec<i32, 3> {
        Vec { data: [1, 2] }
      }
    `.trim() + '\n';

    const { diagnostics } = inferProgram(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONST-SIZE-MISMATCH',
      })
    );
  });

  it('evaluates const expressions in sizes', () => {
    const source = `
      struct Matrix<T, const R: usize, const C: usize> {
        data: [T; R * C]
      }

      fn test() -> Matrix<i32, 2, 3> {
        Matrix { data: [1, 2, 3, 4, 5, 6] }
      }
    `.trim() + '\n';

    const { diagnostics } = inferProgram(parseProgram(source));
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});

