import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLuminaBundle } from '../src/bin/lumina-bundle.js';

const tempDirs: string[] = [];

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-bundle-browser-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina bundle --target browser', () => {
  it('invokes compile task in esm mode and writes browser bundle', async () => {
    const dir = tmpDir();
    const entry = path.join(dir, 'src', 'main.lm');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'fn main() -> i32 { 1 }\n', 'utf-8');

    const out = path.join(dir, 'dist', 'app.js');
    const calls: Array<{ target: string; outPath: string }> = [];

    await runLuminaBundle([entry, '--target', 'browser', '--out', out], {
      cwd: dir,
      grammarPath: path.join(dir, 'dummy.peg'),
      useRecovery: false,
      deps: {
        compileTask: async (payload) => {
          calls.push({ target: payload.target, outPath: payload.outPath });
          fs.mkdirSync(path.dirname(payload.outPath), { recursive: true });
          fs.writeFileSync(payload.outPath, 'export const value = 1;\n', 'utf-8');
          return { ok: true };
        },
      },
      stdout: { log: () => {} },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe('esm');
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf-8')).toContain('export const value');
    expect(fs.readFileSync(out, 'utf-8')).not.toContain('require(');
  });

  it('minifies browser output while preserving ESM exports', async () => {
    const dir = tmpDir();
    const entry = path.join(dir, 'src', 'main.lm');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'fn main() -> i32 { 1 }\n', 'utf-8');

    const out = path.join(dir, 'dist', 'app.min.js');
    await runLuminaBundle([entry, '--target', 'browser', '--out', out, '--minify'], {
      cwd: dir,
      grammarPath: path.join(dir, 'dummy.peg'),
      useRecovery: false,
      deps: {
        compileTask: async (payload) => {
          fs.mkdirSync(path.dirname(payload.outPath), { recursive: true });
          fs.writeFileSync(
            payload.outPath,
            `// comment
export const value = 1;
function helper() {
  return value;
}
`,
            'utf-8'
          );
          return { ok: true };
        },
      },
      stdout: { log: () => {} },
    });

    const minified = fs.readFileSync(out, 'utf-8');
    expect(minified).toContain('export const value = 1;');
    expect(minified).not.toContain('// comment');
    expect(minified.length).toBeLessThan(80);
  });

  it('generates import map from browser lock when requested', async () => {
    const dir = tmpDir();
    const entry = path.join(dir, 'src', 'main.lm');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'fn main() -> i32 { 1 }\n', 'utf-8');
    fs.writeFileSync(
      path.join(dir, 'lumina.browser.lock'),
      `${JSON.stringify(
        {
          version: 1,
          packages: {
            'demo-pkg@1.2.3': {
              name: 'demo-pkg',
              version: '1.2.3',
              esm: 'https://cdn.example/demo-pkg@1.2.3/index.js',
              wasm: null,
              integrity: 'sha256:abc123',
              deps: [],
            },
          },
        },
        null,
        2
      )}\n`,
      'utf-8'
    );

    const out = path.join(dir, 'dist', 'app.js');
    const importMapPath = path.join(dir, 'dist', 'import-map.json');
    await runLuminaBundle([entry, '--target', 'browser', '--out', out, '--import-map', importMapPath], {
      cwd: dir,
      grammarPath: path.join(dir, 'dummy.peg'),
      useRecovery: false,
      deps: {
        compileTask: async (payload) => {
          fs.mkdirSync(path.dirname(payload.outPath), { recursive: true });
          fs.writeFileSync(payload.outPath, 'export const value = 1;\n', 'utf-8');
          fs.writeFileSync(`${payload.outPath}.map`, '{"version":3,"sources":["src/main.lm"]}', 'utf-8');
          return { ok: true };
        },
      },
      stdout: { log: () => {} },
    });

    const map = JSON.parse(fs.readFileSync(importMapPath, 'utf-8')) as {
      imports: Record<string, string>;
      integrity: Record<string, string>;
    };
    expect(map.imports['demo-pkg']).toBe('https://cdn.example/demo-pkg@1.2.3/index.js');
    expect(map.integrity['https://cdn.example/demo-pkg@1.2.3/index.js']).toBe('sha256:abc123');
    expect(fs.existsSync(`${out}.map`)).toBe(true);
  });
});
