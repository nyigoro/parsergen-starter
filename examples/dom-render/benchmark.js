import { render as luminaRender } from './lumina-runtime.js?v=2026-04-29-benchmark-quality-v5';
import {
  compiledForList,
  compiledIndexList,
  compiledReorder,
} from './benchmark-compiled.generated.js?v=2026-04-29-benchmark-quality-v5';

const benchmarkQuery =
  typeof globalThis.location?.search === 'string' ? new URLSearchParams(globalThis.location.search) : new URLSearchParams();

const parsePositiveInt = (rawValue, fallback) => {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readFlag = (name) => benchmarkQuery.get(name) === '1';
const BENCHMARK_TIER_PRESETS = Object.freeze({
  smoke: Object.freeze({
    tier: 'smoke',
    smokeMode: true,
    localOnly: true,
    listSize: 32,
    wholeListIterations: 12,
    indexListIterations: 12,
    forListIterations: 12,
    reorderIterations: 12,
    singleMoveIterations: 10,
    complexReorderIterations: 8,
    structureDiffIterations: 8,
    fineGrainedIterations: 12,
    mountIterations: 6,
    warmupRuns: 1,
    measuredRuns: 2,
  }),
  local: Object.freeze({
    tier: 'local',
    smokeMode: false,
    localOnly: true,
    listSize: 1000,
    wholeListIterations: 300,
    indexListIterations: 300,
    forListIterations: 300,
    reorderIterations: 300,
    singleMoveIterations: 240,
    complexReorderIterations: 150,
    structureDiffIterations: 150,
    fineGrainedIterations: 300,
    mountIterations: 40,
    warmupRuns: 1,
    measuredRuns: 3,
  }),
  full: Object.freeze({
    tier: 'full',
    smokeMode: false,
    localOnly: false,
    listSize: 1000,
    wholeListIterations: 300,
    indexListIterations: 300,
    forListIterations: 300,
    reorderIterations: 300,
    singleMoveIterations: 240,
    complexReorderIterations: 150,
    structureDiffIterations: 150,
    fineGrainedIterations: 300,
    mountIterations: 40,
    warmupRuns: 1,
    measuredRuns: 3,
  }),
});

const isBenchmarkTier = (value) => value === 'smoke' || value === 'local' || value === 'full';

const resolveBenchmarkTier = () => {
  const explicitTier = benchmarkQuery.get('tier');
  if (isBenchmarkTier(explicitTier)) {
    return explicitTier;
  }
  if (readFlag('smoke')) {
    return 'smoke';
  }
  if (readFlag('localOnly')) {
    return 'local';
  }
  return 'full';
};

const BENCHMARK_TIER = resolveBenchmarkTier();
const BENCHMARK_PRESET = BENCHMARK_TIER_PRESETS[BENCHMARK_TIER];
const SMOKE_MODE = BENCHMARK_PRESET.smokeMode;
const LOCAL_ONLY = BENCHMARK_PRESET.localOnly;
const PRESERVE_HOSTS = SMOKE_MODE || readFlag('preserveHosts');
const LIST_SIZE = parsePositiveInt(benchmarkQuery.get('listSize'), BENCHMARK_PRESET.listSize);
const WHOLE_LIST_ITERATIONS = parsePositiveInt(benchmarkQuery.get('wholeListIterations'), BENCHMARK_PRESET.wholeListIterations);
const INDEX_LIST_ITERATIONS = parsePositiveInt(benchmarkQuery.get('indexListIterations'), BENCHMARK_PRESET.indexListIterations);
const FOR_LIST_ITERATIONS = parsePositiveInt(benchmarkQuery.get('forListIterations'), BENCHMARK_PRESET.forListIterations);
const REORDER_ITERATIONS = parsePositiveInt(benchmarkQuery.get('reorderIterations'), BENCHMARK_PRESET.reorderIterations);
const SINGLE_MOVE_ITERATIONS = parsePositiveInt(benchmarkQuery.get('singleMoveIterations'), BENCHMARK_PRESET.singleMoveIterations);
const COMPLEX_REORDER_ITERATIONS = parsePositiveInt(
  benchmarkQuery.get('complexReorderIterations'),
  BENCHMARK_PRESET.complexReorderIterations
);
const STRUCTURE_DIFF_ITERATIONS = parsePositiveInt(
  benchmarkQuery.get('structureDiffIterations'),
  BENCHMARK_PRESET.structureDiffIterations
);
const FINE_GRAINED_ITERATIONS = parsePositiveInt(benchmarkQuery.get('fineGrainedIterations'), BENCHMARK_PRESET.fineGrainedIterations);
const MOUNT_ITERATIONS = parsePositiveInt(benchmarkQuery.get('mountIterations'), BENCHMARK_PRESET.mountIterations);
const WARMUP_RUNS = parsePositiveInt(benchmarkQuery.get('warmupRuns'), BENCHMARK_PRESET.warmupRuns);
const MEASURED_RUNS = parsePositiveInt(benchmarkQuery.get('measuredRuns'), BENCHMARK_PRESET.measuredRuns);
const BENCHMARK_HISTORY_KEY = `lumina.dom.benchmark.history.v5.${BENCHMARK_TIER}`;
const BENCHMARK_SCHEMA_VERSION = 4;
const BENCHMARK_SUITE_VERSION = '2026-04-29-benchmark-quality-v5';
const BENCHMARK_DOM_SHAPE = Object.freeze({
  listTag: 'ul',
  listClassName: 'bench-list',
  rowTag: 'li',
  rowClassName: 'bench-row',
  pillTag: 'span',
  pillClassName: 'bench-pill',
  pillText: 'row',
  valueTag: 'span',
  valueClassName: 'bench-value',
});
const BENCHMARK_TIMING_CONTRACT = Object.freeze({
  clock: 'performance.now()',
  mark: 'performance.mark()',
  measure: 'performance.measure()',
  clearMarks: 'performance.clearMarks()',
  clearMeasures: 'performance.clearMeasures()',
});
const BENCHMARK_SCENARIO_CONTRACTS = Object.freeze([
  Object.freeze({
    key: 'wholeList',
    label: 'whole-list patch',
    tableId: 'results-whole-list',
    iterations: WHOLE_LIST_ITERATIONS,
    suites: Object.freeze([
      'Lumina generic rerender',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19', 'Solid 1']),
    ]),
  }),
  Object.freeze({
    key: 'mount',
    label: 'initial mount',
    tableId: 'results-mount',
    iterations: MOUNT_ITERATIONS,
    suites: Object.freeze([
      'Lumina render DOM',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19', 'Solid 1']),
    ]),
  }),
  Object.freeze({
    key: 'indexList',
    label: 'indexed list patch',
    tableId: 'results-index-list',
    iterations: INDEX_LIST_ITERATIONS,
    suites: Object.freeze([
      'Lumina indexList',
      'Lumina indexList (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19 memo rows', 'Solid 1 Index']),
    ]),
  }),
  Object.freeze({
    key: 'forList',
    label: 'stable signal list patch',
    tableId: 'results-for-list',
    iterations: FOR_LIST_ITERATIONS,
    suites: Object.freeze([
      'Lumina forList',
      'Lumina forList (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19 memo rows', 'Solid 1 Index']),
    ]),
  }),
  Object.freeze({
    key: 'reorder',
    label: 'keyed reorder',
    tableId: 'results-reorder',
    iterations: REORDER_ITERATIONS,
    suites: Object.freeze([
      'Lumina generic keyed patch',
      'Lumina keyed list',
      'Lumina keyed list (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19']),
    ]),
  }),
  Object.freeze({
    key: 'singleMove',
    label: 'single keyed move',
    tableId: 'results-single-move',
    iterations: SINGLE_MOVE_ITERATIONS,
    suites: Object.freeze([
      'Lumina generic keyed patch',
      'Lumina keyed list',
      'Lumina keyed list (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19']),
    ]),
  }),
  Object.freeze({
    key: 'complexReorder',
    label: 'complex keyed reorder window',
    tableId: 'results-complex-reorder',
    iterations: COMPLEX_REORDER_ITERATIONS,
    suites: Object.freeze([
      'Lumina generic keyed patch',
      'Lumina keyed list',
      'Lumina keyed list (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19']),
    ]),
  }),
  Object.freeze({
    key: 'structureDiff',
    label: 'keyed structure diff',
    tableId: 'results-structure-diff',
    iterations: STRUCTURE_DIFF_ITERATIONS,
    suites: Object.freeze([
      'Lumina generic keyed patch',
      'Lumina keyed list',
      'Lumina keyed list (compiled)',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['React 19']),
    ]),
  }),
  Object.freeze({
    key: 'fineGrained',
    label: 'fine-grained row update',
    tableId: 'results-fine-grained',
    iterations: FINE_GRAINED_ITERATIONS,
    suites: Object.freeze([
      'Lumina signals + DOM',
      'Vanilla DOM',
      ...(LOCAL_ONLY ? [] : ['Solid signals']),
    ]),
  }),
]);
const BENCHMARK_CONTRACT = Object.freeze({
  domShape: BENCHMARK_DOM_SHAPE,
  timing: BENCHMARK_TIMING_CONTRACT,
  scenarios: BENCHMARK_SCENARIO_CONTRACTS,
});
const BENCHMARK_MANIFEST = Object.freeze({
  version: BENCHMARK_SCHEMA_VERSION,
  suiteVersion: BENCHMARK_SUITE_VERSION,
  tier: BENCHMARK_TIER,
  smokeMode: SMOKE_MODE,
  localOnly: LOCAL_ONLY,
  warmupRuns: WARMUP_RUNS,
  measuredRuns: MEASURED_RUNS,
  listSize: LIST_SIZE,
  scenarios: Object.freeze(BENCHMARK_SCENARIO_CONTRACTS.map((scenario) => scenario.label)),
});

