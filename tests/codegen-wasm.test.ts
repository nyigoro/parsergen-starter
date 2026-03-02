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

  it('supports struct construction + field load/store', () => {
    const source = `
      struct Counter {
        value: i32
      }

      fn bump(c: Counter) -> i32 {
        let mut local = c;
        local.value = local.value + 1;
        return local.value;
      }

      fn main() -> i32 {
        let c = Counter { value: 1 };
        return bump(c);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.wat).toContain('(func $Counter_new');
    expect(result.wat).toContain('i32.store');
    expect(result.wat).toContain('i32.load');
  });

  it('supports string interpolation and slicing helpers', () => {
    const source = `
      fn main() -> string {
        let name = "Lumina";
        let msg = "Hello {name}";
        return msg[0..4];
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('call $str_concat');
    expect(result.wat).toContain('call $str_slice');
    expect(result.wat).toContain('(data (i32.const');
  });

  it('emits trait impl functions and static dispatch for receiver calls', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> string;
      }

      struct User {
        name: string
      }

      impl Printable for User {
        fn print(self: Self) -> string {
          str.concat("User: ", self.name)
        }
      }

      fn main() -> string {
        let u = User { name: "A" };
        return u.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.wat).toContain('(func $Printable_User_print');
    expect(result.wat).toContain('call $Printable_User_print');
    expect(result.diagnostics.some((d) => d.code === 'WASM-TRAIT-001')).toBe(false);
  });

  it('supports Result try-operator lowering with early return', () => {
    const source = `
      enum Result<T, E> {
        Ok(T),
        Err(E)
      }

      fn compute(v: i32) -> Result<i32, string> {
        if v > 0 {
          return Result.Ok(v);
        } else {
          return Result.Err("bad");
        }
      }

      fn main() -> Result<i32, string> {
        let value = compute(3)?;
        return Result.Ok(value + 1);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(if (result i32)');
    expect(result.wat).toContain('return');
  });

  it('reports clear async/await diagnostics for unsupported WASM async runtime path', () => {
    const source = `
      async fn main() -> int {
        let v = await compute();
        return v;
      }

      async fn compute() -> int {
        return 1;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-ASYNC-001')).toBe(true);
  });

  it('supports lambda closures with captured locals', () => {
    const source = `
      fn main() -> i32 {
        let base = 2;
        let add = |x| x + base;
        return add(3);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const hardErrors = result.diagnostics.filter((d) => d.severity === 'error' && d.code !== 'WASM-ASYNC-001');
    expect(hardErrors).toHaveLength(0);
    expect(result.wat).toContain('(func $__lambda_');
    expect(result.wat).toContain('call $__lambda_');
    expect(result.diagnostics.some((d) => d.code === 'WASM-CLOSURE-001')).toBe(false);
  });
});
