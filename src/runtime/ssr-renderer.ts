export interface SsrNodeLike {
  kind?: string;
  tag?: string;
  key?: string | number;
  props?: Record<string, unknown>;
  children?: SsrNodeLike[];
  text?: string | null;
  signal?: { get(): unknown } | null;
  target?: string | null;
}

export interface SsrRendererLike<TNode> {
  mount: (node: TNode, container: unknown) => void;
  patch: (prev: TNode | null, next: TNode, container: unknown) => void;
  hydrate: (node: TNode, container: unknown) => void;
  unmount: (container: unknown) => void;
}

export interface SsrRuntimeDeps<TNode extends SsrNodeLike> {
  normalizeNodeForHtml: (node: TNode) => TNode;
  getKind: (node: TNode) => string;
  getTag: (node: TNode) => string | undefined;
  getKey?: (node: TNode) => string | number | undefined;
  getProps: (node: TNode) => Record<string, unknown> | undefined;
  getChildren: (node: TNode) => TNode[];
  getText: (node: TNode) => string | null | undefined;
  getSignalValue: (node: TNode) => unknown;
  getTarget?: (node: TNode) => string | null | undefined;
}

export const LUMINA_HYDRATION_KEY_ATTR = 'data-lumina-key';

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char);

const kebabCase = (value: string): string =>
  value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^ms-/, '-ms-');

const normalizeHtmlPropName = (name: string): string => {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  return name;
};

const isSafeHtmlAttrName = (name: string): boolean =>
  /^[A-Za-z_:-][A-Za-z0-9_.:-]*$/.test(name) && !/^on/i.test(name);

export const serializeStyleValue = (value: Record<string, unknown>): string =>
  Object.entries(value)
    .filter(([, entry]) => entry !== null && entry !== undefined)
    .map(([key, entry]) => `${kebabCase(key)}:${String(entry)}`)
    .join(';');

export const serializePropsToHtml = (
  props: Record<string, unknown> | undefined,
  hydrationKey?: string | number
): string => {
  const propSource = props ?? {};
  const attrs: string[] = [];
  const keyForHydration =
    typeof hydrationKey === 'string' || typeof hydrationKey === 'number'
      ? hydrationKey
      : typeof propSource.key === 'string' || typeof propSource.key === 'number'
        ? propSource.key
        : undefined;
  for (const [key, value] of Object.entries(propSource)) {
    if (key === 'key') continue;
    if (/^on/i.test(key)) continue;
    if (value === false || value === null || value === undefined) continue;
    const attrName = normalizeHtmlPropName(key);
    if (!isSafeHtmlAttrName(attrName)) continue;
    if (key === 'style' && typeof value === 'object' && value !== null) {
      const styleText = serializeStyleValue(value as Record<string, unknown>);
      if (styleText.length > 0) attrs.push(`style="${escapeHtml(styleText)}"`);
      continue;
    }
    if (value === true) {
      attrs.push(attrName);
      continue;
    }
    attrs.push(`${attrName}="${escapeHtml(String(value))}"`);
  }
  if (
    keyForHydration !== undefined &&
    !Object.prototype.hasOwnProperty.call(propSource, LUMINA_HYDRATION_KEY_ATTR)
  ) {
    attrs.push(`${LUMINA_HYDRATION_KEY_ATTR}="${escapeHtml(String(keyForHydration))}"`);
  }
  return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
};

const voidHtmlTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const setContainerMarkup = (container: unknown, output: string): void => {
  if (container && typeof container === 'object') {
    const target = container as {
      innerHTML?: string;
      html?: string;
      textContent?: string;
      write?: (value: string) => void;
    };
    if (typeof target.write === 'function') {
      target.write(output);
      return;
    }
    if (typeof target.innerHTML === 'string' || 'innerHTML' in target) {
      target.innerHTML = output;
      return;
    }
    if (typeof target.html === 'string' || 'html' in target) {
      target.html = output;
      return;
    }
    if (typeof target.textContent === 'string' || 'textContent' in target) {
      target.textContent = output;
      return;
    }
    target.html = output;
  }
};

export const createSsrRuntime = <TNode extends SsrNodeLike>(
  deps: SsrRuntimeDeps<TNode>
): {
  renderToString: (node: TNode) => string;
  createRenderer: () => SsrRendererLike<TNode>;
} => {
  const vnodeToHtml = (node: TNode): string => {
    const normalized = deps.normalizeNodeForHtml(node);
    const kind = deps.getKind(normalized);
    if (kind === 'text') return escapeHtml(deps.getText(normalized) ?? '');
    if (kind === 'live_text') return escapeHtml(String(deps.getSignalValue(normalized) ?? ''));

    const children = deps
      .getChildren(normalized)
      .map((child) => vnodeToHtml(child))
      .join('');
    if (kind === 'fragment') return children;
    if (kind === 'portal') {
      const target = deps.getTarget?.(normalized);
      const targetAttr = target ? ` data-lumina-portal-target="${escapeHtml(target)}"` : '';
      return `<lumina-portal-anchor hidden data-lumina-portal-anchor="true"${targetAttr}></lumina-portal-anchor>`;
    }

    const tag = deps.getTag(normalized) ?? 'div';
    const attrs = serializePropsToHtml(deps.getProps(normalized), deps.getKey?.(normalized));
    if (voidHtmlTags.has(tag.toLowerCase())) {
      return `<${tag}${attrs}>`;
    }
    return `<${tag}${attrs}>${children}</${tag}>`;
  };

  return {
    renderToString: vnodeToHtml,
    createRenderer: () => {
      let current = '';
      return {
        mount(node: TNode, container: unknown): void {
          current = vnodeToHtml(node);
          setContainerMarkup(container, current);
        },
        patch(_prev: TNode | null, next: TNode, container: unknown): void {
          current = vnodeToHtml(next);
          setContainerMarkup(container, current);
        },
        hydrate(node: TNode, container: unknown): void {
          current = vnodeToHtml(node);
          setContainerMarkup(container, current);
        },
        unmount(container: unknown): void {
          current = '';
          setContainerMarkup(container, '');
        },
      };
    },
  };
};
