import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
        resolveVersion: async () => '1.2.3',
        getVersionInfo: async () => ({
          name: 'json-utils',
          version: '1.2.3',
          resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
          integrity: 'sha256:abc',
          lumina: './src/lib.lm',
          deps: new Map([['tiny-vec', '0.1.0']]),
        }),
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(writtenManifest?.dependencies.get('json-utils')).toBe('^1.2.0');
    expect(writtenLockfile?.packages.has('json-utils@1.2.3')).toBe(true);
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.path).toBe('.lumina/packages/json-utils@1.2.3');
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.lumina).toBe('./src/lib.lm');
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
