import { Signal } from './reactive-core.js';

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ResourceOptions {
  ttlMs: number;
  enabled: boolean;
  staleWhileRevalidate: boolean;
  abortOnRefresh: boolean;
  scope: string;
  requestId: string;
  tags: string[];
  dependencies: string[];
}

export interface ResourceRecord<T = unknown> {
  key: string;
  loader: (signal?: AbortSignal) => Promise<T> | T;
  ttlMs: number;
  enabled: boolean;
  staleWhileRevalidate: boolean;
  abortOnRefresh: boolean;
  scope: string;
  requestId: string;
  tags: Set<string>;
  dependencies: Set<string>;
  data: Signal<unknown>;
  hasData: Signal<boolean>;
  error: Signal<unknown>;
  status: Signal<ResourceStatus>;
  promise: Promise<T> | null;
  abortController: AbortController | null;
  expiresAt: number;
  version: number;
}

interface ResourceCoreHooks {
  serializeKey?: (key: unknown) => string;
  notifyDevtools?: () => void;
}

let resourceHooks: ResourceCoreHooks = {};

export const configureResourceCore = (hooks: Partial<ResourceCoreHooks>): void => {
  resourceHooks = { ...resourceHooks, ...hooks };
};

export class ResourceHandle<T = unknown> {
  constructor(readonly record: ResourceRecord<T>) {}
}

const resourceCache = new Map<string, ResourceRecord<unknown>>();

const normalizeResourceKey = (key: unknown): string => {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' || typeof key === 'boolean' || typeof key === 'bigint') {
    return String(key);
  }
  if (key === null) return 'null';
  if (key === undefined) return 'undefined';
  if (resourceHooks.serializeKey) {
    try {
      return resourceHooks.serializeKey(key);
    } catch {
      // Fall through to string coercion below.
    }
  }
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
};

const normalizeResourceTags = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return raw
    .map((entry) => String(entry).trim())
    .filter((entry, index, list) => entry.length > 0 && list.indexOf(entry) === index);
};

const normalizeResourceOptions = (options: unknown): ResourceOptions => {
  const candidate = options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
  const ttlRaw = candidate.ttlMs;
  const ttlMs = typeof ttlRaw === 'number' && Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : 0;
  const enabled = candidate.enabled !== false;
  const staleWhileRevalidate = candidate.staleWhileRevalidate === true || candidate.swr === true;
  const abortOnRefresh = candidate.abortOnRefresh === true || candidate.abort === true;
  const scope = typeof candidate.scope === 'string' && candidate.scope.trim() ? candidate.scope.trim() : 'global';
  const requestId = typeof candidate.requestId === 'string' && candidate.requestId.trim()
    ? candidate.requestId.trim()
    : '';
  const tags = normalizeResourceTags(candidate.tags ?? candidate.tag);
  const dependencies = normalizeResourceTags(candidate.dependencies ?? candidate.dependency ?? candidate.dependsOn);
  return { ttlMs, enabled, staleWhileRevalidate, abortOnRefresh, scope, requestId, tags, dependencies };
};

const resourceCacheIdentity = (key: string, scope: string, requestId: string): string =>
  JSON.stringify([scope, requestId, key]);

const resourceHasData = (record: ResourceRecord<unknown>): boolean => !!record.hasData.peek();

const createResourceRecord = <T>(
  key: string,
  loader: (signal?: AbortSignal) => Promise<T> | T,
  options: ResourceOptions
): ResourceRecord<T> => ({
  key,
  loader,
  ttlMs: options.ttlMs,
  enabled: options.enabled,
  staleWhileRevalidate: options.staleWhileRevalidate,
  abortOnRefresh: options.abortOnRefresh,
  scope: options.scope,
  requestId: options.requestId,
  tags: new Set(options.tags),
  dependencies: new Set(options.dependencies),
  data: new Signal<unknown>(null),
  hasData: new Signal<boolean>(false),
  error: new Signal<unknown>(null),
  status: new Signal<ResourceStatus>('idle'),
  promise: null,
  abortController: null,
  expiresAt: 0,
  version: 0,
});

export const startResourceLoad = <T>(record: ResourceRecord<T>, force: boolean = false): Promise<T> => {
  if (record.promise && !force) return record.promise;
  if (!record.enabled && !force) {
    return Promise.reject(new Error(`Resource '${record.key}' is disabled`));
  }
  const version = record.version + 1;
  record.version = version;
  if (force && record.abortOnRefresh) {
    record.abortController?.abort();
  }
  record.abortController = typeof AbortController === 'undefined' ? null : new AbortController();
  record.status.set('loading');
  record.error.set(null);

  let loadResult: Promise<T>;
  try {
    loadResult = Promise.resolve(record.loader(record.abortController?.signal));
  } catch (error) {
    loadResult = Promise.reject(error);
  }

  const promise = loadResult.then(
    (value) => {
      if (record.version !== version) {
        return value;
      }
      record.data.set(value as unknown);
      record.hasData.set(true);
      record.error.set(null);
      record.status.set('success');
      record.expiresAt = record.ttlMs > 0 ? Date.now() + record.ttlMs : Number.POSITIVE_INFINITY;
      record.promise = null;
      record.abortController = null;
      resourceHooks.notifyDevtools?.();
      return value;
    },
    (error) => {
      if (record.version !== version) {
        throw error;
      }
      record.error.set(error);
      record.status.set('error');
      record.expiresAt = 0;
      record.promise = null;
      record.abortController = null;
      resourceHooks.notifyDevtools?.();
      throw error;
    }
  );

  promise.catch(() => undefined);
  record.promise = promise;
  resourceHooks.notifyDevtools?.();
  return promise;
};

