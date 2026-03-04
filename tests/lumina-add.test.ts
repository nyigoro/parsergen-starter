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
          verifyIntegrity: () => false,
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
        verifyIntegrity: () => true,
      },
      stdout: { log: () => {} },
    });

    expect(writtenManifest?.dependencies.get('json-utils')).toBe('^1.2.0');
    expect(writtenLockfile?.packages.has('json-utils@1.2.3')).toBe(true);
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.path).toBe('.lumina/packages/json-utils@1.2.3');
    expect(writtenLockfile?.packages.get('json-utils@1.2.3')?.lumina).toBe('./src/lib.lm');
  });
});
