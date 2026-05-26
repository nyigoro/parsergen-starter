import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDirs: string[] = [];
const localRequire = createRequire(__filename);

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-runtime-sidecar-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runtime sidecar emission', () => {
  test('refreshes a stale sidecar from the runtime source', () => {
    const workspace = createTempDir();
    const outDir = path.join(workspace, 'out');
    const runtimeSource = path.join(workspace, 'dist', 'lumina-runtime.js');
    const runtimeDest = path.join(outDir, 'lumina-runtime.js');
    fs.mkdirSync(path.dirname(runtimeSource), { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      runtimeSource,
      [
        'export const io = 1;',
        'export const str = 1;',
        'export const math = 1;',
        'export const list = 1;',
        'export const vec = 1;',
        'export const hashmap = 1;',
        'export const hashset = 1;',
        'export const render = 1;',
        'export const reactive = 1;',
        'export const fs = 1;',
        'export const http = 1;',
        'export const Result = 1;',
        'export const Option = 1;',
        'export const __set = 1;',
        'export const __lumina_index = 1;',
        'export const __lumina_fixed_array = 1;',
        'export const __lumina_array_bounds_check = 1;',
        'export const __lumina_array_literal = 1;',
        'export const __lumina_clone = 1;',
        'export const __lumina_eq = 1;',
        'export const __lumina_struct = 1;',
        'export const __lumina_register_trait_impl = 1;',
        'export const LuminaPanic = 1;',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(runtimeDest, 'export const io = 0;\n', 'utf-8');

    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../src/bin/runtime.ts')).href;
    const outPath = path.join(outDir, 'main.js');
    const script = `import { ensureRuntimeForOutput } from ${JSON.stringify(moduleUrl)}; await ensureRuntimeForOutput(${JSON.stringify(outPath)}, 'esm');`;
    const tsxLoader = pathToFileURL(localRequire.resolve('tsx')).href;
    const result = spawnSync(process.execPath, ['--import', tsxLoader, '-e', script], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(runtimeDest, 'utf-8')).toBe(fs.readFileSync(runtimeSource, 'utf-8'));
  });
});
