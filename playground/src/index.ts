import './style.css';
import './main.lm';
import { defaultPlaygroundPreset, playgroundPresets, type PlaygroundPreset } from './presets';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;

type CompileDiagnostic = {
  severity: string;
  message: string;
  line?: number;
  column?: number;
  code?: string;
};

type CompileResult = {
  ok: boolean;
  js: string;
  runnableJs: string;
  runnableEntryUri: string | null;
  runnableModules: Array<{
    uri: string;
    code: string;
    sourceImports: Array<{
      resolvedUri: string;
      statement: string;
    }>;
  }>;
  hasMain: boolean;
  diagnostics: CompileDiagnostic[];
};

type CompileLuminaSource = (source: string) => CompileResult;
type FormatLuminaSource = (source: string) => string;
type PlaygroundBridge = {
  compileLuminaSource: CompileLuminaSource;
  formatLuminaSource: FormatLuminaSource;
};
type RunResult = {
  output: string;
  status: 'ok' | 'timeout' | 'error';
};

const storageKey = 'lumina-playground-source';
const isDirectPlaygroundDev = import.meta.env.DEV && window.location.port === '5175';
const devAppUrl = (port: string, path: string): string =>
  `${window.location.protocol}//${window.location.hostname}:${port}${path}`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
};

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

const readSharedSource = (): string | null => {
  const encoded = new URL(window.location.href).searchParams.get('code');
  return encoded ? fromBase64Url(encoded) : null;
};

const readPresetFromLocation = (): PlaygroundPreset | null => {
  const presetId = new URL(window.location.href).searchParams.get('preset');
  if (!presetId) return null;
  return playgroundPresets.find((preset) => preset.id === presetId) ?? null;
};

const readStoredSource = (): string | null => {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

const writeStoredSource = (source: string): void => {
  try {
    window.localStorage.setItem(storageKey, source);
  } catch {
    // Storage is optional; sharing and compiling still work without it.
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

const showToast = (message: string): void => {
  const toast = document.getElementById('toast-root');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.open = 'true';
  window.setTimeout(() => {
    delete toast.dataset.open;
  }, 1800);
};

const updateSourceStats = (source: string): void => {
  const lines = source.trim().length === 0 ? 0 : source.replace(/\n$/g, '').split('\n').length;
  setText('source-size', `${lines} ${lines === 1 ? 'line' : 'lines'}`);
};

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
        diagnostic.line ? `line ${diagnostic.line}` : '',
        diagnostic.column ? `col ${diagnostic.column}` : '',
      ].filter(Boolean);
      const location =
        locationParts.length > 0
          ? `<span class="diagnostic-line">${escapeHtml(locationParts.join(', '))}</span>`
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
      const prefix = diagnostic.line ? `line ${diagnostic.line}: ` : '';
      return `${prefix}${diagnostic.message}`;
    })
    .join('\n');
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

const createShareUrl = (source: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set('code', toBase64Url(source));
  url.searchParams.delete('preset');
  return url.toString();
};

const writePresetUrl = (presetId: string): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('preset', presetId);
  url.searchParams.delete('code');
  window.history.replaceState(null, '', url.toString());
};

const clearPresetUrl = (): void => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('preset')) return;
  url.searchParams.delete('preset');
  window.history.replaceState(null, '', url.toString());
};

const setActivePreset = (presetId: string | null): void => {
  document.querySelectorAll<HTMLElement>('.preset-button').forEach((button) => {
    if (presetId && button.id === `preset-${presetId}`) button.dataset.active = 'true';
    else delete button.dataset.active;
  });
};

const rewriteModuleImportSource = (statement: string, nextSpecifier: string): string =>
  statement.replace(/\bfrom\s+["'][^"']+["']/, `from ${JSON.stringify(nextSpecifier)}`);

