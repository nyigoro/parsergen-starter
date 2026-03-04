type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('@std/web_streams runtime', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

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

  test('cancel is idempotent and fetch-unavailable path returns Err', async () => {
    const { web_streams } = await loadRuntime();
    const handle = web_streams.from_string('cancel');
    expect(() => web_streams.cancel(handle)).not.toThrow();
    expect(() => web_streams.cancel(handle)).not.toThrow();

    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    try {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      const unavailable = await web_streams.from_fetch('https://example.com');
      expect(getTag(unavailable)).toBe('Err');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        writable: true,
        value: originalFetch,
      });
    }
  });
});
