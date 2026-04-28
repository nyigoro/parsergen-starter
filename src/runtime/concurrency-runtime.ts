import { getNodeBuiltinModule, getNodePath, isNodeRuntime, resolvePathBasic } from './node-platform.js';
import type { ChannelRuntime, Receiver as ChannelReceiver, Sender as ChannelSender } from './channel-runtime.js';

type LuminaEnumLike = { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] };
type OptionLike = { $tag: string; $payload?: unknown };
type TaggedRuntimeValue = { $tag: string; $payload?: unknown };

type OptionRuntime = {
  Some: <T>(value: T) => OptionLike;
  None: OptionLike;
};

type ResultRuntime = {
  Ok: <T>(value: T) => TaggedRuntimeValue;
  Err: (message: string) => TaggedRuntimeValue;
};

type ConcurrencyRuntimeDeps = {
  getOption: () => OptionRuntime;
  getResult: () => ResultRuntime;
  getChannel: () => ChannelRuntime;
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
  getEnumPayload: (value: LuminaEnumLike) => unknown;
};

declare const WorkerGlobalScope: (new () => unknown) | undefined;

interface NodeWorkerLike {
  postMessage(value: unknown): void;
  terminate(): Promise<number>;
  on(event: 'message', listener: (value: unknown) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

interface WebWorkerLike {
  postMessage(value: unknown): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
}

type ThreadWorker = { kind: 'node'; worker: NodeWorkerLike } | { kind: 'web'; worker: WebWorkerLike };

type WebWorkerRecord = {
  id: number;
  entry: ThreadWorker;
  inlineUrl: string | null;
};

type RuntimeStreamBuffer = {
  kind: 'buffer';
  data: Uint8Array;
  offset: number;
  chunkSize: number;
};

type RuntimeStreamReader = {
  kind: 'reader';
  reader: {
    read: () => Promise<{ done?: boolean; value?: unknown }>;
    cancel?: () => Promise<void> | void;
  };
  done: boolean;
};

type RuntimeStreamPipe = {
  kind: 'pipe';
  sourceHandle: number;
  transform: (chunk: number[]) => unknown;
};

type RuntimeStreamRecord = {
  id: number;
  state: RuntimeStreamBuffer | RuntimeStreamReader | RuntimeStreamPipe;
};

type StreamChunkRead =
  | { ok: true; chunk: number[] | null }
  | { ok: false; error: string };

export type SyncRuntime = {
  mutex_new: () => unknown;
  mutex_acquire: (mutex: unknown) => Promise<boolean>;
  mutex_try_acquire: (mutex: unknown) => boolean;
  mutex_release: (mutex: unknown) => boolean;
  mutex_is_locked: (mutex: unknown) => boolean;
  semaphore_new: (permits: number) => unknown;
  semaphore_acquire: (semaphore: unknown) => Promise<boolean>;
  semaphore_try_acquire: (semaphore: unknown) => boolean;
  semaphore_release: (semaphore: unknown, count?: number) => void;
  semaphore_available: (semaphore: unknown) => number;
  atomic_i32_new: (initial: number) => AtomicI32;
  atomic_i32_is_available: () => boolean;
  atomic_i32_load: (value: AtomicI32) => number;
  atomic_i32_store: (value: AtomicI32, next: number) => number;
  atomic_i32_add: (value: AtomicI32, delta: number) => number;
  atomic_i32_sub: (value: AtomicI32, delta: number) => number;
  atomic_i32_compare_exchange: (value: AtomicI32, expected: number, replacement: number) => number;
};

export type SabChannelRuntime = {
  is_available: () => boolean;
  bounded_i32: (capacity: number) => { sender: unknown; receiver: unknown };
  bounded_u32: (capacity: number) => { sender: unknown; receiver: unknown };
  bounded_f32: (capacity: number) => { sender: unknown; receiver: unknown };
  bounded_f64: (capacity: number) => { sender: unknown; receiver: unknown };
  send_i32: (sender: unknown, value: number) => boolean;
  try_send_i32: (sender: unknown, value: number) => boolean;
  send_async_i32: (sender: unknown, value: number) => Promise<boolean>;
  send_timeout_i32: (sender: unknown, value: number, timeoutMs: number) => Promise<TaggedRuntimeValue>;
  recv_i32: (receiver: unknown) => Promise<OptionLike>;
  try_recv_i32: (receiver: unknown) => OptionLike;
  close_sender_i32: (sender: unknown) => void;
  close_receiver_i32: (receiver: unknown) => void;
  is_sender_closed_i32: (sender: unknown) => boolean;
  is_receiver_closed_i32: (receiver: unknown) => boolean;
  close_i32: (ch: { sender: unknown; receiver: unknown }) => void;
  send_u32: (sender: unknown, value: number) => boolean;
  try_send_u32: (sender: unknown, value: number) => boolean;
  send_async_u32: (sender: unknown, value: number) => Promise<boolean>;
  send_timeout_u32: (sender: unknown, value: number, timeoutMs: number) => Promise<TaggedRuntimeValue>;
  recv_u32: (receiver: unknown) => Promise<OptionLike>;
  try_recv_u32: (receiver: unknown) => OptionLike;
  close_sender_u32: (sender: unknown) => void;
  close_receiver_u32: (receiver: unknown) => void;
  is_sender_closed_u32: (sender: unknown) => boolean;
  is_receiver_closed_u32: (receiver: unknown) => boolean;
  close_u32: (ch: { sender: unknown; receiver: unknown }) => void;
  send_f32: (sender: unknown, value: number) => boolean;
  try_send_f32: (sender: unknown, value: number) => boolean;
  send_async_f32: (sender: unknown, value: number) => Promise<boolean>;
  send_timeout_f32: (sender: unknown, value: number, timeoutMs: number) => Promise<TaggedRuntimeValue>;
  recv_f32: (receiver: unknown) => Promise<OptionLike>;
  try_recv_f32: (receiver: unknown) => OptionLike;
  close_sender_f32: (sender: unknown) => void;
  close_receiver_f32: (receiver: unknown) => void;
  is_sender_closed_f32: (sender: unknown) => boolean;
  is_receiver_closed_f32: (receiver: unknown) => boolean;
  close_f32: (ch: { sender: unknown; receiver: unknown }) => void;
  send_f64: (sender: unknown, value: number) => boolean;
  try_send_f64: (sender: unknown, value: number) => boolean;
  send_async_f64: (sender: unknown, value: number) => Promise<boolean>;
  send_timeout_f64: (sender: unknown, value: number, timeoutMs: number) => Promise<TaggedRuntimeValue>;
  recv_f64: (receiver: unknown) => Promise<OptionLike>;
  try_recv_f64: (receiver: unknown) => OptionLike;
  close_sender_f64: (sender: unknown) => void;
  close_receiver_f64: (receiver: unknown) => void;
  is_sender_closed_f64: (sender: unknown) => boolean;
  is_receiver_closed_f64: (receiver: unknown) => boolean;
  close_f64: (ch: { sender: unknown; receiver: unknown }) => void;
};

export type ThreadRuntime = {
  is_available: () => boolean;
  spawn: (task: unknown) => unknown;
  spawn_worker: (specifier: unknown) => Promise<unknown>;
  post: (handle: Thread, value: unknown) => boolean;
  recv: (handle: Thread) => Promise<unknown>;
  try_recv: (handle: Thread) => unknown;
  terminate: (handle: Thread) => Promise<void>;
  join: (handle: unknown) => unknown;
  join_worker: (handle: Thread) => Promise<number>;
};

export type WebWorkerRuntime = {
  is_available: () => boolean;
  spawn: (specifier: string) => Promise<TaggedRuntimeValue>;
  spawn_inline: (source: string) => Promise<TaggedRuntimeValue>;
  post: (handle: number, msg: string) => TaggedRuntimeValue;
  on_message: (handle: number, handler: unknown) => void;
  on_error: (handle: number, handler: unknown) => void;
  terminate: (handle: number) => void;
  is_worker_context: () => boolean;
  self_post: (msg: string) => void;
  self_on_message: (handler: unknown) => void;
};

export type WebStreamsRuntime = {
  is_available: () => boolean;
  from_fetch: (url: string) => Promise<TaggedRuntimeValue>;
  from_string: (source: string) => number;
  from_bytes: (data: unknown) => number;
  read_chunk: (streamHandle: number) => Promise<TaggedRuntimeValue>;
  read_all: (streamHandle: number) => Promise<TaggedRuntimeValue>;
  read_text: (streamHandle: number) => Promise<TaggedRuntimeValue>;
  pipe: (sourceHandle: number, transform: (chunk: number[]) => unknown) => number;
  cancel: (streamHandle: number) => void;
};

export type ConcurrencyRuntime = {
  Thread: typeof Thread;
  ThreadHandle: typeof ThreadHandle;
  sync: SyncRuntime;
  sab_channel: SabChannelRuntime;
  thread: ThreadRuntime;
  web_worker: WebWorkerRuntime;
  web_streams: WebStreamsRuntime;
};

const formatError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

const isUrlLike = (specifier: string): boolean => /^[a-z]+:/i.test(specifier);

const toWorkerMessageString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toByteNumber = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(num)));
};

