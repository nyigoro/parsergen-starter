type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');

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

  test('node fallback does not throw and returns empty values', async () => {
    delete (globalThis as { document?: unknown }).document;
    const { dom } = await loadRuntime();

    expect(dom.is_available()).toBe(false);
    expect(getTag(dom.query('#root'))).toBe('None');
    expect(dom.query_all('.item')).toEqual([]);
    expect(dom.create('div')).toBe(0);
    expect(dom.get_text(123)).toBe('');
    expect(dom.get_html(123)).toBe('');
    expect(dom.add_event(123, 'click', () => {})).toBe(0);
    expect(() => dom.remove_event(999)).not.toThrow();
  });

  test('event registration and cleanup works with a document-like host', async () => {
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
    const queried = dom.query('#root');
    expect(getTag(queried)).toBe('Some');

    const handle = (queried as { $payload: number }).$payload;
    const eventHandle = dom.add_event(handle, 'click', () => {});
    expect(eventHandle).toBeGreaterThan(0);

    dom.remove_event(eventHandle);
    expect(removed).toBe(1);
  });
});
