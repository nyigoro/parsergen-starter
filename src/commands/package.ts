import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

type LuminaLockfile = {
  lockfileVersion: 1;
  packages: Record<string, LockfilePackage>;
};

type LockfilePackage = {
  version: string;
  resolved: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
};

type WorkspacePackage = {
  name: string;
  dir: string;
  lumina?: string | Record<string, string>;
  version?: string;
};

const LOCKFILE_NAME = 'lumina.lock.json';

function spawnCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2) + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  if (await fileExists(filePath)) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

async function findPackageRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (await fileExists(pkgPath)) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

async function loadWorkspacePackages(root: string): Promise<Map<string, WorkspacePackage>> {
  const pkg = await readJson<{ workspaces?: string[] | { packages?: string[] } }>(
    path.join(root, 'package.json')
  );
  const patterns: string[] = [];
  const workspaces = pkg?.workspaces;
  if (Array.isArray(workspaces)) patterns.push(...workspaces);
  if (workspaces && !Array.isArray(workspaces) && Array.isArray(workspaces.packages)) {
    patterns.push(...workspaces.packages);
  }
  if (patterns.length === 0) return new Map();

  const dirs = await fg(patterns, { onlyDirectories: true, cwd: root, dot: false, absolute: true });
  const map = new Map<string, WorkspacePackage>();
  for (const dir of dirs) {
    const wsPkg = await readJson<{ name?: string; lumina?: string | Record<string, string>; version?: string }>(
      path.join(dir, 'package.json')
    );
    if (!wsPkg?.name) continue;
    map.set(wsPkg.name, {
      name: wsPkg.name,
      dir,
      lumina: wsPkg.lumina,
      version: wsPkg.version,
    });
  }
  return map;
}

function extractLuminaField(pkg: { lumina?: string | Record<string, string> }): string | Record<string, string> | undefined {
  if (!pkg || pkg.lumina == null) return undefined;
  if (typeof pkg.lumina === 'string') return pkg.lumina;
  if (typeof pkg.lumina === 'object') return pkg.lumina;
  return undefined;
}

async function buildLockfile(root: string): Promise<LuminaLockfile> {
  const pkgJson = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(path.join(root, 'package.json'));
  const deps = new Set<string>([
    ...Object.keys(pkgJson?.dependencies ?? {}),
    ...Object.keys(pkgJson?.devDependencies ?? {}),
  ]);

  const workspacePackages = await loadWorkspacePackages(root);
  const lock = await readJson<{
    packages?: Record<string, { version?: string; resolved?: string; integrity?: string }>;
  }>(path.join(root, 'package-lock.json'));

  const packages: Record<string, LockfilePackage> = {};

  for (const name of deps) {
    if (workspacePackages.has(name)) {
      const ws = workspacePackages.get(name)!;
      if (!ws.lumina) continue;
      packages[name] = {
        version: ws.version ?? '0.0.0',
        resolved: ws.dir,
        lumina: ws.lumina,
      };
      continue;
    }
    const nodePath = path.join(root, 'node_modules', ...name.split('/'));
    const pkg = await readJson<{ version?: string; lumina?: string | Record<string, string> }>(
      path.join(nodePath, 'package.json')
    );
    const lumina = extractLuminaField(pkg ?? {});
    if (!lumina) continue;
    const lockKey = `node_modules/${name}`;
    const lockEntry = lock?.packages?.[lockKey];
    packages[name] = {
      version: pkg?.version ?? lockEntry?.version ?? '0.0.0',
      resolved: lockEntry?.resolved ?? nodePath,
      integrity: lockEntry?.integrity,
      lumina,
    };
  }

  return { lockfileVersion: 1, packages };
}