const workspace = document.getElementById('workspace');
const runButton = document.getElementById('run');
const exportButton = document.getElementById('export-json');
const statusNode = document.getElementById('status');
const historyNode = document.getElementById('history-count');

const createHost = (id) => {
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement('div');
    host.id = id;
    workspace.appendChild(host);
  }
  host.textContent = '';
  return host;
};

const clearTable = (tableId) => {
  const tbody = document.getElementById(tableId);
  tbody.innerHTML = '';
  return tbody;
};

const appendResult = (tableId, name, summary) => {
  const tbody = document.getElementById(tableId);
  const row = document.createElement('tr');
  row.innerHTML = `<td>${name}</td><td>${summary.medianMs.toFixed(2)}</td><td>${summary.avgMsPerIteration.toFixed(4)}</td><td>${summary.minMs.toFixed(2)} - ${summary.maxMs.toFixed(2)}</td>`;
  tbody.appendChild(row);
};

const nextTick = () => Promise.resolve();
const setStatus = (message) => {
  statusNode.textContent = message;
};

const captureHostSnapshot = (host) => (PRESERVE_HOSTS ? host.innerHTML : null);
const unmountWithSmokeSnapshot = (host, teardown) => {
  const snapshot = captureHostSnapshot(host);
  teardown();
  restoreHostSnapshot(host, snapshot);
};
const restoreHostSnapshot = (host, snapshot) => {
  if (typeof snapshot === 'string') {
    host.innerHTML = snapshot;
  }
};
const preserveMountedHostSnapshot = (host, mountOnce) => {
  if (!PRESERVE_HOSTS) {
    return;
  }
  unmountWithSmokeSnapshot(host, mountOnce());
};
const getScenarioContract = (scenarioKey) => {
  const scenario = BENCHMARK_SCENARIO_CONTRACTS.find((candidate) => candidate.key === scenarioKey);
  if (!scenario) {
    throw new Error(`Unknown benchmark scenario contract: ${scenarioKey}`);
  }
  return scenario;
};
const bindScenarioSuites = (scenarioKey, benchmarks) => {
  const scenario = getScenarioContract(scenarioKey);
  if (benchmarks.length !== scenario.suites.length) {
    throw new Error(
      `Scenario ${scenarioKey} expected ${scenario.suites.length} suites but received ${benchmarks.length}`
    );
  }
  return scenario.suites.map((name, index) => [name, benchmarks[index]]);
};

const isCompatibleHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.schemaVersion !== BENCHMARK_SCHEMA_VERSION) return false;
  if (entry.suiteVersion !== BENCHMARK_SUITE_VERSION) return false;
  return JSON.stringify(entry.manifest ?? null) === JSON.stringify(BENCHMARK_MANIFEST);
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const min = (values) => values.reduce((best, value) => (value < best ? value : best), values[0] ?? 0);
const max = (values) => values.reduce((best, value) => (value > best ? value : best), values[0] ?? 0);
const mean = (values) => (values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length);

const summarizeSamples = (samplesMs, iterations) => {
  const medianMs = median(samplesMs);
  const minMs = min(samplesMs);
  const maxMs = max(samplesMs);
  const meanMs = mean(samplesMs);
  return {
    iterations,
    samplesMs,
    minMs,
    medianMs,
    maxMs,
    meanMs,
    avgMsPerIteration: medianMs / iterations,
  };
};

const getEnvironmentSnapshot = () => ({
  userAgent: navigator.userAgent,
  hardwareConcurrency: navigator.hardwareConcurrency ?? null,
  deviceMemory: navigator.deviceMemory ?? null,
  language: navigator.language ?? null,
  languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [],
  platform: navigator.platform ?? null,
});

const toExportPayload = (result, history) => ({
  schemaVersion: BENCHMARK_SCHEMA_VERSION,
  suiteVersion: BENCHMARK_SUITE_VERSION,
  manifest: BENCHMARK_MANIFEST,
  environment: getEnvironmentSnapshot(),
  latest: result,
  history,
  historyMeta: {
    storageKey: BENCHMARK_HISTORY_KEY,
    compatibleRuns: history.length,
  },
});

const loadBenchmarkHistory = () => {
  try {
    const raw = localStorage.getItem(BENCHMARK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCompatibleHistoryEntry);
  } catch {
    return [];
  }
};

const updateHistoryCount = () => {
  if (!historyNode) return;
  historyNode.textContent = `Saved compatible runs: ${loadBenchmarkHistory().length}`;
};

const saveBenchmarkRun = (result) => {
  const history = loadBenchmarkHistory();
  history.push({
    ...result,
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    suiteVersion: BENCHMARK_SUITE_VERSION,
    manifest: BENCHMARK_MANIFEST,
  });
  while (history.length > 24) {
    history.shift();
  }
  localStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(history));
  const latest = { ...result, manifest: BENCHMARK_MANIFEST };
  const exportPayload = toExportPayload(latest, history);
  window.__luminaBenchmarkResults = latest;
  window.__luminaBenchmarkHistory = history;
  window.__luminaBenchmarkManifest = BENCHMARK_MANIFEST;
  window.__luminaBenchmarkContract = BENCHMARK_CONTRACT;
  window.__luminaBenchmarkExport = exportPayload;
  window.__luminaBenchmarkExportJson = JSON.stringify(exportPayload, null, 2);
  if (exportButton) {
    exportButton.disabled = false;
  }
  updateHistoryCount();
};

