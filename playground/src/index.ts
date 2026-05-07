import './style.css';
import './main.lm';
import {
  compileProjectInWorker,
  formatSourceInWorker,
  getCompileWorkerTelemetry,
} from './compile-client';
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
type FocusEditorLocation = (elementId: string, line: number, column?: number) => void;
type GetEditorCursor = (elementId: string) => { line: number; column: number } | null;
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

type DialogFieldSpec = {
  key: string;
  label: string;
  value: string;
  placeholder?: string;
  description?: string;
};

type DialogRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  fields?: DialogFieldSpec[];
};

type RouteMatchSummary = {
  current: string | null;
  knownPaths: string[];
};

type PackageSummary = {
  id: string;
  path: string;
  luminaPath: string | null;
  fileCount: number;
  inLockfile: boolean;
  status: 'ok' | 'warning' | 'error';
  message: string;
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

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const formatBytes = (value: number): string => `${(value / 1024).toFixed(1)} KB`;

const collectDirtyFileUris = (
  project: PlaygroundProject,
  baselineProject: PlaygroundProject | null
): Set<string> => {
  if (!baselineProject) return new Set();
  const baselineFiles = new Map(baselineProject.files.map((file) => [file.uri, file.text]));
  const dirty = new Set<string>();
  for (const file of project.files) {
    if (!baselineFiles.has(file.uri) || baselineFiles.get(file.uri) !== file.text) {
      dirty.add(file.uri);
    }
  }
  for (const file of baselineProject.files) {
    if (!getProjectFile(project, file.uri)) dirty.add(file.uri);
  }
  return dirty;
};

const parseSearchParams = (search: string): Array<{ key: string; value: string }> => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return Array.from(params.entries()).map(([key, value]) => ({ key, value }));
};

const routeSourcePattern =
  /\b(?:linkWithProps|navigate|prefetchRoute|routeView|routeNode|routeNodeWithChildren|lazyRouteModule)\([^,]+,\s*"([^"]+)"/g;

const collectKnownRoutePaths = (project: PlaygroundProject): string[] => {
  const known = new Set<string>();
  for (const file of project.files) {
    if (!file.uri.endsWith('.lm')) continue;
    for (const match of file.text.matchAll(routeSourcePattern)) {
      const path = match[1]?.trim();
      if (path && path.startsWith('/')) known.add(path);
    }
  }
  known.add('/');
  return Array.from(known).sort();
};

const buildRouteMatchSummary = (
  project: PlaygroundProject,
  pathname: string
): RouteMatchSummary => {
  const knownPaths = collectKnownRoutePaths(project);
  const current =
    knownPaths.find((candidate) => candidate === pathname) ??
    knownPaths.find((candidate) => candidate !== '/' && pathname.startsWith(candidate));
  return {
    current: current ?? null,
    knownPaths,
  };
};

