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

  it('packs mixed-size struct fields using alignment-aware layout order', () => {
    const source = `
      struct Packed {
        tiny: u8,
        wide: f64,
        mid: i32
      }

      fn main() -> i32 {
        let p = Packed { tiny: 1u8, wide: 3.5, mid: 7 };
        if (p.tiny == 1u8) {
          return p.mid + 1;
        } else {
          return p.mid;
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('field wide: offset 0, size 8, align 8');
    expect(result.wat).toContain('field mid: offset 8, size 4, align 4');
    expect(result.wat).toContain('field tiny: offset 12, size 1, align 4');
    expect(result.wat).toContain(';; Total size: 16 bytes');
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

  it('lowers async/await through wasm promise-handle runtime imports', () => {
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
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(import "env" "promise_await_i32"');
    expect(result.wat).toContain('(import "env" "promise_resolve_i32"');
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
    const hardErrors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(hardErrors).toHaveLength(0);
    expect(result.wat).toContain('(func $__lambda_');
    expect(result.wat).toContain('call $__lambda_');
    expect(result.diagnostics.some((d) => d.code === 'WASM-CLOSURE-001')).toBe(false);
  });

  it('supports i64 arithmetic without fallback diagnostics', () => {
    const source = `
      fn main() -> i64 {
        let a: i64 = 2i64;
        let b: i64 = 3i64;
        return a * b + 1i64;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('i64.mul');
    expect(result.wat).toContain('i64.add');
  });

  it('lowers select expressions via promise select runtime import', () => {
    const source = `
      async fn work(url: string) -> string {
        return url;
      }

      async fn main() -> string {
        return select! {
          first = work("a") => first,
          _ = work("b") => "b"
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(import "env" "promise_select_first_ready"');
    expect(result.wat).toContain('call $promise_select_first_ready');
  });

  it('supports guarded match lowering without unsupported diagnostics', () => {
    const source = `
      fn main() -> i32 {
        let x = 2;
        return match x {
          n if n > 1 => n,
          _ => 0
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(if (result i32)');
  });

  it('routes unknown stdlib module calls through generic host module-call imports', () => {
    const source = `
      import { path } from "@std";
      fn main() -> string {
        return path.join("a", "b");
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(import "env" "module_call2"');
    expect(result.wat).toContain('call $module_call2');
  });

  it('routes large-arity module calls through pointer-based host dispatcher', () => {
    const source = `
      import { path } from "@std";
      fn main() -> string {
        return path.join("a", "b", "c", "d", "e", "f");
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.some((d) => d.code === 'LUM-002')).toBe(true);
    expect(result.wat).toContain('(import "env" "module_call_ptr"');
    expect(result.wat).toContain('call $module_call_ptr');
  });

  it('emits WASM imports/calls for vec/hashmap/hashset core operations', () => {
    const source = `
      import { vec, hashmap, hashset } from "@std";

      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        let m = hashmap.new();
        hashmap.insert(m, 1, 2);
        let s = hashset.new();
        hashset.insert(s, 7);
        return vec.len(v) + hashmap.len(m) + hashset.len(s);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(import "env" "vec_new"');
    expect(result.wat).toContain('(import "env" "hashmap_new"');
    expect(result.wat).toContain('(import "env" "hashset_new"');
    expect(result.wat).toContain('call $vec_push');
    expect(result.wat).toContain('call $hashmap_insert_has');
    expect(result.wat).toContain('call $hashset_insert');
  });

  it('lowers vec iterator helpers to closure host imports', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        vec.push(v, 2);
        let ok = vec.any(v, |x| x > 1);
        if ok {
          return 1;
        } else {
          return 0;
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('call $vec_any_closure');
    expect(result.wat).toContain('(func $__lambda_');
    expect(result.wat).toContain('(export "__lambda_');
  });

  it('lowers while loops to wasm block/loop with exit branch', () => {
    const source = `
      fn main() -> i32 {
        let mut i = 0;
        let mut acc = 0;
        while (i < 3) {
          acc = acc + i;
          i = i + 1;
        }
        acc
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(loop $while_loop_');
    expect(result.wat).toContain('br_if $while_exit_');
  });

  it('lowers for-range loops to wasm loop with iterator updates', () => {
    const source = `
      fn main() -> i32 {
        let mut total = 0;
        for i in 0..=3 {
          total = total + i;
        }
        total
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(loop $for_loop_');
    expect(result.wat).toContain('local.set $i');
    expect(result.wat).toContain('local.set $__for_end_');
  });

  it('lowers while-let loops with enum-pattern checks', () => {
    const source = `
      enum Option {
        Some(i32),
        None
      }

      fn recv() -> Option {
        Option.None
      }

      fn main() -> i32 {
        while let Some(v) = recv() {
          return v;
        }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(loop $whilelet_loop_');
    expect(result.wat).toContain('local.set $__whilelet_');
    expect(result.wat).toContain('local.set $v');
  });

  it('lowers match expressions to wasm result blocks', () => {
    const source = `
      enum Option {
        Some(i32),
        None
      }

      fn main() -> i32 {
        let opt = Option.Some(2);
        let out = match opt {
          Some(v) => v + 1,
          None => 0
        };
        out
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(block $match_expr_end_');
    expect(result.wat).toContain('(if (result i32)');
    expect(result.wat).toContain('local.set $__match_expr_');
  });

  it('keeps return behavior inside nested loop contexts', () => {
    const source = `
      fn main() -> i32 {
        while (true) {
          return 7;
        }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(loop $while_loop_');
    expect(result.wat).toContain('return');
  });

  it('emits explicit memory management hooks and allocator exports', () => {
    const source = `
      import { str } from "@std";

      fn main() -> i32 {
        let a = "a";
        let b = "b";
        let c = str.concat(a, b);
        if c == "ab" {
          1
        } else {
          0
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('(import "env" "mem_retain"');
    expect(result.wat).toContain('(import "env" "mem_release"');
    expect(result.wat).toContain('(import "env" "mem_stats_live"');
    expect(result.wat).toContain('(func $free (param $ptr i32)');
    expect(result.wat).toContain('(global $free_head (mut i32)');
    expect(result.wat).toContain('(export "__alloc" (func $alloc))');
    expect(result.wat).toContain('(export "__free" (func $free))');
  });

  it('supports struct-pattern matches in WASM lowering', () => {
    const source = `
      struct Pair {
        left: i32,
        right: i32
      }

      fn main() -> i32 {
        let p = Pair { left: 4, right: 5 };
        match p {
          Pair { left: a, right: b } => { a + b }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('local.set $a');
    expect(result.wat).toContain('local.set $b');
  });

  it('supports tuple-pattern matches in WASM lowering', () => {
    const source = `
      fn main() -> i32 {
        let t = (2, 3);
        match t {
          (a, b) => { a + b }
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('i32.const 24');
    expect(result.wat).toContain('local.set $a');
    expect(result.wat).toContain('local.set $b');
  });

  it('supports break/continue lowering in loop bodies', () => {
    const source = `
      fn main() -> i32 {
        let mut i = 0;
        while (i < 10) {
          i = i + 1;
          if (i == 3) { continue; }
          if (i == 7) { break; }
        }
        i
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('br $while_loop_');
    expect(result.wat).toContain('br $while_exit_');
  });

  it('uses explicit member diagnostics instead of generic unsupported errors', () => {
    const source = `
      fn main() -> i32 {
        let y = 1;
        let x = y.value;
        x
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-MEMBER-001')).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('unsupported assignment target member'))).toBe(false);
  });

  it('uses explicit struct literal diagnostics instead of unsupported errors', () => {
    const source = `
      struct Pair {
        left: i32,
        right: i32
      }

      fn main() -> Pair {
        Pair { left: 1 }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-STRUCT-001')).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('unsupported struct literal'))).toBe(false);
  });

  it('uses explicit try diagnostics instead of unsupported errors', () => {
    const source = `
      fn main() -> i32 {
        let x = 1?;
        x
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-TRY-001')).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('unsupported try operator'))).toBe(false);
  });

  it('emits enum arity mismatch diagnostics without using unsupported fallback', () => {
    const source = `
      enum Option {
        Some(i32),
        None
      }

      fn main() -> i32 {
        let o = Option.Some();
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    expect(result.diagnostics.some((d) => d.code === 'WASM-GADT-001')).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes('unsupported enum constructor'))).toBe(false);
  });

  it('keeps enum zero-payload member access working after member-lowering hardening', () => {
    const source = `
      enum Flag {
        On,
        Off
      }

      fn main() -> i32 {
        let f = Flag.On;
        match f {
          Flag.On => 1,
          Flag.Off => 0
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWATFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(result.wat).toContain('i32.const 0');
  });
});
