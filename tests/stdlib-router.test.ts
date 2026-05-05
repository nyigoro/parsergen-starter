import fs from 'node:fs';
import path from 'node:path';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';
const routerStdPath = path.resolve(__dirname, '../std/router.lm');
const routerStdSource = fs.readFileSync(routerStdPath, 'utf-8');
let cachedRouterApi: RouterApi | null = null;

type OptionValue<T = unknown> = { $tag: 'Some'; $payload: T } | { $tag: 'None' };
type VNode =
  | { kind: 'text'; text: string }
  | { kind: 'element'; tag: string; props: Record<string, unknown>; children: VNode[] };

type TestSignal<T> = { value: T; subscribers: Set<TestEffectRunner> };
type TestEffectRunner = {
  run: () => void;
  dispose: () => void;
  deps: Set<TestSignal<unknown>>;
  disposed: boolean;
};

type RouterApi = {
  createRouter: (base: string) => unknown;
  navigate: (routerValue: unknown, path: string) => void;
  replace: (routerValue: unknown, path: string) => void;
  currentPath: (routerValue: unknown) => unknown;
  currentParams: (routerValue: unknown) => unknown;
  currentSearchParams: (routerValue: unknown) => unknown;
  getScrollRestoration: () => string;
  setScrollRestoration: (mode: string) => void;
  scrollToTop: () => void;
  routeResourceKey: (routerValue: unknown, name: string) => string;
  routeScopedKey: (routerValue: unknown, routeId: string, name: string) => string;
  routeModule: (id: string, pattern: string, title: string) => unknown;
  routeModuleMatch: (routerValue: unknown, module: unknown) => { matched: boolean; params: unknown; search: unknown };
  routeModuleKey: (routerValue: unknown, module: unknown, name: string) => string;
  routeModuleLoader: <T>(
    routerValue: unknown,
    module: unknown,
    name: string,
    loader: (match: unknown) => Promise<T>
  ) => unknown;
  routeModuleLoaderWithOptions: <T>(
    routerValue: unknown,
    module: unknown,
    name: string,
    loader: (match: unknown) => Promise<T>,
    options: Record<string, unknown>
  ) => unknown;
  routeModuleAction: <T>(
    routerValue: unknown,
    module: unknown,
    name: string,
    action: (match: unknown) => Promise<T>
  ) => unknown;
  routeModuleView: (
    routerValue: unknown,
    module: unknown,
    renderChildren: (match: unknown) => VNode[] | VNode,
    fallback: VNode
  ) => VNode;
  routeLoader: <T>(routerValue: unknown, name: string, loader: () => Promise<T>) => unknown;
  routeLoaderWithOptions: <T>(
    routerValue: unknown,
    name: string,
    loader: () => Promise<T>,
    options: Record<string, unknown>
  ) => unknown;
  routeLoaderFor: <T>(
    routerValue: unknown,
    routeId: string,
    name: string,
    loader: () => Promise<T>
  ) => unknown;
  prefetchRoute: <T>(
    routerValue: unknown,
    path: string,
    name: string,
    loader: () => Promise<T>
  ) => unknown;
  prefetchRouteWithOptions: <T>(
    routerValue: unknown,
    path: string,
    name: string,
    loader: () => Promise<T>,
    options: Record<string, unknown>
  ) => unknown;
  routeStatus: (resource: unknown) => string;
  routeRead: <T>(resource: unknown) => T;
  refreshRoute: <T>(resource: unknown) => Promise<T>;
  invalidateRoute: (resource: unknown) => void;
  invalidateRouteKey: (key: unknown) => boolean;
  invalidateRoutePrefix: (prefix: string) => number;
  invalidateRouteTag: (tag: string) => number;
  invalidateRouteDependency: (dependency: string) => number;
  invalidateRouteScope: (scope: string) => number;
  optimisticRouteMutate: <T>(resource: unknown, value: T) => T;
  routeAction: <T>(routerValue: unknown, name: string, action: () => Promise<T>) => unknown;
  submitRouteAction: <T>(action: unknown) => Promise<T>;
  routeActionStatus: (action: unknown) => string;
  routeActionData: (action: unknown) => unknown;
  routeActionSubmitting: (action: unknown) => unknown;
  matchRoute: (pattern: string, path: string) => boolean;
  isActive: (routerValue: unknown, pattern: string) => boolean;
  routeMatch: (routerValue: unknown, pattern: string) => { matched: boolean; params: unknown; search: unknown };
  routeParams: (matchValue: unknown) => unknown;
  routeView: (
    routerValue: unknown,
    pattern: string,
    renderChildren: () => VNode[] | VNode,
    fallback: VNode
  ) => VNode;
  outlet: (condition: boolean, renderChildren: () => VNode[] | VNode, fallback: VNode) => VNode;
  extractParams: (pattern: string, path: string) => unknown;
  onRouteChange: (routerValue: unknown, handler: (path: string) => void) => unknown;
  link: (routerValue: unknown, href: string, label: string) => VNode;
  linkWithProps: (
    routerValue: unknown,
    href: string,
    props: Record<string, unknown>,
    children: VNode[]
  ) => VNode;
};

