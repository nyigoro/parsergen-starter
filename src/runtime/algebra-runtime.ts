import { HashMap, Vec, vec } from './collections-runtime.js';
import type { LuminaEnumLike } from './value-runtime.js';

type OptionRuntime = {
  Some: (value: unknown) => unknown;
  None: unknown;
  map: (fn: (value: unknown) => unknown, opt: unknown) => unknown;
  and_then: (fn: (value: unknown) => unknown, opt: unknown) => unknown;
};

type ResultRuntime = {
  Ok: (value: unknown) => unknown;
  Err: (error: unknown) => unknown;
  map: (fn: (value: unknown) => unknown, res: unknown) => unknown;
  and_then: (fn: (value: unknown) => unknown, res: unknown) => unknown;
};

export type AlgebraRuntimeDeps = {
  Option: OptionRuntime;
  Result: ResultRuntime;
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
  getEnumPayload: (value: LuminaEnumLike) => unknown;
};

const mapHashMapValues = <K, V, U>(map: HashMap<K, V>, mapper: (value: V) => U): HashMap<K, U> => {
  const out = HashMap.new<K, U>();
  for (const key of map.keys()) {
    const current = map.get(key);
    if (current && typeof current === 'object' && (current as { $tag?: string }).$tag === 'Some') {
      out.insert(key, mapper((current as { $payload: V }).$payload));
    }
  }
  return out;
};

const pureHashMap = <K, V>(key: K, value: V): HashMap<K, V> => {
  const out = HashMap.new<K, V>();
  out.insert(key, value);
  return out;
};

const apHashMapValues = <K, A, B>(
  fns: HashMap<K, (input: A) => B>,
  values: HashMap<K, A>
): HashMap<K, B> => {
  const out = HashMap.new<K, B>();
  for (const key of fns.keys()) {
    const fnEntry = fns.get(key);
    const valueEntry = values.get(key);
    if (
      !fnEntry ||
      typeof fnEntry !== 'object' ||
      (fnEntry as { $tag?: string }).$tag !== 'Some' ||
      !valueEntry ||
      typeof valueEntry !== 'object' ||
      (valueEntry as { $tag?: string }).$tag !== 'Some'
    ) {
      continue;
    }
    const fn = (fnEntry as { $payload: unknown }).$payload;
    if (typeof fn !== 'function') continue;
    out.insert(key, (fn as (input: A) => B)((valueEntry as { $payload: A }).$payload));
  }
  return out;
};

const flatMapHashMapValues = <K, A, B>(
  values: HashMap<K, A>,
  mapper: (input: A) => HashMap<K, B>
): HashMap<K, B> => {
  const out = HashMap.new<K, B>();
  for (const key of values.keys()) {
    const current = values.get(key);
    if (!current || typeof current !== 'object' || (current as { $tag?: string }).$tag !== 'Some') continue;
    const mapped = mapper((current as { $payload: A }).$payload);
    if (!(mapped instanceof HashMap)) continue;
    for (const mappedKey of mapped.keys()) {
      const mappedValue = mapped.get(mappedKey);
      if (
        mappedValue &&
        typeof mappedValue === 'object' &&
        (mappedValue as { $tag?: string }).$tag === 'Some'
      ) {
        out.insert(mappedKey, (mappedValue as { $payload: B }).$payload);
      }
    }
  }
  return out;
};

