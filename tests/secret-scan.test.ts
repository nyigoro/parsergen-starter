import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLumina } from '../src/bin/lumina-core.js';
import { runLuminaPublish } from '../src/bin/lumina-publish.js';
import { redact, scanDirectory, scanText } from '../src/lumina/secret-scan.js';
import type { PackageManifest } from '../src/lumina/package-manifest.js';
import type { RegistryClientConfig } from '../src/lumina/registry-client.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-secret-scan-'));
  tempDirs.push(dir);
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

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  jest.restoreAllMocks();
});

describe('secret scan', () => {
  it('scanText detects AWS access keys', () => {
    const findings = scanText('const key = "AKIA1234567890ABCDEF";', 'demo.ts');
    expect(findings.some((finding) => finding.kind === 'aws-access-key')).toBe(true);
  });

  it('scanText detects GitHub tokens', () => {
    const findings = scanText('const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDE1234567890";', 'demo.ts');
    expect(findings.some((finding) => finding.kind === 'github-token')).toBe(true);
  });

  it('scanText detects private key headers', () => {
    const findings = scanText('-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----', 'demo.pem');
    expect(findings.some((finding) => finding.kind === 'private-key')).toBe(true);
  });

  it('scanText detects database URLs with credentials', () => {
    const findings = scanText('DATABASE_URL="postgres://user:pass@example.com/db"', 'demo.env');
    expect(findings.some((finding) => finding.kind === 'database-url')).toBe(true);
  });

  it('scanText detects generic secret assignments', () => {
    const findings = scanText('password = "supersecret123"', 'demo.ts');
    expect(findings.some((finding) => finding.kind === 'generic-secret')).toBe(true);
  });

  it('redact produces first4-last4 preview', () => {
    expect(redact('abcdefghijklmnop')).toBe('abcd***mnop');
  });

  it('scanText returns empty for clean source', () => {
    expect(scanText('fn main() -> i32 { 42 }\n', 'main.lm')).toEqual([]);
  });

  it('.luminaignore skips listed files', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'secret.ts'), 'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDE1234567890";', 'utf-8');
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');
    fs.writeFileSync(path.join(cwd, '.luminaignore'), 'src/secret.ts\n', 'utf-8');

    const result = await scanDirectory(cwd);
    expect(result.findings).toHaveLength(0);
  });

  it('publish is blocked when findings are present and no override flag is set', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');

    const publishPackage = jest.fn(async () => ({ url: 'https://registry.example/pkg' }));
    await expect(
      runLuminaPublish([], {
        cwd,
        stderr: { error: () => {}, warn: () => {} },
        deps: {
          readManifest: async () => baseManifest(),
          validateManifest: () => [],
          resolveRegistryConfig: () => okConfig,
          getPackageInfo: async () => {
            throw new Error('404');
          },
          publishPackage,
          publishCDNArtifact: async () => ({ url: '', integrity: '', provider: 'lumina' }),
          writeManifest: async () => {},
          scanDirectory: async () => ({
            scanned: 1,
            findings: [{ file: 'src/main.lm', line: 1, column: 1, kind: 'github-token', preview: 'ghp_***7890' }],
          }),
        },
        runCompileCheck: async () => {},
      })
    ).rejects.toThrow(/Secret scan failed/);
    expect(publishPackage).not.toHaveBeenCalled();
  });

  it('publish proceeds with --allow-secrets', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');

    const publishPackage = jest.fn(async () => ({ url: 'https://registry.example/pkg' }));
    await runLuminaPublish(['--allow-secrets'], {
      cwd,
      stderr: { error: () => {}, warn: () => {} },
      stdout: { log: () => {} },
      deps: {
        readManifest: async () => baseManifest(),
        validateManifest: () => [],
        resolveRegistryConfig: () => okConfig,
        getPackageInfo: async () => {
          throw new Error('404');
        },
        publishPackage,
        publishCDNArtifact: async () => ({ url: '', integrity: '', provider: 'lumina' }),
        writeManifest: async () => {},
        scanDirectory: async () => ({
          scanned: 1,
          findings: [{ file: 'src/main.lm', line: 1, column: 1, kind: 'github-token', preview: 'ghp_***7890' }],
        }),
      },
      runCompileCheck: async () => {},
    });
    expect(publishPackage).toHaveBeenCalledTimes(1);
  });

  it('lumina secret-scan fails when findings exist', async () => {
    const cwd = createTempDir();
    fs.writeFileSync(path.join(cwd, 'demo.ts'), 'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDE1234567890";', 'utf-8');
    await expect(runLumina(['secret-scan', cwd])).rejects.toThrow(/Secret scan found/);
  });

  it('lumina secret-scan succeeds for clean directories', async () => {
    const cwd = createTempDir();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src', 'main.lm'), 'fn main() -> i32 { 0 }\n', 'utf-8');
    await expect(runLumina(['secret-scan', cwd])).resolves.toBeUndefined();
  });
});
