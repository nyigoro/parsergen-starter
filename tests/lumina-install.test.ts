import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
