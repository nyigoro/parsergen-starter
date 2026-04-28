import { createConcurrencyRuntime, ThreadHandle } from '../src/runtime/concurrency-runtime.js';

type TaggedValue = { $tag?: string; $payload?: unknown };

const Option = {
  Some: <T>(value: T) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
};

const Result = {
  Ok: <T>(value: T) => ({ $tag: 'Ok', $payload: value }),
  Err: (message: string) => ({ $tag: 'Err', $payload: message }),
};

const isEnumLike = (
  value: unknown
): value is { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] } =>
  !!value &&
  typeof value === 'object' &&
  (typeof (value as { $tag?: unknown }).$tag === 'string' || typeof (value as { tag?: unknown }).tag === 'string');

const getEnumTag = (value: { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] }): string =>
  (value as { $tag?: string }).$tag ?? (value as { tag?: string }).tag ?? 'Unknown';

const getEnumPayload = (value: { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] }): unknown => {
  if ((value as { $payload?: unknown }).$payload !== undefined) {
    return (value as { $payload?: unknown }).$payload;
  }
  const values = (value as { values?: unknown[] }).values;
  if (!values) return undefined;
  return Array.isArray(values) && values.length === 1 ? values[0] : values;
};

const createRuntime = () =>
  createConcurrencyRuntime({
    getOption: () => Option,
    getResult: () => Result,
    isEnumLike,
    getEnumTag,
    getEnumPayload,
  });

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('runtime concurrency-runtime', () => {
  test('thread.spawn wraps function tasks in ThreadHandle results', async () => {
    const runtime = createRuntime();
    const handle = runtime.thread.spawn(() => 84);

    expect(handle instanceof ThreadHandle).toBe(true);
    if (!(handle instanceof ThreadHandle)) return;

    const joined = await runtime.thread.join(handle);
    expect(getTag(joined)).toBe('Ok');
    expect(getPayload(joined)).toBe(84);
  });

  test('thread.join rejects invalid handles', () => {
    const runtime = createRuntime();
    expect(() => runtime.thread.join({})).toThrow('Invalid thread handle');
  });

  test('web_worker and spawn_worker validate bad specifiers through Result.Err', async () => {
    const runtime = createRuntime();

    const badThread = await runtime.thread.spawn_worker('');
    expect(getTag(badThread)).toBe('Err');

    const badWorker = await runtime.web_worker.spawn('   ');
    expect(getTag(badWorker)).toBe('Err');
  });

  test('web_streams round-trip text and transformed bytes', async () => {
    const runtime = createRuntime();

    const textHandle = runtime.web_streams.from_string('hello concurrency');
    const text = await runtime.web_streams.read_text(textHandle);
    expect(getTag(text)).toBe('Ok');
    expect(getPayload<string>(text)).toBe('hello concurrency');

    const base = runtime.web_streams.from_bytes([1, 2, 3]);
    const piped = runtime.web_streams.pipe(base, (chunk: number[]) => chunk.map((value) => value + 2));
    const bytes = await runtime.web_streams.read_all(piped);
    expect(getTag(bytes)).toBe('Ok');
    expect(getPayload<number[]>(bytes)).toEqual([3, 4, 5]);
  });
});
