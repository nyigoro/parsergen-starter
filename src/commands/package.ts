import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {
  BROWSER_LOCKFILE_FILENAME,
  LOCKFILE_FILENAME,
  readBrowserLockfile,
  readLockfile,
  writeBrowserLockfile,
  writeLockfile,
  type BrowserLock,
  type BrowserLockEntry,
  type LockfileData,
  type LockfileEntry,
} from '../lumina/lockfile.js';
import {
  MANIFEST_FILENAME,
  readManifest,
  writeManifest,
  type PackageManifest,
} from '../lumina/package-manifest.js';
import { satisfiesLockfileConstraint } from '../lumina/lockfile-format.js';

type WorkspacePackage = {
  name: string;
  dir: string;
  lumina?: string | Record<string, string>;
  version?: string;
};

type InitTemplate = 'minimal' | 'routed' | 'ssr' | 'auth' | 'testing' | 'deploy' | 'large-app';
const INIT_TEMPLATES = new Set<InitTemplate>(['minimal', 'routed', 'ssr', 'auth', 'testing', 'deploy', 'large-app']);

const normalizeInitTemplate = (value: unknown): InitTemplate => {
  if (value == null || value === '') return 'routed';
  if (INIT_TEMPLATES.has(value as InitTemplate)) return value as InitTemplate;
  throw new Error(`Unknown Lumina starter template '${String(value)}'. Use routed, minimal, ssr, auth, testing, deploy, or large-app.`);
};

const templateUsesSsg = (template: InitTemplate): boolean => {
  if (template === 'minimal' || template === 'routed') return false;
  return true;
};

const templateReadme = (template: InitTemplate): string => {
  if (template === 'minimal') return 'Minimal client-only Lumina starter.';
  if (template === 'routed') return 'Routed SPA starter with route loaders, actions, prefetch, and client hydration.';
  if (template === 'ssr') return 'SSR/SSG-ready routed starter with a hydration entry.';
  if (template === 'auth') return 'Auth/session starter. Keep session ownership in src/session.lm and route data behind route module loaders.';
  if (template === 'testing') return 'Testing-ready starter. Use @std/testing flush, waitFor, and harness helpers for async UI work.';
  if (template === 'deploy') return 'Deploy-ready starter. Use npm run ssg to produce dist/index.html and dist/main.js.';
  if (template === 'large-app') return 'Large-app starter. Keep route ownership in route nodes, data scopes, route actions, and app-shell UI wrappers.';
  return 'routed';
};

const luminaPackageVersion = 'latest';

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

async function findProjectRoot(startDir: string): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    if (await fileExists(path.join(current, MANIFEST_FILENAME))) return current;
    if (await fileExists(path.join(current, 'package.json'))) return current;
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

const toPosixRelative = (base: string, target: string): string =>
  path.relative(base, target).replace(/\\/g, '/');

const lockfileKey = (name: string, version: string): string => `${name}@${version}`;

