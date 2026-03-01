import { deque, Option } from '../src/lumina-runtime';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('Deque<T>', () => {
  it('pushes and pops from both ends', () => {
    const d = deque.new<number>();
    deque.push_front(d, 1);
    deque.push_back(d, 2);
    deque.push_front(d, 0);

    expect(deque.len(d)).toBe(3);
    expect(unwrapOption(deque.pop_front(d)).$payload).toBe(0);
    expect(unwrapOption(deque.pop_back(d)).$payload).toBe(2);
    expect(unwrapOption(deque.pop_front(d)).$payload).toBe(1);
  });

  it('returns None when empty', () => {
    const d = deque.new<number>();
    expect(deque.pop_front(d)).toBe(Option.None);
    expect(deque.pop_back(d)).toBe(Option.None);
  });

  it('clears deque', () => {
    const d = deque.new<number>();
    deque.push_back(d, 1);
    deque.push_back(d, 2);
    deque.clear(d);
    expect(deque.len(d)).toBe(0);
    expect(deque.pop_front(d)).toBe(Option.None);
  });
});

