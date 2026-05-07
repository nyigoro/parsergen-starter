import './style.css';
import './main.lm';
import { compileProjectInWorker, formatSourceInWorker } from './compile-client';
import type {
  CompileDiagnostic,
  CompileImportResolution,
  CompileResult,
} from './compiler-bridge';
import { defaultPlaygroundPreset, playgroundPresets, type PlaygroundPreset } from './presets';
import {
  addProjectFile,
  cloneProject,
  closeProjectFile,
  createRoutePreview,
  createWorkspaceSnapshot,
  currentRouteLocation,
  decodeSharedState,
  duplicateProjectFile,
  encodeSharedState,
  getProjectFile,
  getWorkspaceSnapshot,
  nextDuplicateFileUri,
  nextUntitledFileUri,
  normalizeProjectUri,
  openProjectFile,
  parseWorkspaceExport,
  projectFromPreset,
  pushRouteLocation,
  removeProjectFile,
  removeWorkspaceSnapshot,
  renameProjectFile,
  replaceRouteLocation,
  routeHrefFromLocation,
  routeLocationFromHref,
  routePreviewCanGoBack,
  routePreviewCanGoForward,
  sanitizePersistedState,
  sanitizeWorkspaceCollection,
  serializeWorkspaceExport,
  setActiveProjectFile,
  setProjectEntryFile,
  stepRoutePreview,
  type PersistedPlaygroundState,
  type PlaygroundProject,
  type PlaygroundProjectFile,
  type PlaygroundRouteLocation,
  type PlaygroundRoutePreview,
  type PlaygroundWorkspaceCollection,
  type PlaygroundWorkspaceSnapshot,
  updateProjectFileText,
  upsertWorkspaceSnapshot,
} from './playground-state';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;

type RunResult = {
  output: string;
  status: 'ok' | 'timeout' | 'error' | 'cancelled';
};

type RouteEventEntry = {
  kind: string;
  href: string;
  at: number;
};

type PlaygroundUiState = {
  project: PlaygroundProject;
  routePreview: PlaygroundRoutePreview;
  consoleOutput: string;
  routeEvents: RouteEventEntry[];
  workspaceId: string | null;
  workspaceName: string;
  dirty: boolean;
};

const storageKey = 'lumina-playground-state-v3';
const workspaceStorageKey = 'lumina-playground-workspaces-v1';
const isDirectPlaygroundDev = import.meta.env.DEV && window.location.port === '5175';
const devAppUrl = (port: string, pathname: string): string =>
  `${window.location.protocol}//${window.location.hostname}:${port}${pathname}`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const fromBase64Url = (value: string): string | null => {
  try {
    const padded = value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const readLegacySharedSource = (): string | null => {
  const encoded = new URL(window.location.href).searchParams.get('code');
  return encoded ? fromBase64Url(encoded) : null;
};

const readSharedState = (): PersistedPlaygroundState | null => {
  const encoded = new URL(window.location.href).searchParams.get('project');
  if (!encoded) return null;
  return decodeSharedState(encoded);
};

const readPresetFromLocation = (): PlaygroundPreset | null => {
  const presetId = new URL(window.location.href).searchParams.get('preset');
  if (!presetId) return null;
  return playgroundPresets.find((preset) => preset.id === presetId) ?? null;
};

const readStoredState = (): PersistedPlaygroundState | null => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return sanitizePersistedState(JSON.parse(raw) as PersistedPlaygroundState);
  } catch {
    return null;
  }
};

const writeStoredState = (state: PersistedPlaygroundState): void => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Storage is optional for the playground.
  }
};

const readWorkspaceStore = (): PlaygroundWorkspaceCollection => {
  try {
    const raw = window.localStorage.getItem(workspaceStorageKey);
    return sanitizeWorkspaceCollection(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeWorkspaceCollection(null);
  }
};

const writeWorkspaceStore = (store: PlaygroundWorkspaceCollection): void => {
  try {
    window.localStorage.setItem(workspaceStorageKey, JSON.stringify(store));
  } catch {
    // Workspace snapshots are optional.
  }
};

const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setDataset = (id: string, key: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.dataset[key] = value;
};

const setButtonDisabled = (id: string, disabled: boolean): void => {
  const element = document.getElementById(id) as HTMLButtonElement | null;
  if (element) element.disabled = disabled;
};

const setInputValue = (id: string, value: string): void => {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (element) element.value = value;
};

const showToast = (message: string): void => {
  const toast = document.getElementById('toast-root');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.open = 'true';
  window.setTimeout(() => {
    delete toast.dataset.open;
  }, 1800);
};

const countProjectLines = (files: PlaygroundProjectFile[]): number =>
  files.reduce((count, file) => {
    const normalized = file.text.replace(/\r\n?/g, '\n').trim();
    if (normalized.length === 0) return count;
    return count + normalized.replace(/\n$/g, '').split('\n').length;
  }, 0);

const updateLinks = (): void => {
  const home = document.getElementById('home-link') as HTMLAnchorElement | null;
  const docs = document.getElementById('docs-link') as HTMLAnchorElement | null;
  if (home) home.href = isDirectPlaygroundDev ? devAppUrl('5173', '/') : '../';
  if (docs) docs.href = isDirectPlaygroundDev ? devAppUrl('5174', '/docs/') : '../docs/';
};

const basename = (uri: string): string => {
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
};

const formatTimestamp = (value: number): string => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
};

const cloneRoutePreview = (preview: PlaygroundRoutePreview): PlaygroundRoutePreview => ({
  entries: preview.entries.map((entry) => ({ ...entry })),
  index: preview.index,
});

const createRouteEvent = (kind: string, href: string): RouteEventEntry => ({
  kind,
  href,
  at: Date.now(),
});

const appendRouteEvent = (events: RouteEventEntry[], event: RouteEventEntry): RouteEventEntry[] =>
  [...events.slice(-23), event];

const renderDiagnostics = (element: HTMLElement, diagnostics: CompileDiagnostic[]): void => {
  if (diagnostics.length === 0) {
    element.innerHTML = '<p class="empty-state">No diagnostics.</p>';
    setText('diagnostic-count', '0');
    return;
  }

  setText('diagnostic-count', String(diagnostics.length));
  const grouped = new Map<string, CompileDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = diagnostic.fileUri ?? 'project';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(diagnostic);
    else grouped.set(key, [diagnostic]);
  }

  element.innerHTML = Array.from(grouped.entries())
    .map(([fileUri, items]) => {
      const body = items
        .map((diagnostic) => {
          const locationParts = [
            diagnostic.line ? `line ${diagnostic.line}` : '',
            diagnostic.column ? `col ${diagnostic.column}` : '',
          ].filter(Boolean);
          const location =
            locationParts.length > 0
              ? `<span class="diagnostic-line">${escapeHtml(locationParts.join(' • '))}</span>`
              : '';
          const code = diagnostic.code
            ? `<span class="diagnostic-code">${escapeHtml(diagnostic.code)}</span>`
            : '';
          return `
            <div class="diagnostic ${escapeHtml(diagnostic.severity)}">
              <div class="diagnostic-meta">
                <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
                ${code}
                ${location}
              </div>
              <p class="diagnostic-message">${escapeHtml(diagnostic.message)}</p>
            </div>
          `;
        })
        .join('');
      return `
        <section class="diagnostic-group">
          <div class="diagnostic-group-heading">${escapeHtml(fileUri)}</div>
          ${body}
        </section>
      `;
    })
    .join('');
};

