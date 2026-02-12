import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export type RuntimeTarget = 'esm' | 'cjs';

function resolveRuntimeSource(fileName: string): string | null {
  const argvPath = process.argv[1];
  if (argvPath) {
    const candidate = path.resolve(path.dirname(argvPath), '..', fileName);
    if (fs.existsSync(candidate)) return candidate;
  }
  const localDist = path.resolve(process.cwd(), 'dist', fileName);
  if (fs.existsSync(localDist)) return localDist;
  return null;
}

export async function ensureRuntimeForOutput(outPath: string, target: RuntimeTarget) {
  const fileName = target === 'cjs' ? 'lumina-runtime.cjs' : 'lumina-runtime.js';
  const source = resolveRuntimeSource(fileName);
  const dest = path.join(path.dirname(outPath), fileName);
  if (fs.existsSync(dest)) return;
  if (source) {
    await fsp.copyFile(source, dest);
    return;
  }
  const fallback = target === 'cjs' ? runtimeFallbackCjs() : runtimeFallbackEsm();
  await fsp.writeFile(dest, fallback, 'utf-8');
}

function runtimeFallbackBody(): string {
  return `
function getEnumTag(value) {
  return value.$tag ?? value.tag ?? 'Unknown';
}

function getEnumPayload(value) {
  if (value.$payload !== undefined) return value.$payload;
  const values = value.values;
  if (!values) return undefined;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
}

function supportsColor() {
  if (typeof window !== 'undefined') return false;
  if (typeof process === 'undefined') return false;
  return Boolean(process.stdout && process.stdout.isTTY);
}

const colors = {
  reset: '\\x1b[0m',
  cyan: '\\x1b[36m',
  yellow: '\\x1b[33m',
  green: '\\x1b[32m',
  magenta: '\\x1b[35m',
  gray: '\\x1b[90m',
};

function colorize(text, color, enabled) {
  if (!enabled || !color) return text;
  return color + text + colors.reset;
}

function formatValue(value, options = {}) {
  const config = { indent: 2, maxDepth: 6, color: supportsColor(), ...options };
  const seen = new WeakSet();

  function formatEnum(tag, payload, depth) {
    if (payload === undefined) return colorize(tag, colors.cyan, config.color);
    if (Array.isArray(payload)) {
      const inner = payload.map((item) => format(item, depth + 1));
      return formatEnumPayload(tag, inner, depth);
    }
    return formatEnumPayload(tag, [format(payload, depth + 1)], depth);
  }

  function formatEnumPayload(tag, parts, depth) {
    const name = colorize(tag, colors.cyan, config.color);
    const multiline = parts.some((part) => part.includes('\\n')) || parts.join(', ').length > 60;
    if (!multiline) return name + '(' + parts.join(', ') + ')';
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return name + '(\\n' + indent + parts.join(',\\n' + indent) + '\\n' + closing + ')';
  }

  function formatArray(items, depth) {
    if (items.length === 0) return '[]';
    if (depth >= config.maxDepth) return '[...]';
    const rendered = items.map((item) => format(item, depth + 1));
    const multiline = rendered.some((item) => item.includes('\\n')) || rendered.join(', ').length > 60;
    if (!multiline) return '[' + rendered.join(', ') + ']';
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return '[\\n' + indent + rendered.join(',\\n' + indent) + '\\n' + closing + ']';
  }

  function formatObject(obj, depth) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    if (depth >= config.maxDepth) return '{...}';
    const rendered = entries.map(([k, v]) => k + ': ' + format(v, depth + 1));
    const multiline = rendered.some((item) => item.includes('\\n')) || rendered.join(', ').length > 60;
    if (!multiline) return '{ ' + rendered.join(', ') + ' }';
    const indent = ' '.repeat(config.indent * (depth + 1));
    const closing = ' '.repeat(config.indent * depth);
    return '{\\n' + indent + rendered.join(',\\n' + indent) + '\\n' + closing + '}';
  }

  function format(val, depth) {
    if (val === null || val === undefined) return colorize(String(val), colors.gray, config.color);
    if (typeof val === 'string') return colorize(val, colors.green, config.color);
    if (typeof val === 'number' || typeof val === 'bigint') return colorize(String(val), colors.yellow, config.color);
    if (typeof val === 'boolean') return colorize(String(val), colors.magenta, config.color);
    if (typeof val === 'function') return '[Function' + (val.name ? ' ' + val.name : '') + ']';
    if (Array.isArray(val)) return formatArray(val, depth);
    if (val && typeof val === 'object') {
      if (typeof val.$tag === 'string' || typeof val.tag === 'string') {
        return formatEnum(getEnumTag(val), getEnumPayload(val), depth);
      }
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
      return formatObject(val, depth);
    }
    try {
      return String(val);
    } catch {
      return '[unprintable]';
    }
  }

  return format(value, 0);
}

function toJsonValue(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return '[Function' + (value.name ? ' ' + value.name : '') + ']';
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (typeof value.$tag === 'string' || typeof value.tag === 'string') {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return payload === undefined ? { $tag: tag } : { $tag: tag, $payload: toJsonValue(payload, seen) };
    }
    const entries = Object.entries(value).map(([k, v]) => [k, toJsonValue(v, seen)]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

function toJsonString(value, pretty = true) {
  const normalized = toJsonValue(value, new WeakSet());
  return JSON.stringify(normalized, null, pretty ? 2 : undefined);
}

const io = {
  println: (...args) => console.log(...args.map(formatValue)),
  printJson: (value, pretty = true) => console.log(toJsonString(value, pretty)),
  print: (...args) => console.log(...args.map(formatValue)),
};

class LuminaPanic extends Error {
  constructor(message, value) {
    super(message);
    this.name = 'LuminaPanic';
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LuminaPanic);
    }
  }
}

const Option = {
  Some: (value) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
  map: (opt, fn) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  },
  and_then: (opt, fn) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return fn(getEnumPayload(opt));
    return Option.None;
  },
  unwrap: (opt, message) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return getEnumPayload(opt);
    const msg = message || ('Tried to unwrap None: ' + formatValue(opt));
    const err = new LuminaPanic(msg, opt);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, Option.unwrap);
    }
    throw err;
  },
};

const Result = {
  Ok: (value) => ({ $tag: 'Ok', $payload: value }),
  Err: (error) => ({ $tag: 'Err', $payload: error }),
  map: (res, fn) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res)));
    return res;
  },
  and_then: (res, fn) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return fn(getEnumPayload(res));
    return res;
  },
  unwrap_or: (res, fallback) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return getEnumPayload(res);
    return fallback;
  },
};

function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
`.trim();
}

function runtimeFallbackEsm(): string {
  return `${runtimeFallbackBody()}

export { io, Option, Result, __set, formatValue, LuminaPanic };
`;
}

function runtimeFallbackCjs(): string {
  return `${runtimeFallbackBody()}

module.exports = { io, Option, Result, __set, formatValue, LuminaPanic };
`;
}
