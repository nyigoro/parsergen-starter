import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { loadWASM, callWASMFunction } from '../src/wasm-runtime.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const tempDir = path.join(__dirname, '../.tmp-wasm');

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const compileAndLoad = async (source: string) => {
  const ast = parseProgram(source);
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  expect(diagnostics.length).toBe(0);

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'test.wat');
  const wasmPath = path.join(tempDir, 'test.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

const compileWatAndLoad = async (wat: string) => {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'runtime-raw.wat');
  const wasmPath = path.join(tempDir, 'runtime-raw.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

describe('WASM runtime', () => {
  it('runs simple addition', async () => {
    if (!hasWabt()) return;
    const source = `
      fn add(a: int, b: int) -> int { return a + b; }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    const result = callWASMFunction(runtime, 'add', 5, 7);
    expect(result).toBe(12);
  });

  it('handles recursion (fib)', async () => {
    if (!hasWabt()) return;
    const source = `
      fn fib(n: int) -> int {
        if (n <= 1) {
          return n;
        } else {
          return fib(n - 1) + fib(n - 2);
        }
        return 0;
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'fib', 0)).toBe(0);
    expect(callWASMFunction(runtime, 'fib', 1)).toBe(1);
    expect(callWASMFunction(runtime, 'fib', 10)).toBe(55);
  });

  it('runs Vec operations through host bindings', async () => {
    if (!hasWabt()) return;
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 10);
        vec.push(v, 20);
        vec.get(v, 1);
        vec.pop(v);
        return vec.len(v);
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'main')).toBe(1);
  });

  it('runs HashMap/HashSet operations through host bindings', async () => {
    if (!hasWabt()) return;
    const source = `
      import { hashmap, hashset } from "@std";

      fn main() -> i32 {
        let m = hashmap.new();
        hashmap.insert(m, 1, 7);
        hashmap.get(m, 1);
        hashmap.remove(m, 1);
        let s = hashset.new();
        let inserted = hashset.insert(s, 5);
        let has = hashset.contains(s, 5);
        let removed_set = hashset.remove(s, 5);
        let mut score = 0;
        if (inserted) { score = score + 1; }
        if (has) { score = score + 1; }
        if (removed_set) { score = score + 1; }
        return score + hashmap.len(m) + hashset.len(s);
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'main')).toBe(3);
  });

  it('runs Vec iterator helpers with lambda callbacks in WASM', async () => {
    if (!hasWabt()) return;
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        vec.push(v, 2);
        vec.push(v, 3);
        vec.push(v, 4);
        let any_gt3 = vec.any(v, |x| x > 3);
        let all_pos = vec.all(v, |x| x > 0);
        vec.find(v, |x| x == 2);
        vec.position(v, |x| x == 3);
        let mapped = vec.map(v, |x| x * 2);
        let filtered = vec.filter(mapped, |x| x > 4);
        let folded = vec.fold(filtered, 0, |acc, x| acc + x);
        let taken = vec.take(v, 2);
        let skipped = vec.skip(v, 2);
        let mut score = 0;
        if (any_gt3) { score = score + 1; }
        if (all_pos) { score = score + 1; }
        return score + folded + vec.len(taken) + vec.len(skipped);
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'main')).toBe(20);
  });

  it('executes for/while/while-let and match-expression control flow in WASM', async () => {
    if (!hasWabt()) return;
    const source = `
      enum Option {
        Some(i32),
        None
      }

      fn next(i: i32) -> Option {
        if (i < 3) {
          return Option.Some(i);
        } else {
          return Option.None;
        }
        return Option.None;
      }

      fn main() -> i32 {
        let mut total = 0;
        for i in 0..=3 {
          total = total + i;
        }

        let mut w = 0;
        while (w < 2) {
          w = w + 1;
        }

        let mut i = 0;
        while let Some(v) = next(i) {
          i = i + 1;
          total = total + v;
        }

        let branch = match Option.Some(w) {
          Some(v) => v,
          None => 0
        };

        return total + branch;
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'main')).toBe(11);
  });

  it('stores strings in linear memory and exposes length header', async () => {
    if (!hasWabt()) return;
    const wat = `
(module
  (import "env" "str_new" (func $str_new (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (global $heap_ptr (mut i32) (i32.const 1024))
  (func $__alloc (param $size i32) (result i32)
    global.get $heap_ptr
    local.get $size
    i32.add
    global.set $heap_ptr
    global.get $heap_ptr
    local.get $size
    i32.sub
  )
  (func $__free (param $ptr i32))
  (export "__alloc" (func $__alloc))
  (export "__free" (func $__free))
  (data (i32.const 0) "hello")
  (func $main (result i32)
    (local $s i32)
    i32.const 0
    i32.const 5
    call $str_new
    local.set $s
    local.get $s
    i32.load
  )
  (export "main" (func $main))
)
`.trim();
    const runtime = await compileWatAndLoad(wat);
    expect(callWASMFunction(runtime, 'main')).toBe(5);
  });

  it('supports retain/release reference counting hooks for managed allocations', async () => {
    if (!hasWabt()) return;
    const wat = `
(module
  (import "env" "str_new" (func $str_new (param i32 i32) (result i32)))
  (import "env" "mem_retain" (func $mem_retain (param i32)))
  (import "env" "mem_release" (func $mem_release (param i32)))
  (import "env" "mem_stats_live" (func $mem_stats_live (result i32)))
  (memory (export "memory") 1)
  (global $heap_ptr (mut i32) (i32.const 1024))
  (func $__alloc (param $size i32) (result i32)
    global.get $heap_ptr
    local.get $size
    i32.add
    global.set $heap_ptr
    global.get $heap_ptr
    local.get $size
    i32.sub
  )
  (func $__free (param $ptr i32))
  (export "__alloc" (func $__alloc))
  (export "__free" (func $__free))
  (data (i32.const 0) "x")
  (func $main (result i32)
    (local $s i32)
    i32.const 0
    i32.const 1
    call $str_new
    local.tee $s
    call $mem_retain
    call $mem_stats_live
    drop
    local.get $s
    call $mem_release
    local.get $s
    call $mem_release
    call $mem_stats_live
  )
  (export "main" (func $main))
)
`.trim();
    const runtime = await compileWatAndLoad(wat);
    expect(callWASMFunction(runtime, 'main')).toBe(0);
  });
});
