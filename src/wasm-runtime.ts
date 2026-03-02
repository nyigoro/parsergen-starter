/* eslint-disable no-console */
import fs from 'node:fs';

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
  mem_retain: (ptr: number) => void;
  mem_release: (ptr: number) => void;
  mem_stats_live: () => number;
  vec_new: () => number;
  vec_len: (id: number) => number;
  vec_push: (id: number, value: number) => number;
  vec_get_has: (id: number, index: number) => number;
  vec_get: (id: number, index: number) => number;
  vec_pop_has: (id: number) => number;
  vec_pop: (id: number) => number;
  vec_clear: (id: number) => void;
  vec_take: (id: number, count: number) => number;
  vec_skip: (id: number, count: number) => number;
  vec_any_closure: (id: number, closure: number) => number;
  vec_all_closure: (id: number, closure: number) => number;
  vec_map_closure: (id: number, closure: number) => number;
  vec_filter_closure: (id: number, closure: number) => number;
  vec_fold_closure: (id: number, initial: number, closure: number) => number;
  vec_find_has: (id: number, closure: number) => number;
  vec_find: (id: number, closure: number) => number;
  vec_position: (id: number, closure: number) => number;
  hashmap_new: () => number;
  hashmap_len: (id: number) => number;
  hashmap_insert_has: (id: number, key: number, value: number) => number;
  hashmap_insert_prev: (id: number, key: number, value: number) => number;
  hashmap_get_has: (id: number, key: number) => number;
  hashmap_get: (id: number, key: number) => number;
  hashmap_remove_has: (id: number, key: number) => number;
  hashmap_remove: (id: number, key: number) => number;
  hashmap_contains_key: (id: number, key: number) => number;
  hashmap_clear: (id: number) => void;
  hashset_new: () => number;
  hashset_len: (id: number) => number;
  hashset_insert: (id: number, value: number) => number;
  hashset_contains: (id: number, value: number) => number;
  hashset_remove: (id: number, value: number) => number;
  hashset_clear: (id: number) => void;
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
  queue: number[];
  capacity: number;
  senderClosed: boolean;
  receiverClosed: boolean;
};

const wasmChannels = new Map<number, WasmChannelEntry>();
let nextWasmChannelId = 1;

const wasmStringFallbackPool = new Map<number, string>();
let nextWasmStringFallbackHandle = 1;
const wasmHeapRefCounts = new Map<number, number>();
let activeWasmMemory: WebAssembly.Memory | undefined;
let activeWasmInstance: WebAssembly.Instance | undefined;
const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();

const wasmVecPool = new Map<number, number[]>();
let nextWasmVecId = 1;
const wasmHashMapPool = new Map<number, Map<number, number>>();
let nextWasmHashMapId = 1;
const wasmHashSetPool = new Map<number, Set<number>>();
let nextWasmHashSetId = 1;

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

const readMemoryBytes = (ptr: number, len: number): Uint8Array | null => {
  const memory = activeWasmMemory;
  if (!memory) return null;
  if (!Number.isFinite(ptr) || !Number.isFinite(len)) return null;
  const start = Math.max(0, Math.trunc(ptr));
  const size = Math.max(0, Math.trunc(len));
  const view = new Uint8Array(memory.buffer);
  if (start < 0 || size < 0 || start + size > view.length) return null;
  return view.slice(start, start + size);
};

const writeMemoryBytes = (ptr: number, bytes: Uint8Array): boolean => {
  const memory = activeWasmMemory;
  if (!memory) return false;
  if (!Number.isFinite(ptr)) return false;
  const start = Math.max(0, Math.trunc(ptr));
  const view = new Uint8Array(memory.buffer);
  if (start < 0 || start + bytes.length > view.length) return false;
  view.set(bytes, start);
  return true;
};

const fallbackAllocString = (value: string): number => {
  const handle = nextWasmStringFallbackHandle++;
  wasmStringFallbackPool.set(handle, value);
  return handle;
};

const allocWithWasmAllocator = (payloadSize: number): number | null => {
  const instance = activeWasmInstance;
  if (!instance) return null;
  const alloc = instance.exports.__alloc as ((size: number) => number) | undefined;
  if (typeof alloc !== 'function') return null;
  try {
    const ptr = normalizeI32(alloc(Math.max(1, Math.trunc(payloadSize))));
    return ptr > 0 ? ptr : null;
  } catch {
    return null;
  }
};

const freeWithWasmAllocator = (ptr: number): void => {
  const instance = activeWasmInstance;
  if (!instance) return;
  const free = instance.exports.__free as ((value: number) => void) | undefined;
  if (typeof free !== 'function') return;
  try {
    free(Math.trunc(ptr));
  } catch {
    // ignore free errors in host shim
  }
};

