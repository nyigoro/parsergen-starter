import {
  compareRuntimeValues,
  getEnumPayload,
  getEnumTag,
  isEnumLike,
  runtimeEquals,
  runtimeHashValue,
  type LuminaEnumLike,
} from './value-runtime.js';

type OptionRuntime = {
  Some: (value: unknown) => unknown;
  None: unknown;
};

type CollectionsRuntimeDeps = {
  getOption: () => OptionRuntime;
  timeSleep: (ms: number) => Promise<void>;
};

let collectionsRuntimeConfig: CollectionsRuntimeDeps | null = null;

const requireCollectionsRuntimeConfig = (): CollectionsRuntimeDeps => {
  if (!collectionsRuntimeConfig) {
    throw new Error('Collections runtime is not configured');
  }
  return collectionsRuntimeConfig;
};

const Option = (): OptionRuntime => requireCollectionsRuntimeConfig().getOption();

const normalizeCount = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

const compareOrder = (left: unknown, right: unknown): number => {
  if (left === right) return 0;
  const leftComparable = left as string | number | bigint | boolean;
  const rightComparable = right as string | number | bigint | boolean;
  return leftComparable < rightComparable ? -1 : 1;
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

export const configureCollectionsRuntime = (deps: CollectionsRuntimeDeps): void => {
  collectionsRuntimeConfig = deps;
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
    return found === undefined ? Option().None : Option().Some(found);
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
    if (!Number.isFinite(index)) return Option().None;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < this.data.length ? Option().Some(this.data[idx]) : Option().None;
  }

  len(): number {
    return this.data.length;
  }

  pop() {
    if (this.data.length === 0) return Option().None;
    const value = this.data.pop() as T;
    return Option().Some(value);
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
    return found === undefined ? Option().None : Option().Some(found);
  }

  position(predicate: (value: T) => boolean) {
    const idx = this.data.findIndex(predicate);
    return idx >= 0 ? Option().Some(idx) : Option().None;
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
  await requireCollectionsRuntimeConfig().timeSleep(ms);
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
  fused_filter_map_fold: <T, U, A>(
    v: Vec<T>,
    pred: (value: T) => boolean,
    mapper: (value: T) => U,
    init: A,
    folder: (acc: A, value: U) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_map_fold: <T, U, A>(
    v: Vec<T>,
    mapper: (value: T) => U,
    init: A,
    folder: (acc: A, value: U) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_filter_fold: <T, A>(
    v: Vec<T>,
    pred: (value: T) => boolean,
    init: A,
    folder: (acc: A, value: T) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, item);
    }
    return acc;
  },
  fused_pipeline: <T, A>(
    v: Vec<T>,
    stages: Array<{ kind: 'map' | 'filter'; f: (value: unknown) => unknown }>,
    init: A,
    folder: (acc: A, value: unknown) => A
  ): A => {
    let acc = init;
    for (const item of v) {
      let current: unknown = item;
      let keep = true;
      for (const stage of stages) {
        if (stage.kind === 'map') {
          current = stage.f(current);
          continue;
        }
        if (stage.kind === 'filter') {
          if (!stage.f(current)) {
            keep = false;
            break;
          }
          continue;
        }
      }
      if (!keep) continue;
      acc = folder(acc, current);
    }
    return acc;
  },
};

export type QueryRecord<T> = { items: Vec<T> };

export const iter = {
  map_vec: <A, B>(values: Vec<A>, mapper: (value: A) => B): Vec<B> => vec.map(values, mapper),
  filter_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): Vec<A> => vec.filter(values, pred),
  filter_option: <A>(value: unknown, pred: (input: A) => boolean): unknown => {
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag !== 'Some') return Option().None;
    const payload = getEnumPayload(value as LuminaEnumLike) as A;
    return pred(payload) ? Option().Some(payload) : Option().None;
  },
  zip_vec: <A, B>(left: Vec<A>, right: Vec<B>): Vec<[A, B]> => vec.zip(left, right),
  enumerate_vec: <A>(values: Vec<A>): Vec<[number, A]> => vec.enumerate(values),
  flatten_vec: <A>(values: Vec<Vec<A>>): Vec<A> => {
    const out = Vec.new<A>();
    for (const inner of values) {
      if (!(inner instanceof Vec)) continue;
      for (const value of inner) out.push(value);
    }
    return out;
  },
  flat_map_vec: <A, B>(values: Vec<A>, mapper: (input: A) => Vec<B>): Vec<B> => {
    const out = Vec.new<B>();
    for (const value of values) {
      const mapped = mapper(value);
      if (!(mapped instanceof Vec)) continue;
      for (const inner of mapped) out.push(inner);
    }
    return out;
  },
  chunk_vec: <A>(values: Vec<A>, size: number): Vec<Vec<A>> => {
    const out = Vec.new<Vec<A>>();
    const chunkSize = normalizeCount(size);
    if (chunkSize <= 0) return out;
    let current = Vec.new<A>();
    let count = 0;
    for (const value of values) {
      current.push(value);
      count += 1;
      if (count >= chunkSize) {
        out.push(current);
        current = Vec.new<A>();
        count = 0;
      }
    }
    if (current.len() > 0) out.push(current);
    return out;
  },
  window_vec: <A>(values: Vec<A>, size: number): Vec<Vec<A>> => {
    const out = Vec.new<Vec<A>>();
    const windowSize = normalizeCount(size);
    if (windowSize <= 0 || windowSize > values.len()) return out;
    const source = Array.from(values);
    for (let start = 0; start <= values.len() - windowSize; start += 1) {
      const window = Vec.new<A>();
      for (let offset = 0; offset < windowSize; offset += 1) {
        window.push(source[start + offset] as A);
      }
      out.push(window);
    }
    return out;
  },
  partition_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): [Vec<A>, Vec<A>] => {
    const pass = Vec.new<A>();
    const fail = Vec.new<A>();
    for (const value of values) {
      if (pred(value)) pass.push(value);
      else fail.push(value);
    }
    return [pass, fail];
  },
  take_vec: <A>(values: Vec<A>, n: number): Vec<A> => vec.take(values, n),
  skip_vec: <A>(values: Vec<A>, n: number): Vec<A> => vec.skip(values, n),
  any_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): boolean => vec.any(values, pred),
  all_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): boolean => vec.all(values, pred),
  find_vec: <A>(values: Vec<A>, pred: (value: A) => boolean): unknown => vec.find(values, pred),
  count_vec: <A>(values: Vec<A>): number => vec.len(values),
  sum_vec: (values: Vec<number>): number => vec.fold(values, 0, (acc, value) => acc + value),
  sum_vec_f64: (values: Vec<number>): number => vec.fold(values, 0, (acc, value) => acc + value),
  unique_vec: <A>(values: Vec<A>): Vec<A> => {
    const out = Vec.new<A>();
    for (const value of values) {
      let seen = false;
      for (const existing of out) {
        if (runtimeEquals(existing, value)) {
          seen = true;
          break;
        }
      }
      if (!seen) out.push(value);
    }
    return out;
  },
  reverse_vec: <A>(values: Vec<A>): Vec<A> => Vec.from(Array.from(values).reverse()),
  sort_vec: <A>(values: Vec<A>, cmp: (left: A, right: A) => number): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => cmp(left, right))),
  sort_by_vec: <A, K>(values: Vec<A>, key: (value: A) => K): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => compareOrder(key(left), key(right)))),
  sort_by_desc_vec: <A, K>(values: Vec<A>, key: (value: A) => K): Vec<A> =>
    Vec.from(Array.from(values).sort((left, right) => compareOrder(key(right), key(left)))),
  group_by_vec: <A, K>(values: Vec<A>, key: (value: A) => K): HashMap<K, Vec<A>> => {
    const out = HashMap.new<K, Vec<A>>();
    for (const value of values) {
      const groupKey = key(value);
      const existing = out.get(groupKey);
      if (existing === Option().None) {
        const bucket = Vec.new<A>();
        bucket.push(value);
        out.insert(groupKey, bucket);
        continue;
      }
      const bucket = getEnumPayload(existing as LuminaEnumLike) as Vec<A>;
      bucket.push(value);
    }
    return out;
  },
  intersperse_vec: <A>(values: Vec<A>, sep: A): Vec<A> => {
    const out = Vec.new<A>();
    let first = true;
    for (const value of values) {
      if (!first) out.push(sep);
      out.push(value);
      first = false;
    }
    return out;
  },
  join_vec: <A, B, K>(
    left: Vec<A>,
    right: Vec<B>,
    left_key: (value: A) => K,
    right_key: (value: B) => K
  ): Vec<[A, B]> => {
    const out = Vec.new<[A, B]>();
    for (const leftValue of left) {
      const leftKey = left_key(leftValue);
      for (const rightValue of right) {
        if (runtimeEquals(leftKey, right_key(rightValue))) {
          out.push([leftValue, rightValue]);
        }
      }
    }
    return out;
  },
};

