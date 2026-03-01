import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic WASM Codegen', () => {
  it('calculates fixed array size in struct layouts', () => {
    const source = `
      struct Vec3 {
        data: [i32; 3]
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.wat).toContain('Total size: 12 bytes');
  });

  it('generates bounds-check instructions for array indexing', () => {
    const source = `
      fn get(arr: [i32; 5], i: usize) -> i32 {
        return arr[i];
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.wat).toContain('i32.ge_u');
    expect(result.wat).toContain('unreachable');
  });

  it('computes array sizes from const expressions', () => {
    const source = `
      struct Matrix {
        data: [f64; 2 * 3]
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.wat).toContain('Total size: 48 bytes');
  });
});