const toByteArray = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map((entry) => toByteNumber(entry)));
  if (value && typeof value === 'object') {
    const iterator = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iterator === 'function') {
      return Uint8Array.from(Array.from(value as Iterable<unknown>).map((entry) => toByteNumber(entry)));
    }
  }
  return new Uint8Array(0);
};

const decodeTextFromBytes = (bytes: number[]): string => {
  const data = Uint8Array.from(bytes);
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(data);
  }
  return String.fromCharCode(...Array.from(data));
};

const STREAM_DEFAULT_CHUNK_SIZE = 16 * 1024;

export class AtomicI32 {
  private storage: Int32Array | null = null;
  private fallback = 0;

  constructor(initial: number) {
    const value = Math.trunc(initial) | 0;
    const hasSharedMemory = typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined';
    if (hasSharedMemory) {
      this.storage = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      Atomics.store(this.storage, 0, value);
      return;
    }
    this.fallback = value;
  }

  static is_available(): boolean {
    return typeof SharedArrayBuffer === 'function' && typeof Atomics !== 'undefined';
  }

  load(): number {
    if (!this.storage) return this.fallback;
    return Atomics.load(this.storage, 0);
  }

  store(value: number): number {
    const next = Math.trunc(value) | 0;
    if (!this.storage) {
      this.fallback = next;
      return next;
    }
    Atomics.store(this.storage, 0, next);
    return next;
  }

  add(delta: number): number {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = (this.fallback + d) | 0;
      return prev;
    }
    return Atomics.add(this.storage, 0, d);
  }

  sub(delta: number): number {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = (this.fallback - d) | 0;
      return prev;
    }
    return Atomics.sub(this.storage, 0, d);
  }

  compare_exchange(expected: number, replacement: number): number {
    const exp = Math.trunc(expected) | 0;
    const rep = Math.trunc(replacement) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      if (prev === exp) this.fallback = rep;
      return prev;
    }
    return Atomics.compareExchange(this.storage, 0, exp, rep);
  }
}

export class Thread {
  private queue: unknown[] = [];
  private waiters: Array<(value: OptionLike) => void> = [];
  private closed = false;
  private exitCode: number | null = null;
  private joinWaiters: Array<(code: number) => void> = [];

