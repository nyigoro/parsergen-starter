import type { LuminaEnumLike } from '../src/runtime/value-runtime.js';
import { createWebGpuRuntime } from '../src/runtime/webgpu-runtime.js';
import { createMockNavigator, MockGpuDevice } from './helpers/webgpu-mock.js';

type Tagged = { $tag: string; $payload?: unknown };

const Result = {
  Ok: <T>(value: T): Tagged => ({ $tag: 'Ok', $payload: value }),
  Err: (message: string): Tagged => ({ $tag: 'Err', $payload: message }),
};

const isEnumLike = (value: unknown): value is LuminaEnumLike =>
  !!value &&
  typeof value === 'object' &&
  (typeof (value as { $tag?: unknown }).$tag === 'string' || typeof (value as { tag?: unknown }).tag === 'string');

const getEnumTag = (value: LuminaEnumLike): string =>
  '$tag' in value ? value.$tag : value.tag;

const getEnumPayload = (value: LuminaEnumLike): unknown =>
  '$payload' in value ? value.$payload : value.values?.[0];

const createRuntime = () =>
  createWebGpuRuntime({
    resultOk: Result.Ok,
    resultErr: Result.Err,
    isEnumLike,
    getEnumTag,
    getEnumPayload,
  });

describe('runtime webgpu runtime', () => {
  const previousNavigator = (globalThis as { navigator?: unknown }).navigator;

  afterEach(() => {
    (globalThis as { navigator?: unknown }).navigator = previousNavigator;
  });

  test('runtime instances keep independent handle state', () => {
    const device = new MockGpuDevice();
    const a = createRuntime();
    const b = createRuntime();

    const created = a.buffer_create(device, 16, a.GPU_BUFFER_USAGE_STORAGE | a.GPU_BUFFER_USAGE_COPY_DST);
    expect(created.$tag).toBe('Ok');

    expect(a.__debug_counts().buffers).toBe(1);
    expect(b.__debug_counts().buffers).toBe(0);

    a.buffer_destroy(created.$payload as number);
    expect(a.__debug_counts().buffers).toBe(0);
    expect(b.__debug_counts().buffers).toBe(0);
  });

  test('adapter and device requests follow navigator gpu availability', async () => {
    const unavailable = createRuntime();
    (globalThis as { navigator?: unknown }).navigator = undefined;
    expect((await unavailable.request_adapter()).$tag).toBe('Err');

    const device = new MockGpuDevice();
    const available = createRuntime();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const adapter = await available.request_adapter();
    expect(adapter.$tag).toBe('Ok');

    const requested = await available.request_device(adapter.$payload);
    expect(requested.$tag).toBe('Ok');
  });
});
