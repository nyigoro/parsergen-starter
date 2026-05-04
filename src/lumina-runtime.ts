import { FrameManager, type ComponentFunction } from './frame-manager.js';
import { createAppRuntime } from './runtime/app-runtime.js';
import {
  createDevtoolsController,
  snapshotComponentFrame,
  type DevtoolsResourceSnapshot,
} from './runtime/devtools.js';
import { createBrowserRuntime } from './runtime/browser-runtime.js';
import { createChannelRuntime, Receiver, Sender } from './runtime/channel-runtime.js';
import { createAlgebraRuntime } from './runtime/algebra-runtime.js';
import {
  BTreeMap,
  BTreeSet,
  Deque,
  HashMap,
  HashSet,
  PriorityQueue,
  Vec,
  all_vec,
  any_vec,
  btreemap,
  btreeset,
  chunk_vec,
  configureCollectionsRuntime,
  count_q,
  count_vec,
  deque,
  enumerate_vec,
  filter_option,
  filter_vec,
  find_vec,
  first_q,
  flat_map_vec,
  flatten_vec,
  group_by_q,
  group_by_vec,
  hashset,
  hashmap,
  intersperse_vec,
  iter,
  join_all,
  join_q,
  join_vec,
  limit_q,
  list,
  map_vec,
  offset_q,
  order_by_desc_q,
  order_by_q,
  partition_vec,
  priority_queue,
  query,
  reverse_vec,
  select_q,
  skip_vec,
  sort_by_desc_vec,
  sort_by_vec,
  sort_vec,
  sum_vec,
  sum_vec_f64,
  take_vec,
  timeout,
  to_vec_q,
  unique_vec,
  vec,
  where_q,
  window_vec,
  zip_vec,
} from './runtime/collections-runtime.js';
import {
  __lumina_array_bounds_check,
  __lumina_array_literal,
  __lumina_fixed_array,
  __set,
  __lumina_range,
  __lumina_slice,
  createCoreRuntime,
  LuminaPanic,
} from './runtime/core-runtime.js';
import {
  AtomicI32,
  createConcurrencyRuntime,
  Thread,
  ThreadHandle,
} from './runtime/concurrency-runtime.js';
import {
  createDomRenderer as createDomRendererBase,
  type DomDocumentLike,
  type DomRendererOptions,
} from './runtime/dom-renderer.js';
import { createFrameRuntime } from './runtime/frame-runtime.js';
import { createHeadlessPrimitivesRuntime } from './runtime/headless-primitives-runtime.js';
import { createSystemRuntime } from './runtime/system-runtime.js';
import {
  isDisposableLike,
  ReactiveRenderRoot as ReactiveRenderRootBase,
  RenderRoot as RenderRootBase,
} from './runtime/render-core.js';
import {
  configureReactiveCore,
  Effect,
  Memo,
  Signal,
  type ReactiveCleanup,
} from './runtime/reactive-core.js';
import { mergeProps } from './runtime/props-core.js';
import { createHeadlessUiRuntime } from './runtime/headless-ui-runtime.js';
import {
  configureResourceCore,
  listResourceRecords,
  ResourceHandle,
} from './runtime/resource-core.js';
import { createRootRuntime } from './runtime/root-runtime.js';
import { createRenderApi } from './runtime/render-api.js';
import { createTransitionRuntime } from './runtime/transition-runtime.js';
import { createWebGpuRuntime } from './runtime/webgpu-runtime.js';
import {
  createRenderTargetsRuntime,
  type CanvasRendererOptions,
} from './runtime/render-targets.js';
import {
  applyVNodeKey,
  coerceRenderableToVNode,
  forListHostProps,
  indexListHostProps,
  isVNode,
  materializeForListChildren,
  materializeIndexListChildren,
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
} from './runtime/vnode-core.js';
import {
  dirnamePathBasic,
  getNodeBuiltinModule,
  resolvePathBasic,
} from './runtime/node-platform.js';
import { createSsrRuntime, escapeHtml } from './runtime/ssr-renderer.js';
import {
  __lumina_clone,
  __lumina_debug,
  __lumina_eq,
  __lumina_register_trait_impl,
  __lumina_stringify,
  __lumina_struct,
  formatValue,
  getEnumPayload,
  getEnumTag,
  isEnumLike,
  runtimeEquals,
  type FormatOptions,
  type LuminaEnumLike,
} from './runtime/value-runtime.js';