async function buildLockfile(root: string): Promise<LockfileData> {
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

  const packages = new Map<string, LockfileEntry>();

  for (const name of deps) {
    if (workspacePackages.has(name)) {
      const ws = workspacePackages.get(name)!;
      if (!ws.lumina) continue;
      const version = ws.version ?? '0.0.0';
      packages.set(lockfileKey(name, version), {
        name,
        version,
        resolved: ws.dir,
        path: toPosixRelative(root, ws.dir),
        integrity: 'sha256:',
        lumina: ws.lumina,
        deps: new Map(),
      });
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
    const version = pkg?.version ?? lockEntry?.version ?? '0.0.0';
    packages.set(lockfileKey(name, version), {
      name,
      version,
      resolved: lockEntry?.resolved ?? nodePath,
      path: toPosixRelative(root, nodePath),
      integrity: lockEntry?.integrity ?? 'sha256:',
      lumina,
      deps: new Map(),
    });
  }

  return { version: 1, packages };
}

export async function initProject(options: { yes?: boolean; template?: string; vitePlugin?: boolean } = {}): Promise<void> {
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, 'package.json');
  if (await fileExists(pkgPath)) {
    console.log('package.json already exists.');
    return;
  }
  const name = path.basename(cwd);
  const template = normalizeInitTemplate(options.template);
  const withSsg = templateUsesSsg(template);
  const useVitePlugin = options.vitePlugin === true;
  const buildScript = withSsg || !useVitePlugin
    ? 'lumina compile src/client.lm --target js --module esm --out dist/main.js'
    : 'vite build';
  const devScript = useVitePlugin
    ? 'vite --host 127.0.0.1'
    : 'npm run build && vite --host 127.0.0.1';
  const pkg = {
    name,
    version: '0.1.0',
    luminaTemplate: template,
    lumina: './src/client.lm',
    scripts: withSsg
      ? {
          check: 'lumina check src/client.lm && lumina check src/ssg.lm',
          build: buildScript,
          ssg: 'lumina ssg src/ssg.lm --out dist/index.html --hydrate ./main.js --title "Lumina App"',
          dev: devScript,
        }
      : {
          check: 'lumina check src/client.lm',
          build: buildScript,
          dev: devScript,
        },
    dependencies: {},
    devDependencies: {
      vite: '^7.2.6',
      'lumina-lang': luminaPackageVersion,
    },
  };
  await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
  await writeJson(pkgPath, pkg);
  await writeManifest(cwd, {
    name,
    version: '0.1.0',
    entry: 'src/client.lm',
    description: null,
    authors: [],
    license: null,
    dependencies: new Map(),
    devDeps: new Map(),
    registry: null,
    cdn: null,
  });
  await writeJson(path.join(cwd, 'lumina.config.json'), {
    entries: ['src/client.lm'],
    outDir: 'dist',
    target: 'js',
    module: 'esm',
  });
  await writeFileIfMissing(
    path.join(cwd, 'vite.config.ts'),
    useVitePlugin
      ? `import { defineConfig } from 'vite';
import { luminaPlugin } from 'lumina-lang/vite-plugin';

export default defineConfig({
  plugins: [luminaPlugin()],
  server: {
    host: '127.0.0.1'
  },
  preview: {
    host: '127.0.0.1'
  }
});
`
      : `import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1'
  },
  preview: {
    host: '127.0.0.1'
  }
});
`
  );
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
    <script type="module" src="${useVitePlugin ? '/src/client.lm' : '/dist/main.js'}"></script>
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
  const appSource = template === 'minimal'
    ? `import { render } from "@std";

pub component App() -> VNode {
  render.element("main", render.props_class("app-shell"), [
    render.element("section", render.props_class("app-panel"), [
      render.element("h1", render.props_class("app-title"), [render.text("Lumina App")]),
      render.element("p", render.props_class("app-data"), [render.text("Minimal starter ready")])
    ])
  ])
}
`
    : `import { render } from "@std";
import {
  createRouter,
  currentPath,
  Router,
  routeAction,
  routeActionStatus,
  linkWithProps,
  optimisticRouteMutate,
  prefetchRoute,
  refreshRoute,
  routeLoading,
  routeLoader,
  routeRead,
  routeStatus,
  submitRouteAction
} from "@std/router";

async fn loadDashboard() -> string {
  "Lumina route data is ready"
}

async fn saveDashboard() -> string {
  "Route action saved"
}

pub component App(appRouter: Router) -> VNode {
  let dashboard = routeLoader(appRouter, "dashboard", || loadDashboard());
  let _settingsPrefetch = prefetchRoute(appRouter, "/settings", "dashboard", || loadDashboard());
  let saveAction = routeAction(appRouter, "save-dashboard", || saveDashboard());

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
      routeLoading(dashboard, render.text("Loading route data"), || [
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
        })), [render.text("Optimistic update")]),
        render.element("button", render.props_merge(render.props_class("action-button"), render.props_on_click(fn() -> void {
          let _ = submitRouteAction(saveAction)
        })), [render.text("Save action")])
      ]),
      render.element("p", render.props_class("app-status"), [
        render.text("Action status: "),
        render.text(routeActionStatus(saveAction))
      ])
    ])
  ])
}
`;
  await writeFileIfMissing(path.join(cwd, 'src', 'app.lm'), appSource);
  await writeFileIfMissing(
    path.join(cwd, 'src', 'client.lm'),
    template === 'minimal'
      ? `import { render } from "@std";
import { App } from "./app.lm";

pub fn main() -> void {
  let container = render.dom_get_element_by_id("app");
  let renderer = render.createDomRenderer();
  let _root = render.mount_reactive(renderer, container, || App());
}

main();
`
      : `import { render } from "@std";
import { createRouter } from "@std/router";
import { App } from "./app.lm";

pub fn main() -> void {
  let container = render.dom_get_element_by_id("app");
  let renderer = render.createDomRenderer();
  let appRouter = createRouter("/");
  let _root = render.hydrate_reactive(renderer, container, || App(appRouter));
}

main();
`
  );
  if (withSsg) {
    await writeFileIfMissing(
      path.join(cwd, 'src', 'ssg.lm'),
      `import { createRouter } from "@std/router";
import { App } from "./app.lm";

pub fn main() -> VNode {
  App(createRouter("/"))
}
`
    );
  }
  await writeFileIfMissing(path.join(cwd, 'README.md'), `# ${name}

${templateReadme(template)}

## Commands

- \`npm run check\`
- \`npm run build\`
${withSsg ? '- `npm run ssg`\n' : ''}
`);
  if (template === 'auth') {
    await writeFileIfMissing(path.join(cwd, 'src', 'session.lm'), `pub struct Session {
  user: string,
  authenticated: bool
}

pub fn anonymous() -> Session {
  Session { user: "", authenticated: false }
}
`);
  }
  if (template === 'testing') {
    await writeFileIfMissing(path.join(cwd, 'src', 'app.test.lm'), `import { flush } from "@std/testing";

pub async fn smoke() -> void {
  await flush()
}
`);
  }
  if (template === 'large-app') {
    await writeFileIfMissing(path.join(cwd, 'src', 'routes.lm'), `import { routeNode, RouteNode } from "@std/router";

pub fn rootRoute() -> RouteNode {
  routeNode("root", "/", "Home")
}

pub fn settingsRoute() -> RouteNode {
  routeNode("settings", "/settings", "Settings")
}
`);
  }
  if (template === 'deploy') {
    await writeFileIfMissing(path.join(cwd, 'deploy', 'README.md'), `# Deploy

Run \`npm run build && npm run ssg\`, then publish \`dist/\`.
`);
  }
  if (!options.yes) {
    console.log(`Initialized package.json in ${cwd}`);
  }
}

