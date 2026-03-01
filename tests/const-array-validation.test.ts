import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Array Literal Validation', () => {
  it('validates array literal size', () => {
    const source = `
      struct Vec3<T> {
        data: [T; 3]
      }

      fn test() -> Vec3<i32> {
        Vec3 { data: [1, 2, 3] }
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('detects size mismatch', () => {
    const source = `
      struct Vec3<T> {
        data: [T; 3]
      }

      fn test() -> Vec3<i32> {
        Vec3 { data: [1, 2] }
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ARRAY-SIZE-MISMATCH',
        message: expect.stringContaining('Expected 3 elements, got 2'),
      })
    );
  });

  it('validates element types', () => {
    const source = `
      struct Vec3<T> {
        data: [T; 3]
      }

      fn test() -> Vec3<i32> {
        Vec3 { data: [1, 2, "three"] }
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'ARRAY-ELEM-TYPE',
      })
    );
  });
});

