import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateBrowserLock,
  writeBrowserLockfile,
  readBrowserLockfile,
  type LockfileData,
} from '../src/lumina/lockfile.js';

const tempDirs: string[] = [];

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-browser-lock-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('browser lock generation', () => {
  it('generates browser lock entries with esm/wasm urls and deps', async () => {
    const lock: LockfileData = {
      version: 1,
      packages: new Map([
        [
          'json-utils@1.2.3',
          {
            name: 'json-utils',
            version: '1.2.3',
            resolved: 'https://registry.example.dev/json-utils-1.2.3.tgz',
            integrity: 'sha256:abc',
            cdnUrl: 'https://cdn.luminalang.dev/json-utils@1.2.3',
            esm: 'https://cdn.luminalang.dev/json-utils@1.2.3/index.js',
            wasm: 'https://cdn.luminalang.dev/json-utils@1.2.3/index.wasm',
            deps: new Map([
              ['tiny-vec', '^0.1.0'],
              ['parse-core', '^0.2.0'],
            ]),
          },
        ],
      ]),
    };

    const browser = generateBrowserLock(lock);
    const entry = browser.packages.get('json-utils@1.2.3');
    expect(entry?.esm).toBe('https://cdn.luminalang.dev/json-utils@1.2.3/index.js');
    expect(entry?.wasm).toBe('https://cdn.luminalang.dev/json-utils@1.2.3/index.wasm');
    expect(entry?.deps).toEqual(['parse-core', 'tiny-vec']);
  });

  it('writes and reads lumina.browser.lock', async () => {
    const dir = tmpDir();
    const lock = {
      version: 1,
      packages: new Map([
        [
          'demo@1.0.0',
          {
            name: 'demo',
            version: '1.0.0',
            esm: 'https://cdn.luminalang.dev/demo@1.0.0/index.js',
            wasm: null,
            integrity: 'sha256:abc',
            deps: ['dep-a'],
          },
        ],
      ]),
    };
    await writeBrowserLockfile(dir, lock);
    const loaded = await readBrowserLockfile(dir);
    expect(loaded.packages.get('demo@1.0.0')?.esm).toBe('https://cdn.luminalang.dev/demo@1.0.0/index.js');
  });
});
