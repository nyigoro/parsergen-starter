import { channel } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };
const unwrapResult = (value: unknown) => value as { $tag?: string; $payload?: unknown };

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

  test('clone_sender supports multiple producers', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx0 = ch.sender;
    const tx1 = channel.clone_sender(tx0);
    const rx = ch.receiver;
    try {
      expect(channel.send(tx0, 10)).toBe(true);
      expect(channel.send(tx1, 20)).toBe(true);
      channel.close_sender(tx0);
      channel.close_sender(tx1);

      const first = await channel.recv(rx);
      const second = await channel.recv(rx);
      const third = await channel.recv(rx);
      const values = [unwrapOption(first).$payload, unwrapOption(second).$payload].sort((a, b) =>
        Number(a) - Number(b)
      );
      expect(values).toEqual([10, 20]);
      expect(unwrapOption(third).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('closing one producer does not close channel while clones remain', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx0 = ch.sender;
    const tx1 = channel.clone_sender(tx0);
    const rx = ch.receiver;
    try {
      channel.close_sender(tx0);
      expect(channel.send(tx1, 99)).toBe(true);
      channel.close_sender(tx1);

      const value = await channel.recv(rx);
      const done = await channel.recv(rx);
      expect(unwrapOption(value).$payload).toBe(99);
      expect(unwrapOption(done).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('bounded capacity is shared by cloned senders', async () => {
    if (!isAvailable) return;
    const ch = channel.bounded<number>(1);
    const tx0 = ch.sender;
    const tx1 = channel.clone_sender(tx0);
    const rx = ch.receiver;
    try {
      expect(channel.send(tx0, 1)).toBe(true);
      expect(channel.send(tx1, 2)).toBe(false);

      const first = await channel.recv(rx);
      expect(unwrapOption(first).$payload).toBe(1);
      expect(await sendWithRetry(tx1, 2)).toBe(true);

      const second = await channel.recv(rx);
      expect(unwrapOption(second).$payload).toBe(2);
      channel.close_sender(tx0);
      channel.close_sender(tx1);
    } finally {
      closePair(ch);
    }
  });

  test('send_async waits for receiver on rendezvous channel', async () => {
    if (!isAvailable) return;
    const ch = channel.bounded<number>(0);
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      const pendingSend = tx.send(77);
      const value = await channel.recv(rx);
      expect(unwrapOption(value).$payload).toBe(77);
      await expect(pendingSend).resolves.toBe(true);
      channel.close_sender(tx);
      const done = await channel.recv(rx);
      expect(unwrapOption(done).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('module send_async resolves true when value is delivered', async () => {
    if (!isAvailable) return;
    const ch = channel.bounded<number>(1);
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      await expect(channel.send_async(tx, 5)).resolves.toBe(true);
      const value = await channel.recv(rx);
      expect(unwrapOption(value).$payload).toBe(5);
    } finally {
      closePair(ch);
    }
  });

  test('graceful shutdown drains then returns None', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      expect(channel.send(tx, 1)).toBe(true);
      expect(channel.send(tx, 2)).toBe(true);
      channel.close_sender(tx);

      const a = await channel.recv(rx);
      const b = await channel.recv(rx);
      const done = await channel.recv(rx);
      expect(unwrapOption(a).$payload).toBe(1);
      expect(unwrapOption(b).$payload).toBe(2);
      expect(unwrapOption(done).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('drop aliases and closed-state helpers work', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      expect(channel.is_sender_closed(tx)).toBe(false);
      expect(channel.is_receiver_closed(rx)).toBe(false);
      channel.drop_sender(tx);
      expect(channel.is_sender_closed(tx)).toBe(true);
      channel.drop_receiver(rx);
      expect(channel.is_receiver_closed(rx)).toBe(true);
    } finally {
      closePair(ch);
    }
  });

  test('send_result surfaces error after receiver close', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      channel.close_receiver(rx);
      let result = channel.send_result(tx, 10);
      for (let i = 0; i < 20 && unwrapResult(result).$tag !== 'Err'; i += 1) {
        await waitForEventLoop();
        result = channel.send_result(tx, 10);
      }
      expect(unwrapResult(result).$tag).toBe('Err');
      expect(String(unwrapResult(result).$payload)).toContain('receiver');
    } finally {
      closePair(ch);
    }
  });

  test('recv_result wraps graceful close as Ok(None)', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      channel.close_sender(tx);
      const result = await channel.recv_result(rx);
      expect(unwrapResult(result).$tag).toBe('Ok');
      const option = unwrapResult(result).$payload;
      expect(unwrapOption(option).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });

  test('channel.close shuts down both sides', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;
    try {
      channel.close(ch);
      expect(channel.is_sender_closed(tx)).toBe(true);
      expect(channel.is_receiver_closed(rx)).toBe(true);
      expect(channel.send(tx, 1)).toBe(false);
      const value = await channel.recv(rx);
      expect(unwrapOption(value).$tag ?? 'None').toBe('None');
    } finally {
      closePair(ch);
    }
  });
});
