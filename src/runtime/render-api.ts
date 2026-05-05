import type { ComponentFunction, ContextToken } from '../frame-manager.js';
import type { TestingDomHarness } from '../testing-dom.js';
import type { CustomElementController, CustomElementMountOptions } from './custom-elements.js';
import type { createHeadlessPrimitivesRuntime } from './headless-primitives-runtime.js';
import type { DevtoolsSnapshot, DevtoolsTimelineEvent } from './devtools.js';
import { type RenderRootRenderer, isDisposableLike, isUnmountableLike } from './render-core.js';
import {
  batch as batchReactive,
  Effect,
  Memo,
  Signal,
  untrack as untrackReactive,
  type ReactiveCleanup,
} from './reactive-core.js';
import {
  asResourceHandle,
  clearResourceScope,
  clearResourceRecords,
  ensureResourceCurrent,
  invalidateResourceDependency,
  invalidateResourceKey,
  invalidateResourcePrefix,
  invalidateResourceScope,
  invalidateResourceTag,
  ResourceHandle,
  resolveResourceRecord,
  startResourceLoad,
} from './resource-core.js';
import {
  applyVNodeKey,
  coerceRenderableToVNode,
  isVNode,
  normalizeVNodeChildren,
  parseVNode,
  resolveChildrenInput,
  serializeVNode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeKeyed,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
  type ComponentRenderable,
  type VNode,
  type VNodeInput,
} from './vnode-core.js';
import {
  composeHandlers,
  mergeProps,
  propsAttr,
  propsChecked,
  propsClass,
  propsDisabled,
  propsEmpty,
  propsHref,
  propsId,
  propsKey,
  propsName,
  propsOnChange,
  propsOnCheckedChange,
  propsOnClick,
  propsOnClickDec,
  propsOnClickDelta,
  propsOnClickInc,
  propsOnInput,
  propsOnSubmit,
  propsPlaceholder,
  propsStyle,
  propsType,
  propsValue,
  propsWhen,
} from './props-core.js';

type HeadlessPrimitiveRender = ReturnType<typeof createHeadlessPrimitivesRuntime>;

interface FrameRuntimeLike {
  component: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, key?: unknown) => VNode;
  createContext: <T>(defaultValue?: T) => ContextToken<T>;
  createRequiredContext: <T>() => ContextToken<T>;
  withContext: <T>(context: ContextToken<T>, value: T, renderChildren: () => ComponentRenderable) => VNode;
  useContext: <T>(context: ContextToken<T>) => T;
  state: (initial: unknown) => Signal<unknown>;
  remember: <T>(compute: () => T) => T;
}

interface TransitionRuntimeLike {
  transitionPresence: (
    open: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    durationMs: number,
    renderChildren: () => ComponentRenderable
  ) => VNode;
}

interface TestingFacadeLike<TReactiveRoot> {
  testing_create_dom_harness: () => TestingDomHarness;
  testing_mount_app: (
    harness: TestingDomHarness,
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    props: unknown
  ) => TReactiveRoot;
  testing_hydrate_app: (
    harness: TestingDomHarness,
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    props: unknown
  ) => TReactiveRoot;
  testing_container: (harness: unknown) => unknown;
  testing_body: (harness: unknown) => unknown;
  testing_get_by_id: (harness: unknown, id: string) => unknown;
  testing_get_by_text: (scope: unknown, value: string) => unknown;
  testing_query_all_by_role: (scope: unknown, role: string) => unknown;
  testing_text_content: (node: unknown) => string;
  testing_click: (node: unknown) => void;
  testing_input: (node: unknown, value: string) => void;
  testing_change_checked: (node: unknown, checked: boolean) => void;
  testing_keydown: (node: unknown, key: string, shiftKey?: boolean) => void;
  testing_submit: (node: unknown) => void;
  testing_flush: () => Promise<void>;
  testing_wait_for: (check: () => unknown, attempts?: number) => Promise<unknown>;
}

interface SsgApiLike {
  renderPage: (body: unknown, options?: unknown) => string;
  renderAppPage: (
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    props: unknown,
    options?: unknown
  ) => string;
  writePage: (filePath: string, body: unknown, options?: unknown) => string;
  writeAppPage: (
    filePath: string,
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    props: unknown,
    options?: unknown
  ) => string;
}

