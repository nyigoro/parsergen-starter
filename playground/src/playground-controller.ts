import { compileProjectInWorker, formatSourceInWorker, warmCompilerWorker } from './compile-client';
import type { CompileDiagnostic, CompileResult } from './compiler-bridge';
import { getDiagnosticExplanation } from '../../src/lumina/diagnostic-explain';
import { defaultExample, exampleGroups, findExample, findExampleBySource } from './examples-data';
import { renderHighlightedJavaScript, renderHighlightedWat } from './output-highlighting';
import {
  createEmbedSnippet,
  createOpenPlaygroundUrl,
  createShareUrl,
  readLocalState,
  readUrlState,
  saveLocalState,
} from './share';
import { readSettings, sanitizeFontSize, sanitizeTabSize, sanitizeTheme, saveSettings } from './settings';
import {
  createPlaygroundSignal,
  defaultState,
  diagnosticCounts,
  diagnosticsFor,
  sourceProjectInput,
  type CompileMode,
  type CompileStatus,
  type CompileTarget,
  type OutputTab,
  type PlaygroundSettings,
  type PlaygroundState,
  type PreviewStatus,
  type RuntimeStatus,
} from './state';
import {
  renderTypeInfoTables,
  renderTypesEmptyState,
  typeInfoToJson,
  typeRowLocation,
  type TypeExpressionFilter,
  type TypeFilter,
} from './types-view';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type FocusEditorLocation = (elementId: string, line: number, column?: number) => void;
type GetEditorCursor = (elementId: string) => { line: number; column: number } | null;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;
type ApplyEditorSettings = (settings: Partial<PlaygroundSettings>) => void;
type RunResult = { output: string; status: 'ok' | 'timeout' | 'error' | 'cancelled' | 'blocked'; message?: string };
type RuntimeModuleSession = {
  entryUrl: string;
  cleanup: () => void;
};
type PreviewSession = {
  cleanup: () => void;
};
type PreviewModulePayload = {
  entryUri: string;
  runtimeSource: string | null;
  modules: Array<{
    uri: string;
    code: string;
    sourceImports: Array<{
      statement: string;
      resolvedUri: string;
    }>;
  }>;
};

