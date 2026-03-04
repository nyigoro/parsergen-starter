import { AtomicI32, sab_channel } from '../src/lumina-runtime.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string => (value as Tagged).$tag;
const getPayload = <T>(value: unknown): T => (value as Tagged).$payload as T;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe('sab_channel hardening', () => {
  test('typed round-trip for u32/f32/f64', async () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const u32 = sab_channel.bounded_u32(4);
    expect(sab_channel.send_u32(u32.sender, 4294967295)).toBe(true);
    const u32Recv = await sab_channel.recv_u32(u32.receiver);
    expect(getTag(u32Recv)).toBe('Some');
    expect(getPayload<number>(u32Recv) >>> 0).toBe(4294967295);
    sab_channel.close_u32(u32);

    const f32 = sab_channel.bounded_f32(4);
    expect(sab_channel.send_f32(f32.sender, Math.PI)).toBe(true);
    const f32Recv = await sab_channel.recv_f32(f32.receiver);
    expect(getTag(f32Recv)).toBe('Some');
    expect(Math.abs(getPayload<number>(f32Recv) - Math.fround(Math.PI))).toBeLessThan(1e-6);
    sab_channel.close_f32(f32);

    const f64 = sab_channel.bounded_f64(4);
    expect(sab_channel.send_f64(f64.sender, Math.E)).toBe(true);
    const f64Recv = await sab_channel.recv_f64(f64.receiver);
    expect(getTag(f64Recv)).toBe('Some');
    expect(Math.abs(getPayload<number>(f64Recv) - Math.E)).toBeLessThan(1e-12);
    sab_channel.close_f64(f64);
  });

  test('backpressure: send_timeout on full channel returns timeout', async () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const ch = sab_channel.bounded_i32(1);
    expect(sab_channel.send_i32(ch.sender, 1)).toBe(true);
    const timed = await sab_channel.send_timeout_i32(ch.sender, 2, 5);
    expect(getTag(timed)).toBe('Err');
    expect(String(getPayload(timed))).toContain('timeout');
    sab_channel.close_i32(ch);
  });

  test('backpressure: async send waits until receiver drains slot', async () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const ch = sab_channel.bounded_i32(1);
    expect(sab_channel.send_i32(ch.sender, 10)).toBe(true);

    let resolved = false;
    const pending = sab_channel.send_async_i32(ch.sender, 11).then((ok: boolean) => {
      resolved = ok;
      return ok;
    });

    await sleep(10);
    expect(resolved).toBe(false);

    const first = await sab_channel.recv_i32(ch.receiver);
    expect(getTag(first)).toBe('Some');
    expect(getPayload<number>(first)).toBe(10);
    expect(await pending).toBe(true);

    const second = await sab_channel.recv_i32(ch.receiver);
    expect(getTag(second)).toBe('Some');
    expect(getPayload<number>(second)).toBe(11);
    sab_channel.close_i32(ch);
  });

  test('close semantics: recv on closed empty returns None and send_timeout returns closed', async () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const ch = sab_channel.bounded_i32(2);
    sab_channel.close_i32(ch);

    const start = Date.now();
    const recv = await sab_channel.recv_i32(ch.receiver);
    const elapsed = Date.now() - start;
    expect(getTag(recv)).toBe('None');
    expect(elapsed).toBeLessThan(100);

    const send = await sab_channel.send_timeout_i32(ch.sender, 1, 20);
    expect(getTag(send)).toBe('Err');
    expect(String(getPayload(send))).toContain('closed');
  });

  test('stress: 10k i32 and 1k f32 values preserve order and value', async () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const intCount = 10_000;
    const intChannel = sab_channel.bounded_i32(64);
    const intProducer = (async () => {
      for (let i = 0; i < intCount; i += 1) {
        const ok = await sab_channel.send_async_i32(intChannel.sender, i);
        if (!ok) throw new Error(`send failed at ${i}`);
      }
      sab_channel.close_sender_i32(intChannel.sender);
    })();

    const intValues: number[] = [];
    while (intValues.length < intCount) {
      const next = await sab_channel.recv_i32(intChannel.receiver);
      if (getTag(next) === 'None') break;
      intValues.push(getPayload<number>(next));
    }
    await intProducer;
    expect(intValues.length).toBe(intCount);
    expect(intValues[0]).toBe(0);
    expect(intValues[intValues.length - 1]).toBe(intCount - 1);
    sab_channel.close_receiver_i32(intChannel.receiver);

    const floatCount = 1_000;
    const floatChannel = sab_channel.bounded_f32(64);
    const floatProducer = (async () => {
      for (let i = 0; i < floatCount; i += 1) {
        const ok = await sab_channel.send_async_f32(floatChannel.sender, i + 0.125);
        if (!ok) throw new Error(`f32 send failed at ${i}`);
      }
      sab_channel.close_sender_f32(floatChannel.sender);
    })();

    const floatValues: number[] = [];
    while (floatValues.length < floatCount) {
      const next = await sab_channel.recv_f32(floatChannel.receiver);
      if (getTag(next) === 'None') break;
      floatValues.push(getPayload<number>(next));
    }
    await floatProducer;
    expect(floatValues.length).toBe(floatCount);
    expect(Math.abs(floatValues[0] - 0.125)).toBeLessThan(1e-6);
    expect(Math.abs(floatValues[floatValues.length - 1] - (floatCount - 1 + 0.125))).toBeLessThan(1e-5);
    sab_channel.close_receiver_f32(floatChannel.receiver);
  });

  test('rapid open/close cycles keep channel close semantics consistent', () => {
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    for (let i = 0; i < 100; i += 1) {
      const ch = sab_channel.bounded_i32(2);
      sab_channel.close_i32(ch);
      expect(sab_channel.is_sender_closed_i32(ch.sender)).toBe(true);
      expect(sab_channel.is_receiver_closed_i32(ch.receiver)).toBe(true);
    }
  });

  test('MessageChannel fallback parity when SAB atomics are disabled', async () => {
    const atomicsSpy = jest.spyOn(AtomicI32, 'is_available').mockReturnValue(false);
    try {
      if (!sab_channel.is_available()) {
        expect(sab_channel.is_available()).toBe(false);
        return;
      }
      const ch = sab_channel.bounded_i32(2);
      expect(sab_channel.send_i32(ch.sender, 7)).toBe(true);
      const recv = await sab_channel.recv_i32(ch.receiver);
      expect(getTag(recv)).toBe('Some');
      expect(getPayload<number>(recv)).toBe(7);
      sab_channel.close_i32(ch);
      const closed = await sab_channel.send_timeout_i32(ch.sender, 9, 10);
      expect(getTag(closed)).toBe('Err');
    } finally {
      atomicsSpy.mockRestore();
    }
  });
});