  constructor(
    private readonly entry: ThreadWorker,
    private readonly option: OptionRuntime
  ) {
    if (entry.kind === 'node') {
      entry.worker.on('message', (value) => this.onMessage(value));
      entry.worker.on('error', () => this.finish(-1));
      entry.worker.on('exit', (code) => this.finish(code | 0));
    } else {
      entry.worker.addEventListener('message', (event) => this.onMessage(event.data));
      entry.worker.addEventListener('error', () => this.finish(-1));
    }
  }

  private onMessage(value: unknown): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(this.option.Some(value) as OptionLike);
      return;
    }
    this.queue.push(value);
  }

  private finish(code: number): void {
    if (this.exitCode !== null) return;
    this.exitCode = code | 0;
    this.closed = true;
    this.flushWaiters(this.option.None as OptionLike);
    while (this.joinWaiters.length > 0) {
      const waiter = this.joinWaiters.shift();
      if (waiter) waiter(this.exitCode);
    }
  }

  private flushWaiters(value: OptionLike): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }

  post(value: unknown): boolean {
    if (this.closed) return false;
    try {
      this.entry.worker.postMessage(value);
      return true;
    } catch {
      return false;
    }
  }

  recv(): Promise<OptionLike> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.option.Some(this.queue.shift()) as OptionLike);
    }
    if (this.closed) {
      return Promise.resolve(this.option.None as OptionLike);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  try_recv(): OptionLike {
    if (this.queue.length > 0) {
      return this.option.Some(this.queue.shift()) as OptionLike;
    }
    return this.option.None as OptionLike;
  }

  async terminate(): Promise<void> {
    if (this.exitCode !== null) return;
    if (this.entry.kind === 'node') {
      const code = await this.entry.worker.terminate();
      this.finish(code | 0);
      return;
    }
    this.entry.worker.terminate();
    this.finish(0);
  }

  join(): Promise<number> {
    if (this.exitCode !== null) return Promise.resolve(this.exitCode);
    return new Promise((resolve) => {
      this.joinWaiters.push(resolve);
    });
  }
}

export class ThreadHandle<T = unknown> {
  private readonly result: Promise<unknown>;

  constructor(task: () => T | Promise<T>, private readonly resultRuntime: ResultRuntime) {
    this.result = Promise.resolve()
      .then(() => task())
      .then(
        (value) => this.resultRuntime.Ok(value),
        (error) => this.resultRuntime.Err(error instanceof Error ? error.message : String(error))
      );
  }

  join(): Promise<unknown> {
    return this.result;
  }
}

