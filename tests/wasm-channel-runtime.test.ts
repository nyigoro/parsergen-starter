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

const compileWatAndLoad = async (wat: string) => {
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'channel-test.wat');
  const wasmPath = path.join(tempDir, 'channel-test.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

describe('WASM channel host bindings', () => {
  it('roundtrips a value through a bounded channel', async () => {
    if (!hasWabt()) return;
    const wat = `
(module
  (import "env" "channel_new" (func $channel_new (param i32) (result i32)))
  (import "env" "channel_send" (func $channel_send (param i32 i32) (result i32)))
  (import "env" "channel_try_recv_or" (func $channel_try_recv_or (param i32 i32) (result i32)))
  (import "env" "channel_close_sender" (func $channel_close_sender (param i32)))
  (import "env" "channel_close_receiver" (func $channel_close_receiver (param i32)))
  (func $roundtrip (result i32)
    (local $id i32)
    (local $value i32)
    (local.set $id (call $channel_new (i32.const 1)))
    (drop (call $channel_send (local.get $id) (i32.const 42)))
    (local.set $value (call $channel_try_recv_or (local.get $id) (i32.const -1)))
    (call $channel_close_sender (local.get $id))
    (call $channel_close_receiver (local.get $id))
    (local.get $value)
  )
  (export "roundtrip" (func $roundtrip))
)
`.trim();
    const runtime = await compileWatAndLoad(wat);
    expect(callWASMFunction(runtime, 'roundtrip')).toBe(42);
  });

  it('enforces bounded backpressure at capacity 1', async () => {
    if (!hasWabt()) return;
    const wat = `
(module
  (import "env" "channel_new" (func $channel_new (param i32) (result i32)))
  (import "env" "channel_send" (func $channel_send (param i32 i32) (result i32)))
  (import "env" "channel_close_sender" (func $channel_close_sender (param i32)))
  (import "env" "channel_close_receiver" (func $channel_close_receiver (param i32)))
  (func $capacity_check (result i32)
    (local $id i32)
    (local $first i32)
    (local $second i32)
    (local.set $id (call $channel_new (i32.const 1)))
    (local.set $first (call $channel_send (local.get $id) (i32.const 1)))
    (local.set $second (call $channel_send (local.get $id) (i32.const 2)))
    (call $channel_close_sender (local.get $id))
    (call $channel_close_receiver (local.get $id))
    (i32.add (i32.mul (local.get $first) (i32.const 10)) (local.get $second))
  )
  (export "capacity_check" (func $capacity_check))
)
`.trim();
    const runtime = await compileWatAndLoad(wat);
    expect(callWASMFunction(runtime, 'capacity_check')).toBe(10);
  });
});
