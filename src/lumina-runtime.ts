import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { spawnSync } from 'node:child_process';

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
  typeof (globalThis as { process?: unknown }).process !== 'undefined' &&
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';

const getNodeProcess = (): NodeJS.Process | null => {
  const candidate = (globalThis as { process?: NodeJS.Process }).process;
  return candidate ?? null;
};

const blockedHttpHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

const isPrivateIpv4Host = (host: string): boolean => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
};

const validateHttpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol '${parsed.protocol}'. Only http and https are allowed.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (blockedHttpHosts.has(host)) {
    throw new Error(`Blocked host '${host}' for security reasons.`);
  }
  if (isPrivateIpv4Host(host)) {
    throw new Error(`Blocked private IP address: ${host}`);
  }
  return parsed.toString();
};

type RuntimeTraitName = 'Hash' | 'Eq' | 'Ord';

const runtimeTraitImpls = {
  Hash: new Map<string, (self: unknown) => unknown>(),
  Eq: new Map<string, (self: unknown, other: unknown) => boolean>(),
  Ord: new Map<string, (self: unknown, other: unknown) => unknown>(),
} as const;

const normalizeTraitTypeName = (typeName: string): string => {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf('<');
  return idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
};

const getRuntimeTypeTag = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as { __lumina_type?: unknown }).__lumina_type;
  return typeof candidate === 'string' ? candidate : null;
};

export const __lumina_register_trait_impl = (
  traitName: RuntimeTraitName,
  forType: string,
  impl: ((...args: unknown[]) => unknown) | unknown
): void => {
  const targetType = normalizeTraitTypeName(forType);
  if (!targetType) return;
  if (traitName === 'Hash' && typeof impl === 'function') {
    runtimeTraitImpls.Hash.set(targetType, impl as (self: unknown) => unknown);
    return;
  }
  if (traitName === 'Eq' && typeof impl === 'function') {
    runtimeTraitImpls.Eq.set(targetType, impl as (self: unknown, other: unknown) => boolean);
    return;
  }
  if (traitName === 'Ord' && typeof impl === 'function') {
    runtimeTraitImpls.Ord.set(targetType, impl as (self: unknown, other: unknown) => unknown);
  }
};

const supportsColor = (): boolean => {
  if (typeof window !== 'undefined') return false;
  if (!isNodeRuntime()) return false;
  const stdout = getNodeProcess()?.stdout;
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

export const __lumina_stringify = (value: unknown): string => formatValue(value, { color: false });

export const __lumina_range = (
  start: unknown,
  end: unknown,
  inclusive: boolean,
  hasStart: boolean,
  hasEnd: boolean
): { start: number | null; end: number | null; inclusive: boolean } => {
  const startValue = hasStart ? Number(start) : null;
  const endValue = hasEnd ? Number(end) : null;
  return { start: startValue, end: endValue, inclusive: !!inclusive };
};

export const __lumina_slice = (
  str: string,
  start: number | undefined,
  end: number | undefined,
  inclusive: boolean
): string => {
  const actualStart = start ?? 0;
  const actualEnd = end ?? str.length;
  const finalEnd = inclusive ? actualEnd + 1 : actualEnd;

  if (actualStart < 0 || actualStart > str.length) {
    throw new Error(`String slice start index ${actualStart} out of bounds`);
  }
  if (finalEnd < 0 || finalEnd > str.length) {
    throw new Error(`String slice end index ${finalEnd} out of bounds`);
  }

  return str.substring(actualStart, finalEnd);
};

const isRangeValue = (
  value: unknown
): value is { start: number | null; end: number | null; inclusive: boolean } =>
  !!value && typeof value === 'object' && 'start' in value && 'end' in value && 'inclusive' in value;

const clampIndex = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const __lumina_index = (target: unknown, index: unknown): unknown => {
  if (typeof target === 'string' && isRangeValue(index)) {
    const length = target.length;
    const start = index.start == null ? 0 : clampIndex(Math.trunc(index.start), 0, length);
    const endBase = index.end == null ? length : clampIndex(Math.trunc(index.end), 0, length);
    return __lumina_slice(target, start, endBase, index.inclusive);
  }

  if (target && typeof (target as { get?: (idx: number) => unknown }).get === 'function') {
    const result = (target as { get: (idx: number) => unknown }).get(Math.trunc(Number(index)));
    const tag = result && typeof result === 'object' && isEnumLike(result) ? getEnumTag(result) : '';
    if (tag === 'Some') return getEnumPayload(result);
    const err = new LuminaPanic('Index out of bounds', result);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, __lumina_index);
    }
    throw err;
  }

  if (Array.isArray(target)) {
    return target[Math.trunc(Number(index))];
  }

  if (target && typeof target === 'object') {
    return (target as Record<string, unknown>)[String(index)];
  }

  return undefined;
};

export const __lumina_struct = <T extends Record<string, unknown>>(typeName: string, fields: T): T => {
  try {
    Object.defineProperty(fields, '__lumina_type', {
      value: normalizeTraitTypeName(typeName),
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } catch {
    (fields as Record<string, unknown>).__lumina_type = normalizeTraitTypeName(typeName);
  }
  return fields;
};

const normalizeRuntimeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
  if (Array.isArray(value)) return value.map((item) => normalizeRuntimeValue(item));
  if (typeof value === 'object') {
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return { $enum: tag, value: normalizeRuntimeValue(payload) };
    }
    const typeTag = getRuntimeTypeTag(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    if (typeTag) out.__lumina_type = typeTag;
    for (const key of keys) {
      out[key] = normalizeRuntimeValue(obj[key]);
    }
    return out;
  }
  return String(value);
};

const stableRuntimeHash = (value: unknown): string => JSON.stringify(normalizeRuntimeValue(value));

const deepRuntimeEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepRuntimeEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aTag = getRuntimeTypeTag(a);
  const bTag = getRuntimeTypeTag(b);
  if (aTag !== bTag) return false;
  if (isEnumLike(a) || isEnumLike(b)) {
    if (!isEnumLike(a) || !isEnumLike(b)) return false;
    if (getEnumTag(a) !== getEnumTag(b)) return false;
    return deepRuntimeEqual(getEnumPayload(a), getEnumPayload(b));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  aKeys.sort();
  bKeys.sort();
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const key of aKeys) {
    if (!deepRuntimeEqual(aObj[key], bObj[key])) return false;
  }
  return true;
};