export async function installPackages(options: { frozen?: boolean } = {}): Promise<void> {
  const root = await findPackageRoot(process.cwd());
  const args = options.frozen ? ['ci'] : ['install'];
  await spawnCommand('npm', args, root);
  const lockfile = await buildLockfile(root);
  await writeLockfile(root, lockfile);
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
  await writeLockfile(root, lockfile);
}

function selectEntryKeysByNameAndConstraint(
  lockfile: LockfileData,
  name: string,
  constraint: string
): string[] {
  return Array.from(lockfile.packages.entries())
    .filter(([, entry]) => entry.name === name && satisfiesLockfileConstraint(entry.version, constraint))
    .map(([key]) => key);
}

function resolveLockedDependencyKey(
  lockfile: LockfileData,
  name: string,
  lockedKeyOrVersion: string
): string | null {
  const direct = lockfile.packages.get(lockedKeyOrVersion);
  if (direct?.name === name) return lockedKeyOrVersion;
  const versionKey = lockfileKey(name, lockedKeyOrVersion);
  const byVersion = lockfile.packages.get(versionKey);
  if (byVersion?.name === name) return versionKey;
  return null;
}

function pruneLockfile(manifest: PackageManifest, lockfile: LockfileData): LockfileData {
  const reachable = new Set<string>();
  const queue: string[] = [];
  const rootDeps = new Map([...manifest.dependencies.entries(), ...manifest.devDeps.entries()]);

  const enqueue = (key: string | null) => {
    if (!key || reachable.has(key) || !lockfile.packages.has(key)) return;
    reachable.add(key);
    queue.push(key);
  };

  for (const [name, constraint] of rootDeps) {
    for (const key of selectEntryKeysByNameAndConstraint(lockfile, name, constraint)) {
      enqueue(key);
    }
  }

  while (queue.length > 0) {
    const key = queue.shift()!;
    const entry = lockfile.packages.get(key);
    if (!entry) continue;
    for (const [name, lockedKeyOrVersion] of entry.resolvedDeps ?? []) {
      enqueue(resolveLockedDependencyKey(lockfile, name, lockedKeyOrVersion));
    }
    for (const [name, constraint] of entry.deps) {
      for (const candidate of selectEntryKeysByNameAndConstraint(lockfile, name, constraint)) {
        enqueue(candidate);
      }
    }
  }

  const packages = new Map<string, LockfileEntry>();
  for (const [key, entry] of lockfile.packages) {
    if (reachable.has(key)) packages.set(key, entry);
  }
  return { version: lockfile.version, packages };
}

