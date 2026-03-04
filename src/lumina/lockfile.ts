import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PackageManifest } from './package-manifest.js';

export const LOCKFILE_FILENAME = 'lumina.lock';
export const LEGACY_LOCKFILE_FILENAME = 'lumina.lock.json';
export const LOCKFILE_VERSION = 1;

export type LockfileEntry = {
  name: string;
  version: string;
  resolved: string;
  path?: string;
  integrity: string;
  lumina?: string | Record<string, string>;
  deps: Map<string, string>;
};

export type LockfileData = {
  version: number;
  packages: Map<string, LockfileEntry>;
};

type LegacyLockfile = {
  lockfileVersion?: number;
  packages?: Record<
    string,
    {
      version?: string;
      resolved?: string;
      path?: string;
      integrity?: string;
      lumina?: string | Record<string, string>;
      deps?: Record<string, string>;
    }
  >;
};

const MIGRATION_NOTICE = new Set<string>();

const normalizeIntegrity = (value: string): string =>
  value.startsWith('sha256:') ? value : `sha256:${value}`;

const parseVersion = (value: string): [number, number, number] | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (left: string, right: string): number => {
  const l = parseVersion(left);
  const r = parseVersion(right);
  if (!l || !r) return left.localeCompare(right);
  if (l[0] !== r[0]) return l[0] - r[0];
  if (l[1] !== r[1]) return l[1] - r[1];
  return l[2] - r[2];
};

const matchesConstraint = (version: string, constraint: string): boolean => {
  const c = constraint.trim();
  if (!c || c === '*' || c === 'latest') return true;
  const parsed = parseVersion(version);
  if (!parsed) return version === c;
  if (c.startsWith('^')) {
    const base = parseVersion(c.slice(1));
    if (!base) return false;
    return parsed[0] === base[0] && compareVersions(version, c.slice(1)) >= 0;
  }
  if (c.startsWith('~')) {
    const base = parseVersion(c.slice(1));
    if (!base) return false;
    return parsed[0] === base[0] && parsed[1] === base[1] && compareVersions(version, c.slice(1)) >= 0;
  }
  const wildcard = /^(\d+|x|\*)\.(\d+|x|\*)\.(\d+|x|\*)$/.exec(c);
  if (wildcard) {
    const [maj, min, pat] = wildcard.slice(1);
    const [vmj, vmn, vpt] = parsed;
    if (maj !== 'x' && maj !== '*' && Number(maj) !== vmj) return false;
    if (min !== 'x' && min !== '*' && Number(min) !== vmn) return false;
    if (pat !== 'x' && pat !== '*' && Number(pat) !== vpt) return false;
    return true;
  }
  return version === c;
};

const toSerializable = (data: LockfileData): {
  version: number;
  packages: Record<
    string,
    {
      name: string;
      version: string;
      resolved: string;
      path?: string;
      integrity: string;
      lumina?: string | Record<string, string>;
      deps: Record<string, string>;
    }
  >;
} => {
  const packages: Record<
    string,
    {
      name: string;
      version: string;
      resolved: string;
      path?: string;
      integrity: string;
      lumina?: string | Record<string, string>;
      deps: Record<string, string>;
    }
  > = {};
  for (const [key, entry] of data.packages.entries()) {
    packages[key] = {
      name: entry.name,
      version: entry.version,
      resolved: entry.resolved,
      path: entry.path,
      integrity: normalizeIntegrity(entry.integrity),
      lumina: entry.lumina,
      deps: Object.fromEntries(entry.deps.entries()),
    };
  }
  return { version: data.version, packages };
};

const parseModernLockfile = (raw: string): LockfileData => {
  const parsed = JSON.parse(raw) as {
    version?: number;
    packages?: Record<
      string,
      {
        name?: string;
        version?: string;
        resolved?: string;
        path?: string;
        integrity?: string;
        lumina?: string | Record<string, string>;
        deps?: Record<string, string>;
      }
    >;
  };
  const packages = new Map<string, LockfileEntry>();
  for (const [key, value] of Object.entries(parsed.packages ?? {})) {
    if (!value || typeof value.name !== 'string' || typeof value.version !== 'string' || typeof value.resolved !== 'string') {
      continue;
    }
    packages.set(key, {
      name: value.name,
      version: value.version,
      resolved: value.resolved,
      path: typeof value.path === 'string' ? value.path : undefined,
      integrity: normalizeIntegrity(value.integrity ?? 'sha256:'),
      lumina: typeof value.lumina === 'string' || typeof value.lumina === 'object' ? value.lumina : undefined,
      deps: new Map(
        Object.entries(value.deps ?? {}).filter(([, depVersion]) => typeof depVersion === 'string') as Array<[string, string]>
      ),
    });
  }
  return { version: parsed.version ?? LOCKFILE_VERSION, packages };
};

