import { compileProjectInWorker, formatSourceInWorker, warmCompilerWorker } from './compile-client';
import type { CompileDiagnostic, CompileResult } from './compiler-bridge';
import { defaultExample, exampleGroups, findExample } from './examples-data';
import { createShareUrl, readLocalState, readUrlState, saveLocalState } from './share';
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
  type PlaygroundState,
} from './state';

type MountEditor = (options: { elementId: string; initialValue: string }) => void;
type GetEditorText = (elementId: string) => string;
type SetEditorText = (elementId: string, value: string) => void;
type FocusEditorLocation = (elementId: string, line: number, column?: number) => void;
type GetEditorCursor = (elementId: string) => { line: number; column: number } | null;
type OnEditorChange = (elementId: string, handler: (value: string) => void) => () => void;
type RunResult = { output: string; status: 'ok' | 'timeout' | 'error' | 'cancelled' };

const editorId = 'lumina-editor';
const entryUri = 'main.lm';
const bridge = globalThis as Record<string, unknown>;
const statusLabels: Record<CompileStatus, string> = {
  idle: 'Idle',
  checking: 'Checking',
  running: 'Running',
  done: 'Done',
  error: 'Needs attention',
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

const targetLabel = (target: CompileTarget | null): string => (target ? target.toUpperCase() : '-');
const tabLabel = (tab: OutputTab): string => tab.toUpperCase();

const setText = (id: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
};

const setHidden = (id: string, hidden: boolean): void => {
  const element = document.getElementById(id);
  if (element) element.toggleAttribute('hidden', hidden);
};

const setData = (id: string, key: string, value: string): void => {
  const element = document.getElementById(id);
  if (element) element.dataset[key] = value;
};

const rewriteModuleImportSource = (statement: string, nextSpecifier: string): string =>
  statement.replace(/\bfrom\s+["'][^"']+["']/, `from ${JSON.stringify(nextSpecifier)}`);

const runCompiledModule = async (result: CompileResult, signal: AbortSignal): Promise<RunResult> => {
  if (!result.hasMain) return { output: 'No main() function found.', status: 'error' };
  if (typeof Worker === 'undefined') return { output: 'Worker execution is unavailable.', status: 'error' };

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
  const runnerUrl = URL.createObjectURL(
    new Blob(
      [
        `const logs=[];const fmt=(v)=>v===undefined?'void':typeof v==='object'?JSON.stringify(v,null,2):String(v);
console.log=(...a)=>logs.push(a.map(fmt).join(' '));console.error=console.log;
(async()=>{try{const m=await import(${JSON.stringify(entryUrl)});const r=await m.__luminaMain?.();
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
    for (const url of moduleUrls.values()) URL.revokeObjectURL(url);
    if (!result.runnableEntryUri || !result.runnableModules.length) URL.revokeObjectURL(entryUrl);
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
  const activeExample = urlState.source
    ? null
    : findExample(partialState.activeExample)?.id ?? partialState.activeExample ?? example.id;
  return {
    ...defaultState,
    ...partialState,
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

  if (!mountEditor || !getEditorText || !setEditorText || !focusEditorLocation || !getEditorCursor || !onEditorChange) {
    throw new Error('Editor tools did not load.');
  }

  const store = createPlaygroundSignal(initialState());
  const bootUrlState = readUrlState();
  const bootUrlExample = findExample(bootUrlState.activeExample);
  let checkTimer: number | undefined;
  let activeCompile: AbortController | null = null;
  let activeRun: AbortController | null = null;
  let compileSequence = 0;
  let programmaticSourceChange = false;
  let readableJs = true;
  let runOutput = 'Run the program to see output.';
  let selectedDiagnosticIndex: number | null = null;

  const renderExamples = (): void => {
    const root = document.getElementById('examples-browser-root');
    if (!root) return;
    root.innerHTML = exampleGroups
      .map(
        (group) => `<section class="examples-group">
  <div class="examples-group-title">${escapeHtml(group.label)}</div>
  <div class="examples-grid">
    ${group.examples
      .map(
        (example) => `<button class="example-card" type="button" data-example-id="${escapeHtml(example.id)}">
      <span class="example-label">${escapeHtml(example.label)}</span>
      <span class="example-detail">${escapeHtml(example.detail)}</span>
      <span class="example-meta">${escapeHtml(example.target.toUpperCase())} | ${escapeHtml(example.tab.toUpperCase())}</span>
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

    const location =
      diagnostic.line === undefined
        ? 'Location unavailable'
        : `Line ${diagnostic.line}, column ${diagnostic.column ?? 1}`;
    root.innerHTML = `<div class="compile-detail-block">
  <div class="panel-heading-row">
    <button class="tool-button secondary" type="button" id="diagnostic-back-button">Back to errors</button>
    <div class="compile-detail-heading">Explain</div>
  </div>
  <p class="diagnostic-message">${escapeHtml(diagnostic.message)}</p>
  <div class="compile-resolution-meta">${escapeHtml(diagnostic.code ?? 'No code')} | ${escapeHtml(
      diagnostic.severity
    )} | ${escapeHtml(location)}</div>
  <p class="compile-resolution-meta">Fix the highlighted code, then run Check again to confirm the diagnostic clears.</p>
</div>`;
    root.toggleAttribute('hidden', false);
  };

  const renderDiagnostics = (diagnostics: CompileDiagnostic[], open: boolean): void => {
    const root = document.getElementById('diagnostics-root');
    if (!root) return;
    const counts = diagnosticCounts(diagnostics);
    setText('diagnostics-count-label', `${counts.errors} errors / ${counts.warnings} warnings`);
    root.toggleAttribute('hidden', !open);
    root.innerHTML =
      diagnostics.length === 0
        ? '<p class="empty-state">No diagnostics.</p>'
        : diagnostics
            .map(
              (diagnostic, index) => `<button class="diagnostic ${escapeHtml(
                diagnostic.severity
              )}" data-diagnostic-index="${index}">
  <span class="diagnostic-meta">
    <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
    <span class="diagnostic-code">${escapeHtml(diagnostic.code ?? 'DIAGNOSTIC')}</span>
    <span class="diagnostic-line">${escapeHtml(
      diagnostic.line === undefined ? 'line ?' : `${diagnostic.line}:${diagnostic.column ?? 1}`
    )}</span>
  </span>
  <span class="diagnostic-message">${escapeHtml(diagnostic.message)}</span>
  <span class="diagnostic-code">Explain</span>
</button>`
            )
            .join('');
  };

  const renderWasmPanel = (state: PlaygroundState): void => {
    const wasm = state.compileResult?.wasm ?? null;
    const empty = document.getElementById('wasm-empty-state');
    const content = document.getElementById('wasm-content-root');
    const sectionRoot = document.getElementById('wasm-sections-root');
    const targetHint =
      state.target === 'js'
        ? 'Switch target to WASM or Both, then Run to generate WASM.'
        : 'Run with the current target to generate WASM.';

    setText('wasm-size-label', wasm ? bytes(wasm.byteSize) : '-');
    setText('wasm-wat-output', wasm?.wat ?? '');
    setText('wasm-empty-state', wasm ? '' : targetHint);

    if (empty) empty.toggleAttribute('hidden', Boolean(wasm));
    if (content) content.toggleAttribute('hidden', !wasm);
    if (!sectionRoot) return;
    sectionRoot.innerHTML =
      wasm && wasm.sections.length > 0
        ? wasm.sections
            .map(
              (section) => `<div class="wasm-section-row">
  <span>${escapeHtml(section.name)}</span>
  <strong>${escapeHtml(bytes(section.byteSize))}</strong>
</div>`
            )
            .join('')
        : '<p class="empty-state">No section metrics available.</p>';
  };

  const renderState = (state: PlaygroundState): void => {
    const diagnostics = diagnosticsFor(state);
    const counts = diagnosticCounts(diagnostics);
    const jsOutput = state.compileResult?.js || '// Check or run to populate JavaScript output.';
    const activeExample = findExample(state.activeExample);
    const selectedDiagnostic = selectedDiagnosticIndex === null ? null : diagnostics[selectedDiagnosticIndex] ?? null;

    setText('examples-current', activeExample?.label ?? 'Custom');
    setData('examples-toggle', 'active', String(state.examplesOpen));
    setHidden('examples-browser-root', !state.examplesOpen);
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
    setText('js-output', readableJs ? jsOutput : jsOutput.replace(/\s+/g, ' ').trim());
    setText('run-output-root', runOutput);
    setText('minify-js-button', readableJs ? 'Readable' : 'Minified');
    renderWasmPanel(state);

    renderDiagnostics(diagnostics, state.diagnosticsOpen);
    renderExplainDrawer(selectedDiagnostic);

    setText('status-compile', statusLabels[state.compileStatus]);
    setData('status-compile', 'status', state.compileStatus === 'done' ? 'ok' : state.compileStatus);
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
    store.set({ mode, lastAction: mode, compileStatus: mode === 'run' ? 'running' : 'checking' });

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
        compileStatus: result.ok ? 'done' : 'error',
        checkTimeMs: mode === 'check' ? result.timings.totalMs : store.get().checkTimeMs,
        runTimeMs: mode === 'run' ? result.timings.totalMs : store.get().runTimeMs,
        lastCompiledTarget: mode === 'run' && result.ok ? target : store.get().lastCompiledTarget,
        diagnosticsOpen: result.diagnostics.length > 0,
      });
      return result;
    } catch (error) {
      if (controller.signal.aborted || activeCompile !== controller || requestId !== compileSequence) return null;
      activeCompile = null;
      selectedDiagnosticIndex = 0;
      store.set({
        compileStatus: 'error',
        compileResult: buildCompileFailure(error instanceof Error ? error.message : String(error), mode === 'run' ? 'run' : 'check', target),
        diagnosticsOpen: true,
      });
      return null;
    }
  };

  const scheduleCheck = (): void => {
    if (checkTimer) window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => void compile('check'), 600);
  };

  const setEditorSource = (
    nextSource: string,
    patch: Partial<PlaygroundState>,
    options: { scheduleCheck: boolean }
  ): void => {
    programmaticSourceChange = true;
    setEditorText(editorId, nextSource);
    store.set({
      ...patch,
      source: nextSource,
      cursorLine: 1,
      cursorCol: 1,
    });
    if (options.scheduleCheck) scheduleCheck();
  };

  const setExampleUrl = (exampleId: string): void => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('example', exampleId);
    window.history.replaceState(null, '', url);
  };

  const executeTargetRun = async (result: CompileResult, target: CompileTarget, signal: AbortSignal): Promise<RunResult> => {
    if (target === 'wasm') {
      return {
        output: result.wasm
          ? `Generated WASM artifact (${bytes(result.wasm.byteSize)}).`
          : 'WASM output was not generated.',
        status: result.wasm ? 'ok' : 'error',
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
    const result = await compile('run');
    if (!result?.ok) {
      runOutput = 'Run blocked until the current diagnostics are fixed.';
      renderState(store.get());
      return;
    }

    activeRun?.abort();
    const controller = new AbortController();
    activeRun = controller;
    runOutput = target === 'wasm' ? 'Preparing WASM target...' : 'Running...';
    const currentTab = store.get().activeTab;
    const nextTab: OutputTab = target === 'wasm' ? 'wasm' : currentTab === 'js' || currentTab === 'wasm' ? currentTab : 'js';
    store.set({ activeTab: nextTab });
    renderState(store.get());

    const output = await executeTargetRun(result, target, controller.signal);
    if (controller.signal.aborted || activeRun !== controller) return;
    activeRun = null;
    runOutput = output.output;
    store.set({ activeTab: 'run', compileStatus: output.status === 'ok' ? 'done' : 'error' });
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
    store.set({ source, activeExample: null, cursorLine: cursor.line, cursorCol: cursor.column });
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
    runOutput = 'Run the program to see output.';
    setExampleUrl(example.id);
    setEditorSource(
      example.source,
      { activeExample: example.id, target: example.target, activeTab: example.tab, examplesOpen: false },
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

  document.getElementById('diagnostics-toggle')?.addEventListener('click', () =>
    store.set((state) => ({ diagnosticsOpen: !state.diagnosticsOpen }))
  );

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

  document.getElementById('settings-button')?.addEventListener('click', () =>
    store.set((state) => ({ settingsOpen: !state.settingsOpen }))
  );

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
      store.set({ diagnosticsOpen: false, settingsOpen: false, examplesOpen: false });
      renderState(store.get());
    }
  });

  scheduleCheck();
};
