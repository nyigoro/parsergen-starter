import { type ComponentFunction } from '../src/frame-manager.js';
import { createHeadlessPrimitivesRuntime } from '../src/runtime/headless-primitives-runtime.js';
import { createHeadlessUiRuntime } from '../src/runtime/headless-ui-runtime.js';
import { createRenderApi } from '../src/runtime/render-api.js';
import { Signal } from '../src/runtime/reactive-core.js';
import { vnodeText, type ComponentRenderable, type VNode } from '../src/runtime/vnode-core.js';

type ContextToken = object;

const createHeadlessRuntime = () => {
  const contexts = new Map<ContextToken, unknown>();
  return createHeadlessPrimitivesRuntime({
    requireActiveFrameManager: () =>
      ({
        withContext: <T,>(context: ContextToken, value: T, renderChildren: () => unknown): unknown => {
          const had = contexts.has(context);
          const previous = contexts.get(context);
          contexts.set(context, value);
          try {
            return renderChildren();
          } finally {
            if (had) {
              contexts.set(context, previous);
            } else {
              contexts.delete(context);
            }
          }
        },
        useContext: <T,>(context: ContextToken): T => {
          const value = contexts.get(context);
          if (value === undefined) throw new Error('missing context');
          return value as T;
        },
      }) as never,
    headlessUi: createHeadlessUiRuntime(),
  });
};

class FakeRenderRoot {
  public mounted: VNode[] = [];
  public hydrated: VNode[] = [];

  constructor(
    readonly renderer: unknown,
    readonly container: unknown
  ) {}

  mount(node: VNode): void {
    this.mounted.push(node);
  }

  hydrate(node: VNode): void {
    this.hydrated.push(node);
  }
}

const createApi = () => {
  const componentCalls: unknown[] = [];
  const appRuntime = {
    renderAppVNode: jest.fn(() => vnodeText('app')),
    mountReactiveApp: jest.fn(() => ({ $tag: 'Ok', $payload: 'mount-app' })),
    hydrateReactiveApp: jest.fn(() => ({ $tag: 'Ok', $payload: 'hydrate-app' })),
    testingFacade: {
      testing_create_dom_harness: jest.fn(() => ({ document: {}, container: {}, body: {} })),
      testing_mount_app: jest.fn(() => ({ $tag: 'Ok', $payload: 'testing-mount' })),
      testing_hydrate_app: jest.fn(() => ({ $tag: 'Ok', $payload: 'testing-hydrate' })),
      testing_container: jest.fn((harness) => harness),
      testing_body: jest.fn(() => 'body'),
      testing_get_by_id: jest.fn(() => 'id-hit'),
      testing_get_by_text: jest.fn(() => 'text-hit'),
      testing_get_by_role_name: jest.fn(() => 'named-role-hit'),
      testing_query_all_by_role: jest.fn(() => ['role-hit']),
      testing_get_by_label: jest.fn(() => 'label-hit'),
      testing_get_by_placeholder: jest.fn(() => 'placeholder-hit'),
      testing_text_content: jest.fn(() => 'text'),
      testing_click: jest.fn(),
      testing_input: jest.fn(),
      testing_change_checked: jest.fn(),
      testing_keydown: jest.fn(),
      testing_submit: jest.fn(),
      testing_flush: jest.fn(async () => undefined),
      testing_wait_for: jest.fn(async (check: () => unknown) => check()),
    },
    ssgApi: {
      renderPage: jest.fn(() => '<html/>'),
      renderAppPage: jest.fn(() => '<app/>'),
      writePage: jest.fn(() => 'page.html'),
      writeAppPage: jest.fn(() => 'app.html'),
    },
    mountCustomElementInternal: jest.fn(() => ({ props: new Signal({ label: 'Inbox' }), disconnect: jest.fn() })),
    defineCustomElementInternal: jest.fn(() => class DemoElement {}),
  };

  const transitionRuntime = {
    transitionPresence: jest.fn(() => vnodeText('transition')),
  };

  const render = createRenderApi({
    frameRuntime: {
      component: <P,>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode => {
        componentCalls.push(props);
        return vnodeText(componentFn(props) as unknown as string);
      },
      createContext: <T,>(defaultValue?: T) => ({ defaultValue } as never),
      createRequiredContext: () => ({ required: true } as never),
      withContext: <T,>(_context: ContextToken, _value: T, renderChildren: () => ComponentRenderable): VNode =>
        renderChildren() as VNode,
      useContext: <T,>(context: ContextToken): T => (context as { defaultValue?: T }).defaultValue as T,
      state: (initial: unknown) => new Signal(initial),
      remember: <T,>(compute: () => T): T => compute(),
    },
    transitionRuntime,
    appRuntime,
    headlessPrimitiveRender: createHeadlessRuntime(),
    renderToString: jest.fn(() => '<div/>'),
    renderToChunks: jest.fn(() => ['<div/>']),
    renderToReadableStream: jest.fn(() => new ReadableStream<string>()),
    renderToTerminal: jest.fn(() => 'terminal'),
    createDomRenderer: jest.fn(() => ({ mount: jest.fn() })),
    createSsrRenderer: jest.fn(() => ({ mount: jest.fn() })),
    createCanvasRenderer: jest.fn(() => ({ mount: jest.fn() })),
    createTerminalRenderer: jest.fn(() => ({ mount: jest.fn() })),
    coerceRenderer: jest.fn((renderer) => renderer as never),
    RenderRoot: FakeRenderRoot,
    mountReactiveView: jest.fn(() => ({ $tag: 'Ok', $payload: 'mount-reactive' })),
    hydrateReactiveView: jest.fn(() => ({ $tag: 'Ok', $payload: 'hydrate-reactive' })),
    renderError: (message: string) => ({ $tag: 'Err', $payload: message }),
    toRenderErrorMessage: (error: unknown) => String(error),
    snapshotDevtools: jest.fn(() => ({ roots: [], resources: [], signals: [] }) as never),
    installLuminaDevtools: jest.fn(() => ({ installed: true })),
    recordDevtoolsEvent: jest.fn((type: string, label: string, detail?: unknown) => ({ id: 1, at: 1, type, label, detail })),
    readDevtoolsTimeline: jest.fn(() => []),
    clearDevtoolsTimeline: jest.fn(),
    scheduleDevtoolsNotify: jest.fn(),
  });

  return { render, appRuntime, transitionRuntime, componentCalls };
};

