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
      luminaTemplate?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const config = JSON.parse(
      fs.readFileSync(path.join(dir, 'lumina.config.json'), 'utf-8')
    ) as {
      entries?: string[];
      outDir?: string;
      target?: string;
    };
    const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
    const appSource = fs.readFileSync(path.join(dir, 'src', 'app.lm'), 'utf-8');
    const clientSource = fs.readFileSync(path.join(dir, 'src', 'client.lm'), 'utf-8');
    const ssgSource = fs.readFileSync(path.join(dir, 'src', 'ssg.lm'), 'utf-8');
    const styles = fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf-8');
    const viteConfig = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf-8');

    expect(pkg.lumina).toBe('./src/client.lm');
    expect(pkg.luminaTemplate).toBe('routed');
    expect(pkg.scripts?.check).toContain('src/client.lm');
    expect(pkg.scripts?.build).toContain('lumina compile src/client.lm');
    expect(pkg.scripts?.ssg).toContain('lumina ssg src/ssg.lm');
    expect(pkg.scripts?.dev).toContain('vite --host 127.0.0.1');
    expect(pkg.devDependencies?.vite).toBeTruthy();
    expect(config).toMatchObject({ entries: ['src/client.lm'], outDir: 'dist', target: 'esm' });
    expect(indexHtml).toContain('/dist/main.js');
    expect(appSource).toContain('@std/router');
    expect(appSource).toContain('routeLoader');
    expect(appSource).toContain('prefetchRoute');
    expect(appSource).toContain('routeAction');
    expect(appSource).toContain('submitRouteAction');
    expect(clientSource).toContain('hydrate_reactive');
    expect(ssgSource).toContain('App(createRouter("/")');
    expect(styles).toContain('.app-shell');
    expect(viteConfig).toContain('defineConfig');
  });

  test('creates a minimal starter template without router or ssg files', async () => {
    const dir = createTempDir();
    process.chdir(dir);

    await initProject({ yes: true, template: 'minimal' });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      luminaTemplate?: string;
      scripts?: Record<string, string>;
    };
    const appSource = fs.readFileSync(path.join(dir, 'src', 'app.lm'), 'utf-8');
    const clientSource = fs.readFileSync(path.join(dir, 'src', 'client.lm'), 'utf-8');

    expect(pkg.luminaTemplate).toBe('minimal');
    expect(pkg.scripts?.check).toBe('lumina check src/client.lm');
    expect(pkg.scripts?.ssg).toBeUndefined();
    expect(fs.existsSync(path.join(dir, 'src', 'ssg.lm'))).toBe(false);
    expect(appSource).not.toContain('@std/router');
    expect(clientSource).toContain('App()');
  });
});
