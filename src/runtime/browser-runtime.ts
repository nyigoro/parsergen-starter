type HashMapLike<K, V> = {
  insert: (key: K, value: V) => void;
};

type BrowserRuntimeDeps = {
  optionSome: <T>(value: T) => unknown;
  optionNone: unknown;
  resultOk: <T>(value: T) => unknown;
  resultErr: (message: string) => unknown;
  createHashMap: <K, V>() => HashMapLike<K, V>;
};

type UrlRecord = {
  href: string;
  origin: string;
  protocol: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
};

type UrlConfig = {
  protocol?: unknown;
  host?: unknown;
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  length: number;
};

type DomElementRecord = object;
type DomEventRecord = { element: EventTarget; event: string; listener: EventListener };

type RouterLocationLike = {
  pathname?: string;
  hash?: string;
  search?: string;
};

type RouterHistoryLike = {
  pushState?: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void;
  state?: unknown;
  scrollRestoration?: string;
};

type RouterWindowLike = {
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
  dispatchEvent?: (event: Event) => boolean;
  scrollTo?: (x: number, y: number) => void;
  location?: RouterLocationLike;
  history?: RouterHistoryLike;
};

type RouterDocumentLike = {
  baseURI?: string;
  startViewTransition?: (update: () => unknown) => unknown;
};

type RouterPopStateHandler = (path: string) => unknown;

const isUrlRecord = (value: unknown): value is UrlRecord =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as { href?: unknown }).href === 'string' &&
  typeof (value as { origin?: unknown }).origin === 'string';

const normalizeProtocol = (value: unknown): string => {
  const base = String(value ?? '').trim();
  if (!base) return '';
  return base.endsWith(':') ? base : `${base}:`;
};

const toUrlRecord = (raw: URL): UrlRecord => ({
  href: raw.href,
  origin: raw.origin,
  protocol: raw.protocol,
  host: raw.host,
  pathname: raw.pathname,
  search: raw.search,
  hash: raw.hash,
});

const emptyUrlRecord = (): UrlRecord => ({
  href: '',
  origin: '',
  protocol: '',
  host: '',
  pathname: '',
  search: '',
  hash: '',
});

const coerceToUrl = (value: unknown): URL | null => {
  if (typeof URL !== 'function') return null;
  if (typeof value === 'string') {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
  if (isUrlRecord(value)) {
    try {
      return new URL(value.href);
    } catch {
      return null;
    }
  }
  return null;
};

const asStorageLike = (value: unknown): StorageLike | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StorageLike>;
  if (
    typeof candidate.getItem !== 'function' ||
    typeof candidate.setItem !== 'function' ||
    typeof candidate.removeItem !== 'function' ||
    typeof candidate.clear !== 'function'
  ) {
    return null;
  }
  return candidate as StorageLike;
};