const exportBenchmarkResults = () => {
  const payload = window.__luminaBenchmarkExport;
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lumina-dom-benchmark-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

const makeRows = () => Array.from({ length: LIST_SIZE }, (_, i) => `row-${i}`);
const makeKeyedRows = () => makeRows().map((label) => ({ id: label, label }));

const mutateRows = (rows, step) => {
  const index = step % rows.length;
  const next = rows.slice();
  next[index] = `${rows[index]}*`;
  return next;
};

const swapAdjacentRows = (rows, step) => {
  const next = rows.slice();
  if (next.length < 2) return next;
  const left = step % (next.length - 1);
  const right = left + 1;
  [next[left], next[right]] = [next[right], next[left]];
  return next;
};

const mutateKeyedRows = (rows, step) => {
  const index = step % rows.length;
  const next = rows.slice();
  next[index] = { ...rows[index], label: `${rows[index].label}*` };
  return next;
};

const moveHeadToTailRows = (rows) => {
  const next = rows.slice();
  if (next.length < 2) return next;
  const [first] = next.splice(0, 1);
  next.push(first);
  return next;
};

const reorderMiddleWindowRows = (rows, windowSize = 64) => {
  const next = rows.slice();
  if (next.length < 4) return next;
  const size = Math.min(windowSize, next.length - (next.length % 2));
  if (size < 4) return next;
  const start = Math.floor((next.length - size) / 2);
  const middle = next.slice(start, start + size);
  const half = middle.length / 2;
  const left = middle.slice(0, half);
  const right = middle.slice(half);
  const reordered = [];
  for (let index = 0; index < half; index += 1) {
    reordered.push(right[index], left[index]);
  }
  next.splice(start, reordered.length, ...reordered);
  return next;
};

const restructureKeyedRows = (rows, step) => {
  const next = rows.slice();
  if (next.length < 3) {
    return next;
  }

  const removeIndex = step % next.length;
  next.splice(removeIndex, 1);

  if (next.length > 1) {
    const from = (step * 3) % next.length;
    const [moving] = next.splice(from, 1);
    const to = (step * 5) % (next.length + 1);
    next.splice(to, 0, moving);
  }

  const insertIndex = (step * 7) % (next.length + 1);
  const freshId = `fresh-${step}`;
  next.splice(insertIndex, 0, { id: freshId, label: freshId });
  const mutateIndex = next.findIndex((row) => row.id !== freshId);
  if (mutateIndex >= 0) {
    const row = next[mutateIndex];
    next[mutateIndex] = { ...row, label: `${row.label}*` };
  }
  return next;
};

let reactModulesPromise = null;
const loadReactModules = async () => {
  if (!reactModulesPromise) {
    reactModulesPromise = Promise.all([
      import('https://esm.sh/react@19.2.0'),
      import('https://esm.sh/react-dom@19.2.0/client'),
      import('https://esm.sh/react-dom@19.2.0'),
    ]).then(([reactModule, clientModule, domModule]) => ({
      React: reactModule.default,
      ReactDOMClient: clientModule,
      ReactDOM: domModule,
    }));
  }
  return reactModulesPromise;
};

let solidModulesPromise = null;
const loadSolidModules = async () => {
  if (!solidModulesPromise) {
    solidModulesPromise = Promise.all([
      import('https://esm.sh/solid-js@1.9.4'),
      import('https://esm.sh/solid-js@1.9.4/html'),
      import('https://esm.sh/solid-js@1.9.4/web'),
    ]).then(([solidModule, htmlModule, webModule]) => ({
      solid: solidModule,
      solidHtml: htmlModule.default,
      solidWeb: webModule,
    }));
  }
  return solidModulesPromise;
};

const preloadBenchmarkModules = async () => {
  if (LOCAL_ONLY) {
    return;
  }
  await Promise.all([loadReactModules(), loadSolidModules()]);
};

const renderLuminaBenchList = (rows, getKey = (_value, index) => index) =>
  luminaRender.element(
    BENCHMARK_DOM_SHAPE.listTag,
    { className: BENCHMARK_DOM_SHAPE.listClassName },
    rows.map((value, index) => renderLuminaBenchRow(luminaRender.text(value), getKey(value, index)))
  );

const renderLuminaBenchRow = (content, key) =>
  luminaRender.element('li', key === undefined ? { className: 'bench-row' } : { className: 'bench-row', key }, [
    luminaRender.element('span', { className: 'bench-pill' }, [luminaRender.text('row')]),
    luminaRender.element('span', { className: 'bench-value' }, [content]),
  ]);

const createBenchRowDom = (value) => {
  const li = document.createElement(BENCHMARK_DOM_SHAPE.rowTag);
  li.className = BENCHMARK_DOM_SHAPE.rowClassName;
  const pill = document.createElement(BENCHMARK_DOM_SHAPE.pillTag);
  pill.className = BENCHMARK_DOM_SHAPE.pillClassName;
  pill.textContent = BENCHMARK_DOM_SHAPE.pillText;
  const content = document.createElement(BENCHMARK_DOM_SHAPE.valueTag);
  content.className = BENCHMARK_DOM_SHAPE.valueClassName;
  content.textContent = value;
  li.appendChild(pill);
  li.appendChild(content);
  return { li, content };
};
const createBenchListDom = (rows) => {
  const ul = document.createElement(BENCHMARK_DOM_SHAPE.listTag);
  ul.className = BENCHMARK_DOM_SHAPE.listClassName;
  const valueNodes = [];
  for (const value of rows) {
    const { li, content } = createBenchRowDom(value);
    valueNodes.push(content);
    ul.appendChild(li);
  }
  return { ul, valueNodes };
};

const renderReactBenchRow = (React, key, value) =>
  React.createElement(
    'li',
    { key, className: 'bench-row' },
    React.createElement('span', { className: 'bench-pill' }, 'row'),
    React.createElement('span', { className: 'bench-value' }, value)
  );
const renderReactBenchList = (React, rows, getKey = (_value, index) => index) =>
  React.createElement(
    BENCHMARK_DOM_SHAPE.listTag,
    { className: BENCHMARK_DOM_SHAPE.listClassName },
    rows.map((value, index) => renderReactBenchRow(React, getKey(value, index), value))
  );
const renderSolidBenchRow = (solidHtml, value) =>
  solidHtml`<li class="bench-row"><span class="bench-pill">row</span><span class="bench-value">${value}</span></li>`;

const benchmarkLuminaWholeList = async () => {
  const host = createHost('host-whole-list-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount_reactive(renderer, host, () => renderLuminaBenchList(luminaRender.get(rows)));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => luminaRender.dispose_reactive(root));
  return total;
};

const benchmarkVanillaWholeList = async () => {
  const host = createHost('host-whole-list-vanilla');
  const rows = makeRows();
  const { ul, valueNodes: nodes } = createBenchListDom(rows);
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    const index = i % rows.length;
    rows[index] = `${rows[index]}*`;
    nodes[index].textContent = rows[index];
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkVanillaBenchList = async (hostId, iterations) => {
  const host = createHost(hostId);
  const rows = makeRows();
  const { ul, valueNodes: nodes } = createBenchListDom(rows);
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const index = i % rows.length;
    rows[index] = `${rows[index]}*`;
    nodes[index].textContent = rows[index];
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReactWholeList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-whole-list-react');
  const root = ReactDOMClient.createRoot(host);

  let rows = makeRows();
  ReactDOM.flushSync(() => root.render(renderReactBenchList(React, rows)));

  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderReactBenchList(React, rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkReactMemoList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-index-list-react');
  const root = ReactDOMClient.createRoot(host);

  const Row = React.memo(function Row({ value }) {
    return renderReactBenchRow(React, null, value);
  });

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((value, index) => React.createElement(Row, { key: index, value }))
    );

  let rows = makeRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < INDEX_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkReactMemoKeyedList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-for-list-react');
  const root = ReactDOMClient.createRoot(host);

  const Row = React.memo(function Row({ value }) {
    return renderReactBenchRow(React, null, value);
  });

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((value, index) => React.createElement(Row, { key: index, value }))
    );

  let rows = makeRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkSolidWholeList = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const host = createHost('host-whole-list-solid');

  let setRowsRef = null;
  const dispose = solid.createRoot((disposeRoot) => {
    const [rows, setRows] = solid.createSignal(makeRows());
    setRowsRef = setRows;
    solidWeb.render(
      () => solidHtml`<ul class="bench-list">${() => rows().map((value) => renderSolidBenchRow(solidHtml, value))}</ul>`,
      host
    );
    return () => {
      disposeRoot();
      host.textContent = '';
    };
  });

  let rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    setRowsRef(() => rows);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => dispose());
  return total;
};

const benchmarkSolidIndexList = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const host = createHost('host-index-list-solid');

  let setRowsRef = null;
  const dispose = solid.createRoot((disposeRoot) => {
    const [rows, setRows] = solid.createSignal(makeRows());
    setRowsRef = setRows;
    solidWeb.render(
      () =>
        solidHtml`<ul class="bench-list"><${solid.Index} each=${rows}>${(item) => solidHtml`<li class="bench-row"><span class="bench-pill">row</span><span class="bench-value">${item}</span></li>`}</${solid.Index}></ul>`,
      host
    );
    return () => {
      disposeRoot();
      host.textContent = '';
    };
  });

  let rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < INDEX_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    setRowsRef(() => rows);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => dispose());
  return total;
};