const editorId = 'lumina-editor';
const entryUri = 'main.lm';
const bridge = globalThis as Record<string, unknown>;
const statusLabels: Record<CompileStatus, string> = {
  idle: 'Idle',
  checking: 'Checking',
  running: 'Compiling',
  done: 'Checked',
  error: 'Needs attention',
};
const runtimeLabels: Record<RuntimeStatus, string> = {
  idle: 'Not run',
  running: 'Running',
  ok: 'Passed',
  error: 'Runtime error',
  blocked: 'Run blocked',
};
const previewLabels: Record<PreviewStatus, string> = {
  idle: 'Idle',
  rendering: 'Rendering',
  ok: 'Rendered',
  error: 'Preview error',
  empty: 'No preview',
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const bytes = (value: number): string => {
  if (value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
};

const ms = (value: number): string => `${value.toFixed(1)}ms`;

const targetLabel = (target: CompileTarget | null): string => (target ? target.toUpperCase() : '-');
const tabLabel = (tab: OutputTab): string => tab.toUpperCase();
const diagnosticLocationLabel = (diagnostic: CompileDiagnostic): string =>
  diagnostic.line === undefined ? 'Location unavailable' : `${diagnostic.line}:${diagnostic.column ?? 1}`;

const wasmSectionLabel = (name: string): string => {
  if (name === 'type') return 'Types';
  if (name === 'import') return 'Imports';
  if (name === 'function') return 'Functions';
  if (name === 'code') return 'Code';
  if (name === 'export') return 'Exports';
  if (name === 'memory') return 'Memory';
  if (name === 'global') return 'Globals';
  if (name === 'data') return 'Data';
  if (name === 'data-count') return 'Data Count';
  if (name === 'custom') return 'Custom';
  return name.replaceAll('-', ' ');
};

const wasmSectionRole = (name: string): string => {
  if (name === 'type') return 'Function signatures and block shapes';
  if (name === 'import') return 'Host functions, memories, or tables';
  if (name === 'function') return 'Function declarations';
  if (name === 'code') return 'Compiled function bodies';
  if (name === 'export') return 'Exports visible to the host';
  if (name === 'memory') return 'Linear memory definition';
  if (name === 'global') return 'Global values';
  if (name === 'data' || name === 'data-count') return 'Static data payload';
  if (name === 'custom') return 'Debug or tool metadata';
  return 'WASM section';
};

const relativeTimestamp = (value: number | null): string => {
  if (!value) return 'Not yet';
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
};

const sourceLooksPreviewable = (source: string): boolean =>
  /\b(vnode|mount_reactive|createDomRenderer|renderApp|render_to_dom)\b/.test(source) ||
  source.includes('@std/render');

const sourceRequiresDocumentRuntime = (source: string): boolean =>
  /\b(dom_get_element_by_id|createDomRenderer|mount_reactive|hydrate_reactive|mountApp|hydrateApp)\b/.test(source) ||
  /\brender\.(dom_get_element_by_id|createDomRenderer|mount_reactive|hydrate_reactive|mountApp|hydrateApp)\b/.test(source);

const sourceRequiresHostWorkerRuntime = (source: string): boolean =>
  /\bthread\.spawn\b/.test(source) || /\bchannel\.(new|bounded)\b/.test(source);

const uiRunGuidance = `This source mounts browser UI and needs a document-backed runtime.
Open the UI tab and press Refresh to render it.

Run executes non-DOM code in an isolated worker, so it does not provide document or DOM APIs.`;

const workerRunGuidance = `This source uses Lumina thread/channel APIs.
The playground Run tab already executes inside an isolated worker, so nested worker/channel examples are best inspected here and run from a full host runtime.

Use the JS or Types tab to study the generated program shape.`;

const safeScriptJson = (value: unknown): string => JSON.stringify(value).replaceAll('</', '<\\/');

const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setHighlightedCode = (id: string, value: string, render: (source: string) => string): void => {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = render(value);
  element.dataset.highlighted = 'true';
};

const setHidden = (id: string, hidden: boolean): void => {
  const element = document.getElementById(id);
  if (element) element.toggleAttribute('hidden', hidden);
};

const setData = (id: string, key: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.dataset[key] = value;
};

const setInputValue = (id: string, value: string): void => {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (element && element.value !== value) element.value = value;
};

const applyShellSettings = (state: PlaygroundState): void => {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.embed = String(state.embedMode);
  document.body.dataset.theme = state.settings.theme;
  document.body.dataset.embed = String(state.embedMode);
  document.documentElement.style.setProperty('--playground-code-font-size', `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty('--playground-tab-size', String(state.settings.tabSize));
};

const rewriteModuleImportSource = (statement: string, nextSpecifier: string): string =>
  statement.replace(/\bfrom\s+["'][^"']+["']/, `from ${JSON.stringify(nextSpecifier)}`);

const findRuntimeSpecifier = (code: string): string | null =>
  code.match(/\bfrom\s+["']([^"']*lumina-runtime[^"']*\.js[^"']*)["']/)?.[1] ?? null;

const createRuntimeModuleSession = (result: CompileResult): RuntimeModuleSession => {
  const moduleUrls = new Map<string, string>();
  const modules = new Map(result.runnableModules.map((module) => [module.uri, module]));
  const materialize = (uri: string): string => {
    const existing = moduleUrls.get(uri);
    if (existing) return existing;
    const module = modules.get(uri);
    if (!module) throw new Error(`Missing runnable module ${uri}`);
    const imports = module.sourceImports.map((item) =>
      rewriteModuleImportSource(item.statement, materialize(item.resolvedUri))
    );
    const body = `${imports.length ? `${imports.join('\n')}\n` : ''}${module.code}${
      uri === result.runnableEntryUri ? '\nexport { main as __luminaMain };\n' : ''
    }`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
    moduleUrls.set(uri, url);
    return url;
  };
  const entryUrl =
    result.runnableEntryUri && result.runnableModules.length
      ? materialize(result.runnableEntryUri)
      : URL.createObjectURL(new Blob([`${result.runnableJs}\nexport { main as __luminaMain };\n`]));
  return {
    entryUrl,
    cleanup: () => {
      for (const url of moduleUrls.values()) URL.revokeObjectURL(url);
      if (!result.runnableEntryUri || !result.runnableModules.length) URL.revokeObjectURL(entryUrl);
    },
  };
};

const createPreviewModulePayload = async (result: CompileResult): Promise<PreviewModulePayload> => {
  const runtimeSpecifier = result.runnableModules
    .map((module) => findRuntimeSpecifier(module.code))
    .find((specifier): specifier is string => Boolean(specifier));
  const runtimeSource = runtimeSpecifier
    ? await fetch(runtimeSpecifier).then((response) => {
        if (!response.ok) throw new Error(`Failed to load preview runtime (${response.status})`);
        return response.text();
      })
    : null;

  return {
    entryUri: result.runnableEntryUri ?? entryUri,
    runtimeSource,
    modules: result.runnableModules.map((module) => ({
      uri: module.uri,
      code: module.code,
      sourceImports: module.sourceImports.map((item) => ({
        statement: item.statement,
        resolvedUri: item.resolvedUri,
      })),
    })),
  };
};

const runCompiledModule = async (result: CompileResult, signal: AbortSignal): Promise<RunResult> => {
  if (!result.hasMain) return { output: 'No main() function found.', status: 'error' };
  if (typeof Worker === 'undefined') return { output: 'Worker execution is unavailable.', status: 'error' };

  const moduleSession = createRuntimeModuleSession(result);
  const runnerUrl = URL.createObjectURL(
    new Blob(
      [
        `const logs=[];const fmt=(v)=>v===undefined?'void':typeof v==='object'?JSON.stringify(v,null,2):String(v);
console.log=(...a)=>logs.push(a.map(fmt).join(' '));console.error=console.log;
(async()=>{try{const m=await import(${JSON.stringify(moduleSession.entryUrl)});const r=await m.__luminaMain?.();
postMessage({type:'done',logs,returned:r===undefined?null:fmt(r),error:null});}
catch(e){postMessage({type:'done',logs,returned:null,error:e instanceof Error?e.message:String(e)});}})();`,
      ],
      { type: 'text/javascript' }
    )
  );
  const worker = new Worker(runnerUrl, { type: 'module' });
  try {
    return await new Promise<RunResult>((resolve) => {
      const timeout = window.setTimeout(() => {
        worker.terminate();
        resolve({ output: 'Execution timed out after 5 seconds.', status: 'timeout' });
      }, 5000);
      const abort = (): void => {
        window.clearTimeout(timeout);
        worker.terminate();
        resolve({ output: 'Execution cancelled.', status: 'cancelled' });
      };
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<{ logs?: string[]; returned?: string | null; error?: string | null }>) => {
        signal.removeEventListener('abort', abort);
        window.clearTimeout(timeout);
        worker.terminate();
        const lines = [...(event.data.logs ?? [])];
        if (event.data.error) lines.push(event.data.error);
        else if (event.data.returned) lines.push(`return ${event.data.returned}`);
        resolve({ output: lines.join('\n') || 'main() completed.', status: event.data.error ? 'error' : 'ok' });
      };
      worker.onerror = (event) => {
        signal.removeEventListener('abort', abort);
        window.clearTimeout(timeout);
        worker.terminate();
        resolve({ output: event.message || 'Worker execution failed.', status: 'error' });
      };
    });
  } finally {
    URL.revokeObjectURL(runnerUrl);
    moduleSession.cleanup();
  }
};

const buildCompileFailure = (message: string, action: 'check' | 'run', target: CompileTarget): CompileResult => ({
  ok: false,
  action,
  target,
  js: '',
  runnableJs: '',
  runnableEntryUri: null,
  runnableModules: [],
  wasm: null,
  hasMain: false,
  diagnostics: [{ severity: 'error', message, fileUri: entryUri }],
  entryUri,
  graphEdges: 0,
  graphNodes: 0,
  importResolutions: [],
  timings: { diagnosticsMs: 0, lowerMs: 0, codegenMs: 0, moduleGraphMs: 0, wasmWatMs: 0, wasmBinaryMs: 0, totalMs: 0 },
  typeInfo: null,
});

const initialState = (): PlaygroundState => {
  const urlState = readUrlState();
  const localState = readLocalState();
  const partialState = { ...localState, ...urlState };
  const urlExample = findExample(urlState.activeExample);
  const example = urlExample ?? findExample(partialState.activeExample ?? defaultState.activeExample) ?? defaultExample;
  const source = urlState.source ?? (urlExample ? example.source : localState.source ?? example.source);
  const target = urlState.target ?? (urlExample ? example.target : localState.target ?? example.target);
  const activeTab = urlState.activeTab ?? example.tab;
  const matchedSourceExample = findExampleBySource(source, partialState.activeExample);
  const activeExample = matchedSourceExample?.id ?? (urlState.source ? null : example.id);
  return {
    ...defaultState,
    ...partialState,
    settings: readSettings(),
    source,
    target,
    activeTab,
    activeExample,
  };
};

export const startPlayground = async (): Promise<void> => {
  await import('./codemirror-bridge');
  const mountEditor = bridge.mountEditor as MountEditor | undefined;
  const getEditorText = bridge.getEditorText as GetEditorText | undefined;
  const setEditorText = bridge.setEditorText as SetEditorText | undefined;
  const focusEditorLocation = bridge.focusEditorLocation as FocusEditorLocation | undefined;
  const getEditorCursor = bridge.getEditorCursor as GetEditorCursor | undefined;
  const onEditorChange = bridge.onEditorChange as OnEditorChange | undefined;
  const applyEditorSettings = bridge.applyEditorSettings as ApplyEditorSettings | undefined;

  if (
    !mountEditor ||
    !getEditorText ||
    !setEditorText ||
    !focusEditorLocation ||
    !getEditorCursor ||
    !onEditorChange ||
    !applyEditorSettings
  ) {
    throw new Error('Editor tools did not load.');
  }

  const store = createPlaygroundSignal(initialState());
  applyShellSettings(store.get());
  applyEditorSettings(store.get().settings);
  const bootUrlState = readUrlState();
  const bootUrlExample = findExample(bootUrlState.activeExample);
  let checkTimer: number | undefined;
  let activeCompile: AbortController | null = null;
  let activeRun: AbortController | null = null;
  let activePreview: AbortController | null = null;
  let compileSequence = 0;
  let previewSequence = 0;
  let programmaticSourceChange = false;
  let readableJs = true;
  let typeFilter: TypeFilter = 'all';
  let typeExpressionFilter: TypeExpressionFilter = 'all';
  let selectedTypeExpressionKey: string | null = null;
  let runOutput = 'Run the program to see output.';
  let previewSession: PreviewSession | null = null;
  let selectedDiagnosticIndex: number | null = null;

  const renderExamples = (): void => {
    const root = document.getElementById('examples-browser-root');
    if (!root) return;
    root.innerHTML = exampleGroups
      .map(
        (group) => `<section class="examples-group">
  <div class="examples-group-heading">
    <div class="examples-group-title">${escapeHtml(group.label)}</div>
    <p class="examples-group-description">${escapeHtml(group.description)}</p>
  </div>
  <div class="examples-grid">
    ${group.examples
      .map(
        (example) => `<button class="example-card" type="button" data-example-id="${escapeHtml(example.id)}" data-featured="${String(
          Boolean(example.featured)
        )}">
      <span class="example-label">${escapeHtml(example.label)}</span>
      <span class="example-detail">${escapeHtml(example.detail)}</span>
      <span class="example-meta">${example.featured ? '<span class="featured-dot">Featured</span>' : ''}<span>${escapeHtml(
        example.target.toUpperCase()
      )} | ${escapeHtml(example.tab.toUpperCase())}</span></span>
    </button>`
      )
      .join('')}
  </div>
</section>`
      )
      .join('');
  };

  const renderExplainDrawer = (diagnostic: CompileDiagnostic | null): void => {
    const root = document.getElementById('diagnostic-explain-root');
    if (!root) return;
    if (!diagnostic) {
      root.innerHTML = '';
      root.toggleAttribute('hidden', true);
      return;
    }

    const explanation = getDiagnosticExplanation(diagnostic.code);
    const location =
      diagnostic.line === undefined
        ? 'Location unavailable'
        : `Line ${diagnostic.line}, column ${diagnostic.column ?? 1}`;
    root.innerHTML = `<div class="compile-detail-block diagnostic-explain-card">
  <div class="panel-heading-row">
    <button class="tool-button secondary" type="button" id="diagnostic-back-button">Back to diagnostics</button>
    <div class="compile-detail-heading">Explain diagnostic</div>
  </div>
  <div class="diagnostic-explain-hero">
    <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
    <span class="diagnostic-code">${escapeHtml(explanation.code)}</span>
    <button class="diagnostic-line diagnostic-location-link" type="button" data-diagnostic-focus-index="${
      selectedDiagnosticIndex ?? 0
    }">
      ${escapeHtml(location)}
    </button>
  </div>
  <h3>${escapeHtml(explanation.title)}</h3>
  <p class="diagnostic-message">${escapeHtml(diagnostic.message)}</p>
  <section class="diagnostic-explain-section">
    <h4>What happened</h4>
    <p>${escapeHtml(explanation.summary)}</p>
  </section>
  <section class="diagnostic-explain-section">
    <h4>Why this happens</h4>
    <p>${escapeHtml(explanation.why)}</p>
  </section>
  <section class="diagnostic-explain-section">
    <h4>How to fix</h4>
    <ol class="diagnostic-fix-list">
      ${explanation.howToFix.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
    </ol>
  </section>
  <p class="compile-resolution-meta">Fix the highlighted code, then run Check again to confirm the diagnostic clears.</p>
</div>`;
    root.toggleAttribute('hidden', false);
  };

  const renderDiagnostics = (diagnostics: CompileDiagnostic[]): void => {
    const root = document.getElementById('diagnostics-root');
    if (!root) return;
    const counts = diagnosticCounts(diagnostics);
    setText('diagnostics-count-label', `${counts.errors} errors / ${counts.warnings} warnings`);
    root.innerHTML =
      diagnostics.length === 0
        ? '<p class="empty-state">No diagnostics.</p>'
        : diagnostics
            .map(
              (diagnostic, index) => `<button class="diagnostic ${escapeHtml(
                diagnostic.severity
              )}" type="button" data-diagnostic-index="${index}" aria-label="Open diagnostic ${escapeHtml(
                diagnostic.code ?? 'DIAGNOSTIC'
              )} at ${escapeHtml(diagnosticLocationLabel(diagnostic))}">
  <span class="diagnostic-topline">
    <span class="diagnostic-meta">
      <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
      <span class="diagnostic-code">${escapeHtml(diagnostic.code ?? 'DIAGNOSTIC')}</span>
    </span>
    <span class="diagnostic-line">${escapeHtml(diagnosticLocationLabel(diagnostic))}</span>
  </span>
  <span class="diagnostic-message">${escapeHtml(diagnostic.message)}</span>
  <span class="diagnostic-action">Jump and explain</span>
</button>`
            )
            .join('');
  };

  const renderWasmPanel = (state: PlaygroundState): void => {
    const wasm = state.compileResult?.wasm ?? null;
    const empty = document.getElementById('wasm-empty-state');
    const content = document.getElementById('wasm-content-root');
    const sectionRoot = document.getElementById('wasm-sections-root');
    const watSection = document.getElementById('wasm-wat-section');
    const copyButton = document.getElementById('copy-wat-button') as HTMLButtonElement | null;
    const downloadButton = document.getElementById('download-wasm-button') as HTMLButtonElement | null;
    const shouldBuildWasm = state.target === 'wasm' || state.target === 'both';
    const visibleWasm = shouldBuildWasm ? wasm : null;
    const isLoading = shouldBuildWasm && state.compileStatus === 'running';
    const hasCompileError = shouldBuildWasm && state.compileStatus === 'error' && !visibleWasm;
    const targetHint =
      !shouldBuildWasm
        ? 'Switch target to WASM or Both, then Run to generate WASM.'
        : hasCompileError
          ? 'Fix compile diagnostics, then Run again to generate WASM.'
          : isLoading
            ? 'Generating WebAssembly for the current source...'
            : 'Run with the current target to generate WASM.';
    const emptyTitle =
      !shouldBuildWasm
        ? 'WASM target not selected'
        : hasCompileError
          ? 'WASM unavailable'
          : isLoading
            ? 'Building WASM'
            : 'No WASM output yet';
    const sectionTotal = visibleWasm?.sections.reduce((sum, section) => sum + section.byteSize, 0) ?? 0;

    setText('wasm-size-label', visibleWasm ? bytes(visibleWasm.byteSize) : '-');
    setText('wasm-section-count-label', visibleWasm ? String(visibleWasm.sections.length) : '-');
    setText('wasm-build-time-label', visibleWasm ? ms(visibleWasm.timings.totalMs) : '-');
    setText(
      'wasm-section-summary-label',
      visibleWasm ? `${visibleWasm.sections.length} sections / ${bytes(sectionTotal)}` : '0 sections'
    );
    setHighlightedCode('wasm-wat-output', visibleWasm?.wat ?? '', renderHighlightedWat);
    setText('wasm-empty-title', visibleWasm ? '' : emptyTitle);
    setText('wasm-empty-detail', visibleWasm ? '' : targetHint);
    if (empty) empty.dataset.status = isLoading ? 'loading' : hasCompileError ? 'error' : 'empty';
    if (copyButton) copyButton.disabled = !visibleWasm?.wat;
    if (downloadButton) downloadButton.disabled = !visibleWasm?.bytes;

    if (empty) empty.toggleAttribute('hidden', Boolean(visibleWasm));
    if (content) content.toggleAttribute('hidden', !visibleWasm);
    if (watSection) watSection.toggleAttribute('hidden', !visibleWasm?.wat);
    if (!sectionRoot) return;
    sectionRoot.innerHTML =
      visibleWasm && visibleWasm.sections.length > 0
        ? visibleWasm.sections
            .map(
              (section) => {
                const percentNumber = sectionTotal > 0 ? Math.round((section.byteSize / sectionTotal) * 100) : 0;
                const percent = `${percentNumber}%`;
                return `<div class="wasm-section-row">
  <span>
    <strong>${escapeHtml(wasmSectionLabel(section.name))}</strong>
    <small>${escapeHtml(wasmSectionRole(section.name))}</small>
  </span>
  <span class="wasm-section-metric">
    <strong>${escapeHtml(bytes(section.byteSize))}</strong>
    <small>${escapeHtml(percent)}</small>
  </span>
  <span class="wasm-section-bar" style="--section-percent: ${percentNumber}%"></span>
</div>`;
              }
            )
            .join('')
        : '<p class="empty-state">No section metrics available.</p>';
  };

  const renderPreviewPanel = (state: PlaygroundState): void => {
    const frame = document.getElementById('preview-frame');
    const frameWrap = document.getElementById('preview-frame-wrap');
    const overlay = document.getElementById('preview-overlay');
    const refreshButton = document.getElementById('preview-refresh-button') as HTMLButtonElement | null;
    const autoButton = document.getElementById('preview-auto-button');
    const select = document.getElementById('preview-device-select') as HTMLSelectElement | null;
    const widths: Record<PlaygroundState['previewDevice'], string> = {
      desktop: '100%',
      tablet: '48rem',
      mobile: '23rem',
    };
    const overlayCopy: Record<PreviewStatus, { title: string; message: string }> = {
      idle: {
        title: 'Preview idle',
        message: 'Refresh when you want to render this source.',
      },
      rendering: {
        title: 'Rendering preview',
        message: 'Compiling and mounting the UI in a fresh sandbox.',
      },
      ok: {
        title: 'Preview rendered',
        message: state.previewMessage ?? 'The sandbox is showing the latest preview.',
      },
      error: {
        title: 'Preview failed',
        message: state.previewMessage ?? 'The preview runtime reported an error.',
      },
      empty: {
        title: 'No previewable UI',
        message: state.previewMessage ?? 'Choose a UI example or add render code to this source.',
      },
    };

    setText('preview-status-label', previewLabels[state.previewStatus]);
    setText('preview-message-label', state.previewMessage ?? 'Refresh to render a Lumina UI example.');
    setText('preview-last-label', `Last preview: ${relativeTimestamp(state.lastPreviewAt)}`);
    setText('preview-overlay-title', overlayCopy[state.previewStatus].title);
    setText('preview-overlay-message', overlayCopy[state.previewStatus].message);
    setData('preview-status-label', 'status', state.previewStatus === 'ok' ? 'ok' : state.previewStatus);
    if (frameWrap) frameWrap.dataset.status = state.previewStatus;
    if (overlay) overlay.toggleAttribute('hidden', state.previewStatus === 'ok');
    if (refreshButton) refreshButton.disabled = state.previewStatus === 'rendering';
    if (autoButton) autoButton.textContent = state.autoPreview ? 'Auto On' : 'Auto Off';
    setData('preview-auto-button', 'active', String(state.autoPreview));
    if (select && select.value !== state.previewDevice) select.value = state.previewDevice;
    if (frame instanceof HTMLIFrameElement) {
      frame.style.inlineSize = widths[state.previewDevice];
    }
  };

  const renderTypesPanel = (state: PlaygroundState): void => {
    const typeInfo = state.typeInfo;
    const empty = document.getElementById('types-empty-state');
    const content = document.getElementById('types-content-root');
    const declarationsRoot = document.getElementById('types-declarations-root');
    const expressionsRoot = document.getElementById('types-expressions-root');
    const copyButton = document.getElementById('copy-types-json-button') as HTMLButtonElement | null;

    document.querySelectorAll<HTMLElement>('[data-type-filter]').forEach((button) => {
      button.dataset.active = String(button.dataset.typeFilter === typeFilter);
    });
    document.querySelectorAll<HTMLElement>('[data-type-expression-filter]').forEach((button) => {
      button.dataset.active = String(button.dataset.typeExpressionFilter === typeExpressionFilter);
    });

    if (!typeInfo) {
      if (empty) {
        empty.innerHTML = renderTypesEmptyState();
        empty.toggleAttribute('hidden', false);
      }
      content?.toggleAttribute('hidden', true);
      if (copyButton) copyButton.disabled = true;
      setText('types-declaration-summary-label', '0 shown');
      setText('types-expression-summary-label', '0 shown');
      setText('types-footer-counts', '0 declarations / 0 expression types');
      return;
    }

    const rendered = renderTypeInfoTables(typeInfo, typeFilter, typeExpressionFilter, selectedTypeExpressionKey);
    if (empty) {
      empty.innerHTML = '';
      empty.toggleAttribute('hidden', true);
    }
    content?.toggleAttribute('hidden', false);
    if (declarationsRoot) declarationsRoot.innerHTML = rendered.declarationsHtml;
    if (expressionsRoot) expressionsRoot.innerHTML = rendered.expressionsHtml;
    if (copyButton) copyButton.disabled = false;
    setText('types-declaration-summary-label', `${rendered.filteredDeclarationsCount}/${rendered.declarationsCount} shown`);
    setText('types-expression-summary-label', `${rendered.filteredExpressionCount}/${rendered.expressionCount} shown`);
    setText('types-footer-counts', rendered.footerText);
  };

  const renderState = (state: PlaygroundState): void => {
    const diagnostics = diagnosticsFor(state);
    const counts = diagnosticCounts(diagnostics);
    const jsOutput = state.compileResult?.js || '// Check or run to populate JavaScript output.';
    const activeExample = findExample(state.activeExample);
    const selectedDiagnostic = selectedDiagnosticIndex === null ? null : diagnostics[selectedDiagnosticIndex] ?? null;

    applyShellSettings(state);
    applyEditorSettings(state.settings);
    saveSettings(state.settings);
    document.querySelectorAll<HTMLElement>('.playground-shell, .playground-body, .topbar').forEach((element) => {
      element.dataset.embed = String(state.embedMode);
      element.dataset.theme = state.settings.theme;
    });

    setText('examples-current', activeExample?.label ?? 'Custom');
    setData('examples-toggle', 'active', String(state.examplesOpen));
    setHidden('examples-browser-root', !state.examplesOpen);
    setHidden('settings-panel', !state.settingsOpen);
    setInputValue('setting-theme', state.settings.theme);
    setInputValue('setting-font-size', String(state.settings.fontSize));
    setInputValue('setting-tab-size', String(state.settings.tabSize));
    document.querySelectorAll<HTMLElement>('[data-example-id]').forEach((button) => {
      button.dataset.active = String(button.dataset.exampleId === state.activeExample);
    });

    for (const [id, isActive] of [
      ['mode-check-button', state.mode === 'check'],
      ['run-button', state.mode === 'run'],
      ['format-button', state.mode === 'format'],
      ['target-js-button', state.target === 'js'],
      ['target-wasm-button', state.target === 'wasm'],
      ['target-both-button', state.target === 'both'],
      ['settings-button', state.settingsOpen],
    ] as const) {
      setData(id, 'active', String(isActive));
    }

    document.querySelectorAll<HTMLElement>('[data-output-tab]').forEach((button) => {
      button.dataset.active = String(button.dataset.outputTab === state.activeTab);
    });

    setHidden('js-panel', state.activeTab !== 'js');
    setHidden('wasm-panel', state.activeTab !== 'wasm');
    setHidden('run-panel', state.activeTab !== 'run');
    setHidden('ui-panel', state.activeTab !== 'ui');
    setHidden('types-panel', state.activeTab !== 'types');
    setHidden('diagnostics-panel', state.activeTab !== 'diagnostics');
    setHighlightedCode(
      'js-output',
      readableJs ? jsOutput : jsOutput.replace(/\s+/g, ' ').trim(),
      renderHighlightedJavaScript
    );
    setText('run-output-root', runOutput);
    setText('runtime-status-label', runtimeLabels[state.runtimeStatus]);
    setText('runtime-message-label', state.runtimeMessage ?? 'Run the program to execute it in a clean session.');
    setText('runtime-last-run-label', `Last run: ${relativeTimestamp(state.lastRunAt)}`);
    setData('runtime-status-label', 'status', state.runtimeStatus);
    setText('minify-js-button', readableJs ? 'Readable' : 'Minified');
    renderWasmPanel(state);
    renderPreviewPanel(state);
    renderTypesPanel(state);

    renderDiagnostics(diagnostics);
    renderExplainDrawer(selectedDiagnostic);

    setText('status-compile', statusLabels[state.compileStatus]);
    setData('status-compile', 'status', state.compileStatus === 'done' ? 'ok' : state.compileStatus);
    setText('status-runtime', runtimeLabels[state.runtimeStatus]);
    setData('status-runtime', 'status', state.runtimeStatus);
    setText('status-preview', previewLabels[state.previewStatus]);
    setData('status-preview', 'status', state.previewStatus === 'ok' ? 'ok' : state.previewStatus);
    setText('status-check-time', state.checkTimeMs === null ? '-' : `${state.checkTimeMs.toFixed(1)}ms`);
    setText('status-run-time', state.runTimeMs === null ? '-' : `${state.runTimeMs.toFixed(1)}ms`);
    setText('status-js-size', bytes(state.compileResult?.js.length ?? 0));
    setText('status-wasm-size', state.compileResult?.wasm ? bytes(state.compileResult.wasm.byteSize) : '-');
    setText('status-errors', String(counts.errors));
    setText('status-warnings', String(counts.warnings));
    setText('status-target', targetLabel(state.target));
    setText('status-last-target', targetLabel(state.lastCompiledTarget));
    setText('status-view', tabLabel(state.activeTab));
    setText('status-example', state.activeExample ?? 'custom');
    setText('status-cursor', `${state.cursorLine}:${state.cursorCol}`);
    saveLocalState(state);
  };

  const compile = async (mode: CompileMode): Promise<CompileResult | null> => {
    if (checkTimer) window.clearTimeout(checkTimer);
    activeCompile?.abort('Superseded.');
    const controller = new AbortController();
    activeCompile = controller;
    const requestId = ++compileSequence;
    const target = mode === 'run' ? store.get().target : 'js';
    store.set({
      mode,
      lastAction: mode,
      compileStatus: mode === 'run' ? 'running' : 'checking',
      ...(mode === 'run'
        ? { runtimeStatus: 'running' as const, runtimeMessage: 'Compiling source before execution.' }
        : {}),
    });

    try {
      const result = await compileProjectInWorker(
        sourceProjectInput(store.get().source, mode === 'run' ? 'run' : 'check', target),
        controller.signal
      );
      if (controller.signal.aborted || activeCompile !== controller || requestId !== compileSequence) return null;
      activeCompile = null;
      if (selectedDiagnosticIndex !== null && selectedDiagnosticIndex >= result.diagnostics.length) {
        selectedDiagnosticIndex = null;
      }
      store.set({
        compileResult: result,
        typeInfo: result.typeInfo,
        compileStatus: result.ok ? 'done' : 'error',
        checkTimeMs: mode === 'check' ? result.timings.totalMs : store.get().checkTimeMs,
        runTimeMs: mode === 'run' ? result.timings.totalMs : store.get().runTimeMs,
        lastCompiledTarget: mode === 'run' && result.ok ? target : store.get().lastCompiledTarget,
        activeTab: result.ok ? store.get().activeTab : 'diagnostics',
      });
      return result;
    } catch (error) {
      if (controller.signal.aborted || activeCompile !== controller || requestId !== compileSequence) return null;
      activeCompile = null;
      selectedDiagnosticIndex = 0;
      store.set({
        compileStatus: 'error',
        ...(mode === 'run' ? { runtimeStatus: 'idle' as const, runtimeMessage: 'Run blocked by compile failure.' } : {}),
        compileResult: buildCompileFailure(error instanceof Error ? error.message : String(error), mode === 'run' ? 'run' : 'check', target),
        typeInfo: null,
        activeTab: 'diagnostics',
      });
      return null;
    }
  };

  const scheduleCheck = (): void => {
    if (checkTimer) window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => {
      void (async () => {
        const result = await compile('check');
        if (result?.ok && store.get().autoPreview) await refreshPreview();
      })();
    }, 600);
  };

  const setEditorSource = (
    nextSource: string,
    patch: Partial<PlaygroundState>,
    options: { scheduleCheck: boolean }
  ): void => {
    programmaticSourceChange = true;
    setEditorText(editorId, nextSource);
    const activeExample =
      Object.prototype.hasOwnProperty.call(patch, 'activeExample')
        ? patch.activeExample
        : findExampleBySource(nextSource, store.get().activeExample)?.id ?? null;
    store.set({
      ...patch,
      source: nextSource,
      activeExample,
      typeInfo: null,
      lastRunAt: null,
      lastPreviewAt: null,
      cursorLine: 1,
      cursorCol: 1,
    });
    if (options.scheduleCheck) scheduleCheck();
  };

  const setExampleUrl = (exampleId: string): void => {
    const url = new URL(window.location.href);
    url.search = '';
    if (store.get().embedMode) url.searchParams.set('embed', '1');
    url.searchParams.set('example', exampleId);
    window.history.replaceState(null, '', url);
  };

  const exampleIdentityFor = (source: string): string | null =>
    findExampleBySource(source, store.get().activeExample)?.id ?? null;

  const executeTargetRun = async (result: CompileResult, target: CompileTarget, signal: AbortSignal): Promise<RunResult> => {
    if (target === 'wasm') {
      return {
        output: result.wasm
          ? `Generated WASM artifact (${bytes(result.wasm.byteSize)}).`
          : 'WASM output was not generated.',
        status: result.wasm ? 'ok' : 'error',
      };
    }

    if (sourceRequiresDocumentRuntime(store.get().source)) {
      return {
        output:
          target === 'both' && result.wasm
            ? `${uiRunGuidance}\n\nGenerated WASM artifact (${bytes(result.wasm.byteSize)}).`
            : uiRunGuidance,
        status: 'blocked',
        message: 'This source mounts browser UI; render it in the UI tab.',
      };
    }

    if (sourceRequiresHostWorkerRuntime(store.get().source)) {
      return {
        output:
          target === 'both' && result.wasm
            ? `${workerRunGuidance}\n\nGenerated WASM artifact (${bytes(result.wasm.byteSize)}).`
            : workerRunGuidance,
        status: 'blocked',
        message: 'This source uses worker/channel APIs; inspect it or run it from a full host runtime.',
      };
    }

    const jsRun = await runCompiledModule(result, signal);
    if (target === 'both') {
      return {
        output: `${jsRun.output}\n\n${
          result.wasm ? `Generated WASM artifact (${bytes(result.wasm.byteSize)}).` : 'WASM output was not generated.'
        }`,
        status: jsRun.status,
      };
    }

    return jsRun;
  };

  const run = async (): Promise<void> => {
    const target = store.get().target;
    activeRun?.abort();
    activeRun = null;
    runOutput = 'Compiling source before execution...';
    store.set({ activeTab: 'run', runtimeStatus: 'running', runtimeMessage: 'Compiling source before execution.' });
    renderState(store.get());

    const result = await compile('run');
    if (!result?.ok) {
      runOutput = 'Run blocked until the current diagnostics are fixed.';
      store.set({
        runtimeStatus: 'idle',
        runtimeMessage: 'Run did not start because compile diagnostics are present.',
        lastRunAt: null,
      });
      renderState(store.get());
      return;
    }

    const controller = new AbortController();
    activeRun = controller;
    const needsUiRuntime = target !== 'wasm' && sourceRequiresDocumentRuntime(store.get().source);
    const needsHostWorkerRuntime = target !== 'wasm' && !needsUiRuntime && sourceRequiresHostWorkerRuntime(store.get().source);
    runOutput = target === 'wasm'
      ? 'Generating WASM artifact...'
      : needsUiRuntime || needsHostWorkerRuntime
        ? 'Preparing runtime guidance...'
        : 'Executing in an isolated runtime...';
    store.set({
      activeTab: 'run',
      runtimeStatus: 'running',
      runtimeMessage: needsUiRuntime
        ? 'Checking whether this source needs the UI preview runtime.'
        : needsHostWorkerRuntime
          ? 'Checking whether this source needs a host worker runtime.'
          : 'Executing in a clean runtime.',
    });
    renderState(store.get());

    const output = await executeTargetRun(result, target, controller.signal);
    if (controller.signal.aborted || activeRun !== controller) return;
    activeRun = null;
    runOutput = output.output;
    store.set({
      activeTab: 'run',
      runtimeStatus: output.status === 'ok' ? 'ok' : output.status === 'blocked' ? 'blocked' : 'error',
      runtimeMessage:
        output.message ??
        (output.status === 'ok' ? 'Run completed in a fresh session.' : 'Runtime failed. See output below.'),
      lastRunAt: Date.now(),
    });
  };

  const disposePreview = (): void => {
    previewSession?.cleanup();
    previewSession = null;
    const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
    if (frame) frame.removeAttribute('srcdoc');
  };

  const compilePreviewSource = async (signal: AbortSignal): Promise<CompileResult | null> => {
    activeCompile?.abort('Superseded by preview refresh.');
    const requestId = ++compileSequence;
    const source = store.get().source;
    store.set({ compileStatus: 'running' });
    try {
      const result = await compileProjectInWorker(sourceProjectInput(source, 'run', 'js'), signal);
      if (signal.aborted || requestId !== compileSequence) return null;
      store.set({
        compileResult: result,
        typeInfo: result.typeInfo,
        compileStatus: result.ok ? 'done' : 'error',
        activeTab: result.ok ? store.get().activeTab : 'diagnostics',
      });
      return result;
    } catch (error) {
      if (signal.aborted || requestId !== compileSequence) return null;
      selectedDiagnosticIndex = 0;
      store.set({
        compileStatus: 'error',
        compileResult: buildCompileFailure(
          error instanceof Error ? error.message : String(error),
          'run',
          'js'
        ),
        typeInfo: null,
        activeTab: 'diagnostics',
      });
      return null;
    }
  };

  const refreshPreview = async (): Promise<void> => {
    activePreview?.abort();
    const controller = new AbortController();
    activePreview = controller;
    const requestId = ++previewSequence;
    disposePreview();
    store.set({ previewStatus: 'rendering', previewMessage: 'Compiling UI preview...' });

    if (!sourceLooksPreviewable(store.get().source)) {
      activePreview = null;
      store.set({
        previewStatus: 'empty',
        previewMessage: 'This source does not appear to mount UI. Try a Reactive UI example.',
        lastPreviewAt: null,
      });
      return;
    }

    const result = store.get().compileResult?.ok && store.get().compileResult?.runnableModules.length
      ? store.get().compileResult
      : await compilePreviewSource(controller.signal);
    if (controller.signal.aborted || activePreview !== controller || requestId !== previewSequence) return;

    if (!result?.ok || !result.runnableModules.length) {
      activePreview = null;
      store.set({
        previewStatus: result?.ok ? 'empty' : 'error',
        previewMessage: result?.ok
          ? 'No previewable JavaScript module is available.'
          : 'Fix compile diagnostics before refreshing preview.',
        lastPreviewAt: null,
      });
      return;
    }

    const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null;
    if (!frame) {
      activePreview = null;
      store.set({
        previewStatus: 'error',
        previewMessage: 'Preview frame is unavailable.',
        lastPreviewAt: null,
      });
      return;
    }
    let modulePayload: PreviewModulePayload;
    try {
      modulePayload = await createPreviewModulePayload(result);
    } catch (error) {
      activePreview = null;
      store.set({
        previewStatus: 'error',
        previewMessage: error instanceof Error ? error.message : String(error),
        lastPreviewAt: null,
      });
      return;
    }
    if (controller.signal.aborted || activePreview !== controller || requestId !== previewSequence) return;
    const previewId = requestId;
    let timeoutId: number | null = null;
    const completePreview = (status: 'ok' | 'error', message: string): void => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      if (activePreview !== controller || controller.signal.aborted) return;
      activePreview = null;
      store.set({
        previewStatus: status === 'ok' ? 'ok' : 'error',
        previewMessage: message,
        lastPreviewAt: status === 'ok' ? Date.now() : null,
      });
    };
    const onMessage = (event: MessageEvent<{ type?: string; id?: number; status?: string; message?: string }>): void => {
      if (event.data?.type !== 'lumina-preview-result' || event.data.id !== previewId) return;
      completePreview(
        event.data.status === 'ok' ? 'ok' : 'error',
        event.data.message ?? (event.data.status === 'ok' ? 'Preview rendered.' : 'Preview failed.')
      );
    };
    window.addEventListener('message', onMessage);
    timeoutId = window.setTimeout(() => {
      completePreview('error', 'Preview did not finish. Check the UI code, then refresh again.');
    }, 8000);
    previewSession = {
      cleanup: () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
      },
    };
    frame.srcdoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; background: #f8fafc; color: #0f172a; }
    #root, #app { min-height: 100vh; }
    button { font: inherit; }
    .play-surface { min-height: 100vh; box-sizing: border-box; padding: 28px; color: #0f172a; }
    .play-surface-teal { background: linear-gradient(135deg, #eff6ff, #f0fdfa); }
    .play-surface-blue { background: linear-gradient(135deg, #f8fafc, #eef2ff); }
    .play-shell { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
    .play-shell.compact { max-width: 720px; }
    .play-stack { display: flex; flex-direction: column; gap: 8px; }
    .play-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .play-eyebrow { margin: 0; color: #0f766e; font-size: 12px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
    .play-eyebrow.blue { color: #2563eb; }
    .play-title { margin: 0; color: #0f172a; font-size: 34px; line-height: 1.1; }
    .play-copy { margin: 0; color: #475569; line-height: 1.6; max-width: 680px; }
    .play-muted { margin: 0; color: #64748b; font-size: 14px; }
    .play-surface button { border: 1px solid #0f766e; background: #ccfbf1; color: #134e4a; border-radius: 999px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
    .play-surface button:hover { background: #99f6e4; }
    .play-card { border: 1px solid #bae6fd; border-radius: 16px; background: #fff; padding: 18px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); }
    .play-card-title { margin: 0 0 8px; color: #075985; font-size: 22px; }
    .play-metric { border: 1px solid #dbeafe; border-radius: 18px; background: #fff; padding: 16px; min-width: 140px; }
    .play-metric-label { margin: 0 0 8px; color: #64748b; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .play-number { font-size: 28px; }
    .play-number.teal { color: #0f766e; }
    .play-number.blue { color: #2563eb; }
    .play-number.violet { color: #7c3aed; }
    .play-shell > button { align-self: flex-start; border-color: #0f172a; background: #0f172a; color: white; }
    .play-shell > button:hover { background: #1e293b; }
    .play-insight { border: 1px solid #bae6fd; border-radius: 20px; background: #f0f9ff; color: #0c4a6e; padding: 18px; line-height: 1.6; }
    .play-insight-title { display: block; margin-bottom: 6px; color: #075985; }
    .play-empty-card { border: 1px dashed #cbd5e1; border-radius: 20px; color: #64748b; padding: 18px; }
    .counter-card { align-items: center; background: #fff; border: 1px solid #bae6fd; border-radius: 24px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); display: flex; gap: 14px; padding: 18px; width: fit-content; }
    .counter-value { color: #0f172a; font-size: 42px; line-height: 1; min-width: 64px; text-align: center; }
    .profile-workspace { box-sizing: border-box; color: #0f172a; display: flex; flex-direction: column; gap: 14px; margin: 0 auto; max-width: 760px; min-height: 100vh; padding: 28px; background: linear-gradient(135deg, #f8fafc, #f0fdfa); }
    .profile-title { font-size: 36px; line-height: 1.05; margin: 0; }
    .profile-status { align-self: flex-start; background: #dcfce7; border: 1px solid #86efac; border-radius: 999px; color: #166534; font-weight: 800; margin: 0; padding: 6px 10px; }
    .profile-name { background: #fff; border: 1px solid #dbeafe; border-radius: 18px; color: #075985; font-size: 24px; font-weight: 800; margin: 0; padding: 16px; }
    .profile-resource-actions, .profile-form, .profile-panels, .profile-queue-panel { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; }
    .profile-workspace button { border: 1px solid #0f766e; background: #ccfbf1; color: #134e4a; border-radius: 999px; padding: 9px 13px; font-weight: 800; cursor: pointer; }
    .profile-workspace button:hover { background: #99f6e4; }
    .profile-input { border: 1px solid #cbd5e1; border-radius: 12px; font: inherit; min-width: 240px; padding: 10px 12px; }
    .profile-ready { align-items: center; color: #334155; display: flex; gap: 8px; font-weight: 700; }
    .profile-preview { color: #475569; margin: 0; }
    .profile-panel { background: #fff; border: 1px solid #dbeafe; border-radius: 16px; padding: 14px; width: 100%; }
    .profile-queue { background: #fff; border: 1px solid #dbeafe; border-radius: 16px; margin: 0; padding: 14px 14px 14px 34px; width: 100%; }
    .profile-queue-item { color: #334155; padding: 4px 0; }
  </style>
</head>
<body>
  <main id="root"><div id="app"></div></main>
  <script type="module">
    const done = (status, message) => parent.postMessage({ type: 'lumina-preview-result', id: ${previewId}, status, message }, '*');
    const payload = ${safeScriptJson(modulePayload)};
    const urls = new Map();
    const modules = new Map(payload.modules.map((module) => [module.uri, module]));
    const runtimeUrl = payload.runtimeSource
      ? 'data:text/javascript;charset=utf-8,' + encodeURIComponent(payload.runtimeSource)
      : null;
    const rewriteImport = (statement, nextSpecifier) => statement.replace(/\\bfrom\\s+["'][^"']+["']/, 'from ' + JSON.stringify(nextSpecifier));
    const rewriteRuntimeImports = (source) =>
      runtimeUrl
        ? source.replace(/\\bfrom\\s+["'][^"']*lumina-runtime[^"']*\\.js[^"']*["']/g, 'from ' + JSON.stringify(runtimeUrl))
        : source;
    const materialize = (uri) => {
      if (urls.has(uri)) return urls.get(uri);
      const module = modules.get(uri);
      if (!module) throw new Error('Missing preview module ' + uri);
      const imports = module.sourceImports.map((item) => rewriteImport(item.statement, materialize(item.resolvedUri)));
      const body = rewriteRuntimeImports((imports.length ? imports.join('\\n') + '\\n' : '') + module.code);
      const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(body);
      urls.set(uri, url);
      return url;
    };
    const cleanup = () => {
      urls.clear();
    };
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('error', (event) => done('error', event.message || 'Preview runtime error.'));
    window.addEventListener('unhandledrejection', (event) => done('error', event.reason?.message || String(event.reason ?? 'Preview promise rejected.')));
    try {
      await import(materialize(payload.entryUri));
      done('ok', 'Preview rendered.');
    } catch (error) {
      done('error', error instanceof Error ? error.message : String(error));
    }
  </script>
</body>
</html>`;
  };

  renderExamples();
  void warmCompilerWorker().catch(() => {
    // The first compile will surface worker failures if warming is unavailable.
  });
  if (bootUrlExample && !bootUrlState.source) {
    store.set({
      source: bootUrlExample.source,
      target: bootUrlState.target ?? bootUrlExample.target,
      activeTab: bootUrlState.activeTab ?? bootUrlExample.tab,
      activeExample: bootUrlExample.id,
    });
  }
  mountEditor({ elementId: editorId, initialValue: store.get().source });
  store.subscribe(renderState);

  onEditorChange(editorId, (source) => {
    if (programmaticSourceChange) {
      programmaticSourceChange = false;
      return;
    }

    const cursor = getEditorCursor(editorId) ?? { line: 1, column: 1 };
    selectedDiagnosticIndex = null;
    selectedTypeExpressionKey = null;
    activePreview?.abort();
    disposePreview();
    runOutput = 'Run the program to see output.';
    store.set({
      source,
      typeInfo: null,
      activeExample: exampleIdentityFor(source),
      cursorLine: cursor.line,
      cursorCol: cursor.column,
      runtimeStatus: 'idle',
      runtimeMessage: 'Run again to execute this edited source.',
      lastRunAt: null,
      lastPreviewAt: null,
      previewStatus: store.get().autoPreview ? 'rendering' : 'idle',
      previewMessage: store.get().autoPreview ? 'Waiting for debounced check.' : 'Refresh to render a Lumina UI example.',
    });
    scheduleCheck();
  });

  document.getElementById('examples-toggle')?.addEventListener('click', () => {
    store.set((state) => ({ examplesOpen: !state.examplesOpen }));
  });

  document.addEventListener('click', (event) => {
    const withinExamples =
      event.target instanceof HTMLElement
        ? event.target.closest('#examples-browser-root, #examples-toggle')
        : null;
    if (!withinExamples && store.get().examplesOpen) store.set({ examplesOpen: false });
  });

  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-example-id]') : null;
    if (!button) return;
    const example = findExample(button.dataset.exampleId);
    if (!example) return;
    selectedDiagnosticIndex = null;
    selectedTypeExpressionKey = null;
    runOutput = 'Run the program to see output.';
    activePreview?.abort();
    disposePreview();
    setExampleUrl(example.id);
    setEditorSource(
      example.source,
      {
        activeExample: example.id,
        target: example.target,
        activeTab: example.tab,
        examplesOpen: false,
        runtimeStatus: 'idle',
        runtimeMessage: null,
        previewStatus: 'idle',
        previewMessage: 'Refresh to render a Lumina UI example.',
        lastRunAt: null,
        lastPreviewAt: null,
      },
      { scheduleCheck: true }
    );
  });

  document.getElementById('mode-check-button')?.addEventListener('click', () => void compile('check'));
  document.getElementById('run-button')?.addEventListener('click', () => void run());
  document.getElementById('format-button')?.addEventListener('click', async () => {
    const formatted = await formatSourceInWorker(getEditorText(editorId));
    selectedDiagnosticIndex = null;
    setEditorSource(formatted, { mode: 'format', compileStatus: 'done' }, { scheduleCheck: true });
  });

  document.querySelectorAll<HTMLElement>('[id^="target-"]').forEach((button) => {
    button.addEventListener('click', () =>
      store.set({ target: button.id.replace(/^target-|-button$/g, '') as CompileTarget })
    );
  });

  document.querySelectorAll<HTMLElement>('[data-output-tab]').forEach((button) => {
    button.addEventListener('click', () => store.set({ activeTab: button.dataset.outputTab as OutputTab }));
  });

  document.querySelectorAll<HTMLElement>('[data-type-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.typeFilter;
      if (next === 'all' || next === 'functions' || next === 'variables' || next === 'types') {
        typeFilter = next;
        renderState(store.get());
      }
    });
  });

  document.querySelectorAll<HTMLElement>('[data-type-expression-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.typeExpressionFilter;
      if (next === 'all' || next === 'calls' || next === 'literals' || next === 'values') {
        typeExpressionFilter = next;
        selectedTypeExpressionKey = null;
        renderState(store.get());
      }
    });
  });

  document.getElementById('copy-types-json-button')?.addEventListener('click', () => {
    const typeInfo = store.get().typeInfo;
    if (!typeInfo) return;
    void navigator.clipboard?.writeText(typeInfoToJson(typeInfo));
  });

  document.addEventListener('click', (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-type-row]') : null;
    const location = row ? typeRowLocation(row.dataset) : null;
    if (!location) return;
    selectedTypeExpressionKey = row.dataset.typeKey ?? null;
    renderState(store.get());
    focusEditorLocation(editorId, location.line, location.column);
  });

  document.addEventListener('keydown', (event) => {
    const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-type-row]') : null;
    if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
    const location = typeRowLocation(row.dataset);
    if (!location) return;
    event.preventDefault();
    selectedTypeExpressionKey = row.dataset.typeKey ?? null;
    renderState(store.get());
    focusEditorLocation(editorId, location.line, location.column);
  });

  document.getElementById('copy-js-panel-button')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(store.get().compileResult?.js ?? '');
  });

  document.getElementById('download-js-button')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([store.get().compileResult?.js ?? ''], { type: 'text/javascript' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lumina-output.js';
    anchor.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('copy-wat-button')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(store.get().compileResult?.wasm?.wat ?? '');
  });

  document.getElementById('download-wasm-button')?.addEventListener('click', () => {
    const wasm = store.get().compileResult?.wasm;
    if (!wasm?.bytes) return;
    const url = URL.createObjectURL(new Blob([wasm.bytes], { type: 'application/wasm' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lumina-output.wasm';
    anchor.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('minify-js-button')?.addEventListener('click', () => {
    readableJs = !readableJs;
    renderState(store.get());
  });

  document.getElementById('preview-refresh-button')?.addEventListener('click', () => void refreshPreview());

  document.getElementById('preview-auto-button')?.addEventListener('click', () => {
    store.set((state) => ({ autoPreview: !state.autoPreview }));
    if (store.get().autoPreview) void refreshPreview();
  });

  document.getElementById('preview-device-select')?.addEventListener('change', (event) => {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : 'desktop';
    if (value === 'desktop' || value === 'tablet' || value === 'mobile') {
      store.set({ previewDevice: value });
    }
  });

  document.addEventListener('click', (event) => {
    const backButton =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('#diagnostic-back-button') : null;
    if (!backButton) return;
    selectedDiagnosticIndex = null;
    renderState(store.get());
    document.getElementById('diagnostics-root')?.scrollIntoView({ block: 'nearest' });
  });

  document.getElementById('share-button')?.addEventListener('click', () => {
    const url = createShareUrl(store.get());
    window.history.replaceState(null, '', url);
    void navigator.clipboard?.writeText(url);
  });

  document.getElementById('copy-embed-button')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(createEmbedSnippet(store.get()));
  });

  document.getElementById('open-playground-button')?.addEventListener('click', () => {
    window.location.href = createOpenPlaygroundUrl(store.get());
  });

  document.getElementById('settings-button')?.addEventListener('click', () =>
    store.set((state) => ({ settingsOpen: !state.settingsOpen }))
  );

  document.getElementById('settings-close-button')?.addEventListener('click', () => store.set({ settingsOpen: false }));

  document.getElementById('setting-theme')?.addEventListener('change', (event) => {
    const theme = sanitizeTheme(event.target instanceof HTMLSelectElement ? event.target.value : null);
    store.set((state) => ({ settings: { ...state.settings, theme } }));
  });

  document.getElementById('setting-font-size')?.addEventListener('change', (event) => {
    const fontSize = sanitizeFontSize(event.target instanceof HTMLSelectElement ? event.target.value : null);
    store.set((state) => ({ settings: { ...state.settings, fontSize } }));
  });

  document.getElementById('setting-tab-size')?.addEventListener('change', (event) => {
    const tabSize = sanitizeTabSize(event.target instanceof HTMLSelectElement ? event.target.value : null);
    store.set((state) => ({ settings: { ...state.settings, tabSize } }));
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-diagnostic-index]') : null;
    if (!target) return;
    const diagnosticIndex = Number(target.dataset.diagnosticIndex);
    const diagnostic = diagnosticsFor(store.get())[diagnosticIndex];
    if (!diagnostic) return;
    selectedDiagnosticIndex = selectedDiagnosticIndex === diagnosticIndex ? null : diagnosticIndex;
    if (diagnostic.line) focusEditorLocation(editorId, diagnostic.line, diagnostic.column ?? 1);
    renderState(store.get());
  });

  document.addEventListener('click', (event) => {
    const target =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-diagnostic-focus-index]') : null;
    if (!target) return;
    const diagnosticIndex = Number(target.dataset.diagnosticFocusIndex);
    const diagnostic = diagnosticsFor(store.get())[diagnosticIndex];
    if (diagnostic?.line) focusEditorLocation(editorId, diagnostic.line, diagnostic.column ?? 1);
  });

  document.addEventListener('keyup', () => {
    const cursor = getEditorCursor(editorId);
    if (cursor) store.set({ cursorLine: cursor.line, cursorCol: cursor.column });
  });

  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      void compile('check');
      return;
    }
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      void run();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.getElementById('format-button')?.click();
      return;
    }
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault();
      document.getElementById('share-button')?.click();
      return;
    }
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      store.set({ examplesOpen: true });
      document.getElementById('examples-toggle')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      selectedDiagnosticIndex = null;
      store.set({ settingsOpen: false, examplesOpen: false });
      renderState(store.get());
    }
  });

  scheduleCheck();
};