export async function initProject(options: { yes?: boolean } = {}): Promise<void> {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');
  if (await fileExists(pkgPath)) {
    console.log('package.json already exists.');
    return;
  }
  const name = path.basename(cwd);
  const pkg = {
    name,
    version: '0.1.0',
    lumina: './src/main.lm',
    scripts: {
      check: 'lumina check src/main.lm',
      build: 'lumina compile src/main.lm --out dist/main.js --target esm',
      dev: 'npm run build && npx vite --host 127.0.0.1',
    },
    dependencies: {},
  };
  await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
  await writeJson(pkgPath, pkg);
  await writeJson(path.join(cwd, 'lumina.config.json'), {
    entries: ['src/main.lm'],
    outDir: 'dist',
    target: 'esm',
  });
  await writeFileIfMissing(
    path.join(cwd, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Lumina App</title>
    <link rel="stylesheet" href="/src/styles.css">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/dist/main.js"></script>
  </body>
</html>
`
  );
  await writeFileIfMissing(
    path.join(cwd, 'src', 'styles.css'),
    `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #f7f7fb;
  color: #15171d;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}

.app-panel {
  max-width: 720px;
  border: 1px solid #d9dce7;
  border-radius: 8px;
  background: white;
  padding: 24px;
}

.nav-row,
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.nav-link,
.action-button {
  border: 1px solid #c9cedd;
  border-radius: 6px;
  background: #ffffff;
  color: #1d2433;
  padding: 8px 12px;
  font: inherit;
}
`
  );
  await writeFileIfMissing(
    path.join(cwd, 'src', 'main.lm'),
    `import { render } from "@std";
import {
  createRouter,
  currentPath,
  linkWithProps,
  optimisticRouteMutate,
  prefetchRoute,
  refreshRoute,
  routeLoader,
  routeRead,
  routeStatus
} from "@std/router";

async fn loadDashboard() -> string {
  "Lumina route data is ready"
}

component App() -> VNode {
  let appRouter = createRouter("/");
  let dashboard = routeLoader<string>(appRouter, "dashboard", || loadDashboard());
  let _settingsPrefetch = prefetchRoute<string>(appRouter, "/settings", "dashboard", || loadDashboard());

  render.element("main", render.props_class("app-shell"), [
    render.element("section", render.props_class("app-panel"), [
      render.element("nav", render.props_class("nav-row"), [
        linkWithProps(appRouter, "/", render.props_class("nav-link"), [render.text("Home")]),
        linkWithProps(appRouter, "/settings", render.props_class("nav-link"), [render.text("Settings")])
      ]),
      render.element("h1", render.props_class("app-title"), [render.text("Lumina App")]),
      render.element("p", render.props_class("app-route"), [
        render.text("Current route: "),
        render.liveText(currentPath(appRouter))
      ]),
      render.element("p", render.props_class("app-status"), [
        render.text("Loader status: "),
        render.text(routeStatus(dashboard))
      ]),
      render.suspense(render.text("Loading route data"), || [
        render.errorBoundary(render.text("Route data failed"), || [
          render.element("p", render.props_class("app-data"), [render.text(routeRead(dashboard))])
        ])
      ]),
      render.element("div", render.props_class("action-row"), [
        render.element("button", render.props_merge(render.props_class("action-button"), render.props_on_click(fn() -> void {
          let _ = refreshRoute(dashboard)
        })), [render.text("Refresh")]),
        render.element("button", render.props_merge(render.props_class("action-button"), render.props_on_click(fn() -> void {
          let _ = optimisticRouteMutate(dashboard, "Optimistic route data")
        })), [render.text("Optimistic update")])
      ])
    ])
  ])
}

pub fn main() -> void {
  let container = render.dom_get_element_by_id("app");
  let renderer = render.createDomRenderer();
  let _root = render.mount_reactive(renderer, container, || App());
}

main();
`
  );
  if (!options.yes) {
    console.log(`Initialized package.json in ${cwd}`);
  }
}

export async function installPackages(options: { frozen?: boolean } = {}): Promise<void> {
  const root = await findPackageRoot(process.cwd());
  const args = options.frozen ? ['ci'] : ['install'];
  await spawnCommand('npm', args, root);
  const lockfile = await buildLockfile(root);
  await writeJson(path.join(root, LOCKFILE_NAME), lockfile);
}

export async function addPackages(
  specs: string[],
  options: { dev?: boolean } = {}
): Promise<void> {
  if (specs.length === 0) throw new Error('Missing package names.');
  const root = await findPackageRoot(process.cwd());
  const args = ['install', ...(options.dev ? ['-D'] : []), ...specs];
  await spawnCommand('npm', args, root);
  const lockfile = await buildLockfile(root);
  await writeJson(path.join(root, LOCKFILE_NAME), lockfile);
}

export async function removePackages(specs: string[]): Promise<void> {
  if (specs.length === 0) throw new Error('Missing package names.');
  const root = await findPackageRoot(process.cwd());
  const args = ['uninstall', ...specs];
  await spawnCommand('npm', args, root);
  const lockfile = await buildLockfile(root);
  await writeJson(path.join(root, LOCKFILE_NAME), lockfile);
}

export async function listPackages(): Promise<void> {
  const root = await findPackageRoot(process.cwd());
  const lockfile = await readJson<LuminaLockfile>(path.join(root, LOCKFILE_NAME));
  if (!lockfile || !lockfile.packages || Object.keys(lockfile.packages).length === 0) {
    console.log('No Lumina packages found (lumina.lock.json missing or empty).');
    return;
  }
  for (const [name, pkg] of Object.entries(lockfile.packages)) {
    const entry = typeof pkg.lumina === 'string' ? pkg.lumina : pkg.lumina?.['.'];
    console.log(`${name}@${pkg.version} -> ${entry ?? '(no entry)'}`);
  }
}
