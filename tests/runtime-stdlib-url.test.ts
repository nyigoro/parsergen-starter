type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

type UrlRecord = {
  href: string;
  origin: string;
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
};

describe('@std/url runtime', () => {
  test('parse edge-case matrix', async () => {
    const { url } = await loadRuntime();
    const cases: Array<{ input: string; assert: (record: UrlRecord) => void }> = [
      {
        input: 'https://example.com/a%20b/%2F?q=a%20b#frag',
        assert: (record) => {
          expect(record.pathname).toContain('%20');
          expect(record.search).toContain('q=');
          expect(record.hash).toBe('#frag');
        },
      },
      {
        input: 'https://example.com:8080/path',
        assert: (record) => {
          expect(record.host).toBe('example.com:8080');
          expect(record.origin).toBe('https://example.com:8080');
        },
      },
      {
        input: 'https://user:pass@example.com:8443/secure',
        assert: (record) => {
          expect(record.host).toBe('example.com:8443');
          expect(record.pathname).toBe('/secure');
        },
      },
      {
        input: 'https://example.com/path#section',
        assert: (record) => {
          expect(record.hash).toBe('#section');
        },
      },
      {
        input: 'https://example.com/path?a=1&b=two&c=three',
        assert: (record) => {
          expect(record.search).toContain('a=1');
          expect(record.search).toContain('b=two');
          expect(record.search).toContain('c=three');
        },
      },
      {
        input: 'https://münich.example/path',
        assert: (record) => {
          expect(record.host.length).toBeGreaterThan(0);
          expect(record.pathname).toBe('/path');
        },
      },
    ];

    for (const spec of cases) {
      const parsed = url.parse(spec.input);
      expect(getTag(parsed)).toBe('Ok');
      spec.assert(getPayload<UrlRecord>(parsed));
    }
  });

  test('parse malformed inputs returns Err (never throws)', async () => {
    const { url } = await loadRuntime();
    const malformed = ['', '/path/only', 'ht!tp://example.com', '://missing-protocol'];
    for (const input of malformed) {
      expect(() => url.parse(input)).not.toThrow();
      const parsed = url.parse(input);
      expect(getTag(parsed)).toBe('Err');
      expect(typeof getPayload<string>(parsed)).toBe('string');
    }
  });

  test('build validates required fields and returns Err for invalid configs', async () => {
    const { url } = await loadRuntime();
    expect(getTag(url.build({ protocol: '', host: '' }))).toBe('Err');
    expect(getTag(url.build({ protocol: 'https', host: '' }))).toBe('Err');
    expect(getTag(url.build({ protocol: '', host: 'example.com' }))).toBe('Err');
  });

  test('parse + build round-trip remains stable under repeated load', async () => {
    const { url } = await loadRuntime();
    for (let i = 0; i < 1000; i += 1) {
      const source = `https://example.com/p${i}?q=${i}#f${i}`;
      const parsed = url.parse(source);
      expect(getTag(parsed)).toBe('Ok');
      const record = getPayload<UrlRecord>(parsed);
      const rebuilt = url.build({
        protocol: record.protocol,
        host: record.host,
        pathname: record.pathname,
        search: record.search,
        hash: record.hash,
      });
      expect(getTag(rebuilt)).toBe('Ok');
      const reparsed = url.parse(getPayload<string>(rebuilt));
      expect(getTag(reparsed)).toBe('Ok');
      const reparsedRecord = getPayload<UrlRecord>(reparsed);
      expect(reparsedRecord.pathname).toBe(record.pathname);
      expect(reparsedRecord.search).toBe(record.search);
      expect(reparsedRecord.hash).toBe(record.hash);
    }
  });

  test('append_param handles long query growth', async () => {
    const { url } = await loadRuntime();
    const parsed = url.parse('https://example.com/base');
    expect(getTag(parsed)).toBe('Ok');
    let record = getPayload<UrlRecord>(parsed);
    for (let i = 0; i < 500; i += 1) {
      record = url.append_param(record, `k${i}`, `v${i}`);
    }
    expect(record.search).toContain('k0=v0');
    expect(record.search).toContain('k499=v499');
  });

  test('Node URL parity for parse fields', async () => {
    const { url } = await loadRuntime();
    const inputs = [
      'https://example.com/a/b?x=1#h',
      'https://user:pass@example.com:8443/p?q=two',
      'https://münich.example/path',
    ];
    for (const input of inputs) {
      const parsed = url.parse(input);
      expect(getTag(parsed)).toBe('Ok');
      const record = getPayload<UrlRecord>(parsed);
      const expected = new URL(input);
      expect(record.href).toBe(expected.href);
      expect(record.origin).toBe(expected.origin);
      expect(record.protocol).toBe(expected.protocol);
      expect(record.host).toBe(expected.host);
      expect(record.pathname).toBe(expected.pathname);
      expect(record.search).toBe(expected.search);
      expect(record.hash).toBe(expected.hash);
    }
  });

  test('Node URL parity for build output', async () => {
    const { url } = await loadRuntime();
    const config = {
      protocol: 'https',
      host: 'example.com:8443',
      pathname: '/api/v1',
      search: '?a=1&b=2',
      hash: '#frag',
    };
    const built = url.build(config);
    expect(getTag(built)).toBe('Ok');
    const runtimeHref = getPayload<string>(built);

    const expected = new URL(`${config.protocol}://${config.host}`);
    expected.pathname = config.pathname;
    expected.search = config.search;
    expected.hash = config.hash;
    expect(runtimeHref).toBe(expected.href);
  });
});
