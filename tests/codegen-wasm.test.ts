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

  it('lowers zero-payload enum matches to tag comparisons', () => {
    const source = `
      enum Flag {
        On,
        Off
      }

      fn main() -> int {
        let f = Flag.On;
        match f {
          Flag.On => { return 1; },
          Flag.Off => { return 0; }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const hardErrors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(hardErrors).toHaveLength(0);
    expect(result.wat).toContain('i32.eq');
    expect(result.wat).toContain('$match_end_');
  });

  it('lowers single-payload enum constructors and payload matches', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>
      }

      fn main() -> int {
        let e = Expr.Lit(1);
        match e {
          Expr.Lit(v) => { return v; }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-GADT-001')).toBe(false);
    expect(result.wat).toContain('call $alloc');
    expect(result.wat).toContain('i32.store');
    expect(result.wat).toContain('i32.load');
  });

  it('lowers multi-payload enum constructors and payload matches', () => {
    const source = `
      enum Pair {
        Pair(i32, i32)
      }

      fn main() -> int {
        let p = Pair.Pair(1, 2);
        match p {
          Pair.Pair(a, b) => { return a + b; }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-GADT-001')).toBe(false);
    expect(result.wat).toContain('i32.const 24');
    expect(result.wat).toContain('i32.const 8');
    expect(result.wat).toContain('i32.const 16');
    expect(result.wat).toContain('i32.add');
    expect(result.wat).toContain('i32.load');
  });
});
