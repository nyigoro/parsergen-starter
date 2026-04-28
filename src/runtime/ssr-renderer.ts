export interface SsrNodeLike {
  kind?: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: SsrNodeLike[];
  text?: string | null;
  signal?: { get(): unknown } | null;
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
  getProps: (node: TNode) => Record<string, unknown> | undefined;
  getChildren: (node: TNode) => TNode[];
  getText: (node: TNode) => string | null | undefined;
  getSignalValue: (node: TNode) => unknown;
}

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

export const serializeStyleValue = (value: Record<string, unknown>): string =>
  Object.entries(value)
    .filter(([, entry]) => entry !== null && entry !== undefined)
    .map(([key, entry]) => `${kebabCase(key)}:${String(entry)}`)
    .join(';');

export const serializePropsToHtml = (props: Record<string, unknown> | undefined): string => {
  if (!props) return '';
  const attrs: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'key') continue;
    if (key.startsWith('on') && typeof value === 'function') continue;
    if (value === false || value === null || value === undefined) continue;
    if (key === 'style' && typeof value === 'object' && value !== null) {
      const styleText = serializeStyleValue(value as Record<string, unknown>);
      if (styleText.length > 0) attrs.push(`style="${escapeHtml(styleText)}"`);
      continue;
    }
    if (value === true) {
      attrs.push(key);
      continue;
    }
    attrs.push(`${key}="${escapeHtml(String(value))}"`);
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

    const children = deps.getChildren(normalized).map((child) => vnodeToHtml(child)).join('');
    if (kind === 'fragment' || kind === 'portal') return children;

    const tag = deps.getTag(normalized) ?? 'div';
    const attrs = serializePropsToHtml(deps.getProps(normalized));
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
