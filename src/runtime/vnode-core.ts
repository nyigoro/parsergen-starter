import { createStaticSignal, readSignalRaw, type Memo, type Signal } from './reactive-core.js';

export interface VNode {
  kind: 'text' | 'live_text' | 'index_list' | 'for_list' | 'element' | 'fragment' | 'portal';
  tag?: string;
  key?: string | number;
  text?: string;
  signal?: Signal<unknown> | Memo<unknown>;
  itemsSignal?: Signal<unknown>;
  listRender?: (item: Signal<unknown>, index: number) => VNodeInput;
  listIndexedRender?: (item: Signal<unknown>, index: Signal<number>) => VNodeInput;
  listKey?: (item: unknown, index: number) => string | number;
  props?: Record<string, unknown>;
  children?: VNode[];
  target?: string | null;
  domTemplateHtml?: string | null;
}

export type VNodeInput = VNode | string | number | boolean | null | undefined | VNodeInput[];
export type ComponentRenderable = VNodeInput;

export const normalizeVNodeChildren = (input: VNodeInput): VNode[] => {
  if (Array.isArray(input)) {
    const out: VNode[] = [];
    for (const child of input) {
      out.push(...normalizeVNodeChildren(child));
    }
    return out;
  }
  if (input && typeof input === 'object' && !isVNode(input)) {
    const iterator = (input as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iterator === 'function') {
      const out: VNode[] = [];
      for (const child of input as Iterable<unknown>) {
        out.push(...normalizeVNodeChildren(child as VNodeInput));
      }
      return out;
    }
  }
  if (input === null || input === undefined || input === false) return [];
  if (typeof input === 'object' && input !== null && isVNode(input)) {
    return [input];
  }
  return [vnodeText(input)];
};

export const sanitizeProps = (props: Record<string, unknown> | null | undefined): Record<string, unknown> => {
  if (!props) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
};

export const isVNode = (value: unknown): value is VNode => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<VNode>;
  return candidate.kind === 'text'
    || candidate.kind === 'live_text'
    || candidate.kind === 'index_list'
    || candidate.kind === 'for_list'
    || candidate.kind === 'element'
    || candidate.kind === 'fragment'
    || candidate.kind === 'portal';
};

export const vnodeText = (value: unknown): VNode => ({
  kind: 'text',
  text: value == null ? '' : String(value),
});

export const vnodeLiveText = (signal: Signal<unknown> | Memo<unknown>): VNode => ({
  kind: 'live_text',
  signal,
});

export const readIndexListValues = (signal: Signal<unknown>, tracked: boolean): unknown[] => {
  const value = readSignalRaw(signal, tracked);
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const iterator = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iterator === 'function') {
      return Array.from(value as Iterable<unknown>);
    }
  }
  return [];
};

export const indexListHostProps = {
  style: { display: 'contents' },
  'data-lumina-index-list': 'true',
};

export const forListHostProps = {
  style: { display: 'contents' },
  'data-lumina-for-list': 'true',
};

export const coerceListKey = (value: unknown, index: number): string | number => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new Error(`List key at index ${index} must be a string or number`);
};

export const coerceVNodeKey = (value: unknown, label: string = 'VNode key'): string | number => {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new Error(`${label} must be a string or number`);
};

const getPropsKey = (props: Record<string, unknown> | null | undefined): string | number | undefined => {
  if (!props || !Object.prototype.hasOwnProperty.call(props, 'key') || props.key === undefined) {
    return undefined;
  }
  return coerceVNodeKey(props.key);
};

export const vnodeIndexList = (
  itemsSignal: Signal<unknown>,
  renderItem: (item: Signal<unknown>, index: number) => VNodeInput
): VNode => ({
  kind: 'index_list',
  itemsSignal,
  listRender: renderItem,
});

export const vnodeForList = (
  itemsSignal: Signal<unknown>,
  keyOf: (item: unknown, index: number) => string | number,
  renderItem: (item: Signal<unknown>, index: Signal<number>) => VNodeInput
): VNode => ({
  kind: 'for_list',
  itemsSignal,
  listKey: keyOf,
  listIndexedRender: renderItem,
});

export const vnodeElement = (
  tag: string,
  props?: Record<string, unknown> | null,
  children: VNodeInput = []
): VNode => ({
  kind: 'element',
  tag,
  key: getPropsKey(props),
  props: sanitizeProps(props),
  children: normalizeVNodeChildren(children),
});

export const vnodeFragment = (children: VNodeInput = []): VNode => ({
  kind: 'fragment',
  children: normalizeVNodeChildren(children),
});

export const vnodePortal = (target: string | null | undefined, children: VNodeInput = []): VNode => ({
  kind: 'portal',
  target: target == null ? null : String(target),
  children: normalizeVNodeChildren(children),
});

const asVNodeChildren = (node: VNode): VNode[] => node.children ?? [];

export const coerceRenderableToVNode = (input: VNodeInput): VNode => {
  const children = normalizeVNodeChildren(input);
  if (children.length === 1) {
    return children[0];
  }
  return vnodeFragment(children);
};

export const applyVNodeKey = (node: VNode, key: unknown): VNode => {
  if (key === undefined || key === null) {
    return node;
  }
  const nextKey = coerceVNodeKey(key);
  if (node.key !== undefined) {
    if (node.key !== nextKey) {
      throw new Error(
        `Conflicting keyed child: child already has key '${String(node.key)}' but parent assigned '${String(nextKey)}'`
      );
    }
    return node;
  }
  return { ...node, key: nextKey };
};

export const materializeIndexListChildren = (node: VNode, tracked: boolean): VNode[] => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== 'function') {
    return [];
  }
  return readIndexListValues(source, tracked).map((value, index) =>
    coerceRenderableToVNode(renderItem(createStaticSignal(value), index))
  );
};

export const materializeForListChildren = (node: VNode, tracked: boolean): VNode[] => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== 'function' || typeof renderItem !== 'function') {
    return [];
  }
  const seenKeys = new Set<string | number>();
  return readIndexListValues(source, tracked).map((value, index) => {
    const key = coerceListKey(keyOf(value, index), index);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`);
    }
    seenKeys.add(key);
    const vnode = coerceRenderableToVNode(renderItem(createStaticSignal(value), createStaticSignal(index)));
    return applyVNodeKey(vnode, key);
  });
};

export const snapshotVNode = (node: VNode): VNode => {
  if (node.kind === 'live_text') {
    return vnodeText(node.signal ? node.signal.get() : '');
  }
  if (node.kind === 'index_list') {
    return vnodeElement('lumina-index-list', indexListHostProps, materializeIndexListChildren(node, false));
  }
  if (node.kind === 'for_list') {
    return vnodeElement('lumina-for-list', forListHostProps, materializeForListChildren(node, false));
  }
  if (node.kind === 'element' || node.kind === 'fragment' || node.kind === 'portal') {
    return {
      ...node,
      children: asVNodeChildren(node).map((child) => snapshotVNode(child)),
    };
  }
  return node;
};

export const resolveChildrenInput = (input: unknown): VNodeInput =>
  typeof input === 'function' ? (input as () => VNodeInput)() : (input as VNodeInput);

export const vnodeKeyed = (key: unknown, input: unknown): VNode =>
  applyVNodeKey(coerceRenderableToVNode(resolveChildrenInput(input)), key);

export const serializeVNode = (node: VNode): string => JSON.stringify(snapshotVNode(node));

export const parseVNode = (json: string): VNode => {
  const parsed = JSON.parse(json) as unknown;
  if (!isVNode(parsed)) throw new Error('Invalid VNode payload');
  return parsed;
};
