import { findFirstFocusableDescendant, getDomAttribute, isElementHidden, readChildNodes } from './dom-accessibility.js';
import {
  analyzeSequenceTransition,
  findStableSequenceWindow,
  getTransitionAffectedRange,
  reorderChildren,
  type KeyedListTransition,
  type ReorderableDomNodeLike,
} from './dom-reconciler.js';
import { batch as batchReactive, Effect, Signal } from './reactive-core.js';
import type { RenderRootRenderer } from './render-core.js';
import {
  applyVNodeKey,
  coerceListKey,
  coerceRenderableToVNode,
  forListHostProps,
  indexListHostProps,
  readIndexListValues,
  vnodePortal,
  type VNode,
  type VNodeInput,
} from './vnode-core.js';

interface DomEventTargetLike {
  addEventListener?: (event: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (event: unknown) => void) => void;
}

export interface DomNodeLike extends ReorderableDomNodeLike, DomEventTargetLike {
  textContent: string | null;
  childNodes: ArrayLike<DomNodeLike> & Iterable<DomNodeLike>;
  parentNode: DomNodeLike | null;
  appendChild: (node: DomNodeLike) => DomNodeLike;
  insertBefore?: (node: DomNodeLike, referenceNode: DomNodeLike | null) => DomNodeLike;
  removeChild: (node: DomNodeLike) => DomNodeLike;
  replaceChild?: (newChild: DomNodeLike, oldChild: DomNodeLike) => DomNodeLike;
  __luminaIndexListEffect?: Effect | null;
  __luminaIndexListSource?: Signal<unknown> | null;
  __luminaIndexListRender?: ((item: Signal<unknown>, index: number) => VNodeInput) | null;
  __luminaForListEffect?: Effect | null;
  __luminaForListSource?: Signal<unknown> | null;
  __luminaForListKey?: ((item: unknown, index: number) => string | number) | null;
  __luminaForListRender?: ((item: Signal<unknown>, index: Signal<number>) => VNodeInput) | null;
}

export interface DomElementLike extends DomNodeLike {
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
  getAttribute?: (name: string) => string | null;
  ownerDocument?: { activeElement?: unknown };
  className?: string;
  style?: Record<string, unknown> & { setProperty?: (name: string, value: string) => void };
  tagName?: string;
  focus?: () => void;
  blur?: () => void;
  getBoundingClientRect?: () => {
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    width?: number;
    height?: number;
  };
}

export interface DomDocumentLike {
  createElement: (tag: string) => DomElementLike;
  createTextNode: (value: string) => DomNodeLike;
  body?: DomElementLike;
  querySelector?: (selector: string) => DomElementLike | null;
  getElementById?: (id: string) => DomElementLike | null;
}

interface DomTemplateLike extends DomElementLike {
  innerHTML?: string;
  content?: {
    childNodes?: DomNodeLike[];
    cloneNode?: (deep?: boolean) => DomNodeLike;
  };
}

export interface DomRendererOptions {
  document?: DomDocumentLike;
}

type DomEventMap = Record<string, (event: unknown) => void>;
type DomEventStore = Map<DomNodeLike, DomEventMap>;
type DomLiveTextStore = WeakMap<DomNodeLike, Effect>;
interface DomPortalState {
  target: DomElementLike | null;
  host: DomElementLike | null;
}
type DomPortalStore = WeakMap<DomNodeLike, DomPortalState>;
type DomModalInertStore = WeakMap<DomElementLike, DomElementLike[]>;
type DomInertCountStore = WeakMap<DomElementLike, number>;
type DomInertStateStore = WeakMap<DomElementLike, { hadAttribute: boolean; previousValue: unknown }>;

const domTemplateCache = new WeakMap<DomDocumentLike, Map<string, DomTemplateLike>>();
const dialogModalInertTargets: DomModalInertStore = new WeakMap();
const inertCounts: DomInertCountStore = new WeakMap();
const inertStates: DomInertStateStore = new WeakMap();

const getDomDocument = (options?: DomRendererOptions): DomDocumentLike => {
  if (options?.document) return options.document;
  const doc = (globalThis as unknown as { document?: DomDocumentLike }).document;
  if (!doc) {
    throw new Error('DOM renderer requires a document-like object');
  }
  return doc;
};

const asDomChildren = (node: VNode): VNode[] => node.children ?? [];

type FingerprintedVNode = VNode & {
  __luminaPatchFingerprint?: string | null;
};

const serializeFingerprintProps = (
  props: Record<string, unknown> | undefined
): string | null => {
  if (!props) {
    return '';
  }

  let out = '';
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key) || key === 'key') {
      continue;
    }
    const value = props[key];
    if (
      value !== null
      && value !== undefined
      && typeof value !== 'string'
      && typeof value !== 'number'
      && typeof value !== 'boolean'
    ) {
      return null;
    }
    out += `|${key}:${String(value ?? '')}`;
  }
  return out;
};

const getStablePatchFingerprint = (node: VNode): string | null => {
  const fingerprinted = node as FingerprintedVNode;
  if (fingerprinted.__luminaPatchFingerprint !== undefined) {
    return fingerprinted.__luminaPatchFingerprint;
  }

  let fingerprint: string | null = null;
  if (node.kind === 'text') {
    fingerprint = `t:${node.text ?? ''}`;
  } else if (node.kind === 'element' || node.kind === 'fragment') {
    const children = asDomChildren(node);
    if (children.length <= 6) {
      const propsFingerprint =
        node.kind === 'element'
          ? serializeFingerprintProps(node.props)
          : '';
      if (propsFingerprint !== null) {
        const head =
          node.kind === 'element'
            ? `e:${node.tag ?? ''}:${String(node.key ?? '')}${propsFingerprint}`
            : `f:${String(node.key ?? '')}`;
        let composed = head;
        for (const child of children) {
          const childFingerprint = getStablePatchFingerprint(child);
          if (childFingerprint === null) {
            composed = '';
            break;
          }
          composed += `[${childFingerprint}]`;
        }
        fingerprint = composed === '' ? null : composed;
      }
    }
  }

  fingerprinted.__luminaPatchFingerprint = fingerprint;
  return fingerprint;
};

const isEventProp = (name: string): boolean => /^on[A-Z]/.test(name);
const isForcedAttributeProp = (name: string): boolean =>
  name === 'role' || name.startsWith('aria-') || name.startsWith('data-');
const isHiddenPropValue = (value: unknown): boolean => value === true || value === 'true';
const isPortalHostElement = (node: DomNodeLike | null | undefined): node is DomElementLike =>
  node != null && String((node as DomElementLike).tagName ?? '').toLowerCase() === 'lumina-portal-host';

const isDialogOverlayElement = (node: DomNodeLike | null | undefined): node is DomElementLike =>
  node != null && getDomAttribute(node as DomElementLike, 'data-lumina-dialog-overlay') === 'true';

const isModalDialogElement = (element: DomElementLike): boolean =>
  getDomAttribute(element, 'role') === 'dialog' && getDomAttribute(element, 'aria-modal') === 'true';

const containsDomNode = (root: DomNodeLike, target: DomNodeLike | null | undefined): boolean => {
  if (!target) return false;
  if (root === target) return true;
  for (const child of readChildNodes(root)) {
    if (containsDomNode(child as DomNodeLike, target)) {
      return true;
    }
  }
  return false;
};

const findMarkedDialogInitialFocus = (root: DomNodeLike): DomElementLike | null => {
  for (const child of readChildNodes(root)) {
    const element = child as DomElementLike;
    if (getDomAttribute(element, 'data-lumina-dialog-initial-focus') === 'true') {
      return element;
    }
    const nested = findMarkedDialogInitialFocus(child as DomNodeLike);
    if (nested) {
      return nested;
    }
  }
  return null;
};

const focusInitialDialogTarget = (element: DomElementLike): void => {
  const activeElement = element.ownerDocument?.activeElement as DomNodeLike | null | undefined;
  if (activeElement && activeElement !== element && containsDomNode(element, activeElement)) {
    return;
  }
  const marked = findMarkedDialogInitialFocus(element);
  if (marked?.focus) {
    marked.focus();
    return;
  }
  const firstFocusable = findFirstFocusableDescendant<DomElementLike>(element);
  if (firstFocusable?.focus) {
    firstFocusable.focus();
    return;
  }
  element.focus?.();
};

const setElementInert = (element: DomElementLike, active: boolean): void => {
  const record = element as unknown as Record<string, unknown>;
  if (active) {
    const count = inertCounts.get(element) ?? 0;
    inertCounts.set(element, count + 1);
    if (count > 0) {
      return;
    }
    inertStates.set(element, {
      hadAttribute: getDomAttribute(element, 'inert') !== null,
      previousValue: record.inert,
    });
    if (element.setAttribute) {
      element.setAttribute('inert', '');
    }
    record.inert = true;
    return;
  }

  const count = inertCounts.get(element) ?? 0;
  if (count <= 1) {
    inertCounts.delete(element);
    const previous = inertStates.get(element);
    inertStates.delete(element);
    if (previous?.hadAttribute) {
      if (element.setAttribute) {
        element.setAttribute('inert', '');
      }
    } else if (element.removeAttribute) {
      element.removeAttribute('inert');
    }
    record.inert = previous?.previousValue;
    return;
  }
  inertCounts.set(element, count - 1);
};

