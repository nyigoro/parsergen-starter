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
});
