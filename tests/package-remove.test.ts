import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removePackages } from '../src/commands/package.js';
import {
  readBrowserLockfile,
  readLockfile,
  writeBrowserLockfile,
  writeLockfile,
  type BrowserLock,
  type LockfileData,
} from '../src/lumina/lockfile.js';
import { readManifest, writeManifest, type PackageManifest } from '../src/lumina/package-manifest.js';
import { runLuminaImportmap } from '../src/bin/lumina-importmap.js';

const tempDirs: string[] = [];
const originalCwd = process.cwd();

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-remove-'));
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
  dependencies: new Map([
    ['foo', '^1.0.0'],
    ['baz', '^1.0.0'],
  ]),
  devDeps: new Map([['dev-tool', '^1.0.0']]),
  peerDeps: new Map(),
  registry: null,
});

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina remove', () => {
  it('removes native manifest dependencies and prunes unreachable lock entries', async () => {
    const dir = createTempDir();
    process.chdir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'main.lm'), 'fn main() { }\n');
    await writeManifest(dir, baseManifest());

    const lockfile: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'foo@1.0.0',
          {
            name: 'foo',
            version: '1.0.0',
            resolved: 'https://registry.example/foo.tgz',
            path: './.lumina/packages/foo@1.0.0',
            integrity: 'sha256:foo',
            lumina: './src/index.lm',
            deps: new Map([['bar', '^1.0.0']]),
            resolvedDeps: new Map([['bar', 'bar@1.0.0']]),
          },
        ],
        [
          'bar@1.0.0',
          {
            name: 'bar',
            version: '1.0.0',
            resolved: 'https://registry.example/bar.tgz',
            path: './.lumina/packages/bar@1.0.0',
            integrity: 'sha256:bar',
            lumina: './src/index.lm',
            deps: new Map(),
          },
        ],
        [
          'baz@1.0.0',
          {
            name: 'baz',
            version: '1.0.0',
            resolved: 'https://registry.example/baz.tgz',
            path: './.lumina/packages/baz@1.0.0',
            integrity: 'sha256:baz',
            lumina: './src/index.lm',
            deps: new Map(),
          },
        ],
        [
          'dev-tool@1.0.0',
          {
            name: 'dev-tool',
            version: '1.0.0',
            resolved: 'https://registry.example/dev-tool.tgz',
            path: './.lumina/packages/dev-tool@1.0.0',
            integrity: 'sha256:dev',
            lumina: './src/index.lm',
            deps: new Map(),
          },
        ],
      ]),
    };
    await writeLockfile(dir, lockfile);

    await removePackages(['foo', 'dev-tool']);

    const manifest = await readManifest(dir);
    const updatedLockfile = await readLockfile(dir);
    expect(manifest.dependencies.has('foo')).toBe(false);
    expect(manifest.devDeps.has('dev-tool')).toBe(false);
    expect(manifest.dependencies.get('baz')).toBe('^1.0.0');
    expect(Array.from(updatedLockfile.packages.keys()).sort()).toEqual(['baz@1.0.0']);
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(false);
  });

  it('accepts versioned remove specs and keeps browser lock/import map in sync', async () => {
    const dir = createTempDir();
    process.chdir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'main.lm'), 'fn main() { }\n');
    await writeManifest(dir, baseManifest());
    const lockfile: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'foo@1.2.3',
          {
            name: 'foo',
            version: '1.2.3',
            resolved: 'https://registry.example/foo.tgz',
            path: './.lumina/packages/foo@1.2.3',
            integrity: 'sha256:foo',
            lumina: './src/index.lm',
            cdnUrl: 'https://cdn.example/foo@1.2.3',
            deps: new Map(),
          },
        ],
        [
          'baz@1.0.0',
          {
            name: 'baz',
            version: '1.0.0',
            resolved: 'https://registry.example/baz.tgz',
            path: './.lumina/packages/baz@1.0.0',
            integrity: 'sha256:baz',
            lumina: './src/index.lm',
            cdnUrl: 'https://cdn.example/baz@1.0.0',
            deps: new Map(),
          },
        ],
      ]),
    };
    const browserLock: BrowserLock = {
      version: 1,
      packages: new Map([
        [
          'foo@1.2.3',
          {
            name: 'foo',
            version: '1.2.3',
            esm: 'https://cdn.example/foo@1.2.3/index.js',
            wasm: null,
            integrity: 'sha256:foo',
            deps: [],
          },
        ],
        [
          'baz@1.0.0',
          {
            name: 'baz',
            version: '1.0.0',
            esm: 'https://cdn.example/baz@1.0.0/index.js',
            wasm: null,
            integrity: 'sha256:baz',
            deps: [],
          },
        ],
      ]),
    };
    await writeLockfile(dir, lockfile);
    await writeBrowserLockfile(dir, browserLock);

    await removePackages(['foo@1.2.3']);

    const manifest = await readManifest(dir);
    const updatedLockfile = await readLockfile(dir);
    const updatedBrowserLock = await readBrowserLockfile(dir);
    expect(manifest.dependencies.has('foo')).toBe(false);
    expect(Array.from(updatedLockfile.packages.keys())).toEqual(['baz@1.0.0']);
    expect(Array.from(updatedBrowserLock.packages.keys())).toEqual(['baz@1.0.0']);

    await runLuminaImportmap(['--out', 'dist/import-map.json'], { cwd: dir });
    const importMap = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'import-map.json'), 'utf-8')) as {
      imports: Record<string, string>;
    };
    expect(importMap.imports.foo).toBeUndefined();
    expect(importMap.imports.baz).toBe('https://cdn.example/baz@1.0.0/index.js');
  });
});
