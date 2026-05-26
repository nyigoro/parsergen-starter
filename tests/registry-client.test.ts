import {
  downloadTarball,
  getVersionInfo,
  publishPackage,
  resolveRegistryConfig,
  resolveVersion,
  satisfiesSemverConstraint,
  search,
} from '../src/lumina/registry-client.js';
import type { PackageManifest } from '../src/lumina/package-manifest.js';

const manifest = (token: string | null = null): PackageManifest => ({
  name: 'demo',
  version: '1.0.0',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map(),
  devDeps: new Map(),
  registry: {
    url: 'https://registry.example.dev',
    token,
  },
});

describe('registry client helpers', () => {
  it('checks semver constraints', () => {
    expect(satisfiesSemverConstraint('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesSemverConstraint('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfiesSemverConstraint('1.2.3', '~1.2.0')).toBe(true);
    expect(satisfiesSemverConstraint('1.3.0', '~1.2.0')).toBe(false);
  });

  it('resolves token from env over manifest token', () => {
    const cfg = resolveRegistryConfig(manifest('manifest-token'), {
      ...process.env,
      LUMINA_TOKEN: 'env-token',
    });
    expect(cfg.token).toBe('env-token');
  });

  it('resolves private registry URL and token from dedicated environment variables', () => {
    const cfg = resolveRegistryConfig(manifest('manifest-token'), {
      ...process.env,
      LUMINA_REGISTRY_URL: 'https://registry.internal.example',
      LUMINA_REGISTRY_TOKEN: 'private-token',
      LUMINA_TOKEN: 'legacy-token',
    });
    expect(cfg.url).toBe('https://registry.internal.example');
    expect(cfg.token).toBe('private-token');
  });

  it('resolves ${ENV_VAR} token from environment', () => {
    const cfg = resolveRegistryConfig(manifest('${MY_REG_TOKEN}'), {
      ...process.env,
      MY_REG_TOKEN: 'resolved-token',
    });
    expect(cfg.token).toBe('resolved-token');
  });

  it('maps search metadata and computes pagination state', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 47,
          results: [
            {
              name: 'json-utils',
              version: '1.2.3',
              description: 'JSON helpers',
              downloads: 12345,
              dependents: 27,
              updatedAt: '2026-03-01T00:00:00.000Z',
              tags: ['wasm-ready', 'browser-native'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );

    try {
      const result = await search('json', { url: 'https://registry.example.dev', token: null }, { limit: 1, offset: 10 });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/search?q=json&limit=1&offset=10'),
        expect.any(Object)
      );
      expect(result.total).toBe(47);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(11);
      expect(result.results[0]).toEqual({
        name: 'json-utils',
        version: '1.2.3',
        description: 'JSON helpers',
        downloads: 12345,
        dependents: 27,
        updatedAt: '2026-03-01T00:00:00.000Z',
        tags: ['wasm-ready', 'browser-native'],
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('sends bearer auth for private registry search, download, and publish calls', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
      )
      .mockResolvedValueOnce(new Response('tarball', { status: 200, headers: { 'content-length': '7' } }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://registry.internal.example/pkg' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    const cfg = { url: 'https://registry.internal.example', token: 'private-token' };

    try {
      await search('json', cfg);
      await downloadTarball('https://registry.internal.example/tarballs/json.tgz', cfg);
      await publishPackage(Buffer.from('tarball'), manifest(null), cfg);

      for (const call of fetchSpy.mock.calls) {
        const init = call[1] as RequestInit;
        expect(init.headers).toMatchObject({ authorization: 'Bearer private-token' });
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('includes manifest dependencies and peer dependencies in publish payload', async () => {
    let payload: {
      manifest?: { deps?: Record<string, string>; peerDeps?: Record<string, string> };
    } | null = null;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ url: 'https://registry.example.dev/pkg' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const packageManifest = manifest(null);
    packageManifest.dependencies.set('runtime-lib', '^1.0.0');
    packageManifest.peerDeps = new Map([['host-runtime', '^2.0.0']]);

    try {
      await publishPackage(Buffer.from('tarball'), packageManifest, { url: 'https://registry.example.dev', token: 'token' });
      expect(payload?.manifest?.deps).toEqual({ 'runtime-lib': '^1.0.0' });
      expect(payload?.manifest?.peerDeps).toEqual({ 'host-runtime': '^2.0.0' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('maps peer dependency metadata from version info', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'plugin',
          version: '1.0.0',
          resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
          integrity: 'sha256:abc',
          deps: {},
          peerDeps: { host: '^2.0.0' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );

    try {
      const info = await getVersionInfo('plugin', '1.0.0', { url: 'https://registry.example.dev', token: null });
      expect(info.peerDeps?.get('host')).toBe('^2.0.0');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('includes available versions in unsatisfied version diagnostics', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'json-utils',
          versions: ['1.0.0', '1.2.0'],
          latest: '1.2.0',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );

    try {
      await expect(resolveVersion('json-utils', '^2.0.0', { url: 'https://registry.example.dev', token: null })).rejects.toThrow(
        "No versions for 'json-utils' satisfy '^2.0.0' (available: 1.0.0, 1.2.0)"
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('redacts private registry tokens from error bodies', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad token private-token Bearer another-token', { status: 401, statusText: 'Unauthorized' })
    );

    try {
      await expect(search('json', { url: 'https://registry.internal.example', token: 'private-token' })).rejects.toThrow(
        /bad token \[redacted\] Bearer \[redacted\]/
      );
      await expect(search('json', { url: 'https://registry.internal.example', token: 'private-token' })).rejects.not.toThrow(
        /private-token/
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('defaults sparse search metadata fields', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ name: 'vec', version: '0.1.0' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      ) as Response
    );

    try {
      const result = await search('vec', { url: 'https://registry.example.dev', token: null });
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeNull();
      expect(result.results[0]).toEqual({
        name: 'vec',
        version: '0.1.0',
        description: null,
        downloads: null,
        dependents: null,
        updatedAt: null,
        tags: [],
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
