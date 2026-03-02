import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadWASM, callWASMFunction } from '../../src/wasm-runtime.js';

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

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
  (export "alloc_and_release" (func $alloc_and_release))
)
`.trim();

async function compileRuntime() {
  const tmpDir = path.resolve('.tmp-wasm-bench');
  fs.mkdirSync(tmpDir, { recursive: true });
  const watPath = path.join(tmpDir, 'wasm-memory.wat');
  const wasmPath = path.join(tmpDir, 'wasm-memory.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
}

async function main() {
  if (!hasWabt()) {
    process.stdout.write(
      `${JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          skipped: true,
          reason: 'wat2wasm not found',
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const runtime = await compileRuntime();
  const iterations = 30000;

  if (typeof global.gc === 'function') {
    global.gc();
  }
  const before = process.memoryUsage();

  let maxLive = 0;
  for (let i = 0; i < iterations; i++) {
    const live = Number(callWASMFunction(runtime, 'alloc_and_release'));
    if (live > maxLive) maxLive = live;
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }
  const after = process.memoryUsage();

  const heapDeltaBytes = after.heapUsed - before.heapUsed;
  const rssDeltaBytes = after.rss - before.rss;
  const success = maxLive === 0 && heapDeltaBytes < 25 * 1024 * 1024;

  const payload = {
    timestamp: new Date().toISOString(),
    iterations,
    gc_available: typeof global.gc === 'function',
    live: {
      max: maxLive,
      final: Number(callWASMFunction(runtime, 'alloc_and_release')),
    },
    heap: {
      before: before.heapUsed,
      after: after.heapUsed,
      delta: heapDeltaBytes,
    },
    rss: {
      before: before.rss,
      after: after.rss,
      delta: rssDeltaBytes,
    },
    success,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
