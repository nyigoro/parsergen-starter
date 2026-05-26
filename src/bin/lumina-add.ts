import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  addDependency,
  addDevDependency,
  readManifest,
  writeManifest,
  type PackageManifest,
} from '../lumina/package-manifest.js';
import {
  addEntry,
  integrityStatus,
  readLockfile,
  validatePeerDependencies,
  writeLockfile,
  type LockfileData,
} from '../lumina/lockfile.js';
import {
  downloadTarball,
  getVersionInfo,
  resolveRegistryConfig,
  resolveVersion,
  type RegistryClientConfig,
  type RegistryVersionInfo,
} from '../lumina/registry-client.js';

type AddDependencies = {
  readManifest: typeof readManifest;
  writeManifest: typeof writeManifest;
  readLockfile: typeof readLockfile;
  writeLockfile: typeof writeLockfile;
  resolveRegistryConfig: typeof resolveRegistryConfig;
  resolveVersion: typeof resolveVersion;
  getVersionInfo: typeof getVersionInfo;
  downloadTarball: typeof downloadTarball;
  integrityStatus: typeof integrityStatus;
};

const DEFAULT_DEPENDENCIES: AddDependencies = {
  readManifest,
  writeManifest,
  readLockfile,
  writeLockfile,
  resolveRegistryConfig,
  resolveVersion,
  getVersionInfo,
  downloadTarball,
  integrityStatus,
};

type AddOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<Console, 'log'>;
  stderr?: Pick<Console, 'error'>;
  deps?: Partial<AddDependencies>;
};

const packageCacheDir = (cwd: string): string => path.join(cwd, '.lumina', 'packages');
const packageInstallDir = (cwd: string, name: string, version: string): string =>
  path.join(packageCacheDir(cwd), `${name.replace(/\//g, '+')}@${version}`);
const toPosixRelative = (base: string, target: string): string => path.relative(base, target).replace(/\\/g, '/');

const parsePackageSpec = (input: string): { name: string; constraint: string } => {
  const value = input.trim();
  if (!value) throw new Error('Missing package specifier.');
  const atIndex = value.startsWith('@') ? value.indexOf('@', value.indexOf('/') + 1) : value.lastIndexOf('@');
  if (atIndex <= 0) return { name: value, constraint: 'latest' };
  const name = value.slice(0, atIndex);
  const constraint = value.slice(atIndex + 1);
  return { name, constraint: constraint.length > 0 ? constraint : 'latest' };
};

type PackagePayload = { files?: Array<{ path: string; content: string }> };

