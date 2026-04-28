import type { LuminaEnumLike } from './value-runtime.js';

export type CoreRuntimeDeps = {
  formatValue: (value: unknown) => string;
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
  getEnumPayload: (value: LuminaEnumLike) => unknown;
};

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

export const __lumina_fixed_array = <T>(
  size: number,
  initializer?: (index: number) => T
): T[] => {
  const normalized = Math.max(0, Math.trunc(size));
  const arr = new Array<T>(normalized);
  if (initializer) {
    for (let i = 0; i < normalized; i += 1) {
      arr[i] = initializer(i);
    }
  }
  return arr;
};

export const __lumina_array_bounds_check = (
  array: unknown[],
  index: number,
  expectedSize?: number
): void => {
  if (expectedSize !== undefined && array.length !== expectedSize) {
    throw new Error(`Array size mismatch: expected ${expectedSize}, got ${array.length}`);
  }
  if (index < 0 || index >= array.length) {
    throw new Error(`Array index out of bounds: ${index} (array length: ${array.length})`);
  }
};

export const __lumina_array_literal = <T>(elements: T[], expectedSize?: number): T[] => {
  if (expectedSize !== undefined && elements.length !== expectedSize) {
    throw new Error(`Array literal has wrong size: expected ${expectedSize}, got ${elements.length}`);
  }
  return elements;
};

export function __set(obj: Record<string, unknown>, prop: string, value: unknown) {
  obj[prop] = value;
  return value;
}

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

export const createCoreRuntime = ({ formatValue, isEnumLike, getEnumTag, getEnumPayload }: CoreRuntimeDeps) => {
  const __lumina_index = (target: unknown, index: unknown, expectedSize?: number): unknown => {
    if (typeof target === 'string' && isRangeValue(index)) {
      const length = target.length;
      const start = index.start == null ? 0 : clampIndex(Math.trunc(index.start), 0, length);
      const endBase = index.end == null ? length : clampIndex(Math.trunc(index.end), 0, length);
      return __lumina_slice(target, start, endBase, index.inclusive);
    }

    if (target && typeof (target as { get?: (idx: number) => unknown }).get === 'function') {
      const result = (target as { get: (idx: number) => unknown }).get(Math.trunc(Number(index)));
      const tag = result && typeof result === 'object' && isEnumLike(result) ? getEnumTag(result) : '';
      if (tag === 'Some') return getEnumPayload(result as LuminaEnumLike);
      const err = new LuminaPanic('Index out of bounds', result);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(err, __lumina_index);
      }
      throw err;
    }

    if (Array.isArray(target)) {
      const normalizedIndex = Math.trunc(Number(index));
      __lumina_array_bounds_check(target, normalizedIndex, expectedSize);
      return target[normalizedIndex];
    }

    if (target && typeof target === 'object') {
      return (target as Record<string, unknown>)[String(index)];
    }

    return undefined;
  };

  const Option = {
    Some: (value: unknown) => ({ $tag: 'Some', $payload: value }),
    None: { $tag: 'None' },
    map: (fn: (value: unknown) => unknown, opt: unknown) => {
      const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
      if (tag === 'Some') return Option.Some(fn(getEnumPayload(opt as LuminaEnumLike)));
      return Option.None;
    },
    and_then: (fn: (value: unknown) => unknown, opt: unknown) => {
      const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
      if (tag === 'Some') return fn(getEnumPayload(opt as LuminaEnumLike));
      return Option.None;
    },
    or_else: (fallback: () => unknown, opt: unknown) => {
      const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
      if (tag === 'Some') return opt;
      return fallback();
    },
    unwrap_or: (fallback: unknown, opt: unknown) => {
      const tag = opt && typeof opt === 'object' && isEnumLike(opt) ? getEnumTag(opt) : '';
      if (tag === 'Some') return getEnumPayload(opt as LuminaEnumLike);
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
      if (tag === 'Some') return getEnumPayload(opt as LuminaEnumLike);
      const rendered = formatValue(opt);
      const msg = message ?? `Tried to unwrap None: ${rendered}`;
      const err = new LuminaPanic(msg, opt);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(err, Option.unwrap);
      }
      throw err;
    },
  };

  const Result = {
    Ok: (value: unknown) => ({ $tag: 'Ok', $payload: value }),
    Err: (error: unknown) => ({ $tag: 'Err', $payload: error }),
    map: (fn: (value: unknown) => unknown, res: unknown) => {
      const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
      if (tag === 'Ok') return Result.Ok(fn(getEnumPayload(res as LuminaEnumLike)));
      return res;
    },
    and_then: (fn: (value: unknown) => unknown, res: unknown) => {
      const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
      if (tag === 'Ok') return fn(getEnumPayload(res as LuminaEnumLike));
      return res;
    },
    or_else: (fn: (error: unknown) => unknown, res: unknown) => {
      const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
      if (tag === 'Ok') return res;
      return fn(getEnumPayload(res as LuminaEnumLike));
    },
    unwrap_or: (fallback: unknown, res: unknown) => {
      const tag = res && typeof res === 'object' && isEnumLike(res) ? getEnumTag(res) : '';
      if (tag === 'Ok') return getEnumPayload(res as LuminaEnumLike);
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

  return { __lumina_index, Option, Result };
};

export type CoreRuntime = ReturnType<typeof createCoreRuntime>;
