import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { runLuminaPublish } from '../src/bin/lumina-publish.js';
import type { PackageManifest, ValidationError } from '../src/lumina/package-manifest.js';
import type { RegistryClientConfig } from '../src/lumina/registry-client.js';

const tempDirs: string[] = [];

const createTempProject = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-publish-test-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
};

const baseManifest = (): PackageManifest => ({
  name: 'demo-pkg',
  version: '1.2.3',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map(),
  devDeps: new Map(),
  registry: null,
  cdn: null,
});

const okConfig: RegistryClientConfig = {
  url: 'https://registry.example.test',
  token: 'token',
};

const decodeTarball = (buffer: Buffer): { files: Array<{ path: string; content: string }> } =>
  JSON.parse(gunzipSync(buffer).toString('utf-8')) as { files: Array<{ path: string; content: string }> };

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  jest.restoreAllMocks();
});

describe('lumina publish', () => {
  it('fails before network calls when manifest validation fails', async () => {
    const cwd = createTempProject();
    fs.writeFileSync(path.join(cwd, 'src/main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');

    const publishPackage = jest.fn(async () => ({ url: 'https://registry.example/pkg' }));
    const publishCDNArtifact = jest.fn();

    await expect(
      runLuminaPublish([], {
        cwd,
        deps: {
          readManifest: async () => baseManifest(),
          validateManifest: () => [{ field: 'name', message: 'required' }] as ValidationError[],
          resolveRegistryConfig: () => okConfig,
          getPackageInfo: async () => {
            throw new Error('404');
          },
          publishPackage,
          publishCDNArtifact,
          writeManifest: async () => {},
        },
        runCompileCheck: async () => {},
      })
    ).rejects.toThrow('name: required');

    expect(publishPackage).not.toHaveBeenCalled();
    expect(publishCDNArtifact).not.toHaveBeenCalled();
  });

  it('errors when entry file is missing', async () => {
    const cwd = createTempProject();
    const manifest = { ...baseManifest(), entry: 'src/missing.lm' };

    await expect(
      runLuminaPublish([], {
        cwd,
        deps: {
          readManifest: async () => manifest,
          validateManifest: () => [],
          resolveRegistryConfig: () => okConfig,
          getPackageInfo: async () => {
            throw new Error('404');
          },
          publishPackage: async () => ({ url: 'https://registry.example/pkg' }),
          publishCDNArtifact: async () => ({ url: '', integrity: '', provider: 'lumina' }),
          writeManifest: async () => {},
        },
        runCompileCheck: async () => {},
      })
    ).rejects.toThrow('Entry file does not exist');
  });

  it('builds tarball with ignore rules and emits deterministic integrity', async () => {
    const cwd = createTempProject();
    fs.writeFileSync(path.join(cwd, 'src/main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'src/keep.lm'), 'fn keep() -> i32 { 1 }\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'src/secret.lm'), 'fn secret() -> i32 { 2 }\n', 'utf-8');
    fs.mkdirSync(path.join(cwd, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'tests/skip.test.lm'), 'fn skip() -> i32 { 3 }\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, '.luminaignore'), 'src/secret.lm\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'lumina.toml'), '[package]\nname = "demo-pkg"\nversion = "1.2.3"\nentry = "src/main.lm"\n', 'utf-8');

    const publishedTarballs: Buffer[] = [];
    const logs: string[] = [];
    await runLuminaPublish([], {
      cwd,
      deps: {
        readManifest: async () => baseManifest(),
        validateManifest: () => [],
        resolveRegistryConfig: () => okConfig,
        getPackageInfo: async () => {
          throw new Error('404');
        },
        publishPackage: async (tarball) => {
          publishedTarballs.push(tarball);
          return { url: 'https://registry.example/pkg' };
        },
        publishCDNArtifact: async () => ({ url: '', integrity: '', provider: 'lumina' }),
        writeManifest: async () => {},
      },
      runCompileCheck: async () => {},
      stdout: { log: (line: string) => logs.push(line) },
    });

    expect(publishedTarballs).toHaveLength(1);
    const payload = decodeTarball(publishedTarballs[0]);
    const packagedPaths = payload.files.map((entry) => entry.path).sort();
    expect(packagedPaths).toContain('lumina.toml');
    expect(packagedPaths).toContain('src/main.lm');
    expect(packagedPaths).toContain('src/keep.lm');
    expect(packagedPaths).not.toContain('src/secret.lm');
    expect(packagedPaths).not.toContain('tests/skip.test.lm');
    const expectedIntegrity = `sha256:${createHash('sha256').update(publishedTarballs[0]).digest('hex')}`;
    expect(logs.some((line) => line.includes(expectedIntegrity))).toBe(true);
  });

  it('rejects already published versions before upload', async () => {
    const cwd = createTempProject();
    fs.writeFileSync(path.join(cwd, 'src/main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');
    const publishPackage = jest.fn(async () => ({ url: 'https://registry.example/pkg' }));

    await expect(
      runLuminaPublish([], {
        cwd,
        deps: {
          readManifest: async () => baseManifest(),
          validateManifest: () => [],
          resolveRegistryConfig: () => okConfig,
          getPackageInfo: async () => ({
            name: 'demo-pkg',
            description: null,
            versions: ['1.2.3'],
            latest: '1.2.3',
          }),
          publishPackage,
          publishCDNArtifact: async () => ({ url: '', integrity: '', provider: 'lumina' }),
          writeManifest: async () => {},
        },
        runCompileCheck: async () => {},
      })
    ).rejects.toThrow('already published');

    expect(publishPackage).not.toHaveBeenCalled();
  });

  it('publishes cdn artifacts after bundle generation when --cdn is enabled', async () => {
    const cwd = createTempProject();
    fs.writeFileSync(path.join(cwd, 'src/main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'lumina.toml'), '[package]\nname = "demo-pkg"\nversion = "1.2.3"\nentry = "src/main.lm"\n', 'utf-8');

    const runBundleStep = jest.fn(
      async (_cwd: string, _entry: string, target: 'browser' | 'wasm', outPath: string, loaderOut?: string) => {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        if (target === 'browser') {
          fs.writeFileSync(outPath, 'export const marker = 1;\n', 'utf-8');
          return;
        }
        fs.writeFileSync(outPath, 'wasm-bytes', 'utf-8');
        if (loaderOut) {
          fs.writeFileSync(loaderOut, 'export async function load(){}', 'utf-8');
        }
      }
    );
    const publishCDNArtifact = jest.fn(async (artifact: { provider: 'lumina' | 'npm'; filename: string; integrity: string }) => ({
      url: `https://cdn.example/${artifact.provider}/${artifact.filename}`,
      integrity: artifact.integrity,
      provider: artifact.provider,
    }));
    const writeManifest = jest.fn(async () => {});

    await runLuminaPublish(['--cdn', '--cdn-provider', 'both'], {
      cwd,
      deps: {
        readManifest: async () => baseManifest(),
        validateManifest: () => [],
        resolveRegistryConfig: () => okConfig,
        getPackageInfo: async () => {
          throw new Error('404');
        },
        publishPackage: async () => ({ url: 'https://registry.example/pkg' }),
        publishCDNArtifact,
        writeManifest,
      },
      runCompileCheck: async () => {},
      runBundleStep,
    });

    expect(runBundleStep).toHaveBeenCalledTimes(2);
    expect(publishCDNArtifact).toHaveBeenCalledTimes(6);
    expect(writeManifest).toHaveBeenCalledTimes(1);
  });
});
