import type { ComponentFunction } from '../frame-manager.js';

export type CustomElementProps = Record<string, unknown>;

export interface CustomElementMountOptions<P = CustomElementProps> {
  observedAttributes?: string[];
  useShadow?: boolean;
  props?: Partial<P>;
  mapProps?: (attrs: Record<string, string | null>, host: unknown) => P;
  registry?: {
    define?: (name: string, ctor: new () => unknown) => void;
    get?: (name: string) => unknown;
  };
  baseClass?: new () => unknown;
}

export interface CustomElementController<P = CustomElementProps, TRoot = unknown, TSignal = unknown> {
  root: TRoot;
  props: TSignal;
  host: unknown;
  target: unknown;
  updateProps: (next: P) => P;
  syncAttributes: () => P;
  disconnect: () => void;
}

interface CustomElementsRuntimeHooks<P, TRenderable, TRoot, TSignal, TRenderer, TDocumentLike> {
  createRenderer: (documentLike: TDocumentLike) => TRenderer;
  createSignal: (initial: P) => TSignal;
  getSignal: (signal: TSignal) => P;
  setSignal: (signal: TSignal, value: P) => void;
  createView: (componentFn: ComponentFunction<P, TRenderable>, propsSignal: TSignal) => () => TRenderable;
  mountReactive: (renderer: TRenderer, container: unknown, view: () => TRenderable) => TRoot;
  isDisposableLike: (value: unknown) => boolean;
  disposeReactive: (root: TRoot) => void;
  getGlobalDocument: () => TDocumentLike | undefined;
}

const readCustomElementAttributes = (
  host: unknown,
  observedAttributes: readonly string[]
): Record<string, string | null> => {
  const attrs: Record<string, string | null> = {};
  const element = host as { getAttribute?: (name: string) => string | null };
  for (const name of observedAttributes) {
    attrs[name] = typeof element.getAttribute === 'function' ? element.getAttribute(name) : null;
  }
  return attrs;
};

const buildCustomElementProps = <P>(
  host: unknown,
  options?: CustomElementMountOptions<P>
): P => {
  const attrs = readCustomElementAttributes(host, options?.observedAttributes ?? []);
  if (typeof options?.mapProps === 'function') {
    return options.mapProps(attrs, host);
  }
  return {
    ...((options?.props ?? {}) as Record<string, unknown>),
    ...attrs,
  } as P;
};

const ensureCustomElementTarget = <P>(host: unknown, options?: CustomElementMountOptions<P>): unknown => {
  const element = host as {
    shadowRoot?: unknown;
    attachShadow?: (options: { mode: string }) => unknown;
  };
  if (!options?.useShadow) return host;
  if (element.shadowRoot) return element.shadowRoot;
  if (typeof element.attachShadow === 'function') {
    return element.attachShadow({ mode: 'open' });
  }
  return host;
};

export const createCustomElementsRuntime = <
  P,
  TRenderable,
  TRoot,
  TSignal,
  TRenderer,
  TDocumentLike,
>(
  hooks: CustomElementsRuntimeHooks<P, TRenderable, TRoot, TSignal, TRenderer, TDocumentLike>
) => ({
  mountCustomElementHost: (
    host: unknown,
    componentFn: ComponentFunction<P, TRenderable>,
    options?: CustomElementMountOptions<P>
  ): CustomElementController<P, TRoot, TSignal> => {
    const documentLike =
      ((host as { ownerDocument?: TDocumentLike }).ownerDocument ?? hooks.getGlobalDocument());
    if (!documentLike) {
      throw new Error('mountCustomElement requires a document-like host');
    }

    const renderer = hooks.createRenderer(documentLike);
    const target = ensureCustomElementTarget(host, options);
    const props = hooks.createSignal(buildCustomElementProps(host, options));
    const root = hooks.mountReactive(renderer, target, hooks.createView(componentFn, props));

    return {
      root,
      props,
      host,
      target,
      updateProps: (next: P): P => {
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      },
      syncAttributes: (): P => {
        const next = buildCustomElementProps(host, options);
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      },
      disconnect: (): void => {
        if (hooks.isDisposableLike(root)) {
          hooks.disposeReactive(root);
        }
      },
    };
  },

  defineCustomElementClass: (
    tagName: string,
    componentFn: ComponentFunction<P, TRenderable>,
    options?: CustomElementMountOptions<P>
  ): new () => unknown => {
    const BaseCtor =
      (options?.baseClass as (new () => unknown) | undefined) ??
      ((globalThis as { HTMLElement?: new () => unknown }).HTMLElement ?? class {});
    const registry =
      options?.registry ??
      ((globalThis as {
        customElements?: { define?: (name: string, ctor: new () => unknown) => void; get?: (name: string) => unknown };
      }).customElements);

    const runtime = createCustomElementsRuntime(hooks);

    const CustomElement = class LuminaCustomElement extends (BaseCtor as new () => Record<string, unknown>) {
      private __luminaController?: CustomElementController<P, TRoot, TSignal>;

      static get observedAttributes(): string[] {
        return [...(options?.observedAttributes ?? [])];
      }

      connectedCallback(): void {
        if (!this.__luminaController) {
          this.__luminaController = runtime.mountCustomElementHost(this, componentFn, options);
        } else {
          this.__luminaController.syncAttributes();
        }
      }

      attributeChangedCallback(): void {
        this.__luminaController?.syncAttributes();
      }

      disconnectedCallback(): void {
        this.__luminaController?.disconnect();
        this.__luminaController = undefined;
      }
    };

    if (registry?.define) {
      const existing = typeof registry.get === 'function' ? registry.get(tagName) : undefined;
      if (!existing) {
        registry.define(tagName, CustomElement);
      }
    }

    return CustomElement;
  },
});
