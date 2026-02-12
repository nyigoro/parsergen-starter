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

const supportsColor = (): boolean => {
  if (typeof window !== 'undefined') return false;
  if (typeof process === 'undefined') return false;
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

export const io = {
  println: (...args: unknown[]) => {
    const rendered = args.map((arg) => formatValue(arg));
    // eslint-disable-next-line no-console -- runtime output
    console.log(...rendered);
  },
  printJson: (value: unknown, pretty: boolean = true) => {
    // eslint-disable-next-line no-console -- runtime output
    console.log(toJsonString(value, pretty));
  },
  print: (...args: unknown[]) => {
    const rendered = args.map((arg) => formatValue(arg));
    // eslint-disable-next-line no-console -- runtime output
    console.log(...rendered);
  },
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
  map: (opt: unknown, fn: (value: unknown) => unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  },
  and_then: (opt: unknown, fn: (value: unknown) => unknown) => {
    const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
    if (tag === 'Some') return fn(getEnumPayload(opt));
    return Option.None;
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
  map: (res: unknown, fn: (value: unknown) => unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res)));
    return res;
  },
  and_then: (res: unknown, fn: (value: unknown) => unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return fn(getEnumPayload(res));
    return res;
  },
  unwrap_or: (res: unknown, fallback: unknown) => {
    const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
    if (tag === 'Ok') return getEnumPayload(res);
    return fallback;
  },
};

export function __set(obj: Record<string, unknown>, prop: string, value: unknown) {
  obj[prop] = value;
  return value;
}
