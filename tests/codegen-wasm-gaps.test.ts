import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM codegen gap closures', () => {
  it('treats declaration statements in executable blocks as compile-time only', () => {
    const source = `
      fn main() -> i32 {
        type Local = i32;
        1
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-STMT-001')).toBe(false);
    expect(result.wat).toContain('(func $main');
  });

  it('lowers cast<bool> without WASM-CAST-001', () => {
    const source = 'fn main() -> bool { cast<bool>(5) }';
    const result = generateWATFromAst(parseProgram(source + '\n'));
    expect(result.diagnostics.some((d) => d.code === 'WASM-CAST-001')).toBe(false);
    expect(result.wat).toContain('i32.ne');
  });

  it('lowers vec range indexing with vec_skip + vec_take', () => {
    const source = `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        vec.push(v, 2);
        let s = v[0..1];
        vec.len(s)
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-RANGE-002')).toBe(false);
    expect(result.wat).toContain('call $vec_skip');
    expect(result.wat).toContain('call $vec_take');
  });

  it('lowers fixed-array range indexing without unsupported diagnostics', () => {
    const source = `
      fn main() -> i32 {
        let arr: [i32; 4] = [1, 2, 3, 4];
        let s = arr[1..3];
        s[0]
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-RANGE-002')).toBe(false);
    expect(result.wat).toContain('arr_slice_loop_');
  });
});
