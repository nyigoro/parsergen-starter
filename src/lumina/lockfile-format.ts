export const LOCKFILE_FILENAME = 'lumina.lock';
export const LEGACY_LOCKFILE_FILENAME = 'lumina.lock.json';
export const BROWSER_LOCKFILE_FILENAME = 'lumina.browser.lock';
export const LOCKFILE_VERSION = 1;

export type NormalizedLockfilePackage = {
  name: string;
  version: string;
  resolved: string;
  path?: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
  deps?: Record<string, string>;
  resolvedDeps?: Record<string, string>;
  peerDeps?: Record<string, string>;
};

export type NormalizedLockfile = {
  version: number;
  packages: Record<string, NormalizedLockfilePackage>;
};

export type PackageSpecifierParts = {
  pkgName: string;
  subpath: string | null;
};

export type LockfilePackageSelection =
  | { entry: NormalizedLockfilePackage }
  | { error: 'missing' | 'ambiguous'; message: string };

type LockfilePackagePayload = {
  name?: unknown;
  version?: unknown;
  resolved?: unknown;
  path?: unknown;
  integrity?: unknown;
  lumina?: unknown;
  deps?: unknown;
  resolvedDeps?: unknown;
  peerDeps?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const inferPackageNameFromKey = (key: string): string => {
  const atIndex = key.startsWith('@') ? key.lastIndexOf('@') : key.indexOf('@');
  return atIndex > 0 ? key.slice(0, atIndex) : key;
};

const normalizeLuminaField = (value: unknown): string | Record<string, string> | undefined => {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeDepsField = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const lockfilePackageKey = (name: string, version: string): string => `${name}@${version}`;

const normalizePackageKey = (key: string, name: string, version: string, modern: boolean): string => {
  if (modern) return key || lockfilePackageKey(name, version);
  return lockfilePackageKey(name, version);
};

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

export function satisfiesLockfileConstraint(version: string, constraint: string): boolean {
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
}

export function parsePackageSpecifier(specifier: string): PackageSpecifierParts {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) return { pkgName: specifier, subpath: null };
    const pkgName = `${parts[0]}/${parts[1]}`;
    const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : null;
    return { pkgName, subpath };
  }
  const slash = specifier.indexOf('/');
  if (slash === -1) return { pkgName: specifier, subpath: null };
  return { pkgName: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
}

export function dependencyConstraintForPackage(
  importer: NormalizedLockfilePackage | null | undefined,
  packageName: string
): string | null {
  return importer?.deps?.[packageName] ?? null;
}

export function exactDependencyKeyForPackage(
  importer: NormalizedLockfilePackage | null | undefined,
  packageName: string
): string | null {
  return importer?.resolvedDeps?.[packageName] ?? null;
}

export function selectLockfilePackage(
  lockfile: NormalizedLockfile,
  packageName: string,
  importer?: NormalizedLockfilePackage | null
): LockfilePackageSelection {
  const candidates = Object.values(lockfile.packages).filter((entry) => entry.name === packageName);
  if (candidates.length === 0) {
    return { error: 'missing', message: `Package '${packageName}' not found in ${LOCKFILE_FILENAME}` };
  }
  const exactKey = exactDependencyKeyForPackage(importer, packageName);
  if (exactKey) {
    const exact = lockfile.packages[exactKey] ?? lockfile.packages[lockfilePackageKey(packageName, exactKey)];
    if (exact?.name === packageName) return { entry: exact };
    return {
      error: 'missing',
      message: `Package '${packageName}' locked as '${exactKey}' not found in ${LOCKFILE_FILENAME}`,
    };
  }
  const constraint = dependencyConstraintForPackage(importer, packageName);
  const matches = constraint
    ? candidates.filter((entry) => satisfiesLockfileConstraint(entry.version, constraint))
    : candidates;
  if (matches.length === 0) {
    return {
      error: 'missing',
      message: constraint
        ? `Package '${packageName}' satisfying '${constraint}' not found in ${LOCKFILE_FILENAME}`
        : `Package '${packageName}' not found in ${LOCKFILE_FILENAME}`,
    };
  }
  if (!constraint && matches.length > 1) {
    const versions = matches.map((entry) => entry.version).sort(compareVersions).join(', ');
    return {
      error: 'ambiguous',
      message: `Package '${packageName}' has multiple locked versions (${versions}); import from a package with dependency metadata or make the root dependency unambiguous`,
    };
  }
  const [entry] = matches.sort((left, right) => compareVersions(right.version, left.version));
  return { entry };
}

export function normalizeLockfileObject(parsed: unknown): NormalizedLockfile | null {
  if (!isRecord(parsed) || !isRecord(parsed.packages)) return null;
  const entries = Object.entries(parsed.packages);
  const isModern =
    typeof parsed.version === 'number' ||
    entries.some(([, value]) => isRecord(value) && typeof value.name === 'string');
  const packages: Record<string, NormalizedLockfilePackage> = {};

  for (const [key, rawValue] of entries) {
    if (!isRecord(rawValue)) continue;
    const value = rawValue as LockfilePackagePayload;
    const name = isModern && typeof value.name === 'string'
      ? value.name
      : inferPackageNameFromKey(key);
    if (!name || typeof value.version !== 'string' || typeof value.resolved !== 'string') {
      continue;
    }
    const lumina = normalizeLuminaField(value.lumina);
    const deps = normalizeDepsField(value.deps);
    const resolvedDeps = normalizeDepsField(value.resolvedDeps);
    const peerDeps = normalizeDepsField(value.peerDeps);
    const normalizedKey = normalizePackageKey(key, name, value.version, isModern);
    packages[normalizedKey] = {
      name,
      version: value.version,
      resolved: value.resolved,
      path: typeof value.path === 'string' ? value.path : undefined,
      integrity: typeof value.integrity === 'string' ? value.integrity : undefined,
      lumina,
      deps,
      resolvedDeps,
      peerDeps,
    };
  }

  return {
    version:
      typeof parsed.version === 'number'
        ? parsed.version
        : typeof parsed.lockfileVersion === 'number'
          ? parsed.lockfileVersion
          : LOCKFILE_VERSION,
    packages,
  };
}
