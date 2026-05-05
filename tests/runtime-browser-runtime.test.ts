import { createBrowserRuntime } from '../src/runtime/browser-runtime.js';

type TaggedValue = { $tag?: string; $payload?: unknown };

class TestHashMap<K, V> {
  readonly data = new Map<K, V>();

  insert(key: K, value: V): void {
    this.data.set(key, value);
  }
}

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

const createRuntime = () =>
  createBrowserRuntime({
    optionSome: <T,>(value: T) => ({ $tag: 'Some', $payload: value }),
    optionNone: { $tag: 'None' },
    resultOk: <T,>(value: T) => ({ $tag: 'Ok', $payload: value }),
    resultErr: (message: string) => ({ $tag: 'Err', $payload: message }),
    createHashMap: <K, V>() => new TestHashMap<K, V>(),
  });

describe('runtime browser runtime', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const originalNavigation = Object.getOwnPropertyDescriptor(globalThis, 'navigation');
  const originalURLPattern = Object.getOwnPropertyDescriptor(globalThis, 'URLPattern');

  const restore = (): void => {
    const restoreProp = (name: string, descriptor: PropertyDescriptor | undefined): void => {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    };

    restoreProp('document', originalDocument);
    restoreProp('window', originalWindow);
    restoreProp('history', originalHistory);
    restoreProp('location', originalLocation);
    restoreProp('localStorage', originalLocalStorage);
    restoreProp('sessionStorage', originalSessionStorage);
    restoreProp('navigation', originalNavigation);
    restoreProp('URLPattern', originalURLPattern);
  };

  afterEach(() => {
    restore();
  });

  test('handles url parse/build and query appends', () => {
    const { url } = createRuntime();
    const parsed = url.parse('https://example.com/base?q=1#frag');
    expect(getTag(parsed)).toBe('Ok');
    const record = getPayload<{ pathname: string; search: string; hash: string }>(parsed);
    expect(record.pathname).toBe('/base');
    expect(record.search).toBe('?q=1');
    expect(record.hash).toBe('#frag');

    const rebuilt = url.build({
      protocol: 'https',
      host: 'example.com',
      pathname: 'docs',
      search: 'a=1',
      hash: 'top',
    });
    expect(getTag(rebuilt)).toBe('Ok');
    expect(getPayload<string>(rebuilt)).toBe('https://example.com/docs?a=1#top');

    const appended = url.append_param(record as unknown, 'page', '2');
    expect(appended.search).toContain('page=2');
  });

  test('uses fallback storage and browser-backed storage safely', () => {
    const fallbackRuntime = createRuntime();
    expect(getTag(fallbackRuntime.web_storage.local_set('name', 'lumina'))).toBe('Ok');
    expect(getTag(fallbackRuntime.web_storage.local_get('name'))).toBe('Some');
    expect(getPayload<string>(fallbackRuntime.web_storage.local_get('name'))).toBe('lumina');

    const localData = new Map<string, string>();
    const sessionData = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => localData.get(key) ?? null,
        setItem: (key: string, value: string) => localData.set(key, value),
        removeItem: (key: string) => localData.delete(key),
        clear: () => localData.clear(),
        get length() {
          return localData.size;
        },
      },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => sessionData.get(key) ?? null,
        setItem: (key: string, value: string) => sessionData.set(key, value),
        removeItem: (key: string) => sessionData.delete(key),
        clear: () => sessionData.clear(),
        get length() {
          return sessionData.size;
        },
      },
    });

    const browserRuntime = createRuntime();
    expect(browserRuntime.web_storage.is_available()).toBe(true);
    expect(getTag(browserRuntime.web_storage.session_set('token', 'abc'))).toBe('Ok');
    expect(getPayload<string>(browserRuntime.web_storage.session_get('token'))).toBe('abc');
  });

  test('bridges dom handles and router state through browser-like globals', () => {
    const listeners = new Map<string, EventListener>();
    const element = {
      textContent: '',
      innerHTML: '',
      style: {} as Record<string, unknown>,
      getAttribute: (_name: string) => null,
      setAttribute: (_name: string, _value: string) => undefined,
      removeAttribute: (_name: string) => undefined,
      appendChild: (_child: unknown) => undefined,
      removeChild: (_child: unknown) => undefined,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const location = { pathname: '/start', hash: '#a', search: '?q=1' };
    const historyCalls: string[] = [];
    const history = {
      state: null,
      scrollRestoration: 'auto',
      pushState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        historyCalls.push(`push:${String(url)}`);
      },
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        historyCalls.push(`replace:${String(url)}`);
      },
    };
    const scrollTo = jest.fn();
    const windowHandle = {
      location,
      history,
      scrollTo,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      dispatchEvent: (_event: Event) => true,
    };

    const startViewTransition = jest.fn((update: () => unknown) => update());
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        baseURI: 'https://example.com/app/',
        startViewTransition,
        querySelector: (_selector: string) => element,
        querySelectorAll: (_selector: string) => [element],
        createElement: (_tag: string) => element,
      },
    });
    Object.defineProperty(globalThis, 'navigation', {
      configurable: true,
      writable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'URLPattern', {
      configurable: true,
      writable: true,
      value: class TestURLPattern {
        constructor(private readonly input: { pathname?: string }) {}
        test(next: { pathname?: string }) {
          return this.input.pathname === '/patterned/:id'
            ? /^\/patterned\/[^/]+$/.test(next.pathname ?? '')
            : this.input.pathname === next.pathname;
        }
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: windowHandle,
    });
    Object.defineProperty(globalThis, 'history', {
      configurable: true,
      writable: true,
      value: history,
    });
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      writable: true,
      value: location,
    });

    const { dom, router } = createRuntime();
    const queried = dom.query('#root');
    expect(getTag(queried)).toBe('Some');
    const handle = getPayload<number>(queried);
    expect(handle).toBeGreaterThan(0);
    const eventHandle = dom.add_event(handle, 'click', () => undefined);
    expect(eventHandle).toBeGreaterThan(0);
    dom.remove_event(eventHandle);

    expect(router.getCurrentPath()).toBe('/start');
    expect(router.getCurrentHash()).toBe('#a');
    expect(router.getCurrentSearch()).toBe('?q=1');
    expect(router.supportsNavigationApi()).toBe(true);
    expect(router.supportsViewTransition()).toBe(true);
    expect(router.supportsUrlPattern()).toBe(true);
    expect(router.matchRoute('/users/:id', '/users/42')).toBe(true);
    expect(router.matchUrlPattern('/patterned/:id', '/patterned/42')).toBe(true);
    expect(router.matchRoute('/files/*rest', '/files/a/b')).toBe(true);
    const params = router.extractParams('/users/:id', '/users/a%20b') as TestHashMap<string, string>;
    expect(params.data.get('id')).toBe('a b');
    const splat = router.extractParams('/files/*rest', '/files/a/b') as TestHashMap<string, string>;
    expect(splat.data.get('rest')).toBe('a/b');
    const search = router.parseSearchParams('?page=2&name=Ada%20L') as TestHashMap<string, string>;
    expect(search.data.get('page')).toBe('2');
    expect(search.data.get('name')).toBe('Ada L');
    expect(router.getBasePath()).toBe('/app/');
    expect(router.getScrollRestoration()).toBe('auto');
    router.setScrollRestoration('manual');
    expect(history.scrollRestoration).toBe('manual');
    router.scrollToTop();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    router.push('/next?tab=1#top');
    router.replace('/final?tab=2#done');
    const transitioned = router.startViewTransition(() => router.push('/transitioned'));
    expect(transitioned).toBe(true);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(historyCalls).toEqual(['push:/next?tab=1#top', 'replace:/final?tab=2#done', 'push:/transitioned']);
    expect(location.pathname).toBe('/transitioned');
  });
});