const decodePublishedPayload = (tarball: Buffer): PackagePayload | null => {
  try {
    const parsed = JSON.parse(gunzipSync(tarball).toString('utf-8')) as PackagePayload;
    if (!Array.isArray(parsed.files)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const resolvePayloadPath = (installDir: string, payloadPath: string): string | null => {
  const normalized = payloadPath.replace(/\\/g, '/');
  if (path.isAbsolute(normalized)) return null;
  const abs = path.resolve(installDir, normalized);
  const relative = path.relative(installDir, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return abs;
};

const materializePackage = async (cwd: string, name: string, version: string, tarball: Buffer): Promise<string> => {
  const installDir = packageInstallDir(cwd, name, version);
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.mkdir(installDir, { recursive: true });
  await fs.writeFile(path.join(installDir, 'package.tgz'), tarball);
  const payload = decodePublishedPayload(tarball);
  if (payload) {
    for (const file of payload.files ?? []) {
      if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
      const abs = resolvePayloadPath(installDir, file.path);
      if (!abs) continue;
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, Buffer.from(file.content, 'base64'));
    }
  }
  await fs.writeFile(path.join(installDir, 'manifest.json'), JSON.stringify({ name, version }, null, 2), 'utf-8');
  return installDir;
};

const normalizeLuminaEntry = (entry: string): string =>
  entry.startsWith('./') ? entry : `./${entry.replace(/^\/+/, '')}`;

const inferLuminaEntry = async (
  installDir: string,
  declared?: string | Record<string, string>
): Promise<string | Record<string, string> | undefined> => {
  if (declared) return declared;
  try {
    const manifest = await readManifest(installDir);
    if (manifest.entry && typeof manifest.entry === 'string') {
      return normalizeLuminaEntry(manifest.entry);
    }
  } catch {
    // ignore
  }
  return undefined;
};

const normalizePackageName = (value: string): string => {
  const raw = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return raw || 'lumina-package';
};

const createBootstrapManifest = (cwd: string): PackageManifest => ({
  name: normalizePackageName(path.basename(cwd)),
  version: '0.1.0',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map(),
  devDeps: new Map(),
  registry: null,
  cdn: null,
});

const ensureManifest = async (cwd: string, dependencies: AddDependencies): Promise<PackageManifest> => {
  try {
    return await dependencies.readManifest(cwd);
  } catch {
    if (existsSync(path.join(cwd, 'lumina.toml')) || existsSync(path.join(cwd, 'package.json'))) {
      throw new Error('Unable to read lumina.toml');
    }
    const bootstrap = createBootstrapManifest(cwd);
    await dependencies.writeManifest(cwd, bootstrap);
    return bootstrap;
  }
};

const updateLock = (
  cwd: string,
  lockfile: LockfileData,
  info: RegistryVersionInfo,
  installDir: string,
  luminaEntry?: string | Record<string, string>,
  resolvedDeps: Map<string, string> = new Map()
): LockfileData =>
  addEntry(lockfile, {
    name: info.name,
    version: info.version,
    resolved: info.resolved,
    path: toPosixRelative(cwd, installDir),
    integrity: info.integrity,
    lumina: luminaEntry,
    cdnUrl: info.cdnUrl ?? null,
    npmCdnUrl: info.npmCdnUrl ?? null,
    esm: info.esm ?? null,
    wasm: info.wasm ?? null,
    deps: new Map(info.deps),
    peerDeps: new Map(info.peerDeps ?? []),
    resolvedDeps,
  });

const installPackageGraph = async (
  cwd: string,
  name: string,
  constraint: string,
  config: RegistryClientConfig,
  lockfile: LockfileData,
  dependencies: AddDependencies,
  stderr: Pick<Console, 'error'>,
  installed = new Set<string>()
): Promise<{ lockfile: LockfileData; info: RegistryVersionInfo }> => {
  const resolvedVersion = await dependencies.resolveVersion(name, constraint, config);
  const info = await dependencies.getVersionInfo(name, resolvedVersion, config);
  const key = `${info.name}@${info.version}`;
  let nextLockfile = lockfile;

  if (installed.has(key)) return { lockfile: nextLockfile, info };
  installed.add(key);

  const tarball = await dependencies.downloadTarball(info.resolved, config);
  const status = dependencies.integrityStatus(tarball, info.integrity);
  if (status !== 'ok') {
    if (status === 'missing') {
      stderr.error(`SECURITY: missing integrity for ${info.name}@${info.version}`);
      throw new Error(`Missing integrity for ${info.name}@${info.version}`);
    }
    stderr.error(`SECURITY: integrity check failed for ${info.name}@${info.version}`);
    throw new Error(`Integrity mismatch for ${info.name}@${info.version}`);
  }

  const installDir = await materializePackage(cwd, info.name, info.version, tarball);
  const luminaEntry = await inferLuminaEntry(installDir, info.lumina);
  const resolvedDeps = new Map<string, string>();

  for (const [depName, depConstraint] of info.deps.entries()) {
    const result = await installPackageGraph(
      cwd,
      depName,
      depConstraint,
      config,
      nextLockfile,
      dependencies,
      stderr,
      installed
    );
    nextLockfile = result.lockfile;
    resolvedDeps.set(depName, `${result.info.name}@${result.info.version}`);
  }

  nextLockfile = updateLock(cwd, nextLockfile, info, installDir, luminaEntry, resolvedDeps);

  return { lockfile: nextLockfile, info };
};

export async function runLuminaAdd(argv: string[], options: AddOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? console;
  const stderr = options.stderr ?? console;
  const dependencies: AddDependencies = { ...DEFAULT_DEPENDENCIES, ...(options.deps ?? {}) };

  const dev = argv.includes('--dev');
  const args = argv.filter((arg) => !arg.startsWith('--'));
  if (args.length === 0) {
    throw new Error('Usage: lumina add [--dev] <pkg[@version]>');
  }

  for (const spec of args) {
    const { name, constraint } = parsePackageSpec(spec);
    const manifest = await ensureManifest(cwd, dependencies);
    const config: RegistryClientConfig = dependencies.resolveRegistryConfig(manifest, env);
    const lockfile = await dependencies.readLockfile(cwd);
    const { lockfile: updatedLockfile, info } = await installPackageGraph(
      cwd,
      name,
      constraint,
      config,
      lockfile,
      dependencies,
      stderr
    );
    const manifestConstraint = constraint === 'latest' ? `^${info.version}` : constraint;
    const updatedManifest = dev
      ? addDevDependency(manifest, name, manifestConstraint)
      : addDependency(manifest, name, manifestConstraint);
    const peerDiagnostics = validatePeerDependencies(updatedManifest, updatedLockfile);
    if (peerDiagnostics.length > 0) {
      throw new Error(`Peer dependency validation failed:\n${peerDiagnostics.join('\n')}`);
    }
    await dependencies.writeManifest(cwd, updatedManifest);
    await dependencies.writeLockfile(cwd, updatedLockfile);
    stdout.log(`added ${info.name}@${info.version}${dev ? ' (dev)' : ''}`);
  }
}
