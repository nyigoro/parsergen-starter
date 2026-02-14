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
  let current = process.cwd();
  while (true) {
    const candidate = path.join(current, 'dist', fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
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

 function renderArgs(args) {
  return args.map((arg) => formatValue(arg)).join(' ');
 }

 function writeStdout(text, newline) {
  if (typeof process !== 'undefined' && process.stdout && typeof process.stdout.write === 'function') {
    process.stdout.write(text + (newline ? '\\n' : ''));
    return;
  }
  console.log(text);
 }

 function writeStderr(text, newline) {
  if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
    process.stderr.write(text + (newline ? '\\n' : ''));
    return;
  }
  console.error(text);
 }

 let stdinCache = null;
 let stdinIndex = 0;

 function readStdinLines() {
  if (stdinCache) return stdinCache;
  if (typeof globalThis !== 'undefined' && globalThis.__luminaStdin !== undefined) {
    const raw = globalThis.__luminaStdin;
    stdinCache = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\\r?\\n/);
    return stdinCache;
  }
  if (typeof process !== 'undefined' && process.stdin && typeof process.stdin.read === 'function') {
    if (typeof process.stdin.setEncoding === 'function') process.stdin.setEncoding('utf8');
    const chunk = process.stdin.read();
    if (typeof chunk === 'string') {
      stdinCache = chunk.split(/\\r?\\n/);
      return stdinCache;
    }
    if (chunk && typeof chunk.toString === 'function') {
      stdinCache = chunk.toString('utf8').split(/\\r?\\n/);
      return stdinCache;
    }
  }
  stdinCache = [];
  return stdinCache;
 }

 function unwrapOption(value) {
  if (value && (value.$tag || value.tag)) {
    const tag = getEnumTag(value);
    if (tag === 'Some') return { isSome: true, value: getEnumPayload(value) };
    if (tag === 'None') return { isSome: false };
  }
  return { isSome: true, value };
 }

