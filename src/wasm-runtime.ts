/* eslint-disable no-console */
import fs from 'node:fs';
import { channel } from './lumina-runtime.js';

export interface WASMRuntime {
  instance: WebAssembly.Instance;
  memory?: WebAssembly.Memory;
}

type WasmEnvFns = {
  print_int: (n: number) => void;
  print_float: (n: number) => void;
  print_bool: (b: number) => void;
  print_string: (handle: number) => void;
  abs_int: (n: number) => number;
  abs_float: (n: number) => number;
  str_new: (ptr: number, len: number) => number;
  str_concat: (left: number, right: number) => number;
  str_len: (value: number) => number;
  str_slice: (value: number, start: number, end: number, inclusive: number) => number;
  str_eq: (left: number, right: number) => number;
  str_from_int: (value: number) => number;
  str_from_float: (value: number) => number;
  str_from_bool: (value: number) => number;
  str_from_handle: (value: number) => number;
  channel_is_available: () => number;
  channel_new: (capacity: number) => number;
  channel_send: (id: number, value: number) => number;
  channel_try_recv_or: (id: number, fallback: number) => number;
  channel_close_sender: (id: number) => void;
  channel_close_receiver: (id: number) => void;
};

export type EnvImports = {
  env: Partial<WasmEnvFns>;
};

type WasmChannelEntry = {
  sender: unknown;
  receiver: unknown;
  senderClosed: boolean;
  receiverClosed: boolean;
};

const wasmChannels = new Map<number, WasmChannelEntry>();
let nextWasmChannelId = 1;

const wasmStringPool = new Map<number, string>();
let nextWasmStringHandle = 1;
let activeWasmMemory: WebAssembly.Memory | undefined;
const utf8Decoder = new TextDecoder();

const readUtf8FromMemory = (ptr: number, len: number): string => {
  const memory = activeWasmMemory;
  if (!memory) return '';
  if (!Number.isFinite(ptr) || !Number.isFinite(len)) return '';
  const start = Math.max(0, Math.trunc(ptr));
  const size = Math.max(0, Math.trunc(len));
  const view = new Uint8Array(memory.buffer);
  if (start >= view.length || size === 0) return '';
  const end = Math.min(view.length, start + size);
  return utf8Decoder.decode(view.subarray(start, end));
};

const allocWasmString = (value: string): number => {
  const handle = nextWasmStringHandle++;
  wasmStringPool.set(handle, value);
  return handle;
};

const getWasmString = (handle: number): string => {
  if (!Number.isFinite(handle)) return '';
  return wasmStringPool.get(Math.trunc(handle)) ?? '';
};

const normalizeI32 = (value: unknown): number => {
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'bigint') return Number(value) | 0;
  return Number(value) | 0;
};

const closeAndDeleteIfComplete = (id: number): void => {
  const entry = wasmChannels.get(id);
  if (!entry) return;
  if (!entry.senderClosed || !entry.receiverClosed) return;
  wasmChannels.delete(id);
};

const getChannel = (id: number): WasmChannelEntry | null => {
  if (!Number.isFinite(id)) return null;
  const key = Math.trunc(id);
  if (key <= 0) return null;
  return wasmChannels.get(key) ?? null;
};

const defaultEnv: WasmEnvFns = {
  print_int: (n: number) => console.log(n),
  print_float: (n: number) => console.log(n),
  print_bool: (b: number) => console.log(b === 1 ? 'true' : 'false'),
  print_string: (handle: number) => console.log(getWasmString(handle)),
  abs_int: (n: number) => Math.abs(n | 0),
  abs_float: (n: number) => Math.abs(n),
  str_new: (ptr: number, len: number) => allocWasmString(readUtf8FromMemory(ptr, len)),
  str_concat: (left: number, right: number) => allocWasmString(`${getWasmString(left)}${getWasmString(right)}`),
  str_len: (value: number) => getWasmString(value).length | 0,
  str_slice: (value: number, start: number, end: number, inclusive: number) => {
    const input = getWasmString(value);
    const normalizedStart = Math.max(0, Math.trunc(start));
    const normalizedEnd = end < 0 ? input.length : Math.max(0, Math.trunc(end));
    const finalEnd = inclusive ? normalizedEnd + 1 : normalizedEnd;
    return allocWasmString(input.slice(normalizedStart, Math.min(input.length, finalEnd)));
  },
  str_eq: (left: number, right: number) => (getWasmString(left) === getWasmString(right) ? 1 : 0),
  str_from_int: (value: number) => allocWasmString(String(value | 0)),
  str_from_float: (value: number) => allocWasmString(String(value)),
  str_from_bool: (value: number) => allocWasmString(value ? 'true' : 'false'),
  str_from_handle: (value: number) => {
    if (wasmStringPool.has(Math.trunc(value))) return value | 0;
    return allocWasmString(String(value | 0));
  },
  channel_is_available: () => (channel.is_available() ? 1 : 0),
  channel_new: (capacity: number) => {
    if (!channel.is_available()) return 0;
    const id = nextWasmChannelId++;
    const chan = channel.bounded<number>(Math.trunc(capacity));
    wasmChannels.set(id, {
      sender: chan.sender,
      receiver: chan.receiver,
      senderClosed: false,
      receiverClosed: false,
    });
    return id;
  },
  channel_send: (id: number, value: number) => {
    const entry = getChannel(id);
    if (!entry || entry.senderClosed) return 0;
    const ok = channel.send(entry.sender as never, normalizeI32(value));
    return ok ? 1 : 0;
  },
  channel_try_recv_or: (id: number, fallback: number) => {
    const entry = getChannel(id);
    if (!entry || entry.receiverClosed) return normalizeI32(fallback);
    const polled = channel.try_recv(entry.receiver as never) as { $tag?: string; $payload?: unknown };
    if (!polled || polled.$tag !== 'Some') return normalizeI32(fallback);
    return normalizeI32(polled.$payload);
  },
  channel_close_sender: (id: number) => {
    const entry = getChannel(id);
    if (!entry || entry.senderClosed) return;
    entry.senderClosed = true;
    channel.close_sender(entry.sender as never);
    closeAndDeleteIfComplete(Math.trunc(id));
  },
  channel_close_receiver: (id: number) => {
    const entry = getChannel(id);
    if (!entry || entry.receiverClosed) return;
    entry.receiverClosed = true;
    channel.close_receiver(entry.receiver as never);
    closeAndDeleteIfComplete(Math.trunc(id));
  },
};

const defaultImports: EnvImports = {
  env: {
    ...defaultEnv,
  },
};

export async function loadWASM(
  wasmPath: string,
  imports: EnvImports = defaultImports
): Promise<WASMRuntime> {
  const buffer = fs.readFileSync(wasmPath);
  const mergedImports: EnvImports = {
    env: {
      ...defaultImports.env,
      ...(imports.env ?? {}),
    },
  };
  const { instance } = await WebAssembly.instantiate(buffer, mergedImports as WebAssembly.Imports);
  const memory = instance.exports.memory as WebAssembly.Memory | undefined;
  activeWasmMemory = memory;
  return { instance, memory };
}

export function callWASMFunction(
  runtime: WASMRuntime,
  funcName: string,
  ...args: number[]
): number {
  const fn = runtime.instance.exports[funcName] as (...params: number[]) => number;
  if (!fn) {
    throw new Error(`Function ${funcName} not found in WASM exports`);
  }
  return fn(...args);
}
