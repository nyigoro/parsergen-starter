import type { LuminaEnumLike } from '../src/runtime/value-runtime.js';
import {
  __lumina_array_bounds_check,
  __lumina_array_literal,
  __lumina_fixed_array,
  __lumina_range,
  __lumina_slice,
  LuminaPanic,
  createCoreRuntime,
} from '../src/runtime/core-runtime.js';

const isEnumLike = (value: unknown): value is LuminaEnumLike =>
  !!value &&
  typeof value === 'object' &&
  (typeof (value as { $tag?: unknown }).$tag === 'string' || typeof (value as { tag?: unknown }).tag === 'string');

const getEnumTag = (value: LuminaEnumLike): string =>
  '$tag' in value ? value.$tag : value.tag;

const getEnumPayload = (value: LuminaEnumLike): unknown =>
  '$payload' in value ? value.$payload : value.values?.[0];

const coreRuntime = createCoreRuntime({
  formatValue: (value) => JSON.stringify(value),
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

describe('runtime core runtime', () => {
  test('range and array helpers preserve existing semantics', () => {
    expect(__lumina_range(1, 3, true, true, true)).toEqual({ start: 1, end: 3, inclusive: true });
    expect(__lumina_slice('lumina', 1, 3, false)).toBe('um');
    expect(__lumina_fixed_array(3, (index) => index + 1)).toEqual([1, 2, 3]);
    expect(__lumina_array_literal([1, 2], 2)).toEqual([1, 2]);
    expect(() => __lumina_array_bounds_check([1], 2)).toThrow('Array index out of bounds');
  });

  test('indexing and algebraic helpers use injected enum behavior', () => {
    expect(coreRuntime.__lumina_index([10, 20], 1)).toBe(20);
    expect(coreRuntime.__lumina_index('lumina', { start: 1, end: 3, inclusive: true })).toBe('umi');

    expect(coreRuntime.Option.unwrap(coreRuntime.Option.Some(42))).toBe(42);
    expect(() => coreRuntime.Option.unwrap(coreRuntime.Option.None)).toThrow(LuminaPanic);

    expect(coreRuntime.Result.map((value) => Number(value) + 1, coreRuntime.Result.Ok(4))).toEqual({
      $tag: 'Ok',
      $payload: 5,
    });
  });
});
