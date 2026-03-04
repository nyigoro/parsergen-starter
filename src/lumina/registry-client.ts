import type { PackageManifest } from './package-manifest.js';

export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_TARBALL_SIZE_MB = 50;
const MAX_TARBALL_SIZE_BYTES = MAX_TARBALL_SIZE_MB * 1024 * 1024;
export const USER_AGENT = 'lumina-cli/0.4.3';
export const DEFAULT_REGISTRY_URL = 'https://registry.luminalang.dev';

export type RegistryPackageInfo = {
  name: string;
  description: string | null;
  versions: string[];
  latest: string;
};

export type RegistryVersionInfo = {
  name: string;
  version: string;
  resolved: string;
  integrity: string;
  lumina?: string | Record<string, string>;
  deps: Map<string, string>;
};

export type SearchResultEntry = {
  name: string;
  version: string;
  description: string | null;
};

export type SearchResult = {
  total: number;
  results: SearchResultEntry[];
};

export type RegistryClientConfig = {
  url: string;
  token: string | null;
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

export function satisfiesSemverConstraint(version: string, constraint: string): boolean {
  const c = constraint.trim();
  if (!c || c === '*' || c === 'latest') return true;
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) return version === c;
  if (c.startsWith('^')) {
    const base = parseVersion(c.slice(1));
    if (!base) return false;
    return parsedVersion[0] === base[0] && compareVersions(version, c.slice(1)) >= 0;
  }
  if (c.startsWith('~')) {
    const base = parseVersion(c.slice(1));
    if (!base) return false;
    return parsedVersion[0] === base[0] && parsedVersion[1] === base[1] && compareVersions(version, c.slice(1)) >= 0;
  }
  const wildcard = /^(\d+|x|\*)\.(\d+|x|\*)\.(\d+|x|\*)$/.exec(c);
  if (wildcard) {
    const [major, minor, patch] = wildcard.slice(1);
    const [vMajor, vMinor, vPatch] = parsedVersion;
    if (major !== 'x' && major !== '*' && Number(major) !== vMajor) return false;
    if (minor !== 'x' && minor !== '*' && Number(minor) !== vMinor) return false;
    if (patch !== 'x' && patch !== '*' && Number(patch) !== vPatch) return false;
    return true;
  }
  return version === c;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Registry request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return (await Promise.race([promise, timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const joinUrl = (baseUrl: string, relativePath: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;

const headersFor = (config: RegistryClientConfig, extra: HeadersInit = {}): HeadersInit => ({
  'user-agent': USER_AGENT,
  accept: 'application/json',
  ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
  ...extra,
});

async function requestJson<T>(url: string, config: RegistryClientConfig, init: RequestInit = {}): Promise<T> {
  const response = await withTimeout(
    fetch(url, {
      ...init,
      headers: headersFor(config, init.headers),
    }),
    REQUEST_TIMEOUT_MS
  );
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Registry request failed (${response.status}): ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function getPackageInfo(name: string, config: RegistryClientConfig): Promise<RegistryPackageInfo> {
  const encoded = encodeURIComponent(name);
  const payload = await requestJson<{
    name: string;
    description?: string | null;
    versions?: string[];
    latest?: string;
  }>(joinUrl(config.url, `/packages/${encoded}`), config);
  return {
    name: payload.name,
    description: payload.description ?? null,
    versions: Array.isArray(payload.versions) ? payload.versions : [],
    latest: payload.latest ?? '',
  };
}

export async function getVersionInfo(name: string, version: string, config: RegistryClientConfig): Promise<RegistryVersionInfo> {
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const payload = await requestJson<{
    name: string;
    version: string;
    resolved: string;
    integrity: string;
    lumina?: string | Record<string, string>;
    deps?: Record<string, string>;
  }>(joinUrl(config.url, `/packages/${encodedName}/${encodedVersion}`), config);
  return {
    name: payload.name,
    version: payload.version,
    resolved: payload.resolved,
    integrity: payload.integrity,
    lumina: typeof payload.lumina === 'string' || typeof payload.lumina === 'object' ? payload.lumina : undefined,
    deps: new Map(Object.entries(payload.deps ?? {})),
  };
}

export async function resolveVersion(name: string, constraint: string, config: RegistryClientConfig): Promise<string> {
  const info = await getPackageInfo(name, config);
  const matched = info.versions.filter((version) => satisfiesSemverConstraint(version, constraint));
  if (matched.length === 0) {
    throw new Error(`No versions for '${name}' satisfy '${constraint}'`);
  }
  return matched.sort((a, b) => compareVersions(b, a))[0];
}

export async function downloadTarball(url: string, config: RegistryClientConfig): Promise<Buffer> {
  const response = await withTimeout(
    fetch(url, {
      method: 'GET',
      headers: headersFor(config, { accept: 'application/octet-stream' }),
    }),
    REQUEST_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new Error(`Failed to download tarball (${response.status}): ${response.statusText}`);
  }
  const sizeHeader = response.headers.get('content-length');
  if (sizeHeader && Number(sizeHeader) > MAX_TARBALL_SIZE_BYTES) {
    throw new Error(`Tarball exceeds ${MAX_TARBALL_SIZE_MB}MB limit`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_TARBALL_SIZE_BYTES) {
    throw new Error(`Tarball exceeds ${MAX_TARBALL_SIZE_MB}MB limit`);
  }
  return Buffer.from(arrayBuffer);
}

export async function publishPackage(
  tarball: Buffer,
  manifest: PackageManifest,
  config: RegistryClientConfig
): Promise<{ url: string }> {
  const payload = {
    manifest: {
      name: manifest.name,
      version: manifest.version,
      entry: manifest.entry,
      description: manifest.description,
      license: manifest.license,
      authors: manifest.authors,
    },
    tarball: tarball.toString('base64'),
  };
  return requestJson<{ url: string }>(joinUrl(config.url, '/packages/publish'), config, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function search(query: string, config: RegistryClientConfig): Promise<SearchResult> {
  const encoded = encodeURIComponent(query);
  const payload = await requestJson<{
    total?: number;
    results?: Array<{ name: string; version: string; description?: string | null }>;
  }>(joinUrl(config.url, `/search?q=${encoded}`), config);
  return {
    total: typeof payload.total === 'number' ? payload.total : Array.isArray(payload.results) ? payload.results.length : 0,
    results: Array.isArray(payload.results)
      ? payload.results.map((entry) => ({
          name: entry.name,
          version: entry.version,
          description: entry.description ?? null,
        }))
      : [],
  };
}

const resolveTokenReference = (token: string, env: NodeJS.ProcessEnv): string | null => {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(token.trim());
  if (!match) return token;
  const envValue = env[match[1]];
  return typeof envValue === 'string' && envValue.length > 0 ? envValue : null;
};

export function resolveRegistryConfig(manifest: PackageManifest, env: NodeJS.ProcessEnv): RegistryClientConfig {
  const envToken = env.LUMINA_TOKEN;
  if (typeof envToken === 'string' && envToken.length > 0) {
    return {
      url: manifest.registry?.url ?? DEFAULT_REGISTRY_URL,
      token: envToken,
    };
  }
  const manifestTokenRaw = manifest.registry?.token ?? null;
  const manifestToken =
    typeof manifestTokenRaw === 'string' && manifestTokenRaw.length > 0
      ? resolveTokenReference(manifestTokenRaw, env)
      : null;
  return {
    url: manifest.registry?.url ?? DEFAULT_REGISTRY_URL,
    token: manifestToken,
  };
}
