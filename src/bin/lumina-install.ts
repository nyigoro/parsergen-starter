import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readManifest } from '../lumina/package-manifest.js';
import { integrityStatus, isOutOfSync, readLockfile, type LockfileData } from '../lumina/lockfile.js';
import { downloadTarball, resolveRegistryConfig, type RegistryClientConfig } from '../lumina/registry-client.js';

type InstallDependencies = {
  readManifest: typeof readManifest;
  readLockfile: typeof readLockfile;
  isOutOfSync: typeof isOutOfSync;
  downloadTarball: typeof downloadTarball;
  integrityStatus: typeof integrityStatus;
  resolveRegistryConfig: typeof resolveRegistryConfig;
};

const DEFAULT_DEPENDENCIES: InstallDependencies = {
  readManifest,
  readLockfile,
  isOutOfSync,
  downloadTarball,
  integrityStatus,
  resolveRegistryConfig,
};

type InstallOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<Console, 'log'>;
  deps?: Partial<InstallDependencies>;
};

const packageCacheDir = (cwd: string): string => path.join(cwd, '.lumina', 'packages');
const packageInstallDir = (cwd: string, name: string, version: string): string =>
  path.join(packageCacheDir(cwd), `${name.replace(/\//g, '+')}@${version}`);
const resolveInstallDir = (cwd: string, name: string, version: string, relativePath?: string): string =>
  relativePath ? path.resolve(cwd, relativePath) : packageInstallDir(cwd, name, version);

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

const materializePackage = async (
  installDir: string,
  name: string,
  version: string,
  tarball: Buffer,
  force: boolean
): Promise<'installed' | 'cached'> => {
  if (!force && existsSync(installDir)) return 'cached';
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
  return 'installed';
};

const parseFlags = (argv: string[]): { frozen: boolean; force: boolean } => ({
  frozen: argv.includes('--frozen'),
  force: argv.includes('--force'),
});

const runWithConcurrency = async <T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> => {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(workers);
};

export async function runLuminaInstall(argv: string[], options: InstallOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? console;
  const dependencies: InstallDependencies = { ...DEFAULT_DEPENDENCIES, ...(options.deps ?? {}) };
  const { frozen, force } = parseFlags(argv);

  const manifest = await dependencies.readManifest(cwd);
  const lockfile = await dependencies.readLockfile(cwd);
  const outOfSync = dependencies.isOutOfSync(manifest, lockfile);
  if (frozen && outOfSync.length > 0) {
    throw new Error(`Lockfile is out of sync for: ${outOfSync.join(', ')}`);
  }

  const config: RegistryClientConfig = dependencies.resolveRegistryConfig(manifest, env);
  let installed = 0;
  let cached = 0;
  const entries = Array.from(lockfile.packages.values());

  await runWithConcurrency(entries, 4, async (entry) => {
    const installDir = resolveInstallDir(cwd, entry.name, entry.version, entry.path);
    if (!force && existsSync(installDir)) {
      cached += 1;
      return;
    }
    const tarball = await dependencies.downloadTarball(entry.resolved, config);
    const status = dependencies.integrityStatus(tarball, entry.integrity);
    if (status === 'missing') {
      throw new Error(`SECURITY: missing integrity for ${entry.name}@${entry.version}`);
    }
    if (status === 'mismatch') {
      throw new Error(`SECURITY: integrity check failed for ${entry.name}@${entry.version}`);
    }
    const result = await materializePackage(installDir, entry.name, entry.version, tarball, force);
    if (result === 'installed') installed += 1;
    else cached += 1;
  });

  stdout.log(`installed ${installed} packages, ${cached} already cached`);
}

export type { LockfileData };
