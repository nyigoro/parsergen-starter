import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { addDependency, readManifest, writeManifest, type PackageManifest } from '../lumina/package-manifest.js';
import { addEntry, readLockfile, verifyIntegrity, writeLockfile, type LockfileData } from '../lumina/lockfile.js';
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
  verifyIntegrity: typeof verifyIntegrity;
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
  verifyIntegrity,
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

const materializePackage = async (cwd: string, name: string, version: string, tarball: Buffer): Promise<string> => {
  const installDir = packageInstallDir(cwd, name, version);
  await fs.rm(installDir, { recursive: true, force: true });
  await fs.mkdir(installDir, { recursive: true });
  await fs.writeFile(path.join(installDir, 'package.tgz'), tarball);
  const payload = decodePublishedPayload(tarball);
  if (payload) {
    for (const file of payload.files ?? []) {
      if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') continue;
      const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const abs = path.resolve(installDir, normalized);
      if (!abs.startsWith(installDir)) continue;
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

const ensureManifest = async (cwd: string, dependencies: AddDependencies): Promise<PackageManifest> => {
  try {
    return await dependencies.readManifest(cwd);
  } catch {
    if (existsSync(path.join(cwd, 'lumina.toml')) || existsSync(path.join(cwd, 'package.json'))) {
      throw new Error('Unable to read lumina.toml');
    }
    throw new Error('Missing lumina.toml (or package.json fallback). Run `lumina init` first.');
  }
};

const updateLock = (
  cwd: string,
  lockfile: LockfileData,
  info: RegistryVersionInfo,
  installDir: string,
  luminaEntry?: string | Record<string, string>
): LockfileData =>
  addEntry(lockfile, {
    name: info.name,
    version: info.version,
    resolved: info.resolved,
    path: toPosixRelative(cwd, installDir),
    integrity: info.integrity,
    lumina: luminaEntry,
    deps: new Map(info.deps),
  });

export async function runLuminaAdd(argv: string[], options: AddOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? console;
  const stderr = options.stderr ?? console;
  const dependencies: AddDependencies = { ...DEFAULT_DEPENDENCIES, ...(options.deps ?? {}) };

  const args = argv.filter((arg) => !arg.startsWith('--'));
  if (args.length === 0) {
    throw new Error('Usage: lumina add <pkg[@version]>');
  }

  for (const spec of args) {
    const { name, constraint } = parsePackageSpec(spec);
    const manifest = await ensureManifest(cwd, dependencies);
    const config: RegistryClientConfig = dependencies.resolveRegistryConfig(manifest, env);
    const resolvedVersion = await dependencies.resolveVersion(name, constraint, config);
    const info = await dependencies.getVersionInfo(name, resolvedVersion, config);
    const tarball = await dependencies.downloadTarball(info.resolved, config);
    const integrityOk = dependencies.verifyIntegrity(tarball, info.integrity);
    if (!integrityOk) {
      stderr.error(`SECURITY: integrity check failed for ${name}@${resolvedVersion}`);
      throw new Error(`Integrity mismatch for ${name}@${resolvedVersion}`);
    }
    const installDir = await materializePackage(cwd, info.name, info.version, tarball);
    const luminaEntry = await inferLuminaEntry(installDir, info.lumina);

    const updatedManifest = addDependency(manifest, name, constraint === 'latest' ? `^${resolvedVersion}` : constraint);
    const lockfile = await dependencies.readLockfile(cwd);
    const updatedLockfile = updateLock(cwd, lockfile, info, installDir, luminaEntry);
    await dependencies.writeManifest(cwd, updatedManifest);
    await dependencies.writeLockfile(cwd, updatedLockfile);
    stdout.log(`added ${info.name}@${info.version}`);
  }
}