const renderOutput = (element: HTMLElement, result: CompileResult): void => {
  if (result.ok) {
    element.textContent = result.js;
    return;
  }

  element.textContent = result.diagnostics
    .map((diagnostic) => {
      const prefix = diagnostic.fileUri ? `${diagnostic.fileUri}: ` : '';
      const line = diagnostic.line ? `line ${diagnostic.line}: ` : '';
      return `${prefix}${line}${diagnostic.message}`;
    })
    .join('\n');
};

const renderModuleGraph = (element: HTMLElement, result: CompileResult | null): void => {
  if (!result || result.runnableModules.length === 0) {
    element.innerHTML = '<p class="empty-state">Compile a project to inspect its module graph.</p>';
    return;
  }

  element.innerHTML = result.runnableModules
    .map((module) => {
      const imports =
        module.sourceImports.length > 0
          ? `<ul class="module-import-list">${module.sourceImports
              .map(
                (sourceImport) =>
                  `<li><code>${escapeHtml(sourceImport.resolvedUri)}</code></li>`
              )
              .join('')}</ul>`
          : '<p class="module-empty">No source-backed imports.</p>';
      return `
        <article class="module-card">
          <div class="module-card-top">
            <strong>${escapeHtml(module.uri)}</strong>
            <span class="small-pill">${module.sourceImports.length} imports</span>
          </div>
          ${imports}
        </article>
      `;
    })
    .join('');
};

const renderCompileDetails = (element: HTMLElement, result: CompileResult | null): void => {
  if (!result) {
    element.innerHTML = '<p class="empty-state">Compile a project to inspect timings and resolutions.</p>';
    return;
  }

  const timingRows = [
    ['diagnostics', result.timings.diagnosticsMs],
    ['lower', result.timings.lowerMs],
    ['codegen', result.timings.codegenMs],
    ['graph', result.timings.moduleGraphMs],
    ['total', result.timings.totalMs],
  ];
  const importRows =
    result.importResolutions.length > 0
      ? `<div class="compile-detail-block">
          <div class="compile-detail-heading">Resolved imports</div>
          ${result.importResolutions
            .map(
              (resolution: CompileImportResolution) => `
                <div class="compile-resolution-row">
                  <div class="compile-resolution-top">
                    <span class="small-pill">${escapeHtml(resolution.kind)}</span>
                    <code>${escapeHtml(resolution.fromUri)}</code>
                  </div>
                  <div class="compile-resolution-spec">
                    <code>${escapeHtml(resolution.specifier)}</code>
                    <span>→</span>
                    <code>${escapeHtml(resolution.resolvedUri)}</code>
                  </div>
                  <div class="compile-resolution-meta">${resolution.sourceBacked ? 'source-backed' : 'virtual only'}</div>
                </div>
              `
            )
            .join('')}
        </div>`
      : '<p class="module-empty">No imports resolved.</p>';

  element.innerHTML = `
    <div class="compile-detail-block">
      <div class="compile-detail-heading">Stage timings</div>
      ${timingRows
        .map(
          ([label, value]) => `
            <div class="insight-row">
              <span class="insight-key">${escapeHtml(label)}</span>
              <span class="insight-value">${value.toFixed(1)}ms</span>
            </div>
          `
        )
        .join('')}
    </div>
    ${importRows}
  `;
};

const renderRouteEvents = (element: HTMLElement, events: RouteEventEntry[]): void => {
  if (events.length === 0) {
    element.innerHTML = '<p class="empty-state">Run a routed app to inspect navigation events.</p>';
    return;
  }

  element.innerHTML = events
    .slice()
    .reverse()
    .map(
      (event) => `
        <article class="route-event-card">
          <div class="module-card-top">
            <strong>${escapeHtml(event.kind)}</strong>
            <span class="small-pill">${escapeHtml(formatTimestamp(event.at))}</span>
          </div>
          <code>${escapeHtml(event.href)}</code>
        </article>
      `
    )
    .join('');
};

const renderWorkspaceList = (
  element: HTMLElement,
  store: PlaygroundWorkspaceCollection,
  activeWorkspaceId: string | null
): void => {
  if (store.items.length === 0) {
    element.innerHTML = '<p class="empty-state">Save a workspace to reuse it later.</p>';
    return;
  }

  const recent = store.recentWorkspaceIds
    .map((id) => store.items.find((item) => item.id === id))
    .filter((item): item is PlaygroundWorkspaceSnapshot => Boolean(item))
    .slice(0, 6);

  element.innerHTML = recent
    .map(
      (workspace) => `
        <button class="workspace-chip"${
          workspace.id === activeWorkspaceId ? ' data-active="true"' : ''
        } data-workspace-id="${escapeHtml(workspace.id)}">
          <span class="workspace-chip-name">${escapeHtml(workspace.name)}</span>
          <span class="workspace-chip-meta">${escapeHtml(formatTimestamp(workspace.savedAt))}</span>
        </button>
      `
    )
    .join('');
};

