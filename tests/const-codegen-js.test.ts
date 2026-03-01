import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const compileToJS = (source: string, monomorphizeProgram = false, includeRuntime = false): string => {
  const ast = parseProgram(source);
  const program = monomorphizeProgram
    ? monomorphize(JSON.parse(JSON.stringify(ast)) as never, {
        inferredCalls: inferProgram(ast as never).inferredCalls,
      })
    : ast;
  return generateJSFromAst(program as never, { includeRuntime }).code;
};

describe('Const Generic JavaScript Codegen', () => {
  it('generates runtime size validation in struct constructors', () => {
    const source = `
      struct Vec3 {
        data: [i32; 3]
      }
    `.trim() + '\n';

    const js = compileToJS(source);
    expect(js).toContain('class Vec3');
    expect(js).toContain('data.length !== 3');
    expect(js).toContain('Array field \\"data\\" must have exactly 3 elements');
  });

  it('includes array bounds checking helper logic', () => {
    const source = `
      fn get_at(items: [i32; 3], i: usize) -> i32 {
        items[i]
      }
    `.trim() + '\n';

    const js = compileToJS(source, false, false);
    expect(js).toContain('__lumina_array_bounds_check');
    expect(js).toContain('Array index out of bounds');
  });

  it('evaluates const expressions in struct array sizes', () => {
    const source = `
      struct Matrix {
        data: [i32; 2 * 3]
      }
    `.trim() + '\n';

    const js = compileToJS(source);
    expect(js).toContain('data.length !== 6');
  });

  it('emits specialized classes per const value after monomorphization', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }

      fn make3() -> Vec<i32, 3> {
        Vec { data: [1, 2, 3] }
      }

      fn make5() -> Vec<i32, 5> {
        Vec { data: [1, 2, 3, 4, 5] }
      }
    `.trim() + '\n';

    const js = compileToJS(source, true);
    expect(js).toMatch(/class Vec_i32_3/);
    expect(js).toMatch(/class Vec_i32_5/);
  });
});
