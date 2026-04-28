import { createChannelRuntime } from '../src/runtime/channel-runtime.js';

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

const createRuntime = () =>
  createChannelRuntime({
    getOption: () => Option,
    getResult: () => Result,
    isEnumLike,
    getEnumTag,
  });

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('runtime channel-runtime', () => {
  test('new/send/recv round-trip', async () => {
    const runtime = createRuntime();
    if (!runtime.is_available()) {
      expect(runtime.is_available()).toBe(false);
      return;
    }

    const ch = runtime.new<number>();
    expect(runtime.send(ch.sender, 42)).toBe(true);
    const result = await runtime.recv(ch.receiver);
    expect(getTag(result)).toBe('Some');
    expect(getPayload<number>(result)).toBe(42);
    runtime.close(ch);
  });

  test('clone sender and bounded backpressure stay functional', async () => {
    const runtime = createRuntime();
    if (!runtime.is_available()) {
      expect(runtime.is_available()).toBe(false);
      return;
    }

    const ch = runtime.bounded<number>(1);
    const clone = runtime.clone_sender(ch.sender);
    expect(runtime.send(ch.sender, 1)).toBe(true);
    expect(runtime.send(clone, 2)).toBe(false);

    const first = await runtime.recv(ch.receiver);
    expect(getPayload<number>(first)).toBe(1);

    await expect(runtime.send_async(clone, 2)).resolves.toBe(true);
    const second = await runtime.recv(ch.receiver);
    expect(getPayload<number>(second)).toBe(2);
    runtime.close(ch);
  });

  test('closing the sender resolves pending recv with None', async () => {
    const runtime = createRuntime();
    if (!runtime.is_available()) {
      expect(runtime.is_available()).toBe(false);
      return;
    }

    const ch = runtime.new<number>();
    const pending = runtime.recv(ch.receiver);
    runtime.close_sender(ch.sender);
    const result = await pending;
    expect(getTag(result)).toBe('None');
  });
});
