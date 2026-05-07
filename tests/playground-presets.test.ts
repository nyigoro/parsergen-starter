import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLuminaTask, setDefaultStdPath } from '../src/bin/lumina-core.js';
import { playgroundPresets } from '../playground/src/presets';

const repoRoot = path.resolve(__dirname, '..');
const grammarPath = path.join(repoRoot, 'src', 'grammar', 'lumina.peg');
const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-playground-preset-'));
  tempDirs.push(dir);
  return dir;
};

const writePresetProject = (root: string, presetId: string): string => {
  const preset = playgroundPresets.find((entry) => entry.id === presetId);
  expect(preset).toBeTruthy();

  for (const file of preset!.files) {
    const fullPath = path.join(root, file.uri);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${file.source.trim()}\n`, 'utf-8');
  }

  return path.join(root, preset!.entryUri);
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('playground presets', () => {
  beforeAll(() => {
    setDefaultStdPath(path.join(repoRoot, 'std'));
  });

  test.each([
    'starter-app',
    'forms-resource',
    'package-import',
  ])('%s preset stays aligned with the CLI checker', async (presetId) => {
    const dir = createTempDir();
    const sourcePath = writePresetProject(dir, presetId);

    const result = await checkLuminaTask({
      sourcePath,
      grammarPath,
      useRecovery: false,
    });

    expect(result.ok).toBe(true);
  }, 20000);
});
