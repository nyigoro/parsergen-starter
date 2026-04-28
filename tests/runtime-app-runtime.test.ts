import { createAppRuntime } from '../src/runtime/app-runtime.js';
import { Signal } from '../src/runtime/reactive-core.js';

type FakeVNode = { kind: string; props?: unknown };

const createRuntime = () => {
  const frameManagers: object[] = [];
  const mountCalls: Array<{ mode: 'mount' | 'hydrate'; renderer: unknown; container: unknown; view: () => FakeVNode }> = [];
  const writes: Array<{ path: string; content: string; encoding?: string }> = [];
  const mkdirs: Array<{ path: string; recursive?: boolean }> = [];
  const rendererFactory = jest.fn((options: { document: unknown }) => ({ document: options.document }));
  const fsModule = {
    mkdirSync: jest.fn((path: string, options?: { recursive?: boolean }) => {
      mkdirs.push({ path, recursive: options?.recursive });
    }),
    writeFileSync: jest.fn((path: string, content: string, encoding?: string) => {
      writes.push({ path, content, encoding });
    }),
  };

  const runtime = createAppRuntime<unknown, FakeVNode, { mode: string; dispose: jest.Mock<void, []> }, Signal<unknown>, { document: unknown }, { kind: string }, object>({
    createFrameManager: () => {
      const frameManager = { kind: 'frame-manager' };
      frameManagers.push(frameManager);
      return frameManager;
    },
    runWithFrameManager: (_frameManager, renderView) => renderView(),
    component: <P,>(_componentFn: (props: P) => unknown, props: P): FakeVNode => ({ kind: 'component', props }),
    createDomRenderer: rendererFactory,
    mountReactive: (renderer, container, view) => {
      mountCalls.push({ mode: 'mount', renderer, container, view });
      return { mode: 'mount', dispose: jest.fn<void, []>() };
    },
    hydrateReactive: (renderer, container, view) => {
      mountCalls.push({ mode: 'hydrate', renderer, container, view });
      return { mode: 'hydrate', dispose: jest.fn<void, []>() };
    },
    createSignal: (initial: unknown) => new Signal(initial),
    getSignal: (signal: Signal<unknown>) => signal.get(),
    setSignal: (signal: Signal<unknown>, value: unknown) => {
      signal.set(value);
    },
    isDisposableLike: (value: unknown) =>
      !!value && typeof value === "object" && typeof (value as { dispose?: unknown }).dispose === 'function',
    disposeReactive: (root) => {
      root.dispose();
    },
    getGlobalDocument: () => ({ kind: 'global-document' }),
    isVNode: (value: unknown): value is FakeVNode => !!value && typeof value === 'object' && 'kind' in (value as object),
    renderToString: (node) => `<${node.kind}>${JSON.stringify(node.props ?? null)}</${node.kind}>`,
    coerceRenderableToVNode: (value: unknown) => ({ kind: 'coerced', props: value }),
    escapeHtml: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    resolvePath: (value: string) => `resolved:${value}`,
    dirnamePath: (value: string) => `dir:${value}`,
    getNodeBuiltinModule: (id: string) => (id === 'node:fs' ? fsModule : null),
  });

  return { runtime, frameManagers, mountCalls, writes, mkdirs, rendererFactory, fsModule };
};

describe('runtime app runtime', () => {
  test('renders apps through frame managers and mounts via testing facade', () => {
    const { runtime, frameManagers, mountCalls, rendererFactory } = createRuntime();

    expect(runtime.renderAppVNode((props: { label: string }) => props.label, { label: 'Inbox' })).toEqual({
      kind: 'component',
      props: { label: 'Inbox' },
    });
    expect(frameManagers).toHaveLength(1);

    const harness = runtime.testingFacade.testing_create_dom_harness();
    expect(rendererFactory).toHaveBeenCalledTimes(1);

    const mountRoot = runtime.testingFacade.testing_mount_app(
      harness,
      (props: { label: string }) => props.label,
      { label: 'Mount' }
    );
    const hydrateRoot = runtime.testingFacade.testing_hydrate_app(
      harness,
      (props: { label: string }) => props.label,
      { label: 'Hydrate' }
    );

    expect(mountRoot.mode).toBe('mount');
    expect(hydrateRoot.mode).toBe('hydrate');
    expect(mountCalls).toHaveLength(2);
    expect(mountCalls[0]?.view()).toEqual({ kind: 'component', props: { label: 'Mount' } });
    expect(mountCalls[1]?.view()).toEqual({ kind: 'component', props: { label: 'Hydrate' } });
    expect(harness.root).toBe(hydrateRoot);
  });

  test('renders and writes SSG output through the app runtime facade', () => {
    const { runtime, writes, mkdirs } = createRuntime();

    const rendered = runtime.ssgApi.renderAppPage(
      (props: { label: string }) => ({ kind: 'main', props }),
      { label: 'Ship' },
      { title: 'Demo' }
    );
    expect(rendered).toContain('<title>Demo</title>');
    expect(rendered).toContain('<component>{"label":"Ship"}</component>');

    const written = runtime.ssgApi.writeAppPage(
      'dist/index.html',
      (props: { label: string }) => ({ kind: 'page', props }),
      { label: 'Write' },
      { appId: 'root' }
    );

    expect(written).toBe('resolved:dist/index.html');
    expect(mkdirs).toEqual([{ path: 'dir:resolved:dist/index.html', recursive: true }]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe('resolved:dist/index.html');
    expect(writes[0]?.content).toContain('id="root"');
    expect(writes[0]?.content).toContain('<component>{"label":"Write"}</component>');
  });

  test('mounts and defines custom elements through the app runtime facade', () => {
    const { runtime, mountCalls } = createRuntime();

    const host = {
      ownerDocument: { kind: 'owner-document' },
      getAttribute: (name: string) => (name === 'label' ? 'Inbox' : null),
    };
    const controller = runtime.mountCustomElementInternal(
      host,
      ((props: { label?: string | null }) => props.label) as never,
      { observedAttributes: ['label'] }
    );

    expect(controller.props.get()).toEqual({ label: 'Inbox' });
    expect(mountCalls).toHaveLength(1);
    controller.disconnect();
    expect(controller.root.dispose).toHaveBeenCalledTimes(1);

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
      getAttribute(_name: string): string | null {
        return 'Hello';
      }
    }

    const CustomElement = runtime.defineCustomElementInternal(
      'lumina-mail',
      ((props: { label?: string | null }) => props.label) as never,
      { registry, baseClass: BaseElement, observedAttributes: ['label'] }
    );
    expect(define).toHaveBeenCalledWith('lumina-mail', CustomElement);
  });
});