const allocateManagedString = (value: string): number => {
  const bytes = utf8Encoder.encode(value);
  const ptr = allocWithWasmAllocator(4 + bytes.length + 1);
  if (ptr == null) return fallbackAllocString(value);
  const memory = activeWasmMemory;
  if (!memory) return fallbackAllocString(value);
  const view = new DataView(memory.buffer);
  if (ptr + 4 + bytes.length + 1 > view.byteLength) return fallbackAllocString(value);
  view.setInt32(ptr, bytes.length, true);
  const ok = writeMemoryBytes(ptr + 4, bytes);
  if (!ok) return fallbackAllocString(value);
  view.setUint8(ptr + 4 + bytes.length, 0);
  wasmHeapRefCounts.set(ptr, 1);
  return ptr;
};

const getWasmString = (handle: number): string => {
  if (!Number.isFinite(handle)) return '';
  const ptr = Math.trunc(handle);
  const memory = activeWasmMemory;
  if (memory && ptr > 0 && ptr + 4 <= memory.buffer.byteLength) {
    const view = new DataView(memory.buffer);
    const len = view.getInt32(ptr, true);
    if (len >= 0 && ptr + 4 + len <= view.byteLength) {
      const bytes = new Uint8Array(memory.buffer, ptr + 4, len);
      return utf8Decoder.decode(bytes);
    }
  }
  return wasmStringFallbackPool.get(ptr) ?? '';
};

const retainManagedPtr = (ptr: number): void => {
  const key = Math.trunc(ptr);
  if (key <= 0) return;
  const current = wasmHeapRefCounts.get(key);
  if (typeof current === 'number') {
    wasmHeapRefCounts.set(key, current + 1);
  }
};

const releaseManagedPtr = (ptr: number): void => {
  const key = Math.trunc(ptr);
  if (key <= 0) return;
  const current = wasmHeapRefCounts.get(key);
  if (typeof current === 'number') {
    if (current <= 1) {
      wasmHeapRefCounts.delete(key);
      freeWithWasmAllocator(key);
      return;
    }
    wasmHeapRefCounts.set(key, current - 1);
    return;
  }
  if (wasmStringFallbackPool.has(key)) {
    wasmStringFallbackPool.delete(key);
  }
};

const getVec = (id: number): number[] | null => {
  if (!Number.isFinite(id)) return null;
  return wasmVecPool.get(Math.trunc(id)) ?? null;
};

const getHashMap = (id: number): Map<number, number> | null => {
  if (!Number.isFinite(id)) return null;
  return wasmHashMapPool.get(Math.trunc(id)) ?? null;
};

const getHashSet = (id: number): Set<number> | null => {
  if (!Number.isFinite(id)) return null;
  return wasmHashSetPool.get(Math.trunc(id)) ?? null;
};

const readI32FromMemory = (ptr: number): number => {
  const memory = activeWasmMemory;
  if (!memory) return 0;
  if (!Number.isFinite(ptr)) return 0;
  const start = Math.max(0, Math.trunc(ptr));
  const view = new DataView(memory.buffer);
  if (start + 4 > view.byteLength) return 0;
  return view.getInt32(start, true);
};

const invokeClosure1 = (closureHandle: number, arg: number): number => {
  const instance = activeWasmInstance;
  if (!instance) return 0;
  const handle = Math.trunc(closureHandle);
  const lambdaId = readI32FromMemory(handle);
  if (lambdaId <= 0) return 0;
  const captureCount = Math.max(0, readI32FromMemory(handle + 4));
  const fn = (instance.exports[`__lambda_${lambdaId}`] as ((...params: number[]) => number) | undefined);
  if (!fn) return 0;
  const captureArgs: number[] = [];
  for (let i = 0; i < captureCount; i += 1) {
    captureArgs.push(readI32FromMemory(handle + 8 + i * 8));
  }
  return normalizeI32(fn(...captureArgs, normalizeI32(arg)));
};

