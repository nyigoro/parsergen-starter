import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileLuminaTask, setBuildConfig } from '../src/bin/lumina-core.js';

const examplePath = path.resolve(__dirname, '../examples/tabs/main.lm');
const exampleSource = fs.readFileSync(examplePath, 'utf-8');
const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const stdPath = path.resolve(__dirname, '../std');

describe('tabs example', () => {
  beforeAll(() => {
    setBuildConfig({
      fileExtensions: ['.lm', '.lumina'],
      stdPath,
      cacheDir: path.resolve(__dirname, '../.lumina-cache-test'),
    });
  });

  test('documents the current tabs authoring surface', () => {
    expect(exampleSource).toContain('@std/tabs');
    expect(exampleSource).toContain('root(active');
    expect(exampleSource).toContain('trigger("overview"');
    expect(exampleSource).toContain('panel("settings"');
    expect(exampleSource).toContain('mount_reactive(renderer, container');
  });

  test('bundled compile avoids runtime binding collisions', async () => {
    const outPath = path.join(os.tmpdir(), `lumina-tabs-${Date.now()}.generated.js`);

    try {
      const result = await compileLuminaTask({
        sourcePath: examplePath,
        outPath,
        target: 'esm',
        grammarPath,
        useRecovery: false,
        useAstJs: true,
      });

      expect(result.ok).toBe(true);
      const generated = fs.readFileSync(outPath, 'utf-8');
      expect(generated).toMatch(/function __lumina_bundle_\d+_list/);
      expect(generated).not.toContain('function list(');
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  }, 15000);
});
