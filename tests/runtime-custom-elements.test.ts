import { createCustomElementsRuntime } from '../src/runtime/custom-elements.js';

type FakeSignal<T> = { value: T };
type FakeRoot = { dispose: jest.Mock<void, []> };

const createRuntime = () => {
  const mountCalls: Array<{ renderer: unknown; container: unknown; view: () => unknown }> = [];

  const runtime = createCustomElementsRuntime<
    { label?: string | null; preset?: string },
    unknown,
    FakeRoot,
    FakeSignal<{ label?: string | null; preset?: string }>,
    { documentLike: unknown },
    { kind: string }
  >({
    createRenderer: (documentLike) => ({ documentLike }),
    createSignal: (initial) => ({ value: initial }),
    getSignal: (signal) => signal.value,
    setSignal: (signal, value) => {
      signal.value = value;
    },
    createView: (_componentFn, propsSignal) => () => ({ props: propsSignal.value }),
    mountReactive: (renderer, container, view) => {
      mountCalls.push({ renderer, container, view });
      return { dispose: jest.fn<void, []>() };
    },
    isDisposableLike: (value) =>
      !!value && typeof value === 'object' && typeof (value as { dispose?: unknown }).dispose === 'function',
    disposeReactive: (root) => {
      root.dispose();
    },
    getGlobalDocument: () => ({ kind: 'global-document' }),
  });

  return { runtime, mountCalls };
};

describe('runtime custom elements', () => {
  test('mounts with observed attrs and shadow target', () => {
    const { runtime, mountCalls } = createRuntime();
    const shadowRoot = { kind: 'shadow-root' };
    const host = {
      ownerDocument: { kind: 'owner-document' },
      getAttribute: (name: string) => (name === 'label' ? 'Inbox' : null),
      attachShadow: jest.fn(() => shadowRoot),
    };

    const controller = runtime.mountCustomElementHost(
      host,
      (() => null) as never,
      { observedAttributes: ['label'], props: { preset: 'base' }, useShadow: true }
    );

    expect(host.attachShadow).toHaveBeenCalledWith({ mode: 'open' });
    expect(controller.target).toBe(shadowRoot);
    expect(controller.props.value).toEqual({ preset: 'base', label: 'Inbox' });
    expect(mountCalls).toHaveLength(1);
    expect(mountCalls[0]?.renderer).toEqual({ documentLike: host.ownerDocument });
    expect(mountCalls[0]?.container).toBe(shadowRoot);
    expect(mountCalls[0]?.view()).toEqual({ props: { preset: 'base', label: 'Inbox' } });
  });

  test('syncs attributes, updates props, and disposes disposable roots on disconnect', () => {
    const { runtime } = createRuntime();
    let label = 'Inbox';
    const host = {
      ownerDocument: { kind: 'owner-document' },
      getAttribute: () => label,
    };

    const controller = runtime.mountCustomElementHost(
      host,
      (() => null) as never,
      { observedAttributes: ['label'] }
    );

    label = 'Archive';
    expect(controller.syncAttributes()).toEqual({ label: 'Archive' });
    expect(controller.props.value).toEqual({ label: 'Archive' });
    expect(controller.updateProps({ preset: 'manual' })).toEqual({ preset: 'manual' });
    expect(controller.props.value).toEqual({ preset: 'manual' });

    controller.disconnect();
    expect(controller.root.dispose).toHaveBeenCalledTimes(1);
  });

  test('defines custom element once and reuses lifecycle controller', () => {
    const { runtime } = createRuntime();
    const define = jest.fn<void, [string, new () => unknown]>();
    const registryStore = new Map<string, unknown>();
    const registry = {
      define: (name: string, ctor: new () => unknown) => {
        registryStore.set(name, ctor);
        define(name, ctor);
      },
      get: (name: string) => registryStore.get(name),
    };

    class BaseElement {
      ownerDocument = { kind: 'owner-document' };
      private attrs: Record<string, string | null> = { label: 'Inbox' };
      getAttribute(name: string): string | null {
        return this.attrs[name] ?? null;
      }
      setLabel(value: string): void {
        this.attrs.label = value;
      }
    }

    const CustomElement = runtime.defineCustomElementClass(
      'lumina-mail',
      (() => null) as never,
      {
        registry,
        baseClass: BaseElement,
        observedAttributes: ['label'],
        mapProps: (attrs) => ({ label: attrs.label ?? 'none' }),
      }
    );

    expect(define).toHaveBeenCalledTimes(1);
    const element = new (CustomElement as new () => BaseElement & {
      connectedCallback: () => void;
      attributeChangedCallback: () => void;
      disconnectedCallback: () => void;
    })();

    element.connectedCallback();
    element.setLabel('Archive');
    element.attributeChangedCallback();
    element.connectedCallback();
    element.disconnectedCallback();

    expect(define).toHaveBeenCalledWith('lumina-mail', CustomElement);

    const Existing = runtime.defineCustomElementClass(
      'lumina-mail',
      (() => null) as never,
      { registry, baseClass: BaseElement }
    );
    expect(Existing).not.toBeNull();
    expect(define).toHaveBeenCalledTimes(1);
  });
});