export { Effect, Memo, Signal };
export { ResourceHandle };
export type { ReactiveCleanup };
export type { FormatOptions, LuminaEnumLike };
export {
  __lumina_clone,
  __lumina_debug,
  __lumina_eq,
  __lumina_register_trait_impl,
  __lumina_stringify,
  __lumina_struct,
  formatValue,
};
export {
  __lumina_array_bounds_check,
  __lumina_array_literal,
  __lumina_fixed_array,
  __set,
  __lumina_range,
  __lumina_slice,
  LuminaPanic,
};
export {
  BTreeMap,
  BTreeSet,
  Deque,
  HashMap,
  HashSet,
  PriorityQueue,
  Vec,
  all_vec,
  any_vec,
  btreemap,
  btreeset,
  chunk_vec,
  count_q,
  count_vec,
  deque,
  enumerate_vec,
  filter_option,
  filter_vec,
  find_vec,
  first_q,
  flat_map_vec,
  flatten_vec,
  group_by_q,
  group_by_vec,
  hashmap,
  hashset,
  intersperse_vec,
  iter,
  join_all,
  join_q,
  join_vec,
  limit_q,
  list,
  map_vec,
  offset_q,
  order_by_desc_q,
  order_by_q,
  partition_vec,
  priority_queue,
  query,
  reverse_vec,
  select_q,
  skip_vec,
  sort_by_desc_vec,
  sort_by_vec,
  sort_vec,
  sum_vec,
  sum_vec_f64,
  take_vec,
  timeout,
  to_vec_q,
  unique_vec,
  vec,
  where_q,
  window_vec,
  zip_vec,
};
export {
  isVNode,
  parseVNode,
  serializeVNode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeKeyed,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
};
export type { ComponentRenderable, VNode, VNodeInput };

