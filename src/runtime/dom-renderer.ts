import { readChildNodes } from './dom-accessibility.js';
import {
  analyzeSequenceTransition,
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

const domTemplateCache = new WeakMap<DomDocumentLike, Map<string, DomTemplateLike>>();

const getDomDocument = (options?: DomRendererOptions): DomDocumentLike => {
  if (options?.document) return options.document;
  const doc = (globalThis as unknown as { document?: DomDocumentLike }).document;
  if (!doc) {
    throw new Error('DOM renderer requires a document-like object');
  }
  return doc;
};

const asDomChildren = (node: VNode): VNode[] => node.children ?? [];

const isEventProp = (name: string): boolean => /^on[A-Z]/.test(name);

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
    (element as unknown as Record<string, unknown>)[name] = value as never;
    return;
  }

  if (name in element) {
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

  if (nxt.autoFocus && prev.autoFocus !== nxt.autoFocus) {
    element.focus?.();
  }
};

const setChildren = (container: DomNodeLike, children: DomNodeLike[]): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
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
  }
};

const vnodeKindTag = (node: VNode): string => `${node.kind}:${node.tag ?? ''}`;

const hasVNodeKey = (node: VNode): node is VNode & { key: string | number } =>
  typeof node.key === 'string' || typeof node.key === 'number';

const hasKeyedChildren = (children: VNode[]): boolean => children.some((child) => hasVNodeKey(child));

