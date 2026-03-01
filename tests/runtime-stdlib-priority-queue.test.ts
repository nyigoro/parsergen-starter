import { priority_queue, Option } from '../src/lumina-runtime';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('PriorityQueue<T>', () => {
  it('pops items in min-heap order', () => {
    const q = priority_queue.new<number>();
    priority_queue.push(q, 5);
    priority_queue.push(q, 1);
    priority_queue.push(q, 3);
    priority_queue.push(q, 2);

    expect(unwrapOption(priority_queue.pop(q)).$payload).toBe(1);
    expect(unwrapOption(priority_queue.pop(q)).$payload).toBe(2);
    expect(unwrapOption(priority_queue.pop(q)).$payload).toBe(3);
    expect(unwrapOption(priority_queue.pop(q)).$payload).toBe(5);
  });

  it('supports peek/len/clear', () => {
    const q = priority_queue.new<number>();
    expect(priority_queue.peek(q)).toBe(Option.None);
    priority_queue.push(q, 9);
    priority_queue.push(q, 4);
    expect(unwrapOption(priority_queue.peek(q)).$payload).toBe(4);
    expect(priority_queue.len(q)).toBe(2);
    priority_queue.clear(q);
    expect(priority_queue.len(q)).toBe(0);
    expect(priority_queue.pop(q)).toBe(Option.None);
  });
});

