import { hashset } from '../src/lumina-runtime';

describe('HashSet<T>', () => {
  it('creates empty set', () => {
    const set = hashset.new<number>();
    expect(hashset.len(set)).toBe(0);
  });

  it('inserts and contains values', () => {
    const set = hashset.new<string>();

    const inserted1 = hashset.insert(set, 'alice');
    expect(inserted1).toBe(true);

    const inserted2 = hashset.insert(set, 'alice');
    expect(inserted2).toBe(false);

    expect(hashset.contains(set, 'alice')).toBe(true);
    expect(hashset.contains(set, 'bob')).toBe(false);
  });

  it('removes values', () => {
    const set = hashset.new<number>();
    hashset.insert(set, 42);
    hashset.insert(set, 100);

    const removed1 = hashset.remove(set, 42);
    expect(removed1).toBe(true);

    const removed2 = hashset.remove(set, 42);
    expect(removed2).toBe(false);

    expect(hashset.len(set)).toBe(1);
  });

  it('maintains uniqueness', () => {
    const set = hashset.new<number>();
    hashset.insert(set, 1);
    hashset.insert(set, 2);
    hashset.insert(set, 1);
    hashset.insert(set, 3);
    hashset.insert(set, 2);

    expect(hashset.len(set)).toBe(3);
  });

  it('gets all values', () => {
    const set = hashset.new<string>();
    hashset.insert(set, 'a');
    hashset.insert(set, 'b');
    hashset.insert(set, 'c');

    const values = hashset.values(set);
    expect(values.len()).toBe(3);
  });

  it('clears all values', () => {
    const set = hashset.new<number>();
    hashset.insert(set, 1);
    hashset.insert(set, 2);
    hashset.insert(set, 3);

    hashset.clear(set);
    expect(hashset.len(set)).toBe(0);
  });

  it('handles set operations', () => {
    const set = hashset.new<number>();

    hashset.insert(set, 1);
    hashset.insert(set, 2);
    hashset.insert(set, 3);
    hashset.insert(set, 4);

    expect(hashset.contains(set, 2)).toBe(true);
    expect(hashset.contains(set, 5)).toBe(false);

    hashset.remove(set, 2);
    expect(hashset.contains(set, 2)).toBe(false);
    expect(hashset.len(set)).toBe(3);
  });
});
