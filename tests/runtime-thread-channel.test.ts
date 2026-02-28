import { channel, thread } from '../src/lumina-runtime.js';

const unwrapResult = (value: unknown) => value as { $tag?: string; $payload?: unknown };
const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime thread + channel integration', () => {
  const waitForEventLoop = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  test('producer/consumer pattern with local thread handles', async () => {
    if (!thread.is_available() || !channel.is_available()) return;

    const ch = channel.bounded<number>(2);
    const tx0 = ch.sender;
    const tx1 = channel.clone_sender(tx0);
    const tx2 = channel.clone_sender(tx0);
    const rx = ch.receiver;

    const producer = async (tx: typeof tx1, start: number, end: number): Promise<boolean> => {
      for (let i = start; i < end; i += 1) {
        const ok = await tx.send(i);
        if (!ok) return false;
      }
      tx.close();
      return true;
    };

    try {
      channel.close_sender(tx0);
      const h1 = thread.spawn(() => producer(tx1, 0, 5));
      const h2 = thread.spawn(() => producer(tx2, 5, 10));

      const received: number[] = [];
      while (received.length < 10) {
        const next = await channel.recv(rx);
        if (unwrapOption(next).$tag === 'Some') {
          received.push(Number(unwrapOption(next).$payload));
        } else {
          break;
        }
      }

      const j1 = await thread.join(h1 as never);
      const j2 = await thread.join(h2 as never);

      expect(unwrapResult(j1).$tag).toBe('Ok');
      expect(unwrapResult(j1).$payload).toBe(true);
      expect(unwrapResult(j2).$tag).toBe('Ok');
      expect(unwrapResult(j2).$payload).toBe(true);

      received.sort((a, b) => a - b);
      expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const drained = await channel.recv(rx);
      expect(unwrapOption(drained).$tag ?? 'None').toBe('None');
    } finally {
      channel.close(ch);
    }
  });

  test('drop semantics + error handling propagate through thread join', async () => {
    if (!thread.is_available() || !channel.is_available()) return;

    const ch = channel.new<number>();
    const tx = ch.sender;
    const rx = ch.receiver;

    try {
      channel.drop_receiver(rx);
      const h = thread.spawn(async () => {
        for (let i = 0; i < 20; i += 1) {
          const result = tx.send_result(42);
          if (unwrapResult(result).$tag === 'Err') return result;
          await waitForEventLoop();
        }
        return tx.send_result(42);
      });
      const joined = await thread.join(h as never);

      expect(unwrapResult(joined).$tag).toBe('Ok');
      const sendResult = unwrapResult(joined).$payload;
      expect(unwrapResult(sendResult).$tag).toBe('Err');
      expect(String(unwrapResult(sendResult).$payload)).toContain('receiver');
    } finally {
      channel.drop_sender(tx);
    }
  });
});
