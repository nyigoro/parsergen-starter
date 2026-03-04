type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

describe('@std/web_streams runtime', () => {
  test('from_string + read_text round-trip', async () => {
    const { web_streams } = await loadRuntime();
    const stream = web_streams.from_string('hello streams');
    const text = await web_streams.read_text(stream);
    expect(getTag(text)).toBe('Ok');
    expect(getPayload<string>(text)).toBe('hello streams');
  });

  test('from_bytes + read_all + pipe transform', async () => {
    const { web_streams } = await loadRuntime();
    const source = web_streams.from_bytes([1, 2, 3]);
    const piped = web_streams.pipe(source, (chunk: number[]) => chunk.map((value) => value + 1));
    expect(piped).toBeGreaterThan(0);

    const all = await web_streams.read_all(piped);
    expect(getTag(all)).toBe('Ok');
    expect(getPayload<number[]>(all)).toEqual([2, 3, 4]);
  });

  test('error paths: cancelled reads, invalid fetch URL, transform failures', async () => {
    const { web_streams } = await loadRuntime();

    const canceled = web_streams.from_string('cancel');
    web_streams.cancel(canceled);
    const readAfterCancel = await web_streams.read_chunk(canceled);
    expect(getTag(readAfterCancel)).toBe('Err');

    const invalidFetch = await web_streams.from_fetch('://bad-url');
    expect(getTag(invalidFetch)).toBe('Err');

    const source = web_streams.from_bytes([1, 2, 3]);
    const badPipe = web_streams.pipe(source, () => {
      throw new Error('boom');
    });
    const failed = await web_streams.read_all(badPipe);
    expect(getTag(failed)).toBe('Err');
  });

  test('read_all on empty stream returns Ok(empty array)', async () => {
    const { web_streams } = await loadRuntime();
    const empty = web_streams.from_bytes([]);
    const all = await web_streams.read_all(empty);
    expect(getTag(all)).toBe('Ok');
    expect(getPayload<number[]>(all)).toEqual([]);
  });

  test('stress: 1MB payload, transform chains, and many cancellations', async () => {
    const { web_streams } = await loadRuntime();
    const payload = Array.from({ length: 1024 * 1024 }, (_, i) => i & 0xff);
    const handle = web_streams.from_bytes(payload);
    const all = await web_streams.read_all(handle);
    expect(getTag(all)).toBe('Ok');
    const out = getPayload<number[]>(all);
    expect(out).toHaveLength(payload.length);
    expect(out[0]).toBe(payload[0]);
    expect(out[out.length - 1]).toBe(payload[payload.length - 1]);

    const chainBase = web_streams.from_bytes([1, 2, 3]);
    const chain = [
      (chunk: number[]) => chunk.map((v) => v + 1),
      (chunk: number[]) => chunk.map((v) => v * 2),
      (chunk: number[]) => chunk.map((v) => v - 1),
      (chunk: number[]) => chunk.map((v) => v + 3),
      (chunk: number[]) => chunk.map((v) => v % 256),
    ].reduce((acc, fn) => web_streams.pipe(acc, fn), chainBase);
    const chainedOut = await web_streams.read_all(chain);
    expect(getTag(chainedOut)).toBe('Ok');
    expect(getPayload<number[]>(chainedOut)).toEqual([6, 8, 10]);

    const toCancel: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      toCancel.push(web_streams.from_string(`s${i}`));
    }
    for (const h of toCancel) {
      web_streams.cancel(h);
      const next = await web_streams.read_chunk(h);
      expect(getTag(next)).toBe('Err');
    }
  });

  test('handle cleanup: cancel and read_all/read_text release handles', async () => {
    const { web_streams } = await loadRuntime();

    const c = web_streams.from_string('x');
    web_streams.cancel(c);
    expect(getTag(await web_streams.read_chunk(c))).toBe('Err');

    const allHandle = web_streams.from_bytes([10, 11]);
    const all = await web_streams.read_all(allHandle);
    expect(getTag(all)).toBe('Ok');
    expect(getTag(await web_streams.read_chunk(allHandle))).toBe('Err');

    const textHandle = web_streams.from_string('text');
    const text = await web_streams.read_text(textHandle);
    expect(getTag(text)).toBe('Ok');
    expect(getTag(await web_streams.read_chunk(textHandle))).toBe('Err');
  });

  test('Node parity for text/bytes/pipe outputs', async () => {
    const { web_streams } = await loadRuntime();

    const textInput = 'node-parity';
    const textHandle = web_streams.from_string(textInput);
    const textOut = await web_streams.read_text(textHandle);
    expect(getTag(textOut)).toBe('Ok');
    expect(getPayload<string>(textOut)).toBe(textInput);

    const bytesInput = [4, 5, 6, 255];
    const bytesHandle = web_streams.from_bytes(bytesInput);
    const bytesOut = await web_streams.read_all(bytesHandle);
    expect(getTag(bytesOut)).toBe('Ok');
    expect(getPayload<number[]>(bytesOut)).toEqual(bytesInput);

    const piped = web_streams.pipe(web_streams.from_bytes([2, 4]), (chunk: number[]) =>
      chunk.map((value) => value * 3)
    );
    const pipedOut = await web_streams.read_all(piped);
    expect(getTag(pipedOut)).toBe('Ok');
    expect(getPayload<number[]>(pipedOut)).toEqual([6, 12]);
  });
});
