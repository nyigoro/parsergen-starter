import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readLockfile, verifyIntegrity, isOutOfSync, writeLockfile, type LockfileData } from '../src/lumina/lockfile.js';
import type { PackageManifest } from '../src/lumina/package-manifest.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-lockfile-'));
  tempDirs.push(dir);
  return dir;
};

const baseManifest = (): PackageManifest => ({
  name: 'demo',
  version: '1.0.0',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map([['json-utils', '^1.2.0']]),
  devDeps: new Map(),
  registry: null,
});

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lockfile', () => {
  it('reads lumina.lock', async () => {
    const dir = createTempDir();
    const lock: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'json-utils@1.2.3',
          {
            name: 'json-utils',
            version: '1.2.3',
            resolved: 'https://registry.test/json-utils-1.2.3.tgz',
            path: './.lumina/packages/json-utils@1.2.3',
            integrity: 'sha256:abc',
            lumina: './src/lib.lm',
            deps: new Map(),
          },
        ],
      ]),
    };
    await writeLockfile(dir, lock);

    const loaded = await readLockfile(dir);
    expect(loaded.version).toBe(1);
    expect(loaded.packages.get('json-utils@1.2.3')?.name).toBe('json-utils');
    expect(loaded.packages.get('json-utils@1.2.3')?.path).toBe('./.lumina/packages/json-utils@1.2.3');
    expect(loaded.packages.get('json-utils@1.2.3')?.lumina).toBe('./src/lib.lm');
  });

  it('migrates lumina.lock.json to lumina.lock on read', async () => {
    const dir = createTempDir();
    fs.writeFileSync(
      path.join(dir, 'lumina.lock.json'),
      JSON.stringify(
        {
          lockfileVersion: 1,
          packages: {
            'json-utils': {
              version: '1.2.3',
              resolved: 'https://registry.test/json-utils-1.2.3.tgz',
              path: './.lumina/packages/json-utils@1.2.3',
              integrity: 'sha256:abc',
              lumina: './src/lib.lm',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const loaded = await readLockfile(dir);
    expect(loaded.packages.has('json-utils@1.2.3')).toBe(true);
    expect(loaded.packages.get('json-utils@1.2.3')?.path).toBe('./.lumina/packages/json-utils@1.2.3');
    expect(loaded.packages.get('json-utils@1.2.3')?.lumina).toBe('./src/lib.lm');
    expect(fs.existsSync(path.join(dir, 'lumina.lock'))).toBe(true);
  });

  it('detects manifest/lockfile sync mismatches', () => {
    const manifest = baseManifest();
    const lock: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'json-utils@1.0.0',
          {
            name: 'json-utils',
            version: '1.0.0',
            resolved: 'https://registry.test/json-utils-1.0.0.tgz',
            integrity: 'sha256:abc',
            deps: new Map(),
          },
        ],
      ]),
    };
    const mismatches = isOutOfSync(manifest, lock);
    expect(mismatches).toContain('json-utils');
  });

  it('verifies tarball integrity hash', () => {
    const payload = Buffer.from('hello world');
    const hash = createHash('sha256').update(payload).digest('hex');
    expect(verifyIntegrity(payload, `sha256:${hash}`)).toBe(true);
    expect(verifyIntegrity(Buffer.from('tampered'), `sha256:${hash}`)).toBe(false);
  });
});
