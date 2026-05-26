import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  readLockfile,
  verifyIntegrity,
  isOutOfSync,
  validatePeerDependencies,
  writeLockfile,
  type LockfileData,
} from '../src/lumina/lockfile.js';
import { normalizeLockfileObject, selectLockfilePackage } from '../src/lumina/lockfile-format.js';
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

  it('preserves duplicate package names when versions differ', () => {
    const normalized = normalizeLockfileObject({
      version: 1,
      packages: {
        'foo@1.0.0': {
          name: 'foo',
          version: '1.0.0',
          resolved: './.lumina/packages/foo@1.0.0',
          lumina: './index.lm',
          deps: { bar: '^1.0.0' },
          resolvedDeps: { bar: 'bar@1.0.0' },
        },
        'foo@2.0.0': {
          name: 'foo',
          version: '2.0.0',
          resolved: './.lumina/packages/foo@2.0.0',
          lumina: './index.lm',
        },
      },
    });

    expect(normalized).not.toBeNull();
    expect(Object.keys(normalized?.packages ?? {}).sort()).toEqual(['foo@1.0.0', 'foo@2.0.0']);
    expect(normalized?.packages['foo@1.0.0']?.deps?.bar).toBe('^1.0.0');
    expect(normalized?.packages['foo@1.0.0']?.resolvedDeps?.bar).toBe('bar@1.0.0');
    expect(normalized?.packages['foo@2.0.0']?.version).toBe('2.0.0');
  });

  it('prefers exact transitive dependency edges over the highest satisfying range', () => {
    const normalized = normalizeLockfileObject({
      version: 1,
      packages: {
        'foo@1.0.0': {
          name: 'foo',
          version: '1.0.0',
          resolved: './.lumina/packages/foo@1.0.0',
          lumina: './index.lm',
          deps: { bar: '^1.0.0' },
          resolvedDeps: { bar: 'bar@1.0.0' },
        },
        'bar@1.0.0': {
          name: 'bar',
          version: '1.0.0',
          resolved: './.lumina/packages/bar@1.0.0',
          lumina: './index.lm',
        },
        'bar@1.2.0': {
          name: 'bar',
          version: '1.2.0',
          resolved: './.lumina/packages/bar@1.2.0',
          lumina: './index.lm',
        },
      },
    });

    expect(normalized).not.toBeNull();
    const selected = selectLockfilePackage(normalized!, 'bar', normalized!.packages['foo@1.0.0']);
    expect('entry' in selected ? selected.entry.version : null).toBe('1.0.0');
  });

  it('preserves peer dependency metadata and validates it against root locked versions', async () => {
    const dir = createTempDir();
    const manifest = baseManifest();
    manifest.dependencies.set('host', '^2.0.0');
    const lockfile: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'plugin@1.0.0',
          {
            name: 'plugin',
            version: '1.0.0',
            resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
            integrity: 'sha256:abc',
            deps: new Map(),
            peerDeps: new Map([['host', '^2.0.0']]),
          },
        ],
        [
          'host@2.1.0',
          {
            name: 'host',
            version: '2.1.0',
            resolved: 'https://registry.example.dev/host-2.1.0.tgz',
            integrity: 'sha256:def',
            deps: new Map(),
          },
        ],
      ]),
    };

    await writeLockfile(dir, lockfile);
    const loaded = await readLockfile(dir);
    expect(loaded.packages.get('plugin@1.0.0')?.peerDeps?.get('host')).toBe('^2.0.0');
    expect(validatePeerDependencies(manifest, loaded)).toEqual([]);

    manifest.dependencies.set('host', '^1.0.0');
    loaded.packages.get('host@2.1.0')!.version = '1.5.0';
    expect(validatePeerDependencies(manifest, loaded)[0]).toContain('root host@^1.0.0 resolves to 1.5.0');
  });

  it('validates peers against the root-selected version instead of any stray locked version', () => {
    const manifest = baseManifest();
    manifest.dependencies.set('host', '^1.0.0');
    const lockfile: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'plugin@1.0.0',
          {
            name: 'plugin',
            version: '1.0.0',
            resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
            integrity: 'sha256:abc',
            deps: new Map(),
            peerDeps: new Map([['host', '^2.0.0']]),
          },
        ],
        [
          'host@1.5.0',
          {
            name: 'host',
            version: '1.5.0',
            resolved: 'https://registry.example.dev/host-1.5.0.tgz',
            integrity: 'sha256:def',
            deps: new Map(),
          },
        ],
        [
          'host@2.1.0',
          {
            name: 'host',
            version: '2.1.0',
            resolved: 'https://registry.example.dev/host-2.1.0.tgz',
            integrity: 'sha256:ghi',
            deps: new Map(),
          },
        ],
      ]),
    };

    expect(validatePeerDependencies(manifest, lockfile)[0]).toContain('root host@^1.0.0 resolves to 1.5.0');
  });

  it('rejects peer validation when the root dependency range matches multiple locked providers', () => {
    const manifest = baseManifest();
    manifest.dependencies.set('host', '^1.0.0');
    const lockfile: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'plugin@1.0.0',
          {
            name: 'plugin',
            version: '1.0.0',
            resolved: 'https://registry.example.dev/plugin-1.0.0.tgz',
            integrity: 'sha256:abc',
            deps: new Map(),
            peerDeps: new Map([['host', '^1.3.0']]),
          },
        ],
        [
          'host@1.2.0',
          {
            name: 'host',
            version: '1.2.0',
            resolved: 'https://registry.example.dev/host-1.2.0.tgz',
            integrity: 'sha256:def',
            deps: new Map(),
          },
        ],
        [
          'host@1.3.0',
          {
            name: 'host',
            version: '1.3.0',
            resolved: 'https://registry.example.dev/host-1.3.0.tgz',
            integrity: 'sha256:ghi',
            deps: new Map(),
          },
        ],
      ]),
    };

    expect(validatePeerDependencies(manifest, lockfile)[0]).toContain(
      'root host@^1.0.0 resolves ambiguously to 1.2.0, 1.3.0'
    );
  });
});