type BrowserEnvHandle = {
  window: {
    location: { pathname: string; search: string; hash: string };
    history: {
      pushes: string[];
      replacements: string[];
      state: unknown;
      scrollRestoration: string;
      pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
      replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
    };
    scrollTo: jest.Mock<void, [number, number]>;
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
    dispatchEvent: (event: Event) => boolean;
  };
};

const parseProgram = (source: string): LuminaProgram => parseLuminaProgram(source);

const getTag = (value: unknown): string => (value as { $tag?: string })?.$tag ?? '';
const getPayload = <T = unknown>(value: unknown): T => (value as { $payload?: T }).$payload as T;
const some = <T>(value: T): OptionValue<T> => ({ $tag: 'Some', $payload: value });
const none = (): OptionValue => ({ $tag: 'None' });

let activeEffect: TestEffectRunner | null = null;

const runtimeHashmap = {
  get: (map: unknown, key: string): OptionValue =>
    map instanceof Map && map.has(key) ? some(map.get(key)) : none(),
};

const runtimeStr = {
  length: (value: string) => value.length,
  concat: (a: string, b: string) => a + b,
  substring: (value: string, start: number, end: number) => value.substring(start, end),
};

const runtimeReactive = {
  createSignal<T>(initial: T): TestSignal<T> {
    return { value: initial, subscribers: new Set() };
  },
  get<T>(signal: TestSignal<T>): T {
    if (activeEffect) {
      signal.subscribers.add(activeEffect);
      activeEffect.deps.add(signal as TestSignal<unknown>);
    }
    return signal.value;
  },
  set<T>(signal: TestSignal<T>, next: T): boolean {
    if (Object.is(signal.value, next)) return false;
    signal.value = next;
    for (const effect of [...signal.subscribers]) {
      effect.run();
    }
    return true;
  },
  createEffect(fn: () => void): TestEffectRunner {
    const effect: TestEffectRunner = {
      deps: new Set(),
      disposed: false,
      run: () => {
        if (effect.disposed) return;
        for (const dep of effect.deps) dep.subscribers.delete(effect);
        effect.deps.clear();
        const previous = activeEffect;
        activeEffect = effect;
        try {
          fn();
        } finally {
          activeEffect = previous;
        }
      },
      dispose: () => {
        effect.disposed = true;
        for (const dep of effect.deps) dep.subscribers.delete(effect);
        effect.deps.clear();
      },
    };
    effect.run();
    return effect;
  },
  disposeEffect(effect: unknown): void {
    (effect as TestEffectRunner | undefined)?.dispose?.();
  },
};

const runtimeResources = new Map<string, Record<string, unknown>>();

