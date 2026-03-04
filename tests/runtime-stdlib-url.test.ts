type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

describe('@std/url runtime', () => {
  test('parse + field access return URL components', async () => {
    const { url } = await loadRuntime();
    const parsed = url.parse('https://example.com:8080/a/b?q=1#frag');
    expect(getTag(parsed)).toBe('Ok');
    const value = getPayload<Record<string, string>>(parsed);
    expect(value.origin).toBe('https://example.com:8080');
    expect(url.get_pathname(value)).toBe('/a/b');
    expect(url.get_search(value)).toBe('?q=1');
    expect(url.get_hash(value)).toBe('#frag');
  });

  test('build + append_param + set_pathname mutate URL records', async () => {
    const { url } = await loadRuntime();
    const built = url.build({ protocol: 'https', host: 'example.com', pathname: 'api' });
    expect(getTag(built)).toBe('Ok');
    const href = getPayload<string>(built);
    const parsed = getPayload<Record<string, string>>(url.parse(href));
    const withParam = url.append_param(parsed, 'k', 'v');
    expect(withParam.search).toContain('k=v');
    const renamed = url.set_pathname(withParam, '/v2');
    expect(renamed.pathname).toBe('/v2');
  });

  test('invalid URL input returns Err', async () => {
    const { url } = await loadRuntime();
    const parsed = url.parse('not a url');
    expect(getTag(parsed)).toBe('Err');
  });
});
