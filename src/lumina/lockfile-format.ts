export const LOCKFILE_FILENAME = 'lumina.lock';
export const LEGACY_LOCKFILE_FILENAME = 'lumina.lock.json';
export const BROWSER_LOCKFILE_FILENAME = 'lumina.browser.lock';
export const LOCKFILE_VERSION = 1;

export type NormalizedLockfilePackage = {
  version: string;
  resolved: string;
  path?: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
};

export type NormalizedLockfile = {
  version: number;
  packages: Record<string, NormalizedLockfilePackage>;
};

type LockfilePackagePayload = {
  name?: unknown;
  version?: unknown;
  resolved?: unknown;
  path?: unknown;
  integrity?: unknown;
  lumina?: unknown;
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
    packages[name] = {
      version: value.version,
      resolved: value.resolved,
      path: typeof value.path === 'string' ? value.path : undefined,
      integrity: typeof value.integrity === 'string' ? value.integrity : undefined,
      lumina,
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