const runCompiledModule = async (result: CompileResult): Promise<RunResult> => {
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
    if (!module) {
      throw new Error(`Missing runnable module ${uri}`);
    }
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
      : URL.createObjectURL(new Blob([`${result.runnableJs}\nexport { main as __luminaMain };\n`], { type: 'text/javascript' }));
  const routerSandboxHref = new URL('/', window.location.href).toString();
  const runnerSource = `
const moduleUrl = ${JSON.stringify(entryModuleUrl)};
const routerSandboxHref = ${JSON.stringify(routerSandboxHref)};
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
          output: 'Execution timed out after 5 seconds. Stop the program or simplify the workload and try again.',
          status: 'timeout',
        });
      }, 5000);

      worker.onmessage = (event: MessageEvent<{
        type?: string;
        logs?: string[];
        hasReturn?: boolean;
        returned?: string | null;
        error?: string | null;
      }>) => {
        if (event.data?.type !== 'done') return;
        window.clearTimeout(timeout);
        worker.terminate();

        const lines = [...(event.data.logs ?? [])];
        if (event.data.error) {
          lines.push(event.data.error);
        }
        if (event.data.hasReturn && event.data.returned) {
          lines.push(`return ${event.data.returned}`);
        }

        resolve({
          output: lines.length > 0 ? lines.join('\n') : 'main() completed.',
          status: event.data.error ? 'error' : 'ok',
        });
      };

      worker.onerror = (event) => {
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

const startPlayground = async (): Promise<void> => {
  updateLinks();

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
  if (!diagnosticsRoot || !outputRoot || !consoleRoot) {
    throw new Error('Playground panels did not mount.');
  }

  let lastResult: CompileResult | null = null;
  let compilerBridge: PlaygroundBridge | null = null;
  let compilerLoadPromise: Promise<boolean> | null = null;
  const sharedSource = readSharedSource();
  const locationPreset = sharedSource ? null : readPresetFromLocation();
  const initialSource =
    sharedSource ?? locationPreset?.source ?? readStoredSource() ?? defaultPlaygroundPreset.source;
  const initialPreset =
    locationPreset?.id ??
    (initialSource === defaultPlaygroundPreset.source ? defaultPlaygroundPreset.id : null);

  const renderLoadFailure = (message: string): void => {
    const diagnostic = [{ severity: 'error', message, code: 'PLAYGROUND-LOAD' }];
    setText('compile-status', 'Load failed');
    setDataset('compile-status', 'status', 'error');
    setText('run-status', 'Blocked');
    setDataset('run-status', 'status', 'error');
    diagnosticsRoot.innerHTML = '';
    renderDiagnostics(diagnosticsRoot, diagnostic);
    outputRoot.textContent = message;
    consoleRoot.textContent = message;
  };

  const compileAndRender = (): CompileResult | null => {
    if (!compilerBridge) {
      setText('compile-status', 'Loading compiler');
      setDataset('compile-status', 'status', 'running');
      outputRoot.textContent = 'Compiler bridge is still loading...';
      return null;
    }

    const source = getEditorText('editor-root');
    updateSourceStats(source);
    writeStoredSource(source);
    const result = compilerBridge.compileLuminaSource(source);
    lastResult = result;
    setText('compile-status', result.ok ? 'Compiled' : 'Needs attention');
    setDataset('compile-status', 'status', result.ok ? 'ok' : 'error');
    setText('output-mode', 'JS');
    renderDiagnostics(diagnosticsRoot, result.diagnostics);
    renderOutput(outputRoot, result);
    if (result.ok) {
      setText('run-status', 'Not run');
      setDataset('run-status', 'status', 'idle');
      consoleRoot.textContent = 'Run the program to see output.';
    } else {
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      consoleRoot.textContent = 'Fix diagnostics before running.';
    }
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
            const compileLuminaSource = bridge.compileLuminaSource as CompileLuminaSource | undefined;
            const formatLuminaSource = bridge.formatLuminaSource as FormatLuminaSource | undefined;
            if (!compileLuminaSource || !formatLuminaSource) {
              throw new Error('Compiler tools did not register.');
            }

            compilerBridge = {
              compileLuminaSource,
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
    const result = compileAndRender();
    if (!result || !result.ok) {
      setText('run-status', 'Blocked');
      setDataset('run-status', 'status', 'error');
      consoleRoot.textContent = 'Fix diagnostics before running.';
      return;
    }

    setText('run-status', 'Running');
    setDataset('run-status', 'status', 'running');
    try {
      const runResult = await runCompiledModule(result);
      consoleRoot.textContent = runResult.output;
      if (runResult.status === 'timeout') {
        setText('run-status', 'Timed out');
        setDataset('run-status', 'status', 'error');
      } else if (runResult.status === 'error') {
        setText('run-status', 'Error');
        setDataset('run-status', 'status', 'error');
      } else {
        setText('run-status', 'Done');
        setDataset('run-status', 'status', 'ok');
      }
    } catch (error) {
      consoleRoot.textContent = error instanceof Error ? error.message : String(error);
      setText('run-status', 'Error');
      setDataset('run-status', 'status', 'error');
    }
  };

  mountEditor({
    elementId: 'editor-root',
    initialValue: initialSource,
  });
  setActivePreset(initialPreset);
  updateSourceStats(initialSource);
  setText('compile-status', 'Loading compiler');
  setDataset('compile-status', 'status', 'running');
  outputRoot.textContent = 'Loading compiler bridge...';

  let compileTimer: number | undefined;
  let suppressNextScheduledCompile = false;
  onEditorChange('editor-root', (value) => {
    setActivePreset(null);
    clearPresetUrl();
    updateSourceStats(value);
    writeStoredSource(value);
    if (suppressNextScheduledCompile) {
      suppressNextScheduledCompile = false;
      return;
    }
    if (compileTimer) window.clearTimeout(compileTimer);
    compileTimer = window.setTimeout(() => {
      void ensureCompilerBridge().then((ready) => {
        if (ready) compileAndRender();
      });
    }, 220);
  });

  document.getElementById('check-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready) return;
      compileAndRender();
      showToast('Checked.');
    });
  });

  document.getElementById('run-button')?.addEventListener('click', () => {
    void runSource();
  });

  document.getElementById('format-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready || !compilerBridge) return;
      if (compileTimer) window.clearTimeout(compileTimer);
      suppressNextScheduledCompile = true;
      const formatted = compilerBridge.formatLuminaSource(getEditorText('editor-root'));
      setEditorText('editor-root', formatted);
      compileAndRender();
      showToast('Formatted.');
    });
  });

  document.getElementById('share-button')?.addEventListener('click', () => {
    const shareUrl = createShareUrl(getEditorText('editor-root'));
    window.history.replaceState(null, '', shareUrl);
    void copyText(shareUrl, 'Share link copied.');
  });

  document.getElementById('copy-js-button')?.addEventListener('click', () => {
    void ensureCompilerBridge().then((ready) => {
      if (!ready) return;
      const result = lastResult ?? compileAndRender();
      if (!result) return;
      void copyText(result.js, 'JavaScript copied.');
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
      suppressNextScheduledCompile = true;
      setEditorText('editor-root', selectedPreset.source);
      setActivePreset(selectedPreset.id);
      writePresetUrl(selectedPreset.id);
      void ensureCompilerBridge().then((ready) => {
        if (ready) compileAndRender();
      });
    });
  });

  void ensureCompilerBridge().then((ready) => {
    if (ready) compileAndRender();
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
