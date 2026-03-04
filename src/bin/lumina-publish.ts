import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fg from 'fast-glob';
import {
  readManifest,
  validateManifest,
  writeManifest,
  type PackageManifest,
} from '../lumina/package-manifest.js';
import {
  buildCdnUrl,
  getPackageInfo,
  publishCDNArtifact,
  publishPackage,
  resolveRegistryConfig,
  type CDNArtifact,
  type CDNResult,
  type CdnProvider,
} from '../lumina/registry-client.js';

type PublishDependencies = {
  readManifest: typeof readManifest;
  writeManifest: typeof writeManifest;
  validateManifest: typeof validateManifest;
  resolveRegistryConfig: typeof resolveRegistryConfig;
  getPackageInfo: typeof getPackageInfo;
  publishPackage: typeof publishPackage;
  publishCDNArtifact: typeof publishCDNArtifact;
};

const DEFAULT_DEPENDENCIES: PublishDependencies = {
  readManifest,
  writeManifest,
  validateManifest,
  resolveRegistryConfig,
  getPackageInfo,
  publishPackage,
  publishCDNArtifact,
};

type PublishOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<Console, 'log'>;
  deps?: Partial<PublishDependencies>;
  runCompileCheck?: (cwd: string, entry: string) => Promise<void>;
};

const DEFAULT_IGNORE = ['.lumina/**', 'tests/**', '**/*.test.lm', '.tmp/**', 'node_modules/**'];

const normalizeIntegrity = (value: string): string =>
  value.startsWith('sha256:') ? value : `sha256:${value}`;

const parseFlagValue = (argv: string[], name: string): string | null => {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
};

const hasFlag = (argv: string[], name: string): boolean => argv.includes(name);

const parseCdnProviders = (argv: string[]): CdnProvider[] => {
  const raw = (parseFlagValue(argv, '--cdn-provider') ?? 'both').toLowerCase();
  if (raw === 'lumina') return ['lumina'];
  if (raw === 'npm') return ['npm'];
  return ['lumina', 'npm'];
};

const runBundle = async (
  cwd: string,
  entry: string,
  target: 'browser' | 'wasm',
  outPath: string,
  loaderOut?: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['tsx', 'src/bin/lumina.ts', 'bundle', entry, '--target', target, '--out', outPath];
    if (loaderOut) args.push('--loader-out', loaderOut);
    const proc = spawn(command, args, {
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
      else reject(new Error(stderr || `Bundle failed for ${target}`));
    });
  });

const uploadCdnArtifact = async (
  providers: CdnProvider[],
  artifact: Omit<CDNArtifact, 'provider'>,
  config: ReturnType<typeof resolveRegistryConfig>,
  dependencies: PublishDependencies
): Promise<CDNResult[]> => {
  const results: CDNResult[] = [];
  for (const provider of providers) {
    const published = await dependencies.publishCDNArtifact(
      { ...artifact, provider },
      config
    );
    results.push(published);
  }
  return results;
};

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
    stdout.log('Usage: lumina publish [--cdn] [--cdn-provider <lumina|npm|both>]');
    return;
  }
  const useCdn = hasFlag(argv, '--cdn');
  const cdnProviders = parseCdnProviders(argv);

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

  if (!useCdn) return;

  const tempDir = path.join(cwd, '.lumina', 'publish-cdn');
  await fs.mkdir(tempDir, { recursive: true });
  const browserOut = path.join(tempDir, 'index.js');
  const wasmOut = path.join(tempDir, 'index.wasm');
  const loaderOut = path.join(tempDir, 'loader.js');

  await runBundle(cwd, manifest.entry, 'browser', browserOut);
  await runBundle(cwd, manifest.entry, 'wasm', wasmOut, loaderOut);

  const browserData = await fs.readFile(browserOut);
  const wasmData = await fs.readFile(wasmOut);
  const sourceArtifact = {
    name: manifest.name,
    version: manifest.version,
    kind: 'source' as const,
    data: tarball,
    integrity: normalizeIntegrity(integrity),
    filename: 'package.tgz',
  };
  const esmArtifact = {
    name: manifest.name,
    version: manifest.version,
    kind: 'esm' as const,
    data: browserData,
    integrity: normalizeIntegrity(createHash('sha256').update(browserData).digest('hex')),
    filename: 'index.js',
  };
  const wasmArtifact = {
    name: manifest.name,
    version: manifest.version,
    kind: 'wasm' as const,
    data: wasmData,
    integrity: normalizeIntegrity(createHash('sha256').update(wasmData).digest('hex')),
    filename: 'index.wasm',
  };

  const publishedSource = await uploadCdnArtifact(cdnProviders, sourceArtifact, config, dependencies);
  const publishedEsm = await uploadCdnArtifact(cdnProviders, esmArtifact, config, dependencies);
  const publishedWasm = await uploadCdnArtifact(cdnProviders, wasmArtifact, config, dependencies);

  for (const entry of [...publishedSource, ...publishedEsm, ...publishedWasm]) {
    stdout.log(`cdn ${entry.provider}: ${entry.url} (${entry.integrity})`);
  }

  const nextManifest: PackageManifest = {
    ...manifest,
    cdn: {
      lumina:
        publishedEsm.find((entry) => entry.provider === 'lumina')?.url ??
        buildCdnUrl('lumina', manifest.name, manifest.version, 'index.js'),
      npm:
        publishedEsm.find((entry) => entry.provider === 'npm')?.url ??
        buildCdnUrl('npm', manifest.name, manifest.version, 'index.js'),
    },
  };
  await dependencies.writeManifest(cwd, nextManifest);
  stdout.log('Updated lumina.toml [cdn] URLs');
}
