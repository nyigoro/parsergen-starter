import './style.css';
import './main.lm';
import { defaultPlaygroundPreset, playgroundPresets, type PlaygroundPreset } from './presets';
import type { CompileDiagnostic, CompileResult, PlaygroundCompileInput } from './compiler-bridge';
import {
  addProjectFile,
  cloneProject,
  createRoutePreview,
  currentRouteLocation,
  decodeSharedState,
  encodeSharedState,
  getProjectFile,
  nextUntitledFileUri,
  projectFromPreset,
  removeProjectFile,
  replaceRouteLocation,
  routeHrefFromLocation,
  routePreviewCanGoBack,
  routePreviewCanGoForward,
  sanitizePersistedState,
  setActiveProjectFile,
  stepRoutePreview,
  type PersistedPlaygroundState,
  type PlaygroundProject,
  type PlaygroundProjectFile,
  type PlaygroundRouteLocation,
  type PlaygroundRoutePreview,
  updateProjectFileText,
} from './playground-state';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;

type CompileLuminaProject = (input: PlaygroundCompileInput) => CompileResult;
type FormatLuminaSource = (source: string) => string;
type PlaygroundBridge = {
  compileLuminaProject: CompileLuminaProject;
  formatLuminaSource: FormatLuminaSource;
};

type RunResult = {
  output: string;
  status: 'ok' | 'timeout' | 'error' | 'cancelled';
};

type PlaygroundUiState = {
  project: PlaygroundProject;
  routePreview: PlaygroundRoutePreview;
  consoleOutput: string;
};

const storageKey = 'lumina-playground-state-v2';
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
  const decoded = decodeSharedState(encoded);
  return decoded ? sanitizePersistedState(decoded) : null;
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