const runtimeRender = {
  props_empty: (): Record<string, unknown> => ({}),
  props_attr: (name: string, value: unknown): Record<string, unknown> => ({ [name]: value }),
  createResource: (
    key: string,
    loader: () => Promise<unknown>,
    options: Record<string, unknown> | null
  ): Record<string, unknown> => {
    const record = { key, loader, options, status: 'success', data: `data:${key}`, invalidated: false };
    runtimeResources.set(key, record);
    return record;
  },
  resourceStatus: (resource: Record<string, unknown>): string => String(resource.status),
  resourceData: (resource: Record<string, unknown>): unknown => resource.data,
  resourceError: (resource: Record<string, unknown>): unknown => resource.error ?? null,
  resourceRead: (resource: Record<string, unknown>): unknown => resource.data,
  resourceRefresh: async (resource: Record<string, unknown>): Promise<unknown> => {
    resource.status = 'success';
    resource.data = await (resource.loader as () => Promise<unknown>)();
    return resource.data;
  },
  resourceInvalidate: (resource: Record<string, unknown>): void => {
    resource.invalidated = true;
  },
  resourceInvalidateKey: (key: unknown): boolean => {
    const record = runtimeResources.get(String(key));
    if (!record) return false;
    record.invalidated = true;
    return true;
  },
  resourceInvalidatePrefix: (prefix: string): number => {
    let count = 0;
    for (const [key, record] of runtimeResources) {
      if (!key.startsWith(prefix)) continue;
      record.invalidated = true;
      count += 1;
    }
    return count;
  },
  resourceInvalidateTag: (tag: string): number => {
    let count = 0;
    for (const record of runtimeResources.values()) {
      const tags = (record.options as { tags?: unknown } | null)?.tags;
      const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
      if (!list.includes(tag)) continue;
      record.invalidated = true;
      count += 1;
    }
    return count;
  },
  resourceInvalidateDependency: (dependency: string): number => {
    let count = 0;
    for (const record of runtimeResources.values()) {
      const deps = (record.options as { dependencies?: unknown; dependsOn?: unknown } | null)?.dependencies
        ?? (record.options as { dependsOn?: unknown } | null)?.dependsOn;
      const list = Array.isArray(deps) ? deps : typeof deps === 'string' ? [deps] : [];
      if (!list.includes(dependency)) continue;
      record.invalidated = true;
      count += 1;
    }
    return count;
  },
  resourceInvalidateScope: (scope: string): number => {
    let count = 0;
    for (const record of runtimeResources.values()) {
      if ((record.options as { scope?: unknown } | null)?.scope !== scope) continue;
      record.invalidated = true;
      count += 1;
    }
    return count;
  },
  resourceClearScope: (scope: string): number => {
    let count = 0;
    for (const [key, record] of runtimeResources) {
      if ((record.options as { scope?: unknown } | null)?.scope !== scope) continue;
      runtimeResources.delete(key);
      count += 1;
    }
    return count;
  },
  resourceMutate: (resource: Record<string, unknown>, value: unknown): unknown => {
    resource.data = value;
    return value;
  },
  show: (condition: unknown, renderChildren: () => VNode[] | VNode, fallback: VNode): VNode => {
    const value = condition ? renderChildren() : fallback;
    return Array.isArray(value) ? value[0] : value;
  },
  suspense: (_fallback: VNode, renderChildren: () => VNode[] | VNode): VNode => {
    const value = renderChildren();
    return Array.isArray(value) ? value[0] : value;
  },
  errorBoundary: (_fallback: VNode, renderChildren: () => VNode[] | VNode): VNode => {
    const value = renderChildren();
    return Array.isArray(value) ? value[0] : value;
  },
  props_merge: (
    ...parts: Array<Record<string, unknown> | null | undefined>
  ): Record<string, unknown> => Object.assign({}, ...parts.filter(Boolean)),
  props_class: (className: string): Record<string, unknown> => ({ className }),
  props_href: (href: string): Record<string, unknown> => ({ href }),
  props_on_click: (handler: () => unknown): Record<string, unknown> => ({
    onClick: (event?: Event) => {
      const result = handler();
      if (result === false) event?.preventDefault?.();
      return result;
    },
  }),
  element: (tag: string, props: Record<string, unknown>, children: VNode[]): VNode => ({
    kind: 'element',
    tag,
    props,
    children,
  }),
  text: (value: string): VNode => ({ kind: 'text', text: value }),
};

const splitPathSegments = (value: string): string[] =>
  value.split('/').filter((segment) => segment.length > 0);

