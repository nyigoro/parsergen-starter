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
  if (Array.isArray(pkg?.workspaces)) patterns.push(...pkg!.workspaces);
  if (pkg?.workspaces && typeof pkg.workspaces === 'object' && Array.isArray(pkg.workspaces.packages)) {
    patterns.push(...pkg.workspaces.packages);
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
    dependencies: {},
  };
  await fs.mkdir(path.join(cwd, 'src'), { recursive: true });
  await writeJson(pkgPath, pkg);
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
