import { resolveRegistryConfig, satisfiesSemverConstraint } from '../src/lumina/registry-client.js';
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
});