export const createConcurrencyRuntime = (deps: ConcurrencyRuntimeDeps): ConcurrencyRuntime => {
  let webWorkerNextHandle = 1;
  const webWorkerHandles = new Map<number, WebWorkerRecord>();
  let runtimeStreamNextHandle = 1;
  const runtimeStreams = new Map<number, RuntimeStreamRecord>();

  const option = () => deps.getOption();
  const result = () => deps.getResult();
  const channel = (): ChannelRuntime => deps.getChannel();

  const resolveNodeWorkerSpecifier = (specifier: string): string => {
    if (isUrlLike(specifier)) return specifier;
    const nodePath = getNodePath();
    return nodePath ? nodePath.resolve(specifier) : resolvePathBasic(specifier);
  };

  const createThreadWorker = async (specifier: string): Promise<ThreadWorker> => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import('node:worker_threads');
        const WorkerCtor = (nodeWorkers as { Worker?: new (file: string, options?: { type?: string }) => NodeWorkerLike })
          .Worker;
        if (typeof WorkerCtor === 'function') {
          const worker = new WorkerCtor(resolveNodeWorkerSpecifier(specifier), { type: 'module' });
          return { kind: 'node', worker };
        }
      } catch {
        // fall through to web worker path
      }
    }

    if (typeof Worker === 'function') {
      const worker = new Worker(specifier, { type: 'module' }) as unknown as WebWorkerLike;
      return { kind: 'web', worker };
    }

    throw new Error('Worker API is not available in this environment');
  };

  const getWebWorkerRecord = (handle: number): WebWorkerRecord | null =>
    webWorkerHandles.get(Math.trunc(handle)) ?? null;

  const registerWebWorker = (entry: ThreadWorker, inlineUrl: string | null = null): number => {
    const id = webWorkerNextHandle++;
    webWorkerHandles.set(id, { id, entry, inlineUrl });
    return id;
  };

  const createInlineWorker = async (source: string): Promise<{ worker: ThreadWorker; inlineUrl: string | null }> => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import('node:worker_threads');
        const WorkerCtor = (nodeWorkers as { Worker?: new (script: string, options?: { eval?: boolean }) => NodeWorkerLike })
          .Worker;
        if (typeof WorkerCtor === 'function') {
          return {
            worker: { kind: 'node', worker: new WorkerCtor(String(source), { eval: true }) },
            inlineUrl: null,
          };
        }
      } catch {
        // fall through to browser worker path
      }
    }
    if (
      typeof Worker === 'function' &&
      typeof Blob === 'function' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function'
    ) {
      const blob = new Blob([String(source)], { type: 'application/javascript' });
      const inlineUrl = URL.createObjectURL(blob);
      const worker = new Worker(inlineUrl, { type: 'module' }) as unknown as WebWorkerLike;
      return { worker: { kind: 'web', worker }, inlineUrl };
    }
    throw new Error('Worker API is not available in this environment');
  };

  const cleanupWebWorkerRecord = (record: WebWorkerRecord | null): void => {
    if (!record) return;
    webWorkerHandles.delete(record.id);
    if (record.inlineUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(record.inlineUrl);
      } catch {
        // ignore revoke failures
      }
    }
  };

  const isWorkerContextBrowser = (): boolean =>
    typeof WorkerGlobalScope !== 'undefined' &&
    typeof self !== 'undefined' &&
    self instanceof WorkerGlobalScope;

  const isWorkerContextNode = (): boolean => {
    if (!isNodeRuntime()) return false;
    const workerThreads = getNodeBuiltinModule('node:worker_threads') as { isMainThread?: unknown } | null;
    return workerThreads != null && typeof workerThreads.isMainThread === 'boolean' ? !workerThreads.isMainThread : false;
  };

  const registerRuntimeStream = (state: RuntimeStreamRecord['state']): number => {
    const id = runtimeStreamNextHandle++;
    runtimeStreams.set(id, { id, state });
    return id;
  };

  const cleanupRuntimeStreamHandle = (handle: number, seen: Set<number> = new Set()): void => {
    const normalized = Math.trunc(handle);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const record = runtimeStreams.get(normalized);
    if (!record) return;
    if (record.state.kind === 'reader' && typeof record.state.reader.cancel === 'function') {
      try {
        void record.state.reader.cancel();
      } catch {
        // ignore cancellation failures
      }
    }
    runtimeStreams.delete(normalized);
    if (record.state.kind === 'pipe') {
      cleanupRuntimeStreamHandle(record.state.sourceHandle, seen);
    }
  };

  const readChunkFromRuntimeStream = async (handle: number, seen: Set<number> = new Set()): Promise<StreamChunkRead> => {
    const normalized = Math.trunc(handle);
    if (seen.has(normalized)) {
      return { ok: false, error: 'Detected cyclic stream pipeline' };
    }
    const record = runtimeStreams.get(normalized);
    if (!record) return { ok: false, error: `Unknown stream handle ${handle}` };
    if (record.state.kind === 'buffer') {
      const state = record.state;
      if (state.offset >= state.data.length) return { ok: true, chunk: null };
      const nextEnd = Math.min(state.data.length, state.offset + state.chunkSize);
      const chunk = Array.from(state.data.subarray(state.offset, nextEnd));
      state.offset = nextEnd;
      return { ok: true, chunk };
    }
    if (record.state.kind === 'reader') {
      const state = record.state;
      if (state.done) return { ok: true, chunk: null };
      try {
        const next = await state.reader.read();
        if (next.done) {
          state.done = true;
          return { ok: true, chunk: null };
        }
        return { ok: true, chunk: Array.from(toByteArray(next.value)) };
      } catch (error) {
        return { ok: false, error: formatError(error) };
      }
    }
    const pipeState = record.state;
    const nestedSeen = new Set(seen);
    nestedSeen.add(normalized);
    const source = await readChunkFromRuntimeStream(pipeState.sourceHandle, nestedSeen);
    if (!source.ok) return source;
    if (source.chunk == null) return source;
    try {
      return { ok: true, chunk: Array.from(toByteArray(pipeState.transform(source.chunk))) };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  };

  const sabYield = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  class Mutex {
    private locked = false;
    private waiters: Array<(acquired: boolean) => void> = [];

    async acquire(): Promise<boolean> {
      if (!this.locked) {
        this.locked = true;
        return true;
      }
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }

    try_acquire(): boolean {
      if (this.locked) return false;
      this.locked = true;
      return true;
    }

    release(): boolean {
      if (!this.locked) return false;
      const next = this.waiters.shift();
      if (next) {
        next(true);
        return true;
      }
      this.locked = false;
      return true;
    }

    is_locked(): boolean {
      return this.locked;
    }
  }

  class Semaphore {
    private permits: number;
    private waiters: Array<(acquired: boolean) => void> = [];

    constructor(initialPermits: number) {
      this.permits = Math.max(0, Math.trunc(initialPermits));
    }

    async acquire(): Promise<boolean> {
      if (this.permits > 0) {
        this.permits -= 1;
        return true;
      }
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }

    try_acquire(): boolean {
      if (this.permits <= 0) return false;
      this.permits -= 1;
      return true;
    }

    release(count = 1): void {
      const n = Math.max(1, Math.trunc(count));
      for (let i = 0; i < n; i += 1) {
        const next = this.waiters.shift();
        if (next) {
          next(true);
        } else {
          this.permits += 1;
        }
      }
    }

    available(): number {
      return this.permits;
    }
  }

  const sync = {
    mutex_new: (): Mutex => new Mutex(),
    mutex_acquire: async (mutex: Mutex): Promise<boolean> => mutex.acquire(),
    mutex_try_acquire: (mutex: Mutex): boolean => mutex.try_acquire(),
    mutex_release: (mutex: Mutex): boolean => mutex.release(),
    mutex_is_locked: (mutex: Mutex): boolean => mutex.is_locked(),
    semaphore_new: (permits: number): Semaphore => new Semaphore(permits),
    semaphore_acquire: async (semaphore: Semaphore): Promise<boolean> => semaphore.acquire(),
    semaphore_try_acquire: (semaphore: Semaphore): boolean => semaphore.try_acquire(),
    semaphore_release: (semaphore: Semaphore, count = 1): void => semaphore.release(count),
    semaphore_available: (semaphore: Semaphore): number => semaphore.available(),
    atomic_i32_new: (initial: number): AtomicI32 => new AtomicI32(initial),
    atomic_i32_is_available: (): boolean => AtomicI32.is_available(),
    atomic_i32_load: (value: AtomicI32): number => value.load(),
    atomic_i32_store: (value: AtomicI32, next: number): number => value.store(next),
    atomic_i32_add: (value: AtomicI32, delta: number): number => value.add(delta),
    atomic_i32_sub: (value: AtomicI32, delta: number): number => value.sub(delta),
    atomic_i32_compare_exchange: (value: AtomicI32, expected: number, replacement: number): number =>
      value.compare_exchange(expected, replacement),
  } as unknown as SyncRuntime;

  type SABChannelKind = 'i32' | 'u32' | 'f32' | 'f64';

  interface SABChannelState {
    mode: 'sab' | 'fallback';
    kind: SABChannelKind;
    capacity: number;
    control?: Int32Array;
    dataI32?: Int32Array;
    dataU32?: Uint32Array;
    dataF32?: Float32Array;
    dataF64?: Float64Array;
    fallbackSender?: unknown;
    fallbackReceiver?: unknown;
  }

  const SAB_HEAD = 0;
  const SAB_TAIL = 1;
  const SAB_COUNT = 2;
  const SAB_SENDER_CLOSED = 3;
  const SAB_RECEIVER_CLOSED = 4;
  const SAB_CLOSE_FLAG = 5;
  const SAB_CONTROL_WORDS = 6;
  const SAB_DATA_OFFSET_BYTES = Int32Array.BYTES_PER_ELEMENT * SAB_CONTROL_WORDS;

  const sabElementSize = (kind: SABChannelKind): number => (kind === 'f64' ? 8 : 4);

  const normalizeSabValue = (kind: SABChannelKind, value: number): number => {
    const n = Number(value);
    switch (kind) {
      case 'u32':
        return Math.trunc(n) >>> 0;
      case 'f32':
        return Math.fround(n);
      case 'f64':
        return Number(n);
      case 'i32':
      default:
        return Math.trunc(n) | 0;
    }
  };

  const createSABChannelState = (capacity: number, kind: SABChannelKind): SABChannelState => {
    const cap = Math.max(1, Math.trunc(capacity));
    if (AtomicI32.is_available()) {
      const totalBytes = SAB_DATA_OFFSET_BYTES + cap * sabElementSize(kind);
      const buffer = new SharedArrayBuffer(totalBytes);
      const control = new Int32Array(buffer, 0, SAB_CONTROL_WORDS);
      Atomics.store(control, SAB_HEAD, 0);
      Atomics.store(control, SAB_TAIL, 0);
      Atomics.store(control, SAB_COUNT, 0);
      Atomics.store(control, SAB_SENDER_CLOSED, 0);
      Atomics.store(control, SAB_RECEIVER_CLOSED, 0);
      Atomics.store(control, SAB_CLOSE_FLAG, 0);
      const state: SABChannelState = { mode: 'sab', kind, capacity: cap, control };
      if (kind === 'i32') {
        state.dataI32 = new Int32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else if (kind === 'u32') {
        state.dataU32 = new Uint32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else if (kind === 'f32') {
        state.dataF32 = new Float32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else {
        state.dataF64 = new Float64Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      }
      return state;
    }

    if (channel().is_available()) {
      const fallback = channel().bounded(cap);
      return {
        mode: 'fallback',
        kind,
        capacity: cap,
        fallbackSender: fallback.sender,
        fallbackReceiver: fallback.receiver,
      };
    }

    throw new Error('SharedArrayBuffer + Atomics or MessageChannel fallback is not available in this environment');
  };

  const writeSabStateValue = (state: SABChannelState, index: number, value: number): void => {
    const normalized = normalizeSabValue(state.kind, value);
    switch (state.kind) {
      case 'u32':
        state.dataU32![index] = normalized >>> 0;
        return;
      case 'f32':
        state.dataF32![index] = Math.fround(normalized);
        return;
      case 'f64':
        state.dataF64![index] = Number(normalized);
        return;
      case 'i32':
      default:
        state.dataI32![index] = Math.trunc(normalized) | 0;
    }
  };

  const readSabStateValue = (state: SABChannelState, index: number): number => {
    switch (state.kind) {
      case 'u32':
        return state.dataU32![index] >>> 0;
      case 'f32':
        return Math.fround(state.dataF32![index]);
      case 'f64':
        return Number(state.dataF64![index]);
      case 'i32':
      default:
        return Math.trunc(state.dataI32![index]) | 0;
    }
  };

  class SABSenderBase {
    constructor(private readonly state: SABChannelState) {}

    try_send(value: number): boolean {
      const normalized = normalizeSabValue(this.state.kind, value);
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackSender) return false;
        return channel().try_send(this.state.fallbackSender as ChannelSender<number>, normalized);
      }
      const control = this.state.control!;
      if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0) return false;
      if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return false;
      const count = Atomics.load(control, SAB_COUNT);
      if (count >= this.state.capacity) return false;
      const tail = Atomics.load(control, SAB_TAIL);
      writeSabStateValue(this.state, tail, normalized);
      Atomics.store(control, SAB_TAIL, (tail + 1) % this.state.capacity);
      Atomics.store(control, SAB_COUNT, count + 1);
      Atomics.notify(control, SAB_COUNT, 1);
      return true;
    }

    async send(value: number): Promise<boolean> {
      for (;;) {
        if (this.try_send(value)) return true;
        if (this.is_closed()) return false;
        await sabYield();
      }
    }

    async send_timeout(value: number, timeoutMs: number): Promise<TaggedRuntimeValue> {
      const deadline = Date.now() + Math.max(0, Math.trunc(timeoutMs));
      for (;;) {
        if (this.try_send(value)) return result().Ok(undefined);
        if (this.is_closed()) return result().Err('closed');
        if (Date.now() >= deadline) return result().Err('timeout');
        await sabYield();
      }
    }

    is_closed(): boolean {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackSender) return true;
        return channel().is_sender_closed(this.state.fallbackSender as ChannelSender<number>);
      }
      const control = this.state.control!;
      return Atomics.load(control, SAB_SENDER_CLOSED) !== 0 || Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0;
    }

    close(): void {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackSender) return;
        channel().close_sender(this.state.fallbackSender as ChannelSender<number>);
        return;
      }
      const control = this.state.control!;
      Atomics.store(control, SAB_SENDER_CLOSED, 1);
      Atomics.store(control, SAB_CLOSE_FLAG, 1);
      Atomics.notify(control, SAB_COUNT);
    }

    drop(): void {
      this.close();
    }
  }

  class SABReceiverBase {
    constructor(private readonly state: SABChannelState) {}

    try_recv(): OptionLike {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackReceiver) return option().None;
        const value = channel().try_recv(this.state.fallbackReceiver as ChannelReceiver<number>) as OptionLike;
        if (deps.getEnumTag(value as LuminaEnumLike) !== 'Some') return option().None;
        return option().Some(normalizeSabValue(this.state.kind, Number(deps.getEnumPayload(value as LuminaEnumLike))));
      }
      const control = this.state.control!;
      const count = Atomics.load(control, SAB_COUNT);
      if (count <= 0) return option().None;
      const head = Atomics.load(control, SAB_HEAD);
      const value = readSabStateValue(this.state, head);
      Atomics.store(control, SAB_HEAD, (head + 1) % this.state.capacity);
      Atomics.store(control, SAB_COUNT, count - 1);
      Atomics.notify(control, SAB_COUNT, 1);
      return option().Some(value);
    }

    async recv(): Promise<OptionLike> {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackReceiver) return option().None;
        for (;;) {
          const value = (await channel().recv(this.state.fallbackReceiver as ChannelReceiver<number>)) as OptionLike;
          if (deps.getEnumTag(value as LuminaEnumLike) === 'Some') {
            return option().Some(normalizeSabValue(this.state.kind, Number(deps.getEnumPayload(value as LuminaEnumLike))));
          }
          if (this.is_closed()) return option().None;
          await sabYield();
        }
      }
      for (;;) {
        const value = this.try_recv();
        if (deps.getEnumTag(value as LuminaEnumLike) === 'Some') return value;
        if (this.is_closed()) return option().None;
        await sabYield();
      }
    }

    is_closed(): boolean {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackReceiver) return true;
        return channel().is_receiver_closed(this.state.fallbackReceiver as ChannelReceiver<number>);
      }
      const control = this.state.control!;
      if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return true;
      if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0 && Atomics.load(control, SAB_COUNT) <= 0) return true;
      return false;
    }

    close(): void {
      if (this.state.mode === 'fallback') {
        if (!this.state.fallbackReceiver) return;
        channel().close_receiver(this.state.fallbackReceiver as ChannelReceiver<number>);
        return;
      }
      const control = this.state.control!;
      Atomics.store(control, SAB_RECEIVER_CLOSED, 1);
      Atomics.store(control, SAB_CLOSE_FLAG, 1);
      Atomics.notify(control, SAB_COUNT);
    }

    drop(): void {
      this.close();
    }
  }

  class SABSenderI32 extends SABSenderBase {}
  class SABReceiverI32 extends SABReceiverBase {}
  class SABSenderU32 extends SABSenderBase {}
  class SABReceiverU32 extends SABReceiverBase {}
  class SABSenderF32 extends SABSenderBase {}
  class SABReceiverF32 extends SABReceiverBase {}
  class SABSenderF64 extends SABSenderBase {}
  class SABReceiverF64 extends SABReceiverBase {}

  const sab_channel = {
    is_available: (): boolean => AtomicI32.is_available() || channel().is_available(),
    bounded_i32: (capacity: number): { sender: SABSenderI32; receiver: SABReceiverI32 } => {
      const state = createSABChannelState(capacity, 'i32');
      return { sender: new SABSenderI32(state), receiver: new SABReceiverI32(state) };
    },
    bounded_u32: (capacity: number): { sender: SABSenderU32; receiver: SABReceiverU32 } => {
      const state = createSABChannelState(capacity, 'u32');
      return { sender: new SABSenderU32(state), receiver: new SABReceiverU32(state) };
    },
    bounded_f32: (capacity: number): { sender: SABSenderF32; receiver: SABReceiverF32 } => {
      const state = createSABChannelState(capacity, 'f32');
      return { sender: new SABSenderF32(state), receiver: new SABReceiverF32(state) };
    },
    bounded_f64: (capacity: number): { sender: SABSenderF64; receiver: SABReceiverF64 } => {
      const state = createSABChannelState(capacity, 'f64');
      return { sender: new SABSenderF64(state), receiver: new SABReceiverF64(state) };
    },
    send_i32: (sender: SABSenderI32, value: number): boolean => sender.try_send(value),
    try_send_i32: (sender: SABSenderI32, value: number): boolean => sender.try_send(value),
    send_async_i32: (sender: SABSenderI32, value: number): Promise<boolean> => sender.send(value),
    send_timeout_i32: (sender: SABSenderI32, value: number, timeoutMs: number): Promise<TaggedRuntimeValue> =>
      sender.send_timeout(value, timeoutMs),
    recv_i32: (receiver: SABReceiverI32): Promise<OptionLike> => receiver.recv(),
    try_recv_i32: (receiver: SABReceiverI32): OptionLike => receiver.try_recv(),
    close_sender_i32: (sender: SABSenderI32): void => sender.close(),
    close_receiver_i32: (receiver: SABReceiverI32): void => receiver.close(),
    is_sender_closed_i32: (sender: SABSenderI32): boolean => sender.is_closed(),
    is_receiver_closed_i32: (receiver: SABReceiverI32): boolean => receiver.is_closed(),
    close_i32: (ch: { sender: SABSenderI32; receiver: SABReceiverI32 }): void => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_u32: (sender: SABSenderU32, value: number): boolean => sender.try_send(value),
    try_send_u32: (sender: SABSenderU32, value: number): boolean => sender.try_send(value),
    send_async_u32: (sender: SABSenderU32, value: number): Promise<boolean> => sender.send(value),
    send_timeout_u32: (sender: SABSenderU32, value: number, timeoutMs: number): Promise<TaggedRuntimeValue> =>
      sender.send_timeout(value, timeoutMs),
    recv_u32: (receiver: SABReceiverU32): Promise<OptionLike> => receiver.recv(),
    try_recv_u32: (receiver: SABReceiverU32): OptionLike => receiver.try_recv(),
    close_sender_u32: (sender: SABSenderU32): void => sender.close(),
    close_receiver_u32: (receiver: SABReceiverU32): void => receiver.close(),
    is_sender_closed_u32: (sender: SABSenderU32): boolean => sender.is_closed(),
    is_receiver_closed_u32: (receiver: SABReceiverU32): boolean => receiver.is_closed(),
    close_u32: (ch: { sender: SABSenderU32; receiver: SABReceiverU32 }): void => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_f32: (sender: SABSenderF32, value: number): boolean => sender.try_send(value),
    try_send_f32: (sender: SABSenderF32, value: number): boolean => sender.try_send(value),
    send_async_f32: (sender: SABSenderF32, value: number): Promise<boolean> => sender.send(value),
    send_timeout_f32: (sender: SABSenderF32, value: number, timeoutMs: number): Promise<TaggedRuntimeValue> =>
      sender.send_timeout(value, timeoutMs),
    recv_f32: (receiver: SABReceiverF32): Promise<OptionLike> => receiver.recv(),
    try_recv_f32: (receiver: SABReceiverF32): OptionLike => receiver.try_recv(),
    close_sender_f32: (sender: SABSenderF32): void => sender.close(),
    close_receiver_f32: (receiver: SABReceiverF32): void => receiver.close(),
    is_sender_closed_f32: (sender: SABSenderF32): boolean => sender.is_closed(),
    is_receiver_closed_f32: (receiver: SABReceiverF32): boolean => receiver.is_closed(),
    close_f32: (ch: { sender: SABSenderF32; receiver: SABReceiverF32 }): void => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_f64: (sender: SABSenderF64, value: number): boolean => sender.try_send(value),
    try_send_f64: (sender: SABSenderF64, value: number): boolean => sender.try_send(value),
    send_async_f64: (sender: SABSenderF64, value: number): Promise<boolean> => sender.send(value),
    send_timeout_f64: (sender: SABSenderF64, value: number, timeoutMs: number): Promise<TaggedRuntimeValue> =>
      sender.send_timeout(value, timeoutMs),
    recv_f64: (receiver: SABReceiverF64): Promise<OptionLike> => receiver.recv(),
    try_recv_f64: (receiver: SABReceiverF64): OptionLike => receiver.try_recv(),
    close_sender_f64: (sender: SABSenderF64): void => sender.close(),
    close_receiver_f64: (receiver: SABReceiverF64): void => receiver.close(),
    is_sender_closed_f64: (sender: SABSenderF64): boolean => sender.is_closed(),
    is_receiver_closed_f64: (receiver: SABReceiverF64): boolean => receiver.is_closed(),
    close_f64: (ch: { sender: SABSenderF64; receiver: SABReceiverF64 }): void => {
      ch.sender.close();
      ch.receiver.close();
    },
  } as unknown as SabChannelRuntime;

  const thread: ThreadRuntime = {
    is_available: (): boolean => isNodeRuntime() || typeof Worker === 'function',
    spawn: (task: unknown): unknown => {
      if (typeof task === 'function') {
        return new ThreadHandle(() => (task as () => unknown)(), result());
      }
      return thread.spawn_worker(task);
    },
    spawn_worker: async (specifier: unknown): Promise<unknown> => {
      if (typeof specifier !== 'string' || specifier.length === 0) {
        return result().Err('Thread specifier must be a non-empty string');
      }
      try {
        const worker = await createThreadWorker(specifier);
        return result().Ok(new Thread(worker, option()));
      } catch (error) {
        return result().Err(String(error));
      }
    },
    post: (handle: Thread, value: unknown): boolean => handle.post(value),
    recv: (handle: Thread): Promise<unknown> => handle.recv(),
    try_recv: (handle: Thread): unknown => handle.try_recv(),
    terminate: async (handle: Thread): Promise<void> => {
      await handle.terminate();
    },
    join: (handle: unknown): unknown => {
      if (handle instanceof ThreadHandle) return handle.join();
      if (handle instanceof Thread) return handle.join();
      throw new Error('Invalid thread handle');
    },
    join_worker: (handle: Thread): Promise<number> => handle.join(),
  };

  const web_worker: WebWorkerRuntime = {
    is_available: (): boolean => isNodeRuntime() || typeof Worker === 'function',
    spawn: async (specifier: string): Promise<{ $tag: string; $payload?: unknown }> => {
      const input = String(specifier ?? '').trim();
      if (!input) return result().Err('Worker specifier must be a non-empty string');
      try {
        const worker = await createThreadWorker(input);
        return result().Ok(registerWebWorker(worker));
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    spawn_inline: async (source: string): Promise<{ $tag: string; $payload?: unknown }> => {
      const input = String(source ?? '');
      if (!input.trim()) return result().Err('Inline worker source must be a non-empty string');
      try {
        const worker = await createInlineWorker(input);
        return result().Ok(registerWebWorker(worker.worker, worker.inlineUrl));
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    post: (handle: number, msg: string): { $tag: string; $payload?: unknown } => {
      const record = getWebWorkerRecord(handle);
      if (!record) return result().Err(`Unknown worker handle ${handle}`);
      try {
        record.entry.worker.postMessage(String(msg));
        return result().Ok(undefined);
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    on_message: (handle: number, handler: unknown): void => {
      const record = getWebWorkerRecord(handle);
      if (!record || typeof handler !== 'function') return;
      if (record.entry.kind === 'node') {
        record.entry.worker.on('message', (value) => {
          (handler as (msg: string) => void)(toWorkerMessageString(value));
        });
        return;
      }
      record.entry.worker.addEventListener('message', (event) => {
        (handler as (msg: string) => void)(toWorkerMessageString(event.data));
      });
    },
    on_error: (handle: number, handler: unknown): void => {
      const record = getWebWorkerRecord(handle);
      if (!record || typeof handler !== 'function') return;
      if (record.entry.kind === 'node') {
        record.entry.worker.on('error', (error) => {
          (handler as (msg: string) => void)(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      record.entry.worker.addEventListener('error', (event) => {
        const error = event.error;
        const message = error instanceof Error ? error.message : event.message || String(error ?? '');
        (handler as (msg: string) => void)(message);
      });
    },
    terminate: (handle: number): void => {
      const record = getWebWorkerRecord(handle);
      if (!record) return;
      try {
        if (record.entry.kind === 'node') {
          void record.entry.worker.terminate();
        } else {
          record.entry.worker.terminate();
        }
      } finally {
        cleanupWebWorkerRecord(record);
      }
    },
    is_worker_context: (): boolean => isWorkerContextBrowser() || isWorkerContextNode(),
    self_post: (msg: string): void => {
      if (isWorkerContextBrowser() && typeof postMessage === 'function') {
        postMessage(String(msg));
        return;
      }
      if (isWorkerContextNode()) {
        const workerThreads = getNodeBuiltinModule('node:worker_threads') as {
          parentPort?: { postMessage?: (value: unknown) => void };
        } | null;
        if (typeof workerThreads?.parentPort?.postMessage === 'function') {
          workerThreads.parentPort.postMessage(String(msg));
        }
      }
    },
    self_on_message: (handler: unknown): void => {
      if (typeof handler !== 'function') return;
      if (isWorkerContextBrowser() && typeof addEventListener === 'function') {
        addEventListener('message', (event) => {
          (handler as (msg: string) => void)(toWorkerMessageString((event as MessageEvent<unknown>).data));
        });
        return;
      }
      if (isWorkerContextNode()) {
        const workerThreads = getNodeBuiltinModule('node:worker_threads') as {
          parentPort?: { on?: (event: string, listener: (value: unknown) => void) => void };
        } | null;
        if (typeof workerThreads?.parentPort?.on === 'function') {
          workerThreads.parentPort.on('message', (value) => {
            (handler as (msg: string) => void)(toWorkerMessageString(value));
          });
        }
      }
    },
  };

  const web_streams: WebStreamsRuntime = {
    is_available: (): boolean => typeof ReadableStream === 'function' || typeof fetch === 'function' || isNodeRuntime(),
    from_fetch: async (url: string): Promise<{ $tag: string; $payload?: unknown }> => {
      if (typeof fetch !== 'function') return result().Err('Fetch API is not available in this environment');
      try {
        const response = await fetch(String(url));
        const body = (response as { body?: { getReader?: () => unknown } }).body;
        if (body && typeof body.getReader === 'function') {
          const reader = body.getReader() as RuntimeStreamReader['reader'];
          return result().Ok(registerRuntimeStream({ kind: 'reader', reader, done: false }));
        }
        if (typeof response.arrayBuffer === 'function') {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return result().Ok(registerRuntimeStream({ kind: 'buffer', data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE }));
        }
        return result().Err('Response body stream is not available');
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    from_string: (source: string): number => {
      const bytes =
        typeof TextEncoder === 'function'
          ? new TextEncoder().encode(String(source))
          : Uint8Array.from(String(source).split('').map((ch) => ch.charCodeAt(0) & 0xff));
      return registerRuntimeStream({ kind: 'buffer', data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE });
    },
    from_bytes: (data: unknown): number =>
      registerRuntimeStream({
        kind: 'buffer',
        data: toByteArray(data),
        offset: 0,
        chunkSize: STREAM_DEFAULT_CHUNK_SIZE,
      }),
    read_chunk: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
      const next = await readChunkFromRuntimeStream(streamHandle);
      if (!next.ok) return result().Err(next.error);
      if (next.chunk == null) return result().Ok(option().None);
      return result().Ok(option().Some(next.chunk));
    },
    read_all: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
      const all: number[] = [];
      for (;;) {
        const next = await readChunkFromRuntimeStream(streamHandle);
        if (!next.ok) {
          cleanupRuntimeStreamHandle(streamHandle);
          return result().Err(next.error);
        }
        if (next.chunk == null) {
          cleanupRuntimeStreamHandle(streamHandle);
          return result().Ok(all);
        }
        all.push(...next.chunk);
      }
    },
    read_text: async (streamHandle: number): Promise<{ $tag: string; $payload?: unknown }> => {
      const all = await web_streams.read_all(streamHandle);
      if (!deps.isEnumLike(all) || deps.getEnumTag(all) !== 'Ok') return all;
      return result().Ok(decodeTextFromBytes(deps.getEnumPayload(all) as number[]));
    },
    pipe: (sourceHandle: number, transform: (chunk: number[]) => unknown): number =>
      registerRuntimeStream({ kind: 'pipe', sourceHandle: Math.trunc(sourceHandle), transform }),
    cancel: (streamHandle: number): void => {
      cleanupRuntimeStreamHandle(streamHandle);
    },
  };

  return {
    Thread,
    ThreadHandle,
    sync,
    sab_channel,
    thread,
    web_worker,
    web_streams,
  };
};