const copyText = async (value: string, successMessage: string): Promise<void> => {
  if (!value.trim()) {
    showToast('Nothing to copy yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    showToast('Clipboard is unavailable.');
  }
};

const routeHrefForPreset = (preset: PlaygroundPreset, baseHref: string): string =>
  preset.routeHref ? new URL(preset.routeHref, baseHref).toString() : new URL('/', baseHref).toString();

const workspaceNameForPreset = (preset: PlaygroundPreset): string => preset.id;

const persistedStateFromPlayground = (state: PlaygroundUiState): PersistedPlaygroundState => ({
  version: 3,
  project: cloneProject(state.project),
  routePreview: cloneRoutePreview(state.routePreview),
  consoleOutput: state.consoleOutput,
});

const stateFromPersisted = (
  persisted: PersistedPlaygroundState,
  options: { workspaceId?: string | null; workspaceName?: string; dirty?: boolean } = {}
): PlaygroundUiState => ({
  project: cloneProject(persisted.project),
  routePreview: cloneRoutePreview(persisted.routePreview),
  consoleOutput: persisted.consoleOutput || 'Run the program to see output.',
  routeEvents: [],
  workspaceId: options.workspaceId ?? null,
  workspaceName: options.workspaceName ?? 'workspace',
  dirty: options.dirty ?? false,
});

const stateFromPreset = (preset: PlaygroundPreset, baseHref: string): PlaygroundUiState => ({
  project: projectFromPreset(preset),
  routePreview: createRoutePreview(routeHrefForPreset(preset, baseHref), baseHref),
  consoleOutput: 'Run the program to see output.',
  routeEvents: [createRouteEvent('seed', routeHrefForPreset(preset, baseHref))],
  workspaceId: null,
  workspaceName: workspaceNameForPreset(preset),
  dirty: false,
});

const stateFromLegacySource = (source: string, baseHref: string): PlaygroundUiState => ({
  project: {
    presetId: null,
    sourcePresetId: null,
    entryUri: 'main.lm',
    activeFileUri: 'main.lm',
    openFileUris: ['main.lm'],
    files: [{ uri: 'main.lm', text: source }],
  },
  routePreview: createRoutePreview(new URL('/', baseHref).toString(), baseHref),
  consoleOutput: 'Run the program to see output.',
  routeEvents: [createRouteEvent('seed', new URL('/', baseHref).toString())],
  workspaceId: null,
  workspaceName: 'shared-project',
  dirty: true,
});

const resolveInitialState = (
  baseHref: string,
  workspaceStore: PlaygroundWorkspaceCollection
): PlaygroundUiState => {
  const sharedState = readSharedState();
  if (sharedState) {
    return stateFromPersisted(sharedState, {
      workspaceName: 'shared-project',
      dirty: false,
    });
  }

  const sharedSource = readLegacySharedSource();
  if (sharedSource) return stateFromLegacySource(sharedSource, baseHref);

  const locationPreset = readPresetFromLocation();
  if (locationPreset) return stateFromPreset(locationPreset, baseHref);

  const storedState = readStoredState();
  if (storedState) {
    const activeWorkspace = workspaceStore.activeWorkspaceId
      ? getWorkspaceSnapshot(workspaceStore, workspaceStore.activeWorkspaceId)
      : undefined;
    return stateFromPersisted(storedState, {
      workspaceId: activeWorkspace?.id ?? null,
      workspaceName: activeWorkspace?.name ?? 'workspace',
      dirty: false,
    });
  }

  const activeWorkspace = workspaceStore.activeWorkspaceId
    ? getWorkspaceSnapshot(workspaceStore, workspaceStore.activeWorkspaceId)
    : undefined;
  if (activeWorkspace) {
    return stateFromPersisted(activeWorkspace.state, {
      workspaceId: activeWorkspace.id,
      workspaceName: activeWorkspace.name,
      dirty: false,
    });
  }

  return stateFromPreset(defaultPlaygroundPreset, baseHref);
};

const writePresetUrl = (presetId: string): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('preset', presetId);
  url.searchParams.delete('project');
  url.searchParams.delete('code');
  window.history.replaceState(null, '', url.toString());
};

const clearPresetUrl = (): void => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('preset') && !url.searchParams.has('project') && !url.searchParams.has('code')) {
    return;
  }
  url.searchParams.delete('preset');
  url.searchParams.delete('project');
  url.searchParams.delete('code');
  window.history.replaceState(null, '', url.toString());
};

const createShareUrl = (state: PlaygroundUiState): string => {
  const url = new URL(window.location.href);
  url.searchParams.set('project', encodeSharedState(persistedStateFromPlayground(state)));
  url.searchParams.delete('preset');
  url.searchParams.delete('code');
  return url.toString();
};

const setActivePreset = (presetId: string | null): void => {
  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    if (presetId && button.id === `preset-${presetId}`) button.dataset.active = 'true';
    else delete button.dataset.active;
  });
};

const rewriteModuleImportSource = (statement: string, nextSpecifier: string): string =>
  statement.replace(/\bfrom\s+["'][^"']+["']/, `from ${JSON.stringify(nextSpecifier)}`);