export const map_vec = iter.map_vec;
export const filter_vec = iter.filter_vec;
export const filter_option = iter.filter_option;
export const zip_vec = iter.zip_vec;
export const enumerate_vec = iter.enumerate_vec;
export const flatten_vec = iter.flatten_vec;
export const flat_map_vec = iter.flat_map_vec;
export const chunk_vec = iter.chunk_vec;
export const window_vec = iter.window_vec;
export const partition_vec = iter.partition_vec;
export const take_vec = iter.take_vec;
export const skip_vec = iter.skip_vec;
export const any_vec = iter.any_vec;
export const all_vec = iter.all_vec;
export const find_vec = iter.find_vec;
export const count_vec = iter.count_vec;
export const sum_vec = iter.sum_vec;
export const sum_vec_f64 = iter.sum_vec_f64;
export const unique_vec = iter.unique_vec;
export const reverse_vec = iter.reverse_vec;
export const sort_vec = iter.sort_vec;
export const sort_by_vec = iter.sort_by_vec;
export const sort_by_desc_vec = iter.sort_by_desc_vec;
export const group_by_vec = iter.group_by_vec;
export const intersperse_vec = iter.intersperse_vec;
export const join_vec = iter.join_vec;

export const query = <T>(items: Vec<T>): QueryRecord<T> => ({ items });
export const where_q = <T>(q: QueryRecord<T>, pred: (value: T) => boolean): QueryRecord<T> => ({
  items: iter.filter_vec(q.items, pred),
});
export const select_q = <T, U>(q: QueryRecord<T>, mapper: (value: T) => U): QueryRecord<U> => ({
  items: iter.map_vec(q.items, mapper),
});
export const order_by_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): QueryRecord<T> => ({
  items: iter.sort_by_vec(q.items, key),
});
export const order_by_desc_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): QueryRecord<T> => ({
  items: iter.sort_by_desc_vec(q.items, key),
});
export const limit_q = <T>(q: QueryRecord<T>, n: number): QueryRecord<T> => ({ items: iter.take_vec(q.items, n) });
export const offset_q = <T>(q: QueryRecord<T>, n: number): QueryRecord<T> => ({ items: iter.skip_vec(q.items, n) });
export const group_by_q = <T, K>(q: QueryRecord<T>, key: (value: T) => K): HashMap<K, Vec<T>> =>
  iter.group_by_vec(q.items, key);