const benchmarkSolidKeyedIndexList = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const host = createHost('host-for-list-solid');

  let setRowsRef = null;
  const dispose = solid.createRoot((disposeRoot) => {
    const [rows, setRows] = solid.createSignal(makeRows());
    setRowsRef = setRows;
    solidWeb.render(
      () =>
        solidHtml`<ul class="bench-list"><${solid.Index} each=${rows}>${(item) => solidHtml`<li class="bench-row"><span class="bench-pill">row</span><span class="bench-value">${item}</span></li>`}</${solid.Index}></ul>`,
      host
    );
    return () => {
      disposeRoot();
      host.textContent = '';
    };
  });

  let rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    setRowsRef(() => rows);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => dispose());
  return total;
};

const benchmarkLuminaMount = async () => {
  const renderer = luminaRender.create_dom_renderer();
  const host = createHost('host-mount-lumina');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const root = luminaRender.mount(renderer, host, renderLuminaBenchList(makeRows()));
    root.unmount();
  }
  const total = performance.now() - start;
  preserveMountedHostSnapshot(host, () => {
    const root = luminaRender.mount(renderer, host, renderLuminaBenchList(makeRows()));
    return () => root.unmount();
  });
  return total;
};

const benchmarkLuminaIndexList = async () => {
  const host = createHost('host-index-list-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.indexList(rows, (rowSignal, _index) => renderLuminaBenchRow(luminaRender.liveText(rowSignal))),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < INDEX_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaCompiledIndexList = async () => {
  const host = createHost('host-index-list-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount(renderer, host, compiledIndexList(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < INDEX_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaForList = async () => {
  const host = createHost('host-for-list-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.forList(
        rows,
        (_, index) => index,
        (rowSignal) => renderLuminaBenchRow(luminaRender.liveText(rowSignal))
      ),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaCompiledForList = async () => {
  const host = createHost('host-for-list-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount(renderer, host, compiledForList(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaKeyedListReorder = async () => {
  const host = createHost('host-reorder-lumina-keyed-list');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.forList(
        rows,
        (row) => row.id,
        (rowSignal) =>
          renderLuminaBenchRow(
            luminaRender.liveText(luminaRender.memo(() => luminaRender.get(rowSignal).label))
          )
      ),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    value = swapAdjacentRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkVanillaMount = async () => {
  const host = createHost('host-mount-vanilla');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const { ul } = createBenchListDom(makeRows());
    host.appendChild(ul);
    host.textContent = '';
  }
  const total = performance.now() - start;
  preserveMountedHostSnapshot(host, () => {
    const { ul } = createBenchListDom(makeRows());
    host.appendChild(ul);
    return () => {
      host.textContent = '';
    };
  });
  return total;
};

const benchmarkReactMount = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-mount-react');

  const rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const root = ReactDOMClient.createRoot(host);
    ReactDOM.flushSync(() => root.render(renderReactBenchList(React, rows)));
    root.unmount();
  }
  const total = performance.now() - start;
  preserveMountedHostSnapshot(host, () => {
    const root = ReactDOMClient.createRoot(host);
    ReactDOM.flushSync(() => root.render(renderReactBenchList(React, rows)));
    return () => root.unmount();
  });
  return total;
};

const benchmarkSolidMount = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const rows = makeRows();
  const host = createHost('host-mount-solid');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const dispose = solid.createRoot((disposeRoot) => {
      solidWeb.render(
        () => solidHtml`<ul class="bench-list">${rows.map((value) => renderSolidBenchRow(solidHtml, value))}</ul>`,
        host
      );
      return () => {
        disposeRoot();
        host.textContent = '';
      };
    });
    dispose();
  }
  const total = performance.now() - start;
  preserveMountedHostSnapshot(host, () => {
    const dispose = solid.createRoot((disposeRoot) => {
      solidWeb.render(
        () => solidHtml`<ul class="bench-list">${rows.map((value) => renderSolidBenchRow(solidHtml, value))}</ul>`,
        host
      );
      return () => {
        disposeRoot();
        host.textContent = '';
      };
    });
    return () => dispose();
  });
  return total;
};