export const createAlgebraRuntime = ({ Option, Result, isEnumLike, getEnumTag, getEnumPayload }: AlgebraRuntimeDeps) => {
  const functor = {
    map_option: <A, B>(value: unknown, mapper: (input: A) => B): unknown => Option.map(mapper as (x: unknown) => unknown, value),
    map_result: <A, B>(value: unknown, mapper: (input: A) => B): unknown =>
      Result.map(mapper as (x: unknown) => unknown, value),
    map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => B): Vec<B> => vec.map(values, mapper),
    map_hashmap_values: <K, V, U>(values: HashMap<K, V>, mapper: (input: V) => U): HashMap<K, U> =>
      mapHashMapValues(values, mapper),
  };

  const applicative = {
    pure_option: <A>(value: A): unknown => Option.Some(value),
    pure_result: <A>(value: A): unknown => Result.Ok(value),
    pure_vec: <A>(value: A): Vec<A> => Vec.from([value]),
    pure_hashmap: <K, V>(key: K, value: V): HashMap<K, V> => pureHashMap(key, value),
    ap_option: <A, B>(fns: unknown, value: unknown): unknown => {
      const fnTag = fns && typeof fns === 'object' && isEnumLike(fns) ? getEnumTag(fns) : '';
      const valueTag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
      if (fnTag !== 'Some' || valueTag !== 'Some') return Option.None;
      const fn = getEnumPayload(fns as LuminaEnumLike);
      if (typeof fn !== 'function') return Option.None;
      return Option.Some((fn as (arg: A) => B)(getEnumPayload(value as LuminaEnumLike) as A));
    },
    ap_result: <A, B>(fns: unknown, value: unknown): unknown => {
      const fnTag = fns && typeof fns === 'object' && isEnumLike(fns) ? getEnumTag(fns) : '';
      if (fnTag !== 'Ok') return fns;
      const valueTag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
      if (valueTag !== 'Ok') return value;
      const fn = getEnumPayload(fns as LuminaEnumLike);
      if (typeof fn !== 'function') return Result.Err('Result ap expected Ok(function)');
      return Result.Ok((fn as (arg: A) => B)(getEnumPayload(value as LuminaEnumLike) as A));
    },
    ap_vec: <A, B>(fns: Vec<(input: A) => B>, values: Vec<A>): Vec<B> => {
      const out = Vec.new<B>();
      for (const fn of fns) {
        for (const value of values) {
          out.push(fn(value));
        }
      }
      return out;
    },
    ap_hashmap_values: <K, A, B>(fns: HashMap<K, (input: A) => B>, values: HashMap<K, A>): HashMap<K, B> =>
      apHashMapValues(fns, values),
  };

  const monad = {
    flat_map_option: <A>(value: unknown, mapper: (input: A) => unknown): unknown =>
      Option.and_then(mapper as (x: unknown) => unknown, value),
    flat_map_result: <A>(value: unknown, mapper: (input: A) => unknown): unknown =>
      Result.and_then(mapper as (x: unknown) => unknown, value),
    flat_map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => Vec<B>): Vec<B> => {
      const out = Vec.new<B>();
      for (const value of values) {
        const mapped = mapper(value);
        if (!(mapped instanceof Vec)) continue;
        for (const inner of mapped) out.push(inner);
      }
      return out;
    },
    flat_map_hashmap_values: <K, A, B>(values: HashMap<K, A>, mapper: (input: A) => HashMap<K, B>): HashMap<K, B> =>
      flatMapHashMapValues(values, mapper),
    join_option: (value: unknown): unknown => Option.and_then((v) => v, value),
    join_result: (value: unknown): unknown => Result.and_then((v) => v, value),
    join_vec: <A>(values: Vec<Vec<A>>): Vec<A> => {
      const out = Vec.new<A>();
      for (const inner of values) {
        if (!(inner instanceof Vec)) continue;
        for (const value of inner) out.push(value);
      }
      return out;
    },
    join_hashmap_values: <K, A>(values: HashMap<K, HashMap<K, A>>): HashMap<K, A> =>
      flatMapHashMapValues(values, (inner) => inner),
  };

  const foldable = {
    fold_option: <A, B>(value: unknown, init: B, folder: (acc: B, input: A) => B): B => {
      const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
      if (tag !== 'Some') return init;
      return folder(init, getEnumPayload(value as LuminaEnumLike) as A);
    },
    fold_result: <A, B>(value: unknown, init: B, folder: (acc: B, input: A) => B): B => {
      const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
      if (tag !== 'Ok') return init;
      return folder(init, getEnumPayload(value as LuminaEnumLike) as A);
    },
    fold_vec: <A, B>(values: Vec<A>, init: B, folder: (acc: B, input: A) => B): B => vec.fold(values, init, folder),
    fold_hashmap_values: <K, V, B>(
      values: HashMap<K, V>,
      init: B,
      folder: (acc: B, input: V) => B
    ): B => {
      let acc = init;
      for (const value of values.values()) {
        acc = folder(acc, value);
      }
      return acc;
    },
  };

  const traversable = {
    traverse_vec_option: <A, B>(values: Vec<A>, mapper: (input: A) => unknown): unknown => {
      const out = Vec.new<B>();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === 'object' && isEnumLike(mapped) ? getEnumTag(mapped) : '';
        if (tag !== 'Some') return Option.None;
        out.push(getEnumPayload(mapped as LuminaEnumLike) as B);
      }
      return Option.Some(out);
    },
    traverse_vec_result: <A, B>(values: Vec<A>, mapper: (input: A) => unknown): unknown => {
      const out = Vec.new<B>();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === 'object' && isEnumLike(mapped) ? getEnumTag(mapped) : '';
        if (tag !== 'Ok') return mapped;
        out.push(getEnumPayload(mapped as LuminaEnumLike) as B);
      }
      return Result.Ok(out);
    },
    sequence_vec_option: (values: Vec<unknown>): unknown =>
      traversable.traverse_vec_option(values, (item: unknown) => item as unknown),
    sequence_vec_result: (values: Vec<unknown>): unknown =>
      traversable.traverse_vec_result(values, (item: unknown) => item as unknown),
  };

  return { functor, applicative, monad, foldable, traversable };
};

export type AlgebraRuntime = ReturnType<typeof createAlgebraRuntime>;