const runtimeHashValue = (value: unknown): string => {
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    const hashImpl = runtimeTraitImpls.Hash.get(typeTag);
    if (hashImpl) {
      try {
        return `${typeTag}:${String(hashImpl(value))}`;
      } catch {
        return `${typeTag}:${stableRuntimeHash(value)}`;
      }
    }
  }
  return stableRuntimeHash(value);
};

const runtimeEquals = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const eqImpl = runtimeTraitImpls.Eq.get(leftTag);
    if (eqImpl) {
      try {
        return !!eqImpl(left, right);
      } catch {
        return false;
      }
    }
  }
  return deepRuntimeEqual(left, right);
};

const cloneFallback = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneFallback(entry));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = cloneFallback(entry);
  }
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    try {
      Object.defineProperty(out, '__lumina_type', {
        value: typeTag,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    } catch {
      out.__lumina_type = typeTag;
    }
  }
  return out;
};

export const __lumina_clone = <T>(value: T): T => {
  const cloneFn = (globalThis as { structuredClone?: <U>(entry: U) => U }).structuredClone;
  if (typeof cloneFn === 'function') {
    try {
      return cloneFn(value);
    } catch {
      // fallback below
    }
  }
  return cloneFallback(value) as T;
};

export const __lumina_debug = (value: unknown): string => formatValue(value, { color: false });
export const __lumina_eq = (left: unknown, right: unknown): boolean => runtimeEquals(left, right);

const orderingToNumber = (value: unknown): number => {
  if (typeof value === 'number') return value < 0 ? -1 : value > 0 ? 1 : 0;
  if (typeof value === 'bigint') return value < 0n ? -1 : value > 0n ? 1 : 0;
  if (typeof value === 'string') {
    const text = value.toLowerCase();
    if (text === 'less') return -1;
    if (text === 'equal') return 0;
    if (text === 'greater') return 1;
  }
  if (isEnumLike(value)) {
    const tag = getEnumTag(value).toLowerCase();
    if (tag === 'less') return -1;
    if (tag === 'equal') return 0;
    if (tag === 'greater') return 1;
  }
  return 0;
};

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
    const stdout = getNodeProcess()?.stdout;
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
    const stderr = getNodeProcess()?.stderr;
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
    const stdin = getNodeProcess()?.stdin;
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
      const nodeProcess = getNodeProcess();
      const stdin = nodeProcess?.stdin;
      if (stdin && stdin.isTTY !== true) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return Option.None;
        const value = lines[stdinIndex++];
        return Option.Some(value);
      }
      if (stdin?.isTTY) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: nodeProcess?.stdin,
          output: nodeProcess?.stdout,
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
  slice: (
    value: string,
    range: { start: number | null; end: number | null; inclusive: boolean }
  ) => {
    const start = range?.start ?? undefined;
    const end = range?.end ?? undefined;
    return __lumina_slice(value, start ?? undefined, end ?? undefined, !!range?.inclusive);
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
  readDir: async (path: string) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err('readDir is not supported in browser');
      }
      const fsPromises = await import('node:fs/promises');
      const entries = await fsPromises.readdir(path);
      return Result.Ok(entries);
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  metadata: async (path: string) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err('metadata is not supported in browser');
      }
      const fsPromises = await import('node:fs/promises');
      const stats = await fsPromises.stat(path);
      return Result.Ok({
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: Math.trunc(stats.size),
        modifiedMs: Math.trunc(stats.mtimeMs),
      });
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  exists: async (path: string) => {
    try {
      if (!isNodeRuntime()) return false;
      const fsPromises = await import('node:fs/promises');
      await fsPromises.access(path);
      return true;
    } catch {
      return false;
    }
  },
  mkdir: async (path: string, recursive: boolean = true) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err('mkdir is not supported in browser');
      }
      const fsPromises = await import('node:fs/promises');
      await fsPromises.mkdir(path, { recursive: !!recursive });
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  removeFile: async (path: string) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err('removeFile is not supported in browser');
      }
      const fsPromises = await import('node:fs/promises');
      await fsPromises.unlink(path);
      return Result.Ok(undefined);
    } catch (error) {
      return Result.Err(String(error));
    }
  },
};

export const path = {
  join: (left: string, right: string): string => nodePath.join(String(left), String(right)),
  is_absolute: (value: string): boolean => nodePath.isAbsolute(String(value)),
  extension: (value: string) => {
    const ext = nodePath.extname(String(value));
    if (!ext) return Option.None;
    return Option.Some(ext.startsWith('.') ? ext.slice(1) : ext);
  },
  dirname: (value: string): string => nodePath.dirname(String(value)),
  basename: (value: string): string => nodePath.basename(String(value)),
  normalize: (value: string): string => nodePath.normalize(String(value)),
};