describe('runtime render api', () => {
  test('delegates app, testing, and custom-element surfaces through the extracted API', async () => {
    const { render, appRuntime } = createApi();
    const component = ((props: { label: string }) => props.label) as ComponentFunction<
      { label: string },
      ComponentRenderable
    >;

    expect(render.render_app(component, { label: 'Ship' })).toEqual(vnodeText('app'));
    expect(render.mount_app({}, {}, component, { label: 'Mount' })).toEqual({ $tag: 'Ok', $payload: 'mount-app' });

    const harness = render.testing_create_dom_harness();
    expect(render.testing_mount_app(harness, component, { label: 'Test' })).toEqual({
      $tag: 'Ok',
      $payload: 'testing-mount',
    });
    expect(render.testingGetByRole({}, 'tab')).toBe('role-hit');
    expect(render.testingGetByRoleName({}, 'button', 'Save')).toBe('named-role-hit');
    expect(render.testingGetByLabel({}, 'Name')).toBe('label-hit');
    expect(render.testingGetByPlaceholder({}, 'Search')).toBe('placeholder-hit');
    await expect(render.testing_flush()).resolves.toBeUndefined();
    await expect(render.testing_wait_for(() => 'async-ready', 3)).resolves.toBe('async-ready');

    const controller = render.mount_custom_element({}, component, { props: { label: 'Inbox' } });
    expect(controller.props.get()).toEqual({ label: 'Inbox' });
    expect(render.define_custom_element('x-demo', component)).toBeInstanceOf(Function);

    expect(appRuntime.renderAppVNode).toHaveBeenCalledTimes(1);
    expect(appRuntime.testingFacade.testing_mount_app).toHaveBeenCalledTimes(1);
    expect(appRuntime.testingFacade.testing_flush).toHaveBeenCalledTimes(1);
    expect(appRuntime.testingFacade.testing_wait_for).toHaveBeenCalledTimes(1);
    expect(appRuntime.mountCustomElementInternal).toHaveBeenCalledTimes(1);
  });

  test('preserves reactive helpers, transition routing, and root creation behavior', () => {
    const { render, transitionRuntime, componentCalls } = createApi();
    const signal = render.signal(1);
    expect(render.get(signal)).toBe(1);
    expect(render.set(signal, 3)).toBe(true);
    expect(render.peek(signal)).toBe(3);
    expect(render.batch(() => render.get(signal))).toBe(3);
    expect(render.untrack(() => render.get(signal))).toBe(3);

    expect(render.show(false, () => vnodeText('shown'), vnodeText('fallback'))).toEqual(vnodeText('fallback'));
    expect(
      render.error_boundary((error: unknown) => vnodeText(String(error)), () => {
        throw new Error('boom');
      })
    ).toEqual(vnodeText('Error: boom'));
    expect(render.transition_presence(new Signal(true), null, 120, () => vnodeText('x'))).toEqual(
      vnodeText('transition')
    );
    expect(transitionRuntime.transitionPresence).toHaveBeenCalledTimes(1);

    const component = ((props: { label: string }) => props.label) as ComponentFunction<
      { label: string },
      ComponentRenderable
    >;
    const vnode = render.component(component, { label: 'Box' }, 'stable');
    expect(vnode.key).toBe('stable');
    expect(componentCalls).toEqual([{ label: 'Box' }]);

    const renderer = { mount: jest.fn() };
    const root = render.create_root(renderer, 'container') as FakeRenderRoot;
    expect(root.renderer).toBe(renderer);
    expect(render.mount(renderer, 'container', vnodeText('node'))).toBeInstanceOf(FakeRenderRoot);
    expect(render.hydrate(renderer, 'container', vnodeText('node'))).toBeInstanceOf(FakeRenderRoot);
    expect(render.mount(renderer, null, vnodeText('node'))).toEqual({
      $tag: 'Err',
      $payload: 'Render container is required',
    });
  });
});
