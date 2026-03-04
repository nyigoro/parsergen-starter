import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fg from 'fast-glob';
import { readManifest, validateManifest, type PackageManifest } from '../lumina/package-manifest.js';
import { getPackageInfo, publishPackage, resolveRegistryConfig } from '../lumina/registry-client.js';

type PublishDependencies = {
  readManifest: typeof readManifest;
  validateManifest: typeof validateManifest;
  resolveRegistryConfig: typeof resolveRegistryConfig;
  getPackageInfo: typeof getPackageInfo;
  publishPackage: typeof publishPackage;
};

const DEFAULT_DEPENDENCIES: PublishDependencies = {
  readManifest,
  validateManifest,
  resolveRegistryConfig,
  getPackageInfo,
  publishPackage,
};

type PublishOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<Console, 'log'>;
  deps?: Partial<PublishDependencies>;
  runCompileCheck?: (cwd: string, entry: string) => Promise<void>;
};

const DEFAULT_IGNORE = ['.lumina/**', 'tests/**', '**/*.test.lm', '.tmp/**', 'node_modules/**'];

const readIgnorePatterns = async (cwd: string): Promise<string[]> => {
  const ignorePath = path.join(cwd, '.luminaignore');
  if (!existsSync(ignorePath)) return [];
  const raw = await fs.readFile(ignorePath, 'utf-8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
};

const buildTarballPayload = async (cwd: string, files: string[]): Promise<Buffer> => {
  const payload: Array<{ path: string; content: string }> = [];
  for (const relativePath of files) {
    const absolutePath = path.join(cwd, relativePath);
    const content = await fs.readFile(absolutePath);
    payload.push({ path: relativePath, content: content.toString('base64') });
  }
  return gzipSync(Buffer.from(JSON.stringify({ files: payload })));
};

const runCompileDryRun = async (cwd: string, entry: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const proc = spawn(command, ['tsx', 'src/bin/lumina.ts', 'compile', entry, '--dry-run'], {
      cwd,
      stdio: 'pipe',
      shell: false,
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || 'Entry dry-run compile failed'));
    });
  });

export async function runLuminaPublish(argv: string[], options: PublishOptions = {}): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? console;
  const dependencies: PublishDependencies = { ...DEFAULT_DEPENDENCIES, ...(options.deps ?? {}) };
  const compileCheck = options.runCompileCheck ?? runCompileDryRun;
  if (argv.includes('--help') || argv.includes('-h')) {
    stdout.log('Usage: lumina publish');
    return;
  }

  const manifest = await dependencies.readManifest(cwd);
  const validationErrors = dependencies.validateManifest(manifest, cwd);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.map((error) => `${error.field}: ${error.message}`).join('\n'));
  }

  const entryPath = path.resolve(cwd, manifest.entry);
  if (!existsSync(entryPath)) {
    throw new Error(`Entry file does not exist: ${manifest.entry}`);
  }

  await compileCheck(cwd, manifest.entry);

  const ignorePatterns = [...DEFAULT_IGNORE, ...(await readIgnorePatterns(cwd))];
  const files = await fg(['**/*.lm', 'lumina.toml'], {
    cwd,
    dot: false,
    onlyFiles: true,
    ignore: ignorePatterns,
  });
  const tarball = await buildTarballPayload(cwd, files);
  const integrity = `sha256:${createHash('sha256').update(tarball).digest('hex')}`;

  const config = dependencies.resolveRegistryConfig(manifest, env);
  if (!config.token) {
    throw new Error('AUTH: registry requires authentication, set LUMINA_TOKEN');
  }

  try {
    const info = await dependencies.getPackageInfo(manifest.name, config);
    if (info.versions.includes(manifest.version)) {
      throw new Error(`Version ${manifest.version} is already published for ${manifest.name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/404/.test(message)) {
      throw error;
    }
  }

  const result = await dependencies.publishPackage(tarball, manifest as PackageManifest, config);
  stdout.log(`published ${manifest.name}@${manifest.version} (${integrity}) -> ${result.url}`);
}