export const env = {
  var: (name: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    const value = nodeProcess.env?.[String(name)];
    if (value === undefined) {
      return Result.Err(`Environment variable '${name}' is not set`);
    }
    return Result.Ok(String(value));
  },
  set_var: (name: string, value: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    nodeProcess.env[String(name)] = String(value);
    return Result.Ok(undefined);
  },
  remove_var: (name: string) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Environment variables are not available in this runtime');
    }
    delete nodeProcess.env[String(name)];
    return Result.Ok(undefined);
  },
  args: (): string[] => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return [];
    return nodeProcess.argv.slice(2);
  },
  cwd: () => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err('Current working directory is not available in this runtime');
    }
    return Result.Ok(nodeProcess.cwd());
  },
};

export const process = {
  spawn: (command: string, args: unknown = []) => {
    if (!isNodeRuntime()) {
      return Result.Err('Process spawning is not available in this runtime');
    }
    const commandText = String(command).trim();
    if (!commandText) {
      return Result.Err('Process command must be a non-empty string');
    }
    const argv = toIterableValues(args).map((part) => String(part));
    try {
      const output = spawnSync(commandText, argv, {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      });
      if (output.error) {
        return Result.Err(output.error.message || String(output.error));
      }
      return Result.Ok({
        status: typeof output.status === 'number' ? Math.trunc(output.status) : -1,
        success: output.status === 0,
        stdout: typeof output.stdout === 'string' ? output.stdout : String(output.stdout ?? ''),
        stderr: typeof output.stderr === 'string' ? output.stderr : String(output.stderr ?? ''),
      });
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  exit: (code: number = 0) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return;
    nodeProcess.exit(Math.trunc(code));
  },
  cwd: (): string => {
    const nodeProcess = getNodeProcess();
    return nodeProcess ? nodeProcess.cwd() : '';
  },
  pid: (): number => {
    const nodeProcess = getNodeProcess();
    return nodeProcess ? Math.trunc(nodeProcess.pid) : -1;
  },
};

export const json = {
  to_string: (value: unknown) => {
    try {
      return Result.Ok(JSON.stringify(value));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  to_pretty_string: (value: unknown) => {
    try {
      return Result.Ok(toJsonString(value, true));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  from_string: (source: string) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  },
  parse: (source: string) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
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
    const rawUrl = typeof req.url === 'string' ? req.url : '';
    if (!rawUrl) {
      return Result.Err('Invalid request url');
    }
    let url: string;
    try {
      url = validateHttpUrl(rawUrl);
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
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
  get: async (url: string) =>
    await http.fetch({
      url,
      method: 'GET',
      headers: Option.None,
      body: Option.None,
    }),
  post: async (url: string, body?: unknown) =>
    await http.fetch({
      url,
      method: 'POST',
      headers: Option.None,
      body: body === undefined ? Option.None : Option.Some(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  put: async (url: string, body?: unknown) =>
    await http.fetch({
      url,
      method: 'PUT',
      headers: Option.None,
      body: body === undefined ? Option.None : Option.Some(typeof body === 'string' ? body : JSON.stringify(body)),
    }),
  del: async (url: string) =>
    await http.fetch({
      url,
      method: 'DELETE',
      headers: Option.None,
      body: Option.None,
    }),
};

const getMonotonicNow = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
};

export const time = {
  nowMs: () => Math.trunc(Date.now()),
  nowIso: () => new Date().toISOString(),
  instantNow: () => Math.trunc(getMonotonicNow()),
  elapsedMs: (since: number) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)),
  sleep: async (ms: number) =>
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, Math.trunc(ms)));
    }),
};

const toIterableValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const iteratorFn = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iteratorFn === 'function') {
      return Array.from(value as Iterable<unknown>);
    }
  }
  return [];
};

const compileRegex = (pattern: string, flags: string = ''): RegExp | null => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
};