const coreRuntime = createCoreRuntime({
  formatValue,
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

export const __lumina_index = coreRuntime.__lumina_index;
export const Option = coreRuntime.Option;
export const Result = coreRuntime.Result;

const systemRuntime = createSystemRuntime({
  formatValue,
  getOption: () => Option,
  getResult: () => Result,
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

configureCollectionsRuntime({
  getOption: () => Option,
  timeSleep: (ms: number) => systemRuntime.time.sleep(ms),
});

export const toJsonString = systemRuntime.toJsonString;
export const io = systemRuntime.io;
export const str = systemRuntime.str;
export const math = systemRuntime.math;
export const opfs = systemRuntime.opfs;
export const fs = systemRuntime.fs;
export const path = systemRuntime.path;
export const env = systemRuntime.env;
export const process = systemRuntime.process;
export const json = systemRuntime.json;
export const http = systemRuntime.http;
export const time = systemRuntime.time;
export const regex = systemRuntime.regex;
export const crypto = systemRuntime.crypto;

export const channel = createChannelRuntime({
  getOption: () => Option,
  getResult: () => Result,
  isEnumLike,
  getEnumTag,
});

export const async_channel = channel;

const concurrencyRuntime = createConcurrencyRuntime({
  getOption: () => Option,
  getResult: () => Result,
  getChannel: () => channel,
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

export { AtomicI32, Thread, ThreadHandle };
export { Receiver, Sender };
export const sync = concurrencyRuntime.sync;
export const sab_channel = concurrencyRuntime.sab_channel;
export const thread = concurrencyRuntime.thread;
export const web_worker = concurrencyRuntime.web_worker;
export const web_streams = concurrencyRuntime.web_streams;

const browserRuntime = createBrowserRuntime({
  optionSome: (value) => Option.Some(value),
  optionNone: Option.None,
  resultOk: (value) => Result.Ok(value),
  resultErr: (message) => Result.Err(message),
  createHashMap: <K, V>() => HashMap.new<K, V>(),
});

export const url = browserRuntime.url;
export const web_storage = browserRuntime.web_storage;
export const dom = browserRuntime.dom;
export const router = browserRuntime.router;

export const webgpu = createWebGpuRuntime({
  resultOk: (value: unknown) => Result.Ok(value),
  resultErr: (message: string) => Result.Err(message),
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

const runMicrotask = (fn: () => void): void => {
  const queue = (globalThis as { queueMicrotask?: (cb: () => void) => void }).queueMicrotask;
  if (typeof queue === 'function') {
    queue(fn);
    return;
  }
  Promise.resolve().then(fn);
};

const devtools = createDevtoolsController<ReactiveRenderRoot, VNode | null>({
  scheduleMicrotask: runMicrotask,
  snapshotRoot: (root, id) => ({
    id,
    current: root.root.currentNode(),
    frames: [
      ...Array.from(root.frameManager.rootFrame.keyedChildren.values()).map(snapshotComponentFrame),
      ...root.frameManager.rootFrame.unkeyedChildren.map(snapshotComponentFrame),
    ],
  }),
  snapshotResources: () =>
    listResourceRecords().map(
      (record): DevtoolsResourceSnapshot => ({
        key: record.key,
        status: record.status.peek(),
        hasData: record.hasData.peek(),
        error: record.error.peek(),
      })
    ),
});

const registerDevtoolsSignal = (
  kind: 'signal' | 'memo',
  signal: Signal<unknown> | Memo<unknown>
): number => devtools.registerSignal(kind, signal);

const unregisterDevtoolsSignal = (id: number): void => {
  devtools.unregisterSignal(id);
};

const scheduleDevtoolsNotify = (): void => {
  devtools.scheduleNotify();
};

configureReactiveCore({
  cloneValue: __lumina_clone,
  equalsValue: runtimeEquals,
  scheduleMicrotask: runMicrotask,
  registerSignal: registerDevtoolsSignal,
  unregisterSignal: unregisterDevtoolsSignal,
  notifyDevtools: scheduleDevtoolsNotify,
});

configureResourceCore({
  serializeKey: (key) => {
    try {
      return toJsonString(key, false);
    } catch {
      return String(key);
    }
  },
  notifyDevtools: scheduleDevtoolsNotify,
});
export interface Renderer {
  mount: (node: VNode, container: unknown) => void;
  patch?: (prev: VNode | null, next: VNode, container: unknown) => void;
  hydrate?: (node: VNode, container: unknown) => void;
  unmount?: (container: unknown) => void;
}
export const createDomRenderer = (options?: DomRendererOptions): Renderer =>
  createDomRendererBase(options, runtimeEquals);

const ssrRuntime = createSsrRuntime<VNode>({
  normalizeNodeForHtml: (node) => {
    if (node.kind === 'index_list') {
      return vnodeElement(
        'lumina-index-list',
        indexListHostProps,
        materializeIndexListChildren(node, false)
      );
    }
    if (node.kind === 'for_list') {
      return vnodeElement(
        'lumina-for-list',
        forListHostProps,
        materializeForListChildren(node, false)
      );
    }
    return node;
  },
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getKey: (node) => node.key,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
  getTarget: (node) => node.target,
});

export const createSsrRenderer = (): Renderer => ssrRuntime.createRenderer();

export const renderToString = (node: VNode): string => ssrRuntime.renderToString(node);

const renderTargetsRuntime = createRenderTargetsRuntime<VNode>({
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
  materializeIndexListChildren: (node, tracked) => materializeIndexListChildren(node, tracked),
  materializeForListChildren: (node, tracked) => materializeForListChildren(node, tracked),
});

const frameRuntime = createFrameRuntime<VNode, Signal<unknown>>({
  coerceRenderable: (input) => coerceRenderableToVNode(input as VNodeInput),
  createState: <T>(initial: T): Signal<T> => new Signal<T>(initial),
});

const transitionRuntime = createTransitionRuntime<VNode, VNode[]>({
  state: <T>(initial: T): Signal<T> => frameRuntime.state(initial) as Signal<T>,
  remember: frameRuntime.remember,
  mergeProps,
  element: vnodeElement,
  fragment: vnodeFragment,
  resolveChildrenInput: (children) => normalizeVNodeChildren(resolveChildrenInput(children)),
  runMicrotask,
});

const runWithFrameManager = frameRuntime.runWithFrameManager;

export const createCanvasRenderer = (options?: CanvasRendererOptions): Renderer =>
  renderTargetsRuntime.createCanvasRenderer(options);

export const renderToTerminal = (node: VNode): string =>
  renderTargetsRuntime.renderToTerminal(node);

export const createTerminalRenderer = (): Renderer => renderTargetsRuntime.createTerminalRenderer();

export class RenderRoot extends RenderRootBase<VNode> {}

export class ReactiveRenderRoot extends ReactiveRenderRootBase<
  VNode,
  FrameManager['rootFrame'],
  FrameManager
> {
  constructor(
    readonly root: RenderRoot,
    readonly effect: Effect,
    readonly frameManager: FrameManager
  ) {
    super(root, effect, frameManager, {
      onInit: (root) => registerDevtoolsRoot(root as ReactiveRenderRoot),
      onDispose: (root) => unregisterDevtoolsRoot(root as ReactiveRenderRoot),
    });
  }
}
const registerDevtoolsRoot = (root: ReactiveRenderRoot): void => void devtools.registerRoot(root);
const unregisterDevtoolsRoot = (root: ReactiveRenderRoot): void => devtools.unregisterRoot(root);

const toRenderErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Canvas renderer requires')) {
    return 'Canvas renderer not available in this environment';
  }
  if (message.includes('Terminal renderer')) {
    return 'Terminal renderer not available in this environment';
  }
  return message;
};

const rootRuntime = createRootRuntime<
  VNode,
  RenderRoot,
  FrameManager,
  ReactiveRenderRoot | { $tag: string; $payload?: unknown },
  { $tag: string; $payload?: unknown }
>({
  createRenderRoot: (renderer, container) => new RenderRoot(renderer, container),
  createFrameManager: () => new FrameManager(),
  runWithFrameManager,
  createReactiveRoot: (root, effect, frameManager) =>
    new ReactiveRenderRoot(root, effect, frameManager),
  renderError: (message) => Result.Err(message),
  toRenderErrorMessage,
});

const coerceRenderer = (candidate: unknown): Renderer => rootRuntime.coerceRenderer(candidate);

const mountReactiveView = (
  renderer: unknown,
  container: unknown,
  view: () => VNode
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  rootRuntime.mountReactiveView(renderer, container, view);

const hydrateReactiveView = (
  renderer: unknown,
  container: unknown,
  view: () => VNode
): ReactiveRenderRoot | { $tag: string; $payload?: unknown } =>
  rootRuntime.hydrateReactiveView(renderer, container, view);

const appRuntime = createAppRuntime<
  ComponentRenderable,
  VNode,
  ReactiveRenderRoot | { $tag: string; $payload?: unknown },
  Signal<unknown>,
  Renderer,
  DomDocumentLike,
  FrameManager
>({
  createFrameManager: () => new FrameManager(),
  runWithFrameManager,
  component: <P>(componentFn: ComponentFunction<P, ComponentRenderable>, props: P): VNode =>
    applyVNodeKey(frameRuntime.component(componentFn, props), undefined),
  createDomRenderer: (options) => createDomRenderer(options),
  mountReactive: mountReactiveView,
  hydrateReactive: hydrateReactiveView,
  createSignal: (initial: unknown): Signal<unknown> => new Signal(initial),
  getSignal: (signal: Signal<unknown>): unknown => signal.get(),
  setSignal: (signal: Signal<unknown>, value: unknown): void => {
    signal.set(value);
  },
  isDisposableLike,
  disposeReactive: (root) => {
    if (!isDisposableLike(root)) return;
    root.dispose();
  },
  getGlobalDocument: () => (globalThis as unknown as { document?: DomDocumentLike }).document,
  isVNode,
  renderToString,
  coerceRenderableToVNode: (value) => coerceRenderableToVNode(value as VNodeInput),
  escapeHtml,
  resolvePath: resolvePathBasic,
  dirnamePath: dirnamePathBasic,
  getNodeBuiltinModule,
});

const headlessUi = createHeadlessUiRuntime();

const headlessPrimitiveRender = createHeadlessPrimitivesRuntime({
  requireActiveFrameManager: frameRuntime.requireActiveFrameManager,
  headlessUi,
});

export const render = createRenderApi<
  RenderRoot,
  ReactiveRenderRoot | { $tag: string; $payload?: unknown },
  { $tag: string; $payload?: unknown },
  DomRendererOptions,
  CanvasRendererOptions
>({
  frameRuntime,
  transitionRuntime,
  appRuntime,
  headlessPrimitiveRender,
  renderToString,
  renderToTerminal,
  createDomRenderer,
  createSsrRenderer,
  createCanvasRenderer,
  createTerminalRenderer,
  coerceRenderer,
  RenderRoot,
  mountReactiveView,
  hydrateReactiveView,
  renderError: (message) => Result.Err(message),
  toRenderErrorMessage,
  snapshotDevtools: () => devtools.snapshot(),
  installLuminaDevtools: (key) => devtools.install(key),
  recordDevtoolsEvent: (type, label, detail) => devtools.recordEvent(type, label, detail),
  readDevtoolsTimeline: () => devtools.timeline(),
  clearDevtoolsTimeline: () => devtools.clearTimeline(),
  scheduleDevtoolsNotify,
});

const renderSurface = {
  createSignal: render.signal,
  get: render.get,
  set: render.set,
  createMemo: render.memo,
  createEffect: render.effect,
  batch: render.batch,
  untrack: render.untrack,
  component: render.component,
  component_keyed: render.component_keyed,
  renderApp: render.render_app,
  renderToStringApp: render.render_to_string_app,
  createContext: render.create_context,
  create_required_context: render.create_required_context,
  withContext: render.with_context,
  useContext: render.use_context,
  state: render.state,
  remember: render.remember,
  createResource: render.resource_create,
  resourceStatus: render.resource_status,
  resourceData: render.resource_data,
  resourceError: render.resource_error,
  resourceRead: render.resource_read,
  resourceRefresh: render.resource_refresh,
  resourceInvalidate: render.resource_invalidate,
  resourceMutate: render.resource_mutate,
  suspense: render.suspense,
  errorBoundary: render.error_boundary,
  show: render.show,
  mountApp: render.mount_app,
  hydrateApp: render.hydrate_app,
  testingCreateDomHarness: render.testing_create_dom_harness,
  testingMountApp: render.testing_mount_app,
  testingHydrateApp: render.testing_hydrate_app,
  testingContainer: render.testing_container,
  testingBody: render.testing_body,
  testingGetById: render.testing_get_by_id,
  testingTextContent: render.testing_text_content,
  testingClick: render.testing_click,
  testingInput: render.testing_input,
  testingChangeChecked: render.testing_change_checked,
  testingKeydown: render.testing_keydown,
  testingSubmit: render.testing_submit,
  mountCustomElement: render.mount_custom_element,
  defineCustomElement: render.define_custom_element,
  children: render.children,
  slot: render.slot,
  slot_or: render.slot_or,
  compose_handlers: render.compose_handlers,
  portal: render.portal,
  portalBody: render.portal_body,
  tabsRoot: render.tabs_root,
  tabsList: render.tabs_list,
  tabsTrigger: render.tabs_trigger,
  tabsPanel: render.tabs_panel,
  dialogRoot: render.dialog_root,
  dialogPortal: render.dialog_portal,
  dialogTrigger: render.dialog_trigger,
  dialogOverlay: render.dialog_overlay,
  dialogContent: render.dialog_content,
  dialogTitle: render.dialog_title,
  dialogDescription: render.dialog_description,
  dialogClose: render.dialog_close,
  popoverRoot: render.popover_root,
  popoverPortal: render.popover_portal,
  popoverTrigger: render.popover_trigger,
  popoverContent: render.popover_content,
  tooltipRoot: render.tooltip_root,
  tooltipPortal: render.tooltip_portal,
  tooltipTrigger: render.tooltip_trigger,
  tooltipContent: render.tooltip_content,
  toastRoot: render.toast_root,
  toastPortal: render.toast_portal,
  toastContent: render.toast_content,
  toastTitle: render.toast_title,
  toastDescription: render.toast_description,
  toastClose: render.toast_close,
  menuRoot: render.menu_root,
  menuPortal: render.menu_portal,
  menuTrigger: render.menu_trigger,
  menuContent: render.menu_content,
  menuItem: render.menu_item,
  selectRoot: render.select_root,
  selectPortal: render.select_portal,
  selectTrigger: render.select_trigger,
  selectContent: render.select_content,
  selectItem: render.select_item,
  selectIndicator: render.select_indicator,
  comboboxRoot: render.combobox_root,
  comboboxPortal: render.combobox_portal,
  comboboxInput: render.combobox_input,
  comboboxContent: render.combobox_content,
  comboboxItem: render.combobox_item,
  comboboxIndicator: render.combobox_indicator,
  multiselectRoot: render.multiselect_root,
  multiselectPortal: render.multiselect_portal,
  multiselectTrigger: render.multiselect_trigger,
  multiselectContent: render.multiselect_content,
  multiselectItem: render.multiselect_item,
  multiselectIndicator: render.multiselect_indicator,
  checkboxRoot: render.checkbox_root,
  checkboxIndicator: render.checkbox_indicator,
  radioGroup: render.radio_group,
  radioItem: render.radio_item,
  radioIndicator: render.radio_indicator,
  vnode: render.element,
  text: render.text,
  liveText: render.liveText,
  indexList: render.indexList,
  forList: render.forList,
  keyed: render.keyed,
  key: render.key,
  mount_reactive: render.mount_reactive,
  props_empty: render.props_empty,
  props_class: render.props_class,
  props_on_click: render.props_on_click,
  props_on_click_delta: render.props_on_click_delta,
  props_on_click_inc: render.props_on_click_inc,
  props_on_click_dec: render.props_on_click_dec,
  props_id: render.props_id,
  props_style: render.props_style,
  props_value: render.props_value,
  props_checked: render.props_checked,
  props_type: render.props_type,
  props_name: render.props_name,
  props_placeholder: render.props_placeholder,
  props_href: render.props_href,
  props_disabled: render.props_disabled,
  props_on_input: render.props_on_input,
  props_on_change: render.props_on_change,
  props_on_checked_change: render.props_on_checked_change,
  props_on_submit: render.props_on_submit,
  props_key: render.props_key,
  props_attr: render.props_attr,
  props_when: render.props_when,
  props_merge: render.props_merge,
  dom_get_element_by_id: render.dom_get_element_by_id,
  transitionPresence: render.transition_presence,
  testingGetByText: render.testing_get_by_text,
  testingGetByRole: render.testingGetByRole,
  testingQueryAllByRole: render.testing_query_all_by_role,
  devtoolsSnapshot: render.devtools_snapshot,
  installDevtools: render.install_devtools,
  ssgPage: render.ssg_page,
  ssgRenderApp: render.ssg_render_app,
  ssgWritePage: render.ssg_write_page,
  ssgWriteApp: render.ssg_write_app,
};

export const {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  batch,
  untrack,
  component,
  component_keyed,
  renderApp,
  renderToStringApp,
  createContext,
  create_required_context,
  withContext,
  useContext,
  state,
  remember,
  createResource,
  resourceStatus,
  resourceData,
  resourceError,
  resourceRead,
  resourceRefresh,
  resourceInvalidate,
  resourceMutate,
  suspense,
  errorBoundary,
  show,
  mountApp,
  hydrateApp,
  testingCreateDomHarness,
  testingMountApp,
  testingHydrateApp,
  testingContainer,
  testingBody,
  testingGetById,
  testingTextContent,
  testingClick,
  testingInput,
  testingChangeChecked,
  testingKeydown,
  testingSubmit,
  mountCustomElement,
  defineCustomElement,
  children,
  slot,
  slot_or,
  compose_handlers,
  portal,
  portalBody,
  tabsRoot,
  tabsList,
  tabsTrigger,
  tabsPanel,
  dialogRoot,
  dialogPortal,
  dialogTrigger,
  dialogOverlay,
  dialogContent,
  dialogTitle,
  dialogDescription,
  dialogClose,
  popoverRoot,
  popoverPortal,
  popoverTrigger,
  popoverContent,
  tooltipRoot,
  tooltipPortal,
  tooltipTrigger,
  tooltipContent,
  toastRoot,
  toastPortal,
  toastContent,
  toastTitle,
  toastDescription,
  toastClose,
  menuRoot,
  menuPortal,
  menuTrigger,
  menuContent,
  menuItem,
  selectRoot,
  selectPortal,
  selectTrigger,
  selectContent,
  selectItem,
  selectIndicator,
  comboboxRoot,
  comboboxPortal,
  comboboxInput,
  comboboxContent,
  comboboxItem,
  comboboxIndicator,
  multiselectRoot,
  multiselectPortal,
  multiselectTrigger,
  multiselectContent,
  multiselectItem,
  multiselectIndicator,
  checkboxRoot,
  checkboxIndicator,
  radioGroup,
  radioItem,
  radioIndicator,
  vnode,
  text,
  liveText,
  indexList,
  forList,
  keyed,
  key,
  mount_reactive,
  props_empty,
  props_class,
  props_on_click,
  props_on_click_delta,
  props_on_click_inc,
  props_on_click_dec,
  props_id,
  props_style,
  props_value,
  props_checked,
  props_type,
  props_name,
  props_placeholder,
  props_href,
  props_disabled,
  props_on_input,
  props_on_change,
  props_on_checked_change,
  props_on_submit,
  props_key,
  props_attr,
  props_when,
  props_merge,
  dom_get_element_by_id,
  transitionPresence,
  testingGetByText,
  testingGetByRole,
  testingQueryAllByRole,
  devtoolsSnapshot,
  installDevtools,
  ssgPage,
  ssgRenderApp,
  ssgWritePage,
  ssgWriteApp,
} = renderSurface;

export const reactive = {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  disposeEffect: render.dispose_effect,
  updateSignal: render.update_signal,
  batch: render.batch,
  untrack: render.untrack,
};

const algebraRuntime = createAlgebraRuntime({
  Option,
  Result,
  isEnumLike,
  getEnumTag,
  getEnumPayload,
});

export const functor = algebraRuntime.functor;
export const applicative = algebraRuntime.applicative;
export const monad = algebraRuntime.monad;
export const foldable = algebraRuntime.foldable;
export const traversable = algebraRuntime.traversable;
