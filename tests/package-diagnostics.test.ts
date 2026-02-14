import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileGrammar, ProjectContext } from '../src/index';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-pkg-diag-'));
  tempDirs.push(dir);
  return dir;
}

function writeLockfile(dir: string, lockfile: object | null) {
  const lockPath = path.join(dir, 'lumina.lock.json');
  if (lockfile == null) {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    return;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lockfile, null, 2), 'utf-8');
}

function setupProject(lockfile: object | null, spec: string) {
  const dir = createTempDir();
  writeLockfile(dir, lockfile);
  const source = `import { x } from "${spec}";\nfn main() { }\n`;
  const filePath = path.join(dir, 'main.lm');
  fs.writeFileSync(filePath, source, 'utf-8');
  const ctx = new ProjectContext(parser);
  ctx.addOrUpdateDocument(filePath, source);
  const diagnostics = ctx
    .getDiagnostics(filePath)
    .filter((diag) => typeof diag.code === 'string' && diag.code.startsWith('PKG-'));
  return { diagnostics };
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Package Diagnostics', () => {
  it('PKG-004: emits error when lockfile is missing', () => {
    const { diagnostics } = setupProject(null, 'pkg');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-004');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toBe('Cannot resolve package imports: lumina.lock.json not found');
  });

  it('PKG-001: emits error when package not in lockfile', () => {
    const lockfile = {
      lockfileVersion: 1,
      packages: {
        'other-pkg': {
          version: '0.1.0',
          resolved: 'node_modules/other-pkg',
          lumina: './src/index.lm',
        },
      },
    };
    const { diagnostics } = setupProject(lockfile, 'missing-pkg');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-001');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toBe("Package 'missing-pkg' not found in lumina.lock.json");
  });

  it('PKG-002: emits error when lumina field missing', () => {
    const lockfile = {
      lockfileVersion: 1,
      packages: {
        'bad-pkg': {
          version: '0.1.0',
          resolved: 'node_modules/bad-pkg',
        },
      },
    };
    const { diagnostics } = setupProject(lockfile, 'bad-pkg');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-002');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toBe("Package 'bad-pkg' missing 'lumina' field in lumina.lock.json");
  });

  it('PKG-003: emits error when subpath not exported', () => {
    const lockfile = {
      lockfileVersion: 1,
      packages: {
        'good-pkg': {
          version: '0.1.0',
          resolved: 'node_modules/good-pkg',
          lumina: {
            '.': './src/index.lm',
          },
        },
      },
    };
    const { diagnostics } = setupProject(lockfile, 'good-pkg/invalid');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('PKG-003');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toBe("Package 'good-pkg' does not export './invalid'");
  });
});
