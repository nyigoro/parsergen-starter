import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLuminaImportmap, generateImportMap } from '../src/bin/lumina-importmap.js';
import { type BrowserLock } from '../src/lumina/lockfile.js';

const tempDirs: string[] = [];

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-importmap-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('import map generation', () => {
  it('generates import/integrity maps from browser lock entries', () => {
    const lock: BrowserLock = {
      version: 1,
      packages: new Map([
        [
          'json-utils@1.2.3',
          {
            name: 'json-utils',
            version: '1.2.3',
            esm: 'https://cdn.luminalang.dev/json-utils@1.2.3/index.js',
            wasm: null,
            integrity: 'sha256:abc',
            deps: [],
          },
        ],
      ]),
    };

    const map = generateImportMap(lock);
    expect(map.imports['json-utils']).toBe('https://cdn.luminalang.dev/json-utils@1.2.3/index.js');
    expect(map.integrity['https://cdn.luminalang.dev/json-utils@1.2.3/index.js']).toBe('sha256:abc');
  });

  it('writes import map file from lock data', async () => {
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, 'lumina.browser.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'demo@1.0.0': {
              name: 'demo',
              version: '1.0.0',
              esm: 'https://cdn.luminalang.dev/demo@1.0.0/index.js',
              wasm: null,
              integrity: 'sha256:xyz',
              deps: [],
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const out = path.join(dir, 'dist', 'import-map.json');
    await runLuminaImportmap(['--out', out], {
      cwd: dir,
      stdout: { log: () => {} },
      stderr: { error: () => {} },
    });

    const parsed = JSON.parse(fs.readFileSync(out, 'utf-8')) as { imports: Record<string, string> };
    expect(parsed.imports.demo).toBe('https://cdn.luminalang.dev/demo@1.0.0/index.js');
  });
});
