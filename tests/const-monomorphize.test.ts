import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import type { LuminaProgram, LuminaStructDecl } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeSource = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never);
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  return monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
};

const collectSpecializedStructs = (program: LuminaProgram, baseName: string): LuminaStructDecl[] =>
  program.body.filter(
    (stmt): stmt is LuminaStructDecl => stmt.type === 'StructDecl' && stmt.name.startsWith(`${baseName}_`)
  );

describe('Const Generic Struct Monomorphization', () => {
  it('generates unique struct specializations per const value', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }

      fn test1() -> Vec<i32, 3> {
        Vec { data: [1, 2, 3] }
      }

      fn test2() -> Vec<i32, 5> {
        Vec { data: [1, 2, 3, 4, 5] }
      }
    `.trim() + '\n';

    const mono = monomorphizeSource(source);
    const specialized = collectSpecializedStructs(mono, 'Vec');
    expect(specialized.length).toBe(2);
    expect(specialized.some((stmt) => stmt.name.includes('Vec_i32_3'))).toBe(true);
    expect(specialized.some((stmt) => stmt.name.includes('Vec_i32_5'))).toBe(true);
  });

  it('reuses struct specialization for identical const values', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }

      fn test1() -> Vec<i32, 3> {
        Vec { data: [1, 2, 3] }
      }

      fn test2() -> Vec<i32, 3> {
        Vec { data: [4, 5, 6] }
      }
    `.trim() + '\n';

    const mono = monomorphizeSource(source);
    const specialized = collectSpecializedStructs(mono, 'Vec');
    expect(specialized.length).toBe(1);
    expect(specialized[0]?.name.includes('Vec_i32_3')).toBe(true);
  });

  it('evaluates const expressions in specialized array fields', () => {
    const source = `
      struct Matrix<T, const R: usize, const C: usize> {
        data: [T; R * C]
      }

      fn test() -> Matrix<i32, 2, 3> {
        Matrix { data: [1, 2, 3, 4, 5, 6] }
      }
    `.trim() + '\n';

    const mono = monomorphizeSource(source);
    const specialized = collectSpecializedStructs(mono, 'Matrix');
    expect(specialized.length).toBe(1);
    const dataField = specialized[0]?.body.find((field) => field.name === 'data');
    expect(dataField).toBeDefined();
    const typeName = dataField?.typeName as { kind?: string; size?: { type?: string; value?: number } } | undefined;
    expect(typeName?.kind).toBe('array');
    expect(typeName?.size?.type).toBe('ConstLiteral');
    expect(typeName?.size?.value).toBe(6);
  });
});

