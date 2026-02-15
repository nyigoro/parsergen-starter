import { channel } from '../src/lumina-runtime.js';

const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime channel helpers', () => {
  const isAvailable = channel.is_available();

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

    expect(channel.send(sender, 42)).toBe(true);

    const result = await channel.recv(receiver);
    expect(unwrapOption(result).$tag).toBe('Some');
    expect(unwrapOption(result).$payload).toBe(42);
    closePair(ch);
  });

  test('try_recv returns None when empty', () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const result = channel.try_recv(ch.receiver);
    expect(unwrapOption(result).$tag ?? 'None').toBe('None');
    closePair(ch);
  });

  test('close_sender yields None after drain', async () => {
    if (!isAvailable) return;
    const ch = channel.new<number>();
    const sender = ch.sender;
    const receiver = ch.receiver;

    channel.send(sender, 7);
    channel.close_sender(sender);

    const first = await channel.recv(receiver);
    expect(unwrapOption(first).$payload).toBe(7);

    const second = await channel.recv(receiver);
    expect(unwrapOption(second).$tag ?? 'None').toBe('None');
    closePair(ch);
  });
});
