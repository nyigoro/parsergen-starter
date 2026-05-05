import {
  asResourceHandle,
  clearResourceRequest,
  clearResourceRecords,
  clearResourceScope,
  configureResourceCore,
  ensureResourceCurrent,
  invalidateResourceKey,
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
    clearResourceRecords();
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
    expect(second.requestId).toBe('');
    await Promise.resolve();
    expect(second.status.peek()).toBe('success');
    expect(listResourceRecords().some((record) => record.key === '{"id":1}')).toBe(true);
    expect(notifications.length).toBeGreaterThan(0);
  });

  test('preserves request identity on resource records', () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    const record = resolveResourceRecord('request:test', () => 'ok', {
      requestId: 'req-1',
      scope: 'route:dashboard',
    });
    expect(record.requestId).toBe('req-1');
    expect(record.scope).toBe('route:dashboard');
  });

  test('partitions request-scoped records while keeping logical key invalidation', async () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    let callsA = 0;
    let callsB = 0;
    const reqA = resolveResourceRecord('session', () => {
      callsA += 1;
      return `req-a:${callsA}`;
    }, { requestId: 'req-a', scope: 'route:dashboard' });
    const reqB = resolveResourceRecord('session', () => {
      callsB += 1;
      return `req-b:${callsB}`;
    }, { requestId: 'req-b', scope: 'route:dashboard' });

    expect(reqA).not.toBe(reqB);
    expect(listResourceRecords().filter((record) => record.key === 'session')).toHaveLength(2);

    await Promise.resolve();
    expect(reqA.data.peek()).toBe('req-a:1');
    expect(reqB.data.peek()).toBe('req-b:1');

    expect(invalidateResourceKey('session')).toBe(true);
    await Promise.resolve();
    expect(reqA.data.peek()).toBe('req-a:2');
    expect(reqB.data.peek()).toBe('req-b:2');
  });

  test('clears request-scoped route resources by request id', () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    resolveResourceRecord('session', () => 'a', { requestId: 'req-1', scope: 'route:dashboard' });
    resolveResourceRecord('session', () => 'b', { requestId: 'req-2', scope: 'route:dashboard' });

    expect(clearResourceRequest('req-1')).toBe(1);
    expect(listResourceRecords()).toHaveLength(1);
    expect(listResourceRecords()[0]?.requestId).toBe('req-2');
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

  test('invalidation suppresses stale writes without abort unless configured', async () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    let aborted = false;
    let resolveFirst: ((value: string) => void) | null = null;
    let calls = 0;
    const record = resolveResourceRecord('stale:test', (signal?: AbortSignal) => {
      calls += 1;
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      if (calls === 1) {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve('fresh');
    }, { abortOnRefresh: false });

    expect(record.status.peek()).toBe('loading');
    expect(invalidateResourceKey('stale:test')).toBe(true);
    expect(aborted).toBe(false);
    resolveFirst?.('stale');
    await Promise.resolve();
    await Promise.resolve();
    expect(record.data.peek()).toBe('fresh');
    expect(record.version).toBeGreaterThan(1);
  });

  test('clearing records aborts pending work and suppresses orphan writes', async () => {
    configureResourceCore({
      serializeKey: (key) => String(key),
      notifyDevtools: () => undefined,
    });

    let aborted = false;
    let resolveFirst: ((value: string) => void) | null = null;
    const record = resolveResourceRecord('clear:test', (signal?: AbortSignal) => {
      signal?.addEventListener('abort', () => {
        aborted = true;
      });
      return new Promise<string>((resolve) => {
        resolveFirst = resolve;
      });
    }, { scope: 'route:clear' });

    expect(clearResourceScope('route:clear')).toBe(1);
    expect(aborted).toBe(true);
    resolveFirst?.('orphan');
    await Promise.resolve();
    await Promise.resolve();
    expect(record.hasData.peek()).toBe(false);
    expect(record.promise).toBeNull();

    resolveResourceRecord('clear:all', () => new Promise(() => undefined), undefined);
    expect(listResourceRecords()).toHaveLength(1);
    clearResourceRecords();
    expect(listResourceRecords()).toHaveLength(0);
  });
});
