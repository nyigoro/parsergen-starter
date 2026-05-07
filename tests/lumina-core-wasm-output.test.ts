import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileLuminaTask, setBuildConfig } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];

const tmpDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-compile-wasm-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const decodeStandaloneString = (instance: WebAssembly.Instance, ptr: number): string => {
  const memory = instance.exports.memory as WebAssembly.Memory;
  const view = new DataView(memory.buffer);
  const len = view.getInt32(ptr, true);
  return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr + 4, len));
};

describe('compileLuminaTask wasm output', () => {
  it('emits .wasm directly and optional companion .wat output', async () => {
    const dir = tmpDir();
    const sourcePath = path.join(dir, 'main.lm');
    const wasmPath = path.join(dir, 'dist', 'app.wasm');
    const watPath = path.join(dir, 'dist', 'app.wat');
    const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
    const stdPath = path.resolve(__dirname, '../std');

    fs.writeFileSync(sourcePath, 'fn main() -> int { return 42; }\n', 'utf-8');

    setBuildConfig({
      fileExtensions: ['.lm', '.lumina'],
      stdPath,
      cacheDir: path.join(dir, '.lumina-cache'),
    });

    const result = await compileLuminaTask({
      sourcePath,
      outPath: wasmPath,
      target: 'wasm',
      emitWat: true,
      grammarPath,
      useRecovery: false,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(WebAssembly.validate(fs.readFileSync(wasmPath))).toBe(true);
    expect(fs.existsSync(watPath)).toBe(true);
    expect(fs.readFileSync(watPath, 'utf-8')).toContain('(module');
  }, 15000);

  it('emits import-free standalone wasm with an external debug map', async () => {
    const dir = tmpDir();
    const sourcePath = path.join(dir, 'standalone.lm');
    const wasmPath = path.join(dir, 'dist', 'standalone.wasm');
    const debugMapPath = `${wasmPath}.map`;
    const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
    const stdPath = path.resolve(__dirname, '../std');

    fs.writeFileSync(sourcePath, 'fn main() -> int { return 7; }\n', 'utf-8');

    setBuildConfig({
      fileExtensions: ['.lm', '.lumina'],
      stdPath,
      cacheDir: path.join(dir, '.lumina-cache'),
    });

    const result = await compileLuminaTask({
      sourcePath,
      outPath: wasmPath,
      target: 'wasm',
      semanticTarget: 'wasm-standalone',
      grammarPath,
      useRecovery: false,
      sourceMap: true,
    });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(fs.existsSync(debugMapPath)).toBe(true);
    const binary = fs.readFileSync(wasmPath);
    expect(WebAssembly.validate(binary)).toBe(true);
    const { instance } = await WebAssembly.instantiate(binary);
    expect((instance.exports.main as () => number)()).toBe(7);
    const debugMap = JSON.parse(fs.readFileSync(debugMapPath, 'utf-8')) as {
      targetProfile: string;
      sourceFile?: string;
    };
    expect(debugMap.targetProfile).toBe('wasm-standalone');
    expect(debugMap.sourceFile).toBe(sourcePath);
  });

  it('emits import-free standalone wasm for native string helpers', async () => {
    const dir = tmpDir();
    const sourcePath = path.join(dir, 'standalone-string.lm');
    const wasmPath = path.join(dir, 'dist', 'standalone-string.wasm');
    const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
    const stdPath = path.resolve(__dirname, '../std');

    fs.writeFileSync(
      sourcePath,
      'import { str } from "@std";\nfn main() -> string { let s = str.concat("he", "llo"); s[1..4] }\n',
      'utf-8'
    );

    setBuildConfig({
      fileExtensions: ['.lm', '.lumina'],
      stdPath,
      cacheDir: path.join(dir, '.lumina-cache'),
    });

    const result = await compileLuminaTask({
      sourcePath,
      outPath: wasmPath,
      target: 'wasm',
      semanticTarget: 'wasm-standalone',
      grammarPath,
      useRecovery: false,
    });

    expect(result.ok).toBe(true);
    const binary = fs.readFileSync(wasmPath);
    expect(WebAssembly.validate(binary)).toBe(true);
    const module = await WebAssembly.compile(binary);
    expect(WebAssembly.Module.imports(module)).toHaveLength(0);
    const instance = await WebAssembly.instantiate(module);
    const ptr = (instance.exports.main as () => number)();
    expect(decodeStandaloneString(instance, ptr)).toBe('ell');
  });
});