const runCompiledModule = async (
  result: CompileResult,
  options: {
    href: string;
    signal: AbortSignal;
    onRouteEvent?: (event: RouteEventEntry) => void;
  }
): Promise<RunResult> => {
  if (!result.hasMain) {
    return { output: 'No main() function found.', status: 'error' };
  }
  if (typeof Worker === 'undefined') {
    return { output: 'Worker execution is unavailable in this browser.', status: 'error' };
  }

  const moduleUrls = new Map<string, string>();
  const runnableModules = new Map(result.runnableModules.map((module) => [module.uri, module]));
  const materializeModule = (uri: string): string => {
    const existing = moduleUrls.get(uri);
    if (existing) return existing;
    const module = runnableModules.get(uri);
    if (!module) throw new Error(`Missing runnable module ${uri}`);
    const importLines = module.sourceImports.map((sourceImport) =>
      rewriteModuleImportSource(sourceImport.statement, materializeModule(sourceImport.resolvedUri))
    );
    const needsEntryExport = uri === result.runnableEntryUri;
    const moduleSource = `${importLines.length > 0 ? `${importLines.join('\n')}\n` : ''}${module.code}${
      needsEntryExport ? '\nexport { main as __luminaMain };\n' : ''
    }`;
    const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
    moduleUrls.set(uri, moduleUrl);
    return moduleUrl;
  };
  const entryModuleUrl =
    result.runnableEntryUri && result.runnableModules.length > 0
      ? materializeModule(result.runnableEntryUri)
      : URL.createObjectURL(
          new Blob([`${result.runnableJs}\nexport { main as __luminaMain };\n`], {
            type: 'text/javascript',
          })
        );
  const runnerSource = `
const moduleUrl = ${JSON.stringify(entryModuleUrl)};
const routerSandboxHref = ${JSON.stringify(options.href)};
const logs = [];
const routerUrl = new URL(routerSandboxHref);
const routerListeners = new Set();
const routerLocation = {
  pathname: routerUrl.pathname,
  search: routerUrl.search,
  hash: routerUrl.hash,
};
const currentRouteHref = () => {
  const next = new URL(routerUrl.toString());
  next.pathname = routerLocation.pathname;
  next.search = routerLocation.search;
  next.hash = routerLocation.hash;
  return next.toString();
};
const emitRoute = (kind) => {
  postMessage({
    type: 'route',
    kind,
    href: currentRouteHref(),
    at: Date.now(),
  });
};
const updateRouterLocation = (nextUrl) => {
  const next = new URL(String(nextUrl ?? '/'), routerUrl);
  routerLocation.pathname = next.pathname;
  routerLocation.search = next.search;
  routerLocation.hash = next.hash;
};
const dispatchRouterEvent = (kind) => {
  const event = { type: 'popstate' };
  for (const listener of Array.from(routerListeners)) {
    try {
      if (typeof listener === 'function') listener(event);
      else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(event);
    } catch {
      // Keep the playground runner resilient.
    }
  }
  emitRoute(kind);
  return true;
};
const routerHistory = {
  state: null,
  scrollRestoration: 'auto',
  pushState(data, _unused, nextUrl) {
    this.state = data ?? null;
    if (nextUrl != null) updateRouterLocation(nextUrl);
    dispatchRouterEvent('push');
  },
  replaceState(data, _unused, nextUrl) {
    this.state = data ?? null;
    if (nextUrl != null) updateRouterLocation(nextUrl);
    dispatchRouterEvent('replace');
  }
};
const routerWindow = {
  location: routerLocation,
  history: routerHistory,
  addEventListener(type, listener) {
    if (type === 'popstate') routerListeners.add(listener);
  },
  removeEventListener(type, listener) {
    if (type === 'popstate') routerListeners.delete(listener);
  },
  dispatchEvent(event) {
    return event && event.type === 'popstate' ? dispatchRouterEvent('popstate') : true;
  },
  scrollTo() {}
};
const routerDocument = { baseURI: currentRouteHref() };
try { Object.defineProperty(globalThis, 'window', { value: routerWindow, configurable: true }); } catch { globalThis.window = routerWindow; }
try { Object.defineProperty(globalThis, 'location', { value: routerLocation, configurable: true }); } catch { globalThis.location = routerLocation; }
try { Object.defineProperty(globalThis, 'history', { value: routerHistory, configurable: true }); } catch { globalThis.history = routerHistory; }
try { Object.defineProperty(globalThis, 'document', { value: routerDocument, configurable: true }); } catch { globalThis.document = routerDocument; }
const formatValue = (value) => {
  if (value === undefined) return 'void';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value && typeof value === 'object' && '$tag' in value) {
    const tagged = value;
    return tagged.$payload === undefined
      ? tagged.$tag
      : \`\${tagged.$tag}(\${formatValue(tagged.$payload)})\`;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};
console.log = (...args) => { logs.push(args.map(formatValue).join(' ')); };
console.error = (...args) => { logs.push(args.map(formatValue).join(' ')); };
emitRoute('seed');
(async () => {
  try {
    const module = await import(moduleUrl);
    const returned = await module.__luminaMain?.();
    postMessage({
      type: 'done',
      logs,
      hasReturn: returned !== undefined,
      returned: returned === undefined ? null : formatValue(returned),
      error: null
    });
  } catch (error) {
    postMessage({
      type: 'done',
      logs,
      hasReturn: false,
      returned: null,
      error: error instanceof Error ? error.message : String(error)
    });
  }
})();
`;
  const runnerUrl = URL.createObjectURL(new Blob([runnerSource], { type: 'text/javascript' }));
  const worker = new Worker(runnerUrl, { type: 'module' });

  try {
    return await new Promise<RunResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        worker.terminate();
        resolve({
          output:
            'Execution timed out after 5 seconds. Stop the program or simplify the workload and try again.',
          status: 'timeout',
        });
      }, 5000);

      const abort = () => {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve({
          output: options.signal.reason ? String(options.signal.reason) : 'Execution cancelled.',
          status: 'cancelled',
        });
      };

      if (options.signal.aborted) {
        abort();
        return;
      }

      options.signal.addEventListener('abort', abort, { once: true });

      worker.onmessage = (
        event: MessageEvent<{
          type?: string;
          kind?: string;
          href?: string;
          at?: number;
          logs?: string[];
          hasReturn?: boolean;
          returned?: string | null;
          error?: string | null;
        }>
      ) => {
        if (event.data?.type === 'route') {
          if (event.data.kind && event.data.href) {
            options.onRouteEvent?.({
              kind: event.data.kind,
              href: event.data.href,
              at: event.data.at ?? Date.now(),
            });
          }
          return;
        }
        if (event.data?.type !== 'done') return;
        options.signal.removeEventListener('abort', abort);
        window.clearTimeout(timeout);
        worker.terminate();

        const lines = [...(event.data.logs ?? [])];
        if (event.data.error) lines.push(event.data.error);
        if (event.data.hasReturn && event.data.returned) {
          lines.push(`return ${event.data.returned}`);
        }

        resolve({
          output: lines.length > 0 ? lines.join('\n') : 'main() completed.',
          status: event.data.error ? 'error' : 'ok',
        });
      };

      worker.onerror = (event) => {
        options.signal.removeEventListener('abort', abort);
        window.clearTimeout(timeout);
        worker.terminate();
        reject(new Error(event.message || 'Worker execution failed.'));
      };
    });
  } finally {
    URL.revokeObjectURL(runnerUrl);
    for (const moduleUrl of moduleUrls.values()) {
      URL.revokeObjectURL(moduleUrl);
    }
    if (!result.runnableEntryUri || result.runnableModules.length === 0) {
      URL.revokeObjectURL(entryModuleUrl);
    }
  }
};

const readRouteInputs = (): PlaygroundRouteLocation => ({
  pathname: (document.getElementById('route-path-input') as HTMLInputElement | null)?.value || '/',
  search: (document.getElementById('route-search-input') as HTMLInputElement | null)?.value || '',
  hash: (document.getElementById('route-hash-input') as HTMLInputElement | null)?.value || '',
});

const createImportInput = (): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  return input;
};

