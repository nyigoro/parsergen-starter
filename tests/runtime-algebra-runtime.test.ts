import { createAlgebraRuntime } from '../src/runtime/algebra-runtime.js';
import { HashMap, Vec, configureCollectionsRuntime } from '../src/runtime/collections-runtime.js';
import { createCoreRuntime } from '../src/runtime/core-runtime.js';
import type { LuminaEnumLike } from '../src/runtime/value-runtime.js';

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

configureCollectionsRuntime({
  getOption: () => coreRuntime.Option,
  timeSleep: async () => undefined,
});

const algebraRuntime = createAlgebraRuntime({
  Option: coreRuntime.Option,
  Result: coreRuntime.Result,
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

describe('runtime algebra runtime', () => {
  test('functor, applicative, and monad keep Vec and HashMap behavior', () => {
    expect(Array.from(algebraRuntime.functor.map_vec(Vec.from([1, 2]), (x) => x + 1))).toEqual([2, 3]);

    const fns = HashMap.new<string, (input: number) => number>();
    fns.insert('a', (value) => value + 2);
    const values = HashMap.new<string, number>();
    values.insert('a', 5);
    const applied = algebraRuntime.applicative.ap_hashmap_values(fns, values);
    expect((applied.get('a') as { $payload: number }).$payload).toBe(7);

    const nested = Vec.from([Vec.from([1, 2]), Vec.from([3])]);
    expect(Array.from(algebraRuntime.monad.join_vec(nested))).toEqual([1, 2, 3]);
  });

  test('foldable and traversable preserve Option/Result semantics', () => {
    expect(algebraRuntime.foldable.fold_option(coreRuntime.Option.Some(4), 1, (acc, value) => acc + value)).toBe(5);
    expect(algebraRuntime.foldable.fold_result(coreRuntime.Result.Err('x'), 3, (acc, value: number) => acc + value)).toBe(3);

    const traversedOption = algebraRuntime.traversable.traverse_vec_option(Vec.from([1, 2]), (value) =>
      coreRuntime.Option.Some(value * 2)
    ) as { $tag: string; $payload?: Vec<number> };
    expect(traversedOption.$tag).toBe('Some');
    expect(Array.from(traversedOption.$payload ?? [])).toEqual([2, 4]);

    const traversedResult = algebraRuntime.traversable.traverse_vec_result(Vec.from([1, 2]), (value) =>
      coreRuntime.Result.Ok(value + 1)
    ) as { $tag: string; $payload?: Vec<number> };
    expect(traversedResult.$tag).toBe('Ok');
    expect(Array.from(traversedResult.$payload ?? [])).toEqual([2, 3]);
  });
});
