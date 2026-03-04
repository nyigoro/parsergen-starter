type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  readonly length: number;
};

const makeStorage = (opts?: {
  throwOnSetForKey?: string;
  throwOnLargeBytes?: number;
}): StorageLike => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      if (opts?.throwOnSetForKey && key === opts.throwOnSetForKey) {
        const err = new Error('Quota exceeded');
        (err as Error & { name?: string }).name = 'QuotaExceededError';
        throw err;
      }
      if (opts?.throwOnLargeBytes && Buffer.byteLength(value, 'utf8') > opts.throwOnLargeBytes) {
        const err = new Error('Quota exceeded');
        (err as Error & { name?: string }).name = 'QuotaExceededError';
        throw err;
      }
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    get length() {
      return data.size;
    },
  };
};

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

const restoreStorageGlobals = (): void => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }

  if (originalSessionStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  } else {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
};

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

describe('@std/web_storage runtime', () => {
  afterEach(() => {
    restoreStorageGlobals();
  });

  test('Node fallback local/session behavior + separation', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    const { web_storage } = await loadRuntime();

    expect(web_storage.is_available()).toBe(false);
    expect(getTag(web_storage.local_set('name', 'lumina'))).toBe('Ok');
    expect(getTag(web_storage.session_set('token', 'abc'))).toBe('Ok');

    const local = web_storage.local_get('name');
    const session = web_storage.session_get('token');
    expect(getTag(local)).toBe('Some');
    expect(getPayload<string>(local)).toBe('lumina');
    expect(getTag(session)).toBe('Some');
    expect(getPayload<string>(session)).toBe('abc');

    expect(getTag(web_storage.session_get('name'))).toBe('None');
    expect(getTag(web_storage.local_get('token'))).toBe('None');
  });

  test('quota exceeded returns Err and does not corrupt existing data', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: makeStorage({ throwOnSetForKey: 'boom' }),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: makeStorage(),
    });

    const { web_storage } = await loadRuntime();
    expect(web_storage.is_available()).toBe(true);
    expect(getTag(web_storage.local_set('ok', 'value'))).toBe('Ok');
    const failed = web_storage.local_set('boom', 'x');
    expect(getTag(failed)).toBe('Err');
    expect(getPayload<string>(failed).toLowerCase()).toContain('quota');

    const ok = web_storage.local_get('ok');
    expect(getTag(ok)).toBe('Some');
    expect(getPayload<string>(ok)).toBe('value');
  });

  test('missing keys return None and large writes never throw', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: makeStorage({ throwOnLargeBytes: 64 * 1024 }),
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: makeStorage({ throwOnLargeBytes: 64 * 1024 }),
    });

    const { web_storage } = await loadRuntime();
    expect(getTag(web_storage.local_get('missing'))).toBe('None');
    expect(getTag(web_storage.session_get('missing'))).toBe('None');

    const huge = 'x'.repeat(1024 * 1024);
    expect(() => web_storage.local_set('huge', huge)).not.toThrow();
    expect(() => web_storage.session_set('huge', huge)).not.toThrow();
    expect(['Ok', 'Err']).toContain(getTag(web_storage.local_set('huge2', huge)));
    expect(['Ok', 'Err']).toContain(getTag(web_storage.session_set('huge2', huge)));
  });

  test('stress set/clear cycles in fallback storage', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    const { web_storage } = await loadRuntime();

    for (let i = 0; i < 500; i += 1) {
      expect(getTag(web_storage.local_set(`k${i}`, `v${i}`))).toBe('Ok');
    }
    expect(web_storage.local_length()).toBe(500);
    web_storage.local_clear();
    expect(web_storage.local_length()).toBe(0);

    for (let round = 0; round < 100; round += 1) {
      for (let i = 0; i < 10; i += 1) {
        web_storage.local_set(`r${round}_${i}`, 'x');
      }
      web_storage.local_clear();
      expect(web_storage.local_length()).toBe(0);
    }
  });

  test('module reload resets fallback maps', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;

    const runtimeA = await loadRuntime();
    runtimeA.web_storage.local_set('persist', 'nope');
    expect(getTag(runtimeA.web_storage.local_get('persist'))).toBe('Some');

    const runtimeB = await loadRuntime();
    expect(getTag(runtimeB.web_storage.local_get('persist'))).toBe('None');
  });
});
