import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addDependency,
  readManifest,
  validateManifest,
  writeManifest,
  type PackageManifest,
} from '../src/lumina/package-manifest.js';

const tempDirs: string[] = [];

const createTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-manifest-'));
  tempDirs.push(dir);
  return dir;
};

const baseManifest = (): PackageManifest => ({
  name: 'demo',
  version: '1.0.0',
  entry: 'src/main.lm',
  description: null,
  authors: [],
  license: null,
  dependencies: new Map(),
  devDeps: new Map(),
  registry: null,
});

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('package manifest', () => {
  it('reads and writes lumina.toml', async () => {
    const dir = createTempDir();
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'main.lm'), 'fn main() { }\n');
    const manifest = baseManifest();
    manifest.dependencies.set('json-utils', '^1.2.0');
    await writeManifest(dir, manifest);
    const loaded = await readManifest(dir);
    expect(loaded.name).toBe('demo');
    expect(loaded.dependencies.get('json-utils')).toBe('^1.2.0');
  });

  it('falls back to package.json when lumina.toml is absent', async () => {
    const dir = createTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'legacy-demo', version: '0.2.0', lumina: 'src/entry.lm' }, null, 2),
      'utf-8'
    );
    const loaded = await readManifest(dir);
    expect(loaded.name).toBe('legacy-demo');
    expect(loaded.version).toBe('0.2.0');
    expect(loaded.entry).toBe('src/entry.lm');
  });

  it('adds dependency immutably', () => {
    const manifest = baseManifest();
    const updated = addDependency(manifest, 'json-utils', '^1.0.0');
    expect(manifest.dependencies.has('json-utils')).toBe(false);
    expect(updated.dependencies.get('json-utils')).toBe('^1.0.0');
  });

  it('validates required fields', () => {
    const dir = createTempDir();
    const manifest = baseManifest();
    manifest.name = 'Invalid Name';
    manifest.version = 'not-semver';
    const errors = validateManifest(manifest, dir);
    expect(errors.some((e) => e.field === 'name')).toBe(true);
    expect(errors.some((e) => e.field === 'version')).toBe(true);
    expect(errors.some((e) => e.field === 'entry')).toBe(true);
  });
});
