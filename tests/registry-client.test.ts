import { resolveRegistryConfig, satisfiesSemverConstraint, search } from '../src/lumina/registry-client.js';
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
