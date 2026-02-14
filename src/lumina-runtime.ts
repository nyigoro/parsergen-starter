import { readFileSync } from 'node:fs';

export type LuminaEnumLike =
  | { $tag: string; $payload?: unknown }
  | { tag: string; values?: unknown[] };

const isEnumLike = (value: unknown): value is LuminaEnumLike => {
  if (!value || typeof value !== 'object') return false;
  const v = value as { $tag?: string; tag?: string };
  return typeof v.$tag === 'string' || typeof v.tag === 'string';
};

const getEnumTag = (value: LuminaEnumLike): string =>
  (value as { $tag?: string }).$tag ?? (value as { tag?: string }).tag ?? 'Unknown';

const getEnumPayload = (value: LuminaEnumLike): unknown => {
  if ((value as { $payload?: unknown }).$payload !== undefined) {
    return (value as { $payload?: unknown }).$payload;
  }
  const values = (value as { values?: unknown[] }).values;
  if (!values) return undefined;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
};

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' &&
  typeof (process as { versions?: { node?: string } }).versions?.node === 'string';

const supportsColor = (): boolean => {
  if (typeof window !== 'undefined') return false;
  if (!isNodeRuntime()) return false;
  const stdout = (process as { stdout?: { isTTY?: boolean } }).stdout;
  return Boolean(stdout && stdout.isTTY);
};

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const colorize = (text: string, color: string | null, enabled: boolean): string => {
  if (!enabled || !color) return text;
  return `${color}${text}${colors.reset}`;
};

export type FormatOptions = {
  indent?: number;
  maxDepth?: number;
  color?: boolean;
};

const defaultFormatOptions: Required<FormatOptions> = {
  indent: 2,
  maxDepth: 6,
  color: supportsColor(),
};

export function formatValue(value: unknown, options: FormatOptions = {}): string {
  const config = { ...defaultFormatOptions, ...options };
  const seen = new WeakSet<object>();

  const formatEnum = (tag: string, payload: unknown, depth: number): string => {
    if (payload === undefined) return colorize(tag, colors.cyan, config.color);
    if (Array.isArray(payload)) {
      const inner = payload.map((item) => format(item, depth + 1));
      return formatEnumPayload(tag, inner, depth);
    }
    return formatEnumPayload(tag, [format(payload, depth + 1)], depth);
  };

  const formatEnumPayload = (tag: string, parts: string[], depth: number): string => {
    const name = colorize(tag, colors.cyan, config.color);
    const multiline = parts.some((part) => part.includes('\n')) || parts.join(', ').length > 60;
    if (!multiline) {
      return `${name}(${parts.join(', ')})`;
    }
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `${name}(\n${indent}${parts.join(`,\n${indent}`)}\n${closing})`;
  };

  const formatArray = (items: unknown[], depth: number): string => {
    if (items.length === 0) return '[]';
    if (depth >= config.maxDepth) return '[...]';
    const rendered = items.map((item) => format(item, depth + 1));
    const multiline = rendered.some((item) => item.includes('\n')) || rendered.join(', ').length > 60;
    if (!multiline) return `[${rendered.join(', ')}]`;
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `[\n${indent}${rendered.join(`,\n${indent}`)}\n${closing}]`;
  };

  const formatObject = (obj: Record<string, unknown>, depth: number): string => {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    if (depth >= config.maxDepth) return '{...}';
    const rendered = entries.map(([key, val]) => `${key}: ${format(val, depth + 1)}`);
    const multiline = rendered.some((item) => item.includes('\n')) || rendered.join(', ').length > 60;
    if (!multiline) return `{ ${rendered.join(', ')} }`;
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return `{\n${indent}${rendered.join(`,\n${indent}`)}\n${closing}}`;
  };

  const format = (val: unknown, depth: number): string => {
    if (val === null || val === undefined) return colorize(String(val), colors.gray, config.color);
    if (typeof val === 'string') return colorize(val, colors.green, config.color);
    if (typeof val === 'number' || typeof val === 'bigint') return colorize(String(val), colors.yellow, config.color);
    if (typeof val === 'boolean') return colorize(String(val), colors.magenta, config.color);
    if (typeof val === 'function') return `[Function${val.name ? ` ${val.name}` : ''}]`;
    if (Array.isArray(val)) return formatArray(val, depth);
    if (typeof val === 'object') {
      if (isEnumLike(val)) {
        const tag = getEnumTag(val);
        const payload = getEnumPayload(val);
        return formatEnum(tag, payload, depth);
      }
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
      return formatObject(val as Record<string, unknown>, depth);
    }
    try {
      return String(val);
    } catch {
      return '[unprintable]';
    }
  };

  return format(value, 0);
}

const toJsonValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return payload === undefined ? { $tag: tag } : { $tag: tag, $payload: toJsonValue(payload, seen) };
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      toJsonValue(val, seen),
    ]);
    return Object.fromEntries(entries);
  }
  return String(value);
};

export function toJsonString(value: unknown, pretty: boolean = true): string {
  const normalized = toJsonValue(value, new WeakSet());
  return JSON.stringify(normalized, null, pretty ? 2 : undefined);
}

const renderArgs = (args: unknown[]): string => args.map((arg) => formatValue(arg)).join(' ');

const writeStdout = (text: string, newline: boolean) => {
  if (isNodeRuntime()) {
    const stdout = (process as { stdout?: { write?: (chunk: string) => void } }).stdout;
    if (stdout?.write) {
      stdout.write(text + (newline ? '\n' : ''));
      return;
    }
  }
  // eslint-disable-next-line no-console -- runtime output
  console.log(text);
};

const writeStderr = (text: string, newline: boolean) => {
  if (isNodeRuntime()) {
    const stderr = (process as { stderr?: { write?: (chunk: string) => void } }).stderr;
    if (stderr?.write) {
      stderr.write(text + (newline ? '\n' : ''));
      return;
    }
  }
  // eslint-disable-next-line no-console -- runtime output
  console.error(text);
};

let stdinCache: string[] | null = null;
let stdinIndex = 0;

const readStdinLines = (): string[] => {
  if (stdinCache) return stdinCache;
  const globalAny = globalThis as { __luminaStdin?: string | string[] };
  if (globalAny.__luminaStdin !== undefined) {
    const raw = globalAny.__luminaStdin;
    stdinCache = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/);
    return stdinCache;
  }
  if (isNodeRuntime()) {
    const stdin = (process as { stdin?: { read?: () => unknown; setEncoding?: (enc: string) => void } }).stdin;
    const isTty = (stdin as { isTTY?: boolean } | undefined)?.isTTY;
    if (isTty !== true) {
      try {
        const raw = readFileSync(0, 'utf8');
        if (raw.length > 0) {
          stdinCache = raw.split(/\r?\n/);
          return stdinCache;
        }
      } catch {
        // ignore stdin read errors
      }
    }
    if (stdin?.setEncoding) stdin.setEncoding('utf8');
    const chunk = stdin?.read?.();
    if (typeof chunk === 'string') {
      stdinCache = chunk.split(/\r?\n/);
      return stdinCache;
    }
    if (chunk && typeof (chunk as { toString?: (enc: string) => string }).toString === 'function') {
      stdinCache = (chunk as { toString: (enc: string) => string }).toString('utf8').split(/\r?\n/);
      return stdinCache;
    }
  }
  stdinCache = [];
  return stdinCache;
};

const unwrapOption = (value: unknown): { isSome: boolean; value?: unknown } => {
  if (isEnumLike(value)) {
    const tag = getEnumTag(value);
    if (tag === 'Some') return { isSome: true, value: getEnumPayload(value) };
    if (tag === 'None') return { isSome: false };
  }
  return { isSome: true, value };
};

export const io = {
  print: (...args: unknown[]) => {
    writeStdout(renderArgs(args), false);
  },
  println: (...args: unknown[]) => {
    writeStdout(renderArgs(args), true);
  },
  eprint: (...args: unknown[]) => {
    writeStderr(renderArgs(args), false);
  },
  eprintln: (...args: unknown[]) => {
    writeStderr(renderArgs(args), true);
  },
  readLine: () => {
    const globalAny = globalThis as { __luminaReadLine?: () => string | null | undefined };
    if (typeof globalAny.__luminaReadLine === 'function') {
      const value = globalAny.__luminaReadLine();
      return value == null ? Option.None : Option.Some(value);
    }
    if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
      const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
      return value == null ? Option.None : Option.Some(value);
    }
    const lines = readStdinLines();
    if (stdinIndex >= lines.length) return Option.None;
    const value = lines[stdinIndex++];
    return Option.Some(value);
  },
  readLineAsync: async () => {
    const globalAny = globalThis as { __luminaStdin?: string | string[] };
    if (globalAny.__luminaStdin !== undefined) {
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return Option.None;
      const value = lines[stdinIndex++];
      return Option.Some(value);
    }
    if (isNodeRuntime()) {
      const stdin = (process as { stdin?: { isTTY?: boolean } }).stdin;
      if (stdin && stdin.isTTY !== true) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return Option.None;
        const value = lines[stdinIndex++];
        return Option.Some(value);
      }
      if (stdin?.isTTY) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        return await new Promise((resolve) => {
          rl.question('', (answer) => {
            rl.close();
            resolve(Option.Some(answer));
          });
        });
      }
    }
    if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
      const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
      return value == null ? Option.None : Option.Some(value);
    }
    return Option.None;
  },
  printJson: (value: unknown, pretty: boolean = true) => {
    // eslint-disable-next-line no-console -- runtime output
    console.log(toJsonString(value, pretty));
  },
};