function parseRemovePackageName(spec: string): string {
  const value = spec.trim();
  if (!value) throw new Error('Missing package specifier.');
  const atIndex = value.startsWith('@') ? value.indexOf('@', value.indexOf('/') + 1) : value.lastIndexOf('@');
  return atIndex > 0 ? value.slice(0, atIndex) : value;
}

function pruneBrowserLock(browserLock: BrowserLock, retainedKeys: Set<string>): BrowserLock {
  const packages = new Map<string, BrowserLockEntry>();
  for (const [key, entry] of browserLock.packages) {
    if (retainedKeys.has(key)) packages.set(key, entry);
  }
  return { version: browserLock.version, packages };
}

export async function removePackages(specs: string[]): Promise<void> {
  if (specs.length === 0) throw new Error('Missing package names.');
  const root = await findProjectRoot(process.cwd());
  const manifest = await readManifest(root);
  const removed = new Set(specs.map(parseRemovePackageName));
  const nextManifest: PackageManifest = {
    ...manifest,
    dependencies: new Map(manifest.dependencies),
    devDeps: new Map(manifest.devDeps),
    peerDeps: new Map(manifest.peerDeps ?? []),
  };
  for (const name of removed) {
    nextManifest.dependencies.delete(name);
    nextManifest.devDeps.delete(name);
  }

  const lockfile = await readLockfile(root);
  const nextLockfile = pruneLockfile(nextManifest, lockfile);
  await writeManifest(root, nextManifest);
  await writeLockfile(root, nextLockfile);
  if (await fileExists(path.join(root, BROWSER_LOCKFILE_FILENAME))) {
    const browserLock = await readBrowserLockfile(root);
    await writeBrowserLockfile(root, pruneBrowserLock(browserLock, new Set(nextLockfile.packages.keys())));
  }
}

export async function listPackages(): Promise<void> {
  const root = await findProjectRoot(process.cwd());
  const lockfile = await readLockfile(root);
  if (lockfile.packages.size === 0) {
    console.log(`No Lumina packages found (${LOCKFILE_FILENAME} missing or empty).`);
    return;
  }
  for (const pkg of Array.from(lockfile.packages.values()).sort((a, b) => a.name.localeCompare(b.name))) {
    const entry = typeof pkg.lumina === 'string' ? pkg.lumina : pkg.lumina?.['.'];
    console.log(`${pkg.name}@${pkg.version} -> ${entry ?? '(no entry)'}`);
  }
}
