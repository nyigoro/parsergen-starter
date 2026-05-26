import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkLuminaTask, setDefaultStdPath } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];
const repoRoot = path.resolve(__dirname, '..');
const grammarPath = path.join(repoRoot, 'src', 'grammar', 'lumina.peg');

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-core-pkg-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina-core package resolution', () => {
  beforeAll(() => {
    setDefaultStdPath(path.join(repoRoot, 'std'));
  });

  test('rejects ambiguous direct root imports with multiple locked package versions', async () => {
    const root = createTempDir();
    const entryPath = path.join(root, 'main.lm');
    fs.writeFileSync(entryPath, 'import { bar } from "bar";\nfn main() -> int { 1 }\n', 'utf-8');
    fs.writeFileSync(
      path.join(root, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'bar@1.0.0': {
              name: 'bar',
              version: '1.0.0',
              resolved: './.lumina/packages/bar@1.0.0',
              lumina: './src/bar.lm',
            },
            'bar@2.0.0': {
              name: 'bar',
              version: '2.0.0',
              resolved: './.lumina/packages/bar@2.0.0',
              lumina: './src/bar.lm',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await checkLuminaTask({ sourcePath: entryPath, grammarPath, useRecovery: false });
      expect(result.ok).toBe(false);
      expect(errorSpy.mock.calls.flat().join('\n')).toContain('[PKG-005]');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('uses exact transitive dependency edges instead of drifting to a newer satisfying version', async () => {
    const root = createTempDir();
    const entryPath = path.join(root, 'main.lm');
    const fooEntry = path.join(root, '.lumina', 'packages', 'foo@1.0.0', 'src', 'foo.lm');
    const barEntry = path.join(root, '.lumina', 'packages', 'bar@1.0.0', 'src', 'bar.lm');
    const newerBarEntry = path.join(root, '.lumina', 'packages', 'bar@1.2.0', 'src', 'bar.lm');
    fs.mkdirSync(path.dirname(fooEntry), { recursive: true });
    fs.mkdirSync(path.dirname(barEntry), { recursive: true });
    fs.mkdirSync(path.dirname(newerBarEntry), { recursive: true });
    fs.writeFileSync(entryPath, 'import { foo } from "foo";\nfn main() -> int { foo() }\n', 'utf-8');
    fs.writeFileSync(fooEntry, 'import { bar } from "bar";\npub fn foo() -> int { bar() }\n', 'utf-8');
    fs.writeFileSync(barEntry, 'pub fn bar() -> int { 7 }\n', 'utf-8');
    fs.writeFileSync(newerBarEntry, 'pub fn bar() -> string { "wrong" }\n', 'utf-8');
    fs.writeFileSync(
      path.join(root, 'lumina.lock'),
      JSON.stringify(
        {
          version: 1,
          packages: {
            'foo@1.0.0': {
              name: 'foo',
              version: '1.0.0',
              resolved: './.lumina/packages/foo@1.0.0',
              lumina: './src/foo.lm',
              deps: { bar: '^1.0.0' },
              resolvedDeps: { bar: 'bar@1.0.0' },
            },
            'bar@1.0.0': {
              name: 'bar',
              version: '1.0.0',
              resolved: './.lumina/packages/bar@1.0.0',
              lumina: './src/bar.lm',
            },
            'bar@1.2.0': {
              name: 'bar',
              version: '1.2.0',
              resolved: './.lumina/packages/bar@1.2.0',
              lumina: './src/bar.lm',
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const result = await checkLuminaTask({ sourcePath: entryPath, grammarPath, useRecovery: false });
      expect(result.ok).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
