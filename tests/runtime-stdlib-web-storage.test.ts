type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('@std/web_storage runtime', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('local storage set/get/remove/clear behavior', async () => {
    const { web_storage } = await loadRuntime();

    expect(getTag(web_storage.local_set('name', 'lumina'))).toBe('Ok');
    const hit = web_storage.local_get('name');
    expect(getTag(hit)).toBe('Some');
    expect(getPayload<string>(hit)).toBe('lumina');

    web_storage.local_remove('name');
    expect(getTag(web_storage.local_get('name'))).toBe('None');

    web_storage.local_set('a', '1');
    web_storage.local_set('b', '2');
    expect(web_storage.local_length()).toBeGreaterThanOrEqual(2);
    web_storage.local_clear();
    expect(web_storage.local_length()).toBe(0);
  });

  test('session storage set/get/remove/clear behavior', async () => {
    const { web_storage } = await loadRuntime();

    expect(getTag(web_storage.session_set('token', 'abc'))).toBe('Ok');
    const hit = web_storage.session_get('token');
    expect(getTag(hit)).toBe('Some');
    expect(getPayload<string>(hit)).toBe('abc');

    web_storage.session_remove('token');
    expect(getTag(web_storage.session_get('token'))).toBe('None');

    web_storage.session_set('x', '1');
    web_storage.session_set('y', '2');
    expect(web_storage.session_length()).toBeGreaterThanOrEqual(2);
    web_storage.session_clear();
    expect(web_storage.session_length()).toBe(0);
  });

  test('is_available returns a boolean without throwing', async () => {
    const { web_storage } = await loadRuntime();
    expect(typeof web_storage.is_available()).toBe('boolean');
  });
});
