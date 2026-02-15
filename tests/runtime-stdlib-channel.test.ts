import { channel } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime channel helpers', () => {
  const isAvailable = channel.is_available();
  const waitForEventLoop = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const sendWithRetry = async (sender: unknown, value: unknown, attempts = 20): Promise<boolean> => {
    for (let i = 0; i < attempts; i += 1) {
      if (channel.send(sender as never, value as never)) return true;
      await waitForEventLoop();
    }
    return false;
  };

  const closePair = (ch: { sender: unknown; receiver: unknown }) => {
    try {
      channel.close_sender(ch.sender as never);
    } catch {
      // ignore
    }
    try {
      channel.close_receiver(ch.receiver as never);
    } catch {
      // ignore
    }
  };

  test('new/send/recv', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const sender = ch.sender;
    const receiver = ch.receiver;
    try {
      expect(channel.send(sender, 42)).toBe(true);
      const result = await channel.recv(receiver);
      expect(unwrapOption(result).$tag).toBe('Some');
      expect(unwrapOption(result).$payload).toBe(42);
    } finally {
      closePair(ch);
    }
  });

  test('try_recv returns None when empty', () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    try {
      const result = channel.try_recv(ch.receiver);
      expect(unwrapOption(result).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('close_sender yields None after drain', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const sender = ch.sender;
    const receiver = ch.receiver;
    try {
      channel.send(sender, 7);
      channel.close_sender(sender);

      const first = await channel.recv(receiver);
      expect(unwrapOption(first).$payload).toBe(7);

      const second = await channel.recv(receiver);
      expect(unwrapOption(second).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('bounded capacity enforces backpressure', async () => {
    if (!isAvailable) return;
    const ch = channel.bounded<number>(1);
    const sender = ch.sender;
    const receiver = ch.receiver;
    try {
      expect(channel.send(sender, 1)).toBe(true);
      expect(channel.send(sender, 2)).toBe(false);

      const first = await channel.recv(receiver);
      expect(unwrapOption(first).$payload).toBe(1);

      expect(await sendWithRetry(sender, 2)).toBe(true);
      const second = await channel.recv(receiver);
      expect(unwrapOption(second).$payload).toBe(2);
    } finally {
      closePair(ch);
    }
  });

  test('capacity zero requires a waiting receiver', async () => {
    if (!isAvailable) return;
    const ch = channel.bounded<number>(0);
    const sender = ch.sender;
    const receiver = ch.receiver;
    try {
      expect(channel.send(sender, 1)).toBe(false);

      const pending = channel.recv(receiver);
      expect(await sendWithRetry(sender, 99)).toBe(true);

      const result = await pending;
      expect(unwrapOption(result).$payload).toBe(99);
    } finally {
      closePair(ch);
    }
  });
});
