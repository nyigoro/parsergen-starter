import { getNodeProcess, isNodeRuntime } from './node-platform.js';

export type LuminaEnumLike =
  | { $tag: string; $payload?: unknown }
  | { tag: string; values?: unknown[] };

export type RuntimeTraitName = 'Hash' | 'Eq' | 'Ord';

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

export const isEnumLike = (value: unknown): value is LuminaEnumLike => {
  if (!value || typeof value !== 'object') return false;
  const v = value as { $tag?: string; tag?: string };
  return typeof v.$tag === 'string' || typeof v.tag === 'string';
};

export const getEnumTag = (value: LuminaEnumLike): string =>
  (value as { $tag?: string }).$tag ?? (value as { tag?: string }).tag ?? 'Unknown';

export const getEnumPayload = (value: LuminaEnumLike): unknown => {
  if ((value as { $payload?: unknown }).$payload !== undefined) {
    return (value as { $payload?: unknown }).$payload;
  }
  const values = (value as { values?: unknown[] }).values;
  if (!values) return undefined;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
};

export const getRuntimeTypeTag = (value: unknown): string | null => {
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

export const runtimeHashValue = (value: unknown): string => {
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

export const runtimeEquals = (left: unknown, right: unknown): boolean => {
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

const FAST_CLONE_UNSUPPORTED = Symbol('lumina.fast-clone-unsupported');

const isPlainCloneableObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const cloneFast = (
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap()
): unknown | typeof FAST_CLONE_UNSUPPORTED => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached) return cached;
    const out: unknown[] = new Array(value.length);
    seen.set(value, out);
    for (let index = 0; index < value.length; index += 1) {
      const cloned = cloneFast(value[index], seen);
      if (cloned === FAST_CLONE_UNSUPPORTED) {
        return FAST_CLONE_UNSUPPORTED;
      }
      out[index] = cloned;
    }
    return out;
  }

  if (
    value instanceof Date
    || value instanceof RegExp
    || value instanceof Map
    || value instanceof Set
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
  ) {
    return FAST_CLONE_UNSUPPORTED;
  }

  if (!isPlainCloneableObject(value)) {
    return FAST_CLONE_UNSUPPORTED;
  }

  const cached = seen.get(value);
  if (cached) return cached;
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const cloned = cloneFast(entry, seen);
    if (cloned === FAST_CLONE_UNSUPPORTED) {
      return FAST_CLONE_UNSUPPORTED;
    }
    out[key] = cloned;
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

const cloneFallback = (value: unknown): unknown => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast;
  }
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
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast as T;
  }
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

export const compareRuntimeValues = (left: unknown, right: unknown): number => {
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
    const leftComparable = left as string | number | bigint | boolean;
    const rightComparable = right as string | number | bigint | boolean;
    return leftComparable < rightComparable ? -1 : 1;
  }
  const leftText = formatValue(left, { color: false });
  const rightText = formatValue(right, { color: false });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
};
