import { list, Option } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => (value as { $tag?: string; $payload?: unknown });

describe('runtime list helpers', () => {
  test('map/filter/fold', () => {
    const mapped = list.map((x: number) => x * 2, [1, 2, 3]);
    expect(mapped).toEqual([2, 4, 6]);

    const filtered = list.filter((x: number) => x % 2 === 1, [1, 2, 3, 4]);
    expect(filtered).toEqual([1, 3]);

    const sum = list.fold((acc: number, x: number) => acc + x, 0, [1, 2, 3]);
    expect(sum).toBe(6);
  });

  test('reverse/length/append', () => {
    expect(list.reverse([1, 2, 3])).toEqual([3, 2, 1]);
    expect(list.length([1, 2, 3])).toBe(3);
    expect(list.append([1, 2], [3])).toEqual([1, 2, 3]);
  });

  test('take/drop', () => {
    expect(list.take(2, [1, 2, 3])).toEqual([1, 2]);
    expect(list.drop(2, [1, 2, 3])).toEqual([3]);
    expect(list.take(-1, [1, 2, 3])).toEqual([]);
    expect(list.drop(-1, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test('find/any/all', () => {
    const found = list.find((x: number) => x > 2, [1, 2, 3]);
    expect(unwrapOption(found).$tag).toBe('Some');
    expect(unwrapOption(found).$payload).toBe(3);

    const missing = list.find((x: number) => x > 5, [1, 2, 3]);
    expect(missing).toBe(Option.None);

    expect(list.any((x: number) => x > 2, [1, 2, 3])).toBe(true);
    expect(list.all((x: number) => x > 0, [1, 2, 3])).toBe(true);
    expect(list.all((x: number) => x > 2, [1, 2, 3])).toBe(false);
  });
});
