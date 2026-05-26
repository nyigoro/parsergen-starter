import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { runLuminaAdd } from '../src/bin/lumina-add.js';
import type { PackageManifest } from '../src/lumina/package-manifest.js';
import type { LockfileData } from '../src/lumina/lockfile.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-add-'));
  tempDirs.push(dir);
  return dir;
};

const makeManifest = (): PackageManifest => ({
  name: 'demo',
  version: '1.0.0',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map(),
  devDeps: new Map(),
  registry: { url: 'https://registry.example.dev', token: 'token' },
});

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina add', () => {
  it('aborts on missing integrity before extraction', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');
    const writes: string[] = [];
    await expect(
      runLuminaAdd(['json-utils@^1.2.0'], {
        cwd,
        stderr: { error: () => {} },
        deps: {
          readManifest: async () => makeManifest(),
          writeManifest: async () => {
            writes.push('manifest');
          },
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          writeLockfile: async () => {
            writes.push('lockfile');
          },
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
          resolveVersion: async () => '1.2.3',
          getVersionInfo: async () => ({
            name: 'json-utils',
            version: '1.2.3',
            resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
            integrity: 'sha256:',
            lumina: './src/lib.lm',
            deps: new Map(),
          }),
          downloadTarball: async () => Buffer.from('tarball'),
          integrityStatus: () => 'missing',
        },
      })
    ).rejects.toThrow(/Missing integrity/);
    expect(writes).toHaveLength(0);
  });

  it('aborts on integrity mismatch before extraction', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');
    const writes: string[] = [];
    await expect(
      runLuminaAdd(['json-utils@^1.2.0'], {
        cwd,
        stderr: { error: () => {} },
        deps: {
          readManifest: async () => makeManifest(),
          writeManifest: async () => {
            writes.push('manifest');
          },
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          writeLockfile: async () => {
            writes.push('lockfile');
          },
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
          resolveVersion: async () => '1.2.3',
          getVersionInfo: async () => ({
            name: 'json-utils',
            version: '1.2.3',
            resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
            integrity: 'sha256:abc',
            lumina: './src/lib.lm',
            deps: new Map(),
          }),
          downloadTarball: async () => Buffer.from('tarball'),
          integrityStatus: () => 'mismatch',
        },
      })
    ).rejects.toThrow(/Integrity mismatch/);
    expect(writes).toHaveLength(0);
  });

  it('updates manifest and lockfile after successful add', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');
    let writtenManifest: PackageManifest | null = null;
    let writtenLockfile: LockfileData | null = null;

    await runLuminaAdd(['json-utils@^1.2.0'], {
      cwd,
      deps: {
        readManifest: async () => makeManifest(),
        writeManifest: async (_dir, manifest) => {
          writtenManifest = manifest;
        },
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async (_dir, lockfile) => {
          writtenLockfile = lockfile;
        },
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async (pkgName) => (pkgName === 'tiny-vec' ? '0.1.0' : '1.2.3'),
        getVersionInfo: async (pkgName, version) =>
          pkgName === 'tiny-vec'
            ? {
                name: 'tiny-vec',
                version,
                resolved: 'https://registry.example.dev/tiny-vec-0.1.0.tgz',
                integrity: 'sha256:def',
                lumina: './src/vec.lm',
                deps: new Map(),
              }
            : {
                name: 'json-utils',
                version,
                resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
                integrity: 'sha256:abc',
                lumina: './src/lib.lm',
                deps: new Map([['tiny-vec', '0.1.0']]),
              },
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writtenManifest?.dependencies.get('json-utils')).toBe('^1.2.0');
    expect(writtenLockfile?.packages.has('json-utils@1.2.3')).toBe(true);
    expect(writtenLockfile?.packages.has('tiny-vec@0.1.0')).toBe(true);
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.path).toBe('.lumina/packages/json-utils@1.2.3');
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.lumina).toBe('./src/lib.lm');
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.deps.get('tiny-vec')).toBe('0.1.0');
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.resolvedDeps?.get('tiny-vec')).toBe('tiny-vec@0.1.0');
    expect(writtenLockfile?.packages.get('tiny-vec@0.1.0')?.path).toBe('.lumina/packages/tiny-vec@0.1.0');
  });

  it('does not materialize tarball payload paths outside the install directory', async () => {
    const cwd = createTempDir();

    await runLuminaAdd(['json-utils@^1.2.0'], {
      cwd,
      deps: {
        readManifest: async () => makeManifest(),
        writeManifest: async () => {},
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async () => {},
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async () => '1.2.3',
        getVersionInfo: async () => ({
          name: 'json-utils',
          version: '1.2.3',
          resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
          integrity: 'sha256:abc',
          lumina: './src/lib.lm',
          deps: new Map(),
        }),
        downloadTarball: async () =>
          gzipSync(
            Buffer.from(
              JSON.stringify({
                files: [
                  { path: 'src/lib.lm', content: Buffer.from('pub fn ok() -> int { 1 }\n').toString('base64') },
                  { path: '../json-utils@1.2.3-evil/pwn.lm', content: Buffer.from('pwn').toString('base64') },
                ],
              }),
              'utf-8'
            )
          ),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(fs.existsSync(path.join(cwd, '.lumina', 'packages', 'json-utils@1.2.3', 'src', 'lib.lm'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.lumina', 'packages', 'json-utils@1.2.3-evil', 'pwn.lm'))).toBe(false);
  });

  it('writes --dev packages to devDeps and removes regular duplicates', async () => {
    const cwd = createTempDir();
    const manifest = makeManifest();
    manifest.dependencies.set('json-utils', '^1.0.0');
    let writtenManifest: PackageManifest | null = null;

    await runLuminaAdd(['--dev', 'json-utils@^1.2.0'], {
      cwd,
      deps: {
        readManifest: async () => manifest,
        writeManifest: async (_dir, nextManifest) => {
          writtenManifest = nextManifest;
        },
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async () => {},
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async () => '1.2.3',
        getVersionInfo: async () => ({
          name: 'json-utils',
          version: '1.2.3',
          resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
          integrity: 'sha256:abc',
          lumina: './src/lib.lm',
          deps: new Map(),
        }),
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writtenManifest?.dependencies.has('json-utils')).toBe(false);
    expect(writtenManifest?.devDeps.get('json-utils')).toBe('^1.2.0');
  });

  it('regular add removes an existing dev dependency duplicate', async () => {
    const cwd = createTempDir();
    const manifest = makeManifest();
    manifest.devDeps.set('json-utils', '^1.0.0');
    let writtenManifest: PackageManifest | null = null;

    await runLuminaAdd(['json-utils@^1.2.0'], {
      cwd,
      deps: {
        readManifest: async () => manifest,
        writeManifest: async (_dir, nextManifest) => {
          writtenManifest = nextManifest;
        },
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async () => {},
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async () => '1.2.3',
        getVersionInfo: async () => ({
          name: 'json-utils',
          version: '1.2.3',
          resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
          integrity: 'sha256:abc',
          lumina: './src/lib.lm',
          deps: new Map(),
        }),
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writtenManifest?.dependencies.get('json-utils')).toBe('^1.2.0');
    expect(writtenManifest?.devDeps.has('json-utils')).toBe(false);
  });

  it('returns a clean error when package cannot be resolved', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');

    await expect(
      runLuminaAdd(['missing-pkg'], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          writeManifest: async () => {},
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          writeLockfile: async () => {},
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
          resolveVersion: async () => {
            throw new Error('Package not found: missing-pkg');
          },
          getVersionInfo: async () => {
            throw new Error('unreachable');
          },
          downloadTarball: async () => Buffer.from(''),
          integrityStatus: () => 'ok',
        },
      })
    ).rejects.toThrow('Package not found: missing-pkg');
  });

  it('uses private registry environment overrides when resolving packages', async () => {
    const cwd = createTempDir();
    const seenConfigs: Array<{ url: string; token: string | null }> = [];

    await runLuminaAdd(['json-utils@^1.2.0'], {
      cwd,
      env: {
        ...process.env,
        LUMINA_REGISTRY_URL: 'https://registry.internal.example',
        LUMINA_REGISTRY_TOKEN: 'private-token',
      },
      deps: {
        readManifest: async () => makeManifest(),
        writeManifest: async () => {},
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async () => {},
        resolveVersion: async (_pkgName, _constraint, config) => {
          seenConfigs.push(config);
          return '1.2.3';
        },
        getVersionInfo: async (_pkgName, version, config) => {
          seenConfigs.push(config);
          return {
            name: 'json-utils',
            version,
            resolved: 'https://registry.internal.example/json-utils-1.2.3.tgz',
            integrity: 'sha256:abc',
            lumina: './src/lib.lm',
            deps: new Map(),
          };
        },
        downloadTarball: async (_url, config) => {
          seenConfigs.push(config);
          return Buffer.from('tarball');
        },
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(seenConfigs).toHaveLength(3);
    expect(seenConfigs.every((config) => config.url === 'https://registry.internal.example')).toBe(true);
    expect(seenConfigs.every((config) => config.token === 'private-token')).toBe(true);
  });

  it('fails with a clear peer dependency diagnostic when a peer is missing', async () => {
    const cwd = createTempDir();

    await expect(
      runLuminaAdd(['plugin@^1.0.0'], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          writeManifest: async () => {},
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          writeLockfile: async () => {},
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
          resolveVersion: async () => '1.0.0',
          getVersionInfo: async () => ({
            name: 'plugin',
            version: '1.0.0',
            resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
            integrity: 'sha256:abc',
            lumina: './src/plugin.lm',
            deps: new Map(),
            peerDeps: new Map([['host', '^2.0.0']]),
          }),
          downloadTarball: async () => Buffer.from('tarball'),
          integrityStatus: () => 'ok',
        },
        stdout: { log: () => {} },
      })
    ).rejects.toThrow(/plugin@1.0.0 requires peer dependency host@\^2.0.0/);
  });

  it('accepts peer dependencies satisfied by root dependencies and locked versions', async () => {
    const cwd = createTempDir();
    const manifest = makeManifest();
    manifest.dependencies.set('host', '^2.0.0');
    let writtenLockfile: LockfileData | null = null;

    await runLuminaAdd(['plugin@^1.0.0'], {
      cwd,
      deps: {
        readManifest: async () => manifest,
        writeManifest: async () => {},
        readLockfile: async () => ({
          version: 1,
          packages: new Map([
            [
              'host@2.1.0',
              {
                name: 'host',
                version: '2.1.0',
                resolved: 'https://registry.example.dev/host-2.1.0.tgz',
                path: '.lumina/packages/host@2.1.0',
                integrity: 'sha256:host',
                deps: new Map(),
              },
            ],
          ]),
        }),
        writeLockfile: async (_dir, lockfile) => {
          writtenLockfile = lockfile;
        },
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async () => '1.0.0',
        getVersionInfo: async () => ({
          name: 'plugin',
          version: '1.0.0',
          resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
          integrity: 'sha256:abc',
          lumina: './src/plugin.lm',
          deps: new Map(),
          peerDeps: new Map([['host', '^2.0.0']]),
        }),
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writtenLockfile?.packages.get('plugin@1.0.0')?.peerDeps?.get('host')).toBe('^2.0.0');
  });

  it('returns a clean error when explicit package version is unavailable', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');

    await expect(
      runLuminaAdd(['json-utils@9.9.9'], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          writeManifest: async () => {},
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          writeLockfile: async () => {},
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
          resolveVersion: async () => {
            throw new Error('No matching version for json-utils@9.9.9');
          },
          getVersionInfo: async () => {
            throw new Error('unreachable');
          },
          downloadTarball: async () => Buffer.from(''),
          integrityStatus: () => 'ok',
        },
      })
    ).rejects.toThrow('No matching version for json-utils@9.9.9');
  });

  it('bootstraps a manifest when lumina.toml is missing', async () => {
    const cwd = createTempDir();
    const writeManifestCalls: PackageManifest[] = [];

    await runLuminaAdd(['json-utils@^1.2.0'], {
      cwd,
      deps: {
        readManifest: async () => {
          throw new Error('Missing lumina.toml');
        },
        writeManifest: async (_dir, manifest) => {
          writeManifestCalls.push(manifest);
        },
        readLockfile: async () => ({ version: 1, packages: new Map() }),
        writeLockfile: async () => {},
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: 'token' }),
        resolveVersion: async () => '1.2.3',
        getVersionInfo: async () => ({
          name: 'json-utils',
          version: '1.2.3',
          resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
          integrity: 'sha256:abc',
          lumina: './src/lib.lm',
          deps: new Map(),
        }),
        downloadTarball: async () =>
          Buffer.from(
            JSON.stringify({
              files: [{ path: 'src/lib.lm', content: Buffer.from('fn util() -> i32 { 1 }\n', 'utf-8').toString('base64') }],
            }),
            'utf-8'
          ),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writeManifestCalls.length).toBeGreaterThanOrEqual(2);
    expect(writeManifestCalls[0].name.length).toBeGreaterThan(0);
    expect(writeManifestCalls[1].dependencies.get('json-utils')).toBe('^1.2.0');
  });
});