const runtimeRouter = {
  getCurrentPath: (): string =>
    String((globalThis as { location?: { pathname?: string } }).location?.pathname ?? '/'),
  getCurrentHash: (): string =>
    String((globalThis as { location?: { hash?: string } }).location?.hash ?? ''),
  getCurrentSearch: (): string =>
    String((globalThis as { location?: { search?: string } }).location?.search ?? ''),
  push: (path: string): void => {
    (
      globalThis as {
        history?: {
          pushState?: (data: unknown, unused: string, url?: string | URL | null) => void;
        };
      }
    ).history?.pushState?.(null, '', path);
    (
      globalThis as { window?: { dispatchEvent?: (event: Event) => boolean } }
    ).window?.dispatchEvent?.(new Event('popstate'));
  },
  replace: (path: string): void => {
    (
      globalThis as {
        history?: {
          replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void;
        };
      }
    ).history?.replaceState?.(null, '', path);
    (
      globalThis as { window?: { dispatchEvent?: (event: Event) => boolean } }
    ).window?.dispatchEvent?.(new Event('popstate'));
  },
  onPopState: (listener: (pathname: string) => void): void => {
    (
      globalThis as {
        window?: { addEventListener?: (type: string, listener: EventListener) => void };
      }
    ).window?.addEventListener?.('popstate', () => listener(runtimeRouter.getCurrentPath()));
  },
  parseSearchParams: (search: string): Map<string, string> => {
    const params = new Map<string, string>();
    const query = search.startsWith('?') ? search.slice(1) : search;
    if (!query) return params;
    for (const pair of query.split('&')) {
      if (!pair) continue;
      const [key, value = ''] = pair.split('=');
      params.set(decodeURIComponent(key), decodeURIComponent(value));
    }
    return params;
  },
  matchRoute: (pattern: string, path: string): boolean => {
    if (pattern === '*') return true;
    const pat = splitPathSegments(pattern);
    const actual = splitPathSegments(path);
    if (pat.length !== actual.length) return false;
    for (let i = 0; i < pat.length; i += 1) {
      const part = pat[i];
      if (part.startsWith(':')) continue;
      if (part !== actual[i]) return false;
    }
    return true;
  },
  extractParams: (pattern: string, path: string): Map<string, string> => {
    const params = new Map<string, string>();
    const pat = splitPathSegments(pattern);
    const actual = splitPathSegments(path);
    for (let i = 0; i < Math.min(pat.length, actual.length); i += 1) {
      const part = pat[i];
      if (part.startsWith(':')) {
        params.set(part.slice(1), actual[i]);
      }
    }
    return params;
  },
  getScrollRestoration: (): string =>
    String((globalThis as { history?: { scrollRestoration?: string } }).history?.scrollRestoration ?? ''),
  setScrollRestoration: (mode: string): void => {
    const history = (globalThis as { history?: { scrollRestoration?: string } }).history;
    if (history) history.scrollRestoration = mode;
  },
  scrollToTop: (): void => {
    (globalThis as { window?: { scrollTo?: (x: number, y: number) => void } }).window?.scrollTo?.(0, 0);
  },
};

const bindRouterRuntime = (js: string): string =>
  js
    .replace(/const str = \{[\s\S]*?\};\n/, 'const str = __runtimeStr;\n')
    .replace(/const router = \{[\s\S]*?\};\n/, 'const router = __runtimeRouter;\n');

const compileRouterStdlib = (): RouterApi => {
  if (cachedRouterApi) {
    return cachedRouterApi;
  }

  const ast = parseProgram(routerStdSource);
  const analysis = analyzeLumina(ast);
  const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
  expect(semanticErrors).toHaveLength(0);

  const inferred = inferProgram(ast);
  const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
  expect(hmErrors).toHaveLength(0);

  const js = bindRouterRuntime(
    generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code
  );
  const factory = new Function(
    '__runtimeRouter',
    '__runtimeStr',
    'reactive',
    'render',
    'module',
    `${js}\nreturn { createRouter, navigate, replace, getScrollRestoration, setScrollRestoration, scrollToTop, currentPath, currentParams, currentSearchParams, routeResourceKey, routeScopedKey, routeModule, routeModuleMatch, routeModuleKey, routeModuleLoader, routeModuleLoaderWithOptions, routeModuleAction, routeModuleView, routeLoader, routeLoaderWithOptions, routeLoaderFor, routeLoaderForWithOptions, prefetchRoute, prefetchRouteWithOptions, routeStatus, routeData, routeError, routeRead, refreshRoute, invalidateRoute, invalidateRouteKey, invalidateRoutePrefix, invalidateRouteTag, invalidateRouteDependency, invalidateRouteScope, optimisticRouteMutate, routeAction, submitRouteAction, routeActionStatus, routeActionData, routeActionError, routeActionSubmitting, matchRoute, isActive, routeMatch, routeParams, routeView, outlet, layout, routeLoading, routeErrorBoundary, extractParams, onRouteChange, link, linkWithProps };`
  ) as (
    routerModule: typeof runtimeRouter,
    strModule: typeof runtimeStr,
    reactiveModule: typeof runtimeReactive,
    renderModule: typeof runtimeRender,
    moduleHandle: { exports: Record<string, unknown> }
  ) => RouterApi;

  cachedRouterApi = factory(runtimeRouter, runtimeStr, runtimeReactive, runtimeRender, {
    exports: {},
  });
  return cachedRouterApi;
};