export const str = {
  length: (value: string) => value.length,
  concat: (a: string, b: string) => a + b,
  substring: (value: string, start: number, end: number) => {
    const safeStart = Math.max(0, Math.trunc(start));
    const safeEnd = Math.max(safeStart, Math.trunc(end));
    return value.substring(safeStart, safeEnd);
  },
  split: (value: string, sep: string) => value.split(sep),
  trim: (value: string) => value.trim(),
  contains: (haystack: string, needle: string) => haystack.includes(needle),
  eq: (a: string, b: string) => a === b,
  char_at: (value: string, index: number) => {
    if (Number.isNaN(index) || index < 0 || index >= value.length) return Option.None;
    return Option.Some(value.charAt(index));
  },
  is_whitespace: (value: string) => value === ' ' || value === '\n' || value === '\t' || value === '\r',
  is_digit: (value: string) => {
    if (!value || value.length === 0) return false;
    const code = value.charCodeAt(0);
    return code >= 48 && code <= 57;
  },
  to_int: (value: string) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? Result.Err(`Invalid int: ${value}`) : Result.Ok(parsed);
  },
  to_float: (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? Result.Err(`Invalid float: ${value}`) : Result.Ok(parsed);
  },
  from_int: (value: number) => String(Math.trunc(value)),
  from_float: (value: number) => String(value),
};

export const math = {
  abs: (value: number) => Math.trunc(Math.abs(value)),
  min: (a: number, b: number) => Math.trunc(Math.min(a, b)),
  max: (a: number, b: number) => Math.trunc(Math.max(a, b)),
  absf: (value: number) => Math.abs(value),
  minf: (a: number, b: number) => Math.min(a, b),
  maxf: (a: number, b: number) => Math.max(a, b),
  sqrt: (value: number) => Math.sqrt(value),
  pow: (base: number, exp: number) => Math.pow(base, exp),
  floor: (value: number) => Math.floor(value),
  ceil: (value: number) => Math.ceil(value),
  round: (value: number) => Math.round(value),
  pi: Math.PI,
  e: Math.E,
};

export const fs = {
  readFile: async (path: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        const content = await fsPromises.readFile(path, 'utf8');
        return Result.Ok(content);
      }
      if (typeof fetch !== 'undefined') {
        const response = await fetch(path);
        if (!response.ok) {
          return Result.Err(`HTTP ${response.status}: ${response.statusText}`);
        }
        const content = await response.text();
        return Result.Ok(content);
      }
      return Result.Err('No file system available');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  writeFile: async (path: string, content: string) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import('node:fs/promises');
        await fsPromises.writeFile(path, content, 'utf8');
        return Result.Ok(undefined);
      }
      return Result.Err('writeFile not supported in browser');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
};

export const http = {
  fetch: async (request: unknown) => {
    if (typeof fetch !== 'function') {
      return Result.Err('Fetch API is not available');
    }
    if (!request || typeof request !== 'object') {
      return Result.Err('Invalid request');
    }
    const req = request as {
      url?: unknown;
      method?: unknown;
      headers?: unknown;
      body?: unknown;
    };
    const url = typeof req.url === 'string' ? req.url : '';
    if (!url) {
      return Result.Err('Invalid request url');
    }
    const method = typeof req.method === 'string' && req.method.length > 0 ? req.method : 'GET';
    const headerInput = unwrapOption(req.headers).value;
    const headers: Record<string, string> = {};
    if (Array.isArray(headerInput)) {
      for (const entry of headerInput) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [name, value] = entry;
          if (typeof name === 'string') {
            headers[name] = typeof value === 'string' ? value : String(value ?? '');
          }
          continue;
        }
        if (entry && typeof entry === 'object') {
          const name = (entry as { name?: unknown }).name;
          const value = (entry as { value?: unknown }).value;
          if (typeof name === 'string') {
            headers[name] = typeof value === 'string' ? value : String(value ?? '');
          }
        }
      }
    }
    const bodyValue = unwrapOption(req.body).value;
    const body = typeof bodyValue === 'string' ? bodyValue : bodyValue == null ? undefined : String(bodyValue);
    try {
      const response = await fetch(url, { method, headers, body });
      const text = await response.text();
      const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }));
      return Result.Ok({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text,
      });
    } catch (error) {
      return Result.Err(String(error));
    }
  },
};

