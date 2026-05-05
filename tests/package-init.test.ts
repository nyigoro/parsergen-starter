import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject } from '../src/commands/package.js';
import { checkLuminaTask, setDefaultStdPath } from '../src/bin/lumina-core.js';

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const repoRoot = path.resolve(__dirname, '..');
const grammarPath = path.join(repoRoot, 'src', 'grammar', 'lumina.peg');

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
  beforeAll(() => {
    setDefaultStdPath(path.join(repoRoot, 'std'));
  });

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
    const styles = fs.readFileSync(path.join(dir, 'src', 'styles.css'), 'utf-8');
    const viteConfig = fs.readFileSync(path.join(dir, 'vite.config.ts'), 'utf-8');

    expect(pkg.lumina).toBe('./src/client.lm');
    expect(pkg.luminaTemplate).toBe('routed');
    expect(pkg.scripts?.check).toContain('src/client.lm');
    expect(pkg.scripts?.build).toContain('--target js --module esm');
    expect(pkg.scripts?.ssg).toBeUndefined();
    expect(pkg.scripts?.dev).toContain('vite --host 127.0.0.1');
    expect(pkg.devDependencies?.vite).toBeTruthy();
    expect(config).toMatchObject({ entries: ['src/client.lm'], outDir: 'dist', target: 'js', module: 'esm' });
    expect(indexHtml).toContain('/dist/main.js');
    expect(appSource).toContain('@std/router');
    expect(appSource).toContain('routeLoader');
    expect(appSource).toContain('prefetchRoute');
    expect(appSource).toContain('routeAction');
    expect(appSource).toContain('submitRouteAction');
    expect(clientSource).toContain('hydrate_reactive');
    expect(fs.existsSync(path.join(dir, 'src', 'ssg.lm'))).toBe(false);
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

  test('creates an SSR starter with SSG and hydration files', async () => {
    const dir = createTempDir();
    process.chdir(dir);

    await initProject({ yes: true, template: 'ssr' });

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
      luminaTemplate?: string;
      scripts?: Record<string, string>;
    };
    const ssgSource = fs.readFileSync(path.join(dir, 'src', 'ssg.lm'), 'utf-8');
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf-8');

    expect(pkg.luminaTemplate).toBe('ssr');
    expect(pkg.scripts?.check).toContain('src/ssg.lm');
    expect(pkg.scripts?.build).toContain('--target js --module esm');
    expect(pkg.scripts?.ssg).toContain('lumina ssg src/ssg.lm');
    expect(ssgSource).toContain('App(createRouter("/")');
    expect(readme).toContain('SSR/SSG-ready');
  });

  test('creates official complex-app starter variants', async () => {
    for (const template of ['auth', 'testing', 'deploy', 'large-app'] as const) {
      const dir = createTempDir();
      process.chdir(dir);

      await initProject({ yes: true, template });

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')) as {
        luminaTemplate?: string;
        scripts?: Record<string, string>;
      };
      const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf-8');

      expect(pkg.luminaTemplate).toBe(template);
      expect(pkg.scripts?.ssg).toContain('lumina ssg src/ssg.lm');
      expect(readme).toContain('Commands');
      expect(fs.existsSync(path.join(dir, 'src', 'ssg.lm'))).toBe(true);
      if (template === 'auth') expect(fs.existsSync(path.join(dir, 'src', 'session.lm'))).toBe(true);
      if (template === 'testing') expect(fs.existsSync(path.join(dir, 'src', 'app.test.lm'))).toBe(true);
      if (template === 'deploy') expect(fs.existsSync(path.join(dir, 'deploy', 'README.md'))).toBe(true);
      if (template === 'large-app') expect(fs.existsSync(path.join(dir, 'src', 'routes.lm'))).toBe(true);
      process.chdir(originalCwd);
    }
  });

  test('generated starter templates pass lumina check', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      for (const template of ['minimal', 'routed', 'ssr', 'auth', 'testing', 'deploy', 'large-app'] as const) {
        const dir = createTempDir();
        process.chdir(dir);

        await initProject({ yes: true, template });

        const client = await checkLuminaTask({
          sourcePath: path.join(dir, 'src', 'client.lm'),
          grammarPath,
          useRecovery: false,
        });
        expect(client.ok).toBe(true);

        const ssgPath = path.join(dir, 'src', 'ssg.lm');
        if (fs.existsSync(ssgPath)) {
          const ssg = await checkLuminaTask({ sourcePath: ssgPath, grammarPath, useRecovery: false });
          expect(ssg.ok).toBe(true);
        }

        process.chdir(originalCwd);
      }
    } finally {
      logSpy.mockRestore();
    }
  }, 30000);

  test('@std/router resolves to source-backed high-level helpers in CLI checks', async () => {
    const dir = createTempDir();
    process.chdir(dir);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    const sourcePath = path.join(dir, 'src', 'main.lm');
    fs.writeFileSync(
      sourcePath,
      `import { createRouter, routeNode, routeTreeMeta, routeTree } from "@std/router";
import { render } from "@std";

pub fn main() -> any {
  let _router = createRouter("/");
  let root = routeNode("root", "/", "Home");
  let tree = routeTree(root, render.text("Loading"), render.text("Error"), render.props_empty());
  routeTreeMeta(tree)
}
`,
      'utf-8'
    );

    const result = await checkLuminaTask({ sourcePath, grammarPath, useRecovery: false });
    expect(result.ok).toBe(true);
  });

  test('rejects unknown starter templates before writing files', async () => {
    const dir = createTempDir();
    process.chdir(dir);

    await expect(initProject({ yes: true, template: 'unknown' })).rejects.toThrow(
      'Unknown Lumina starter template'
    );
    expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(false);
  });
});
