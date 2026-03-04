type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('@std/dom runtime', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

  const restoreDocument = (): void => {
    if (originalDocument) {
      Object.defineProperty(globalThis, 'document', originalDocument);
      return;
    }
    delete (globalThis as { document?: unknown }).document;
  };

  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  afterEach(() => {
    restoreDocument();
  });

  test('Node stub behaviors do not throw and return stable shapes', async () => {
    delete (globalThis as { document?: unknown }).document;
    const { dom } = await loadRuntime();

    expect(dom.is_available()).toBe(false);
    expect(getTag(dom.query('#root'))).toBe('None');
    expect(dom.query_all('.item')).toEqual([]);

    const handle = dom.create('div');
    expect(handle).toBeGreaterThan(0);

    expect(getTag(dom.get_attr(handle, 'id'))).toBe('None');
    expect(() => dom.set_attr(handle, 'id', 'x')).not.toThrow();
    expect(() => dom.remove_attr(handle, 'id')).not.toThrow();
    expect(() => dom.set_text(handle, 'hello')).not.toThrow();
    expect(() => dom.set_html(handle, '<b>x</b>')).not.toThrow();
    expect(() => dom.set_style(handle, 'color', 'red')).not.toThrow();
    expect(typeof dom.get_text(handle)).toBe('string');
    expect(typeof dom.get_html(handle)).toBe('string');
    expect(typeof dom.get_style(handle, 'color')).toBe('string');
  });

  test('Node stub add/remove event does not throw and cleans stale handles', async () => {
    delete (globalThis as { document?: unknown }).document;
    const { dom } = await loadRuntime();

    const handle = dom.create('button');
    const eventHandle = dom.add_event(handle, 'click', () => {});
    expect(eventHandle).toBeGreaterThan(0);

    expect(() => dom.remove_event(eventHandle)).not.toThrow();
    expect(() => dom.remove_event(eventHandle)).not.toThrow();
    expect(() => dom.remove_event(999_999)).not.toThrow();
  });

  test('invalid handle operations are graceful no-ops', async () => {
    delete (globalThis as { document?: unknown }).document;
    const { dom } = await loadRuntime();

    expect(() => dom.append_child(999, 1000)).not.toThrow();
    expect(() => dom.remove_child(999, 1000)).not.toThrow();
    expect(() => dom.set_style(999, '', 'x')).not.toThrow();
    expect(() => dom.set_attr(999, 'id', 'x')).not.toThrow();
    expect(() => dom.remove_attr(999, 'id')).not.toThrow();
  });

  test('browser-like host supports query/create/event lifecycle', async () => {
    let removed = 0;
    const listeners = new Map<string, EventListener>();
    const fakeElement = {
      textContent: '',
      innerHTML: '',
      style: {} as Record<string, unknown>,
      getAttribute: (_name: string) => null,
      setAttribute: (_name: string, _value: string) => {},
      removeAttribute: (_name: string) => {},
      appendChild: (_child: unknown) => {},
      removeChild: (_child: unknown) => {},
      addEventListener: (event: string, listener: EventListener) => {
        listeners.set(event, listener);
      },
      removeEventListener: (event: string, _listener: EventListener) => {
        if (listeners.has(event)) removed += 1;
        listeners.delete(event);
      },
    };

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: {
        querySelector: (_selector: string) => fakeElement,
        querySelectorAll: (_selector: string) => [fakeElement],
        createElement: (_tag: string) => fakeElement,
      },
    });

    const { dom } = await loadRuntime();
    expect(dom.is_available()).toBe(true);
    const queried = dom.query('#root');
    expect(getTag(queried)).toBe('Some');
    const queriedHandle = getPayload<number>(queried);
    expect(queriedHandle).toBeGreaterThan(0);

    const createdHandle = dom.create('div');
    expect(createdHandle).toBeGreaterThan(0);

    const eventHandle = dom.add_event(queriedHandle, 'click', () => {});
    expect(eventHandle).toBeGreaterThan(0);
    dom.remove_event(eventHandle);
    expect(removed).toBe(1);
  });

  test('module reload resets stub handle space', async () => {
    delete (globalThis as { document?: unknown }).document;
    const runtimeA = await loadRuntime();
    const first = runtimeA.dom.create('div');
    expect(first).toBeGreaterThan(0);

    const runtimeB = await loadRuntime();
    const firstAfterReload = runtimeB.dom.create('div');
    expect(firstAfterReload).toBe(first);
  });
});
