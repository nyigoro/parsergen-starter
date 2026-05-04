export interface SsgPageOptions {
  title?: string;
  lang?: string;
  head?: string | string[];
  bodyClassName?: string;
  appClassName?: string;
  appId?: string;
  hydrateModule?: string;
  hydrationState?: unknown;
  hydrationStateId?: string;
}

export interface SsgApiDeps<VNodeLike, TComponentFn> {
  isVNode: (value: unknown) => value is VNodeLike;
  renderToString: (node: VNodeLike) => string;
  coerceRenderableToVNode: (value: unknown) => VNodeLike;
  escapeHtml: (value: string) => string;
  resolvePath: (value: string) => string;
  dirnamePath: (value: string) => string;
  getNodeBuiltinModule: (id: string) => unknown;
  renderApp: (componentFn: TComponentFn, props: unknown) => VNodeLike;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const coerceSsgPageOptions = (options: unknown): Required<SsgPageOptions> => {
  const candidate = asRecord(options);
  const headValue = candidate.head;
  const head = Array.isArray(headValue)
    ? headValue.map((entry) => String(entry))
    : headValue == null
      ? []
      : [String(headValue)];
  return {
    title: typeof candidate.title === 'string' ? candidate.title : '',
    lang: typeof candidate.lang === 'string' && candidate.lang.length > 0 ? candidate.lang : 'en',
    head,
    bodyClassName: typeof candidate.bodyClassName === 'string' ? candidate.bodyClassName : '',
    appClassName: typeof candidate.appClassName === 'string' ? candidate.appClassName : '',
    appId: typeof candidate.appId === 'string' && candidate.appId.length > 0 ? candidate.appId : 'app',
    hydrateModule: typeof candidate.hydrateModule === 'string' ? candidate.hydrateModule : '',
    hydrationState: candidate.hydrationState ?? candidate.state ?? null,
    hydrationStateId:
      typeof candidate.hydrationStateId === 'string' && candidate.hydrationStateId.length > 0
        ? candidate.hydrationStateId
        : '__lumina-hydration',
  };
};

const serializeHydrationState = (value: unknown): string =>
  JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

export const createSsgApi = <VNodeLike, TComponentFn>(deps: SsgApiDeps<VNodeLike, TComponentFn>) => {
  const renderPage = (body: unknown, options?: unknown): string => {
    const normalized = coerceSsgPageOptions(options);
    const bodyContent = deps.isVNode(body)
      ? deps.renderToString(body)
      : Array.isArray(body) || (body && typeof body === 'object')
        ? deps.renderToString(deps.coerceRenderableToVNode(body))
        : String(body ?? '');
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      normalized.title ? `<title>${deps.escapeHtml(normalized.title)}</title>` : '',
      ...normalized.head,
    ].filter((entry) => entry.length > 0).join('');
    const hydrateScript = normalized.hydrateModule
      ? `<script type="module" src="${deps.escapeHtml(normalized.hydrateModule)}"></script>`
      : '';
    const hydrationStateScript = normalized.hydrationState !== null
      ? `<script type="application/json" id="${deps.escapeHtml(normalized.hydrationStateId)}">${serializeHydrationState(normalized.hydrationState)}</script>`
      : '';
    const bodyClass = normalized.bodyClassName ? ` class="${deps.escapeHtml(normalized.bodyClassName)}"` : '';
    const appClass = normalized.appClassName ? ` class="${deps.escapeHtml(normalized.appClassName)}"` : '';
    return `<!DOCTYPE html><html lang="${deps.escapeHtml(normalized.lang)}"><head>${head}</head><body${bodyClass}><div id="${deps.escapeHtml(normalized.appId)}"${appClass}>${bodyContent}</div>${hydrationStateScript}${hydrateScript}</body></html>`;
  };

  const writePage = (filePath: string, body: unknown, options?: unknown): string => {
    const resolvedPath = deps.resolvePath(filePath);
    const fsModule = deps.getNodeBuiltinModule('node:fs') as {
      mkdirSync?: (path: string, options?: { recursive?: boolean }) => void;
      writeFileSync?: (path: string, content: string, encoding?: string) => void;
    } | null;
    if (!fsModule?.mkdirSync || !fsModule.writeFileSync) {
      throw new Error('SSG write requires Node.js file system support');
    }
    fsModule.mkdirSync(deps.dirnamePath(resolvedPath), { recursive: true });
    fsModule.writeFileSync(resolvedPath, renderPage(body, options), 'utf-8');
    return resolvedPath;
  };

  const renderAppPage = (componentFn: TComponentFn, props: unknown, options?: unknown): string =>
    renderPage(deps.renderApp(componentFn, props), options);

  const writeAppPage = (filePath: string, componentFn: TComponentFn, props: unknown, options?: unknown): string =>
    writePage(filePath, deps.renderApp(componentFn, props), options);

  return {
    renderPage,
    writePage,
    renderAppPage,
    writeAppPage,
  };
};
