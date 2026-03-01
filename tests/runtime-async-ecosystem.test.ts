import { Vec, async_channel, channel, join_all, timeout } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime async ecosystem', () => {
  it('exposes async_channel alias for channel', async () => {
    if (!channel.is_available()) return;
    const ch = async_channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      await expect(async_channel.send_async(tx, 42)).resolves.toBe(true);
      const got = await async_channel.recv(rx);
      expect(unwrapOption(got).$tag).toBe('Some');
      expect(unwrapOption(got).$payload).toBe(42);
    } finally {
      async_channel.close(ch);
    }
  });

  it('join_all resolves promise arrays in order', async () => {
    const out = await join_all<number>([Promise.resolve(1), Promise.resolve(2), 3]);
    expect(out.len()).toBe(3);
    expect(unwrapOption(out.get(0)).$payload).toBe(1);
    expect(unwrapOption(out.get(1)).$payload).toBe(2);
    expect(unwrapOption(out.get(2)).$payload).toBe(3);
  });

  it('join_all accepts Vec<Promise<T>> input', async () => {
    const values = Vec.from([Promise.resolve('a'), Promise.resolve('b')]);
    const out = await join_all<string>(values);
    expect(out.len()).toBe(2);
    expect(unwrapOption(out.get(0)).$payload).toBe('a');
    expect(unwrapOption(out.get(1)).$payload).toBe('b');
  });

  it('timeout delegates to async sleep', async () => {
    await expect(timeout(1)).resolves.toBeUndefined();
  });
});

