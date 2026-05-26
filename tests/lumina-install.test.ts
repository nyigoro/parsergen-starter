import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { runLuminaInstall } from '../src/bin/lumina-install.js';
import type { PackageManifest } from '../src/lumina/package-manifest.js';
import type { LockfileData } from '../src/lumina/lockfile.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-install-'));
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
  dependencies: new Map([['json-utils', '^1.2.0']]),
  devDeps: new Map(),
  registry: { url: 'https://registry.example.dev', token: null },
});

const lockfileWithJsonUtils = (): LockfileData => ({
  version: 1,
  packages: new Map([
    [
      'json-utils@1.2.3',
      {
        name: 'json-utils',
        version: '1.2.3',
        resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
        path: '.lumina/packages/json-utils@1.2.3',
        integrity: 'sha256:abc',
        deps: new Map(),
      },
    ],
  ]),
});

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina install', () => {
  it('fails with --frozen when lockfile is out of sync', async () => {
    const cwd = createTempDir();
    await expect(
      runLuminaInstall(['--frozen'], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          readLockfile: async () => ({ version: 1, packages: new Map() }),
          isOutOfSync: () => ['json-utils'],
        },
      })
    ).rejects.toThrow(/out of sync/);
  });

  it('checks devDeps during frozen sync validation', async () => {
    const cwd = createTempDir();
    const manifest = makeManifest();
    manifest.devDeps.set('test-helper', '^0.2.0');

    await expect(
      runLuminaInstall(['--frozen'], {
        cwd,
        deps: {
          readManifest: async () => manifest,
          readLockfile: async () => lockfileWithJsonUtils(),
        },
      })
    ).rejects.toThrow(/test-helper/);
  });

  it('skips already cached packages', async () => {
    const cwd = createTempDir();
    const cachedDir = path.join(cwd, '.lumina', 'packages', 'json-utils@1.2.3');
    fs.mkdirSync(cachedDir, { recursive: true });
    let downloads = 0;
    await runLuminaInstall([], {
      cwd,
      deps: {
        readManifest: async () => makeManifest(),
        readLockfile: async () => lockfileWithJsonUtils(),
        isOutOfSync: () => [],
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: null }),
        downloadTarball: async () => {
          downloads += 1;
          return Buffer.from('tarball');
        },
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });
    expect(downloads).toBe(0);
  });

  it('does not materialize tarball payload paths outside the install directory', async () => {
    const cwd = createTempDir();
    await runLuminaInstall([], {
      cwd,
      deps: {
        readManifest: async () => makeManifest(),
        readLockfile: async () => lockfileWithJsonUtils(),
        isOutOfSync: () => [],
        resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: null }),
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

  it('fails cleanly when lockfile entry is missing integrity', async () => {
    const cwd = createTempDir();
    await expect(
      runLuminaInstall([], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          readLockfile: async () => ({
            version: 1,
            packages: new Map([
              [
                'json-utils@1.2.3',
                {
                  name: 'json-utils',
                  version: '1.2.3',
                  resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
                  path: '.lumina/packages/json-utils@1.2.3',
                  integrity: 'sha256:',
                  deps: new Map(),
                },
              ],
            ]),
          }),
          isOutOfSync: () => [],
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: null }),
          downloadTarball: async () => Buffer.from('tarball'),
          integrityStatus: () => 'missing',
        },
      })
    ).rejects.toThrow(/missing integrity/i);
  });

  it('fails cleanly when lockfile entry integrity mismatches', async () => {
    const cwd = createTempDir();
    await expect(
      runLuminaInstall([], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          readLockfile: async () => lockfileWithJsonUtils(),
          isOutOfSync: () => [],
          resolveRegistryConfig: () => ({ url: 'https://registry.example.dev', token: null }),
          downloadTarball: async () => Buffer.from('tarball'),
          integrityStatus: () => 'mismatch',
        },
      })
    ).rejects.toThrow(/integrity check failed/i);
  });

  it('validates locked peer dependency requirements before installing', async () => {
    const cwd = createTempDir();
    await expect(
      runLuminaInstall([], {
        cwd,
        deps: {
          readManifest: async () => makeManifest(),
          readLockfile: async () => ({
            version: 1,
            packages: new Map([
              [
                'json-utils@1.2.3',
                {
                  name: 'json-utils',
                  version: '1.2.3',
                  resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
                  path: '.lumina/packages/json-utils@1.2.3',
                  integrity: 'sha256:abc',
                  deps: new Map(),
                  peerDeps: new Map([['host-runtime', '^2.0.0']]),
                },
              ],
            ]),
          }),
          isOutOfSync: () => [],
        },
      })
    ).rejects.toThrow(/json-utils@1.2.3 requires peer dependency host-runtime@\^2.0.0/);
  });

  it('migrates legacy lockfile through readLockfile dependency path', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() { }\n', 'utf-8');
    fs.writeFileSync(
      path.join(cwd, 'lumina.toml'),
      `[package]\nname = "demo"\nversion = "1.0.0"\nentry = "src/main.lm"\n\n[dependencies]\njson-utils = "^1.2.0"\n`,
      'utf-8'
    );
    fs.writeFileSync(
      path.join(cwd, 'lumina.lock.json'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          packages: {
            'json-utils': {
              version: '1.2.3',
              resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
              integrity: 'sha256:abc',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    await runLuminaInstall([], {
      cwd,
      deps: {
        downloadTarball: async () => Buffer.from('tarball'),
        integrityStatus: () => 'ok',
      },
      stdout: { log: () => {} },
    });

    expect(fs.existsSync(path.join(cwd, 'lumina.lock'))).toBe(true);
  });
});
