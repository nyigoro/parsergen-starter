import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileLuminaTask, setBuildConfig } from '../src/bin/lumina-core.js';

const examplePath = path.resolve(__dirname, '../examples/ui-showcase/main.lm');
const exampleSource = fs.readFileSync(examplePath, 'utf-8');
const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const stdPath = path.resolve(__dirname, '../std');

describe('ui showcase example', () => {
  beforeAll(() => {
    setBuildConfig({
      fileExtensions: ['.lm', '.lumina'],
      stdPath,
      cacheDir: path.resolve(__dirname, '../.lumina-cache-test'),
    });
  });

  test('documents the styled ui authoring surface', () => {
    expect(exampleSource).toContain('@std/ui');
    expect(exampleSource).toContain('tabsListStyled');
    expect(exampleSource).toContain('presenceCard');
    expect(exampleSource).toContain('mount_reactive(renderer, container');
  });

  test('bundled compile handles source-backed ui wrappers', async () => {
    const outPath = path.join(os.tmpdir(), `lumina-ui-showcase-${Date.now()}.generated.js`);

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
      expect(generated).toMatch(/__lumina_bundle_\d+_button/);
      expect(generated).toMatch(/__lumina_bundle_\d+_presenceCard/);
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  }, 15000);
});