const io = {
  print: (...args) => writeStdout(renderArgs(args), false),
  println: (...args) => writeStdout(renderArgs(args), true),
  eprint: (...args) => writeStderr(renderArgs(args), false),
  eprintln: (...args) => writeStderr(renderArgs(args), true),
  readLine: () => {
    if (typeof globalThis !== 'undefined' && typeof globalThis.__luminaReadLine === 'function') {
      const value = globalThis.__luminaReadLine();
      return value == null ? Option.None : Option.Some(value);
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.prompt === 'function') {
      const value = globalThis.prompt();
      return value == null ? Option.None : Option.Some(value);
    }
    const lines = readStdinLines();
    if (stdinIndex >= lines.length) return Option.None;
    const value = lines[stdinIndex++];
    return Option.Some(value);
  },
  readLineAsync: async () => {
    const globalAny = globalThis ?? {};
    if (globalAny.__luminaStdin !== undefined) {
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return Option.None;
      const value = lines[stdinIndex++];
      return Option.Some(value);
    }
    if (typeof process !== 'undefined') {
      const stdin = process.stdin;
      if (stdin && stdin.isTTY !== true) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return Option.None;
        const value = lines[stdinIndex++];
        return Option.Some(value);
      }
      if (stdin && stdin.isTTY) {
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
    if (typeof globalAny.prompt === 'function') {
      const value = globalAny.prompt();
      return value == null ? Option.None : Option.Some(value);
    }
    return Option.None;
  },
  printJson: (value, pretty = true) => console.log(toJsonString(value, pretty)),
 };

const str = {
  length: (value) => value.length,
  concat: (a, b) => a + b,
  substring: (value, start, end) => {
    const safeStart = Math.max(0, Math.trunc(start));
    const safeEnd = Math.max(safeStart, Math.trunc(end));
    return value.substring(safeStart, safeEnd);
  },
  split: (value, sep) => value.split(sep),
  trim: (value) => value.trim(),
  contains: (haystack, needle) => haystack.includes(needle),
  eq: (a, b) => a === b,
  char_at: (value, index) => {
    if (Number.isNaN(index) || index < 0 || index >= value.length) return Option.None;
    return Option.Some(value.charAt(index));
  },
  is_whitespace: (value) => value === ' ' || value === '\\n' || value === '\\t' || value === '\\r',
  is_digit: (value) => {
    if (!value || value.length === 0) return false;
    const code = value.charCodeAt(0);
    return code >= 48 && code <= 57;
  },
  to_int: (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? Result.Err('Invalid int: ' + value) : Result.Ok(parsed);
  },
  to_float: (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? Result.Err('Invalid float: ' + value) : Result.Ok(parsed);
  },
  from_int: (value) => String(Math.trunc(value)),
  from_float: (value) => String(value),
};

const math = {
  abs: (value) => Math.trunc(Math.abs(value)),
  min: (a, b) => Math.trunc(Math.min(a, b)),
  max: (a, b) => Math.trunc(Math.max(a, b)),
  absf: (value) => Math.abs(value),
  minf: (a, b) => Math.min(a, b),
  maxf: (a, b) => Math.max(a, b),
  sqrt: (value) => Math.sqrt(value),
  pow: (base, exp) => Math.pow(base, exp),
  floor: (value) => Math.floor(value),
  ceil: (value) => Math.ceil(value),
  round: (value) => Math.round(value),
  pi: Math.PI,
  e: Math.E,
};

const list = {
  map: (f, xs) => xs.map(f),
  filter: (pred, xs) => xs.filter(pred),
  fold: (f, init, xs) => xs.reduce((acc, val) => f(acc, val), init),
  reverse: (xs) => xs.slice().reverse(),
  length: (xs) => xs.length,
  append: (xs, ys) => xs.concat(ys),
  take: (n, xs) => xs.slice(0, Math.max(0, n)),
  drop: (n, xs) => xs.slice(Math.max(0, n)),
  find: (pred, xs) => {
    const found = xs.find(pred);
    return found === undefined ? Option.None : Option.Some(found);
  },
  any: (pred, xs) => xs.some(pred),
  all: (pred, xs) => xs.every(pred),
};

const fs = {
  readFile: async (path) => {
    try {
      if (typeof process !== 'undefined') {
        const fsPromises = await import('node:fs/promises');
        const content = await fsPromises.readFile(path, 'utf8');
        return Result.Ok(content);
      }
      if (typeof fetch !== 'undefined') {
        const response = await fetch(path);
        if (!response.ok) {
          return Result.Err('HTTP ' + response.status + ': ' + response.statusText);
        }
        const content = await response.text();
        return Result.Ok(content);
      }
      return Result.Err('No file system available');
    } catch (error) {
      return Result.Err(String(error));
    }
  },
  writeFile: async (path, content) => {
    try {
      if (typeof process !== 'undefined') {
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

const http = {
  fetch: async (request) => {
    if (typeof fetch !== 'function') {
      return Result.Err('Fetch API is not available');
    }
    if (!request || typeof request !== 'object') {
      return Result.Err('Invalid request');
    }
    const url = typeof request.url === 'string' ? request.url : '';
    if (!url) return Result.Err('Invalid request url');
    const method = typeof request.method === 'string' && request.method.length > 0 ? request.method : 'GET';
    const headerInput = unwrapOption(request.headers).value;
    const headers = {};
    if (Array.isArray(headerInput)) {
      for (const entry of headerInput) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [name, value] = entry;
          if (typeof name === 'string') headers[name] = typeof value === 'string' ? value : String(value ?? '');
          continue;
        }
        if (entry && typeof entry === 'object') {
          const name = entry.name;
          const value = entry.value;
          if (typeof name === 'string') headers[name] = typeof value === 'string' ? value : String(value ?? '');
        }
      }
    }
    const bodyValue = unwrapOption(request.body).value;
    const body = typeof bodyValue === 'string' ? bodyValue : bodyValue == null ? undefined : String(bodyValue);
    try {
      const response = await fetch(url, { method, headers, body });
      const text = await response.text();
      const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }));
      return Result.Ok({ status: response.status, statusText: response.statusText, headers: responseHeaders, body: text });
    } catch (error) {
      return Result.Err(String(error));
    }
  },
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
  map: (fn, opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  },
  and_then: (fn, opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return fn(getEnumPayload(opt));
    return Option.None;
  },
  or_else: (fallback, opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return opt;
    return fallback();
  },
  unwrap_or: (fallback, opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    if (tag === 'Some') return getEnumPayload(opt);
    return fallback;
  },
  is_some: (opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    return tag === 'Some';
  },
  is_none: (opt) => {
    const tag = opt && (opt.$tag || opt.tag);
    return tag !== 'Some';
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
  map: (fn, res) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res)));
    return res;
  },
  and_then: (fn, res) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return fn(getEnumPayload(res));
    return res;
  },
  or_else: (fn, res) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return res;
    return fn(getEnumPayload(res));
  },
  unwrap_or: (fallback, res) => {
    const tag = res && (res.$tag || res.tag);
    if (tag === 'Ok') return getEnumPayload(res);
    return fallback;
  },
  is_ok: (res) => {
    const tag = res && (res.$tag || res.tag);
    return tag === 'Ok';
  },
  is_err: (res) => {
    const tag = res && (res.$tag || res.tag);
    return tag !== 'Ok';
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

export { io, str, math, list, fs, http, Option, Result, __set, formatValue, LuminaPanic };
`;
}

function runtimeFallbackCjs(): string {
  return `${runtimeFallbackBody()}

module.exports = { io, str, math, list, fs, http, Option, Result, __set, formatValue, LuminaPanic };
`;
}
