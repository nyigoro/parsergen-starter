type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('HTTP runtime security', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  const mockOkResponse = () => ({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: async () => 'ok',
  });

  test('allows http and https URLs', async () => {
    const { http } = await loadRuntime();
    const spy = jest.fn().mockResolvedValue(mockOkResponse());
    (globalThis as { fetch?: unknown }).fetch = spy as unknown as typeof fetch;

    const httpResult = await http.fetch({ url: 'http://example.com', method: 'GET' });
    const httpsResult = await http.fetch({ url: 'https://example.com', method: 'GET' });

    expect(getTag(httpResult)).toBe('Ok');
    expect(getTag(httpsResult)).toBe('Ok');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('blocks non-http protocols', async () => {
    const { http } = await loadRuntime();
    const fileResult = await http.fetch({ url: 'file:///etc/passwd', method: 'GET' });
    const dataResult = await http.fetch({ url: 'data:text/plain,abc', method: 'GET' });

    expect(getTag(fileResult)).toBe('Err');
    expect(getPayload<string>(fileResult)).toContain("Blocked protocol 'file:'");
    expect(getTag(dataResult)).toBe('Err');
    expect(getPayload<string>(dataResult)).toContain("Blocked protocol 'data:'");
  });

  test('blocks localhost and metadata endpoints', async () => {
    const { http } = await loadRuntime();

    const localhost = await http.fetch({ url: 'http://localhost:8080', method: 'GET' });
    const loopback = await http.fetch({ url: 'http://127.0.0.1', method: 'GET' });
    const awsMeta = await http.fetch({ url: 'http://169.254.169.254/latest/meta-data', method: 'GET' });

    expect(getTag(localhost)).toBe('Err');
    expect(getPayload<string>(localhost)).toContain("Blocked host 'localhost'");
    expect(getTag(loopback)).toBe('Err');
    expect(getPayload<string>(loopback)).toContain("Blocked host '127.0.0.1'");
    expect(getTag(awsMeta)).toBe('Err');
    expect(getPayload<string>(awsMeta)).toContain("Blocked host '169.254.169.254'");
  });

  test('blocks private IPv4 ranges', async () => {
    const { http } = await loadRuntime();

    const tenNet = await http.fetch({ url: 'http://10.0.0.5', method: 'GET' });
    const oneNineTwo = await http.fetch({ url: 'http://192.168.0.10', method: 'GET' });
    const oneSevenTwo = await http.fetch({ url: 'http://172.20.1.10', method: 'GET' });

    expect(getTag(tenNet)).toBe('Err');
    expect(getPayload<string>(tenNet)).toContain('Blocked private IP address: 10.0.0.5');
    expect(getTag(oneNineTwo)).toBe('Err');
    expect(getPayload<string>(oneNineTwo)).toContain('Blocked private IP address: 192.168.0.10');
    expect(getTag(oneSevenTwo)).toBe('Err');
    expect(getPayload<string>(oneSevenTwo)).toContain('Blocked private IP address: 172.20.1.10');
  });

  test('method helpers enforce URL validation', async () => {
    const { http } = await loadRuntime();

    const getResult = await http.get('http://localhost');
    const postResult = await http.post('file:///tmp/secret', { ok: true });
    const putResult = await http.put('http://0.0.0.0', 'x');
    const delResult = await http.del('http://169.254.169.254/latest');

    expect(getTag(getResult)).toBe('Err');
    expect(getTag(postResult)).toBe('Err');
    expect(getTag(putResult)).toBe('Err');
    expect(getTag(delResult)).toBe('Err');
  });

  test('rejects malformed URLs', async () => {
    const { http } = await loadRuntime();
    const result = await http.fetch({ url: 'not a url', method: 'GET' });
    expect(getTag(result)).toBe('Err');
    expect(getPayload<string>(result)).toContain('Invalid URL');
  });
});
