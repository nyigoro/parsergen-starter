import { createSystemRuntime } from '../src/runtime/system-runtime.js';

type TaggedValue = { $tag?: string; $payload?: unknown };

const Option = {
  Some: <T>(value: T) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
};

const Result = {
  Ok: <T>(value: T) => ({ $tag: 'Ok', $payload: value }),
  Err: (message: string) => ({ $tag: 'Err', $payload: message }),
};

const isEnumLike = (value: unknown): value is { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] } =>
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
  createSystemRuntime({
    formatValue: (value) => String(value),
    getOption: () => Option,
    getResult: () => Result,
    isEnumLike,
    getEnumTag,
    getEnumPayload,
  });

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('runtime system-runtime', () => {
  test('toJsonString normalizes enums and circular references', () => {
    const runtime = createRuntime();
    const circular: Record<string, unknown> = { self: null };
    circular.self = circular;

    const json = runtime.toJsonString({
      some: Option.Some('value'),
      circular,
    });

    expect(json).toContain('"$tag": "Some"');
    expect(json).toContain('[Circular]');
  });

  test('io.readLine consumes injected stdin lines', () => {
    const runtime = createRuntime();
    (globalThis as { __luminaStdin?: string }).__luminaStdin = 'alpha\nbeta';

    expect(runtime.io.readLine()).toMatchObject({ $tag: 'Some', $payload: 'alpha' });
    expect(runtime.io.readLine()).toMatchObject({ $tag: 'Some', $payload: 'beta' });
    expect(runtime.io.readLine()).toMatchObject({ $tag: 'None' });

    delete (globalThis as { __luminaStdin?: string }).__luminaStdin;
  });

  test('http.fetch blocks local hosts for security', async () => {
    const runtime = createRuntime();
    const result = await runtime.http.get('http://127.0.0.1:3000/private');

    expect(getTag(result)).toBe('Err');
    expect(String(getPayload(result))).toContain('Blocked host');
  });

  test('regex and crypto helpers work through the extracted runtime', async () => {
    const runtime = createRuntime();

    const regexResult = runtime.regex.findAll('a.', 'ab ac');
    expect(getTag(regexResult)).toBe('Ok');
    expect(getPayload<string[]>(regexResult)).toEqual(['ab', 'ac']);

    const digest = await runtime.crypto.sha256('lumina');
    expect(getTag(digest)).toBe('Ok');
    expect(getPayload<string>(digest)).toMatch(/^[a-f0-9]{64}$/);
  });

  test('path and json helpers stay functional', () => {
    const runtime = createRuntime();

    const ext = runtime.path.extension('archive.tar.gz');
    expect(getTag(ext)).toBe('Some');
    expect(getPayload<string>(ext)).toBe('gz');

    const encoded = runtime.json.to_string({ ok: true });
    expect(getTag(encoded)).toBe('Ok');
    const decoded = runtime.json.from_string(getPayload<string>(encoded));
    expect(getTag(decoded)).toBe('Ok');
    expect(getPayload<{ ok: boolean }>(decoded)).toEqual({ ok: true });
  });
});
