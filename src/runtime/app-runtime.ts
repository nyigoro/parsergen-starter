import type { ComponentFunction } from '../frame-manager.js';
import {
  createCustomElementsRuntime,
  type CustomElementController,
  type CustomElementMountOptions,
} from './custom-elements.js';
import { createSsgApi } from './ssg.js';
import { createTestingFacade, type TestingDomHarness } from './testing-facade.js';

interface AppRuntimeDeps<TRenderable, TVNode, TRoot, TSignal, TRenderer, TDocumentLike, TFrameManager> {
  createFrameManager: () => TFrameManager;
  runWithFrameManager: (frameManager: TFrameManager, renderView: () => TVNode) => TVNode;
  component: <P>(componentFn: ComponentFunction<P, TRenderable>, props: P) => TVNode;
  createDomRenderer: (options: { document: TDocumentLike }) => TRenderer;
  mountReactive: (renderer: unknown, container: unknown, view: () => TVNode) => TRoot;
  hydrateReactive: (renderer: unknown, container: unknown, view: () => TVNode) => TRoot;
  createSignal: (initial: unknown) => TSignal;
  getSignal: (signal: TSignal) => unknown;
  setSignal: (signal: TSignal, value: unknown) => void;
  isDisposableLike: (value: unknown) => boolean;
  disposeReactive: (root: TRoot) => void;
  getGlobalDocument: () => TDocumentLike | undefined;
  isVNode: (value: unknown) => value is TVNode;
  renderToString: (node: TVNode) => string;
  coerceRenderableToVNode: (value: unknown) => TVNode;
  escapeHtml: (value: string) => string;
  resolvePath: (value: string) => string;
  dirnamePath: (value: string) => string;
  getNodeBuiltinModule: (id: string) => unknown;
}

export const createAppRuntime = <
  TRenderable,
  TVNode,
  TRoot,
  TSignal,
  TRenderer,
  TDocumentLike,
  TFrameManager,
>(
  deps: AppRuntimeDeps<TRenderable, TVNode, TRoot, TSignal, TRenderer, TDocumentLike, TFrameManager>
) => {
  const renderAppVNode = <P>(componentFn: ComponentFunction<P, TRenderable>, props: P): TVNode =>
    deps.runWithFrameManager(deps.createFrameManager(), () => deps.component(componentFn, props));

  const mountReactiveApp = <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, TRenderable>,
    props: P
  ): TRoot => deps.mountReactive(renderer, container, () => deps.component(componentFn, props));

  const hydrateReactiveApp = <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, TRenderable>,
    props: P
  ): TRoot => deps.hydrateReactive(renderer, container, () => deps.component(componentFn, props));

  const mountTestingApp = <P>(
    harness: TestingDomHarness,
    componentFn: ComponentFunction<P, TRenderable>,
    props: P,
    hydrate: boolean = false
  ): TRoot => {
    const renderer = harness.renderer ?? deps.createDomRenderer({ document: harness.document as unknown as TDocumentLike });
    harness.renderer = renderer as unknown;
    const root = hydrate
      ? hydrateReactiveApp(renderer, harness.container, componentFn, props)
      : mountReactiveApp(renderer, harness.container, componentFn, props);
    harness.root = root as unknown;
    return root;
  };

  const testingFacade = createTestingFacade<ComponentFunction<unknown, TRenderable>, TRoot>({
    createRenderer: (documentLike) => deps.createDomRenderer({ document: documentLike as TDocumentLike }),
    mountApp: (harness, componentFn, props, hydrate) =>
      mountTestingApp(harness, componentFn as ComponentFunction<unknown, TRenderable>, props, hydrate),
  });

  const ssgApi = createSsgApi<TVNode, ComponentFunction<unknown, TRenderable>>({
    isVNode: deps.isVNode,
    renderToString: deps.renderToString,
    coerceRenderableToVNode: deps.coerceRenderableToVNode,
    escapeHtml: deps.escapeHtml,
    resolvePath: deps.resolvePath,
    dirnamePath: deps.dirnamePath,
    getNodeBuiltinModule: deps.getNodeBuiltinModule,
    renderApp: (componentFn, props) =>
      renderAppVNode(componentFn as ComponentFunction<unknown, TRenderable>, props),
  });

  const customElementsRuntime = createCustomElementsRuntime<
    unknown,
    TVNode,
    TRoot,
    TSignal,
    TRenderer,
    TDocumentLike
  >({
    createRenderer: (documentLike) => deps.createDomRenderer({ document: documentLike }),
    createSignal: deps.createSignal,
    getSignal: deps.getSignal,
    setSignal: deps.setSignal,
    createView: (componentFn, propsSignal) =>
      () =>
        deps.component(
          componentFn as unknown as ComponentFunction<unknown, TRenderable>,
          deps.getSignal(propsSignal)
        ),
    mountReactive: deps.mountReactive,
    isDisposableLike: deps.isDisposableLike,
    disposeReactive: deps.disposeReactive,
    getGlobalDocument: deps.getGlobalDocument,
  });

  const mountCustomElementInternal = <P>(
    host: unknown,
    componentFn: ComponentFunction<P, TRenderable>,
    options?: CustomElementMountOptions<P>
  ): CustomElementController<P, TRoot, TSignal> =>
    customElementsRuntime.mountCustomElementHost(
      host,
      componentFn as unknown as ComponentFunction<unknown, TVNode>,
      options as CustomElementMountOptions<unknown> | undefined
    ) as unknown as CustomElementController<P, TRoot, TSignal>;

  const defineCustomElementInternal = <P>(
    tagName: string,
    componentFn: ComponentFunction<P, TRenderable>,
    options?: CustomElementMountOptions<P>
  ): new () => unknown =>
    customElementsRuntime.defineCustomElementClass(
      tagName,
      componentFn as unknown as ComponentFunction<unknown, TVNode>,
      options as CustomElementMountOptions<unknown> | undefined
    );

  return {
    renderAppVNode,
    mountReactiveApp,
    hydrateReactiveApp,
    testingFacade,
    ssgApi,
    mountCustomElementInternal,
    defineCustomElementInternal,
  };
};