const installBrowserEnv = (
  pathname = '/app',
  options: { search?: string; hash?: string; baseURI?: string } = {}
): BrowserEnvHandle => {
  const listeners = new Map<string, Set<EventListener>>();
  const location = {
    pathname,
    search: options.search ?? '',
    hash: options.hash ?? '',
  };
  const history = {
    pushes: [] as string[],
    replacements: [] as string[],
    state: null as unknown,
    scrollRestoration: 'auto',
    pushState: (_data: unknown, _unused: string, url?: string | URL | null) => {
      const next = typeof url === 'string' ? url : String(url ?? location.pathname);
      const parsed = new URL(next, 'https://lumina.dev');
      history.pushes.push(next);
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    },
    replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
      const next = typeof url === 'string' ? url : String(url ?? location.pathname);
      const parsed = new URL(next, 'https://lumina.dev');
      history.replacements.push(next);
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    },
  };
  const fakeWindow = {
    location,
    history,
    scrollTo: jest.fn<void, [number, number]>(),
    addEventListener: (type: string, listener: EventListener) => {
      const bucket = listeners.get(type) ?? new Set<EventListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: fakeWindow,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      baseURI: options.baseURI ?? 'https://lumina.dev/app/',
    },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: location,
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    writable: true,
    value: history,
  });

  return { window: fakeWindow };
};