export const ensureResourceCurrent = <T>(record: ResourceRecord<T>): void => {
  if (record.promise) return;
  if (!record.enabled) return;

  if (!resourceHasData(record)) {
    if (record.status.peek() === 'idle') {
      startResourceLoad(record);
    }
    return;
  }

  if (record.ttlMs > 0 && Date.now() >= record.expiresAt) {
    startResourceLoad(record);
  }
};

const discardResourcePending = (record: ResourceRecord<unknown>, abort: boolean): void => {
  record.version += 1;
  if (abort) {
    record.abortController?.abort();
  }
  record.abortController = null;
  record.promise = null;
};

export const invalidateResourceRecord = (record: ResourceRecord<unknown>): void => {
  record.expiresAt = 0;
  discardResourcePending(record, record.abortOnRefresh);
  if (!record.hasData.peek() || !record.staleWhileRevalidate) {
    record.status.set('idle');
  }
  if (record.enabled) {
    startResourceLoad(record, true);
  }
};

export const resolveResourceRecord = <T>(
  key: unknown,
  loader: (signal?: AbortSignal) => Promise<T> | T,
  options: unknown
): ResourceRecord<T> => {
  const normalizedKey = normalizeResourceKey(key);
  const normalizedOptions = normalizeResourceOptions(options);
  const cacheIdentity = resourceCacheIdentity(
    normalizedKey,
    normalizedOptions.scope,
    normalizedOptions.requestId
  );
  const existing = resourceCache.get(cacheIdentity) as ResourceRecord<T> | undefined;
  if (existing) {
    existing.loader = loader;
    existing.ttlMs = normalizedOptions.ttlMs;
    existing.enabled = normalizedOptions.enabled;
    existing.staleWhileRevalidate = normalizedOptions.staleWhileRevalidate;
    existing.abortOnRefresh = normalizedOptions.abortOnRefresh;
    existing.scope = normalizedOptions.scope;
    existing.requestId = normalizedOptions.requestId;
    existing.tags = new Set(normalizedOptions.tags);
    existing.dependencies = new Set(normalizedOptions.dependencies);
    ensureResourceCurrent(existing);
    return existing;
  }

  const record = createResourceRecord(normalizedKey, loader, normalizedOptions);
  resourceCache.set(cacheIdentity, record as ResourceRecord<unknown>);
  ensureResourceCurrent(record);
  return record;
};

export const asResourceHandle = <T>(candidate: unknown, apiName: string): ResourceHandle<T> => {
  if (candidate instanceof ResourceHandle) {
    return candidate as ResourceHandle<T>;
  }
  throw new Error(`${apiName} expects a resource handle`);
};

export const listResourceRecords = (): ResourceRecord<unknown>[] => Array.from(resourceCache.values());

export const invalidateResourceKey = (key: unknown): boolean => {
  const normalizedKey = normalizeResourceKey(key);
  let changed = false;
  for (const record of resourceCache.values()) {
    if (record.key !== normalizedKey) continue;
    invalidateResourceRecord(record);
    changed = true;
  }
  if (changed) resourceHooks.notifyDevtools?.();
  return changed;
};

export const invalidateResourcePrefix = (prefix: string): number => {
  const normalizedPrefix = String(prefix);
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.key.startsWith(normalizedPrefix)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const invalidateResourceTag = (tag: string): number => {
  const normalizedTag = String(tag).trim();
  if (!normalizedTag) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.tags.has(normalizedTag)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const invalidateResourceDependency = (dependency: string): number => {
  const normalizedDependency = String(dependency).trim();
  if (!normalizedDependency) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.dependencies.has(normalizedDependency)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const invalidateResourceScope = (scope: string): number => {
  const normalizedScope = String(scope).trim() || 'global';
  let count = 0;
  for (const record of resourceCache.values()) {
    if (record.scope !== normalizedScope) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const invalidateResourceRequest = (requestId: string): number => {
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (record.requestId !== normalizedRequestId) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const clearResourceRecords = (): void => {
  if (resourceCache.size === 0) return;
  for (const record of resourceCache.values()) {
    discardResourcePending(record, true);
  }
  resourceCache.clear();
  resourceHooks.notifyDevtools?.();
};

export const clearResourceScope = (scope: string): number => {
  const normalizedScope = String(scope).trim() || 'global';
  let count = 0;
  for (const [key, record] of resourceCache) {
    if (record.scope !== normalizedScope) continue;
    discardResourcePending(record, true);
    resourceCache.delete(key);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

export const clearResourceRequest = (requestId: string): number => {
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return 0;
  let count = 0;
  for (const [key, record] of resourceCache) {
    if (record.requestId !== normalizedRequestId) continue;
    discardResourcePending(record, true);
    resourceCache.delete(key);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