const collectModalInertTargets = (dialog: DomElementLike): DomElementLike[] => {
  const parent = dialog.parentNode;
  if (!parent) return [];

  const scopeParent = isPortalHostElement(parent) && parent.parentNode ? parent.parentNode : parent;
  const exempt = new Set<DomNodeLike>();
  if (isPortalHostElement(parent)) {
    exempt.add(parent);
  } else {
    exempt.add(dialog);
  }

  const targets: DomElementLike[] = [];
  for (const sibling of readChildNodes(scopeParent)) {
    const element = sibling as DomElementLike;
    if (exempt.has(sibling as DomNodeLike) || isDialogOverlayElement(sibling as DomNodeLike)) {
      continue;
    }
    targets.push(element);
  }
  return targets;
};

const syncModalDialogInertState = (dialog: DomElementLike, active: boolean): void => {
  const previousTargets = dialogModalInertTargets.get(dialog) ?? [];
  if (!active) {
    for (const target of previousTargets) {
      setElementInert(target, false);
    }
    dialogModalInertTargets.delete(dialog);
    return;
  }

  if (previousTargets.length > 0) {
    return;
  }

  const targets = collectModalInertTargets(dialog);
  for (const target of targets) {
    setElementInert(target, true);
  }
  dialogModalInertTargets.set(dialog, targets);
};

const cloneStaticTemplateElement = (
  documentLike: DomDocumentLike,
  html: string
): DomElementLike | null => {
  let cache = domTemplateCache.get(documentLike);
  if (!cache) {
    cache = new Map<string, DomTemplateLike>();
    domTemplateCache.set(documentLike, cache);
  }

  let template = cache.get(html);
  if (!template) {
    const candidate = documentLike.createElement('template') as DomTemplateLike;
    if (!candidate || typeof candidate !== 'object') return null;
    if (!('innerHTML' in candidate) || !candidate.content || typeof candidate.content.cloneNode !== 'function') {
      return null;
    }
    candidate.innerHTML = html;
    template = candidate;
    cache.set(html, template);
  }

  const clonedContent = template.content?.cloneNode?.(true) as
    | (DomNodeLike & { childNodes?: ArrayLike<DomNodeLike> | Iterable<DomNodeLike> })
    | undefined;
  const rawChildNodes = clonedContent?.childNodes;
  const childNodes =
    rawChildNodes == null
      ? []
      : Array.isArray(rawChildNodes)
        ? rawChildNodes
        : Array.from(rawChildNodes as Iterable<DomNodeLike> | ArrayLike<DomNodeLike>);
  if (childNodes.length !== 1) {
    return null;
  }
  const root = childNodes[0];
  return root && typeof root === 'object' ? (root as DomElementLike) : null;
};

const normalizeEventName = (name: string): string => name.slice(2).toLowerCase();

const setDomStyle = (
  element: DomElementLike,
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): void => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  const style = element.style;
  if (!style) return;

  for (const [key, value] of Object.entries(nxt)) {
    if (prev[key] === value) continue;
    if (style.setProperty) {
      style.setProperty(key, value == null ? '' : String(value));
    } else {
      style[key] = value;
    }
  }

  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (style.setProperty) {
      style.setProperty(key, '');
    } else {
      delete style[key];
    }
  }
};

const setDomProperty = (
  element: DomElementLike,
  name: string,
  value: unknown,
  eventStore: DomEventStore
): void => {
  if (name === 'key') return;

  if (name === 'autoFocus') {
    return;
  }

  if (isEventProp(name)) {
    const event = normalizeEventName(name);
    const map = eventStore.get(element) ?? {};
    const prev = map[event];
    if (prev && element.removeEventListener) {
      element.removeEventListener(event, prev);
    }
    if (typeof value === 'function') {
      const next = value as (event: unknown) => void;
      if (element.addEventListener) {
        element.addEventListener(event, next);
      }
      map[event] = next;
      eventStore.set(element, map);
    } else {
      delete map[event];
      if (Object.keys(map).length === 0) {
        eventStore.delete(element);
      } else {
        eventStore.set(element, map);
      }
    }
    return;
  }

  if (name === 'style' && typeof value === 'object' && value !== null) {
    setDomStyle(element, undefined, value as Record<string, unknown>);
    return;
  }

  if (value === false || value === null || value === undefined) {
    if (element.removeAttribute) element.removeAttribute(name);
    if (!isForcedAttributeProp(name)) {
      (element as unknown as Record<string, unknown>)[name] = value as never;
    }
    return;
  }

  if (isForcedAttributeProp(name) && element.setAttribute) {
    element.setAttribute(name, String(value));
  } else if (name in element) {
    (element as unknown as Record<string, unknown>)[name] = value;
  } else if (element.setAttribute) {
    element.setAttribute(name, String(value));
  } else {
    (element as unknown as Record<string, unknown>)[name] = value;
  }
};

const updateDomProperties = (
  element: DomElementLike,
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
  eventStore: DomEventStore
): void => {
  const prev = previous ?? {};
  const nxt = next ?? {};

  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (key === 'style') {
      setDomStyle(element, prev.style as Record<string, unknown>, undefined);
      continue;
    }
    setDomProperty(element, key, undefined, eventStore);
  }

  for (const [key, value] of Object.entries(nxt)) {
    if (key === 'style') {
      setDomStyle(
        element,
        prev.style as Record<string, unknown> | undefined,
        value as Record<string, unknown> | undefined
      );
      continue;
    }
    if (prev[key] === value) continue;
    setDomProperty(element, key, value, eventStore);
  }

  if (isModalDialogElement(element)) {
    syncModalDialogInertState(element, !isElementHidden(element));
  }

  if (
    nxt.autoFocus
    && (
      prev.autoFocus !== nxt.autoFocus
      || (isModalDialogElement(element) && isHiddenPropValue(prev.hidden) && !isElementHidden(element))
    )
  ) {
    if (!isModalDialogElement(element)) {
      element.focus?.();
    }
  }
};

const setChildren = (container: DomNodeLike, children: DomNodeLike[]): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
    const childElement = child as DomElementLike;
    if (childElement.getAttribute && isModalDialogElement(childElement)) {
      const open = !isElementHidden(childElement);
      syncModalDialogInertState(childElement, open);
      if (open) {
        focusInitialDialogTarget(childElement);
      }
    }
  }
};

const resolvePortalTarget = (node: VNode, documentLike: DomDocumentLike): DomElementLike | null => {
  const target = node.target;
  if (target == null || target === '' || target === 'body') {
    return documentLike.body ?? null;
  }
  if (typeof documentLike.querySelector === 'function') {
    return documentLike.querySelector(String(target));
  }
  return null;
};

const disposeDomNode = (
  node: DomNodeLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  if ((node as DomElementLike).getAttribute && isModalDialogElement(node as DomElementLike)) {
    syncModalDialogInertState(node as DomElementLike, false);
  }
  const liveTextEffect = liveTextStore.get(node);
  if (liveTextEffect) {
    liveTextEffect.dispose();
    liveTextStore.delete(node);
  }
  if (node.__luminaIndexListEffect) {
    node.__luminaIndexListEffect.dispose();
    node.__luminaIndexListEffect = null;
    node.__luminaIndexListSource = null;
    node.__luminaIndexListRender = null;
  }
  if (node.__luminaForListEffect) {
    node.__luminaForListEffect.dispose();
    node.__luminaForListEffect = null;
    node.__luminaForListSource = null;
    node.__luminaForListKey = null;
    node.__luminaForListRender = null;
  }
  const portal = portalStore.get(node);
  if (portal?.host) {
    disposeDomNode(portal.host, eventStore, portalStore, liveTextStore);
    const portalParent = portal.host.parentNode;
    if (portalParent) {
      try {
        portalParent.removeChild(portal.host);
      } catch {
        // Ignore stale/detached portal hosts.
      }
    }
  }
  portalStore.delete(node);

  for (const child of readChildNodes(node)) {
    disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore);
  }

  eventStore.delete(node);
};

const replaceChildren = (
  container: DomNodeLike,
  children: DomNodeLike[],
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore
): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore);
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
    const childElement = child as DomElementLike;
    if (childElement.getAttribute && isModalDialogElement(childElement)) {
      const open = !isElementHidden(childElement);
      syncModalDialogInertState(childElement, open);
      if (open) {
        focusInitialDialogTarget(childElement);
      }
    }
  }
};

const vnodeKindTag = (node: VNode): string => `${node.kind}:${node.tag ?? ''}`;

const hasVNodeKey = (node: VNode): node is VNode & { key: string | number } =>
  typeof node.key === 'string' || typeof node.key === 'number';

