import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM codegen (WAT)', () => {
  it('emits a simple i32 add function', () => {
    const source = `
      fn add(a: int, b: int) -> int {
        return a + b;
      }
      fn main() -> int {
        return add(2, 3);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.length).toBe(0);
    expect(result.wat).toContain('(func $add');
    expect(result.wat).toContain('i32.add');
    expect(result.wat).toContain('(export "main" (func $main))');
  });
});
