import { btreemap, btreeset, vec, Option, __lumina_register_trait_impl, __lumina_struct } from '../src/lumina-runtime';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('BTreeMap<K,V>', () => {
  it('stores and iterates keys in sorted order', () => {
    const map = btreemap.new<number, string>();
    btreemap.insert(map, 3, 'c');
    btreemap.insert(map, 1, 'a');
    btreemap.insert(map, 2, 'b');

    const keys = btreemap.keys(map);
    expect(vec.len(keys)).toBe(3);
    expect(unwrapOption(vec.get(keys, 0)).$payload).toBe(1);
    expect(unwrapOption(vec.get(keys, 1)).$payload).toBe(2);
    expect(unwrapOption(vec.get(keys, 2)).$payload).toBe(3);
  });

  it('insert returns previous value when key exists', () => {
    const map = btreemap.new<number, string>();
    expect(btreemap.insert(map, 1, 'a')).toBe(Option.None);
    const old = btreemap.insert(map, 1, 'updated');
    expect(unwrapOption(old).$tag).toBe('Some');
    expect(unwrapOption(old).$payload).toBe('a');
    expect(unwrapOption(btreemap.get(map, 1)).$payload).toBe('updated');
  });

  it('remove and entries work', () => {
    const map = btreemap.new<number, string>();
    btreemap.insert(map, 2, 'b');
    btreemap.insert(map, 1, 'a');

    const removed = btreemap.remove(map, 2);
    expect(unwrapOption(removed).$payload).toBe('b');
    expect(btreemap.contains_key(map, 2)).toBe(false);

    const entries = btreemap.entries(map);
    expect(vec.len(entries)).toBe(1);
    expect(unwrapOption(vec.get(entries, 0)).$payload).toEqual([1, 'a']);
  });

  it('supports custom Ord trait for ordered keys', () => {
    __lumina_register_trait_impl('Ord', 'Point', (left: unknown, right: unknown) => {
      const a = left as { x: number; y: number };
      const b = right as { x: number; y: number };
      if (a.x < b.x) return { $tag: 'Less' };
      if (a.x > b.x) return { $tag: 'Greater' };
      if (a.y < b.y) return { $tag: 'Less' };
      if (a.y > b.y) return { $tag: 'Greater' };
      return { $tag: 'Equal' };
    });

    const map = btreemap.new<{ x: number; y: number }, string>();
    btreemap.insert(map, __lumina_struct('Point', { x: 2, y: 0 }), 'b');
    btreemap.insert(map, __lumina_struct('Point', { x: 1, y: 9 }), 'a');
    btreemap.insert(map, __lumina_struct('Point', { x: 3, y: 1 }), 'c');

    const keys = btreemap.keys(map);
    expect((unwrapOption(vec.get(keys, 0)).$payload as { x: number }).x).toBe(1);
    expect((unwrapOption(vec.get(keys, 1)).$payload as { x: number }).x).toBe(2);
    expect((unwrapOption(vec.get(keys, 2)).$payload as { x: number }).x).toBe(3);
  });
});

describe('BTreeSet<T>', () => {
  it('keeps sorted unique values', () => {
    const set = btreeset.new<number>();
    expect(btreeset.insert(set, 3)).toBe(true);
    expect(btreeset.insert(set, 1)).toBe(true);
    expect(btreeset.insert(set, 2)).toBe(true);
    expect(btreeset.insert(set, 2)).toBe(false);

    const values = btreeset.values(set);
    expect(vec.len(values)).toBe(3);
    expect(unwrapOption(vec.get(values, 0)).$payload).toBe(1);
    expect(unwrapOption(vec.get(values, 1)).$payload).toBe(2);
    expect(unwrapOption(vec.get(values, 2)).$payload).toBe(3);
  });

  it('removes and clears', () => {
    const set = btreeset.new<number>();
    btreeset.insert(set, 1);
    btreeset.insert(set, 2);
    expect(btreeset.remove(set, 2)).toBe(true);
    expect(btreeset.contains(set, 2)).toBe(false);
    btreeset.clear(set);
    expect(btreeset.len(set)).toBe(0);
  });
});
