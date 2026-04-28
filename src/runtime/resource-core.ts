import { Signal } from './reactive-core.js';

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ResourceOptions {
  ttlMs: number;
  enabled: boolean;
}

export interface ResourceRecord<T = unknown> {
  key: string;
  loader: () => Promise<T> | T;
  ttlMs: number;
  enabled: boolean;
  data: Signal<unknown>;
  hasData: Signal<boolean>;
  error: Signal<unknown>;
  status: Signal<ResourceStatus>;
  promise: Promise<T> | null;
  expiresAt: number;
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

const normalizeResourceOptions = (options: unknown): ResourceOptions => {
  const candidate = options && typeof options === 'object' ? (options as Record<string, unknown>) : {};
  const ttlRaw = candidate.ttlMs;
  const ttlMs = typeof ttlRaw === 'number' && Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : 0;
  const enabled = candidate.enabled !== false;
  return { ttlMs, enabled };
};

const resourceHasData = (record: ResourceRecord<unknown>): boolean => !!record.hasData.peek();

const createResourceRecord = <T>(
  key: string,
  loader: () => Promise<T> | T,
  options: ResourceOptions
): ResourceRecord<T> => ({
  key,
  loader,
  ttlMs: options.ttlMs,
  enabled: options.enabled,
  data: new Signal<unknown>(null),
  hasData: new Signal<boolean>(false),
  error: new Signal<unknown>(null),
  status: new Signal<ResourceStatus>('idle'),
  promise: null,
  expiresAt: 0,
});

export const startResourceLoad = <T>(record: ResourceRecord<T>, force: boolean = false): Promise<T> => {
  if (record.promise) return record.promise;
  if (!record.enabled && !force) {
    return Promise.reject(new Error(`Resource '${record.key}' is disabled`));
  }
  record.status.set('loading');
  record.error.set(null);

  let loadResult: Promise<T>;
  try {
    loadResult = Promise.resolve(record.loader());
  } catch (error) {
    loadResult = Promise.reject(error);
  }

  const promise = loadResult.then(
    (value) => {
      record.data.set(value as unknown);
      record.hasData.set(true);
      record.error.set(null);
      record.status.set('success');
      record.expiresAt = record.ttlMs > 0 ? Date.now() + record.ttlMs : Number.POSITIVE_INFINITY;
      record.promise = null;
      resourceHooks.notifyDevtools?.();
      return value;
    },
    (error) => {
      record.error.set(error);
      record.status.set('error');
      record.expiresAt = 0;
      record.promise = null;
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

export const resolveResourceRecord = <T>(
  key: unknown,
  loader: () => Promise<T> | T,
  options: unknown
): ResourceRecord<T> => {
  const normalizedKey = normalizeResourceKey(key);
  const normalizedOptions = normalizeResourceOptions(options);
  const existing = resourceCache.get(normalizedKey) as ResourceRecord<T> | undefined;
  if (existing) {
    existing.loader = loader;
    existing.ttlMs = normalizedOptions.ttlMs;
    existing.enabled = normalizedOptions.enabled;
    ensureResourceCurrent(existing);
    return existing;
  }

  const record = createResourceRecord(normalizedKey, loader, normalizedOptions);
  resourceCache.set(normalizedKey, record as ResourceRecord<unknown>);
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