export const list = {
  map: <A, B>(f: (value: A) => B, xs: A[]): B[] => xs.map(f),
  filter: <A>(pred: (value: A) => boolean, xs: A[]): A[] => xs.filter(pred),
  fold: <A, B>(f: (acc: B, value: A) => B, init: B, xs: A[]): B => xs.reduce((acc, val) => f(acc, val), init),
  reverse: <A>(xs: A[]): A[] => xs.slice().reverse(),
  length: <A>(xs: A[]): number => xs.length,
  append: <A>(xs: A[], ys: A[]): A[] => xs.concat(ys),
  take: <A>(n: number, xs: A[]): A[] => xs.slice(0, Math.max(0, n)),
  drop: <A>(n: number, xs: A[]): A[] => xs.slice(Math.max(0, n)),
  find: <A>(pred: (value: A) => boolean, xs: A[]) => {
    const found = xs.find(pred);
    return found === undefined ? Option.None : Option.Some(found);
  },
  any: <A>(pred: (value: A) => boolean, xs: A[]): boolean => xs.some(pred),
  all: <A>(pred: (value: A) => boolean, xs: A[]): boolean => xs.every(pred),
};

export class Vec<T> {
  private data: T[];

  constructor() {
    this.data = [];
  }

  static new<T>(): Vec<T> {
    return new Vec<T>();
  }

  push(value: T): void {
    this.data.push(value);
  }

  get(index: number) {
    if (!Number.isFinite(index)) return Option.None;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < this.data.length ? Option.Some(this.data[idx]) : Option.None;
  }

  len(): number {
    return this.data.length;
  }

  pop() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop() as T;
    return Option.Some(value);
  }

  clear(): void {
    this.data = [];
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
}

export const vec = {
  new: <T>() => Vec.new<T>(),
  push: <T>(v: Vec<T>, value: T) => v.push(value),
  get: <T>(v: Vec<T>, index: number) => v.get(index),
  len: <T>(v: Vec<T>) => v.len(),
  pop: <T>(v: Vec<T>) => v.pop(),
  clear: <T>(v: Vec<T>) => v.clear(),
};

export class LuminaPanic extends Error {
  value?: unknown;
  constructor(message: string, value?: unknown) {
    super(message);
    this.name = 'LuminaPanic';
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LuminaPanic);
    }
  }
}

export const Option = {
  Some: (value: unknown) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
  map: (fn: (value: unknown) => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  },
  and_then: (fn: (value: unknown) => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return fn(getEnumPayload(opt));
    return Option.None;
  },
  or_else: (fallback: () => unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return opt;
    return fallback();
  },
  unwrap_or: (fallback: unknown, opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return getEnumPayload(opt);
    return fallback;
  },
  is_some: (opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    return tag === 'Some';
  },
  is_none: (opt: unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    return tag !== 'Some';
  },
  unwrap: (opt: unknown, message?: string) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return getEnumPayload(opt);
    const rendered = formatValue(opt);
    const msg = message ?? `Tried to unwrap None: ${rendered}`;
    const err = new LuminaPanic(msg, opt);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, Option.unwrap);
    }
    throw err;
  },
};

export const Result = {
  Ok: (value: unknown) => ({ $tag: 'Ok', $payload: value }),
  Err: (error: unknown) => ({ $tag: 'Err', $payload: error }),
  map: (fn: (value: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res)));
    return res;
  },
  and_then: (fn: (value: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return fn(getEnumPayload(res));
    return res;
  },
  or_else: (fn: (error: unknown) => unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return res;
    return fn(getEnumPayload(res));
  },
  unwrap_or: (fallback: unknown, res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return getEnumPayload(res);
    return fallback;
  },
  is_ok: (res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    return tag === 'Ok';
  },
  is_err: (res: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    return tag !== 'Ok';
  },
};

export function __set(obj: Record<string, unknown>, prop: string, value: unknown) {
  obj[prop] = value;
  return value;
}