describe('@std/router', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');

  const restoreGlobals = (): void => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete (globalThis as { document?: unknown }).document;
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else delete (globalThis as { location?: unknown }).location;
    if (originalHistory) Object.defineProperty(globalThis, 'history', originalHistory);
    else delete (globalThis as { history?: unknown }).history;
  };

  afterEach(() => {
    runtimeResources.clear();
    restoreGlobals();
  });

  test('matchRoute handles exact, parameter, wildcard, and nested routes', () => {
    const routerApi = compileRouterStdlib();

    expect(routerApi.matchRoute('/about', '/about')).toBe(true);
    expect(routerApi.matchRoute('/about', '/docs')).toBe(false);
    expect(routerApi.matchRoute('/users/:id', '/users/42')).toBe(true);
    expect(routerApi.matchRoute('/posts/:id/edit', '/posts/5/edit')).toBe(true);
    expect(routerApi.matchRoute('/posts/:id/edit', '/posts/5')).toBe(false);
    expect(routerApi.matchRoute('*', '/missing')).toBe(true);
  });

  test('extractParams returns path parameters for matched routes', () => {
    const routerApi = compileRouterStdlib();

    const userParams = routerApi.extractParams('/users/:id', '/users/42');
    const editParams = routerApi.extractParams('/posts/:id/edit', '/posts/5/edit');

    expect(getTag(runtimeHashmap.get(userParams as never, 'id'))).toBe('Some');
    expect(getPayload(runtimeHashmap.get(userParams as never, 'id'))).toBe('42');
    expect(getTag(runtimeHashmap.get(editParams as never, 'id'))).toBe('Some');
    expect(getPayload(runtimeHashmap.get(editParams as never, 'id'))).toBe('5');
  });

  test('createRouter reads initial path, respects base path, and exposes current search params', () => {
    installBrowserEnv('/app/lumina', {
      search: '?tab=demo&view=js',
      baseURI: 'https://lumina.dev/app/',
    });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    const pathSignal = routerApi.currentPath(routerValue);
    const params = routerApi.currentParams(routerValue);

    expect(runtimeReactive.get(pathSignal as never)).toBe('/lumina');
    expect(getPayload(runtimeHashmap.get(params as never, 'tab'))).toBe('demo');
    expect(getPayload(runtimeHashmap.get(params as never, 'view'))).toBe('js');
  });

  test('createRouter upgrades legacy hash routes used by static fallback redirects', () => {
    const env = installBrowserEnv('/app', {
      hash: '#/lumina',
      baseURI: 'https://lumina.dev/app/',
    });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');

    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/lumina');
    expect(env.window.history.replacements.at(-1)).toBe('/app/lumina');
  });

  test('navigate and replace update history-backed path state', () => {
    const env = installBrowserEnv('/app', { baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    routerApi.navigate(routerValue, '/playground');
    expect(env.window.history.pushes.at(-1)).toBe('/app/playground');
    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/playground');

    routerApi.replace(routerValue, '/lumina');
    expect(env.window.history.replacements.at(-1)).toBe('/app/lumina');
    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/lumina');
  });

  test('search-only navigation updates params and resource keys', () => {
    installBrowserEnv('/app/tasks', { search: '?filter=open', baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    expect(getPayload(runtimeHashmap.get(routerApi.currentSearchParams(routerValue) as never, 'filter'))).toBe('open');
    routerApi.navigate(routerValue, '/tasks?filter=closed');

    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/tasks');
    expect(getPayload(runtimeHashmap.get(routerApi.currentSearchParams(routerValue) as never, 'filter'))).toBe('closed');
    expect(routerApi.routeResourceKey(routerValue, 'details')).toBe('route:/tasks?filter=closed:details');
  });

  test('route loaders, prefetch, invalidation, and optimistic mutation compose with router state', async () => {
    installBrowserEnv('/app/tasks', { search: '?filter=open', baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();
    const routerValue = routerApi.createRouter('/app');

    expect(routerApi.routeResourceKey(routerValue, 'details')).toBe('route:/tasks?filter=open:details');
    expect(routerApi.routeScopedKey(routerValue, 'task-list', 'details')).toBe('route:task-list:/tasks?filter=open:details');
    const resource = routerApi.routeLoaderWithOptions(routerValue, 'details', async () => 'loaded', {
      tags: ['tasks'],
      dependencies: ['account'],
      scope: 'task-list',
    });
    expect(routerApi.routeStatus(resource)).toBe('success');
    expect(routerApi.routeRead(resource)).toBe('data:route:/tasks?filter=open:details');
    expect(routerApi.optimisticRouteMutate(resource, 'optimistic')).toBe('optimistic');
    expect(routerApi.routeRead(resource)).toBe('optimistic');
    expect(await routerApi.refreshRoute(resource)).toBe('loaded');
    routerApi.invalidateRoute(resource);

    const prefetch = routerApi.prefetchRoute(routerValue, '/settings/', 'details', async () => 'prefetched');
    expect(routerApi.routeRead(prefetch)).toBe('data:route:/settings:details');
    expect(routerApi.invalidateRouteKey('route:/tasks?filter=open:details')).toBe(true);
    expect(routerApi.invalidateRoutePrefix('route:/tasks')).toBe(1);
    expect(routerApi.invalidateRouteTag('tasks')).toBe(1);
    expect(routerApi.invalidateRouteDependency('account')).toBe(1);
    expect(routerApi.invalidateRouteScope('task-list')).toBe(1);
  });

  test('route module helpers co-locate match, loaders, actions, and scoped keys', async () => {
    installBrowserEnv('/app/tasks/42', {
      search: '?tab=activity',
      baseURI: 'https://lumina.dev/app/',
    });
    const routerApi = compileRouterStdlib();
    const routerValue = routerApi.createRouter('/app');
    const module = routerApi.routeModule('task-detail', '/tasks/:id', 'Task detail');

    expect(routerApi.routeModuleKey(routerValue, module, 'details')).toBe('route:task-detail:/tasks/42?tab=activity:details');
    expect(routerApi.routeModuleMatch(routerValue, module).matched).toBe(true);

    const resource = routerApi.routeModuleLoader(routerValue, module, 'details', async (match) => {
      expect((match as { matched: boolean }).matched).toBe(true);
      return 'loaded';
    });
    expect(routerApi.routeRead(resource)).toBe('data:route:task-detail:/tasks/42?tab=activity:details');
    expect((resource as { raw?: { options?: { scope?: string } } }).raw?.options?.scope).toBe('task-detail');

    const view = routerApi.routeModuleView(
      routerValue,
      module,
      () => ({ kind: 'text', text: 'module' }),
      { kind: 'text', text: 'fallback' }
    );
    expect(view.text).toBe('module');

    const action = routerApi.routeModuleAction(routerValue, module, 'save', async () => 'saved');
    expect(await routerApi.submitRouteAction(action)).toBe('saved');
  });

  test('route match, route view, action state, and scroll helpers compose', async () => {
    const env = installBrowserEnv('/app/tasks/42', {
      search: '?tab=activity',
      baseURI: 'https://lumina.dev/app/',
    });
    const routerApi = compileRouterStdlib();
    const routerValue = routerApi.createRouter('/app');

    expect(routerApi.getScrollRestoration()).toBe('auto');
    routerApi.setScrollRestoration('manual');
    routerApi.scrollToTop();
    expect(env.window.history.scrollRestoration).toBe('manual');
    expect(env.window.scrollTo).toHaveBeenCalledWith(0, 0);

    const match = routerApi.routeMatch(routerValue, '/tasks/:id');
    expect(match.matched).toBe(true);
    expect(getPayload(runtimeHashmap.get(routerApi.routeParams(match) as never, 'id'))).toBe('42');
    expect(getPayload(runtimeHashmap.get(match.search as never, 'tab'))).toBe('activity');

    const view = routerApi.routeView(
      routerValue,
      '/tasks/:id',
      () => [{ kind: 'text', text: 'task' }],
      { kind: 'text', text: 'fallback' }
    );
    expect(view.text).toBe('task');

    const action = routerApi.routeAction(routerValue, 'save', async () => 'saved');
    expect(routerApi.routeActionStatus(action)).toBe('success');
    expect(runtimeReactive.get(routerApi.routeActionSubmitting(action) as never)).toBe(false);
    expect(await routerApi.submitRouteAction(action)).toBe('saved');
    expect(routerApi.routeActionData(action)).toBe('saved');
    expect(runtimeReactive.get(routerApi.routeActionSubmitting(action) as never)).toBe(false);
  });

  test('back and forward style popstate dispatch updates the router signal', () => {
    const env = installBrowserEnv('/app/lumina', { baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    env.window.location.pathname = '/app/playground';
    env.window.dispatchEvent(new Event('popstate'));

    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/playground');
  });

  test('onRouteChange runs when the route signal changes', async () => {
    installBrowserEnv('/app', { baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();
    const seen: string[] = [];

    const routerValue = routerApi.createRouter('/app');
    const effect = routerApi.onRouteChange(routerValue, (path) => {
      seen.push(path);
    });

    routerApi.navigate(routerValue, '/lumina');
    await Promise.resolve();

    expect(seen).toContain('/');
    expect(seen).toContain('/lumina');
    runtimeReactive.disposeEffect(effect as never);
  });

  test('link renders an anchor, navigates on click, and prevents full page reload', () => {
    const env = installBrowserEnv('/app', { baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    const node = routerApi.link(routerValue, '/lumina', 'Playground');
    const props = node.props as { href?: string; onClick?: (event: Event) => void };
    const preventDefault = jest.fn();

    expect(node.kind).toBe('element');
    expect(node.tag).toBe('a');
    expect(props.href).toBe('/app/lumina');

    props.onClick?.({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalled();
    expect(env.window.location.pathname).toBe('/app/lumina');
    expect(runtimeReactive.get(routerApi.currentPath(routerValue) as never)).toBe('/lumina');
  });

  test('linkWithProps composes app props and isActive reads the current route', () => {
    const env = installBrowserEnv('/app/tasks', { baseURI: 'https://lumina.dev/app/' });
    const routerApi = compileRouterStdlib();

    const routerValue = routerApi.createRouter('/app');
    const node = routerApi.linkWithProps(
      routerValue,
      '/settings',
      { className: 'nav-link', 'aria-current': 'page' },
      [{ kind: 'text', text: 'Settings' }]
    );
    const props = node.props as {
      href?: string;
      className?: string;
      onClick?: (event: Event) => void;
    };
    const preventDefault = jest.fn();

    expect(routerApi.isActive(routerValue, '/tasks')).toBe(true);
    expect(props.href).toBe('/app/settings');
    expect(props.className).toBe('nav-link');
    expect(node.children[0]?.text).toBe('Settings');

    props.onClick?.({ preventDefault } as unknown as Event);

    expect(preventDefault).toHaveBeenCalled();
    expect(env.window.location.pathname).toBe('/app/settings');
    expect(routerApi.isActive(routerValue, '/settings')).toBe(true);
  });
});
