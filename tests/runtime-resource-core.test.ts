import {
  asResourceHandle,
  configureResourceCore,
  ensureResourceCurrent,
  listResourceRecords,
  ResourceHandle,
  resolveResourceRecord,
  startResourceLoad,
} from '../src/runtime/resource-core.js';
import { configureReactiveCore } from '../src/runtime/reactive-core.js';

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) return value.slice() as T;
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) } as T;
  return value;
};

describe('runtime resource core', () => {
  beforeEach(() => {
    configureReactiveCore({
      cloneValue,
      equalsValue: Object.is,
      scheduleMicrotask: (fn) => {
        fn();
      },
      registerSignal: () => 0,
      unregisterSignal: () => undefined,
      notifyDevtools: () => undefined,
    });
  });

  test('deduplicates records by normalized key and updates options', async () => {
    const notifications: string[] = [];
    configureResourceCore({
      serializeKey: (key) => JSON.stringify(key),
      notifyDevtools: () => {
        notifications.push('notify');
      },
    });

    let calls = 0;
    const first = resolveResourceRecord({ id: 1 }, async () => {
      calls += 1;
      return 'Ada';
    }, { ttlMs: 5 });
    const second = resolveResourceRecord({ id: 1 }, async () => {
      calls += 1;
      return 'Grace';
    }, { ttlMs: 10, enabled: false });

    expect(first).toBe(second);
    expect(calls).toBe(1);
    expect(second.ttlMs).toBe(10);
    expect(second.enabled).toBe(false);
    await Promise.resolve();
    expect(second.status.peek()).toBe('success');
    expect(listResourceRecords().some((record) => record.key === '{"id":1}')).toBe(true);
    expect(notifications.length).toBeGreaterThan(0);
  });

  test('ensures stale resources reload and disabled records require force', async () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    let calls = 0;
    const record = resolveResourceRecord('profile:test', () => {
      calls += 1;
      return calls === 1 ? 'first' : 'second';
    }, { ttlMs: 5 });

    await Promise.resolve();
    expect(record.data.peek()).toBe('first');

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(100);
    record.expiresAt = 10;
    ensureResourceCurrent(record);
    await Promise.resolve();
    nowSpy.mockRestore();

    expect(calls).toBe(2);
    expect(record.data.peek()).toBe('second');

    const disabled = resolveResourceRecord('disabled:test', () => 'off', { enabled: false });
    await expect(startResourceLoad(disabled, false)).rejects.toThrow(/disabled/);
    await expect(startResourceLoad(disabled, true)).resolves.toBe('off');
  });

  test('resource handles validate api usage structurally', () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    const handle = new ResourceHandle(resolveResourceRecord('handle:test', () => 'ok', undefined));
    expect(asResourceHandle(handle, 'api')).toBe(handle);
    expect(() => asResourceHandle({}, 'api')).toThrow(/resource handle/);
  });
});