export const createBrowserRuntime = (deps: BrowserRuntimeDeps) => {
  const webStorageLocalFallback = new Map<string, string>();
  const webStorageSessionFallback = new Map<string, string>();
  let domNextHandle = 1;
  let domNextEventHandle = 1;
  const domElements = new Map<number, DomElementRecord>();
  const domElementHandles = new WeakMap<object, number>();
  const domEvents = new Map<number, DomEventRecord>();
  const routerPopStateHandlers = new Map<RouterPopStateHandler, EventListener>();

  const browserLocalStorage = (): StorageLike | null =>
    asStorageLike((globalThis as { localStorage?: unknown }).localStorage);
  const browserSessionStorage = (): StorageLike | null =>
    asStorageLike((globalThis as { sessionStorage?: unknown }).sessionStorage);

  const webStorageGet = (scope: 'local' | 'session', key: string) => {
    const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        const value = storage.getItem(String(key));
        return value == null ? deps.optionNone : deps.optionSome(value);
      } catch {
        return deps.optionNone;
      }
    }
    const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
    return fallback.has(String(key)) ? deps.optionSome(fallback.get(String(key)) ?? '') : deps.optionNone;
  };

  const webStorageSet = (scope: 'local' | 'session', key: string, value: string) => {
    const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.setItem(String(key), String(value));
        return deps.resultOk(undefined);
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    }
    const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.set(String(key), String(value));
    return deps.resultOk(undefined);
  };

  const webStorageRemove = (scope: 'local' | 'session', key: string): void => {
    const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.removeItem(String(key));
        return;
      } catch {
        // Fall through to fallback removal.
      }
    }
    const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.delete(String(key));
  };

  const webStorageClear = (scope: 'local' | 'session'): void => {
    const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.clear();
        return;
      } catch {
        // Fall through to fallback clear.
      }
    }
    const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.clear();
  };

  const webStorageLength = (scope: 'local' | 'session'): number => {
    const storage = scope === 'local' ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        return Math.trunc(storage.length);
      } catch {
        return 0;
      }
    }
    const fallback = scope === 'local' ? webStorageLocalFallback : webStorageSessionFallback;
    return fallback.size;
  };

  const getDocumentHandle = (): Document | null => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc || typeof doc.querySelector !== 'function') return null;
    return doc;
  };

  const toDomHandle = (element: DomElementRecord | null | undefined): number => {
    if (!element || typeof element !== 'object') return 0;
    const existing = domElementHandles.get(element);
    if (existing) return existing;
    const next = domNextHandle++;
    domElementHandles.set(element, next);
    domElements.set(next, element);
    return next;
  };

  const fromDomHandle = (handle: number): DomElementRecord | null =>
    domElements.get(Math.trunc(handle)) ?? null;

  const createDomStubElement = (): {
    textContent: string;
    innerHTML: string;
    style: Record<string, unknown>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
    removeAttribute: (name: string) => void;
    appendChild: (child: unknown) => void;
    removeChild: (child: unknown) => void;
  } => {
    const attrs = new Map<string, string>();
    const children: unknown[] = [];
    return {
      textContent: '',
      innerHTML: '',
      style: {},
      getAttribute: (name: string) => attrs.get(String(name)) ?? null,
      setAttribute: (name: string, value: string) => {
        attrs.set(String(name), String(value));
      },
      removeAttribute: (name: string) => {
        attrs.delete(String(name));
      },
      appendChild: (child: unknown) => {
        children.push(child);
      },
      removeChild: (child: unknown) => {
        const idx = children.indexOf(child);
        if (idx >= 0) children.splice(idx, 1);
      },
    };
  };

  const getRouterWindowHandle = (): RouterWindowLike | null => {
    const windowHandle = (globalThis as { window?: RouterWindowLike }).window;
    if (windowHandle && typeof windowHandle === 'object') return windowHandle;
    const globalHandle = globalThis as RouterWindowLike;
    if (
      typeof globalHandle.addEventListener === 'function' ||
      typeof globalHandle.dispatchEvent === 'function' ||
      typeof globalHandle.location === 'object'
    ) {
      return globalHandle;
    }
    return null;
  };

  const getRouterLocationHandle = (): RouterLocationLike | null => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.location) return windowHandle.location;
    const locationHandle = (globalThis as { location?: RouterLocationLike }).location;
    return locationHandle && typeof locationHandle === 'object' ? locationHandle : null;
  };

  const getRouterHistoryHandle = (): RouterHistoryLike | null => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.history) return windowHandle.history;
    const historyHandle = (globalThis as { history?: RouterHistoryLike }).history;
    return historyHandle && typeof historyHandle === 'object' ? historyHandle : null;
  };

  const readRouterPathname = (): string => String(getRouterLocationHandle()?.pathname ?? '/');
  const readRouterHash = (): string => String(getRouterLocationHandle()?.hash ?? '');
  const readRouterSearch = (): string => String(getRouterLocationHandle()?.search ?? '');

  const trimRouterTrailingSlash = (value: string): string => {
    if (value.length <= 1) return value || '/';
    return value.endsWith('/') ? value.slice(0, -1) : value;
  };

  const normalizeRouterPath = (value: string): string => {
    const text = String(value || '/');
    const withLeadingSlash = text.startsWith('/') ? text : `/${text}`;
    return trimRouterTrailingSlash(withLeadingSlash);
  };

  const splitRouterSegments = (value: string): string[] =>
    normalizeRouterPath(value)
      .split('/')
      .filter((segment) => segment.length > 0);

  const decodeRouterComponent = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const createRouterParamMap = (entries: Array<[string, string]>): HashMapLike<string, string> => {
    const out = deps.createHashMap<string, string>();
    for (const [key, value] of entries) {
      if (key.length > 0) out.insert(key, value);
    }
    return out;
  };

  const matchRouterPattern = (pattern: string, path: string): boolean => {
    if (pattern === '*') return true;
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path);
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? '';
      if (expected === '*' || expected.startsWith('*')) return true;
      const actual = pathSegments[i] ?? '';
      if (expected.startsWith(':')) continue;
      if (expected !== actual) return false;
    }
    return patternSegments.length === pathSegments.length;
  };

  const extractRouterParams = (pattern: string, path: string): HashMapLike<string, string> => {
    if (pattern === '*') return deps.createHashMap<string, string>();
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path);
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? '';
      const actual = pathSegments[i] ?? '';
      if (expected === '*' || expected.startsWith('*')) {
        const name = expected.startsWith('*') && expected.length > 1 ? expected.slice(1) : 'splat';
        entries.push([name, pathSegments.slice(i).map(decodeRouterComponent).join('/')]);
        return createRouterParamMap(entries);
      }
      if (actual.length === 0) return deps.createHashMap<string, string>();
      if (!expected.startsWith(':')) {
        if (expected !== actual) return deps.createHashMap<string, string>();
        continue;
      }
      entries.push([expected.slice(1), decodeRouterComponent(actual)]);
      continue;
    }
    if (!matchRouterPattern(pattern, path)) {
      return deps.createHashMap<string, string>();
    }
    return createRouterParamMap(entries);
  };

  const parseRouterSearchParams = (search: string): HashMapLike<string, string> => {
    const text = String(search ?? '');
    const body = text.startsWith('?') ? text.slice(1) : text;
    if (body.length === 0) return deps.createHashMap<string, string>();
    const entries: Array<[string, string]> = [];
    if (typeof URLSearchParams === 'function') {
      for (const [key, value] of new URLSearchParams(body)) {
        if (key.length > 0) entries.push([key, value]);
      }
      return createRouterParamMap(entries);
    }
    for (const pair of body.split('&')) {
      if (!pair) continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) continue;
      entries.push([decodeRouterComponent(rawKey), decodeRouterComponent(rawValue.replace(/\+/g, ' '))]);
    }
    return createRouterParamMap(entries);
  };

  const updateRouterLocationValue = (nextPath: string): void => {
    const locationHandle = getRouterLocationHandle();
    if (!locationHandle) return;
    try {
      const parsed = typeof URL === 'function' ? new URL(String(nextPath), 'http://lumina.local') : null;
      locationHandle.pathname = parsed?.pathname ?? String(nextPath);
      locationHandle.search = parsed?.search ?? '';
      locationHandle.hash = parsed?.hash ?? '';
    } catch {
      // Ignore host stubs with read-only location fields.
    }
  };

  const createRouterPopStateEvent = (): Event => {
    try {
      const PopStateEventCtor = (globalThis as { PopStateEvent?: typeof PopStateEvent }).PopStateEvent;
      if (typeof PopStateEventCtor === 'function') {
        return new PopStateEventCtor('popstate', { state: getRouterHistoryHandle()?.state });
      }
    } catch {
      // Fall through to generic Event.
    }
    try {
      const EventCtor = (globalThis as { Event?: typeof Event }).Event;
      if (typeof EventCtor === 'function') {
        return new EventCtor('popstate');
      }
    } catch {
      // Fall through to plain object shim.
    }
    return { type: 'popstate' } as Event;
  };

  const dispatchRouterPopState = (): void => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle && typeof windowHandle.dispatchEvent === 'function') {
      try {
        windowHandle.dispatchEvent(createRouterPopStateEvent());
        return;
      } catch {
        // Fall back to direct handler invocation below.
      }
    }
    const path = readRouterPathname();
    for (const handler of routerPopStateHandlers.keys()) {
      try {
        handler(path);
      } catch {
        // Keep browser bridge listeners resilient.
      }
    }
  };

  const readRouterBasePath = (): string => {
    const documentHandle = (globalThis as { document?: RouterDocumentLike }).document;
    const baseURI = typeof documentHandle?.baseURI === 'string' ? documentHandle.baseURI : '';
    if (!baseURI) return '/';
    try {
      if (typeof URL === 'function') {
        const parsed = new URL(baseURI, 'http://lumina.local');
        return parsed.pathname || '/';
      }
    } catch {
      // Fall through to raw base URI.
    }
    return baseURI;
  };

  const supportsRouterNavigationApi = (): boolean => {
    const windowHandle = getRouterWindowHandle() as RouterWindowLike & { navigation?: unknown } | null;
    return typeof (windowHandle?.navigation ?? (globalThis as { navigation?: unknown }).navigation) === 'object';
  };

  const supportsRouterViewTransition = (): boolean => {
    const documentHandle = (globalThis as { document?: RouterDocumentLike }).document;
    return typeof documentHandle?.startViewTransition === 'function';
  };

  const supportsRouterUrlPattern = (): boolean =>
    typeof (globalThis as { URLPattern?: unknown }).URLPattern === 'function';

  const matchRouterUrlPattern = (pattern: string, path: string): boolean => {
    const URLPatternCtor = (globalThis as {
      URLPattern?: new (input: unknown, baseURL?: string) => { test: (input: unknown) => boolean };
    }).URLPattern;
    if (typeof URLPatternCtor !== 'function') return matchRouterPattern(pattern, path);
    try {
      return new URLPatternCtor({ pathname: pattern }).test({ pathname: normalizeRouterPath(path) });
    } catch {
      return matchRouterPattern(pattern, path);
    }
  };

  const startRouterViewTransition = (update: unknown): boolean => {
    if (typeof update !== 'function') return false;
    const documentHandle = (globalThis as { document?: RouterDocumentLike }).document;
    if (typeof documentHandle?.startViewTransition === 'function') {
      documentHandle.startViewTransition(() => (update as () => unknown)());
      return true;
    }
    (update as () => unknown)();
    return false;
  };

  const url = {
    is_available: (): boolean => typeof URL === 'function',
    parse: (raw: string) => {
      if (typeof URL !== 'function') return deps.resultErr('URL API is not available in this runtime');
      try {
        return deps.resultOk(toUrlRecord(new URL(String(raw))));
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    build: (config: UrlConfig) => {
      if (typeof URL !== 'function') return deps.resultErr('URL API is not available in this runtime');
      const protocol = normalizeProtocol(config?.protocol);
      const host = String(config?.host ?? '').trim();
      if (!protocol || !host) return deps.resultErr('URL build requires protocol and host');
      try {
        const built = new URL(`${protocol}//${host}`);
        const pathname = config?.pathname;
        const search = config?.search;
        const hash = config?.hash;
        if (pathname != null && pathname !== '') {
          const text = String(pathname);
          built.pathname = text.startsWith('/') ? text : `/${text}`;
        }
        if (search != null && search !== '') {
          const text = String(search);
          built.search = text.startsWith('?') ? text : `?${text}`;
        }
        if (hash != null && hash !== '') {
          const text = String(hash);
          built.hash = text.startsWith('#') ? text : `#${text}`;
        }
        return deps.resultOk(built.href);
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    get_origin: (value: unknown): string => coerceToUrl(value)?.origin ?? '',
    get_pathname: (value: unknown): string => coerceToUrl(value)?.pathname ?? '',
    get_search: (value: unknown): string => coerceToUrl(value)?.search ?? '',
    get_hash: (value: unknown): string => coerceToUrl(value)?.hash ?? '',
    set_pathname: (value: unknown, pathname: string): UrlRecord => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text = String(pathname ?? '');
      next.pathname = text.startsWith('/') ? text : `/${text}`;
      return toUrlRecord(next);
    },
    set_search: (value: unknown, search: string): UrlRecord => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text = String(search ?? '');
      next.search = !text ? '' : text.startsWith('?') ? text : `?${text}`;
      return toUrlRecord(next);
    },
    append_param: (value: unknown, key: string, paramValue: string): UrlRecord => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      next.searchParams.append(String(key), String(paramValue));
      return toUrlRecord(next);
    },
  };

  const web_storage = {
    is_available: (): boolean => browserLocalStorage() !== null && browserSessionStorage() !== null,
    local_get: (key: string) => webStorageGet('local', key),
    local_set: (key: string, value: string) => webStorageSet('local', key, value),
    local_remove: (key: string): void => webStorageRemove('local', key),
    local_clear: (): void => webStorageClear('local'),
    local_length: (): number => webStorageLength('local'),
    session_get: (key: string) => webStorageGet('session', key),
    session_set: (key: string, value: string) => webStorageSet('session', key, value),
    session_remove: (key: string): void => webStorageRemove('session', key),
    session_clear: (): void => webStorageClear('session'),
    session_length: (): number => webStorageLength('session'),
  };

  const dom = {
    is_available: (): boolean => getDocumentHandle() !== null,
    call_global_1: (name: string, arg: unknown): unknown => {
      const key = String(name);
      const fn = (globalThis as Record<string, unknown>)[key];
      if (typeof fn !== 'function') {
        return {
          ok: false,
          js: '',
          output: `// Missing global function: ${key}`,
          diagnostics: [{ severity: 'error', message: `Missing global function: ${key}` }],
        };
      }
      try {
        return (fn as (value: unknown) => unknown)(arg);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : String(error);
        return {
          ok: false,
          js: '',
          output: `// ${message}`,
          diagnostics: [{ severity: 'error', message }],
        };
      }
    },
    call_global_1_string: (name: string, arg: unknown): string => {
      const value = dom.call_global_1(name, arg);
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.output === 'string') return record.output;
        if (typeof record.message === 'string') return record.message;
      }
      return value == null ? '' : String(value);
    },
    query: (selector: string) => {
      const doc = getDocumentHandle();
      if (!doc) return deps.optionNone;
      const element = doc.querySelector(String(selector));
      return element ? deps.optionSome(toDomHandle(element)) : deps.optionNone;
    },
    query_all: (selector: string): number[] => {
      const doc = getDocumentHandle();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll(String(selector))).map((entry) => toDomHandle(entry));
    },
    create: (tag: string): number => {
      const doc = getDocumentHandle();
      if (!doc) return toDomHandle(createDomStubElement());
      return toDomHandle(doc.createElement(String(tag)));
    },
    get_attr: (elementHandle: number, name: string) => {
      const element = fromDomHandle(elementHandle) as { getAttribute?: (name: string) => string | null } | null;
      if (!element || typeof element.getAttribute !== 'function') return deps.optionNone;
      const value = element.getAttribute(String(name));
      return value == null ? deps.optionNone : deps.optionSome(value);
    },
    set_attr: (elementHandle: number, name: string, value: string): void => {
      const element = fromDomHandle(elementHandle) as { setAttribute?: (name: string, value: string) => void } | null;
      if (!element || typeof element.setAttribute !== 'function') return;
      element.setAttribute(String(name), String(value));
    },
    remove_attr: (elementHandle: number, name: string): void => {
      const element = fromDomHandle(elementHandle) as { removeAttribute?: (name: string) => void } | null;
      if (!element || typeof element.removeAttribute !== 'function') return;
      element.removeAttribute(String(name));
    },
    get_text: (elementHandle: number): string => {
      const element = fromDomHandle(elementHandle) as { textContent?: string | null } | null;
      return element?.textContent ?? '';
    },
    set_text: (elementHandle: number, text: string): void => {
      const element = fromDomHandle(elementHandle) as { textContent?: string | null } | null;
      if (!element) return;
      element.textContent = String(text);
    },
    get_html: (elementHandle: number): string => {
      const element = fromDomHandle(elementHandle) as { innerHTML?: string } | null;
      return element?.innerHTML ?? '';
    },
    set_html: (elementHandle: number, html: string): void => {
      const element = fromDomHandle(elementHandle) as { innerHTML?: string } | null;
      if (!element) return;
      element.innerHTML = String(html);
    },
    append_child: (parentHandle: number, childHandle: number): void => {
      const parent = fromDomHandle(parentHandle) as { appendChild?: (child: unknown) => void } | null;
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.appendChild !== 'function') return;
      parent.appendChild(child);
    },
    remove_child: (parentHandle: number, childHandle: number): void => {
      const parent = fromDomHandle(parentHandle) as { removeChild?: (child: unknown) => void } | null;
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.removeChild !== 'function') return;
      try {
        parent.removeChild(child);
      } catch {
        // ignore remove errors
      }
    },
    add_event: (elementHandle: number, event: string, handler: unknown): number => {
      const element = fromDomHandle(elementHandle) as EventTarget | null;
      if (!element || typeof handler !== 'function') return 0;
      const listener: EventListener = () => {
        try {
          (handler as () => void)();
        } catch {
          // ignore user handler failures in runtime bridge
        }
      };
      if (typeof element.addEventListener === 'function') {
        element.addEventListener(String(event), listener);
      }
      const handle = domNextEventHandle++;
      domEvents.set(handle, { element, event: String(event), listener });
      return handle;
    },
    remove_event: (eventHandle: number): void => {
      const entry = domEvents.get(Math.trunc(eventHandle));
      if (!entry) return;
      if (typeof entry.element.removeEventListener === 'function') {
        entry.element.removeEventListener(entry.event, entry.listener);
      }
      domEvents.delete(Math.trunc(eventHandle));
    },
    get_style: (elementHandle: number, prop: string): string => {
      const element = fromDomHandle(elementHandle) as { style?: Record<string, unknown> } | null;
      if (!element) return '';
      const key = String(prop);
      const styleObj = element.style as Record<string, unknown> | undefined;
      if (!styleObj) return '';
      const value = styleObj[key];
      return typeof value === 'string' ? value : '';
    },
    set_style: (elementHandle: number, prop: string, value: string): void => {
      const element = fromDomHandle(elementHandle) as { style?: Record<string, unknown> } | null;
      if (!element || !element.style) return;
      element.style[String(prop)] = String(value);
    },
  };

  const router = {
    getCurrentPath: (): string => readRouterPathname(),
    getCurrentHash: (): string => readRouterHash(),
    getCurrentSearch: (): string => readRouterSearch(),
    supportsNavigationApi: (): boolean => supportsRouterNavigationApi(),
    supportsViewTransition: (): boolean => supportsRouterViewTransition(),
    supportsUrlPattern: (): boolean => supportsRouterUrlPattern(),
    matchRoute: (pattern: string, path: string): boolean => matchRouterPattern(pattern, path),
    matchUrlPattern: (pattern: string, path: string): boolean => matchRouterUrlPattern(pattern, path),
    extractParams: (pattern: string, path: string): HashMapLike<string, string> =>
      extractRouterParams(pattern, path),
    parseSearchParams: (search: string): HashMapLike<string, string> => parseRouterSearchParams(search),
    push: (path: string): void => {
      const normalized = String(path);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.pushState === 'function') {
        try {
          historyHandle.pushState(historyHandle.state ?? null, '', normalized);
          updateRouterLocationValue(normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    },
    replace: (path: string): void => {
      const normalized = String(path);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.replaceState === 'function') {
        try {
          historyHandle.replaceState(historyHandle.state ?? null, '', normalized);
          updateRouterLocationValue(normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    },
    onPopState: (handler: RouterPopStateHandler | null | undefined): void => {
      if (typeof handler !== 'function') return;
      router.offPopState(handler);
      const listener: EventListener = () => {
        try {
          handler(readRouterPathname());
        } catch {
          // Ignore user callback failures in browser bridge.
        }
      };
      routerPopStateHandlers.set(handler, listener);
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.addEventListener === 'function') {
        windowHandle.addEventListener('popstate', listener);
      }
    },
    offPopState: (handler: RouterPopStateHandler | null | undefined): void => {
      if (typeof handler !== 'function') return;
      const listener = routerPopStateHandlers.get(handler);
      if (!listener) return;
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.removeEventListener === 'function') {
        windowHandle.removeEventListener('popstate', listener);
      }
      routerPopStateHandlers.delete(handler);
    },
    getBasePath: (): string => readRouterBasePath(),
    getScrollRestoration: (): string => {
      const value = getRouterHistoryHandle()?.scrollRestoration;
      return typeof value === 'string' ? value : '';
    },
    setScrollRestoration: (mode: string): void => {
      const historyHandle = getRouterHistoryHandle();
      if (!historyHandle) return;
      const normalized = String(mode) === 'manual' ? 'manual' : 'auto';
      try {
        historyHandle.scrollRestoration = normalized;
      } catch {
        // Ignore host stubs with read-only history fields.
      }
    },
    scrollToTop: (): void => {
      const windowHandle = getRouterWindowHandle();
      try {
        windowHandle?.scrollTo?.(0, 0);
      } catch {
        // Ignore scroll failures from test stubs.
      }
    },
    startViewTransition: (update: unknown): boolean => startRouterViewTransition(update),
  };

  return {
    url,
    web_storage,
    dom,
    router,
  };
};
