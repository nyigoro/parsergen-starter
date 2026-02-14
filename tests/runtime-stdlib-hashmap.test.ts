import { hashmap, Option } from '../src/lumina-runtime';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('HashMap<K,V>', () => {
  it('creates empty hashmap', () => {
    const map = hashmap.new<string, number>();
    expect(hashmap.len(map)).toBe(0);
  });

  it('inserts and gets values', () => {
    const map = hashmap.new<string, number>();
    hashmap.insert(map, 'alice', 30);
    hashmap.insert(map, 'bob', 25);

    const age = hashmap.get(map, 'alice');
    expect(unwrapOption(age).$tag).toBe('Some');
    expect(unwrapOption(age).$payload).toBe(30);
  });

  it('returns None for missing keys', () => {
    const map = hashmap.new<string, number>();
    const result = hashmap.get(map, 'missing');
    expect(result).toBe(Option.None);
  });

  it('overwrites existing keys', () => {
    const map = hashmap.new<string, number>();
    const old1 = hashmap.insert(map, 'alice', 30);
    expect(old1).toBe(Option.None);

    const old2 = hashmap.insert(map, 'alice', 31);
    expect(unwrapOption(old2).$tag).toBe('Some');
    expect(unwrapOption(old2).$payload).toBe(30);

    const current = hashmap.get(map, 'alice');
    expect(unwrapOption(current).$payload).toBe(31);
  });

  it('removes keys', () => {
    const map = hashmap.new<string, number>();
    hashmap.insert(map, 'alice', 30);

    const removed = hashmap.remove(map, 'alice');
    expect(unwrapOption(removed).$tag).toBe('Some');
    expect(unwrapOption(removed).$payload).toBe(30);

    expect(hashmap.len(map)).toBe(0);
  });

  it('checks key existence', () => {
    const map = hashmap.new<string, number>();
    hashmap.insert(map, 'alice', 30);

    expect(hashmap.contains_key(map, 'alice')).toBe(true);
    expect(hashmap.contains_key(map, 'bob')).toBe(false);
  });

  it('gets keys and values', () => {
    const map = hashmap.new<string, number>();
    hashmap.insert(map, 'alice', 30);
    hashmap.insert(map, 'bob', 25);

    const keys = hashmap.keys(map);
    const values = hashmap.values(map);

    expect(keys.len()).toBe(2);
    expect(values.len()).toBe(2);
  });

  it('clears all entries', () => {
    const map = hashmap.new<string, number>();
    hashmap.insert(map, 'alice', 30);
    hashmap.insert(map, 'bob', 25);

    hashmap.clear(map);
    expect(hashmap.len(map)).toBe(0);
  });
});