export const count_q = <T>(q: QueryRecord<T>): number => iter.count_vec(q.items);
export const first_q = <T>(q: QueryRecord<T>): unknown => vec.get(q.items, 0);
export const to_vec_q = <T>(q: QueryRecord<T>): Vec<T> => q.items;
export const join_q = <T, U, K>(
  left: QueryRecord<T>,
  right: QueryRecord<U>,
  left_key: (value: T) => K,
  right_key: (value: U) => K
): QueryRecord<[T, U]> => ({
  items: iter.join_vec(left.items, right.items, left_key, right_key),
});

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
        return Option().Some(old);
      }
    }
    bucket.push({ key, value });
    this.sizeValue += 1;
    return Option().None;
  }

  get(key: K) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return Option().None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) {
        return Option().Some(entry.value);
      }
    }
    return Option().None;
  }

  remove(key: K) {
    const hash = runtimeHashValue(key);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option().None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option().Some(removed.value);
      }
    }
    return Option().None;
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
    return result === Option().None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    const result = this.map.remove(value);
    return result !== Option().None;
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
    if (this.data.length === 0) return Option().None;
    const value = this.data.shift() as T;
    return Option().Some(value);
  }

  pop_back() {
    if (this.data.length === 0) return Option().None;
    const value = this.data.pop() as T;
    return Option().Some(value);
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

type BTreeEntry<K, V> = { key: K; value: V };

export class BTreeMap<K, V> {
  private records: Array<BTreeEntry<K, V>>;

  constructor() {
    this.records = [];
  }

  static new<K, V>(): BTreeMap<K, V> {
    return new BTreeMap<K, V>();
  }

  private lowerBound(key: K): number {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareRuntimeValues(this.records[mid].key, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  insert(key: K, value: V) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      const previous = this.records[idx].value;
      this.records[idx].value = value;
      return Option().Some(previous);
    }
    this.records.splice(idx, 0, { key, value });
    return Option().None;
  }

  get(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      return Option().Some(this.records[idx].value);
    }
    return Option().None;
  }

  remove(key: K) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      const [removed] = this.records.splice(idx, 1);
      return Option().Some(removed.value);
    }
    return Option().None;
  }

  contains_key(key: K): boolean {
    const idx = this.lowerBound(key);
    return idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0;
  }

  len(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
  }

  keys(): Vec<K> {
    return Vec.from(this.records.map((entry) => entry.key));
  }

  values(): Vec<V> {
    return Vec.from(this.records.map((entry) => entry.value));
  }

  entries(): Vec<[K, V]> {
    return Vec.from(this.records.map((entry) => [entry.key, entry.value] as [K, V]));
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
  entries: <K, V>(m: BTreeMap<K, V>) => m.entries(),
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
    return this.map.insert(value, undefined) === Option().None;
  }

  contains(value: T): boolean {
    return this.map.contains_key(value);
  }

  remove(value: T): boolean {
    return this.map.remove(value) !== Option().None;
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

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (compareRuntimeValues(this.heap[parent], this.heap[index]) <= 0) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && compareRuntimeValues(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < length && compareRuntimeValues(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  push(value: T): void {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return Option().None;
    const top = this.heap[0];
    const last = this.heap.pop() as T;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return Option().Some(top);
  }

  peek() {
    return this.heap.length > 0 ? Option().Some(this.heap[0]) : Option().None;
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
