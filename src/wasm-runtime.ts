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
  abs_int: (n: number) => number;
  abs_float: (n: number) => number;
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
  abs_int: (n: number) => Math.abs(n | 0),
  abs_float: (n: number) => Math.abs(n),
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