const invokeClosure2 = (closureHandle: number, argA: number, argB: number): number => {
  const instance = activeWasmInstance;
  if (!instance) return 0;
  const handle = Math.trunc(closureHandle);
  const lambdaId = readI32FromMemory(handle);
  if (lambdaId <= 0) return 0;
  const captureCount = Math.max(0, readI32FromMemory(handle + 4));
  const fn = (instance.exports[`__lambda_${lambdaId}`] as ((...params: number[]) => number) | undefined);
  if (!fn) return 0;
  const captureArgs: number[] = [];
  for (let i = 0; i < captureCount; i += 1) {
    captureArgs.push(readI32FromMemory(handle + 8 + i * 8));
  }
  return normalizeI32(fn(...captureArgs, normalizeI32(argA), normalizeI32(argB)));
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
  str_new: (ptr: number, len: number) => {
    const bytes = readMemoryBytes(ptr, len);
    if (!bytes) return fallbackAllocString(readUtf8FromMemory(ptr, len));
    return allocateManagedString(utf8Decoder.decode(bytes));
  },
  str_concat: (left: number, right: number) => allocateManagedString(`${getWasmString(left)}${getWasmString(right)}`),
  str_len: (value: number) => getWasmString(value).length | 0,
  str_slice: (value: number, start: number, end: number, inclusive: number) => {
    const input = getWasmString(value);
    const normalizedStart = Math.max(0, Math.trunc(start));
    const normalizedEnd = end < 0 ? input.length : Math.max(0, Math.trunc(end));
    const finalEnd = inclusive ? normalizedEnd + 1 : normalizedEnd;
    return allocateManagedString(input.slice(normalizedStart, Math.min(input.length, finalEnd)));
  },
  str_eq: (left: number, right: number) => (getWasmString(left) === getWasmString(right) ? 1 : 0),
  str_from_int: (value: number) => allocateManagedString(String(value | 0)),
  str_from_float: (value: number) => allocateManagedString(String(value)),
  str_from_bool: (value: number) => allocateManagedString(value ? 'true' : 'false'),
  str_from_handle: (value: number) => {
    const key = Math.trunc(value);
    const asString = getWasmString(key);
    if (asString.length > 0 || wasmStringFallbackPool.has(key)) return key | 0;
    return allocateManagedString(String(value | 0));
  },
  mem_retain: (ptr: number) => {
    retainManagedPtr(ptr);
  },
  mem_release: (ptr: number) => {
    releaseManagedPtr(ptr);
  },
  mem_stats_live: () => wasmHeapRefCounts.size | 0,
  vec_new: () => {
    const id = nextWasmVecId++;
    wasmVecPool.set(id, []);
    return id;
  },
  vec_len: (id: number) => (getVec(id)?.length ?? 0) | 0,
  vec_push: (id: number, value: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    vec.push(normalizeI32(value));
    return vec.length | 0;
  },
  vec_get_has: (id: number, index: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < vec.length ? 1 : 0;
  },
  vec_get: (id: number, index: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    const idx = Math.trunc(index);
    if (idx < 0 || idx >= vec.length) return 0;
    return normalizeI32(vec[idx]);
  },
  vec_pop_has: (id: number) => {
    const vec = getVec(id);
    return vec && vec.length > 0 ? 1 : 0;
  },
  vec_pop: (id: number) => {
    const vec = getVec(id);
    if (!vec || vec.length === 0) return 0;
    const value = vec.pop();
    return normalizeI32(value);
  },
  vec_clear: (id: number) => {
    const vec = getVec(id);
    if (vec) vec.length = 0;
  },
  vec_take: (id: number, count: number) => {
    const vec = getVec(id);
    const nextId = nextWasmVecId++;
    const takeCount = Math.max(0, Math.trunc(count));
    wasmVecPool.set(nextId, vec ? vec.slice(0, takeCount).map(normalizeI32) : []);
    return nextId;
  },
  vec_skip: (id: number, count: number) => {
    const vec = getVec(id);
    const nextId = nextWasmVecId++;
    const skipCount = Math.max(0, Math.trunc(count));
    wasmVecPool.set(nextId, vec ? vec.slice(skipCount).map(normalizeI32) : []);
    return nextId;
  },
  vec_any_closure: (id: number, closure: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    for (const item of vec) {
      if (invokeClosure1(closure, item)) return 1;
    }
    return 0;
  },
  vec_all_closure: (id: number, closure: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    for (const item of vec) {
      if (!invokeClosure1(closure, item)) return 0;
    }
    return 1;
  },
  vec_map_closure: (id: number, closure: number) => {
    const vec = getVec(id);
    const nextId = nextWasmVecId++;
    if (!vec) {
      wasmVecPool.set(nextId, []);
      return nextId;
    }
    wasmVecPool.set(nextId, vec.map((item) => invokeClosure1(closure, item)));
    return nextId;
  },
  vec_filter_closure: (id: number, closure: number) => {
    const vec = getVec(id);
    const nextId = nextWasmVecId++;
    if (!vec) {
      wasmVecPool.set(nextId, []);
      return nextId;
    }
    wasmVecPool.set(nextId, vec.filter((item) => invokeClosure1(closure, item)).map(normalizeI32));
    return nextId;
  },
  vec_fold_closure: (id: number, initial: number, closure: number) => {
    const vec = getVec(id);
    let acc = normalizeI32(initial);
    if (!vec) return acc;
    for (const item of vec) {
      acc = invokeClosure2(closure, acc, item);
    }
    return normalizeI32(acc);
  },
  vec_find_has: (id: number, closure: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    for (const item of vec) {
      if (invokeClosure1(closure, item)) return 1;
    }
    return 0;
  },
  vec_find: (id: number, closure: number) => {
    const vec = getVec(id);
    if (!vec) return 0;
    for (const item of vec) {
      if (invokeClosure1(closure, item)) return normalizeI32(item);
    }
    return 0;
  },
  vec_position: (id: number, closure: number) => {
    const vec = getVec(id);
    if (!vec) return -1;
    for (let i = 0; i < vec.length; i += 1) {
      if (invokeClosure1(closure, vec[i])) return i | 0;
    }
    return -1;
  },
  hashmap_new: () => {
    const id = nextWasmHashMapId++;
    wasmHashMapPool.set(id, new Map());
    return id;
  },
  hashmap_len: (id: number) => (getHashMap(id)?.size ?? 0) | 0,
  hashmap_insert_has: (id: number, key: number, _value: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    return map.has(normalizeI32(key)) ? 1 : 0;
  },
  hashmap_insert_prev: (id: number, key: number, value: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    const k = normalizeI32(key);
    const prev = map.get(k);
    map.set(k, normalizeI32(value));
    return prev === undefined ? 0 : normalizeI32(prev);
  },
  hashmap_get_has: (id: number, key: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    return map.has(normalizeI32(key)) ? 1 : 0;
  },
  hashmap_get: (id: number, key: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    const value = map.get(normalizeI32(key));
    return value === undefined ? 0 : normalizeI32(value);
  },
  hashmap_remove_has: (id: number, key: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    return map.has(normalizeI32(key)) ? 1 : 0;
  },
  hashmap_remove: (id: number, key: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    const k = normalizeI32(key);
    const prev = map.get(k);
    map.delete(k);
    return prev === undefined ? 0 : normalizeI32(prev);
  },
  hashmap_contains_key: (id: number, key: number) => {
    const map = getHashMap(id);
    if (!map) return 0;
    return map.has(normalizeI32(key)) ? 1 : 0;
  },
  hashmap_clear: (id: number) => {
    const map = getHashMap(id);
    if (map) map.clear();
  },
  hashset_new: () => {
    const id = nextWasmHashSetId++;
    wasmHashSetPool.set(id, new Set());
    return id;
  },
  hashset_len: (id: number) => (getHashSet(id)?.size ?? 0) | 0,
  hashset_insert: (id: number, value: number) => {
    const set = getHashSet(id);
    if (!set) return 0;
    const v = normalizeI32(value);
    const had = set.has(v);
    set.add(v);
    return had ? 0 : 1;
  },
  hashset_contains: (id: number, value: number) => {
    const set = getHashSet(id);
    if (!set) return 0;
    return set.has(normalizeI32(value)) ? 1 : 0;
  },
  hashset_remove: (id: number, value: number) => {
    const set = getHashSet(id);
    if (!set) return 0;
    return set.delete(normalizeI32(value)) ? 1 : 0;
  },
  hashset_clear: (id: number) => {
    const set = getHashSet(id);
    if (set) set.clear();
  },
  channel_is_available: () => 1,
  channel_new: (capacity: number) => {
    const id = nextWasmChannelId++;
    const cap = Math.max(1, Math.trunc(capacity));
    wasmChannels.set(id, {
      queue: [],
      capacity: cap,
      senderClosed: false,
      receiverClosed: false,
    });
    return id;
  },
  channel_send: (id: number, value: number) => {
    const entry = getChannel(id);
    if (!entry || entry.senderClosed) return 0;
    if (entry.queue.length >= entry.capacity) return 0;
    entry.queue.push(normalizeI32(value));
    return 1;
  },
  channel_try_recv_or: (id: number, fallback: number) => {
    const entry = getChannel(id);
    if (!entry || entry.receiverClosed) return normalizeI32(fallback);
    if (entry.queue.length === 0) return normalizeI32(fallback);
    const value = entry.queue.shift();
    return normalizeI32(value);
  },
  channel_close_sender: (id: number) => {
    const entry = getChannel(id);
    if (!entry || entry.senderClosed) return;
    entry.senderClosed = true;
    closeAndDeleteIfComplete(Math.trunc(id));
  },
  channel_close_receiver: (id: number) => {
    const entry = getChannel(id);
    if (!entry || entry.receiverClosed) return;
    entry.receiverClosed = true;
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
  wasmHeapRefCounts.clear();
  wasmStringFallbackPool.clear();
  nextWasmStringFallbackHandle = 1;
  wasmChannels.clear();
  nextWasmChannelId = 1;
  activeWasmInstance = instance;
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
