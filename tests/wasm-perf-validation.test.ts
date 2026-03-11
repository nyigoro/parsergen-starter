import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { callWASMFunction, loadWASM } from '../src/wasm-runtime.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Baseline = {
  reference_wasm_bytes: number;
};

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);
const tmpDir = path.resolve(__dirname, '../.tmp-wasm-perf');
const baselinePath = path.resolve(__dirname, './wasm-perf-validation.baseline.json');

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const wabtAvailable = hasWabt();

const ensureTmp = () => {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
};

const compileSourceToWasm = async (source: string, stem: string) => {
  const ast = parseProgram(source);
  const result = generateWATFromAst(ast, { exportMain: true });
  const hard = result.diagnostics.filter((diag) => diag.severity === 'error');
  if (hard.length > 0) {
    throw new Error(`WASM codegen failed for ${stem}: ${hard[0].code ?? 'NO_CODE'} ${hard[0].message}`);
  }
  ensureTmp();
  const watPath = path.join(tmpDir, `${stem}.wat`);
  const wasmPath = path.join(tmpDir, `${stem}.wasm`);
  fs.writeFileSync(watPath, result.wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return { watPath, wasmPath, size: fs.statSync(wasmPath).size };
};

const compileWatAndLoad = async (wat: string, stem: string) => {
  ensureTmp();
  const watPath = path.join(tmpDir, `${stem}.wat`);
  const wasmPath = path.join(tmpDir, `${stem}.wasm`);
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

const collectHeap = async (run: () => Promise<void>, repeats: number): Promise<{ start: number; peak: number; end: number }> => {
  if (typeof global.gc === 'function') global.gc();
  const start = process.memoryUsage().heapUsed;
  let peak = start;
  for (let i = 0; i < repeats; i += 1) {
    await run();
    if (typeof global.gc === 'function') global.gc();
    const current = process.memoryUsage().heapUsed;
    if (current > peak) peak = current;
  }
  if (typeof global.gc === 'function') global.gc();
  const end = process.memoryUsage().heapUsed;
  return { start, peak, end };
};

const fibWorkload = `
  fn fib(n: i32) -> i32 {
    if (n <= 1) { return n; }
    return fib(n - 1) + fib(n - 2);
  }
  fn main() -> i32 {
    return fib(30);
  }
`;

const vecWorkload = `
  import { vec } from "@std";

  fn main() -> i32 {
    let v = vec.new();
    let mut i = 0;
    while (i < 120000) {
      vec.push(v, i);
      i = i + 1;
    }
    let n = vec.len(v);
    vec.clear(v);
    return n;
  }
`;

const stringWorkload = `
  import { str } from "@std";

  fn main() -> i32 {
    let mut i = 0;
    let mut acc = 0;
    while (i < 20000) {
      let s = str.concat("key", "value");
      acc = acc + str.len(s);
      i = i + 1;
    }
    return acc;
  }
`;

const managedStringWat = `
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
  (func $alloc_and_release_many (param $count i32) (result i32)
    (local $i i32)
    (local $s i32)
    i32.const 0
    local.set $i
    (block $done
      (loop $loop
        local.get $i
        local.get $count
        i32.ge_u
        br_if $done
        i32.const 0
        i32.const 1
        call $str_new
        local.tee $s
        call $mem_retain
        local.get $s
        call $mem_release
        local.get $s
        call $mem_release
        local.get $i
        i32.const 1
        i32.add
        local.set $i
        br $loop
      )
    )
    call $mem_stats_live
  )
  (export "alloc_and_release_many" (func $alloc_and_release_many))
)
`.trim();

describe('WASM memory/perf validation', () => {
  const perfIt = wabtAvailable ? it : it.skip;

  it('detects wat2wasm availability for perf harness', () => {
    if (!wabtAvailable) {
      console.warn('Skipping wasm perf validation: wat2wasm not available in PATH');
    }
    expect(typeof wabtAvailable).toBe('boolean');
  });

  perfIt('tracks peak memory for benchmark workloads', async () => {
    const fib = await compileSourceToWasm(fibWorkload, 'perf-fib');
    const vec = await compileSourceToWasm(vecWorkload, 'perf-vec');
    const str = await compileSourceToWasm(stringWorkload, 'perf-str');
    const fibRuntime = await loadWASM(fib.wasmPath);
    const vecRuntime = await loadWASM(vec.wasmPath);
    const strRuntime = await loadWASM(str.wasmPath);

    const fibMem = await collectHeap(async () => {
      const out = Number(callWASMFunction(fibRuntime, 'main'));
      expect(out).toBe(832040);
    }, 2);
    const vecMem = await collectHeap(async () => {
      const out = Number(callWASMFunction(vecRuntime, 'main'));
      expect(out).toBe(120000);
    }, 2);
    const strMem = await collectHeap(async () => {
      const out = Number(callWASMFunction(strRuntime, 'main'));
      expect(out).toBeGreaterThan(0);
    }, 2);

    expect(fibMem.peak - fibMem.start).toBeLessThan(24 * 1024 * 1024);
    expect(vecMem.peak - vecMem.start).toBeLessThan(48 * 1024 * 1024);
    expect(strMem.peak - strMem.start).toBeLessThan(80 * 1024 * 1024);
  }, 30000);

  perfIt('keeps memory usage bounded under large collection load', async () => {
    const compiled = await compileSourceToWasm(vecWorkload, 'perf-vec-load');
    const runtime = await loadWASM(compiled.wasmPath);
    if (typeof global.gc === 'function') global.gc();
    const before = process.memoryUsage().heapUsed;
    let maxObserved = before;
    for (let i = 0; i < 3; i += 1) {
      const out = Number(callWASMFunction(runtime, 'main'));
      expect(out).toBe(120000);
      if (typeof global.gc === 'function') global.gc();
      const current = process.memoryUsage().heapUsed;
      maxObserved = Math.max(maxObserved, current);
    }
    if (typeof global.gc === 'function') global.gc();
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(16 * 1024 * 1024);
    expect(maxObserved - before).toBeLessThan(28 * 1024 * 1024);
  });

  perfIt('stays bounded over long retain/release runs (fragmentation guard)', async () => {
    const runtime = await compileWatAndLoad(managedStringWat, 'perf-managed-strings');
    if (typeof global.gc === 'function') global.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 50; i += 1) {
      const live = Number(callWASMFunction(runtime, 'alloc_and_release_many', 2000));
      expect(live).toBe(0);
    }
    if (typeof global.gc === 'function') global.gc();
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(96 * 1024 * 1024);
  });

  perfIt('tracks wasm binary size regressions for reference workload', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../examples/wasm-hello/math.lm'), 'utf-8');
    const compiled = await compileSourceToWasm(source, 'perf-reference');
    const current = compiled.size;
    const shouldUpdate = process.env.UPDATE_BASELINE === '1';
    if (!fs.existsSync(baselinePath) || shouldUpdate) {
      if (!shouldUpdate && !fs.existsSync(baselinePath)) {
        console.warn('No wasm perf baseline found. Creating a new baseline now.');
      }
      if (shouldUpdate) {
        console.warn('UPDATE_BASELINE=1 set. Writing updated wasm perf baseline.');
      }
      const next: Baseline = { reference_wasm_bytes: current };
      fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
      expect(current).toBeGreaterThan(0);
      return;
    }

    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as Baseline;
    expect(baseline.reference_wasm_bytes).toBeGreaterThan(0);
    const ratio = Math.abs(current - baseline.reference_wasm_bytes) / baseline.reference_wasm_bytes;
    expect(ratio).toBeLessThanOrEqual(0.05);
  });
});
