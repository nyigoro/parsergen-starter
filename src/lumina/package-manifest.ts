import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const MANIFEST_FILENAME = 'lumina.toml';
export const LEGACY_MANIFEST = 'package.json';
export const DEFAULT_REGISTRY_URL = 'https://registry.luminalang.dev';
export const SEMVER_PATTERN =
  /^(?:\*|latest|\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?|[~^]\d+\.\d+\.\d+|(?:\d+|x|\*)\.(?:\d+|x|\*)\.(?:\d+|x|\*))$/;

export type RegistryConfig = {
  url: string;
  token: string | null;
};

export type PackageManifest = {
  name: string;
  version: string;
  entry: string;
  description: string | null;
  authors: string[];
  license: string | null;
  dependencies: Map<string, string>;
  devDeps: Map<string, string>;
  registry: RegistryConfig | null;
};

export type ValidationError = {
  field: string;
  message: string;
};

const NAME_PATTERN = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const parseQuoted = (raw: string): string | null => {
  const value = raw.trim();
  if (!value.startsWith('"') || !value.endsWith('"')) return null;
  return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};

const parseStringArray = (raw: string): string[] => {
  const value = raw.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) return [];
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((part) => parseQuoted(part))
    .filter((part): part is string => typeof part === 'string');
};

const toDependencyMap = (value: unknown): Map<string, string> => {
  if (!value || typeof value !== 'object') return new Map();
  return new Map(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string])
  );
};

function parseTomlManifest(source: string): PackageManifest {
  const packageFields: Record<string, string> = {};
  const dependencies = new Map<string, string>();
  const devDeps = new Map<string, string>();
  const registryFields: Record<string, string> = {};
  const arrays: Record<string, string[]> = {};
  let section = '';

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim().toLowerCase();
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const valueRaw = line.slice(eq + 1).trim();
    const quoted = parseQuoted(valueRaw);
    if (section === 'package') {
      if (quoted !== null) packageFields[key] = quoted;
      else if (valueRaw.startsWith('[')) arrays[key] = parseStringArray(valueRaw);
    } else if (section === 'dependencies' && quoted !== null) {
      dependencies.set(key, quoted);
    } else if ((section === 'dev-dependencies' || section === 'dev_dependencies') && quoted !== null) {
      devDeps.set(key, quoted);
    } else if (section === 'registry' && quoted !== null) {
      registryFields[key] = quoted;
    }
  }

  const registry =
    registryFields.url || registryFields.token
      ? {
          url: registryFields.url ?? DEFAULT_REGISTRY_URL,
          token: registryFields.token ?? null,
        }
      : null;

  return {
    name: packageFields.name ?? '',
    version: packageFields.version ?? '0.1.0',
    entry: packageFields.entry ?? 'src/main.lm',
    description: packageFields.description ?? null,
    authors: arrays.authors ?? [],
    license: packageFields.license ?? null,
    dependencies,
    devDeps,
    registry,
  };
}

const toTomlMap = (values: Map<string, string>): string[] =>
  Array.from(values.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `${name} = "${version.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);

export async function readManifest(dir: string): Promise<PackageManifest> {
  const manifestPath = path.join(dir, MANIFEST_FILENAME);
  if (existsSync(manifestPath)) {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    return parseTomlManifest(raw);
  }
  const legacyPath = path.join(dir, LEGACY_MANIFEST);
  if (existsSync(legacyPath)) {
    const raw = await fs.readFile(legacyPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      name?: string;
      version?: string;
      description?: string;
      author?: string;
      license?: string;
      lumina?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: parsed.name ?? '',
      version: parsed.version ?? '0.1.0',
      entry: parsed.lumina ?? 'src/main.lm',
      description: parsed.description ?? null,
      authors: typeof parsed.author === 'string' && parsed.author ? [parsed.author] : [],
      license: parsed.license ?? null,
      dependencies: toDependencyMap(parsed.dependencies),
      devDeps: toDependencyMap(parsed.devDependencies),
      registry: null,
    };
  }
  throw new Error(`Missing ${MANIFEST_FILENAME}`);
}

export async function writeManifest(dir: string, manifest: PackageManifest): Promise<void> {
  const lines: string[] = [
    '[package]',
    `name = "${manifest.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    `version = "${manifest.version.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    `entry = "${manifest.entry.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  ];
  if (manifest.description) {
    lines.push(`description = "${manifest.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  if (manifest.authors.length > 0) {
    const authors = manifest.authors.map((a) => `"${a.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
    lines.push(`authors = [${authors}]`);
  }
  if (manifest.license) {
    lines.push(`license = "${manifest.license.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  lines.push('', '[dependencies]');
  lines.push(...toTomlMap(manifest.dependencies));
  lines.push('', '[dev-dependencies]');
  lines.push(...toTomlMap(manifest.devDeps));
  if (manifest.registry) {
    lines.push('', '[registry]');
    lines.push(`url = "${manifest.registry.url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    if (manifest.registry.token) {
      lines.push(`token = "${manifest.registry.token.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    }
  }
  const content = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  await fs.writeFile(path.join(dir, MANIFEST_FILENAME), content, 'utf-8');
}

export function addDependency(manifest: PackageManifest, name: string, constraint: string): PackageManifest {
  const deps = new Map(manifest.dependencies);
  deps.set(name, constraint);
  return { ...manifest, dependencies: deps };
}

export function validateManifest(manifest: PackageManifest, dir: string = process.cwd()): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!NAME_PATTERN.test(manifest.name)) {
    errors.push({ field: 'name', message: 'Package name must be lowercase and may include @scope/name.' });
  }
  if (!EXACT_VERSION_PATTERN.test(manifest.version)) {
    errors.push({ field: 'version', message: 'Version must be exact semver (for example: 1.2.3).' });
  }
  const entryPath = path.resolve(dir, manifest.entry);
  if (!existsSync(entryPath)) {
    errors.push({ field: 'entry', message: `Entry file not found: ${manifest.entry}` });
  }
  for (const [name, constraint] of manifest.dependencies.entries()) {
    if (!NAME_PATTERN.test(name)) {
      errors.push({ field: `dependencies.${name}`, message: 'Dependency name is invalid.' });
    }
    if (!SEMVER_PATTERN.test(constraint)) {
      errors.push({ field: `dependencies.${name}`, message: `Invalid version constraint: ${constraint}` });
    }
  }
  for (const [name, constraint] of manifest.devDeps.entries()) {
    if (!NAME_PATTERN.test(name)) {
      errors.push({ field: `dev-dependencies.${name}`, message: 'Dependency name is invalid.' });
    }
    if (!SEMVER_PATTERN.test(constraint)) {
      errors.push({ field: `dev-dependencies.${name}`, message: `Invalid version constraint: ${constraint}` });
    }
  }
  if (manifest.registry && manifest.registry.url.trim().length === 0) {
    errors.push({ field: 'registry.url', message: 'Registry URL cannot be empty.' });
  }
  return errors;
}
