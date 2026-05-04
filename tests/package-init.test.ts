import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject } from '../src/commands/package.js';

const tempDirs: string[] = [];
const originalCwd = process.cwd();

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-init-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lumina init', () => {
  test('creates a browser app starter with compile, check, and dev scripts', async () => {
    const dir = createTempDir();
    process.chdir(dir);

    await initProject({ yes: true });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      lumina?: string;
      scripts?: Record<string, string>;
    };
    const config = JSON.parse(
      fs.readFileSync(path.join(dir, 'lumina.config.json'), 'utf-8')
    ) as {
      entries?: string[];
      outDir?: string;
      target?: string;
    };
    const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
    const mainSource = fs.readFileSync(path.join(dir, 'src', 'main.lm'), 'utf-8');
    const styles = fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf-8');

    expect(pkg.lumina).toBe('./src/main.lm');
    expect(pkg.scripts?.check).toBe('lumina check src/main.lm');
    expect(pkg.scripts?.build).toContain('lumina compile src/main.lm');
    expect(pkg.scripts?.dev).toContain('npx vite');
    expect(config).toMatchObject({ entries: ['src/main.lm'], outDir: 'dist', target: 'esm' });
    expect(indexHtml).toContain('/dist/main.js');
    expect(mainSource).toContain('@std/router');
    expect(mainSource).toContain('routeLoader');
    expect(mainSource).toContain('prefetchRoute');
    expect(mainSource).toContain('mount_reactive');
    expect(styles).toContain('.app-shell');
  });
});