const duplicateKeyError = (key: string | number): Error =>
  new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`);

const analyzeKeyedChildTransition = (prevChildren: VNode[], nextChildren: VNode[]): KeyedListTransition | null => {
  if (
    prevChildren.length !== nextChildren.length
    || !prevChildren.every((child) => hasVNodeKey(child))
    || !nextChildren.every((child) => hasVNodeKey(child))
  ) {
    return null;
  }

  const assertUniqueKeys = (children: VNode[]): void => {
    const seenKeys = new Set<string | number>();
    for (const child of children) {
      if (hasVNodeKey(child)) {
        if (seenKeys.has(child.key)) {
          throw duplicateKeyError(child.key);
        }
        seenKeys.add(child.key);
      }
    }
  };
  assertUniqueKeys(prevChildren);
  assertUniqueKeys(nextChildren);

  return analyzeSequenceTransition(prevChildren, nextChildren, (left, right) =>
    hasVNodeKey(left) && hasVNodeKey(right) ? left.key === right.key : false
  );
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

const createForListState = (entries: ForListEntry[]): ForListState => ({
  entries,
  entriesByKey: new Map(entries.map((entry) => [entry.key, entry] as const)),
  order: entries.map((entry) => entry.key),
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

const hasShallowEqualProps = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (left[key] !== right[key]) return false;
  }

  return true;
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

  if (prevChildren.length === 1) {
    return canSkipDomPatch(prevChildren[0], nextChildren[0], equalsValue);
  }

  void equalsValue;
  return false;
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

  const syncIndicesForRange = (
    nextEntries: ForListEntry[],
    transition: KeyedListTransition
  ): void => {
    const range = getTransitionAffectedRange(transition, nextEntries.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryIndex(entry, index);
    }
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
    if (nextItems.length === state.order.length) {
      let sameOrder = true;
      for (let index = 0; index < nextItems.length; index += 1) {
        const key = coerceListKey(keyOf(nextItems[index], index), index);
        if (state.order[index] !== key) {
          sameOrder = false;
          break;
        }
      }

      if (sameOrder) {
        runBatched(() => {
          for (let index = 0; index < nextItems.length; index += 1) {
            const entry = state.entries[index];
            if (!entry) continue;
            syncEntryValue(entry, nextItems[index]);
          }
        });
        return;
      }
    }

    const nextOrder = buildKeyedOrder(nextItems, keyOf);
    const transition = analyzeSequenceTransition(state.order, nextOrder, (left, right) => left === right);

    if (transition.kind === 'same_order') {
      runBatched(() => {
        syncValuesForOrder(nextItems, nextOrder);
      });
      return;
    }

    if (transition.kind === 'adjacent_swap' || transition.kind === 'single_move') {
      const nextEntries = nextOrder.map((key) => {
        const entry = state.entriesByKey.get(key);
        if (!entry) {
          throw new Error(`Missing keyed list entry '${String(key)}' during transition`);
        }
        return entry;
      });

      runBatched(() => {
        syncValuesForOrder(nextItems, nextOrder);
        syncIndicesForRange(nextEntries, transition);
      });

      state.entries = nextEntries;
      state.order = nextOrder;
      reorderChildren(
        host,
        nextEntries.map((entry) => entry.domNode),
        (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
        {
          transition,
          structureChanged: false,
        }
      );
      return;
    }

    let nextEntries: ForListEntry[] = [];
    let structureChanged = false;
    runBatched(() => {
      const built = buildNextEntries(nextItems, nextOrder);
      nextEntries = built.nextEntries;
      structureChanged = built.structureChanged;
      syncIndicesForRange(nextEntries, transition);
    });

    state.entries = nextEntries;
    state.order = nextOrder;
    reorderChildren(
      host,
      nextEntries.map((entry) => entry.domNode),
      (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
      {
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
  const keyedTransition = analyzeKeyedChildTransition(prevChildren, nextChildren);
  if (keyedTransition?.kind === 'same_order') {
    for (let i = 0; i < nextChildren.length; i += 1) {
      const domChild = element.childNodes[i];
      if (!domChild) {
        element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue));
        continue;
      }
      if (canSkipDomPatch(prevChildren[i], nextChildren[i], equalsValue)) {
        continue;
      }
      patchDomNode(domChild, prevChildren[i], nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    }
    return;
  }

  if (keyedTransition?.kind === 'adjacent_swap') {
    const currentDomChildren = readChildNodes(element);
    const leftDom = currentDomChildren[keyedTransition.left] as DomNodeLike | undefined;
    const rightDom = currentDomChildren[keyedTransition.right] as DomNodeLike | undefined;
    if (leftDom && rightDom && typeof element.insertBefore === 'function') {
      element.insertBefore(rightDom, leftDom);
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (index === keyedTransition.left) {
          if (!canSkipDomPatch(prevChildren[keyedTransition.right], nextChildren[index], equalsValue)) {
            patchDomNode(
              rightDom,
              prevChildren[keyedTransition.right],
              nextChildren[index],
              documentLike,
              eventStore,
              portalStore,
              liveTextStore,
              equalsValue
            );
          }
          continue;
        }
        if (index === keyedTransition.right) {
          if (!canSkipDomPatch(prevChildren[keyedTransition.left], nextChildren[index], equalsValue)) {
            patchDomNode(
              leftDom,
              prevChildren[keyedTransition.left],
              nextChildren[index],
              documentLike,
              eventStore,
              portalStore,
              liveTextStore,
              equalsValue
            );
          }
          continue;
        }
        const domChild = currentDomChildren[index] as DomNodeLike | undefined;
        if (!domChild || canSkipDomPatch(prevChildren[index], nextChildren[index], equalsValue)) {
          continue;
        }
        patchDomNode(domChild, prevChildren[index], nextChildren[index], documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      }
      return;
    }
  }

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

  for (const stale of prevKeyed.values()) {
    disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
  }
  for (let i = unkeyedIndex; i < prevUnkeyed.length; i += 1) {
    disposeDomNode(prevUnkeyed[i].domNode, eventStore, portalStore, liveTextStore);
  }

  const structureChanged =
    prevKeyed.size > 0
    || unkeyedIndex < prevUnkeyed.length
    || currentDomChildren.length !== nextDomChildren.length;
  reorderChildren(
    element,
    nextDomChildren,
    (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore),
    {
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
    (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore)
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
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore)
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
          (child) => disposeDomNode(child as DomNodeLike, eventStore, portalStore, liveTextStore)
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