const hasKeyedChildren = (children: VNode[]): boolean => children.some((child) => hasVNodeKey(child));

const duplicateKeyError = (key: string | number): Error =>
  new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`);

const areAllChildrenKeyed = (children: VNode[]): children is Array<VNode & { key: string | number }> =>
  children.every((child) => hasVNodeKey(child));

const tryReadTextLeaf = (node: VNode): { kind: 'text'; text: string } | { kind: 'live_text'; signal: unknown } | null => {
  if (node.kind === 'text') {
    return { kind: 'text', text: node.text ?? '' };
  }
  if (node.kind === 'live_text') {
    return { kind: 'live_text', signal: node.signal };
  }
  if (node.kind !== 'element' && node.kind !== 'fragment') {
    return null;
  }
  const children = asDomChildren(node);
  if (children.length !== 1) {
    return null;
  }
  const child = children[0];
  if (child.kind === 'text') {
    return { kind: 'text', text: child.text ?? '' };
  }
  if (child.kind === 'live_text') {
    return { kind: 'live_text', signal: child.signal };
  }
  return null;
};

const trySkipStableKeyedChildFast = (
  prevNode: VNode,
  nextNode: VNode
): boolean | null => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;

  if (prevNode.kind === 'text' && nextNode.kind === 'text') {
    return prevNode.text === nextNode.text;
  }

  if (prevNode.kind === 'live_text' && nextNode.kind === 'live_text') {
    return prevNode.signal === nextNode.signal;
  }

  if (prevNode.kind === 'portal' || nextNode.kind === 'portal') {
    return null;
  }

  if (prevNode.kind === 'index_list' && nextNode.kind === 'index_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }

  if (prevNode.kind === 'for_list' && nextNode.kind === 'for_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal
      && prevNode.listKey === nextNode.listKey
      && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }

  if (prevNode.kind !== 'element' && prevNode.kind !== 'fragment') {
    return null;
  }

  if (prevNode.kind === 'element' && nextNode.kind === 'element') {
    if (prevNode.tag !== nextNode.tag) {
      return false;
    }
    if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
      return false;
    }
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }
  if (prevChildren.length === 0) {
    return true;
  }
  if (prevChildren.length > 4) {
    return null;
  }

  for (let index = 0; index < prevChildren.length; index += 1) {
    const prevChild = prevChildren[index];
    const nextChild = nextChildren[index];
    if (prevChild.kind === 'text' && nextChild.kind === 'text') {
      if ((prevChild.text ?? '') !== (nextChild.text ?? '')) {
        return false;
      }
      continue;
    }
    if (prevChild.kind === 'live_text' && nextChild.kind === 'live_text') {
      if (prevChild.signal !== nextChild.signal) {
        return false;
      }
      continue;
    }
    if (prevChild.kind !== nextChild.kind) {
      return false;
    }
    if (prevChild.kind !== 'element' && prevChild.kind !== 'fragment') {
      return null;
    }
    if (prevChild.kind === 'element' && nextChild.kind === 'element') {
      if (prevChild.tag !== nextChild.tag || !hasShallowEqualProps(prevChild.props, nextChild.props)) {
        return false;
      }
    }
    const prevLeaf = tryReadTextLeaf(prevChild);
    const nextLeaf = tryReadTextLeaf(nextChild);
    if (!prevLeaf || !nextLeaf || prevLeaf.kind !== nextLeaf.kind) {
      return null;
    }
    if (prevLeaf.kind === 'text' && nextLeaf.kind === 'text') {
      if (prevLeaf.text !== nextLeaf.text) {
        return false;
      }
      continue;
    }
    if (prevLeaf.kind === 'live_text' && nextLeaf.kind === 'live_text') {
      if (prevLeaf.signal !== nextLeaf.signal) {
        return false;
      }
      continue;
    }
    return null;
  }

  return true;
};

const analyzeKeyedChildTransition = (
  prevChildren: VNode[],
  nextChildren: VNode[]
): KeyedListTransition | null => {
  if (prevChildren.length !== nextChildren.length) {
    return null;
  }

  const seenNextKeys = new Set<string | number>();
  let sawMismatch = false;

  for (let index = 0; index < prevChildren.length; index += 1) {
    const prevChild = prevChildren[index];
    const nextChild = nextChildren[index];
    if (!hasVNodeKey(prevChild) || !hasVNodeKey(nextChild)) {
      return null;
    }

    const prevKey = prevChild.key;
    const nextKey = nextChild.key;
    if (seenNextKeys.has(nextKey)) {
      throw duplicateKeyError(nextKey);
    }
    seenNextKeys.add(nextKey);

    sawMismatch ||= prevKey !== nextKey;
  }

  if (!sawMismatch) {
    return { kind: 'same_order' };
  }

  return analyzeSequenceTransition(prevChildren, nextChildren, (left, right) => left.key === right.key);
};

interface ForListEntry {
  key: string | number;
  currentValue: unknown;
  currentIndex: number;
  itemSignal: Signal<unknown>;
  indexSignal: Signal<number>;
  domNode: DomNodeLike;
}

interface ForListState {
  entries: ForListEntry[];
  entriesByKey: Map<string | number, ForListEntry>;
  order: Array<string | number>;
}

interface GenericKeyedEntry {
  key: string | number;
  vnode: VNode;
  domNode: DomNodeLike;
}

interface GenericKeyedState {
  entries: GenericKeyedEntry[];
}

const createForListState = (entries: ForListEntry[]): ForListState => ({
  entries,
  entriesByKey: new Map(entries.map((entry) => [entry.key, entry] as const)),
  order: entries.map((entry) => entry.key),
});

const genericKeyedStates: WeakMap<DomElementLike, GenericKeyedState> = new WeakMap();

const createGenericKeyedState = (entries: GenericKeyedEntry[]): GenericKeyedState => ({
  entries,
});

const buildKeyedOrder = (
  items: unknown[],
  keyOf: (item: unknown, index: number) => string | number
): Array<string | number> => {
  const order: Array<string | number> = [];
  const seen = new Set<string | number>();
  for (let index = 0; index < items.length; index += 1) {
    const key = coerceListKey(keyOf(items[index], index), index);
    if (seen.has(key)) {
      throw duplicateKeyError(key);
    }
    seen.add(key);
    order.push(key);
  }
  return order;
};

const buildGenericKeyedState = (
  children: Array<VNode & { key: string | number }>,
  domChildren: DomNodeLike[]
): GenericKeyedState => createGenericKeyedState(
  children
    .map((child, index) => ({
      key: child.key,
      vnode: child,
      domNode: domChildren[index] as DomNodeLike,
    }))
    .filter((entry) => Boolean(entry.domNode))
);

const isGenericKeyedStateValid = (
  host: DomElementLike,
  state: GenericKeyedState | undefined,
  children: Array<VNode & { key: string | number }>
): state is GenericKeyedState => {
  if (!state || state.entries.length !== children.length) {
    return false;
  }
  for (let index = 0; index < children.length; index += 1) {
    const entry = state.entries[index];
    const child = children[index];
    if (!entry || entry.key !== child.key || entry.domNode.parentNode !== host) {
      return false;
    }
  }
  return true;
};

const ensureGenericKeyedState = (
  host: DomElementLike,
  children: Array<VNode & { key: string | number }>
): GenericKeyedState => {
  const existing = genericKeyedStates.get(host);
  if (isGenericKeyedStateValid(host, existing, children)) {
    return existing;
  }
  const rebuilt = buildGenericKeyedState(children, readChildNodes(host) as DomNodeLike[]);
  genericKeyedStates.set(host, rebuilt);
  return rebuilt;
};

const syncGenericKeyedStateForSameOrder = (
  state: GenericKeyedState,
  nextChildren: Array<VNode & { key: string | number }>
): void => {
  for (let index = 0; index < nextChildren.length; index += 1) {
    const entry = state.entries[index];
    if (!entry) continue;
    entry.vnode = nextChildren[index];
  }
};

const syncGenericKeyedStateForTransition = (
  state: GenericKeyedState,
  nextChildren: Array<VNode & { key: string | number }>,
  transition: Extract<KeyedListTransition, { kind: 'adjacent_swap' | 'single_move' }>
): void => {
  if (transition.kind === 'adjacent_swap') {
    const leftEntry = state.entries[transition.left];
    state.entries[transition.left] = state.entries[transition.right] as GenericKeyedEntry;
    state.entries[transition.right] = leftEntry as GenericKeyedEntry;
  } else {
    const moving = state.entries.splice(transition.from, 1)[0];
    if (moving) {
      state.entries.splice(transition.to, 0, moving);
    }
  }
  for (let index = 0; index < nextChildren.length; index += 1) {
    const entry = state.entries[index];
    if (!entry) continue;
    entry.vnode = nextChildren[index];
  }
};

const replaceGenericKeyedState = (
  host: DomElementLike,
  nextEntries: GenericKeyedEntry[],
  existingState?: GenericKeyedState | null
): void => {
  if (existingState) {
    existingState.entries = nextEntries;
    genericKeyedStates.set(host, existingState);
    return;
  }
  genericKeyedStates.set(host, createGenericKeyedState(nextEntries));
};

const analyzeKeyedOrderTransition = (
  items: unknown[],
  previousOrder: Array<string | number>,
  keyOf: (item: unknown, index: number) => string | number
): { transition: KeyedListTransition; nextOrder: Array<string | number> | null } => {
  if (items.length !== previousOrder.length) {
    return { transition: { kind: 'complex_reorder' }, nextOrder: null };
  }

  let firstMismatch = -1;
  let firstMismatchKey: string | number | null = null;

  for (let index = 0; index < items.length; index += 1) {
    const key = coerceListKey(keyOf(items[index], index), index);
    if (previousOrder[index] !== key) {
      firstMismatch = index;
      firstMismatchKey = key;
      break;
    }
  }

  if (firstMismatch < 0) {
    return { transition: { kind: 'same_order' }, nextOrder: null };
  }

  const swapRight = firstMismatch + 1;
  if (swapRight < items.length) {
    const rightKey = coerceListKey(keyOf(items[swapRight], swapRight), swapRight);
    if (
      previousOrder[firstMismatch] === rightKey
      && previousOrder[swapRight] === firstMismatchKey
    ) {
      let restMatches = true;
      for (let index = swapRight + 1; index < items.length; index += 1) {
        const key = coerceListKey(keyOf(items[index], index), index);
        if (previousOrder[index] !== key) {
          restMatches = false;
          break;
        }
      }
      if (restMatches) {
        return {
          transition: { kind: 'adjacent_swap', left: firstMismatch, right: swapRight },
          nextOrder: null,
        };
      }
    }
  }

  const nextOrder = previousOrder.slice();
  nextOrder[firstMismatch] = firstMismatchKey as string | number;
  for (let index = firstMismatch + 1; index < items.length; index += 1) {
    nextOrder[index] = coerceListKey(keyOf(items[index], index), index);
  }

  return {
    transition: analyzeSequenceTransition(previousOrder, nextOrder, (left, right) => left === right),
    nextOrder,
  };
};

const hasShallowEqualProps = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  let leftCount = 0;
  for (const key in left) {
    if (!Object.prototype.hasOwnProperty.call(left, key)) continue;
    leftCount += 1;
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (left[key] !== right[key]) return false;
  }

  let rightCount = 0;
  for (const key in right) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) continue;
    rightCount += 1;
  }

  return leftCount === rightCount;
};

const canSkipChildListPatch = (
  length: number,
  compareChild: (index: number) => boolean
): boolean => {
  if (length === 0) {
    return true;
  }

  // Keep the skip analysis cheap and focused on the small row/card subtrees
  // that dominate list benchmarks.
  if (length > 6) {
    return false;
  }

  for (let index = 0; index < length; index += 1) {
    if (!compareChild(index)) {
      return false;
    }
  }

  return true;
};

const canSkipStructuredSmallSubtree = (
  prevNode: VNode,
  nextNode: VNode,
  equalsValue: (left: unknown, right: unknown) => boolean
): boolean | null => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;

  if (prevNode.kind === 'text' && nextNode.kind === 'text') {
    return prevNode.text === nextNode.text;
  }

  if (prevNode.kind === 'live_text' && nextNode.kind === 'live_text') {
    return prevNode.signal === nextNode.signal;
  }

  if (prevNode.kind === 'index_list' && nextNode.kind === 'index_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }

  if (prevNode.kind === 'for_list' && nextNode.kind === 'for_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal
      && prevNode.listKey === nextNode.listKey
      && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }

  if (prevNode.kind === 'portal' || nextNode.kind === 'portal') {
    return false;
  }

  if (prevNode.kind !== 'element' && prevNode.kind !== 'fragment') {
    return null;
  }

  if (prevNode.kind === 'element' && nextNode.kind === 'element') {
    if (prevNode.tag !== nextNode.tag || prevNode.key !== nextNode.key) {
      return false;
    }
    if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
      return false;
    }
  } else if (prevNode.kind === 'fragment' && nextNode.kind === 'fragment') {
    if (prevNode.key !== nextNode.key) {
      return false;
    }
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }

  if (prevChildren.length === 0) {
    return true;
  }

  if (prevChildren.length > 6) {
    return null;
  }

  for (let index = 0; index < prevChildren.length; index += 1) {
    const childResult = canSkipStructuredSmallSubtree(prevChildren[index], nextChildren[index], equalsValue);
    if (childResult === null) {
      return null;
    }
    if (!childResult) {
      return false;
    }
  }

  return true;
};

const remapMovedIndex = (index: number, from: number, to: number): number => {
  if (from === to) {
    return index;
  }
  if (from < to) {
    if (index < from || index > to) return index;
    if (index === to) return from;
    return index + 1;
  }
  if (index < to || index > from) return index;
  if (index === to) return from;
  return index - 1;
};

const getComplexOrderAffectedRange = (
  previousOrder: Array<string | number>,
  nextOrder: Array<string | number>
): { start: number; end: number } | null => {
  const window = findStableSequenceWindow(previousOrder, nextOrder);
  if (!window) {
    return null;
  }
  return { start: window.nextStart, end: window.nextEnd };
};

const canSkipDomPatch = (
  prevNode: VNode,
  nextNode: VNode,
  equalsValue: (left: unknown, right: unknown) => boolean
): boolean => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;

  if (prevNode.kind === 'text' && nextNode.kind === 'text') {
    return prevNode.text === nextNode.text;
  }

  if (prevNode.kind === 'live_text' && nextNode.kind === 'live_text') {
    return prevNode.signal === nextNode.signal;
  }

  if (prevNode.kind === 'index_list' && nextNode.kind === 'index_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }

  if (prevNode.kind === 'for_list' && nextNode.kind === 'for_list') {
    return prevNode.itemsSignal === nextNode.itemsSignal
      && prevNode.listKey === nextNode.listKey
      && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }

  if (prevNode.kind === 'portal' || nextNode.kind === 'portal') {
    return false;
  }

  const structuredSmallSubtree = canSkipStructuredSmallSubtree(prevNode, nextNode, equalsValue);
  if (structuredSmallSubtree !== null) {
    return structuredSmallSubtree;
  }

  const prevFingerprint = getStablePatchFingerprint(prevNode);
  if (prevFingerprint !== null) {
    const nextFingerprint = getStablePatchFingerprint(nextNode);
    if (nextFingerprint !== null) {
      return prevFingerprint === nextFingerprint;
    }
  }

  if (prevNode.tag !== nextNode.tag || prevNode.key !== nextNode.key) {
    return false;
  }

  if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
    return false;
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }

  if (prevChildren.length === 0) {
    return true;
  }

  return canSkipChildListPatch(prevChildren.length, (index) =>
    canSkipDomPatch(prevChildren[index], nextChildren[index], equalsValue)
  );
};

const patchPortalMount = (
  anchor: DomElementLike,
  prevNode: VNode | null,
  nextNode: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const previous = portalStore.get(anchor) ?? { target: null, host: null };
  const nextTarget = resolvePortalTarget(nextNode, documentLike);
  const prevChildren = prevNode?.kind === 'portal' ? (prevNode.children ?? []) : [];
  const nextChildren = nextNode.children ?? [];

  if (!nextTarget) {
    if (previous.host) {
      replaceChildren(previous.host, [], eventStore, portalStore, liveTextStore);
      const parent = previous.host.parentNode;
      if (parent) parent.removeChild(previous.host);
    }
    portalStore.set(anchor, { target: null, host: null });
    return;
  }

  let host = previous.host;
  const targetChanged = previous.target !== nextTarget || !host || host.parentNode !== nextTarget;
  if (targetChanged) {
    if (host) {
      replaceChildren(host, [], eventStore, portalStore, liveTextStore);
      const parent = host.parentNode;
      if (parent) parent.removeChild(host);
    }
    host = documentLike.createElement('lumina-portal-host');
    nextTarget.appendChild(host);
  }
  if (!host) {
    host = documentLike.createElement('lumina-portal-host');
    nextTarget.appendChild(host);
  }

  if (targetChanged || !prevNode || prevNode.kind !== 'portal') {
    const mountedChildren = nextChildren.map((child) =>
      createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
    );
    replaceChildren(host, mountedChildren, eventStore, portalStore, liveTextStore);
  } else if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(
      host,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  } else {
    patchDomChildrenPositionally(
      host,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }

  portalStore.set(anchor, { target: nextTarget, host });
};

const bindIndexListHost = (
  host: DomElementLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== 'function') {
    host.__luminaIndexListEffect?.dispose();
    host.__luminaIndexListEffect = null;
    host.__luminaIndexListSource = null;
    host.__luminaIndexListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }

  if (
    host.__luminaIndexListEffect
    && host.__luminaIndexListSource === source
    && host.__luminaIndexListRender === renderItem
  ) {
    return;
  }

  host.__luminaIndexListEffect?.dispose();

  let currentItems = readIndexListValues(source, false);
  let itemSignals = currentItems.map((value) => new Signal(value));
  const renderChildren = (): DomNodeLike[] =>
    itemSignals.map((itemSignal, index) =>
      createDomNode(
        coerceRenderableToVNode(renderItem(itemSignal, index)),
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      )
    );

  replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);

  const runBatched = (fn: () => void): void => {
    batchReactive(fn);
  };

  host.__luminaIndexListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    if (nextItems.length !== itemSignals.length) {
      currentItems = nextItems;
      itemSignals = nextItems.map((value) => new Signal(value));
      replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);
      return;
    }

    runBatched(() => {
      for (let index = 0; index < nextItems.length; index += 1) {
        if (currentItems[index] === nextItems[index] || equalsValue(currentItems[index], nextItems[index])) {
          continue;
        }
        itemSignals[index].set(nextItems[index]);
      }
      currentItems = nextItems;
    });
  });
  host.__luminaIndexListSource = source;
  host.__luminaIndexListRender = renderItem;
};

const bindForListHost = (
  host: DomElementLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== 'function' || typeof renderItem !== 'function') {
    host.__luminaForListEffect?.dispose();
    host.__luminaForListEffect = null;
    host.__luminaForListSource = null;
    host.__luminaForListKey = null;
    host.__luminaForListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }

  if (
    host.__luminaForListEffect
    && host.__luminaForListSource === source
    && host.__luminaForListKey === keyOf
    && host.__luminaForListRender === renderItem
  ) {
    return;
  }

  host.__luminaForListEffect?.dispose();

  const runBatched = (fn: () => void): void => {
    batchReactive(fn);
  };

  const createEntry = (value: unknown, index: number): ForListEntry => {
    const key = coerceListKey(keyOf(value, index), index);
    const itemSignal = new Signal(value);
    const indexSignal = new Signal(index);
    const domNode = createDomNode(
      applyVNodeKey(coerceRenderableToVNode(renderItem(itemSignal, indexSignal)), key),
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return { key, currentValue: value, currentIndex: index, itemSignal, indexSignal, domNode };
  };

  const initialEntries = readIndexListValues(source, false).map((value, index) => createEntry(value, index));
  let state = createForListState(initialEntries);
  replaceChildren(host, state.entries.map((entry) => entry.domNode), eventStore, portalStore, liveTextStore);

  const syncEntryValue = (entry: ForListEntry, value: unknown): void => {
    if (entry.currentValue !== value && !equalsValue(entry.currentValue, value)) {
      entry.itemSignal.set(value);
      entry.currentValue = value;
    }
  };

  const syncEntryIndex = (entry: ForListEntry, index: number): void => {
    if (entry.currentIndex !== index) {
      entry.indexSignal.set(index);
      entry.currentIndex = index;
    }
  };

  const syncValuesForOrder = (items: unknown[], order: Array<string | number>): void => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = state.entriesByKey.get(order[index]);
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  };

  const syncValuesForEntries = (items: unknown[], nextEntries: ForListEntry[]): void => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  };

  const hasPureEntryValueReuse = (
    items: unknown[],
    nextEntries: ForListEntry[]
  ): boolean => {
    if (items.length !== nextEntries.length) {
      return false;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (nextEntries[index]?.currentValue !== items[index]) {
        return false;
      }
    }
    return true;
  };

  const swapItems = <T>(entries: T[], left: number, right: number): T[] => {
    const nextEntries = entries.slice();
    const previousLeft = nextEntries[left];
    nextEntries[left] = nextEntries[right] as T;
    nextEntries[right] = previousLeft as T;
    return nextEntries;
  };

  const moveItems = <T>(entries: T[], from: number, to: number): T[] => {
    const nextEntries = entries.slice();
    const moving = nextEntries.splice(from, 1)[0];
    if (!moving) {
      return nextEntries;
    }
    nextEntries.splice(to, 0, moving);
    return nextEntries;
  };

  const applyDirectEntryReorder = (
    currentEntries: ForListEntry[],
    nextEntries: ForListEntry[],
    transition: KeyedListTransition
  ): boolean => {
    if (typeof host.insertBefore !== 'function') {
      return false;
    }

    if (transition.kind === 'adjacent_swap') {
      const leftDom = currentEntries[transition.left]?.domNode;
      const rightDom = currentEntries[transition.right]?.domNode;
      if (!leftDom || !rightDom) {
        return false;
      }
      host.insertBefore(rightDom, leftDom);
      return true;
    }

    if (transition.kind === 'single_move') {
      const movingDom = currentEntries[transition.from]?.domNode;
      if (!movingDom) {
        return false;
      }
      const reference =
        transition.from < transition.to
          ? (currentEntries[transition.to + 1]?.domNode ?? null)
          : (currentEntries[transition.to]?.domNode ?? null);
      host.insertBefore(movingDom, reference);
      return true;
    }

    return false;
  };

  const syncIndicesForRange = (
    nextEntries: ForListEntry[],
    transition: KeyedListTransition,
    previousOrder?: Array<string | number>,
    nextOrder?: Array<string | number>
  ): void => {
    const range =
      transition.kind === 'complex_reorder' && previousOrder && nextOrder
        ? getComplexOrderAffectedRange(previousOrder, nextOrder)
        : getTransitionAffectedRange(transition, nextEntries.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryIndex(entry, index);
    }
  };

  const reorderEntriesForComplexWindow = (
    currentEntries: ForListEntry[],
    previousOrder: Array<string | number>,
    nextOrder: Array<string | number>
  ): ForListEntry[] | null => {
    if (currentEntries.length !== nextOrder.length || previousOrder.length !== nextOrder.length) {
      return null;
    }

    const window = findStableSequenceWindow(previousOrder, nextOrder);
    if (!window) {
      return currentEntries.slice();
    }

    const nextEntries = currentEntries.slice();
    const windowEntries = new Map<string | number, ForListEntry>();
    for (let index = window.currentStart; index <= window.currentEnd; index += 1) {
      const entry = currentEntries[index];
      const key = previousOrder[index];
      if (!entry || key == null) {
        return null;
      }
      windowEntries.set(key, entry);
    }

    for (let index = window.nextStart; index <= window.nextEnd; index += 1) {
      const entry = windowEntries.get(nextOrder[index]);
      if (!entry) {
        return null;
      }
      nextEntries[index] = entry;
    }

    return nextEntries;
  };

  const buildNextEntries = (
    items: unknown[],
    order: Array<string | number>
  ): { nextEntries: ForListEntry[]; structureChanged: boolean } => {
    const retained = new Set<string | number>();
    const nextEntries: ForListEntry[] = [];
    let structureChanged = items.length !== state.entries.length;

    for (let index = 0; index < items.length; index += 1) {
      const key = order[index];
      const value = items[index];
      let entry = state.entriesByKey.get(key);
      if (!entry) {
        entry = createEntry(value, index);
        state.entriesByKey.set(key, entry);
        structureChanged = true;
      } else {
        syncEntryValue(entry, value);
      }
      retained.add(key);
      nextEntries.push(entry);
    }

    for (const key of Array.from(state.entriesByKey.keys())) {
      if (retained.has(key)) continue;
      state.entriesByKey.delete(key);
      structureChanged = true;
    }

    return { nextEntries, structureChanged };
  };

  host.__luminaForListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    const analyzedTransition = analyzeKeyedOrderTransition(nextItems, state.order, keyOf);
    const transition = analyzedTransition.transition;
    const nextOrder =
      analyzedTransition.nextOrder
      ?? (transition.kind === 'adjacent_swap'
        ? swapItems(state.order, transition.left, transition.right)
        : null);

    if (transition.kind === 'same_order') {
      runBatched(() => {
        for (let index = 0; index < nextItems.length; index += 1) {
          const entry = state.entries[index];
          if (!entry) continue;
          syncEntryValue(entry, nextItems[index]);
        }
      });
      return;
    }

    if (transition.kind === 'adjacent_swap' || transition.kind === 'single_move') {
      const previousEntries = state.entries;
      const nextEntries =
        transition.kind === 'adjacent_swap'
          ? swapItems(state.entries, transition.left, transition.right)
          : moveItems(state.entries, transition.from, transition.to);

      for (let index = 0; index < nextEntries.length; index += 1) {
        if (!nextEntries[index]) {
          throw new Error(`Missing keyed list entry '${String((nextOrder?.[index]) ?? index)}' during transition`);
        }
      }

      runBatched(() => {
        if (nextOrder && !hasPureEntryValueReuse(nextItems, nextEntries)) {
          syncValuesForOrder(nextItems, nextOrder);
        }
        syncIndicesForRange(nextEntries, transition, state.order, nextOrder ?? state.order);
      });

      state.entries = nextEntries;
      state.order =
        nextOrder
        ?? (transition.kind === 'adjacent_swap'
          ? swapItems(state.order, transition.left, transition.right)
          : moveItems(state.order, transition.from, transition.to));
      if (!applyDirectEntryReorder(previousEntries, nextEntries, transition)) {
        reorderChildren(
          host,
          nextEntries.map((entry) => entry.domNode),
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
          {
            currentChildren: previousEntries.map((entry) => entry.domNode),
            transition,
            structureChanged: false,
          }
        );
      }
      return;
    }

    let nextEntries: ForListEntry[] = [];
    let structureChanged = false;
    const resolvedNextOrder = nextOrder ?? buildKeyedOrder(nextItems, keyOf);
    const reorderedEntries =
      transition.kind === 'complex_reorder'
        ? reorderEntriesForComplexWindow(state.entries, state.order, resolvedNextOrder)
        : null;
    if (reorderedEntries) {
      const previousEntries = state.entries;
      runBatched(() => {
        if (!hasPureEntryValueReuse(nextItems, reorderedEntries)) {
          syncValuesForEntries(nextItems, reorderedEntries);
        }
        syncIndicesForRange(reorderedEntries, transition, state.order, resolvedNextOrder);
      });

      state.entries = reorderedEntries;
      state.order = resolvedNextOrder;
      if (!applyDirectEntryReorder(previousEntries, reorderedEntries, transition)) {
        reorderChildren(
          host,
          reorderedEntries.map((entry) => entry.domNode),
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
          {
            currentChildren: previousEntries.map((entry) => entry.domNode),
            transition,
            structureChanged: false,
          }
        );
      }
      return;
    }

    const previousEntries = state.entries;
    runBatched(() => {
      const built = buildNextEntries(nextItems, resolvedNextOrder);
      nextEntries = built.nextEntries;
      structureChanged = built.structureChanged;
      syncIndicesForRange(nextEntries, transition, state.order, resolvedNextOrder);
    });

    state.entries = nextEntries;
    state.order = resolvedNextOrder;
    reorderChildren(
      host,
      nextEntries.map((entry) => entry.domNode),
      (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
      {
        currentChildren: previousEntries.map((entry) => entry.domNode),
        transition,
        structureChanged,
      }
    );
  });

  host.__luminaForListSource = source;
  host.__luminaForListKey = keyOf;
  host.__luminaForListRender = renderItem;
};

const createDomNode = (
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): DomNodeLike => {
  if (node.kind === 'text') {
    return documentLike.createTextNode(node.text ?? '');
  }
  if (node.kind === 'live_text') {
    const textNode = documentLike.createTextNode(node.signal ? String(node.signal.get()) : '');
    if (node.signal) {
      const effect = new Effect(() => {
        textNode.textContent = String(node.signal?.get() ?? '');
      });
      liveTextStore.set(textNode, effect);
    }
    return textNode;
  }
  if (node.kind === 'index_list') {
    const host = documentLike.createElement('lumina-index-list');
    updateDomProperties(host, {}, indexListHostProps, eventStore);
    bindIndexListHost(host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return host;
  }
  if (node.kind === 'for_list') {
    const host = documentLike.createElement('lumina-for-list');
    updateDomProperties(host, {}, forListHostProps, eventStore);
    bindForListHost(host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return host;
  }
  if (node.kind === 'fragment') {
    const wrapper = documentLike.createElement('lumina-fragment');
    const children = asDomChildren(node).map((child) =>
      createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
    );
    setChildren(wrapper, children);
    return wrapper;
  }
  if (node.kind === 'portal') {
    const anchor = documentLike.createElement('lumina-portal-anchor');
    updateDomProperties(anchor, {}, { hidden: true, 'data-lumina-portal-anchor': 'true' }, eventStore);
    patchPortalMount(anchor, null, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return anchor;
  }

  if (node.kind === 'element' && typeof node.domTemplateHtml === 'string') {
    const templated = cloneStaticTemplateElement(documentLike, node.domTemplateHtml);
    if (templated) {
      updateDomProperties(templated, {}, node.props, eventStore);
      return templated;
    }
  }

  const element = documentLike.createElement(node.tag ?? 'div');
  updateDomProperties(element, {}, node.props, eventStore);
  const children = asDomChildren(node).map((child) =>
    createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
  );
  setChildren(element, children);
  if (node.props?.autoFocus && isModalDialogElement(element) && !isElementHidden(element)) {
    focusInitialDialogTarget(element);
  }
  return element;
};

const patchDomChildrenPositionally = (
  element: DomElementLike,
  prevChildren: VNode[],
  nextChildren: VNode[],
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const shared = Math.min(prevChildren.length, nextChildren.length);

  for (let i = 0; i < shared; i += 1) {
    const currentChild = element.childNodes[i];
    if (!currentChild) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue));
      continue;
    }
    if (canSkipDomPatch(prevChildren[i], nextChildren[i], equalsValue)) {
      continue;
    }
    patchDomNode(currentChild, prevChildren[i], nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }

  if (nextChildren.length > prevChildren.length) {
    for (let i = prevChildren.length; i < nextChildren.length; i += 1) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue));
    }
  } else if (prevChildren.length > nextChildren.length) {
    for (let i = prevChildren.length - 1; i >= nextChildren.length; i -= 1) {
      const child = element.childNodes[i];
      if (child) {
        disposeDomNode(child, eventStore, portalStore, liveTextStore);
        element.removeChild(child);
      }
    }
  }
};

const patchStableKeyedChildAt = (
  currentDomChildren: ArrayLike<DomNodeLike>,
  prevChildren: VNode[],
  nextChildren: VNode[],
  index: number,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const domChild = currentDomChildren[index];
  const prevChild = prevChildren[index];
  const nextChild = nextChildren[index];
  if (
    !domChild
    || !prevChild
    || !nextChild
    || canSkipDomPatch(prevChild, nextChild, equalsValue)
  ) {
    return;
  }
  patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
};

const patchTransitionAffectedRange = (
  currentDomChildren: ArrayLike<DomNodeLike>,
  prevChildren: VNode[],
  nextChildren: VNode[],
  transition: Extract<KeyedListTransition, { kind: 'adjacent_swap' | 'single_move' }>,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const range = getTransitionAffectedRange(transition, nextChildren.length);
  if (!range) {
    return;
  }

  for (let index = range.start; index <= range.end; index += 1) {
    const sourceIndex =
      transition.kind === 'adjacent_swap'
        ? (index === transition.left ? transition.right : transition.left)
        : remapMovedIndex(index, transition.from, transition.to);
    const domChild = currentDomChildren[sourceIndex];
    const prevChild = prevChildren[sourceIndex];
    const nextChild = nextChildren[index];
    if (!domChild || !prevChild || !nextChild || canSkipDomPatch(prevChild, nextChild, equalsValue)) {
      continue;
    }
    patchDomNode(
      domChild,
      prevChild,
      nextChild,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
};

const patchStableGenericKeyedEntryAt = (
  entries: GenericKeyedEntry[],
  nextChildren: Array<VNode & { key: string | number }>,
  index: number,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const entry = entries[index];
  const nextChild = nextChildren[index];
  if (!entry || !nextChild || canSkipDomPatch(entry.vnode, nextChild, equalsValue)) {
    return;
  }
  patchDomNode(
    entry.domNode,
    entry.vnode,
    nextChild,
    documentLike,
    eventStore,
    portalStore,
    liveTextStore,
    equalsValue
  );
};

const patchTransitionAffectedGenericKeyedEntries = (
  entries: GenericKeyedEntry[],
  nextChildren: Array<VNode & { key: string | number }>,
  transition: Extract<KeyedListTransition, { kind: 'adjacent_swap' | 'single_move' }>,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const range = getTransitionAffectedRange(transition, nextChildren.length);
  if (!range) {
    return;
  }

  for (let index = range.start; index <= range.end; index += 1) {
    const sourceIndex =
      transition.kind === 'adjacent_swap'
        ? (index === transition.left ? transition.right : transition.left)
        : remapMovedIndex(index, transition.from, transition.to);
    const entry = entries[sourceIndex];
    const nextChild = nextChildren[index];
    if (!entry || !nextChild || canSkipDomPatch(entry.vnode, nextChild, equalsValue)) {
      continue;
    }
    patchDomNode(
      entry.domNode,
      entry.vnode,
      nextChild,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
};

const patchDomChildrenWithKeys = (
  element: DomElementLike,
  prevChildren: VNode[],
  nextChildren: VNode[],
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): void => {
  const allPrevChildrenKeyed = areAllChildrenKeyed(prevChildren);
  const allNextChildrenKeyed = areAllChildrenKeyed(nextChildren);
  const genericKeyedState =
    allPrevChildrenKeyed && allNextChildrenKeyed
      ? ensureGenericKeyedState(element, prevChildren)
      : (genericKeyedStates.delete(element), null);
  const keyedTransition = analyzeKeyedChildTransition(prevChildren, nextChildren);
  if (keyedTransition?.kind === 'same_order') {
    for (let index = 0; index < nextChildren.length; index += 1) {
      const domChild = genericKeyedState?.entries[index]?.domNode ?? element.childNodes[index];
      const prevChild = genericKeyedState?.entries[index]?.vnode ?? prevChildren[index];
      const nextChild = nextChildren[index];
      if (!prevChild || !nextChild) {
        continue;
      }
      if (!domChild) {
        element.appendChild(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
        continue;
      }
      const fastSkip = trySkipStableKeyedChildFast(prevChild, nextChild);
      if (fastSkip === true || (fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue))) {
        continue;
      }
      patchDomNode(
        domChild,
        prevChild,
        nextChild,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      );
    }
    if (genericKeyedState && allNextChildrenKeyed) {
      syncGenericKeyedStateForSameOrder(genericKeyedState, nextChildren);
    }
    return;
  }

  if (keyedTransition?.kind === 'adjacent_swap') {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren =
      (currentEntries?.map((entry) => entry.domNode) ?? Array.from(element.childNodes)) as ArrayLike<DomNodeLike>;
    const leftDom = currentEntries?.[keyedTransition.left]?.domNode ?? currentDomChildren[keyedTransition.left];
    const rightDom = currentEntries?.[keyedTransition.right]?.domNode ?? currentDomChildren[keyedTransition.right];
    if (leftDom && rightDom && typeof element.insertBefore === 'function') {
      if (currentEntries && allNextChildrenKeyed) {
        patchTransitionAffectedGenericKeyedEntries(
          currentEntries,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      } else {
        patchTransitionAffectedRange(
          currentDomChildren,
          prevChildren,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      }
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (index === keyedTransition.left || index === keyedTransition.right) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(
            currentEntries,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        } else {
          patchStableKeyedChildAt(
            currentDomChildren,
            prevChildren,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        }
      }
      element.insertBefore(rightDom, leftDom);
      if (genericKeyedState && allNextChildrenKeyed) {
        syncGenericKeyedStateForTransition(genericKeyedState, nextChildren, keyedTransition);
      }
      return;
    }
  }

  if (keyedTransition?.kind === 'single_move') {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren =
      (currentEntries?.map((entry) => entry.domNode) ?? Array.from(element.childNodes)) as ArrayLike<DomNodeLike>;
    const movingDom = currentEntries?.[keyedTransition.from]?.domNode ?? currentDomChildren[keyedTransition.from];
    if (movingDom && typeof element.insertBefore === 'function') {
      const reference =
        keyedTransition.from < keyedTransition.to
          ? (currentEntries?.[keyedTransition.to + 1]?.domNode ?? currentDomChildren[keyedTransition.to + 1] ?? null)
          : (currentEntries?.[keyedTransition.to]?.domNode ?? currentDomChildren[keyedTransition.to] ?? null);
      if (currentEntries && allNextChildrenKeyed) {
        patchTransitionAffectedGenericKeyedEntries(
          currentEntries,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      } else {
        patchTransitionAffectedRange(
          currentDomChildren,
          prevChildren,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      }
      const affectedRange = getTransitionAffectedRange(keyedTransition, nextChildren.length);
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (affectedRange && index >= affectedRange.start && index <= affectedRange.end) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(
            currentEntries,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        } else {
          patchStableKeyedChildAt(
            currentDomChildren,
            prevChildren,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        }
      }
      element.insertBefore(movingDom as DomNodeLike, reference as DomNodeLike | null);
      if (genericKeyedState && allNextChildrenKeyed) {
        syncGenericKeyedStateForTransition(genericKeyedState, nextChildren, keyedTransition);
      }
      return;
    }
  }

  if (allPrevChildrenKeyed && allNextChildrenKeyed) {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren = currentEntries?.map((entry) => entry.domNode) ?? (readChildNodes(element) as DomNodeLike[]);
    const window =
      keyedTransition?.kind === 'complex_reorder'
      && typeof keyedTransition.start === 'number'
      && typeof keyedTransition.end === 'number'
      && prevChildren.length === nextChildren.length
        ? {
            currentStart: keyedTransition.start,
            currentEnd: keyedTransition.end,
            nextStart: keyedTransition.start,
            nextEnd: keyedTransition.end,
          }
        : findStableSequenceWindow(prevChildren, nextChildren, (left, right) => left.key === right.key);
    if (window) {
      const nextDomChildren: DomNodeLike[] = new Array(nextChildren.length);
      const nextEntries: GenericKeyedEntry[] = new Array(nextChildren.length);

      for (let index = 0; index < window.currentStart; index += 1) {
        const entry = currentEntries?.[index];
        const domChild = entry?.domNode ?? currentDomChildren[index];
        const prevChild = entry?.vnode ?? prevChildren[index];
        const nextChild = nextChildren[index];
        if (!domChild || !prevChild || !nextChild) {
          continue;
        }
        const nextDomNode =
          canSkipDomPatch(prevChild, nextChild, equalsValue)
            ? domChild
            : patchDomNode(
                domChild,
                prevChild,
                nextChild,
                documentLike,
                eventStore,
                portalStore,
                liveTextStore,
                equalsValue
              );
        nextDomChildren[index] = nextDomNode;
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[index] = entry;
          continue;
        }
        nextEntries[index] = { key: nextChild.key, vnode: nextChild, domNode: nextDomNode };
      }

      const stableSuffixCount = prevChildren.length - (window.currentEnd + 1);
      for (let offset = 1; offset <= stableSuffixCount; offset += 1) {
        const currentIndex = prevChildren.length - offset;
        const nextIndex = nextChildren.length - offset;
        const entry = currentEntries?.[currentIndex];
        const domChild = entry?.domNode ?? currentDomChildren[currentIndex];
        const prevChild = entry?.vnode ?? prevChildren[currentIndex];
        const nextChild = nextChildren[nextIndex];
        if (!domChild || !prevChild || !nextChild) {
          continue;
        }
        const nextDomNode =
          canSkipDomPatch(prevChild, nextChild, equalsValue)
            ? domChild
            : patchDomNode(
                domChild,
                prevChild,
                nextChild,
                documentLike,
                eventStore,
                portalStore,
                liveTextStore,
                equalsValue
              );
        nextDomChildren[nextIndex] = nextDomNode;
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[nextIndex] = entry;
          continue;
        }
        nextEntries[nextIndex] = { key: nextChild.key, vnode: nextChild, domNode: nextDomNode };
      }

      const prevKeyedWindow = new Map<string | number, GenericKeyedEntry>();
      for (let index = window.currentStart; index <= window.currentEnd; index += 1) {
        const entry = currentEntries?.[index];
        const prevChild = entry?.vnode ?? prevChildren[index];
        const domChild = entry?.domNode ?? currentDomChildren[index];
        if (!domChild || !prevChild || prevChild.key == null) continue;
        prevKeyedWindow.set(
          prevChild.key,
          entry ?? { key: prevChild.key, vnode: prevChild, domNode: domChild }
        );
      }

      let structureChanged = prevChildren.length !== nextChildren.length;
      const alreadyDisposedStaleNodes = new WeakSet<DomNodeLike>();
      for (let nextIndex = window.nextStart; nextIndex <= window.nextEnd; nextIndex += 1) {
        const nextChild = nextChildren[nextIndex];
        const prevEntry = prevKeyedWindow.get(nextChild.key);
        if (!prevEntry) {
          structureChanged = true;
          const createdDomNode = createDomNode(
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
          nextDomChildren[nextIndex] = createdDomNode;
          nextEntries[nextIndex] = { key: nextChild.key, vnode: nextChild, domNode: createdDomNode };
          continue;
        }
        prevKeyedWindow.delete(nextChild.key);
        const nextDomNode =
          canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue)
            ? prevEntry.domNode
            : patchDomNode(
                prevEntry.domNode,
                prevEntry.vnode,
                nextChild,
                documentLike,
                eventStore,
                portalStore,
                liveTextStore,
                equalsValue
              );
        prevEntry.vnode = nextChild;
        prevEntry.domNode = nextDomNode;
        nextDomChildren[nextIndex] = nextDomNode;
        nextEntries[nextIndex] = prevEntry;
      }

      for (const stale of prevKeyedWindow.values()) {
        structureChanged = true;
        disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
        alreadyDisposedStaleNodes.add(stale.domNode);
        if (stale.domNode.parentNode === element) {
          element.removeChild(stale.domNode);
        }
      }

      const reconcilerCurrentChildren =
        structureChanged
          ? currentDomChildren.filter((child) => child.parentNode === element)
          : currentDomChildren;
      reorderChildren(
        element,
        nextDomChildren,
        (child) => {
          const domChild = child as DomNodeLike;
          if (alreadyDisposedStaleNodes.has(domChild)) {
            return;
          }
          disposeDomNode(domChild, eventStore, portalStore, liveTextStore);
        },
        structureChanged
          ? {
              currentChildren: reconcilerCurrentChildren,
              structureChanged: false,
            }
          : {
              currentChildren: reconcilerCurrentChildren,
              transition: keyedTransition?.kind === 'complex_reorder' ? keyedTransition : null,
              structureChanged: false,
            }
      );
      replaceGenericKeyedState(
        element,
        nextEntries.filter((entry): entry is GenericKeyedEntry => Boolean(entry)),
        genericKeyedState
      );
      return;
    }
  }

  genericKeyedStates.delete(element);
  const currentDomChildren = readChildNodes(element) as DomNodeLike[];
  const prevKeyed = new Map<string | number, { vnode: VNode; domNode: DomNodeLike }>();
  const prevUnkeyed: Array<{ vnode: VNode; domNode: DomNodeLike }> = [];

  for (let i = 0; i < prevChildren.length; i += 1) {
    const prevChild = prevChildren[i];
    const domChild = currentDomChildren[i];
    if (!domChild) continue;

    if (hasVNodeKey(prevChild)) {
      if (prevKeyed.has(prevChild.key)) {
        throw duplicateKeyError(prevChild.key);
      }
      prevKeyed.set(prevChild.key, { vnode: prevChild, domNode: domChild });
      continue;
    }

    prevUnkeyed.push({ vnode: prevChild, domNode: domChild });
  }

  const seenNextKeys = new Set<string | number>();
  const nextDomChildren: DomNodeLike[] = [];
  let unkeyedIndex = 0;

  for (const nextChild of nextChildren) {
    if (hasVNodeKey(nextChild)) {
      if (seenNextKeys.has(nextChild.key)) {
        throw duplicateKeyError(nextChild.key);
      }
      seenNextKeys.add(nextChild.key);

      const prevEntry = prevKeyed.get(nextChild.key);
      if (!prevEntry) {
        nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
        continue;
      }

      prevKeyed.delete(nextChild.key);
      nextDomChildren.push(
        canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue)
          ? prevEntry.domNode
          : patchDomNode(
              prevEntry.domNode,
              prevEntry.vnode,
              nextChild,
              documentLike,
              eventStore,
              portalStore,
              liveTextStore,
              equalsValue
            )
      );
      continue;
    }

    const prevEntry = prevUnkeyed[unkeyedIndex];
    unkeyedIndex += 1;
    if (!prevEntry) {
      nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
      continue;
    }

    nextDomChildren.push(
      canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue)
        ? prevEntry.domNode
        : patchDomNode(
            prevEntry.domNode,
            prevEntry.vnode,
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          )
    );
  }

  const alreadyDisposedStaleNodes = new WeakSet<DomNodeLike>();
  for (const stale of prevKeyed.values()) {
    disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
    alreadyDisposedStaleNodes.add(stale.domNode);
  }
  for (let i = unkeyedIndex; i < prevUnkeyed.length; i += 1) {
    disposeDomNode(prevUnkeyed[i].domNode, eventStore, portalStore, liveTextStore);
    alreadyDisposedStaleNodes.add(prevUnkeyed[i].domNode);
  }

  const structureChanged =
    prevKeyed.size > 0
    || unkeyedIndex < prevUnkeyed.length
    || currentDomChildren.length !== nextDomChildren.length;
  reorderChildren(
    element,
    nextDomChildren,
    (child) => {
      const domChild = child as DomNodeLike;
      if (alreadyDisposedStaleNodes.has(domChild)) {
        return;
      }
      disposeDomNode(domChild, eventStore, portalStore, liveTextStore);
    },
    {
      currentChildren: currentDomChildren,
      transition: keyedTransition,
      structureChanged,
    }
  );
};

const patchDomNode = (
  domNode: DomNodeLike,
  prevNode: VNode,
  nextNode: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): DomNodeLike => {
  if (vnodeKindTag(prevNode) !== vnodeKindTag(nextNode)) {
    const replacement = createDomNode(nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    const parent = domNode.parentNode;
    if (parent && parent.replaceChild) {
      parent.replaceChild(replacement, domNode);
      disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
      return replacement;
    }
    disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
    return replacement;
  }

  if (nextNode.kind === 'text') {
    const nextText = nextNode.text ?? '';
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }

  if (nextNode.kind === 'live_text') {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (nextNode.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(nextNode.signal?.get() ?? '');
      });
      liveTextStore.set(domNode, effect);
    } else {
      domNode.textContent = '';
    }
    return domNode;
  }

  if (nextNode.kind === 'index_list') {
    updateDomProperties(domNode as DomElementLike, prevNode.props, indexListHostProps, eventStore);
    bindIndexListHost(domNode as DomElementLike, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }

  if (nextNode.kind === 'for_list') {
    updateDomProperties(domNode as DomElementLike, prevNode.props, forListHostProps, eventStore);
    bindForListHost(domNode as DomElementLike, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }

  if (nextNode.kind === 'portal') {
    patchPortalMount(domNode as DomElementLike, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }

  const element = domNode as DomElementLike;
  if (nextNode.kind === 'element') {
    updateDomProperties(element, prevNode.props, nextNode.props, eventStore);
  }

  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  } else {
    patchDomChildrenPositionally(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }

  if (
    nextNode.kind === 'element'
    && nextNode.props?.autoFocus
    && isModalDialogElement(element)
    && isHiddenPropValue(prevNode.props?.hidden)
    && !isElementHidden(element)
  ) {
    focusInitialDialogTarget(element);
  }

  return element;
};

const hydrateDomNode = (
  domNode: DomNodeLike,
  node: VNode,
  documentLike: DomDocumentLike,
  eventStore: DomEventStore,
  portalStore: DomPortalStore,
  liveTextStore: DomLiveTextStore,
  equalsValue: (left: unknown, right: unknown) => boolean
): DomNodeLike => {
  if (node.kind === 'text') {
    const nextText = node.text ?? '';
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }

  if (node.kind === 'live_text') {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (node.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(node.signal?.get() ?? '');
      });
      liveTextStore.set(domNode, effect);
      domNode.textContent = String(node.signal.get());
    } else {
      domNode.textContent = '';
    }
    return domNode;
  }

  if (node.kind === 'index_list') {
    updateDomProperties(domNode as DomElementLike, undefined, indexListHostProps, eventStore);
    bindIndexListHost(domNode as DomElementLike, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }

  if (node.kind === 'for_list') {
    updateDomProperties(domNode as DomElementLike, undefined, forListHostProps, eventStore);
    bindForListHost(domNode as DomElementLike, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }

  if (node.kind === 'portal') {
    patchPortalMount(
      domNode as DomElementLike,
      vnodePortal(node.target, []),
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }

  const element = domNode as DomElementLike;
  if (node.kind === 'element') {
    updateDomProperties(element, undefined, node.props, eventStore);
  }

  const existingChildren = readChildNodes(element);
  const nextChildren = asDomChildren(node);
  const nextDomChildren: DomNodeLike[] = [];

  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];
    const currentChild = existingChildren[index] as DomNodeLike | undefined;
    nextDomChildren.push(
      currentChild
        ? hydrateDomNode(currentChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
        : createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
    );
  }

  for (let index = nextChildren.length; index < existingChildren.length; index += 1) {
    disposeDomNode(existingChildren[index] as DomNodeLike, eventStore, portalStore, liveTextStore);
  }

  reorderChildren(
    element,
    nextDomChildren,
    (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
    {
      currentChildren: existingChildren as DomNodeLike[],
    }
  );
  return element;
};

export const createDomRenderer = (
  options: DomRendererOptions | undefined,
  equalsValue: (left: unknown, right: unknown) => boolean
): RenderRootRenderer<VNode> => {
  const documentLike = getDomDocument(options);
  const eventStore: DomEventStore = new Map();
  const portalStore: DomPortalStore = new WeakMap();
  const liveTextStore: DomLiveTextStore = new WeakMap();
  let currentDom: DomNodeLike | null = null;
  let currentVNode: VNode | null = null;

  return {
    mount(node: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
      currentDom = domNode;
      currentVNode = node;
    },
    patch(prev: VNode | null, next: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      if (!currentDom || !currentVNode || !prev) {
        const domNode = createDomNode(next, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = next;
        return;
      }
      const nextDom = patchDomNode(
        currentDom,
        prev,
        next,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      );
      if (nextDom !== currentDom) {
        reorderChildren(
          domContainer,
          [nextDom],
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
          {
            currentChildren: [currentDom],
          }
        );
      }
      currentDom = nextDom;
      currentVNode = next;
    },
    hydrate(node: VNode, container: unknown): void {
      const domContainer = container as DomNodeLike;
      const existing = (readChildNodes(domContainer)[0] as DomNodeLike | undefined) ?? null;
      if (!existing) {
        const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = node;
        return;
      }
      const hydratedDom = hydrateDomNode(existing, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      if (hydratedDom !== existing) {
        reorderChildren(
          domContainer,
          [hydratedDom],
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
          {
            currentChildren: [existing],
          }
        );
      }
      currentDom = hydratedDom;
      currentVNode = node;
    },
    unmount(container: unknown): void {
      const domContainer = container as DomNodeLike;
      replaceChildren(domContainer, [], eventStore, portalStore, liveTextStore);
      currentDom = null;
      currentVNode = null;
      eventStore.clear();
    },
  };
};
