import { vec, Option } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime vec helpers', () => {
  test('new/len', () => {
    const v = vec.new<number>();
    expect(vec.len(v)).toBe(0);
  });

  test('push/get/len', () => {
    const v = vec.new<number>();
    vec.push(v, 42);
    vec.push(v, 100);
    expect(vec.len(v)).toBe(2);
    const got = vec.get(v, 1);
    expect(unwrapOption(got).$tag).toBe('Some');
    expect(unwrapOption(got).$payload).toBe(100);
  });

  test('get out of bounds', () => {
    const v = vec.new<number>();
    const got = vec.get(v, 0);
    expect(got).toBe(Option.None);
  });

  test('pop/clear', () => {
    const v = vec.new<number>();
    vec.push(v, 1);
    vec.push(v, 2);
    const popped = vec.pop(v);
    expect(unwrapOption(popped).$payload).toBe(2);
    vec.clear(v);
    expect(vec.len(v)).toBe(0);
    const empty = vec.pop(v);
    expect(empty).toBe(Option.None);
  });

  test('map/filter/fold/for_each', () => {
    const v = vec.new<number>();
    vec.push(v, 1);
    vec.push(v, 2);
    vec.push(v, 3);
    vec.push(v, 4);

    const doubled = vec.map(v, (value) => value * 2);
    expect(vec.len(doubled)).toBe(4);
    expect(unwrapOption(vec.get(doubled, 2)).$payload).toBe(6);

    const evens = vec.filter(doubled, (value) => value % 4 === 0);
    expect(vec.len(evens)).toBe(2);
    expect(unwrapOption(vec.get(evens, 0)).$payload).toBe(4);
    expect(unwrapOption(vec.get(evens, 1)).$payload).toBe(8);

    const sum = vec.fold(doubled, 0, (acc, value) => acc + value);
    expect(sum).toBe(20);

    let count = 0;
    vec.for_each(doubled, (value) => {
      if (value > 0) count += 1;
    });
    expect(count).toBe(4);
  });
});