const parsePackageSummaries = (project: PlaygroundProject): { packages: PackageSummary[]; warnings: string[] } => {
  const warnings: string[] = [];
  const lockfile = getProjectFile(project, 'lumina.lock');
  let lockPackages = new Map<
    string,
    {
      path?: string;
      lumina?: string;
    }
  >();

  if (lockfile) {
    try {
      const parsed = JSON.parse(lockfile.text) as {
        packages?: Record<string, { path?: string; lumina?: string }>;
      };
      lockPackages = new Map(Object.entries(parsed.packages ?? {}));
    } catch {
      warnings.push('lumina.lock is not valid JSON.');
    }
  } else {
    warnings.push('No lumina.lock file found.');
  }

  const packageRoots = new Map<string, PlaygroundProjectFile[]>();
  for (const file of project.files) {
    const match = file.uri.match(/^\.lumina\/packages\/([^/]+)\/(.+)$/);
    if (!match) continue;
    const root = match[1];
    const bucket = packageRoots.get(root);
    if (bucket) bucket.push(file);
    else packageRoots.set(root, [file]);
  }

  const packageIds = new Set([...packageRoots.keys(), ...lockPackages.keys()]);
  const packages = Array.from(packageIds)
    .sort()
    .map((id) => {
      const files = packageRoots.get(id) ?? [];
      const lock = lockPackages.get(id);
      const path = lock?.path ?? (files[0]?.uri.split('/').slice(0, 3).join('/') ?? `.lumina/packages/${id}`);
      const luminaPath = lock?.lumina ?? null;
      const fileCount = files.length;
      if (!lock) {
        return {
          id,
          path,
          luminaPath,
          fileCount,
          inLockfile: false,
          status: 'warning',
          message: 'Package files exist without a lockfile entry.',
        } satisfies PackageSummary;
      }
      if (fileCount === 0) {
        return {
          id,
          path,
          luminaPath,
          fileCount,
          inLockfile: true,
          status: 'warning',
          message: 'Lockfile entry exists, but package files are missing.',
        } satisfies PackageSummary;
      }
      return {
        id,
        path,
        luminaPath,
        fileCount,
        inLockfile: true,
        status: 'ok',
        message: `Resolved ${fileCount} file${fileCount === 1 ? '' : 's'}.`,
      } satisfies PackageSummary;
    });

  return { packages, warnings };
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

const renderDiagnostics = (
  element: HTMLElement,
  diagnostics: CompileDiagnostic[],
  filter: 'all' | 'error' | 'warning'
): void => {
  const counts = {
    all: diagnostics.length,
    error: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    warning: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
  };
  const visibleDiagnostics =
    filter === 'all'
      ? diagnostics
      : diagnostics.filter((diagnostic) => diagnostic.severity === filter);
  const filters = `
    <div class="diagnostic-filter-row">
      <button class="small-pill"${
        filter === 'all' ? ' data-active="true"' : ''
      } data-diagnostic-filter="all" type="button">All (${counts.all})</button>
      <button class="small-pill"${
        filter === 'error' ? ' data-active="true"' : ''
      } data-diagnostic-filter="error" type="button">Errors (${counts.error})</button>
      <button class="small-pill"${
        filter === 'warning' ? ' data-active="true"' : ''
      } data-diagnostic-filter="warning" type="button">Warnings (${counts.warning})</button>
    </div>
  `;

  if (diagnostics.length === 0) {
    element.innerHTML = `${filters}<p class="empty-state">No diagnostics.</p>`;
    setText('diagnostic-count', '0');
    return;
  }

  setText('diagnostic-count', String(counts.all));
  const grouped = new Map<string, CompileDiagnostic[]>();
  for (const diagnostic of visibleDiagnostics) {
    const key = diagnostic.fileUri ?? 'project';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(diagnostic);
    else grouped.set(key, [diagnostic]);
  }

  const body =
    grouped.size === 0
      ? '<p class="empty-state">No diagnostics match the current filter.</p>'
      : Array.from(grouped.entries())
          .map(([fileUri, items]) => {
            const itemsBody = items
              .map((diagnostic, index) => {
                const locationParts = [
                  diagnostic.line ? `line ${diagnostic.line}` : '',
                  diagnostic.column ? `col ${diagnostic.column}` : '',
                ].filter(Boolean);
                const location =
                  locationParts.length > 0
                    ? `<span class="diagnostic-line">${escapeHtml(locationParts.join(' &middot; '))}</span>`
                    : '';
                const code = diagnostic.code
                  ? `<span class="diagnostic-code">${escapeHtml(diagnostic.code)}</span>`
                  : '';
                const fileAttr = diagnostic.fileUri
                  ? ` data-file-uri="${escapeHtml(diagnostic.fileUri)}"`
                  : '';
                const lineAttr = diagnostic.line ? ` data-line="${diagnostic.line}"` : '';
                const columnAttr = diagnostic.column ? ` data-column="${diagnostic.column}"` : '';
                return `
                  <button class="diagnostic ${escapeHtml(
                    diagnostic.severity
                  )}" type="button" data-diagnostic-index="${index}"${fileAttr}${lineAttr}${columnAttr}>
                    <div class="diagnostic-meta">
                      <span class="diagnostic-severity">${escapeHtml(diagnostic.severity)}</span>
                      ${code}
                      ${location}
                    </div>
                    <p class="diagnostic-message">${escapeHtml(diagnostic.message)}</p>
                  </button>
                `;
              })
              .join('');
            return `
              <section class="diagnostic-group">
                <div class="diagnostic-group-heading">
                  <span>${escapeHtml(fileUri)}</span>
                  <span class="small-pill">${items.length} ${items.length === 1 ? 'issue' : 'issues'}</span>
                </div>
                ${itemsBody}
              </section>
            `;
          })
          .join('');

  element.innerHTML = `${filters}${body}`;
  /*
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
  */
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
  const workerTelemetry = getCompileWorkerTelemetry();
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
    <div class="compile-detail-block">
      <div class="compile-detail-heading">Worker and bundle</div>
      <div class="insight-row">
        <span class="insight-key">worker boot</span>
        <span class="insight-value">${
          workerTelemetry.bootMs != null ? `${workerTelemetry.bootMs.toFixed(1)}ms` : 'warming'
        }</span>
      </div>
      <div class="insight-row">
        <span class="insight-key">worker tasks</span>
        <span class="insight-value">${workerTelemetry.completedTaskCount}</span>
      </div>
      <div class="insight-row">
        <span class="insight-key">bundle</span>
        <span class="insight-value">${formatBytes(result.js.length)} / ${result.runnableModules.length} chunks</span>
      </div>
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

const renderRouteDetails = (
  element: HTMLElement,
  project: PlaygroundProject,
  preview: PlaygroundRoutePreview,
  baseHref: string
): void => {
  const current = currentRouteLocation(preview);
  const currentHref = routeHrefFromLocation(current, baseHref);
  const matchSummary = buildRouteMatchSummary(project, current.pathname);
  const searchParams = parseSearchParams(current.search);
  const routeHelperCounts = {
    loaders: project.files.reduce(
      (count, file) => count + (file.text.match(/\brouteLoader\b/g)?.length ?? 0),
      0
    ),
    prefetches: project.files.reduce(
      (count, file) => count + (file.text.match(/\bprefetchRoute\b/g)?.length ?? 0),
      0
    ),
    navigations: project.files.reduce(
      (count, file) => count + (file.text.match(/\bnavigate\b/g)?.length ?? 0),
      0
    ),
  };

  const historyRows = preview.entries
    .map((entry, index) => {
      const href = routeHrefFromLocation(entry, baseHref);
      return `
        <div class="insight-row route-history-row"${index === preview.index ? ' data-active="true"' : ''}>
          <span class="insight-key">${index === preview.index ? 'current' : `entry ${index + 1}`}</span>
          <span class="insight-value route-history-value">${escapeHtml(href)}</span>
        </div>
      `;
    })
    .join('');

  const knownPaths =
    matchSummary.knownPaths.length > 0
      ? matchSummary.knownPaths
          .map((path) => `<span class="small-pill">${escapeHtml(path)}</span>`)
          .join('')
      : '<p class="module-empty">No route-like paths detected.</p>';

  const searchRows =
    searchParams.length > 0
      ? searchParams
          .map(
            (entry) => `
              <div class="insight-row">
                <span class="insight-key">${escapeHtml(entry.key)}</span>
                <span class="insight-value">${escapeHtml(entry.value)}</span>
              </div>
            `
          )
          .join('')
      : '<p class="module-empty">No search params.</p>';

  element.innerHTML = `
    <div class="compile-detail-block">
      <div class="compile-detail-heading">Current route</div>
      <div class="insight-row">
        <span class="insight-key">href</span>
        <span class="insight-value route-history-value">${escapeHtml(currentHref)}</span>
      </div>
      <div class="insight-row">
        <span class="insight-key">match</span>
        <span class="insight-value">${escapeHtml(matchSummary.current ?? 'no exact match')}</span>
      </div>
      <div class="insight-row">
        <span class="insight-key">helpers</span>
        <span class="insight-value">${routeHelperCounts.loaders} loaders / ${routeHelperCounts.prefetches} prefetch / ${routeHelperCounts.navigations} nav</span>
      </div>
    </div>
    <div class="compile-detail-block">
      <div class="compile-detail-heading">Search params</div>
      ${searchRows}
    </div>
    <div class="compile-detail-block">
      <div class="compile-detail-heading">Known app paths</div>
      <div class="pill-wrap">${knownPaths}</div>
    </div>
    <div class="compile-detail-block">
      <div class="compile-detail-heading">History stack</div>
      ${historyRows}
    </div>
  `;
};

const renderPackageDetails = (element: HTMLElement, project: PlaygroundProject): void => {
  const summary = parsePackageSummaries(project);
  if (summary.packages.length === 0) {
    element.innerHTML = `
      ${
        summary.warnings.length > 0
          ? `<div class="compile-detail-block">${summary.warnings
              .map((warning) => `<p class="module-empty">${escapeHtml(warning)}</p>`)
              .join('')}</div>`
          : ''
      }
      <p class="empty-state">No package files are in this project yet.</p>
    `;
    return;
  }

  element.innerHTML = `
    ${
      summary.warnings.length > 0
        ? `<div class="compile-detail-block">${summary.warnings
            .map((warning) => `<p class="module-empty">${escapeHtml(warning)}</p>`)
            .join('')}</div>`
        : ''
    }
    ${summary.packages
      .map(
        (pkg) => `
          <article class="module-card package-card" data-package-id="${escapeHtml(pkg.id)}">
            <div class="module-card-top">
              <strong>${escapeHtml(pkg.id)}</strong>
              <span class="small-pill"${pkg.status === 'warning' ? ' data-active="true"' : ''}>${escapeHtml(
                pkg.status
              )}</span>
            </div>
            <div class="compile-resolution-meta">${escapeHtml(pkg.message)}</div>
            <code>${escapeHtml(pkg.path)}</code>
            ${pkg.luminaPath ? `<code>${escapeHtml(pkg.luminaPath)}</code>` : ''}
            <div class="tool-row compact-tools package-actions">
              <button class="tool-button secondary" type="button" data-package-action="focus" data-package-id="${escapeHtml(
                pkg.id
              )}">Focus</button>
              <button class="tool-button secondary" type="button" data-package-action="export" data-package-id="${escapeHtml(
                pkg.id
              )}">Export</button>
              <button class="tool-button secondary" type="button" data-package-action="remove" data-package-id="${escapeHtml(
                pkg.id
              )}">Remove</button>
            </div>
          </article>
        `
      )
      .join('')}
  `;
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
  const startedAt = now();
  updateLinks();
  const playgroundBaseHref = new URL('/', window.location.href).toString();
  const bridge = globalThis as Record<string, unknown>;
  await import('./codemirror-bridge');

  const mountEditor = bridge.mountEditor as MountEditor | undefined;
  const getEditorText = bridge.getEditorText as GetEditorText | undefined;
  const setEditorText = bridge.setEditorText as SetEditorText | undefined;
  const focusEditorLocation = bridge.focusEditorLocation as FocusEditorLocation | undefined;
  const getEditorCursor = bridge.getEditorCursor as GetEditorCursor | undefined;
  const onEditorChange = bridge.onEditorChange as OnEditorChange | undefined;
  if (
    !mountEditor ||
    !getEditorText ||
    !setEditorText ||
    !focusEditorLocation ||
    !getEditorCursor ||
    !onEditorChange
  ) {
    throw new Error('Editor tools did not load.');
  }

  const diagnosticsRoot = document.getElementById('diagnostics-root');
  const outputRoot = document.getElementById('output-root');
  const consoleRoot = document.getElementById('console-root');
  const moduleGraphRoot = document.getElementById('module-graph-root');
  const compileDetailsRoot = document.getElementById('compile-details-root');
  const packageDetailsRoot = document.getElementById('package-details-root');
  const routeDetailsRoot = document.getElementById('route-details-root');
  const routeEventsRoot = document.getElementById('route-events-root');
  const dialogRoot = document.getElementById('dialog-root');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogBody = document.getElementById('dialog-body');
  const dialogFieldsRoot = document.getElementById('dialog-fields-root');
  const dialogError = document.getElementById('dialog-error');
  const dialogForm = document.getElementById('dialog-form') as HTMLFormElement | null;
  const dialogCancelButton = document.getElementById('dialog-cancel-button') as HTMLButtonElement | null;
  const dialogSubmitButton = document.getElementById('dialog-submit-button') as HTMLButtonElement | null;
  if (
    !diagnosticsRoot ||
    !outputRoot ||
    !consoleRoot ||
    !moduleGraphRoot ||
    !compileDetailsRoot ||
    !packageDetailsRoot ||
    !routeDetailsRoot ||
    !routeEventsRoot ||
    !dialogRoot ||
    !dialogTitle ||
    !dialogBody ||
    !dialogFieldsRoot ||
    !dialogError ||
    !dialogForm ||
    !dialogCancelButton ||
    !dialogSubmitButton
  ) {
    throw new Error('Playground panels did not mount.');
  }

  let workspaceStore = readWorkspaceStore();
  let state = resolveInitialState(playgroundBaseHref, workspaceStore);
  let baselineProject = cloneProject(state.project);
  let baselineWorkspaceName = state.workspaceName;
  let lastResult: CompileResult | null = null;
  let lastDiagnostics: CompileDiagnostic[] = [];
  let compileTimer: number | undefined;
  let autosaveTimer: number | undefined;
  let suppressNextScheduledCompile = false;
  let activeCompileController: AbortController | null = null;
  let activeRun:
    | {
        controller: AbortController;
      }
    | null = null;
  let diagnosticsFilter: 'all' | 'error' | 'warning' = 'all';
  let editorReadyMs = now() - startedAt;

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

  let activeDialogResolver:
    | ((value: Record<string, string> | null) => void)
    | null = null;

  const closeDialog = (value: Record<string, string> | null): void => {
    if (!activeDialogResolver) return;
    const resolve = activeDialogResolver;
    activeDialogResolver = null;
    delete dialogRoot.dataset.open;
    dialogFieldsRoot.innerHTML = '';
    dialogError.textContent = '';
    resolve(value);
  };

  const openDialog = (request: DialogRequest): Promise<Record<string, string> | null> => {
    if (activeDialogResolver) {
      activeDialogResolver(null);
      activeDialogResolver = null;
    }

    dialogTitle.textContent = request.title;
    dialogBody.textContent = request.message;
    dialogError.textContent = '';
    dialogSubmitButton.textContent = request.confirmLabel;
    dialogSubmitButton.dataset.tone = request.tone ?? 'primary';
    dialogFieldsRoot.innerHTML = (request.fields ?? [])
      .map(
        (field) => `
          <label class="dialog-field">
            <span class="route-field-label">${escapeHtml(field.label)}</span>
            <input
              class="route-input dialog-input"
              type="text"
              data-dialog-field="${escapeHtml(field.key)}"
              value="${escapeHtml(field.value)}"
              placeholder="${escapeHtml(field.placeholder ?? '')}"
            />
            ${
              field.description
                ? `<span class="dialog-help">${escapeHtml(field.description)}</span>`
                : ''
            }
          </label>
        `
      )
      .join('');
    dialogRoot.dataset.open = 'true';

    window.setTimeout(() => {
      const firstField = dialogFieldsRoot.querySelector<HTMLInputElement>('[data-dialog-field]');
      if (firstField) firstField.focus();
      else dialogSubmitButton.focus();
    }, 0);

    return new Promise((resolve) => {
      activeDialogResolver = resolve;
    });
  };

  const confirmDialog = async (
    title: string,
    message: string,
    confirmLabel: string,
    tone: 'primary' | 'danger' = 'primary'
  ): Promise<boolean> => {
    const result = await openDialog({ title, message, confirmLabel, tone });
    return Boolean(result);
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
    const dirtyFileUris = collectDirtyFileUris(state.project, baselineProject);
    fileTabs.innerHTML = state.project.openFileUris
      .map((uri) => {
        const isActive = uri === state.project.activeFileUri;
        const isEntry = uri === state.project.entryUri;
        const isDirty = dirtyFileUris.has(uri);
        return `
          <div class="file-tab"${isActive ? ' data-active="true"' : ''}>
            <button class="file-tab-button" data-file-uri="${escapeHtml(uri)}">
              <span>${escapeHtml(basename(uri))}</span>
              ${isDirty ? '<span class="file-item-dirty" aria-hidden="true"></span>' : ''}
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
    const dirtyFileUris = collectDirtyFileUris(state.project, baselineProject);
    fileList.innerHTML = state.project.files
      .map((file) => {
        const isActive = file.uri === state.project.activeFileUri;
        const isEntry = file.uri === state.project.entryUri;
        const isDirty = dirtyFileUris.has(file.uri);
        const depth = file.uri.split('/').length - 1;
        return `
          <button class="file-item"${isActive ? ' data-active="true"' : ''} data-file-uri="${escapeHtml(
            file.uri
          )}" style="padding-left:${12 + depth * 14}px">
            <span class="file-item-name">${escapeHtml(file.uri)}</span>
            ${isDirty ? '<span class="file-item-dirty" aria-hidden="true"></span>' : ''}
            ${isEntry ? '<span class="file-item-badge">entry</span>' : ''}
          </button>
        `;
      })
      .join('');
    const cursor = getEditorCursor('editor-root');
    setText('active-file-label', state.project.activeFileUri);
    setText(
      'active-file-stat',
      cursor ? `${state.project.activeFileUri}:${cursor.line}:${cursor.column}` : state.project.activeFileUri
    );
    setText('entry-file-label', `entry: ${state.project.entryUri}`);
  };

  const syncProjectStats = (): void => {
    const totalLines = countProjectLines(state.project.files);
    const workerTelemetry = getCompileWorkerTelemetry();
    setText('source-size', `${state.project.files.length} files • ${totalLines} lines`);
    setText('output-mode', lastResult ? `JS • ${lastResult.graphNodes} modules` : 'JS');
    setText(
      'insight-compile',
      lastResult ? `${lastResult.timings.totalMs.toFixed(1)}ms total` : 'Browser worker'
    );
    setText('insight-startup', `${editorReadyMs.toFixed(1)}ms editor`);
    setText(
      'insight-worker',
      workerTelemetry.bootMs != null
        ? `${workerTelemetry.bootMs.toFixed(1)}ms boot / ${workerTelemetry.restartCount} restarts`
        : 'warming'
    );
    setText(
      'insight-run',
      activeRun ? 'running' : state.consoleOutput.trim().length > 0 ? 'main() ready' : 'idle'
    );
    setText('insight-share', 'Project URL + local');
    setText('insight-modules', lastResult ? String(lastResult.graphNodes) : '0');
    setText('insight-graph', lastResult ? `${lastResult.graphEdges} edges` : '0 edges');
    setText(
      'insight-bundle',
      lastResult ? `${formatBytes(lastResult.js.length)} / ${lastResult.runnableModules.length} chunks` : '0 KB'
    );
    setText('insight-workspace', state.workspaceId ? state.workspaceName : 'ephemeral');
    setText('workspace-status-pill', state.dirty ? 'dirty' : state.workspaceId ? 'saved' : 'local');
    setDataset('workspace-status-pill', 'status', state.dirty ? 'error' : 'ok');
    setInputValue('workspace-name-input', state.workspaceName);
    setActivePreset(state.project.presetId);
    renderFileTabs();
    renderFileList();
    renderRouteDetails(routeDetailsRoot, state.project, state.routePreview, playgroundBaseHref);
    renderRouteEvents(routeEventsRoot, state.routeEvents);
    renderPackageDetails(packageDetailsRoot, state.project);
    renderWorkspaceList(
      document.getElementById('recent-workspaces-root') as HTMLElement,
      workspaceStore,
      state.workspaceId
    );
    updateRouteUi();
    setButtonDisabled('delete-workspace-button', !state.workspaceId);
    setButtonDisabled('rename-workspace-button', !state.workspaceId);
  };

  const setConsoleOutput = (value: string): void => {
    state = { ...state, consoleOutput: value };
    consoleRoot.textContent = value;
    persist();
    scheduleAutosave();
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
    scheduleAutosave();
  };

  const mountActiveFile = (uri: string): void => {
    const activeFile = getProjectFile(state.project, uri);
    if (!activeFile) return;
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', activeFile.text);
    state = { ...state, project: setActiveProjectFile(state.project, uri) };
    syncProjectStats();
    persist();
    scheduleAutosave();
  };

  const applyLoadedState = (
    nextState: PlaygroundUiState,
    options: { updateUrl?: 'preset' | 'clear' | 'share'; compile?: boolean } = {}
  ): void => {
    if (compileTimer) window.clearTimeout(compileTimer);
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    cancelActiveCompile('Superseded by a new project load.');
    cancelActiveRun('Execution cancelled after loading a new project.');
    state = nextState;
    baselineProject = cloneProject(nextState.project);
    baselineWorkspaceName = nextState.workspaceName;
    diagnosticsFilter = 'all';
    lastResult = null;
    lastDiagnostics = [];
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
    lastDiagnostics = diagnostic;
    setCompileStatus('Load failed', 'error');
    setRunStatus('Blocked', 'error');
    renderDiagnostics(diagnosticsRoot, diagnostic, diagnosticsFilter);
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
    if (compileTimer) {
      window.clearTimeout(compileTimer);
      compileTimer = undefined;
    }
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
      lastDiagnostics = result.diagnostics;
      setCompileStatus(result.ok ? `Compiled • ${result.timings.totalMs.toFixed(1)}ms` : 'Needs attention', result.ok ? 'ok' : 'error');
      setText('output-mode', `JS • ${result.graphNodes} modules`);
      renderDiagnostics(diagnosticsRoot, result.diagnostics, diagnosticsFilter);
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
      compileTimer = undefined;
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
    scheduleAutosave();
    syncProjectStats();
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
    scheduleAutosave();
    syncProjectStats();
    setRunStatus('Ready', 'idle');
    if (options.toast) showToast(options.toast);
    if (options.rerun && lastResult?.ok) {
      void runSource();
    }
  };

  const suggestWorkspaceFilename = (): string =>
    `${(state.workspaceName || 'workspace').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'workspace'}.json`;

  const persistWorkspaceSnapshot = (
    requestedName: string,
    options: { forceNewId?: boolean; silent?: boolean } = {}
  ): PlaygroundWorkspaceSnapshot | null => {
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    const trimmedName = requestedName.trim();
    if (!trimmedName) {
      showToast('Workspace name is required.');
      return null;
    }

    const snapshot = createWorkspaceSnapshot(
      trimmedName,
      persistedStateFromPlayground(state),
      options.forceNewId || !state.workspaceId ? undefined : state.workspaceId
    );
    workspaceStore = upsertWorkspaceSnapshot(workspaceStore, snapshot);
    writeWorkspaceStore(workspaceStore);
    state = {
      ...state,
      workspaceId: snapshot.id,
      workspaceName: snapshot.name,
      dirty: false,
    };
    baselineProject = cloneProject(state.project);
    baselineWorkspaceName = snapshot.name;
    persist();
    syncProjectStats();
    if (!options.silent) {
      showToast(options.forceNewId ? 'Workspace saved as new.' : 'Workspace saved.');
    }
    return snapshot;
  };

  const scheduleAutosave = (): void => {
    if (autosaveTimer) window.clearTimeout(autosaveTimer);
    if (!state.workspaceId || !state.workspaceName.trim()) return;
    autosaveTimer = window.setTimeout(() => {
      syncProjectFromEditor();
      persistWorkspaceSnapshot(state.workspaceName, { silent: true });
    }, 900);
  };

  const saveWorkspace = async (forceNewId: boolean): Promise<void> => {
    syncProjectFromEditor();
    let requestedName = state.workspaceName.trim();
    if (forceNewId || !requestedName) {
      const dialogResult = await openDialog({
        title: forceNewId ? 'Save Workspace As' : 'Save Workspace',
        message: 'Give this workspace a name so it can be reused locally.',
        confirmLabel: forceNewId ? 'Save As' : 'Save',
        fields: [
          {
            key: 'name',
            label: 'Workspace name',
            value: state.workspaceName || 'workspace',
            placeholder: 'workspace',
          },
        ],
      });
      if (!dialogResult) return;
      requestedName = dialogResult.name?.trim() ?? '';
    }

    persistWorkspaceSnapshot(requestedName, { forceNewId });
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

  const renameWorkspace = async (): Promise<void> => {
    if (!state.workspaceId) {
      showToast('Save the workspace first.');
      return;
    }
    const dialogResult = await openDialog({
      title: 'Rename Workspace',
      message: 'Update the saved workspace name.',
      confirmLabel: 'Rename',
      fields: [
        {
          key: 'name',
          label: 'Workspace name',
          value: state.workspaceName,
          placeholder: 'workspace',
        },
      ],
    });
    if (!dialogResult) return;
    persistWorkspaceSnapshot(dialogResult.name ?? state.workspaceName, { forceNewId: false });
    showToast('Workspace renamed.');
  };

  const scaffoldPackageFiles = async (): Promise<void> => {
    syncProjectFromEditor();
    const dialogResult = await openDialog({
      title: 'Scaffold Package',
      message: 'Create a package entry and a source-backed Lumina module inside the playground.',
      confirmLabel: 'Scaffold',
      fields: [
        {
          key: 'packageName',
          label: 'Package name',
          value: 'demo-utils',
          placeholder: 'demo-utils',
        },
        {
          key: 'version',
          label: 'Version',
          value: '0.1.0',
          placeholder: '0.1.0',
        },
      ],
    });
    if (!dialogResult) return;
    const packageName = dialogResult.packageName?.trim();
    if (!packageName) {
      showToast('Package name is required.');
      return;
    }
    const version = dialogResult.version?.trim() || '0.1.0';
    const lockUri = 'lumina.lock';
    const packageRoot = `.lumina/packages/${packageName}@${version}`;
    const libraryUri = `${packageRoot}/src/lib.lm`;
    let nextProject = cloneProject(state.project);
    const existingLockfile = getProjectFile(nextProject, lockUri);
    let nextLockfileText = `{\n  "version": 1,\n  "packages": {\n    "${packageName}@${version}": {\n      "name": "${packageName}",\n      "version": "${version}",\n      "resolved": "https://registry.example.dev/${packageName}-${version}.tgz",\n      "path": "./${packageRoot}",\n      "integrity": "sha256:todo",\n      "lumina": "./src/lib.lm",\n      "deps": {}\n    }\n  }\n}\n`;
    if (existingLockfile) {
      try {
        const parsed = JSON.parse(existingLockfile.text) as {
          version?: number;
          packages?: Record<string, unknown>;
        };
        const nextPackages = {
          ...(parsed.packages ?? {}),
          [`${packageName}@${version}`]: {
            name: packageName,
            version,
            resolved: `https://registry.example.dev/${packageName}-${version}.tgz`,
            path: `./${packageRoot}`,
            integrity: 'sha256:todo',
            lumina: './src/lib.lm',
            deps: {},
          },
        };
        nextLockfileText = `${JSON.stringify(
          {
            version: parsed.version ?? 1,
            packages: nextPackages,
          },
          null,
          2
        )}\n`;
      } catch {
        showToast('Fix lumina.lock JSON before scaffolding a package.');
        return;
      }
    }
    nextProject = existingLockfile
      ? updateProjectFileText(nextProject, lockUri, nextLockfileText)
      : addProjectFile(nextProject, lockUri, nextLockfileText);
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

  const packageRootForId = (packageId: string): string => `.lumina/packages/${packageId}`;

  const focusPackage = (packageId: string): void => {
    const root = packageRootForId(packageId);
    const packageFile =
      state.project.files.find((file) => file.uri === `${root}/src/lib.lm`) ??
      state.project.files.find((file) => file.uri.startsWith(`${root}/`));
    if (!packageFile) {
      showToast('Package files were not found.');
      return;
    }
    syncProjectFromEditor();
    mountActiveFile(packageFile.uri);
  };

  const exportPackage = (packageId: string): void => {
    const root = packageRootForId(packageId);
    const packageFiles = state.project.files
      .filter((file) => file.uri.startsWith(`${root}/`))
      .map((file) => ({ uri: file.uri, text: file.text }));
    if (packageFiles.length === 0) {
      showToast('Nothing to export for that package.');
      return;
    }
    downloadTextFile(
      `${packageId.replace(/[^a-z0-9@._-]+/gi, '-')}.package.json`,
      JSON.stringify(
        {
          packageId,
          files: packageFiles,
        },
        null,
        2
      )
    );
    showToast('Package exported.');
  };

  const removePackage = async (packageId: string): Promise<void> => {
    const confirmed = await confirmDialog(
      'Remove Package',
      `Remove ${packageId} from this workspace?`,
      'Remove',
      'danger'
    );
    if (!confirmed) return;

    syncProjectFromEditor();
    const root = packageRootForId(packageId);
    let nextProject = cloneProject(state.project);
    const packageUris = nextProject.files
      .map((file) => file.uri)
      .filter((uri) => uri.startsWith(`${root}/`));
    for (const uri of packageUris) {
      nextProject = removeProjectFile(nextProject, uri);
    }
    const lockfile = getProjectFile(nextProject, 'lumina.lock');
    if (lockfile) {
      try {
        const parsed = JSON.parse(lockfile.text) as {
          version?: number;
          packages?: Record<string, unknown>;
        };
        const nextPackages = { ...(parsed.packages ?? {}) };
        delete nextPackages[packageId];
        nextProject = updateProjectFileText(
          nextProject,
          'lumina.lock',
          `${JSON.stringify(
            {
              version: parsed.version ?? 1,
              packages: nextPackages,
            },
            null,
            2
          )}\n`
        );
      } catch {
        showToast('Package files removed, but lumina.lock still needs manual cleanup.');
      }
    }

    state = { ...state, project: nextProject };
    clearPresetUrl();
    markDirty();
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', getProjectFile(state.project, state.project.activeFileUri)?.text ?? '');
    syncProjectStats();
    persist();
    scheduleAutosave();
    scheduleCompile(0);
    showToast('Package removed.');
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
  editorReadyMs = now() - startedAt;

  dialogForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(
      Array.from(dialogFieldsRoot.querySelectorAll<HTMLInputElement>('[data-dialog-field]')).map(
        (field) => [field.dataset.dialogField ?? '', field.value]
      )
    );
    closeDialog(values);
  });

  dialogSubmitButton.addEventListener('click', () => {
    const values = Object.fromEntries(
      Array.from(dialogFieldsRoot.querySelectorAll<HTMLInputElement>('[data-dialog-field]')).map(
        (field) => [field.dataset.dialogField ?? '', field.value]
      )
    );
    closeDialog(values);
  });

  dialogCancelButton.addEventListener('click', () => {
    closeDialog(null);
  });

  dialogRoot.addEventListener('click', (event) => {
    if (event.target === dialogRoot) closeDialog(null);
  });

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
    const renamed = next.trim() !== baselineWorkspaceName.trim();
    state = { ...state, workspaceName: next, dirty: state.dirty || renamed };
    syncProjectStats();
    persist();
    scheduleAutosave();
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
    void saveWorkspace(false);
  });

  document.getElementById('save-workspace-as-button')?.addEventListener('click', () => {
    void saveWorkspace(true);
  });

  document.getElementById('rename-workspace-button')?.addEventListener('click', () => {
    void renameWorkspace();
  });

  document.getElementById('delete-workspace-button')?.addEventListener('click', async () => {
    if (!state.workspaceId) {
      showToast('Nothing saved yet.');
      return;
    }
    const confirmed = await confirmDialog(
      'Delete Workspace',
      `Delete workspace ${state.workspaceName}?`,
      'Delete',
      'danger'
    );
    if (!confirmed) return;
    workspaceStore = removeWorkspaceSnapshot(workspaceStore, state.workspaceId);
    writeWorkspaceStore(workspaceStore);
    state = { ...state, workspaceId: null, dirty: true };
    baselineWorkspaceName = state.workspaceName;
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

  document.getElementById('reset-workspace-button')?.addEventListener('click', async () => {
    const presetId = state.project.sourcePresetId;
    const preset = presetId
      ? playgroundPresets.find((entry) => entry.id === presetId)
      : defaultPlaygroundPreset;
    if (!preset) {
      showToast('No source preset is available for reset.');
      return;
    }
    const confirmed = await confirmDialog(
      'Reset Workspace',
      `Reset this workspace back to ${preset.label}?`,
      'Reset',
      'danger'
    );
    if (!confirmed) return;
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
    void scaffoldPackageFiles();
  });

  document.getElementById('new-file-button')?.addEventListener('click', async () => {
    syncProjectFromEditor();
    const suggested = nextUntitledFileUri(state.project);
    const dialogResult = await openDialog({
      title: 'Create File',
      message: 'Add a new source or support file to this playground project.',
      confirmLabel: 'Create',
      fields: [
        {
          key: 'path',
          label: 'File path',
          value: suggested,
          placeholder: 'notes.lm',
        },
      ],
    });
    if (!dialogResult) return;
    const requested = normalizeProjectUri(dialogResult.path?.trim() ?? '');
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
    scheduleAutosave();
    scheduleCompile(0);
  });

  document.getElementById('rename-file-button')?.addEventListener('click', async () => {
    syncProjectFromEditor();
    const dialogResult = await openDialog({
      title: 'Rename or Move File',
      message: 'Change the path for the active file.',
      confirmLabel: 'Apply',
      fields: [
        {
          key: 'path',
          label: 'File path',
          value: state.project.activeFileUri,
          placeholder: state.project.activeFileUri,
        },
      ],
    });
    if (!dialogResult) return;
    const requested = normalizeProjectUri(dialogResult.path?.trim() ?? '');
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
    scheduleAutosave();
    scheduleCompile(0);
  });

  document.getElementById('duplicate-file-button')?.addEventListener('click', async () => {
    syncProjectFromEditor();
    const suggested = nextDuplicateFileUri(state.project, state.project.activeFileUri);
    const dialogResult = await openDialog({
      title: 'Duplicate File',
      message: 'Create a copy of the active file.',
      confirmLabel: 'Duplicate',
      fields: [
        {
          key: 'path',
          label: 'New file path',
          value: suggested,
          placeholder: suggested,
        },
      ],
    });
    if (!dialogResult) return;
    const requested = normalizeProjectUri(dialogResult.path?.trim() ?? '');
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
    scheduleAutosave();
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
    scheduleAutosave();
    scheduleCompile(0);
    showToast('Entry file updated.');
  });

  document.getElementById('delete-file-button')?.addEventListener('click', async () => {
    syncProjectFromEditor();
    if (state.project.activeFileUri === state.project.entryUri) {
      showToast('Entry files stay protected.');
      return;
    }
    const confirmed = await confirmDialog(
      'Delete File',
      `Delete ${state.project.activeFileUri}?`,
      'Delete',
      'danger'
    );
    if (!confirmed) return;
    const nextProject = removeProjectFile(state.project, state.project.activeFileUri);
    state = { ...state, project: nextProject };
    clearPresetUrl();
    markDirty();
    const nextFile = getProjectFile(state.project, state.project.activeFileUri);
    suppressNextScheduledCompile = true;
    setEditorText('editor-root', nextFile?.text ?? '');
    syncProjectStats();
    persist();
    scheduleAutosave();
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
      scheduleAutosave();
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

  window.addEventListener('storage', (event) => {
    if (event.key !== workspaceStorageKey) return;
    const previousSavedAt = state.workspaceId
      ? getWorkspaceSnapshot(workspaceStore, state.workspaceId)?.savedAt ?? null
      : null;
    workspaceStore = readWorkspaceStore();
    const incomingSavedAt = state.workspaceId
      ? getWorkspaceSnapshot(workspaceStore, state.workspaceId)?.savedAt ?? null
      : null;
    syncProjectStats();
    if (!state.workspaceId || incomingSavedAt == null || incomingSavedAt === previousSavedAt) {
      return;
    }
    if (state.dirty) {
      showToast('This workspace changed in another tab.');
      return;
    }
    loadWorkspace(state.workspaceId);
    showToast('Workspace refreshed from another tab.');
  });

  diagnosticsRoot.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const filterButton = target?.closest<HTMLElement>('[data-diagnostic-filter]');
    if (filterButton?.dataset.diagnosticFilter) {
      const nextFilter = filterButton.dataset.diagnosticFilter as 'all' | 'error' | 'warning';
      diagnosticsFilter = nextFilter;
      renderDiagnostics(diagnosticsRoot, lastDiagnostics, diagnosticsFilter);
      return;
    }

    const diagnosticButton = target?.closest<HTMLElement>('[data-file-uri]');
    const fileUri = diagnosticButton?.dataset.fileUri;
    if (!fileUri) return;
    const line = Number(diagnosticButton.dataset.line ?? '1');
    const column = Number(diagnosticButton.dataset.column ?? '1');
    syncProjectFromEditor();
    if (!getProjectFile(state.project, fileUri)) {
      showToast(`Diagnostic target ${fileUri} is not in the current project.`);
      return;
    }
    mountActiveFile(fileUri);
    focusEditorLocation('editor-root', Number.isFinite(line) ? line : 1, Number.isFinite(column) ? column : 1);
    syncProjectStats();
  });

  packageDetailsRoot.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionButton = target?.closest<HTMLElement>('[data-package-action]');
    const action = actionButton?.dataset.packageAction;
    const packageId = actionButton?.dataset.packageId;
    if (!action || !packageId) return;
    if (action === 'focus') {
      focusPackage(packageId);
      return;
    }
    if (action === 'export') {
      exportPackage(packageId);
      return;
    }
    if (action === 'remove') {
      void removePackage(packageId);
    }
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
    if (event.key === 'Escape' && dialogRoot.dataset.open === 'true') {
      event.preventDefault();
      closeDialog(null);
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveWorkspace(true);
      return;
    }
    if (meta && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveWorkspace(false);
      return;
    }
    if (meta && event.shiftKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      (document.getElementById('new-file-button') as HTMLButtonElement | null)?.click();
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