interface AppRuntimeLike<TReactiveRoot> {
  renderAppVNode: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P) => VNode;
  mountReactiveApp: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ) => TReactiveRoot;
  hydrateReactiveApp: <P>(
    renderer: unknown,
    container: unknown,
    componentFn: ComponentFunction<P, ComponentRenderable>,
    props: P
  ) => TReactiveRoot;
  testingFacade: TestingFacadeLike<TReactiveRoot>;
  ssgApi: SsgApiLike;
  mountCustomElementInternal: (
    host: unknown,
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    options?: CustomElementMountOptions<unknown>
  ) => CustomElementController<unknown, TReactiveRoot, Signal<unknown>>;
  defineCustomElementInternal: (
    tagName: string,
    componentFn: ComponentFunction<unknown, ComponentRenderable>,
    options?: CustomElementMountOptions<unknown>
  ) => new () => unknown;
}

interface RenderRootLike {
  mount: (node: VNode) => void;
  hydrate: (node: VNode) => void;
}

interface RenderApiDeps<TRenderRoot, TReactiveRoot, TRenderError, TDomRendererOptions, TCanvasRendererOptions> {
  frameRuntime: FrameRuntimeLike;
  transitionRuntime: TransitionRuntimeLike;
  appRuntime: AppRuntimeLike<TReactiveRoot>;
  headlessPrimitiveRender: HeadlessPrimitiveRender;
  renderToString: (node: VNode) => string;
  renderToTerminal: (node: VNode) => string;
  createDomRenderer: (options?: TDomRendererOptions) => RenderRootRenderer<VNode>;
  createSsrRenderer: () => RenderRootRenderer<VNode>;
  createCanvasRenderer: (options?: TCanvasRendererOptions) => RenderRootRenderer<VNode>;
  createTerminalRenderer: () => RenderRootRenderer<VNode>;
  coerceRenderer: (candidate: unknown) => RenderRootRenderer<VNode>;
  RenderRoot: new (renderer: RenderRootRenderer<VNode>, container: unknown) => TRenderRoot;
  mountReactiveView: (renderer: unknown, container: unknown, view: () => VNode) => TReactiveRoot;
  hydrateReactiveView: (renderer: unknown, container: unknown, view: () => VNode) => TReactiveRoot;
  renderError: (message: string) => TRenderError;
  toRenderErrorMessage: (error: unknown) => string;
  snapshotDevtools: () => DevtoolsSnapshot<VNode | null>;
  installLuminaDevtools: (key?: string) => Record<string, unknown>;
  recordDevtoolsEvent: (type: string, label: string, detail?: unknown) => DevtoolsTimelineEvent;
  readDevtoolsTimeline: () => DevtoolsTimelineEvent[];
  clearDevtoolsTimeline: () => void;
  scheduleDevtoolsNotify: () => void;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  !!value
  && (typeof value === 'object' || typeof value === 'function')
  && typeof (value as { then?: unknown }).then === 'function';

export const createRenderApi = <
  TRenderRoot extends RenderRootLike,
  TReactiveRoot,
  TRenderError,
  TDomRendererOptions = unknown,
  TCanvasRendererOptions = unknown,
>(
  deps: RenderApiDeps<TRenderRoot, TReactiveRoot, TRenderError, TDomRendererOptions, TCanvasRendererOptions>
) => {
  const render = {
    signal: <T>(initial: T): Signal<T> => new Signal<T>(initial),
    get: <T>(signal: Signal<T>): T => signal.get(),
    peek: <T>(signal: Signal<T>): T => signal.peek(),
    set: <T>(signal: Signal<T>, value: T): boolean => signal.set(value),
    update_signal: <T>(signal: Signal<T>, updater: (value: T) => T): T => signal.update(updater),
    memo: <T>(compute: () => T): Memo<T> => new Memo<T>(compute),
    memo_get: <T>(memo: Memo<T>): T => memo.get(),
    memo_peek: <T>(memo: Memo<T>): T => memo.peek(),
    memo_dispose: <T>(memo: Memo<T>): void => memo.dispose(),
    effect: (fn: (onCleanup: (cleanup: ReactiveCleanup) => void) => void | ReactiveCleanup): Effect => new Effect(fn),
    dispose_effect: (effect: unknown): void => {
      if (!isDisposableLike(effect)) return;
      try {
        effect.dispose();
      } catch {
        // Keep stale/invalid handles idempotent.
      }
    },
    batch: <T>(fn: () => T): T => batchReactive(fn),
    untrack: <T>(fn: () => T): T => untrackReactive(fn),
    component: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, key?: unknown): VNode =>
      applyVNodeKey(deps.frameRuntime.component(componentFn, props, key), key),
    component_keyed: <P>(
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P,
      key: unknown
    ): VNode => render.component(componentFn, props, key),
    render_app: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
      deps.appRuntime.renderAppVNode(componentFn, props),
    render_to_string_app: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): string =>
      deps.renderToString(deps.appRuntime.renderAppVNode(componentFn, props)),
    create_context: deps.frameRuntime.createContext,
    create_required_context: deps.frameRuntime.createRequiredContext,
    with_context: <T>(context: ContextToken<T>, value: T, renderChildren: () => ComponentRenderable): VNode =>
      deps.frameRuntime.withContext(context, value, renderChildren),
    use_context: <T>(context: ContextToken<T>): T => deps.frameRuntime.useContext(context),
    state: <T>(initial: T): Signal<T> => deps.frameRuntime.state(initial) as Signal<T>,
    remember: <T>(compute: () => T): T => deps.frameRuntime.remember(compute),
    transition_presence: (
      open: Signal<boolean>,
      props: Record<string, unknown> | null | undefined,
      durationMs: number,
      renderChildren: () => ComponentRenderable
    ): VNode => deps.transitionRuntime.transitionPresence(open, props, durationMs, renderChildren),
    resource_create: <T>(
      key: unknown,
      loader: ((signal?: AbortSignal) => Promise<T>) | ((signal?: AbortSignal) => T),
      options?: unknown
    ): ResourceHandle<T> => new ResourceHandle<T>(resolveResourceRecord(key, loader, options)),
    resource_status: (resource: unknown): string => {
      const handle = asResourceHandle(resource, 'render.resource_status');
      ensureResourceCurrent(handle.record);
      return handle.record.status.get();
    },
    resource_data: (resource: unknown): unknown => {
      const handle = asResourceHandle(resource, 'render.resource_data');
      ensureResourceCurrent(handle.record);
      return handle.record.hasData.get() ? handle.record.data.get() : null;
    },
    resource_error: (resource: unknown): unknown => {
      const handle = asResourceHandle(resource, 'render.resource_error');
      ensureResourceCurrent(handle.record);
      return handle.record.error.get();
    },
    resource_read: <T>(resource: unknown): T => {
      const handle = asResourceHandle<T>(resource, 'render.resource_read');
      ensureResourceCurrent(handle.record);
      const status = handle.record.status.get();
      if (handle.record.hasData.get()) {
        return handle.record.data.get() as T;
      }
      if (status === 'loading' && handle.record.promise) {
        throw handle.record.promise;
      }
      const error = handle.record.error.get();
      if (error !== null) {
        throw error;
      }
      throw new Error(`Resource '${handle.record.key}' has no data`);
    },
    resource_refresh: <T>(resource: unknown): Promise<T> => {
      const handle = asResourceHandle<T>(resource, 'render.resource_refresh');
      handle.record.expiresAt = 0;
      return startResourceLoad(handle.record, true);
    },
    resource_invalidate: (resource: unknown): void => {
      const handle = asResourceHandle(resource, 'render.resource_invalidate');
      handle.record.expiresAt = 0;
      if (!handle.record.hasData.peek() || !handle.record.staleWhileRevalidate) handle.record.status.set('idle');
      ensureResourceCurrent(handle.record);
      deps.scheduleDevtoolsNotify();
    },
    resource_invalidate_key: (key: unknown): boolean => {
      const changed = invalidateResourceKey(key);
      if (changed) deps.scheduleDevtoolsNotify();
      return changed;
    },
    resource_invalidate_prefix: (prefix: string): number => {
      const count = invalidateResourcePrefix(prefix);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_tag: (tag: string): number => {
      const count = invalidateResourceTag(tag);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_dependency: (dependency: string): number => {
      const count = invalidateResourceDependency(dependency);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_scope: (scope: string): number => {
      const count = invalidateResourceScope(scope);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_clear_cache: (): void => {
      clearResourceRecords();
      deps.scheduleDevtoolsNotify();
    },
    resource_clear_scope: (scope: string): number => {
      const count = clearResourceScope(scope);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_mutate: <T>(resource: unknown, value: T): T => {
      const handle = asResourceHandle<T>(resource, 'render.resource_mutate');
      handle.record.version += 1;
      handle.record.promise = null;
      handle.record.data.set(value as unknown);
      handle.record.hasData.set(true);
      handle.record.error.set(null);
      handle.record.status.set('success');
      handle.record.expiresAt =
        handle.record.ttlMs > 0 ? Date.now() + handle.record.ttlMs : Number.POSITIVE_INFINITY;
      deps.scheduleDevtoolsNotify();
      return handle.record.data.get() as T;
    },
    suspense: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (!isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === 'function'
          ? (fallback as () => ComponentRenderable)()
          : (fallback as VNodeInput);
        return coerceRenderableToVNode(resolvedFallback);
      }
    },
    error_boundary: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === 'function'
          ? (fallback as (value: unknown) => ComponentRenderable)(error)
          : (fallback as VNodeInput);
        return coerceRenderableToVNode(resolvedFallback);
      }
    },
    show: (condition: unknown, renderChildren: () => ComponentRenderable, fallback: unknown): VNode => {
      const resolved = condition instanceof Signal ? condition.get() : condition;
      return resolved
        ? coerceRenderableToVNode(renderChildren())
        : coerceRenderableToVNode(typeof fallback === 'function' ? fallback() : fallback);
    },
    createResource: <T>(
      key: unknown,
      loader: ((signal?: AbortSignal) => Promise<T>) | ((signal?: AbortSignal) => T),
      options?: unknown
    ): ResourceHandle<T> => render.resource_create(key, loader, options),
    renderApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
      render.render_app(componentFn, props),
    renderToStringApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): string =>
      render.render_to_string_app(componentFn, props),
    transitionPresence: (
      open: Signal<boolean>,
      props: Record<string, unknown> | null | undefined,
      durationMs: number,
      renderChildren: () => ComponentRenderable
    ): VNode => render.transition_presence(open, props, durationMs, renderChildren),
    resourceStatus: (resource: unknown): string => render.resource_status(resource),
    resourceData: (resource: unknown): unknown => render.resource_data(resource),
    resourceError: (resource: unknown): unknown => render.resource_error(resource),
    resourceRead: <T>(resource: unknown): T => render.resource_read<T>(resource),
    resourceRefresh: <T>(resource: unknown): Promise<T> => render.resource_refresh<T>(resource),
    resourceInvalidate: (resource: unknown): void => render.resource_invalidate(resource),
    resourceInvalidateKey: (key: unknown): boolean => render.resource_invalidate_key(key),
    resourceInvalidatePrefix: (prefix: string): number => render.resource_invalidate_prefix(prefix),
    resourceInvalidateTag: (tag: string): number => render.resource_invalidate_tag(tag),
    resourceInvalidateDependency: (dependency: string): number => render.resource_invalidate_dependency(dependency),
    resourceInvalidateScope: (scope: string): number => render.resource_invalidate_scope(scope),
    resourceClearCache: (): void => render.resource_clear_cache(),
    resourceClearScope: (scope: string): number => render.resource_clear_scope(scope),
    resourceMutate: <T>(resource: unknown, value: T): T => render.resource_mutate(resource, value),
    errorBoundary: (fallback: unknown, renderChildren: () => ComponentRenderable): VNode =>
      render.error_boundary(fallback, renderChildren),
    mountApp: <P>(
      renderer: unknown,
      container: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => render.mount_app(renderer, container, componentFn, props),
    hydrateApp: <P>(
      renderer: unknown,
      container: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => render.hydrate_app(renderer, container, componentFn, props),
    testingCreateDomHarness: (): TestingDomHarness => render.testing_create_dom_harness(),
    testingMountApp: <P>(
      harness: TestingDomHarness,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => render.testing_mount_app(harness, componentFn, props),
    testingHydrateApp: <P>(
      harness: TestingDomHarness,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => render.testing_hydrate_app(harness, componentFn, props),
    testingContainer: (harness: unknown): unknown => render.testing_container(harness),
    testingBody: (harness: unknown): unknown => render.testing_body(harness),
    testingGetById: (harness: unknown, id: string): unknown => render.testing_get_by_id(harness, id),
    testingGetByText: (scope: unknown, value: string): unknown => render.testing_get_by_text(scope, value),
    testingGetByRole: (scope: unknown, role: string): unknown => {
      const matches = render.testing_query_all_by_role(scope, role) as unknown[];
      return matches[0] ?? null;
    },
    testingQueryAllByRole: (scope: unknown, role: string): unknown => render.testing_query_all_by_role(scope, role),
    testingTextContent: (node: unknown): string => render.testing_text_content(node),
    testingClick: (node: unknown): void => render.testing_click(node),
    testingInput: (node: unknown, value: string): void => render.testing_input(node, value),
    testingChangeChecked: (node: unknown, checked: boolean): void => render.testing_change_checked(node, checked),
    testingKeydown: (node: unknown, key: string, shiftKey?: boolean): void =>
      render.testing_keydown(node, key, shiftKey),
    testingSubmit: (node: unknown): void => render.testing_submit(node),
    testingFlush: (): Promise<void> => render.testing_flush(),
    testingWaitFor: (check: () => unknown, attempts?: number): Promise<unknown> => render.testing_wait_for(check, attempts),
    devtoolsSnapshot: (): DevtoolsSnapshot<VNode | null> => render.devtools_snapshot(),
    installDevtools: (key?: string): Record<string, unknown> => render.install_devtools(key),
    devtoolsRecordEvent: (type: string, label: string, detail?: unknown): DevtoolsTimelineEvent =>
      render.devtools_record_event(type, label, detail),
    devtoolsTimeline: (): DevtoolsTimelineEvent[] => render.devtools_timeline(),
    devtoolsClearTimeline: (): void => render.devtools_clear_timeline(),
    ssgPage: (body: unknown, options?: unknown): string => render.ssg_page(body, options),
    ssgRenderApp: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P, options?: unknown): string =>
      render.ssg_render_app(componentFn, props, options),
    ssgWritePage: (filePath: string, body: unknown, options?: unknown): string =>
      render.ssg_write_page(filePath, body, options),
    ssgWriteApp: <P>(
      filePath: string,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P,
      options?: unknown
    ): string => render.ssg_write_app(filePath, componentFn, props, options),
    devtools_snapshot: (): DevtoolsSnapshot<VNode | null> => deps.snapshotDevtools(),
    install_devtools: (key?: string): Record<string, unknown> => deps.installLuminaDevtools(key),
    devtools_record_event: (type: string, label: string, detail?: unknown): DevtoolsTimelineEvent =>
      deps.recordDevtoolsEvent(type, label, detail),
    devtools_timeline: (): DevtoolsTimelineEvent[] => deps.readDevtoolsTimeline(),
    devtools_clear_timeline: (): void => deps.clearDevtoolsTimeline(),
    ssg_page: (body: unknown, options?: unknown): string => deps.appRuntime.ssgApi.renderPage(body, options),
    ssg_render_app: <P>(
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P,
      options?: unknown
    ): string =>
      deps.appRuntime.ssgApi.renderAppPage(
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        props,
        options
      ),
    ssg_write_page: (filePath: string, body: unknown, options?: unknown): string =>
      deps.appRuntime.ssgApi.writePage(filePath, body, options),
    ssg_write_app: <P>(
      filePath: string,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P,
      options?: unknown
    ): string =>
      deps.appRuntime.ssgApi.writeAppPage(
        filePath,
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        props,
        options
      ),
    mountCustomElement: <P>(
      host: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      options?: CustomElementMountOptions<P>
    ): CustomElementController<P> => render.mount_custom_element(host, componentFn, options),
    defineCustomElement: <P>(
      tagName: string,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      options?: CustomElementMountOptions<P>
    ): new () => unknown => render.define_custom_element(tagName, componentFn, options),
    children: (input: unknown): VNode[] => normalizeVNodeChildren(resolveChildrenInput(input)),
    slot: <P>(
      slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
      props: P,
      fallback: VNodeInput = []
    ): VNode => {
      if (typeof slotValue === 'function') {
        return coerceRenderableToVNode((slotValue as (value: P) => ComponentRenderable)(props));
      }
      if (slotValue === null || slotValue === undefined) {
        return coerceRenderableToVNode(fallback);
      }
      return coerceRenderableToVNode(slotValue);
    },
    slot_or: <P>(
      slotValue: ((props: P) => ComponentRenderable) | VNodeInput | null | undefined,
      props: P,
      fallback: VNodeInput
    ): VNode => render.slot(slotValue, props, fallback),
    compose_handlers: <Args extends unknown[]>(
      left: ((...args: Args) => unknown) | null | undefined,
      right: ((...args: Args) => unknown) | null | undefined
    ): ((...args: Args) => unknown) | undefined => composeHandlers(left, right),
    portal: (target: string | null | undefined, children: VNodeInput = []): VNode => vnodePortal(target, children),
    portal_body: (children: VNodeInput = []): VNode => vnodePortal(null, children),
    ...deps.headlessPrimitiveRender,
    selectRoot: (open: Signal<boolean>, value: Signal<string>, renderChildren: () => ComponentRenderable): VNode =>
      render.select_root(open, value, renderChildren),
    selectPortal: (children: VNodeInput = []): VNode => render.select_portal(children),
    selectTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.select_trigger(props, children),
    selectContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.select_content(props, children),
    selectItem: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.select_item(value, props, renderChildren),
    selectIndicator: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.select_indicator(props, children),
    comboboxRoot: (
      open: Signal<boolean>,
      value: Signal<string>,
      query: Signal<string>,
      renderChildren: () => ComponentRenderable
    ): VNode => render.combobox_root(open, value, query, renderChildren),
    comboboxPortal: (children: VNodeInput = []): VNode => render.combobox_portal(children),
    comboboxInput: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.combobox_input(props, children),
    comboboxContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.combobox_content(props, children),
    comboboxItem: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.combobox_item(value, props, renderChildren),
    comboboxIndicator: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.combobox_indicator(props, children),
    multiselectRoot: (
      open: Signal<boolean>,
      values: Signal<string[]>,
      renderChildren: () => ComponentRenderable
    ): VNode => render.multiselect_root(open, values, renderChildren),
    multiselectPortal: (children: VNodeInput = []): VNode => render.multiselect_portal(children),
    multiselectTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.multiselect_trigger(props, children),
    multiselectContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.multiselect_content(props, children),
    multiselectItem: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.multiselect_item(value, props, renderChildren),
    multiselectIndicator: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.multiselect_indicator(props, children),
    checkboxRoot: (
      checked: Signal<boolean>,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.checkbox_root(checked, props, renderChildren),
    checkboxIndicator: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.checkbox_indicator(props, children),
    radioGroup: (
      value: Signal<string>,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.radio_group(value, props, renderChildren),
    radioItem: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => render.radio_item(value, props, renderChildren),
    radioIndicator: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.radio_indicator(props, children),
    portalBody: (children: VNodeInput = []): VNode => render.portal_body(children),
    tabsRoot: (value: Signal<string>, renderChildren: () => ComponentRenderable): VNode =>
      render.tabs_root(value, renderChildren),
    tabsList: (props: Record<string, unknown> | null | undefined, renderChildren: () => ComponentRenderable): VNode =>
      render.tabs_list(props, renderChildren),
    tabsTrigger: (value: string, props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.tabs_trigger(value, props, children),
    tabsPanel: (value: string, props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.tabs_panel(value, props, children),
    dialogRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
      render.dialog_root(open, renderChildren),
    dialogPortal: (children: VNodeInput = []): VNode => render.dialog_portal(children),
    dialogTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.dialog_trigger(props, children),
    dialogOverlay: (props: Record<string, unknown> | null | undefined): VNode => render.dialog_overlay(props),
    dialogContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.dialog_content(props, children),
    dialogTitle: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.dialog_title(props, children),
    dialogDescription: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.dialog_description(props, children),
    dialogClose: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.dialog_close(props, children),
    popoverRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
      render.popover_root(open, renderChildren),
    popoverPortal: (children: VNodeInput = []): VNode => render.popover_portal(children),
    popoverTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.popover_trigger(props, children),
    popoverContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.popover_content(props, children),
    tooltipRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
      render.tooltip_root(open, renderChildren),
    tooltipPortal: (children: VNodeInput = []): VNode => render.tooltip_portal(children),
    tooltipTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.tooltip_trigger(props, children),
    tooltipContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.tooltip_content(props, children),
    menuRoot: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode =>
      render.menu_root(open, renderChildren),
    menuPortal: (children: VNodeInput = []): VNode => render.menu_portal(children),
    menuTrigger: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.menu_trigger(props, children),
    menuContent: (props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.menu_content(props, children),
    menuItem: (value: string, props: Record<string, unknown> | null | undefined, children: VNodeInput = []): VNode =>
      render.menu_item(value, props, children),
    text: (value: unknown): VNode => vnodeText(value),
    live_text: (signal: Signal<unknown> | Memo<unknown>): VNode => vnodeLiveText(signal),
    liveText: (signal: Signal<unknown> | Memo<unknown>): VNode => vnodeLiveText(signal),
    index_list: (itemsSignal: Signal<unknown>, renderItem: (item: Signal<unknown>, index: number) => VNodeInput): VNode =>
      vnodeIndexList(itemsSignal, renderItem),
    indexList: (itemsSignal: Signal<unknown>, renderItem: (item: Signal<unknown>, index: number) => VNodeInput): VNode =>
      vnodeIndexList(itemsSignal, renderItem),
    for_list: (
      itemsSignal: Signal<unknown>,
      keyOf: (item: unknown, index: number) => string | number,
      renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
    ): VNode => vnodeForList(itemsSignal, keyOf, renderItem),
    forList: (
      itemsSignal: Signal<unknown>,
      keyOf: (item: unknown, index: number) => string | number,
      renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
    ): VNode => vnodeForList(itemsSignal, keyOf, renderItem),
    keyed: (key: unknown, child: unknown): VNode => vnodeKeyed(key, child),
    key: (key: unknown, child: unknown): VNode => render.keyed(key, child),
    element: (tag: string, props?: Record<string, unknown> | null, children: VNodeInput = []): VNode =>
      vnodeElement(tag, props, children),
    props_empty: propsEmpty,
    props_class: propsClass,
    props_on_click: propsOnClick,
    props_on_click_delta: propsOnClickDelta,
    props_on_click_inc: propsOnClickInc,
    props_on_click_dec: propsOnClickDec,
    props_id: propsId,
    props_style: propsStyle,
    props_value: propsValue,
    props_checked: propsChecked,
    props_type: propsType,
    props_name: propsName,
    props_placeholder: propsPlaceholder,
    props_href: propsHref,
    props_disabled: propsDisabled,
    props_on_input: propsOnInput,
    props_on_change: propsOnChange,
    props_on_checked_change: propsOnCheckedChange,
    props_on_submit: propsOnSubmit,
    props_key: propsKey,
    props_attr: (name: string, value: unknown): Record<string, unknown> => propsAttr(name, value),
    props_when: (condition: unknown, props: unknown): Record<string, unknown> => propsWhen(condition, props),
    props_merge: (left: unknown, right: unknown): Record<string, unknown> => mergeProps(left, right),
    dom_get_element_by_id: (id: string): unknown => {
      const doc = (globalThis as { document?: { getElementById?: (value: string) => unknown } }).document;
      if (!doc || typeof doc.getElementById !== 'function') return null;
      return doc.getElementById(id);
    },
    fragment: (children: VNodeInput = []): VNode => vnodeFragment(children),
    is_vnode: (value: unknown): boolean => isVNode(value),
    serialize: (node: VNode): string => serializeVNode(node),
    parse: (json: string): VNode => parseVNode(json),
    create_renderer: (renderer: unknown): RenderRootRenderer<VNode> => deps.coerceRenderer(renderer),
    create_dom_renderer: (options?: TDomRendererOptions): RenderRootRenderer<VNode> => deps.createDomRenderer(options),
    create_ssr_renderer: (): RenderRootRenderer<VNode> => deps.createSsrRenderer(),
    create_canvas_renderer: (options?: TCanvasRendererOptions): RenderRootRenderer<VNode> => deps.createCanvasRenderer(options),
    create_terminal_renderer: (): RenderRootRenderer<VNode> => deps.createTerminalRenderer(),
    render_to_string: (node: VNode): string => deps.renderToString(node),
    render_to_terminal: (node: VNode): string => deps.renderToTerminal(node),
    create_root: (renderer: unknown, container: unknown): TRenderRoot =>
      new deps.RenderRoot(deps.coerceRenderer(renderer), container),
    mount: (renderer: unknown, container: unknown, node: VNode): TRenderRoot | TRenderError => {
      if (container == null) return deps.renderError('Render container is required');
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.mount(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    },
    hydrate: (renderer: unknown, container: unknown, node: VNode): TRenderRoot | TRenderError => {
      if (container == null) return deps.renderError('Render container is required');
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.hydrate(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    },
    mount_reactive: (renderer: unknown, container: unknown, view: () => VNode): TReactiveRoot =>
      deps.mountReactiveView(renderer, container, view),
    hydrate_reactive: (renderer: unknown, container: unknown, view: () => VNode): TReactiveRoot =>
      deps.hydrateReactiveView(renderer, container, view),
    mount_app: <P>(
      renderer: unknown,
      container: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => deps.appRuntime.mountReactiveApp(renderer, container, componentFn, props),
    hydrate_app: <P>(
      renderer: unknown,
      container: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot => deps.appRuntime.hydrateReactiveApp(renderer, container, componentFn, props),
    testing_create_dom_harness: (): TestingDomHarness => deps.appRuntime.testingFacade.testing_create_dom_harness(),
    testing_mount_app: <P>(
      harness: TestingDomHarness,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot =>
      deps.appRuntime.testingFacade.testing_mount_app(
        harness,
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        props
      ),
    testing_hydrate_app: <P>(
      harness: TestingDomHarness,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      props: P
    ): TReactiveRoot =>
      deps.appRuntime.testingFacade.testing_hydrate_app(
        harness,
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        props
      ),
    testing_container: (harness: unknown): unknown => deps.appRuntime.testingFacade.testing_container(harness),
    testing_body: (harness: unknown): unknown => deps.appRuntime.testingFacade.testing_body(harness),
    testing_get_by_id: (harness: unknown, id: string): unknown =>
      deps.appRuntime.testingFacade.testing_get_by_id(harness, id),
    testing_get_by_text: (scope: unknown, value: string): unknown =>
      deps.appRuntime.testingFacade.testing_get_by_text(scope, value),
    testing_query_all_by_role: (scope: unknown, role: string): unknown =>
      deps.appRuntime.testingFacade.testing_query_all_by_role(scope, role),
    testing_text_content: (node: unknown): string => deps.appRuntime.testingFacade.testing_text_content(node),
    testing_click: (node: unknown): void => deps.appRuntime.testingFacade.testing_click(node),
    testing_input: (node: unknown, value: string): void => deps.appRuntime.testingFacade.testing_input(node, value),
    testing_change_checked: (node: unknown, checked: boolean): void =>
      deps.appRuntime.testingFacade.testing_change_checked(node, checked),
    testing_keydown: (node: unknown, key: string, shiftKey?: boolean): void =>
      deps.appRuntime.testingFacade.testing_keydown(node, key, shiftKey),
    testing_submit: (node: unknown): void => deps.appRuntime.testingFacade.testing_submit(node),
    testing_flush: (): Promise<void> => deps.appRuntime.testingFacade.testing_flush(),
    testing_wait_for: (check: () => unknown, attempts?: number): Promise<unknown> => deps.appRuntime.testingFacade.testing_wait_for(check, attempts),
    mount_custom_element: <P>(
      host: unknown,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      options?: CustomElementMountOptions<P>
    ): CustomElementController<P, TReactiveRoot, Signal<P>> =>
      deps.appRuntime.mountCustomElementInternal(
        host,
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        options as CustomElementMountOptions<unknown> | undefined
      ) as unknown as CustomElementController<P, TReactiveRoot, Signal<P>>,
    define_custom_element: <P>(
      tagName: string,
      componentFn: ComponentFunction<P, ComponentRenderable>,
      options?: CustomElementMountOptions<P>
    ): new () => unknown =>
      deps.appRuntime.defineCustomElementInternal(
        tagName,
        componentFn as ComponentFunction<unknown, ComponentRenderable>,
        options as CustomElementMountOptions<unknown> | undefined
      ),
    update: (root: unknown, node: VNode): void => {
      if (!root || typeof root !== 'object') return;
      if (typeof (root as { update?: unknown }).update !== 'function') return;
      try {
        (root as { update: (next: VNode) => void }).update(node);
      } catch {
        // Keep stale/invalid handles idempotent.
      }
    },
    unmount: (root: unknown): void => {
      if (!isUnmountableLike(root)) return;
      try {
        root.unmount();
      } catch {
        // Keep stale/invalid handles idempotent.
      }
    },
    dispose_reactive: (root: unknown): void => {
      if (!isDisposableLike(root)) return;
      try {
        root.dispose();
      } catch {
        // Keep stale/invalid handles idempotent.
      }
    },
  };

  return render;
};
