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

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('playground presets', () => {
  beforeAll(() => {
    setDefaultStdPath(path.join(repoRoot, 'std'));
  });

  test('starter-app preset stays aligned with the CLI checker', async () => {
    const preset = playgroundPresets.find((entry) => entry.id === 'starter-app');
    expect(preset).toBeTruthy();

    const dir = createTempDir();
    const sourcePath = path.join(dir, 'starter-app.lm');
    fs.writeFileSync(sourcePath, `${preset!.source.trim()}\n`, 'utf-8');

    const result = await checkLuminaTask({
      sourcePath,
      grammarPath,
      useRecovery: false,
    });

    expect(result.ok).toBe(true);
  }, 15000);
});