export const regex = {
  isValid: (pattern: string, flags: string = ''): boolean => compileRegex(pattern, flags) !== null,
  test: (pattern: string, text: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(re.test(text));
  },
  find: (pattern: string, text: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Option.None;
    const match = text.match(re);
    if (!match) return Option.None;
    return Option.Some(match[0]);
  },
  findAll: (pattern: string, text: string, flags: string = '') => {
    const normalizedFlags = flags.includes('g') ? flags : `${flags}g`;
    const re = compileRegex(pattern, normalizedFlags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${normalizedFlags}`);
    const matches = Array.from(text.matchAll(re)).map((m) => m[0]);
    return Result.Ok(matches);
  },
  replace: (pattern: string, text: string, replacement: string, flags: string = '') => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(text.replace(re, replacement));
  },
};

const toHex = (bytes: Uint8Array): string => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const getWebCrypto = async (): Promise<Crypto | null> => {
  if (globalThis.crypto && typeof globalThis.crypto.subtle !== 'undefined') {
    return globalThis.crypto;
  }
  if (!isNodeRuntime()) return null;
  try {
    const nodeCrypto = await import('node:crypto');
    return (nodeCrypto as { webcrypto?: Crypto }).webcrypto ?? null;
  } catch {
    return null;
  }
};

const utf8Encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const utf8Decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const deriveAesKey = async (web: Crypto, key: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> => {
  const digest = await web.subtle.digest('SHA-256', utf8Encode(key));
  return await web.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [usage]);
};

export const crypto = {
  isAvailable: async () => (await getWebCrypto()) !== null,
  sha256: async (value: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const digest = await web.subtle.digest('SHA-256', utf8Encode(value));
      return Result.Ok(toHex(new Uint8Array(digest)));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  hmacSha256: async (key: string, value: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const cryptoKey = await web.subtle.importKey(
        'raw',
        utf8Encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await web.subtle.sign('HMAC', cryptoKey, utf8Encode(value));
      return Result.Ok(toHex(new Uint8Array(signature)));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  randomBytes: async (length: number) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const n = Math.max(0, Math.trunc(length));
      const bytes = new Uint8Array(n);
      web.getRandomValues(bytes);
      return Result.Ok(Array.from(bytes).map((b) => b | 0));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  randomInt: async (min: number, max: number) => {
    const lower = Math.trunc(Math.min(min, max));
    const upper = Math.trunc(Math.max(min, max));
    const span = upper - lower + 1;
    if (span <= 0) return Result.Err('Invalid range');
    const random = await crypto.randomBytes(4);
    if (!isEnumLike(random) || getEnumTag(random) !== 'Ok') return random;
    const bytes = getEnumPayload(random);
    if (!Array.isArray(bytes) || bytes.length < 4) return Result.Err('Failed to generate randomness');
    const packed = new Uint8Array([
      bytes[0] as number,
      bytes[1] as number,
      bytes[2] as number,
      bytes[3] as number,
    ]);
    const value = new DataView(packed.buffer).getUint32(0, false);
    return Result.Ok(lower + (value % span));
  },
  aesGcmEncrypt: async (key: string, plaintext: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const aesKey = await deriveAesKey(web, key, 'encrypt');
      const iv = new Uint8Array(12);
      web.getRandomValues(iv);
      const encrypted = await web.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, utf8Encode(plaintext));
      const cipherBytes = new Uint8Array(encrypted);
      const packed = new Uint8Array(iv.length + cipherBytes.length);
      packed.set(iv, 0);
      packed.set(cipherBytes, iv.length);
      return Result.Ok(toBase64(packed));
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  aesGcmDecrypt: async (key: string, payloadBase64: string) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err('Crypto API is not available');
      const packed = fromBase64(payloadBase64);
      if (packed.length < 13) return Result.Err('Invalid AES payload');
      const iv = packed.slice(0, 12);
      const cipher = packed.slice(12);
      const aesKey = await deriveAesKey(web, key, 'decrypt');
      const plain = await web.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
      return Result.Ok(utf8Decode(new Uint8Array(plain)));
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

  static from<T>(items: T[]): Vec<T> {
    const next = new Vec<T>();
    next.data = Array.isArray(items) ? [...items] : [];
    return next;
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

  map<U>(mapper: (value: T) => U): Vec<U> {
    const out = Vec.new<U>();
    for (const item of this.data) {
      out.push(mapper(item));
    }
    return out;
  }

  filter(predicate: (value: T) => boolean): Vec<T> {
    const out = Vec.new<T>();
    for (const item of this.data) {
      if (predicate(item)) out.push(item);
    }
    return out;
  }

  fold<U>(init: U, folder: (acc: U, value: T) => U): U {
    let acc = init;
    for (const item of this.data) {
      acc = folder(acc, item);
    }
    return acc;
  }

  for_each(action: (value: T) => void): void {
    for (const item of this.data) {
      action(item);
    }
  }

  any(predicate: (value: T) => boolean): boolean {
    return this.data.some(predicate);
  }

  all(predicate: (value: T) => boolean): boolean {
    return this.data.every(predicate);
  }

  find(predicate: (value: T) => boolean) {
    const found = this.data.find(predicate);
    return found === undefined ? Option.None : Option.Some(found);
  }

  position(predicate: (value: T) => boolean) {
    const idx = this.data.findIndex(predicate);
    return idx >= 0 ? Option.Some(idx) : Option.None;
  }

  take(n: number): Vec<T> {
    const out = Vec.new<T>();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = 0; i < Math.min(count, this.data.length); i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }

  skip(n: number): Vec<T> {
    const out = Vec.new<T>();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = Math.min(count, this.data.length); i < this.data.length; i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }

  zip<U>(other: Vec<U>): Vec<[T, U]> {
    const out = Vec.new<[T, U]>();
    const size = Math.min(this.data.length, other.data.length);
    for (let i = 0; i < size; i += 1) {
      out.push([this.data[i], other.data[i]]);
    }
    return out;
  }

  enumerate(): Vec<[number, T]> {
    const out = Vec.new<[number, T]>();
    for (let i = 0; i < this.data.length; i += 1) {
      out.push([i, this.data[i]]);
    }
    return out;
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
}

export const timeout = async (ms: number): Promise<void> => {
  await time.sleep(ms);
};

export const join_all = async <T>(values: unknown): Promise<Vec<T>> => {
  const resolved = await Promise.all(toIterableValues(values).map((item) => Promise.resolve(item)));
  return Vec.from(resolved as T[]);
};

export const vec = {
  new: <T>() => Vec.new<T>(),
  from: <T>(items: T[]) => Vec.from(items),
  push: <T>(v: Vec<T>, value: T) => v.push(value),
  get: <T>(v: Vec<T>, index: number) => v.get(index),
  len: <T>(v: Vec<T>) => v.len(),
  pop: <T>(v: Vec<T>) => v.pop(),
  clear: <T>(v: Vec<T>) => v.clear(),
  map: <T, U>(v: Vec<T>, f: (value: T) => U) => v.map(f),
  filter: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.filter(pred),
  fold: <T, U>(v: Vec<T>, init: U, f: (acc: U, value: T) => U) => v.fold(init, f),
  for_each: <T>(v: Vec<T>, f: (value: T) => void) => v.for_each(f),
  any: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.any(pred),
  all: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.all(pred),
  find: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.find(pred),
  position: <T>(v: Vec<T>, pred: (value: T) => boolean) => v.position(pred),
  take: <T>(v: Vec<T>, n: number) => v.take(n),
  skip: <T>(v: Vec<T>, n: number) => v.skip(n),
  zip: <T, U>(v: Vec<T>, other: Vec<U>) => v.zip(other),
  enumerate: <T>(v: Vec<T>) => v.enumerate(),
};

export class HashMap<K, V> {
  private buckets: Map<string, Array<{ key: K; value: V }>>;
  private sizeValue: number;

  constructor() {
    this.buckets = new Map();
    this.sizeValue = 0;
  }

  static new<K, V>(): HashMap<K, V> {
    return new HashMap<K, V>();
  }

  private getBucket(key: K): Array<{ key: K; value: V }> {
    const hash = runtimeHashValue(key);
    const existing = this.buckets.get(hash);
    if (existing) return existing;
    const next: Array<{ key: K; value: V }> = [];
    this.buckets.set(hash, next);
    return next;
  }

  private lookupBucket(key: K): Array<{ key: K; value: V }> | null {
    const hash = runtimeHashValue(key);
    return this.buckets.get(hash) ?? null;
  }

  insert(key: K, value: V) {
    const bucket = this.getBucket(key);
    for (let i = 0; i < bucket.length; i += 1) {
      const current = bucket[i];
      if (runtimeEquals(current.key, key)) {
        const old = current.value;
        current.value = value;
        return Option.Some(old);
      }
    }
    bucket.push({ key, value });
    this.sizeValue += 1;
    return Option.None;
  }

  get(key: K) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return Option.None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) {
        return Option.Some(entry.value);
      }
    }
    return Option.None;
  }

  remove(key: K) {
    const hash = runtimeHashValue(key);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option.None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option.Some(removed.value);
      }
    }
    return Option.None;
  }

  contains_key(key: K): boolean {
    const bucket = this.lookupBucket(key);
    if (!bucket) return false;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) return true;
    }
    return false;
  }

  len(): number {
    return this.sizeValue;
  }

  clear(): void {
    this.buckets.clear();
    this.sizeValue = 0;
  }

  keys(): Vec<K> {
    const v = Vec.new<K>();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.key);
      }
    }
    return v;
  }

  values(): Vec<V> {
    const v = Vec.new<V>();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.value);
      }
    }
    return v;
  }
}

export const hashmap = {
  new: <K, V>() => HashMap.new<K, V>(),
  insert: <K, V>(m: HashMap<K, V>, k: K, v: V) => m.insert(k, v),
  get: <K, V>(m: HashMap<K, V>, k: K) => m.get(k),
  remove: <K, V>(m: HashMap<K, V>, k: K) => m.remove(k),
  contains_key: <K, V>(m: HashMap<K, V>, k: K) => m.contains_key(k),
  len: <K, V>(m: HashMap<K, V>) => m.len(),
  clear: <K, V>(m: HashMap<K, V>) => m.clear(),
  keys: <K, V>(m: HashMap<K, V>) => m.keys(),
  values: <K, V>(m: HashMap<K, V>) => m.values(),
};

export class HashSet<T> {
  private map: HashMap<T, undefined>;

  constructor() {
    this.map = HashMap.new<T, undefined>();
  }

  static new<T>(): HashSet<T> {
    return new HashSet<T>();
  }

  insert(value: T): boolean {
    const result = this.map.insert(value, undefined);
    return result === Option.None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    const result = this.map.remove(value);
    return result !== Option.None;
  }

  len(): number {
    return this.map.len();
  }

  clear(): void {
    this.map.clear();
  }

  values(): Vec<T> {
    return this.map.keys();
  }
}

export const hashset = {
  new: <T>() => HashSet.new<T>(),
  insert: <T>(s: HashSet<T>, v: T) => s.insert(v),
  contains: <T>(s: HashSet<T>, v: T) => s.contains(v),
  remove: <T>(s: HashSet<T>, v: T) => s.remove(v),
  len: <T>(s: HashSet<T>) => s.len(),
  clear: <T>(s: HashSet<T>) => s.clear(),
  values: <T>(s: HashSet<T>) => s.values(),
};

export class Deque<T> {
  private data: T[];

  constructor() {
    this.data = [];
  }

  static new<T>(): Deque<T> {
    return new Deque<T>();
  }

  push_front(value: T): void {
    this.data.unshift(value);
  }

  push_back(value: T): void {
    this.data.push(value);
  }

  pop_front() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.shift() as T;
    return Option.Some(value);
  }

  pop_back() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop() as T;
    return Option.Some(value);
  }

  len(): number {
    return this.data.length;
  }

  clear(): void {
    this.data = [];
  }
}

export const deque = {
  new: <T>() => Deque.new<T>(),
  push_front: <T>(d: Deque<T>, value: T) => d.push_front(value),
  push_back: <T>(d: Deque<T>, value: T) => d.push_back(value),
  pop_front: <T>(d: Deque<T>) => d.pop_front(),
  pop_back: <T>(d: Deque<T>) => d.pop_back(),
  len: <T>(d: Deque<T>) => d.len(),
  clear: <T>(d: Deque<T>) => d.clear(),
};

const compareBTreeKeys = (left: unknown, right: unknown): number => {
  if (left === right) return 0;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const ordImpl = runtimeTraitImpls.Ord.get(leftTag);
    if (ordImpl) {
      try {
        return orderingToNumber(ordImpl(left, right));
      } catch {
        // fall through to default compare
      }
    }
  }
  if (left == null && right != null) return -1;
  if (left != null && right == null) return 1;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType === rightType && (leftType === 'number' || leftType === 'bigint' || leftType === 'string' || leftType === 'boolean')) {
    return left < right ? -1 : 1;
  }
  const leftText = formatValue(left, { color: false });
  const rightText = formatValue(right, { color: false });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
};

type BTreeEntry<K, V> = { key: K; value: V };

export class BTreeMap<K, V> {
  private entries: Array<BTreeEntry<K, V>>;

  constructor() {
    this.entries = [];
  }

  static new<K, V>(): BTreeMap<K, V> {
    return new BTreeMap<K, V>();
  }

  private lowerBound(key: K): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareBTreeKeys(this.entries[mid].key, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  insert(key: K, value: V) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const previous = this.entries[idx].value;
      this.entries[idx].value = value;
      return Option.Some(previous);
    }
    this.entries.splice(idx, 0, { key, value });
    return Option.None;
  }

  get(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      return Option.Some(this.entries[idx].value);
    }
    return Option.None;
  }

  remove(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const [removed] = this.entries.splice(idx, 1);
      return Option.Some(removed.value);
    }
    return Option.None;
  }

  contains_key(key: K): boolean {
    const idx = this.lowerBound(key);
    return idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0;
  }

  len(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  keys(): Vec<K> {
    const out = Vec.new<K>();
    for (const entry of this.entries) out.push(entry.key);
    return out;
  }

  values(): Vec<V> {
    const out = Vec.new<V>();
    for (const entry of this.entries) out.push(entry.value);
    return out;
  }

  entries_vec(): Vec<[K, V]> {
    const out = Vec.new<[K, V]>();
    for (const entry of this.entries) out.push([entry.key, entry.value]);
    return out;
  }
}

export const btreemap = {
  new: <K, V>() => BTreeMap.new<K, V>(),
  insert: <K, V>(m: BTreeMap<K, V>, k: K, v: V) => m.insert(k, v),
  get: <K, V>(m: BTreeMap<K, V>, k: K) => m.get(k),
  remove: <K, V>(m: BTreeMap<K, V>, k: K) => m.remove(k),
  contains_key: <K, V>(m: BTreeMap<K, V>, k: K) => m.contains_key(k),
  len: <K, V>(m: BTreeMap<K, V>) => m.len(),
  clear: <K, V>(m: BTreeMap<K, V>) => m.clear(),
  keys: <K, V>(m: BTreeMap<K, V>) => m.keys(),
  values: <K, V>(m: BTreeMap<K, V>) => m.values(),
  entries: <K, V>(m: BTreeMap<K, V>) => m.entries_vec(),
};

export class BTreeSet<T> {
  private map: BTreeMap<T, undefined>;

  constructor() {
    this.map = BTreeMap.new<T, undefined>();
  }

  static new<T>(): BTreeSet<T> {
    return new BTreeSet<T>();
  }

  insert(value: T): boolean {
    const old = this.map.insert(value, undefined);
    return old === Option.None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    return this.map.remove(value) !== Option.None;
  }

  len(): number {
    return this.map.len();
  }

  clear(): void {
    this.map.clear();
  }

  values(): Vec<T> {
    return this.map.keys();
  }
}

export const btreeset = {
  new: <T>() => BTreeSet.new<T>(),
  insert: <T>(s: BTreeSet<T>, v: T) => s.insert(v),
  contains: <T>(s: BTreeSet<T>, v: T) => s.contains(v),
  remove: <T>(s: BTreeSet<T>, v: T) => s.remove(v),
  len: <T>(s: BTreeSet<T>) => s.len(),
  clear: <T>(s: BTreeSet<T>) => s.clear(),
  values: <T>(s: BTreeSet<T>) => s.values(),
};

export class PriorityQueue<T> {
  private heap: T[];

  constructor() {
    this.heap = [];
  }

  static new<T>(): PriorityQueue<T> {
    return new PriorityQueue<T>();
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (compareBTreeKeys(this.heap[parent], this.heap[idx]) <= 0) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }

  private bubbleDown(index: number): void {
    let idx = index;
    const size = this.heap.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < size && compareBTreeKeys(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && compareBTreeKeys(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      this.swap(idx, smallest);
      idx = smallest;
    }
  }

  push(value: T): void {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return Option.None;
    const head = this.heap[0];
    const last = this.heap.pop() as T;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return Option.Some(head);
  }

  peek() {
    if (this.heap.length === 0) return Option.None;
    return Option.Some(this.heap[0]);
  }

  len(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
  }
}

export const priority_queue = {
  new: <T>() => PriorityQueue.new<T>(),
  push: <T>(q: PriorityQueue<T>, value: T) => q.push(value),
  pop: <T>(q: PriorityQueue<T>) => q.pop(),
  peek: <T>(q: PriorityQueue<T>) => q.peek(),
  len: <T>(q: PriorityQueue<T>) => q.len(),
  clear: <T>(q: PriorityQueue<T>) => q.clear(),
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

type ChannelMessage =
  | { __lumina_channel_value: unknown }
  | { __lumina_channel_close: true }
  | { __lumina_channel_ack: number };

const isChannelValue = (value: unknown): value is { __lumina_channel_value: unknown } =>
  !!value && typeof value === 'object' && '__lumina_channel_value' in value;

const isChannelClose = (value: unknown): value is { __lumina_channel_close: true } =>
  !!value && typeof value === 'object' && (value as { __lumina_channel_close?: unknown }).__lumina_channel_close === true;

const isChannelAck = (value: unknown): value is { __lumina_channel_ack: number } =>
  !!value && typeof value === 'object' && typeof (value as { __lumina_channel_ack?: unknown }).__lumina_channel_ack === 'number';

const resolveMessageChannel = (): typeof MessageChannel | null => {
  if (typeof MessageChannel === 'function') return MessageChannel;
  return null;
};

interface SenderSharedState {
  port: MessagePort;
  credits: number | null;
  refs: number;
  closed: boolean;
  receiverClosed: boolean;
  pending: Array<{ value: unknown; resolve: (ok: boolean) => void }>;
  flushing: boolean;
}

const createSenderSharedState = (port: MessagePort, capacity: number | null): SenderSharedState => {
  const state: SenderSharedState = {
    port,
    credits: capacity,
    refs: 1,
    closed: false,
    receiverClosed: false,
    pending: [],
    flushing: false,
  };
  return state;
};

const senderPostNow = (state: SenderSharedState, value: unknown): boolean => {
  if (state.closed || state.receiverClosed) return false;
  if (state.credits !== null && state.credits <= 0) return false;
  if (state.credits !== null) {
    state.credits -= 1;
  }
  const payload: ChannelMessage = { __lumina_channel_value: value };
  try {
    state.port.postMessage(payload);
    return true;
  } catch {
    state.closed = true;
    return false;
  }
};

const drainPendingSends = (state: SenderSharedState): void => {
  if (state.flushing) return;
  state.flushing = true;
  try {
    while (state.pending.length > 0) {
      if (state.closed || state.receiverClosed) {
        while (state.pending.length > 0) {
          const item = state.pending.shift();
          if (item) item.resolve(false);
        }
        return;
      }
      if (state.credits !== null && state.credits <= 0) {
        return;
      }
      const next = state.pending.shift();
      if (!next) return;
      next.resolve(senderPostNow(state, next.value));
    }
  } finally {
    state.flushing = false;
  }
};

export class Sender<T> {
  private closedLocal = false;

  constructor(private readonly shared: SenderSharedState) {}

  static create<T>(port: MessagePort, capacity: number | null): Sender<T> {
    const shared = createSenderSharedState(port, capacity);
    const sender = new Sender<T>(shared);
    shared.port.start?.();
    shared.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        shared.receiverClosed = true;
        shared.closed = true;
        drainPendingSends(shared);
        return;
      }
      if (isChannelAck(data) && shared.credits !== null) {
        shared.credits += data.__lumina_channel_ack;
        drainPendingSends(shared);
      }
    };
    return sender;
  }

  clone(): Sender<T> {
    const clone = new Sender<T>(this.shared);
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      clone.closedLocal = true;
      return clone;
    }
    this.shared.refs += 1;
    return clone;
  }

  private sendFailureReason(): string {
    if (this.shared.receiverClosed) return 'receiver closed';
    if (this.closedLocal || this.shared.closed) return 'sender closed';
    if (this.shared.credits !== null && this.shared.credits <= 0) return 'channel full';
    return 'send failed';
  }

  send(value: T): Promise<boolean> {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    if (senderPostNow(this.shared, value)) {
      return Promise.resolve(true);
    }
    if (this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.shared.pending.push({ value, resolve });
      drainPendingSends(this.shared);
    });
  }

  try_send(value: T): boolean {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) return false;
    return senderPostNow(this.shared, value);
  }

  send_result(value: T): { $tag: string; $payload?: unknown } {
    if (this.try_send(value)) return Result.Ok(undefined);
    return Result.Err(this.sendFailureReason());
  }

  async send_async_result(value: T): Promise<{ $tag: string; $payload?: unknown }> {
    const ok = await this.send(value);
    if (ok) return Result.Ok(undefined);
    return Result.Err(this.sendFailureReason());
  }

  is_closed(): boolean {
    return this.closedLocal || this.shared.closed || this.shared.receiverClosed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closedLocal) return;
    this.closedLocal = true;
    if (this.shared.refs > 0) this.shared.refs -= 1;
    if (this.shared.refs > 0) return;

    const shouldSendClose = !this.shared.closed;
    this.shared.closed = true;
    while (this.shared.pending.length > 0) {
      const item = this.shared.pending.shift();
      if (item) item.resolve(false);
    }
    if (shouldSendClose) {
      const payload: ChannelMessage = { __lumina_channel_close: true };
      try {
        this.shared.port.postMessage(payload);
      } catch {
        // ignore close failures
      }
    }
    try {
      this.shared.port.close();
    } catch {
      // ignore close failures
    }
  }
}

export class Receiver<T> {
  private queue: T[] = [];
  private waiters: Array<(value: { $tag: string; $payload?: T }) => void> = [];
  private closed = false;
  private errorMessage: string | null = null;
  private readonly capacity: number | null;
  private readonly ackOnConsume: boolean;

  constructor(
    private readonly port: MessagePort,
    capacity: number | null
  ) {
    this.capacity = capacity;
    this.ackOnConsume = this.capacity !== null && this.capacity > 0;
    this.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        this.closed = true;
        this.flushWaiters(Option.None);
        return;
      }
      if (isChannelAck(data)) {
        return;
      }
      const value = (isChannelValue(data) ? data.__lumina_channel_value : data) as T;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(Option.Some(value));
        this.sendAckIfNeeded();
      } else {
        this.queue.push(value);
      }
    };
    this.port.onmessageerror = () => {
      this.closed = true;
      this.errorMessage = 'channel message error';
      this.flushWaiters(Option.None);
    };
    this.port.start?.();
  }

  private flushWaiters(value: { $tag: string; $payload?: T }): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }

  private sendAckIfNeeded(): void {
    if (!this.ackOnConsume) return;
    const payload: ChannelMessage = { __lumina_channel_ack: 1 };
    this.port.postMessage(payload);
  }

  recv(): Promise<{ $tag: string; $payload?: T }> {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Promise.resolve(Option.Some(value as T));
    }
    if (this.closed) {
      return Promise.resolve(Option.None);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (this.capacity === 0) {
        const payload: ChannelMessage = { __lumina_channel_ack: 1 };
        this.port.postMessage(payload);
      }
    });
  }

  try_recv(): { $tag: string; $payload?: T } {
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Option.Some(value as T);
    }
    return Option.None;
  }

  async recv_result(): Promise<{ $tag: string; $payload?: unknown }> {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    const value = await this.recv();
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag === 'None' && this.errorMessage) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(value);
  }

  try_recv_result(): { $tag: string; $payload?: unknown } {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(this.try_recv());
  }

  is_closed(): boolean {
    return this.closed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const payload: ChannelMessage = { __lumina_channel_close: true };
    try {
      this.port.postMessage(payload);
    } catch {
      // ignore close failures
    }
    this.port.close();
    this.flushWaiters(Option.None);
  }
}

export const channel = {
  is_available: (): boolean => resolveMessageChannel() !== null,
  new: <T>(): { sender: Sender<T>; receiver: Receiver<T> } => {
    return channel.bounded<T>(-1);
  },
  bounded: <T>(capacity: number): { sender: Sender<T>; receiver: Receiver<T> } => {
    const ChannelCtor = resolveMessageChannel();
    if (!ChannelCtor) {
      throw new Error('MessageChannel is not available in this environment');
    }
    const normalized = Number.isFinite(capacity) ? Math.trunc(capacity) : -1;
    const cap = normalized < 0 ? null : normalized;
    const { port1, port2 } = new ChannelCtor();
    return { sender: Sender.create<T>(port1, cap), receiver: new Receiver<T>(port2, cap) };
  },
  send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
  try_send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
  send_async: <T>(sender: Sender<T>, value: T): Promise<boolean> => sender.send(value),
  send_result: <T>(sender: Sender<T>, value: T): { $tag: string; $payload?: unknown } => sender.send_result(value),
  send_async_result: <T>(sender: Sender<T>, value: T): Promise<{ $tag: string; $payload?: unknown }> =>
    sender.send_async_result(value),
  clone_sender: <T>(sender: Sender<T>): Sender<T> => sender.clone(),
  recv: <T>(receiver: Receiver<T>): Promise<unknown> => receiver.recv(),
  try_recv: <T>(receiver: Receiver<T>): unknown => receiver.try_recv(),
  recv_result: <T>(receiver: Receiver<T>): Promise<{ $tag: string; $payload?: unknown }> => receiver.recv_result(),
  try_recv_result: <T>(receiver: Receiver<T>): { $tag: string; $payload?: unknown } => receiver.try_recv_result(),
  is_sender_closed: <T>(sender: Sender<T>): boolean => sender.is_closed(),
  is_receiver_closed: <T>(receiver: Receiver<T>): boolean => receiver.is_closed(),
  close_sender: <T>(sender: Sender<T>): void => sender.close(),
  close_receiver: <T>(receiver: Receiver<T>): void => receiver.close(),
  drop_sender: <T>(sender: Sender<T>): void => sender.drop(),
  drop_receiver: <T>(receiver: Receiver<T>): void => receiver.drop(),
  close: <T>(ch: { sender: Sender<T>; receiver: Receiver<T> }): void => {
    ch.sender.close();
    ch.receiver.close();
  },
};

export const async_channel = channel;

type OptionLike = { $tag: string; $payload?: unknown };

interface NodeWorkerLike {
  postMessage: (value: unknown) => void;
  terminate: () => Promise<number>;
  on: (event: 'message', listener: (value: unknown) => void) => void;
  on: (event: 'error', listener: (error: Error) => void) => void;
  on: (event: 'exit', listener: (code: number) => void) => void;
}

interface WebWorkerLike {
  postMessage: (value: unknown) => void;
  terminate: () => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent<unknown>) => void) => void;
  addEventListener: (type: 'error', listener: (event: ErrorEvent) => void) => void;
}

type ThreadWorker = { kind: 'node'; worker: NodeWorkerLike } | { kind: 'web'; worker: WebWorkerLike };

const isUrlLike = (specifier: string): boolean => /^[a-z]+:/i.test(specifier);

const resolveNodeWorkerSpecifier = (specifier: string): string => {
  if (isUrlLike(specifier)) return specifier;
  return nodePath.resolve(specifier);
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

export class Thread {
  private queue: unknown[] = [];
  private waiters: Array<(value: OptionLike) => void> = [];
  private closed = false;
  private exitCode: number | null = null;
  private joinWaiters: Array<(code: number) => void> = [];

  constructor(private readonly entry: ThreadWorker) {
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
      waiter(Option.Some(value) as OptionLike);
      return;
    }
    this.queue.push(value);
  }

  private finish(code: number): void {
    if (this.exitCode !== null) return;
    this.exitCode = code | 0;
    this.closed = true;
    this.flushWaiters(Option.None as OptionLike);
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
      return Promise.resolve(Option.Some(this.queue.shift()) as OptionLike);
    }
    if (this.closed) {
      return Promise.resolve(Option.None as OptionLike);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  try_recv(): OptionLike {
    if (this.queue.length > 0) {
      return Option.Some(this.queue.shift()) as OptionLike;
    }
    return Option.None as OptionLike;
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

  constructor(task: () => T | Promise<T>) {
    this.result = Promise.resolve()
      .then(() => task())
      .then(
        (value) => Result.Ok(value),
        (error) => Result.Err(error instanceof Error ? error.message : String(error))
      );
  }

  join(): Promise<unknown> {
    return this.result;
  }
}

export const thread = {
  is_available: (): boolean => isNodeRuntime() || typeof Worker === 'function',
  spawn: (task: unknown): unknown => {
    if (typeof task === 'function') {
      return new ThreadHandle(() => (task as () => unknown)());
    }
    return thread.spawn_worker(task);
  },
  spawn_worker: async (specifier: unknown): Promise<unknown> => {
    if (typeof specifier !== 'string' || specifier.length === 0) {
      return Result.Err('Thread specifier must be a non-empty string');
    }
    try {
      const worker = await createThreadWorker(specifier);
      return Result.Ok(new Thread(worker));
    } catch (error) {
      return Result.Err(String(error));
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

export class Mutex {
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
      // Direct hand-off keeps the lock held by the next waiter.
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

export class Semaphore {
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

export const sync = {
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
};

export function __set(obj: Record<string, unknown>, prop: string, value: unknown) {
  obj[prop] = value;
  return value;
}