const migrateLegacyLockfile = (legacy: LegacyLockfile): LockfileData => {
  const packages = new Map<string, LockfileEntry>();
  for (const [name, value] of Object.entries(legacy.packages ?? {})) {
    if (!value || typeof value.version !== 'string' || typeof value.resolved !== 'string') continue;
    const key = `${name}@${value.version}`;
    packages.set(key, {
      name,
      version: value.version,
      resolved: value.resolved,
      path: typeof value.path === 'string' ? value.path : undefined,
      integrity: normalizeIntegrity(value.integrity ?? 'sha256:'),
      lumina: typeof value.lumina === 'string' || typeof value.lumina === 'object' ? value.lumina : undefined,
      deps: new Map(Object.entries(value.deps ?? {})),
    });
  }
  return { version: LOCKFILE_VERSION, packages };
};

export async function writeLockfile(dir: string, data: LockfileData): Promise<void> {
  const lockPath = path.join(dir, LOCKFILE_FILENAME);
  const content = `${JSON.stringify(toSerializable(data), null, 2)}\n`;
  await fs.writeFile(lockPath, content, 'utf-8');
}

export async function readLockfile(dir: string): Promise<LockfileData> {
  const modernPath = path.join(dir, LOCKFILE_FILENAME);
  if (existsSync(modernPath)) {
    const raw = await fs.readFile(modernPath, 'utf-8');
    return parseModernLockfile(raw);
  }

  const legacyPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
  if (existsSync(legacyPath)) {
    const raw = await fs.readFile(legacyPath, 'utf-8');
    const legacy = JSON.parse(raw) as LegacyLockfile;
    const migrated = migrateLegacyLockfile(legacy);
    await writeLockfile(dir, migrated);
    if (!MIGRATION_NOTICE.has(dir)) {
      MIGRATION_NOTICE.add(dir);
      process.stdout.write(`Migrated ${LEGACY_LOCKFILE_FILENAME} -> ${LOCKFILE_FILENAME}\n`);
    }
    return migrated;
  }

  return { version: LOCKFILE_VERSION, packages: new Map() };
}

export function readLockfileSync(dir: string): LockfileData {
  const modernPath = path.join(dir, LOCKFILE_FILENAME);
  if (existsSync(modernPath)) {
    return parseModernLockfile(readFileSync(modernPath, 'utf-8'));
  }
  const legacyPath = path.join(dir, LEGACY_LOCKFILE_FILENAME);
  if (existsSync(legacyPath)) {
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf-8')) as LegacyLockfile;
    return migrateLegacyLockfile(legacy);
  }
  return { version: LOCKFILE_VERSION, packages: new Map() };
}

export function addEntry(data: LockfileData, entry: LockfileEntry): LockfileData {
  const packages = new Map(data.packages);
  const key = `${entry.name}@${entry.version}`;
  packages.set(key, {
    ...entry,
    path: entry.path,
    integrity: normalizeIntegrity(entry.integrity),
    lumina: entry.lumina,
    deps: new Map(entry.deps),
  });
  return { version: data.version || LOCKFILE_VERSION, packages };
}

export function verifyIntegrity(tarballBuffer: Buffer, expectedHash: string): boolean {
  if (!expectedHash || typeof expectedHash !== 'string') return false;
  const normalized = normalizeIntegrity(expectedHash);
  const actual = createHash('sha256').update(tarballBuffer).digest('hex');
  return normalized === `sha256:${actual}`;
}

export function isOutOfSync(manifest: PackageManifest, lockfile: LockfileData): string[] {
  const mismatches: string[] = [];
  const versionsByName = new Map<string, string[]>();
  for (const entry of lockfile.packages.values()) {
    const versions = versionsByName.get(entry.name) ?? [];
    versions.push(entry.version);
    versionsByName.set(entry.name, versions);
  }
  for (const [name, constraint] of manifest.dependencies.entries()) {
    const versions = versionsByName.get(name);
    if (!versions || versions.length === 0) {
      mismatches.push(name);
      continue;
    }
    const match = versions.some((version) => matchesConstraint(version, constraint));
    if (!match) mismatches.push(name);
  }
  return mismatches;
}