const downloadTextFile = (filename: string, text: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const startPlayground = async (): Promise<void> => {
  updateLinks();
  const playgroundBaseHref = new URL('/', window.location.href).toString();
  const bridge = globalThis as Record<string, unknown>;
  await import('./codemirror-bridge');

  const mountEditor = bridge.mountEditor as MountEditor | undefined;
  const getEditorText = bridge.getEditorText as GetEditorText | undefined;
  const setEditorText = bridge.setEditorText as SetEditorText | undefined;
  const onEditorChange = bridge.onEditorChange as OnEditorChange | undefined;
  if (!mountEditor || !getEditorText || !setEditorText || !onEditorChange) {
    throw new Error('Editor tools did not load.');
  }

  const diagnosticsRoot = document.getElementById('diagnostics-root');
  const outputRoot = document.getElementById('output-root');
  const consoleRoot = document.getElementById('console-root');
  const moduleGraphRoot = document.getElementById('module-graph-root');
  const compileDetailsRoot = document.getElementById('compile-details-root');
  const routeEventsRoot = document.getElementById('route-events-root');
  if (!diagnosticsRoot || !outputRoot || !consoleRoot || !moduleGraphRoot || !compileDetailsRoot || !routeEventsRoot) {
    throw new Error('Playground panels did not mount.');
  }

  let workspaceStore = readWorkspaceStore();
  let state = resolveInitialState(playgroundBaseHref, workspaceStore);
  let lastResult: CompileResult | null = null;
  let compileTimer: number | undefined;
  let suppressNextScheduledCompile = false;
  let activeCompileController: AbortController | null = null;
  let activeRun:
    | {
        controller: AbortController;
      }
    | null = null;

  const importWorkspaceInput = createImportInput();

  const persist = (): void => {
    writeStoredState(persistedStateFromPlayground(state));
  };

  const setCompileStatus = (label: string, status: 'idle' | 'running' | 'ok' | 'error'): void => {
    setText('compile-status', label);
    setDataset('compile-status', 'status', status);
  };

  const setRunStatus = (label: string, status: 'idle' | 'running' | 'ok' | 'error'): void => {
    setText('run-status', label);
    setDataset('run-status', 'status', status);
  };

  const markDirty = (): void => {
    if (!state.dirty) state = { ...state, dirty: true };
  };

  const updateRouteUi = (): void => {
    const location = currentRouteLocation(state.routePreview);
    setInputValue('route-path-input', location.pathname);
    setInputValue('route-search-input', location.search);
    setInputValue('route-hash-input', location.hash);
    setText('route-preview-url', routeHrefFromLocation(location, playgroundBaseHref));
    setButtonDisabled('route-back-button', !routePreviewCanGoBack(state.routePreview));
    setButtonDisabled('route-forward-button', !routePreviewCanGoForward(state.routePreview));
  };

  const renderFileTabs = (): void => {
    const fileTabs = document.getElementById('file-tabs-root');
    if (!fileTabs) return;
    fileTabs.innerHTML = state.project.openFileUris
      .map((uri) => {
        const isActive = uri === state.project.activeFileUri;
        const isEntry = uri === state.project.entryUri;
        return `
          <div class="file-tab"${isActive ? ' data-active="true"' : ''}>
            <button class="file-tab-button" data-file-uri="${escapeHtml(uri)}">
              <span>${escapeHtml(basename(uri))}</span>
              ${isEntry ? '<span class="file-item-badge">entry</span>' : ''}
            </button>
            <button class="file-tab-close" data-close-file-uri="${escapeHtml(uri)}" aria-label="Close ${escapeHtml(
              uri
            )}">×</button>
          </div>
        `;
      })
      .join('');
  };

  const renderFileList = (): void => {
    const fileList = document.getElementById('file-list-root');
    if (!fileList) return;
    fileList.innerHTML = state.project.files
      .map((file) => {
        const isActive = file.uri === state.project.activeFileUri;
        const isEntry = file.uri === state.project.entryUri;
        const depth = file.uri.split('/').length - 1;
        return `
          <button class="file-item"${isActive ? ' data-active="true"' : ''} data-file-uri="${escapeHtml(
            file.uri
          )}" style="padding-left:${12 + depth * 14}px">
            <span class="file-item-name">${escapeHtml(file.uri)}</span>
            ${isEntry ? '<span class="file-item-badge">entry</span>' : ''}
          </button>
        `;
      })
      .join('');
    setText('active-file-label', state.project.activeFileUri);
    setText('active-file-stat', state.project.activeFileUri);
    setText('entry-file-label', `entry: ${state.project.entryUri}`);
  };

  const syncProjectStats = (): void => {
    const totalLines = countProjectLines(state.project.files);
    setText('source-size', `${state.project.files.length} files • ${totalLines} lines`);
    setText('output-mode', lastResult ? `JS • ${lastResult.graphNodes} modules` : 'JS');
    setText(
      'insight-compile',
      lastResult ? `${lastResult.timings.totalMs.toFixed(1)}ms total` : 'Browser worker'
    );
    setText(
      'insight-run',
      activeRun ? 'running' : state.consoleOutput.trim().length > 0 ? 'main() ready' : 'idle'
    );
    setText('insight-share', 'Project URL + local');
    setText('insight-modules', lastResult ? String(lastResult.graphNodes) : '0');
    setText('insight-graph', lastResult ? `${lastResult.graphEdges} edges` : '0 edges');
    setText('insight-workspace', state.workspaceId ? state.workspaceName : 'ephemeral');
    setText('workspace-status-pill', state.dirty ? 'dirty' : state.workspaceId ? 'saved' : 'local');
    setDataset('workspace-status-pill', 'status', state.dirty ? 'error' : 'ok');
    setInputValue('workspace-name-input', state.workspaceName);
    setActivePreset(state.project.presetId);
    renderFileTabs();
    renderFileList();
    renderRouteEvents(routeEventsRoot, state.routeEvents);
    renderWorkspaceList(
      document.getElementById('recent-workspaces-root') as HTMLElement,
      workspaceStore,
      state.workspaceId
    );
    updateRouteUi();
    setButtonDisabled('delete-workspace-button', !state.workspaceId);
  };

  const setConsoleOutput = (value: string): void => {
    state = { ...state, consoleOutput: value };
    consoleRoot.textContent = value;
    persist();
  };

  const cancelActiveRun = (message: string): void => {
    if (!activeRun) return;
    activeRun.controller.abort(message);
    activeRun = null;
    setButtonDisabled('stop-run-button', true);
  };

  const cancelActiveCompile = (reason: string, options: { showMessage?: boolean } = {}): void => {
    if (!activeCompileController) return;
    const controller = activeCompileController;
    activeCompileController = null;
    controller.abort(reason);
    setButtonDisabled('stop-compile-button', true);
    if (options.showMessage) {
      setCompileStatus('Compile stopped', 'error');
      showToast('Compile stopped.');
    }
  };

  const syncProjectFromEditor = (): void => {
    const activeFile = getProjectFile(state.project, state.project.activeFileUri);
    if (!activeFile) return;
    const nextText = getEditorText('editor-root');
    if (nextText === activeFile.text) return;
    state = {
      ...state,
      project: updateProjectFileText({ ...state.project, presetId: null }, state.project.activeFileUri, nextText),
    };
    markDirty();
    syncProjectStats();
    persist();
  };

  const mountActiveFile = (uri: string): void => {
    const activeFile = getProjectFile(state.project, uri);
    if (!activeFile) return;
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', activeFile.text);
    state = { ...state, project: setActiveProjectFile(state.project, uri) };
    syncProjectStats();
    persist();
  };

  const applyLoadedState = (
    nextState: PlaygroundUiState,
    options: { updateUrl?: 'preset' | 'clear' | 'share'; compile?: boolean } = {}
  ): void => {
    if (compileTimer) window.clearTimeout(compileTimer);
    cancelActiveCompile('Superseded by a new project load.');
    cancelActiveRun('Execution cancelled after loading a new project.');
    state = nextState;
    lastResult = null;
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, state.project.activeFileUri)?.text ?? '');
    if (options.updateUrl === 'preset' && state.project.presetId) writePresetUrl(state.project.presetId);
    if (options.updateUrl === 'clear') clearPresetUrl();
    if (options.updateUrl === 'share') window.history.replaceState(null, '', createShareUrl(state));
    syncProjectStats();
    setConsoleOutput(state.consoleOutput);
    renderModuleGraph(moduleGraphRoot, null);
    renderCompileDetails(compileDetailsRoot, null);
    if (options.compile !== false) void compileProject();
  };

  const renderLoadFailure = (message: string): void => {
    const diagnostic = [{ severity: 'error', message, code: 'PLAYGROUND-LOAD' } satisfies CompileDiagnostic];
    setCompileStatus('Load failed', 'error');
    setRunStatus('Blocked', 'error');
    renderDiagnostics(diagnosticsRoot, diagnostic);
    renderOutput(outputRoot, {
      ok: false,
      js: '',
      runnableJs: '',
      runnableEntryUri: null,
      runnableModules: [],
      hasMain: false,
      diagnostics: diagnostic,
      entryUri: state.project.entryUri,
      graphEdges: 0,
      graphNodes: 0,
      importResolutions: [],
      timings: {
        diagnosticsMs: 0,
        lowerMs: 0,
        codegenMs: 0,
        moduleGraphMs: 0,
        totalMs: 0,
      },
    });
    renderModuleGraph(moduleGraphRoot, null);
    renderCompileDetails(compileDetailsRoot, null);
    setConsoleOutput(message);
  };

  const compileProject = async (): Promise<CompileResult | null> => {
    syncProjectFromEditor();
    cancelActiveRun('Execution cancelled after a project change.');
    cancelActiveCompile('Superseded by a new compile.');

    const controller = new AbortController();
    activeCompileController = controller;
    setButtonDisabled('stop-compile-button', false);
    setCompileStatus('Compiling…', 'running');
    outputRoot.textContent = 'Compiling project in a browser worker...';

    try {
      const result = await compileProjectInWorker(
        {
          entryUri: state.project.entryUri,
          files: state.project.files,
        },
        controller.signal
      );
      if (activeCompileController !== controller) return null;
      activeCompileController = null;
      setButtonDisabled('stop-compile-button', true);
      lastResult = result;
      setCompileStatus(result.ok ? `Compiled • ${result.timings.totalMs.toFixed(1)}ms` : 'Needs attention', result.ok ? 'ok' : 'error');
      setText('output-mode', `JS • ${result.graphNodes} modules`);
      renderDiagnostics(diagnosticsRoot, result.diagnostics);
      renderOutput(outputRoot, result);
      renderModuleGraph(moduleGraphRoot, result);
      renderCompileDetails(compileDetailsRoot, result);
      if (result.ok) {
        setRunStatus('Ready', 'idle');
        if (!state.consoleOutput.trim()) {
          setConsoleOutput('Run the program to see output.');
        } else {
          consoleRoot.textContent = state.consoleOutput;
        }
      } else {
        setRunStatus('Blocked', 'error');
        setConsoleOutput('Fix diagnostics before running.');
      }
      syncProjectStats();
      return result;
    } catch (error) {
      if (activeCompileController === controller) {
        activeCompileController = null;
        setButtonDisabled('stop-compile-button', true);
      }
      if (controller.signal.aborted) {
        setCompileStatus('Compile stopped', 'error');
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      renderLoadFailure(message);
      return null;
    }
  };

  const scheduleCompile = (delay = 220): void => {
    if (compileTimer) window.clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => {
      void compileProject();
    }, delay);
  };

  const applySandboxRouteEvent = (event: RouteEventEntry): void => {
    const location = routeLocationFromHref(event.href, playgroundBaseHref);
    const nextPreview =
      event.kind === 'replace' || event.kind === 'seed'
        ? replaceRouteLocation(state.routePreview, location)
        : pushRouteLocation(state.routePreview, location);
    state = {
      ...state,
      routePreview: nextPreview,
      routeEvents: appendRouteEvent(state.routeEvents, event),
    };
    updateRouteUi();
    renderRouteEvents(routeEventsRoot, state.routeEvents);
    persist();
  };

  const runSource = async (): Promise<void> => {
    const result = await compileProject();
    if (!result || !result.ok) {
      setRunStatus('Blocked', 'error');
      setConsoleOutput('Fix diagnostics before running.');
      return;
    }

    cancelActiveRun('Execution cancelled by a new run.');
    const controller = new AbortController();
    activeRun = { controller };
    setButtonDisabled('stop-run-button', false);
    setRunStatus('Running', 'running');

    try {
      const routeHref = routeHrefFromLocation(currentRouteLocation(state.routePreview), playgroundBaseHref);
      const runResult = await runCompiledModule(result, {
        href: routeHref,
        signal: controller.signal,
        onRouteEvent: applySandboxRouteEvent,
      });
      if (activeRun?.controller === controller) {
        activeRun = null;
        setButtonDisabled('stop-run-button', true);
      }
      setConsoleOutput(runResult.output);
      if (runResult.status === 'timeout') {
        setRunStatus('Timed out', 'error');
      } else if (runResult.status === 'error') {
        setRunStatus('Error', 'error');
      } else if (runResult.status === 'cancelled') {
        setRunStatus('Stopped', 'error');
      } else {
        setRunStatus('Done', 'ok');
      }
      syncProjectStats();
    } catch (error) {
      if (activeRun?.controller === controller) {
        activeRun = null;
        setButtonDisabled('stop-run-button', true);
      }
      setConsoleOutput(error instanceof Error ? error.message : String(error));
      setRunStatus('Error', 'error');
    }
  };

  const applyRoutePreviewState = (
    nextPreview: PlaygroundRoutePreview,
    options: { rerun?: boolean; toast?: string; kind?: string } = {}
  ): void => {
    const href = routeHrefFromLocation(currentRouteLocation(nextPreview), playgroundBaseHref);
    state = {
      ...state,
      routePreview: nextPreview,
      routeEvents: appendRouteEvent(state.routeEvents, createRouteEvent(options.kind ?? 'preview', href)),
    };
    updateRouteUi();
    renderRouteEvents(routeEventsRoot, state.routeEvents);
    persist();
    setRunStatus('Ready', 'idle');
    if (options.toast) showToast(options.toast);
    if (options.rerun && lastResult?.ok) {
      void runSource();
    }
  };

  const suggestWorkspaceFilename = (): string =>
    `${(state.workspaceName || 'workspace').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'workspace'}.json`;

  const saveWorkspace = (forceNewId: boolean): void => {
    syncProjectFromEditor();
    const requestedName =
      forceNewId || !state.workspaceName.trim()
        ? window.prompt('Workspace name', state.workspaceName || 'workspace')?.trim() ?? ''
        : state.workspaceName.trim();
    if (!requestedName) {
      showToast('Workspace name is required.');
      return;
    }

    const snapshot = createWorkspaceSnapshot(
      requestedName,
      persistedStateFromPlayground(state),
      forceNewId || !state.workspaceId ? undefined : state.workspaceId
    );
    workspaceStore = upsertWorkspaceSnapshot(workspaceStore, snapshot);
    writeWorkspaceStore(workspaceStore);
    state = {
      ...state,
      workspaceId: snapshot.id,
      workspaceName: snapshot.name,
      dirty: false,
    };
    persist();
    syncProjectStats();
    showToast(forceNewId ? 'Workspace saved as new.' : 'Workspace saved.');
  };

  const loadWorkspace = (workspaceId: string): void => {
    const snapshot = getWorkspaceSnapshot(workspaceStore, workspaceId);
    if (!snapshot) {
      showToast('Workspace not found.');
      return;
    }
    applyLoadedState(
      stateFromPersisted(snapshot.state, {
        workspaceId: snapshot.id,
        workspaceName: snapshot.name,
        dirty: false,
      }),
      { updateUrl: 'clear', compile: true }
    );
  };

  const scaffoldPackageFiles = (): void => {
    syncProjectFromEditor();
    const packageName = window.prompt('Package name', 'demo-utils')?.trim();
    if (!packageName) return;
    const version = window.prompt('Package version', '0.1.0')?.trim() || '0.1.0';
    const lockUri = 'lumina.lock';
    const packageRoot = `.lumina/packages/${packageName}@${version}`;
    const libraryUri = `${packageRoot}/src/lib.lm`;
    let nextProject = cloneProject(state.project);
    if (!getProjectFile(nextProject, lockUri)) {
      nextProject = addProjectFile(
        nextProject,
        lockUri,
        `{\n  "version": 1,\n  "packages": {\n    "${packageName}@${version}": {\n      "name": "${packageName}",\n      "version": "${version}",\n      "resolved": "https://registry.example.dev/${packageName}-${version}.tgz",\n      "path": "./${packageRoot}",\n      "integrity": "sha256:todo",\n      "lumina": "./src/lib.lm",\n      "deps": {}\n    }\n  }\n}\n`
      );
    }
    if (!getProjectFile(nextProject, libraryUri)) {
      nextProject = addProjectFile(
        nextProject,
        libraryUri,
        `pub fn marker() -> string {\n  "${packageName}:${version}"\n}\n`
      );
    }
    state = { ...state, project: setActiveProjectFile(nextProject, libraryUri) };
    markDirty();
    clearPresetUrl();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, state.project.activeFileUri)?.text ?? '');
    syncProjectStats();
    persist();
    scheduleCompile(0);
    showToast('Package scaffold added.');
  };

  mountEditor({
    elementId: 'editor-root',
    initialValue: getProjectFile(state.project, state.project.activeFileUri)?.text ?? '',
  });
  syncProjectStats();
  setCompileStatus('Idle', 'idle');
  setRunStatus('Not run', 'idle');
  outputRoot.textContent = 'Compile the project to inspect JavaScript output.';
  consoleRoot.textContent = state.consoleOutput;
  renderModuleGraph(moduleGraphRoot, null);
  renderCompileDetails(compileDetailsRoot, null);

  onEditorChange('editor-root', () => {
    state = {
      ...state,
      project: { ...state.project, presetId: null },
    };
    clearPresetUrl();
    syncProjectFromEditor();
    if (suppressNextScheduledCompile) {
      suppressNextScheduledCompile = false;
      return;
    }
    scheduleCompile();
  });

  document.getElementById('workspace-name-input')?.addEventListener('input', (event) => {
    const next = (event.target as HTMLInputElement).value;
    state = { ...state, workspaceName: next };
    markDirty();
    syncProjectStats();
    persist();
  });

  document.getElementById('check-button')?.addEventListener('click', () => {
    void compileProject().then(() => showToast('Checked.'));
  });

  document.getElementById('run-button')?.addEventListener('click', () => {
    void runSource();
  });

  document.getElementById('stop-run-button')?.addEventListener('click', () => {
    cancelActiveRun('Execution stopped by the playground.');
    setConsoleOutput('Execution stopped by the playground.');
    setRunStatus('Stopped', 'error');
  });

  document.getElementById('stop-compile-button')?.addEventListener('click', () => {
    cancelActiveCompile('Compile stopped by the playground.', { showMessage: true });
  });

  document.getElementById('format-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    void formatSourceInWorker(getEditorText('editor-root'))
      .then((formatted) => {
        if (compileTimer) window.clearTimeout(compileTimer);
        suppressNextScheduledCompile = true;
        setEditorText('editor-root', formatted);
        syncProjectFromEditor();
        return compileProject();
      })
      .then(() => showToast('Formatted.'))
      .catch((error) => renderLoadFailure(error instanceof Error ? error.message : String(error)));
  });

  document.getElementById('share-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const shareUrl = createShareUrl(state);
    window.history.replaceState(null, '', shareUrl);
    void copyText(shareUrl, 'Project link copied.');
  });

  document.getElementById('copy-js-button')?.addEventListener('click', () => {
    void (lastResult ? Promise.resolve(lastResult) : compileProject()).then((result) => {
      if (!result) return;
      void copyText(result.js, 'JavaScript copied.');
    });
  });

  document.getElementById('save-workspace-button')?.addEventListener('click', () => {
    saveWorkspace(false);
  });

  document.getElementById('save-workspace-as-button')?.addEventListener('click', () => {
    saveWorkspace(true);
  });

  document.getElementById('delete-workspace-button')?.addEventListener('click', () => {
    if (!state.workspaceId) {
      showToast('Nothing saved yet.');
      return;
    }
    if (!window.confirm(`Delete workspace ${state.workspaceName}?`)) return;
    workspaceStore = removeWorkspaceSnapshot(workspaceStore, state.workspaceId);
    writeWorkspaceStore(workspaceStore);
    state = { ...state, workspaceId: null, dirty: true };
    syncProjectStats();
    persist();
    showToast('Workspace deleted.');
  });

  document.getElementById('export-workspace-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    downloadTextFile(
      suggestWorkspaceFilename(),
      serializeWorkspaceExport(state.workspaceName, persistedStateFromPlayground(state))
    );
    showToast('Workspace exported.');
  });

  importWorkspaceInput.addEventListener('change', async () => {
    const file = importWorkspaceInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseWorkspaceExport(text);
    importWorkspaceInput.value = '';
    if (!imported) {
      showToast('That JSON does not look like a Lumina workspace.');
      return;
    }
    applyLoadedState(
      stateFromPersisted(imported.state, {
        workspaceId: null,
        workspaceName: imported.name,
        dirty: true,
      }),
      { updateUrl: 'clear', compile: true }
    );
    showToast('Workspace imported.');
  });

  document.getElementById('import-workspace-button')?.addEventListener('click', () => {
    importWorkspaceInput.click();
  });

  document.getElementById('reset-workspace-button')?.addEventListener('click', () => {
    const presetId = state.project.sourcePresetId;
    const preset = presetId
      ? playgroundPresets.find((entry) => entry.id === presetId)
      : defaultPlaygroundPreset;
    if (!preset) {
      showToast('No source preset is available for reset.');
      return;
    }
    if (!window.confirm(`Reset this workspace back to ${preset.label}?`)) return;
    const next = stateFromPreset(preset, playgroundBaseHref);
    applyLoadedState(
      {
        ...next,
        workspaceId: state.workspaceId,
        workspaceName: state.workspaceName,
        dirty: true,
      },
      { updateUrl: 'clear', compile: true }
    );
    showToast('Workspace reset to preset.');
  });

  document.getElementById('scaffold-package-button')?.addEventListener('click', () => {
    scaffoldPackageFiles();
  });

  document.getElementById('new-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const suggested = nextUntitledFileUri(state.project);
    const requested = normalizeProjectUri(window.prompt('New file path', suggested)?.trim() ?? '');
    if (!requested) return;
    if (getProjectFile(state.project, requested)) {
      showToast('That file already exists.');
      return;
    }
    state = {
      ...state,
      project: addProjectFile(
        state.project,
        requested,
        requested.endsWith('.lm') ? 'fn main() -> int {\n  return 0\n}\n' : ''
      ),
    };
    clearPresetUrl();
    markDirty();
    syncProjectStats();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, requested)?.text ?? '');
    persist();
    scheduleCompile(0);
  });

  document.getElementById('rename-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const requested = normalizeProjectUri(
      window.prompt('Rename or move file', state.project.activeFileUri)?.trim() ?? ''
    );
    if (!requested || requested === state.project.activeFileUri) return;
    if (getProjectFile(state.project, requested)) {
      showToast('That file already exists.');
      return;
    }
    state = {
      ...state,
      project: renameProjectFile(state.project, state.project.activeFileUri, requested),
    };
    clearPresetUrl();
    markDirty();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, requested)?.text ?? '');
    syncProjectStats();
    persist();
    scheduleCompile(0);
  });

  document.getElementById('duplicate-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const suggested = nextDuplicateFileUri(state.project, state.project.activeFileUri);
    const requested = normalizeProjectUri(
      window.prompt('Duplicate file as', suggested)?.trim() ?? ''
    );
    if (!requested) return;
    if (getProjectFile(state.project, requested)) {
      showToast('That file already exists.');
      return;
    }
    state = {
      ...state,
      project: duplicateProjectFile(state.project, state.project.activeFileUri, requested),
    };
    clearPresetUrl();
    markDirty();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, requested)?.text ?? '');
    syncProjectStats();
    persist();
    scheduleCompile(0);
  });

  document.getElementById('set-entry-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    state = {
      ...state,
      project: setProjectEntryFile(state.project, state.project.activeFileUri),
    };
    clearPresetUrl();
    markDirty();
    syncProjectStats();
    persist();
    scheduleCompile(0);
    showToast('Entry file updated.');
  });

  document.getElementById('delete-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    if (state.project.activeFileUri === state.project.entryUri) {
      showToast('Entry files stay protected.');
      return;
    }
    if (!window.confirm(`Delete ${state.project.activeFileUri}?`)) return;
    const nextProject = removeProjectFile(state.project, state.project.activeFileUri);
    state = { ...state, project: nextProject };
    clearPresetUrl();
    markDirty();
    const nextFile = getProjectFile(state.project, state.project.activeFileUri);
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', nextFile?.text ?? '');
    syncProjectStats();
    persist();
    scheduleCompile(0);
  });

  document.getElementById('file-list-root')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-file-uri]');
    const nextUri = button?.dataset.fileUri;
    if (!nextUri || nextUri === state.project.activeFileUri) return;
    syncProjectFromEditor();
    state = { ...state, project: openProjectFile(state.project, nextUri) };
    mountActiveFile(nextUri);
    scheduleCompile(0);
  });

  document.getElementById('file-tabs-root')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const closeButton = target?.closest<HTMLElement>('[data-close-file-uri]');
    if (closeButton?.dataset.closeFileUri) {
      const nextProject = closeProjectFile(state.project, closeButton.dataset.closeFileUri);
      state = { ...state, project: nextProject };
      suppressNextScheduledCompile = true;
      setEditorText('editor-root', getProjectFile(state.project, state.project.activeFileUri)?.text ?? '');
      syncProjectStats();
      persist();
      return;
    }

    const openButton = target?.closest<HTMLElement>('[data-file-uri]');
    const nextUri = openButton?.dataset.fileUri;
    if (!nextUri || nextUri === state.project.activeFileUri) return;
    syncProjectFromEditor();
    mountActiveFile(nextUri);
  });

  document.getElementById('recent-workspaces-root')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-workspace-id]');
    const workspaceId = button?.dataset.workspaceId;
    if (!workspaceId) return;
    loadWorkspace(workspaceId);
  });

  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedPresetId = button.id.startsWith('preset-')
        ? button.id.slice('preset-'.length)
        : '';
      const selectedPreset = playgroundPresets.find((preset) => preset.id === selectedPresetId);
      if (!selectedPreset) return;

      applyLoadedState(stateFromPreset(selectedPreset, playgroundBaseHref), {
        updateUrl: 'preset',
        compile: true,
      });
    });
  });

  document.getElementById('route-apply-button')?.addEventListener('click', () => {
    applyRoutePreviewState(replaceRouteLocation(state.routePreview, readRouteInputs()), {
      rerun: true,
      toast: 'Preview route updated.',
      kind: 'apply',
    });
  });

  document.getElementById('route-push-button')?.addEventListener('click', () => {
    applyRoutePreviewState(pushRouteLocation(state.routePreview, readRouteInputs()), {
      rerun: true,
      toast: 'Preview history pushed.',
      kind: 'push',
    });
  });

  document.getElementById('route-replace-button')?.addEventListener('click', () => {
    applyRoutePreviewState(replaceRouteLocation(state.routePreview, readRouteInputs()), {
      rerun: false,
      toast: 'Preview history replaced.',
      kind: 'replace',
    });
  });

  document.getElementById('route-back-button')?.addEventListener('click', () => {
    applyRoutePreviewState(stepRoutePreview(state.routePreview, -1), { rerun: true, kind: 'back' });
  });

  document.getElementById('route-forward-button')?.addEventListener('click', () => {
    applyRoutePreviewState(stepRoutePreview(state.routePreview, 1), { rerun: true, kind: 'forward' });
  });

  document.getElementById('route-reset-button')?.addEventListener('click', () => {
    const preset = state.project.sourcePresetId
      ? playgroundPresets.find((entry) => entry.id === state.project.sourcePresetId) ?? defaultPlaygroundPreset
      : defaultPlaygroundPreset;
    applyRoutePreviewState(createRoutePreview(routeHrefForPreset(preset, playgroundBaseHref), playgroundBaseHref), {
      rerun: true,
      toast: 'Preview route reset.',
      kind: 'reset',
    });
  });

  document.addEventListener('keydown', (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveWorkspace(false);
      return;
    }
    if (meta && event.key === 'Enter') {
      event.preventDefault();
      void runSource();
    }
  });

  void compileProject();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void startPlayground().catch((error) => {
      showToast('Playground failed to start.');
      const message = error instanceof Error ? error.message : String(error);
      setText('compile-status', 'Load failed');
      setDataset('compile-status', 'status', 'error');
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      setText('diagnostic-count', '1');
      const diagnosticsRoot = document.getElementById('diagnostics-root');
      const outputRoot = document.getElementById('output-root');
      const consoleRoot = document.getElementById('console-root');
      if (diagnosticsRoot) {
        diagnosticsRoot.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
      }
      if (outputRoot) outputRoot.textContent = message;
      if (consoleRoot) consoleRoot.textContent = message;
    });
  });
} else {
  void startPlayground().catch((error) => {
    showToast('Playground failed to start.');
    const message = error instanceof Error ? error.message : String(error);
    setText('compile-status', 'Load failed');
    setDataset('compile-status', 'status', 'error');
    setText('run-status', 'Blocked');
    setDataset('run-status', 'status', 'error');
    setText('diagnostic-count', '1');
    const diagnosticsRoot = document.getElementById('diagnostics-root');
    const outputRoot = document.getElementById('output-root');
    const consoleRoot = document.getElementById('console-root');
    if (diagnosticsRoot) {
      diagnosticsRoot.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
    }
    if (outputRoot) outputRoot.textContent = message;
    if (consoleRoot) consoleRoot.textContent = message;
  });
}
