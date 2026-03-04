import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLuminaBundle } from '../src/bin/lumina-bundle.js';

const tempDirs: string[] = [];

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-bundle-wasm-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina bundle --target wasm', () => {
  it('emits wasm output and JS loader shim', async () => {
    const dir = tmpDir();
    const entry = path.join(dir, 'src', 'main.lm');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'fn main() -> i32 { 1 }\n', 'utf-8');

    const wasmOut = path.join(dir, 'dist', 'index.wasm');
    const loaderOut = path.join(dir, 'dist', 'loader.js');

    await runLuminaBundle([entry, '--target', 'wasm', '--out', wasmOut, '--loader-out', loaderOut], {
      cwd: dir,
      grammarPath: path.join(dir, 'dummy.peg'),
      useRecovery: false,
      deps: {
        compileTask: async (payload) => {
          const watPath = payload.outPath;
          const producedWasm = watPath.replace(/\.wat$/i, '.wasm');
          fs.mkdirSync(path.dirname(watPath), { recursive: true });
          fs.writeFileSync(watPath, '(module)', 'utf-8');
          fs.writeFileSync(producedWasm, Buffer.from([0x00, 0x61, 0x73, 0x6d]));
          return { ok: true };
        },
      },
      stdout: { log: () => {} },
    });

    expect(fs.existsSync(wasmOut)).toBe(true);
    const loader = fs.readFileSync(loaderOut, 'utf-8');
    expect(loader).toContain('instantiateStreaming');
    expect(loader).toContain('export async function load');
  });
});
