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
  });
});