const renderDiagnostics = (element: HTMLElement, diagnostics: CompileDiagnostic[]): void => {
  if (diagnostics.length === 0) {
    element.innerHTML = '<p class="empty-state">No diagnostics.</p>';
    setText('diagnostic-count', '0');
    return;
  }

  setText('diagnostic-count', String(diagnostics.length));
  element.innerHTML = diagnostics
    .map((diagnostic) => {
      const locationParts = [
        diagnostic.fileUri ?? '',
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

const persistedStateFromUi = (state: PlaygroundUiState): PersistedPlaygroundState => ({
  version: 2,
  project: cloneProject(state.project),
  routePreview: {
    entries: state.routePreview.entries.map((entry) => ({ ...entry })),
    index: state.routePreview.index,
  },
  consoleOutput: state.consoleOutput,
});

const routeHrefForPreset = (preset: PlaygroundPreset, baseHref: string): string =>
  preset.routeHref ? new URL(preset.routeHref, baseHref).toString() : new URL('/', baseHref).toString();

const stateFromPreset = (preset: PlaygroundPreset, baseHref: string): PlaygroundUiState => ({
  project: projectFromPreset(preset),
  routePreview: createRoutePreview(routeHrefForPreset(preset, baseHref), baseHref),
  consoleOutput: 'Run the program to see output.',
});

const stateFromLegacySource = (source: string, baseHref: string): PlaygroundUiState => ({
  project: {
    presetId: null,
    entryUri: 'main.lm',
    activeFileUri: 'main.lm',
    files: [{ uri: 'main.lm', text: source }],
  },
  routePreview: createRoutePreview(new URL('/', baseHref).toString(), baseHref),
  consoleOutput: 'Run the program to see output.',
});

const resolveInitialState = (baseHref: string): PlaygroundUiState => {
  const sharedState = readSharedState();
  if (sharedState) {
    return {
      project: sharedState.project,
      routePreview: sharedState.routePreview,
      consoleOutput: sharedState.consoleOutput || 'Run the program to see output.',
    };
  }

  const sharedSource = readLegacySharedSource();
  if (sharedSource) return stateFromLegacySource(sharedSource, baseHref);

  const locationPreset = readPresetFromLocation();
  if (locationPreset) return stateFromPreset(locationPreset, baseHref);

  const storedState = readStoredState();
  if (storedState) {
    return {
      project: storedState.project,
      routePreview: storedState.routePreview,
      consoleOutput: storedState.consoleOutput || 'Run the program to see output.',
    };
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
  url.searchParams.set('project', encodeSharedState(persistedStateFromUi(state)));
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
  options: { href: string; signal: AbortSignal }
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
const updateRouterLocation = (nextUrl) => {
  const next = new URL(String(nextUrl ?? '/'), routerUrl);
  routerLocation.pathname = next.pathname;
  routerLocation.search = next.search;
  routerLocation.hash = next.hash;
};
const dispatchRouterEvent = () => {
  const event = { type: 'popstate' };
  for (const listener of Array.from(routerListeners)) {
    try {
      if (typeof listener === 'function') listener(event);
      else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(event);
    } catch {
      // Keep the playground runner resilient.
    }
  }
  return true;
};
const routerHistory = {
  state: null,
  scrollRestoration: 'auto',
  pushState(data, _unused, nextUrl) {
    this.state = data ?? null;
    if (nextUrl != null) updateRouterLocation(nextUrl);
    dispatchRouterEvent();
  },
  replaceState(data, _unused, nextUrl) {
    this.state = data ?? null;
    if (nextUrl != null) updateRouterLocation(nextUrl);
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
    return event && event.type === 'popstate' ? dispatchRouterEvent() : true;
  },
  scrollTo() {}
};
const routerDocument = { baseURI: routerUrl.toString() };
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
          logs?: string[];
          hasReturn?: boolean;
          returned?: string | null;
          error?: string | null;
        }>
      ) => {
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
  if (!diagnosticsRoot || !outputRoot || !consoleRoot || !moduleGraphRoot) {
    throw new Error('Playground panels did not mount.');
  }

  let state = resolveInitialState(playgroundBaseHref);
  let lastResult: CompileResult | null = null;
  let compilerBridge: PlaygroundBridge | null = null;
  let compilerLoadPromise: Promise<boolean> | null = null;
  let compileTimer: number | undefined;
  let suppressNextScheduledCompile = false;
  let activeRun:
    | {
        controller: AbortController;
      }
    | null = null;

  const persist = (): void => {
    writeStoredState(persistedStateFromUi(state));
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

  const renderFileList = (): void => {
    const fileList = document.getElementById('file-list-root');
    if (!fileList) return;
    fileList.innerHTML = state.project.files
      .map((file) => {
        const isActive = file.uri === state.project.activeFileUri;
        const isEntry = file.uri === state.project.entryUri;
        return `
          <button class="file-item"${isActive ? ' data-active="true"' : ''} data-file-uri="${escapeHtml(file.uri)}">
            <span class="file-item-name">${escapeHtml(file.uri)}</span>
            ${isEntry ? '<span class="file-item-badge">entry</span>' : ''}
          </button>
        `;
      })
      .join('');
    setText('active-file-label', state.project.activeFileUri);
    setText('active-file-stat', state.project.activeFileUri);
  };

  const syncProjectStats = (): void => {
    const totalLines = countProjectLines(state.project.files);
    setText('source-size', `${state.project.files.length} files • ${totalLines} lines`);
    setText('output-mode', lastResult ? `JS • ${lastResult.graphNodes} modules` : 'JS');
    setActivePreset(state.project.presetId);
    renderFileList();
    updateRouteUi();
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

  const syncProjectFromEditor = (): void => {
    const activeFile = getProjectFile(state.project, state.project.activeFileUri);
    if (!activeFile) return;
    const nextText = getEditorText('editor-root');
    if (nextText === activeFile.text) return;
    state = {
      ...state,
      project: updateProjectFileText({ ...state.project, presetId: null }, state.project.activeFileUri, nextText),
    };
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

  const renderLoadFailure = (message: string): void => {
    const diagnostic = [{ severity: 'error', message, code: 'PLAYGROUND-LOAD' } satisfies CompileDiagnostic];
    setText('compile-status', 'Load failed');
    setDataset('compile-status', 'status', 'error');
    setText('run-status', 'Blocked');
    setDataset('run-status', 'status', 'error');
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
    });
    renderModuleGraph(moduleGraphRoot, null);
    setConsoleOutput(message);
  };

  const compileProject = (): CompileResult | null => {
    if (!compilerBridge) {
      setText('compile-status', 'Loading compiler');
      setDataset('compile-status', 'status', 'running');
      outputRoot.textContent = 'Compiler bridge is still loading...';
      return null;
    }

    syncProjectFromEditor();
    cancelActiveRun('Execution cancelled after a project change.');

    const result = compilerBridge.compileLuminaProject({
      entryUri: state.project.entryUri,
      files: state.project.files,
    });
    lastResult = result;
    setText('compile-status', result.ok ? 'Compiled' : 'Needs attention');
    setDataset('compile-status', 'status', result.ok ? 'ok' : 'error');
    setText('output-mode', `JS • ${result.graphNodes} modules`);
    renderDiagnostics(diagnosticsRoot, result.diagnostics);
    renderOutput(outputRoot, result);
    renderModuleGraph(moduleGraphRoot, result);
    if (result.ok) {
      setText('run-status', 'Ready');
      setDataset('run-status', 'status', 'idle');
      if (!state.consoleOutput.trim()) {
        setConsoleOutput('Run the program to see output.');
      } else {
        consoleRoot.textContent = state.consoleOutput;
      }
    } else {
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      setConsoleOutput('Fix diagnostics before running.');
    }
    syncProjectStats();
    return result;
  };

  const ensureCompilerBridge = (): Promise<boolean> => {
    if (compilerBridge) return Promise.resolve(true);
    if (!compilerLoadPromise) {
      setText('compile-status', 'Loading compiler');
      setDataset('compile-status', 'status', 'running');
      outputRoot.textContent = 'Loading compiler bridge...';
      compilerLoadPromise = new Promise<boolean>((resolve) => {
        window.setTimeout(async () => {
          try {
            await import('./compiler-bridge');
            const compileLuminaProject = bridge.compileLuminaProject as CompileLuminaProject | undefined;
            const formatLuminaSource = bridge.formatLuminaSource as FormatLuminaSource | undefined;
            if (!compileLuminaProject || !formatLuminaSource) {
              throw new Error('Compiler tools did not register.');
            }

            compilerBridge = {
              compileLuminaProject,
              formatLuminaSource,
            };
            resolve(true);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            renderLoadFailure(message);
            showToast('Compiler tools failed to load.');
            resolve(false);
          }
        }, 0);
      }).finally(() => {
        compilerLoadPromise = null;
      });
    }

    return compilerLoadPromise;
  };

  const runSource = async (): Promise<void> => {
    const ready = await ensureCompilerBridge();
    if (!ready) return;
    const result = compileProject();
    if (!result || !result.ok) {
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      setConsoleOutput('Fix diagnostics before running.');
      return;
    }

    cancelActiveRun('Execution cancelled by a new run.');
    const controller = new AbortController();
    activeRun = { controller };
    setButtonDisabled('stop-run-button', false);
    setText('run-status', 'Running');
    setDataset('run-status', 'status', 'running');

    try {
      const routeHref = routeHrefFromLocation(currentRouteLocation(state.routePreview), playgroundBaseHref);
      const runResult = await runCompiledModule(result, { href: routeHref, signal: controller.signal });
      if (activeRun?.controller === controller) {
        activeRun = null;
        setButtonDisabled('stop-run-button', true);
      }
      setConsoleOutput(runResult.output);
      if (runResult.status === 'timeout') {
        setText('run-status', 'Timed out');
        setDataset('run-status', 'status', 'error');
      } else if (runResult.status === 'error') {
        setText('run-status', 'Error');
        setDataset('run-status', 'status', 'error');
      } else if (runResult.status === 'cancelled') {
        setText('run-status', 'Stopped');
        setDataset('run-status', 'status', 'error');
      } else {
        setText('run-status', 'Done');
        setDataset('run-status', 'status', 'ok');
      }
    } catch (error) {
      if (activeRun?.controller === controller) {
        activeRun = null;
        setButtonDisabled('stop-run-button', true);
      }
      setConsoleOutput(error instanceof Error ? error.message : String(error));
      setText('run-status', 'Error');
      setDataset('run-status', 'status', 'error');
    }
  };

  const applyRoutePreview = (
    nextPreview: PlaygroundRoutePreview,
    options: { rerun?: boolean; toast?: string } = {}
  ): void => {
    state = { ...state, routePreview: nextPreview };
    updateRouteUi();
    persist();
    setText('run-status', 'Ready');
    setDataset('run-status', 'status', 'idle');
    if (options.toast) showToast(options.toast);
    if (options.rerun && lastResult?.ok) {
      void runSource();
    }
  };

  mountEditor({
    elementId: 'editor-root',
    initialValue: getProjectFile(state.project, state.project.activeFileUri)?.text ?? '',
  });
  syncProjectStats();
  setText('compile-status', 'Loading compiler');
  setDataset('compile-status', 'status', 'running');
  outputRoot.textContent = 'Loading compiler bridge...';
  consoleRoot.textContent = state.consoleOutput;

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
    if (compileTimer) window.clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => {
      void ensureCompilerBridge().then((ready) => {
        if (ready) compileProject();
      });
    }, 220);
  });

  document.getElementById('check-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready) return;
      compileProject();
      showToast('Checked.');
    });
  });

  document.getElementById('run-button')?.addEventListener('click', () => {
    void runSource();
  });

  document.getElementById('stop-run-button')?.addEventListener('click', () => {
    cancelActiveRun('Execution stopped by the playground.');
    setConsoleOutput('Execution stopped by the playground.');
    setText('run-status', 'Stopped');
    setDataset('run-status', 'status', 'error');
  });

  document.getElementById('format-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready || !compilerBridge) return;
      if (compileTimer) window.clearTimeout(compileTimer);
      suppressNextScheduledCompile = true;
      const formatted = compilerBridge.formatLuminaSource(getEditorText('editor-root'));
      setEditorText('editor-root', formatted);
      syncProjectFromEditor();
      compileProject();
      showToast('Formatted.');
    });
  });

  document.getElementById('share-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const shareUrl = createShareUrl(state);
    window.history.replaceState(null, '', shareUrl);
    void copyText(shareUrl, 'Project link copied.');
  });

  document.getElementById('copy-js-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready) return;
      const result = lastResult ?? compileProject();
      if (!result) return;
      void copyText(result.js, 'JavaScript copied.');
    });
  });

  document.getElementById('new-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    const suggested = nextUntitledFileUri(state.project);
    const requested = window.prompt('New file path', suggested)?.trim();
    if (!requested) return;
    if (getProjectFile(state.project, requested)) {
      showToast('That file already exists.');
      return;
    }
    state = {
      ...state,
      project: addProjectFile(state.project, requested, requested.endsWith('.lm') ? 'fn main() -> int {\n  return 0\n}\n' : ''),
    };
    clearPresetUrl();
    syncProjectStats();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, requested)?.text ?? '');
    persist();
    void ensureCompilerBridge().then((ready) => {
      if (ready) compileProject();
    });
  });

  document.getElementById('delete-file-button')?.addEventListener('click', () => {
    syncProjectFromEditor();
    if (state.project.activeFileUri === state.project.entryUri) {
      showToast('Entry files stay protected.');
      return;
    }
    if (!window.confirm(`Delete ${state.project.activeFileUri}?`)) return;
    const nextProject = removeProjectFile(state.project, state.project.activeFileUri);
    if (nextProject === state.project) return;
    state = { ...state, project: nextProject };
    clearPresetUrl();
    const nextFile = getProjectFile(state.project, state.project.activeFileUri);
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', nextFile?.text ?? '');
    syncProjectStats();
    persist();
    void ensureCompilerBridge().then((ready) => {
      if (ready) compileProject();
    });
  });

  document.getElementById('file-list-root')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('[data-file-uri]');
    const nextUri = button?.dataset.fileUri;
    if (!nextUri || nextUri === state.project.activeFileUri) return;
    syncProjectFromEditor();
    mountActiveFile(nextUri);
    void ensureCompilerBridge().then((ready) => {
      if (ready) compileProject();
    });
  });

  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    button.addEventListener('click', () => {
      const selectedPresetId = button.id.startsWith('preset-')
        ? button.id.slice('preset-'.length)
        : '';
      const selectedPreset = playgroundPresets.find((preset) => preset.id === selectedPresetId);
      if (!selectedPreset) return;

      if (compileTimer) window.clearTimeout(compileTimer);
      cancelActiveRun('Execution cancelled after switching presets.');
      state = stateFromPreset(selectedPreset, playgroundBaseHref);
      suppressNextScheduledCompile = true;
      setEditorText('editor-root', getProjectFile(state.project, state.project.activeFileUri)?.text ?? '');
      writePresetUrl(selectedPreset.id);
      syncProjectStats();
      setConsoleOutput(state.consoleOutput);
      void ensureCompilerBridge().then((ready) => {
        if (ready) compileProject();
      });
    });
  });

  document.getElementById('route-apply-button')?.addEventListener('click', () => {
    applyRoutePreview(replaceRouteLocation(state.routePreview, readRouteInputs()), {
      rerun: true,
      toast: 'Preview route updated.',
    });
  });

  document.getElementById('route-push-button')?.addEventListener('click', () => {
    const next = replaceRouteLocation(state.routePreview, currentRouteLocation(state.routePreview));
    applyRoutePreview(
      {
        entries: [...next.entries.slice(0, next.index + 1), readRouteInputs()],
        index: next.index + 1,
      },
      { rerun: true, toast: 'Preview history pushed.' }
    );
  });

  document.getElementById('route-replace-button')?.addEventListener('click', () => {
    applyRoutePreview(replaceRouteLocation(state.routePreview, readRouteInputs()), {
      rerun: false,
      toast: 'Preview history replaced.',
    });
  });

  document.getElementById('route-back-button')?.addEventListener('click', () => {
    applyRoutePreview(stepRoutePreview(state.routePreview, -1), { rerun: true });
  });

  document.getElementById('route-forward-button')?.addEventListener('click', () => {
    applyRoutePreview(stepRoutePreview(state.routePreview, 1), { rerun: true });
  });

  document.getElementById('route-reset-button')?.addEventListener('click', () => {
    const preset = state.project.presetId
      ? playgroundPresets.find((entry) => entry.id === state.project.presetId) ?? defaultPlaygroundPreset
      : defaultPlaygroundPreset;
    applyRoutePreview(createRoutePreview(routeHrefForPreset(preset, playgroundBaseHref), playgroundBaseHref), {
      rerun: true,
      toast: 'Preview route reset.',
    });
  });

  void ensureCompilerBridge().then((ready) => {
    if (ready) compileProject();
  });
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
