import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadWASM, callWASMFunction } from '../src/wasm-runtime.js';

const tempDir = path.join(__dirname, '../.tmp-wasm');

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const compileWatAndLoad = async (wat: string, basename: string) => {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, `${basename}.wat`);
  const wasmPath = path.join(tempDir, `${basename}.wasm`);
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

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
  (func $alloc_and_release (result i32)
    (local $s i32)
    i32.const 0
    i32.const 1
    call $str_new
    local.tee $s
    call $mem_retain
    local.get $s
    call $mem_release
    local.get $s
    call $mem_release
    call $mem_stats_live
  )
  (func $alloc_without_release (result i32)
    (local $s i32)
    i32.const 0
    i32.const 1
    call $str_new
    local.tee $s
    call $mem_retain
    call $mem_stats_live
  )
  (export "alloc_and_release" (func $alloc_and_release))
  (export "alloc_without_release" (func $alloc_without_release))
)
`.trim();

describe('WASM memory usage validation', () => {
  it('returns zero live allocations for balanced retain/release', async () => {
    if (!hasWabt()) return;
    const runtime = await compileWatAndLoad(managedStringWat, 'memory-balanced');
    const live = Number(callWASMFunction(runtime, 'alloc_and_release'));
    expect(live).toBe(0);
  });

  it('reports live allocations when release is missing', async () => {
    if (!hasWabt()) return;
    const runtime = await compileWatAndLoad(managedStringWat, 'memory-unbalanced');
    const live = Number(callWASMFunction(runtime, 'alloc_without_release'));
    expect(live).toBeGreaterThan(0);
  });

  it('stays bounded over repeated alloc/release cycles', async () => {
    if (!hasWabt()) return;
    const runtime = await compileWatAndLoad(managedStringWat, 'memory-cycles');

    if (typeof global.gc === 'function') {
      global.gc();
    }
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 3000; i++) {
      const live = Number(callWASMFunction(runtime, 'alloc_and_release'));
      expect(live).toBe(0);
    }

    if (typeof global.gc === 'function') {
      global.gc();
    }
    const after = process.memoryUsage().heapUsed;
    const delta = after - before;
    // Without --expose-gc, heap usage fluctuates more under the full suite.
    const limit = typeof global.gc === 'function' ? 30 * 1024 * 1024 : 45 * 1024 * 1024;
    expect(delta).toBeLessThan(limit);
  });
});
