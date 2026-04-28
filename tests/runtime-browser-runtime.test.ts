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
      pushState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        historyCalls.push(`push:${String(url)}`);
        location.pathname = String(url ?? '/');
      },
      replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => {
        historyCalls.push(`replace:${String(url)}`);
        location.pathname = String(url ?? '/');
      },
    };
    const windowHandle = {
      location,
      history,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      dispatchEvent: (_event: Event) => true,
    };

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        baseURI: 'https://example.com/app/',
        querySelector: (_selector: string) => element,
        querySelectorAll: (_selector: string) => [element],
        createElement: (_tag: string) => element,
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
    expect(router.matchRoute('/users/:id', '/users/42')).toBe(true);
    const params = router.extractParams('/users/:id', '/users/42') as TestHashMap<string, string>;
    expect(params.data.get('id')).toBe('42');
    const search = router.parseSearchParams('?page=2') as TestHashMap<string, string>;
    expect(search.data.get('page')).toBe('2');
    expect(router.getBasePath()).toBe('/app/');

    router.push('/next');
    router.replace('/final');
    expect(historyCalls).toEqual(['push:/next', 'replace:/final']);
  });
});