const benchmarkLuminaReorder = async () => {
  const host = createHost('host-reorder-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element('ul', { className: 'bench-list' }, [
      ...luminaRender
        .get(rows)
        .map((row) => renderLuminaBenchRow(luminaRender.text(row.label), row.id)),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    value = swapAdjacentRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => luminaRender.dispose_reactive(root));
  return total;
};

const benchmarkLuminaCompiledReorder = async () => {
  const host = createHost('host-reorder-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(renderer, host, compiledReorder(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    value = swapAdjacentRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkVanillaReorder = async () => {
  const host = createHost('host-reorder-vanilla');
  const rows = makeKeyedRows();
  const ul = document.createElement('ul');
  ul.className = 'bench-list';
  const nodes = rows.map((row) => {
    const { li } = createBenchRowDom(row.label);
    ul.appendChild(li);
    return li;
  });
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    const left = i % (rows.length - 1);
    const right = left + 1;
    [rows[left], rows[right]] = [rows[right], rows[left]];
    const rightNode = nodes[right];
    ul.insertBefore(rightNode, nodes[left]);
    [nodes[left], nodes[right]] = [nodes[right], nodes[left]];
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReactReorder = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-reorder-react');
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((row) => renderReactBenchRow(React, row.id, row.label))
    );

  let rows = makeKeyedRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    rows = swapAdjacentRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkLuminaSingleMove = async () => {
  const host = createHost('host-single-move-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element('ul', { className: 'bench-list' }, [
      ...luminaRender
        .get(rows)
        .map((row) => renderLuminaBenchRow(luminaRender.text(row.label), row.id)),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < SINGLE_MOVE_ITERATIONS; i += 1) {
    value = moveHeadToTailRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => luminaRender.dispose_reactive(root));
  return total;
};

const benchmarkLuminaKeyedListSingleMove = async () => {
  const host = createHost('host-single-move-lumina-keyed-list');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.forList(
        rows,
        (row) => row.id,
        (rowSignal) =>
          renderLuminaBenchRow(
            luminaRender.liveText(luminaRender.memo(() => luminaRender.get(rowSignal).label))
          )
      ),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < SINGLE_MOVE_ITERATIONS; i += 1) {
    value = moveHeadToTailRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaCompiledSingleMove = async () => {
  const host = createHost('host-single-move-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(renderer, host, compiledReorder(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < SINGLE_MOVE_ITERATIONS; i += 1) {
    value = moveHeadToTailRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkVanillaSingleMove = async () => {
  const host = createHost('host-single-move-vanilla');
  const rows = makeKeyedRows();
  const ul = document.createElement('ul');
  ul.className = 'bench-list';
  const nodes = rows.map((row) => {
    const { li } = createBenchRowDom(row.label);
    ul.appendChild(li);
    return li;
  });
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < SINGLE_MOVE_ITERATIONS; i += 1) {
    moveHeadToTailRows(rows);
    const moving = nodes.shift();
    if (moving) {
      ul.appendChild(moving);
      nodes.push(moving);
    }
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReactSingleMove = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-single-move-react');
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((row) => renderReactBenchRow(React, row.id, row.label))
    );

  let rows = makeKeyedRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < SINGLE_MOVE_ITERATIONS; i += 1) {
    rows = moveHeadToTailRows(rows);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkLuminaComplexReorder = async () => {
  const host = createHost('host-complex-reorder-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element('ul', { className: 'bench-list' }, [
      ...luminaRender
        .get(rows)
        .map((row) => renderLuminaBenchRow(luminaRender.text(row.label), row.id)),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    value = reorderMiddleWindowRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => luminaRender.dispose_reactive(root));
  return total;
};

const benchmarkLuminaCompiledComplexReorder = async () => {
  const host = createHost('host-complex-reorder-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(renderer, host, compiledReorder(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    value = reorderMiddleWindowRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaKeyedListComplexReorder = async () => {
  const host = createHost('host-complex-reorder-lumina-keyed-list');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.forList(
        rows,
        (row) => row.id,
        (rowSignal) =>
          renderLuminaBenchRow(
            luminaRender.liveText(luminaRender.memo(() => luminaRender.get(rowSignal).label))
          )
      ),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    value = reorderMiddleWindowRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkVanillaComplexReorder = async () => {
  const host = createHost('host-complex-reorder-vanilla');
  const rows = makeKeyedRows();
  const ul = document.createElement('ul');
  ul.className = 'bench-list';
  const nodes = rows.map((row) => {
    const { li } = createBenchRowDom(row.label);
    ul.appendChild(li);
    return li;
  });
  host.appendChild(ul);

  let currentRows = rows;
  let currentNodes = nodes;
  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    currentRows = reorderMiddleWindowRows(currentRows);
    currentNodes = reorderMiddleWindowRows(currentNodes);
    for (const node of currentNodes) {
      ul.appendChild(node);
    }
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReactComplexReorder = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-complex-reorder-react');
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((row) => renderReactBenchRow(React, row.id, row.label))
    );

  let rows = makeKeyedRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    rows = reorderMiddleWindowRows(rows);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkLuminaStructureDiff = async () => {
  const host = createHost('host-structure-diff-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element('ul', { className: 'bench-list' }, [
      ...luminaRender
        .get(rows)
        .map((row) => renderLuminaBenchRow(luminaRender.text(row.label), row.id)),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < STRUCTURE_DIFF_ITERATIONS; i += 1) {
    value = restructureKeyedRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => luminaRender.dispose_reactive(root));
  return total;
};

const benchmarkLuminaKeyedListStructureDiff = async () => {
  const host = createHost('host-structure-diff-lumina-keyed-list');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element('ul', { className: 'bench-list' }, [
      luminaRender.forList(
        rows,
        (row) => row.id,
        (rowSignal) =>
          renderLuminaBenchRow(
            luminaRender.liveText(luminaRender.memo(() => luminaRender.get(rowSignal).label))
          )
      ),
    ])
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < STRUCTURE_DIFF_ITERATIONS; i += 1) {
    value = restructureKeyedRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkLuminaCompiledStructureDiff = async () => {
  const host = createHost('host-structure-diff-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount(renderer, host, compiledReorder(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < STRUCTURE_DIFF_ITERATIONS; i += 1) {
    value = restructureKeyedRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  const snapshot = captureHostSnapshot(host);
  root.unmount();
  restoreHostSnapshot(host, snapshot);
  return total;
};

const benchmarkVanillaStructureDiff = async () => {
  const host = createHost('host-structure-diff-vanilla');
  let rows = makeKeyedRows();
  const ul = document.createElement('ul');
  ul.className = 'bench-list';
  const nodeById = new Map();
  for (const row of rows) {
    const benchRow = createBenchRowDom(row.label);
    nodeById.set(row.id, benchRow);
    ul.appendChild(benchRow.li);
  }
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < STRUCTURE_DIFF_ITERATIONS; i += 1) {
    rows = restructureKeyedRows(rows, i);
    const desiredIds = new Set(rows.map((row) => row.id));
    for (const [id, node] of Array.from(nodeById.entries())) {
      if (!desiredIds.has(id)) {
        node.li.remove();
        nodeById.delete(id);
      }
    }
    for (const row of rows) {
      let node = nodeById.get(row.id);
      if (!node) {
        node = createBenchRowDom(row.label);
        nodeById.set(row.id, node);
      } else if (node.content.textContent !== row.label) {
        node.content.textContent = row.label;
      }
      ul.appendChild(node.li);
    }
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReactStructureDiff = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-structure-diff-react');
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      { className: 'bench-list' },
      rows.map((row) => renderReactBenchRow(React, row.id, row.label))
    );

  let rows = makeKeyedRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < STRUCTURE_DIFF_ITERATIONS; i += 1) {
    rows = restructureKeyedRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkLuminaFineGrained = async () => {
  const host = createHost('host-fine-grained-lumina');
  const rowSignals = makeRows().map((value) => luminaRender.signal(value));
  const renderer = luminaRender.create_dom_renderer();
  const root = luminaRender.mount(
    renderer,
    host,
    luminaRender.element(
      'ul',
      { className: 'bench-list' },
      rowSignals.map((rowSignal, index) =>
        renderLuminaBenchRow(luminaRender.liveText(rowSignal), index)
      )
    )
  );

  const start = performance.now();
  for (let i = 0; i < FINE_GRAINED_ITERATIONS; i += 1) {
    const index = i % rowSignals.length;
    const rowSignal = rowSignals[index];
    luminaRender.set(rowSignal, `${luminaRender.get(rowSignal)}*`);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => root.unmount());
  return total;
};

const benchmarkVanillaFineGrained = async () => {
  const host = createHost('host-fine-grained-vanilla');
  const rows = makeRows();
  const { ul, valueNodes: textNodes } = createBenchListDom(rows);
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < FINE_GRAINED_ITERATIONS; i += 1) {
    const index = i % rows.length;
    rows[index] = `${rows[index]}*`;
    textNodes[index].textContent = rows[index];
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkSolidFineGrained = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const host = createHost('host-fine-grained-solid');

  let rows = makeRows();
  let setRowRefs = [];
  const dispose = solid.createRoot((disposeRoot) => {
    const signals = rows.map((value) => solid.createSignal(value));
    setRowRefs = signals.map(([, setValue]) => setValue);
    solidWeb.render(
      () => solidHtml`<ul class="bench-list">${signals.map(([value]) => renderSolidBenchRow(solidHtml, value))}</ul>`,
      host
    );
    return () => {
      disposeRoot();
      host.textContent = '';
    };
  });

  const start = performance.now();
  for (let i = 0; i < FINE_GRAINED_ITERATIONS; i += 1) {
    const index = i % rows.length;
    rows[index] = `${rows[index]}*`;
    setRowRefs[index](() => rows[index]);
    await nextTick();
  }
  const total = performance.now() - start;
  unmountWithSmokeSnapshot(host, () => dispose());
  return total;
};

const runScenario = async (tableId, label, suites, iterations) => {
  clearTable(tableId);
  const scenarioResults = [];
  for (const [name, benchmark] of suites) {
    for (let warmup = 0; warmup < WARMUP_RUNS; warmup += 1) {
      setStatus(`Warmup ${label}: ${name} (${warmup + 1}/${WARMUP_RUNS})`);
      await benchmark();
    }
    const samplesMs = [];
    for (let runIndex = 0; runIndex < MEASURED_RUNS; runIndex += 1) {
      setStatus(`Running ${label}: ${name} (${runIndex + 1}/${MEASURED_RUNS})`);
      const startMark = `${tableId}:${name}:run:${runIndex}:start`;
      const endMark = `${tableId}:${name}:run:${runIndex}:end`;
      const measureName = `${tableId}:${name}:run:${runIndex}`;
      performance.mark(startMark);
      samplesMs.push(await benchmark());
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    }
    const summary = summarizeSamples(samplesMs, iterations);
    appendResult(tableId, name, summary);
    scenarioResults.push({
      name,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      ...summary,
    });
  }
  return scenarioResults;
};

const run = async () => {
  runButton.disabled = true;
  try {
    setStatus('Preloading benchmark dependencies');
    await preloadBenchmarkModules();

    const wholeListSuites = bindScenarioSuites('wholeList', [
      benchmarkLuminaWholeList,
      benchmarkVanillaWholeList,
      ...(LOCAL_ONLY ? [] : [benchmarkReactWholeList, benchmarkSolidWholeList]),
    ]);

    const mountSuites = bindScenarioSuites('mount', [
      benchmarkLuminaMount,
      benchmarkVanillaMount,
      ...(LOCAL_ONLY ? [] : [benchmarkReactMount, benchmarkSolidMount]),
    ]);

    const indexSuites = bindScenarioSuites('indexList', [
      benchmarkLuminaIndexList,
      benchmarkLuminaCompiledIndexList,
      () => benchmarkVanillaBenchList('host-index-list-vanilla', INDEX_LIST_ITERATIONS),
      ...(LOCAL_ONLY ? [] : [benchmarkReactMemoList, benchmarkSolidIndexList]),
    ]);

    const forListSuites = bindScenarioSuites('forList', [
      benchmarkLuminaForList,
      benchmarkLuminaCompiledForList,
      () => benchmarkVanillaBenchList('host-for-list-vanilla', FOR_LIST_ITERATIONS),
      ...(LOCAL_ONLY ? [] : [benchmarkReactMemoKeyedList, benchmarkSolidKeyedIndexList]),
    ]);

    const reorderSuites = bindScenarioSuites('reorder', [
      benchmarkLuminaReorder,
      benchmarkLuminaKeyedListReorder,
      benchmarkLuminaCompiledReorder,
      benchmarkVanillaReorder,
      ...(LOCAL_ONLY ? [] : [benchmarkReactReorder]),
    ]);

    const singleMoveSuites = bindScenarioSuites('singleMove', [
      benchmarkLuminaSingleMove,
      benchmarkLuminaKeyedListSingleMove,
      benchmarkLuminaCompiledSingleMove,
      benchmarkVanillaSingleMove,
      ...(LOCAL_ONLY ? [] : [benchmarkReactSingleMove]),
    ]);

    const complexReorderSuites = bindScenarioSuites('complexReorder', [
      benchmarkLuminaComplexReorder,
      benchmarkLuminaKeyedListComplexReorder,
      benchmarkLuminaCompiledComplexReorder,
      benchmarkVanillaComplexReorder,
      ...(LOCAL_ONLY ? [] : [benchmarkReactComplexReorder]),
    ]);

    const structureDiffSuites = bindScenarioSuites('structureDiff', [
      benchmarkLuminaStructureDiff,
      benchmarkLuminaKeyedListStructureDiff,
      benchmarkLuminaCompiledStructureDiff,
      benchmarkVanillaStructureDiff,
      ...(LOCAL_ONLY ? [] : [benchmarkReactStructureDiff]),
    ]);

    const fineGrainedSuites = bindScenarioSuites('fineGrained', [
      benchmarkLuminaFineGrained,
      benchmarkVanillaFineGrained,
      ...(LOCAL_ONLY ? [] : [benchmarkSolidFineGrained]),
    ]);

    const results = {
      runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recordedAt: new Date().toISOString(),
      environment: getEnvironmentSnapshot(),
      listSize: LIST_SIZE,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      scenarios: {},
    };

    const wholeListScenario = getScenarioContract('wholeList');
    const mountScenario = getScenarioContract('mount');
    const indexScenario = getScenarioContract('indexList');
    const forListScenario = getScenarioContract('forList');
    const reorderScenario = getScenarioContract('reorder');
    const singleMoveScenario = getScenarioContract('singleMove');
    const complexReorderScenario = getScenarioContract('complexReorder');
    const structureDiffScenario = getScenarioContract('structureDiff');
    const fineGrainedScenario = getScenarioContract('fineGrained');

    results.scenarios.wholeList = await runScenario(
      wholeListScenario.tableId,
      wholeListScenario.label,
      wholeListSuites,
      wholeListScenario.iterations
    );
    results.scenarios.mount = await runScenario(
      mountScenario.tableId,
      mountScenario.label,
      mountSuites,
      mountScenario.iterations
    );
    results.scenarios.indexList = await runScenario(
      indexScenario.tableId,
      indexScenario.label,
      indexSuites,
      indexScenario.iterations
    );
    results.scenarios.forList = await runScenario(
      forListScenario.tableId,
      forListScenario.label,
      forListSuites,
      forListScenario.iterations
    );
    results.scenarios.reorder = await runScenario(
      reorderScenario.tableId,
      reorderScenario.label,
      reorderSuites,
      reorderScenario.iterations
    );
    results.scenarios.singleMove = await runScenario(
      singleMoveScenario.tableId,
      singleMoveScenario.label,
      singleMoveSuites,
      singleMoveScenario.iterations
    );
    results.scenarios.complexReorder = await runScenario(
      complexReorderScenario.tableId,
      complexReorderScenario.label,
      complexReorderSuites,
      complexReorderScenario.iterations
    );
    results.scenarios.structureDiff = await runScenario(
      structureDiffScenario.tableId,
      structureDiffScenario.label,
      structureDiffSuites,
      structureDiffScenario.iterations
    );
    results.scenarios.fineGrained = await runScenario(
      fineGrainedScenario.tableId,
      fineGrainedScenario.label,
      fineGrainedSuites,
      fineGrainedScenario.iterations
    );

    saveBenchmarkRun(results);
    setStatus('Done');
  } finally {
    runButton.disabled = false;
  }
};

updateHistoryCount();
window.__luminaBenchmarkContract = BENCHMARK_CONTRACT;

runButton.addEventListener('click', () => {
  run().catch((error) => {
    console.error(error);
    setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    alert(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});

exportButton?.addEventListener('click', () => {
  exportBenchmarkResults();
});
