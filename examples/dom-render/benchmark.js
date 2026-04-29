import { render as luminaRender } from './lumina-runtime.js?v=2026-04-29-benchmark-trust-v2';
import {
  compiledForList,
  compiledIndexList,
  compiledReorder,
} from './benchmark-compiled.generated.js?v=2026-04-29-benchmark-trust-v2';

const LIST_SIZE = 1000;
const WHOLE_LIST_ITERATIONS = 300;
const INDEX_LIST_ITERATIONS = 300;
const FOR_LIST_ITERATIONS = 300;
const REORDER_ITERATIONS = 300;
const COMPLEX_REORDER_ITERATIONS = 150;
const FINE_GRAINED_ITERATIONS = 300;
const MOUNT_ITERATIONS = 40;
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;
const BENCHMARK_HISTORY_KEY = 'lumina.dom.benchmark.history.v2';
const BENCHMARK_MANIFEST = Object.freeze({
  version: 2,
  warmupRuns: WARMUP_RUNS,
  measuredRuns: MEASURED_RUNS,
  listSize: LIST_SIZE,
  scenarios: Object.freeze([
    'whole-list patch',
    'initial mount',
    'indexed list patch',
    'stable signal list patch',
    'keyed reorder',
    'complex keyed reorder window',
    'fine-grained row update',
  ]),
});

const workspace = document.getElementById('workspace');
const runButton = document.getElementById('run');
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

const appendResult = (tableId, name, total, iterations) => {
  const tbody = document.getElementById(tableId);
  const row = document.createElement('tr');
  const avg = total / iterations;
  row.innerHTML = `<td>${name}</td><td>${total.toFixed(2)}</td><td>${avg.toFixed(4)}</td>`;
  tbody.appendChild(row);
};

const nextTick = () => Promise.resolve();
const setStatus = (message) => {
  statusNode.textContent = message;
};

const sameManifest = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  return JSON.stringify(entry.manifest ?? null) === JSON.stringify(BENCHMARK_MANIFEST);
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const loadBenchmarkHistory = () => {
  try {
    const raw = localStorage.getItem(BENCHMARK_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(sameManifest);
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
  history.push({ ...result, manifest: BENCHMARK_MANIFEST });
  while (history.length > 24) {
    history.shift();
  }
  localStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(history));
  window.__luminaBenchmarkResults = { ...result, manifest: BENCHMARK_MANIFEST };
  window.__luminaBenchmarkHistory = history;
  window.__luminaBenchmarkManifest = BENCHMARK_MANIFEST;
  updateHistoryCount();
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
  await Promise.all([loadReactModules(), loadSolidModules()]);
};

const renderLuminaList = (rows) =>
  luminaRender.element(
    'ul',
    null,
    rows.map((value, index) => luminaRender.element('li', { key: index }, [luminaRender.text(value)]))
  );

const renderLuminaBenchRow = (content) =>
  luminaRender.element('li', { className: 'bench-row' }, [
    luminaRender.element('span', { className: 'bench-pill' }, [luminaRender.text('row')]),
    luminaRender.element('span', { className: 'bench-value' }, [content]),
  ]);

const benchmarkLuminaWholeList = async () => {
  const host = createHost('host-whole-list-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount_reactive(renderer, host, () => renderLuminaList(luminaRender.get(rows)));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  luminaRender.dispose_reactive(root);
  return total;
};

const benchmarkVanillaWholeList = async () => {
  const host = createHost('host-whole-list-vanilla');
  const rows = makeRows();
  const ul = document.createElement('ul');
  const nodes = [];
  for (let i = 0; i < rows.length; i += 1) {
    const li = document.createElement('li');
    li.textContent = rows[i];
    nodes.push(li);
    ul.appendChild(li);
  }
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

const benchmarkReactWholeList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-whole-list-react');
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
      rows.map((value, index) => React.createElement('li', { key: index }, value))
    );

  let rows = makeRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  root.unmount();
  return total;
};

const benchmarkReactMemoList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-index-list-react');
  const root = ReactDOMClient.createRoot(host);

  const Row = React.memo(function Row({ value }) {
    return React.createElement('li', null, value);
  });

  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
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
  root.unmount();
  return total;
};

const benchmarkReactMemoKeyedList = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-for-list-react');
  const root = ReactDOMClient.createRoot(host);

  const Row = React.memo(function Row({ value }) {
    return React.createElement('li', null, value);
  });

  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
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
  root.unmount();
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
      () => solidHtml`<ul>${() => rows().map((value) => solidHtml`<li>${value}</li>`)}</ul>`,
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
  dispose();
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
        solidHtml`<ul><${solid.Index} each=${rows}>${(item) => solidHtml`<li>${item}</li>`}</${solid.Index}></ul>`,
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
  dispose();
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
        solidHtml`<ul><${solid.Index} each=${rows}>${(item) => solidHtml`<li>${item}</li>`}</${solid.Index}></ul>`,
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
  dispose();
  return total;
};

const benchmarkLuminaMount = async () => {
  const renderer = luminaRender.create_dom_renderer();
  const host = createHost('host-mount-lumina');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const root = luminaRender.mount(renderer, host, renderLuminaList(makeRows()));
    root.unmount();
  }
  return performance.now() - start;
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
  root.unmount();
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
  root.unmount();
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
  root.unmount();
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
  root.unmount();
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
  root.unmount();
  return total;
};

const benchmarkVanillaMount = async () => {
  const host = createHost('host-mount-vanilla');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const ul = document.createElement('ul');
    for (const value of makeRows()) {
      const li = document.createElement('li');
      li.textContent = value;
      ul.appendChild(li);
    }
    host.appendChild(ul);
    host.textContent = '';
  }
  return performance.now() - start;
};

const benchmarkReactMount = async () => {
  const { React, ReactDOMClient, ReactDOM } = await loadReactModules();
  const host = createHost('host-mount-react');
  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
      rows.map((value, index) => React.createElement('li', { key: index }, value))
    );

  const rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const root = ReactDOMClient.createRoot(host);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    root.unmount();
  }
  return performance.now() - start;
};

const benchmarkSolidMount = async () => {
  const { solid, solidHtml, solidWeb } = await loadSolidModules();
  const rows = makeRows();
  const host = createHost('host-mount-solid');
  const start = performance.now();
  for (let i = 0; i < MOUNT_ITERATIONS; i += 1) {
    const dispose = solid.createRoot((disposeRoot) => {
      solidWeb.render(
        () => solidHtml`<ul>${rows.map((value) => solidHtml`<li>${value}</li>`)}</ul>`,
        host
      );
      return () => {
        disposeRoot();
        host.textContent = '';
      };
    });
    dispose();
  }
  return performance.now() - start;
};

const benchmarkLuminaReorder = async () => {
  const host = createHost('host-reorder-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element(
      'ul',
      null,
      luminaRender.get(rows).map((row) =>
        luminaRender.element('li', { key: row.id }, [luminaRender.text(row.label)])
      )
    )
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < REORDER_ITERATIONS; i += 1) {
    value = swapAdjacentRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  luminaRender.dispose_reactive(root);
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
  root.unmount();
  return total;
};

const benchmarkVanillaReorder = async () => {
  const host = createHost('host-reorder-vanilla');
  const rows = makeKeyedRows();
  const ul = document.createElement('ul');
  const nodes = rows.map((row) => {
    const li = document.createElement('li');
    li.textContent = row.label;
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
      null,
      rows.map((row) => React.createElement('li', { key: row.id }, row.label))
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
  root.unmount();
  return total;
};

const benchmarkLuminaComplexReorder = async () => {
  const host = createHost('host-complex-reorder-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeKeyedRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element(
      'ul',
      null,
      luminaRender.get(rows).map((row) =>
        luminaRender.element('li', { key: row.id }, [luminaRender.text(row.label)])
      )
    )
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < COMPLEX_REORDER_ITERATIONS; i += 1) {
    value = reorderMiddleWindowRows(value);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  luminaRender.dispose_reactive(root);
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
  root.unmount();
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
  root.unmount();
  return total;
};

const benchmarkVanillaComplexReorder = async () => {
  const host = createHost('host-complex-reorder-vanilla');
  const rows = makeKeyedRows();
  const ul = document.createElement('ul');
  const nodes = rows.map((row) => {
    const li = document.createElement('li');
    li.textContent = row.label;
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
      null,
      rows.map((row) => React.createElement('li', { key: row.id }, row.label))
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
  root.unmount();
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
      null,
      rowSignals.map((rowSignal, index) =>
        luminaRender.element('li', { key: index }, [luminaRender.liveText(rowSignal)])
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
  root.unmount();
  return total;
};

const benchmarkVanillaFineGrained = async () => {
  const host = createHost('host-fine-grained-vanilla');
  const rows = makeRows();
  const ul = document.createElement('ul');
  const textNodes = rows.map((value) => {
    const li = document.createElement('li');
    const textNode = document.createTextNode(value);
    li.appendChild(textNode);
    ul.appendChild(li);
    return textNode;
  });
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
      () => solidHtml`<ul>${signals.map(([value]) => solidHtml`<li>${value}</li>`)}</ul>`,
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
  dispose();
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
      samplesMs.push(await benchmark());
    }
    const total = median(samplesMs);
    appendResult(tableId, name, total, iterations);
    scenarioResults.push({
      name,
      total,
      avg: total / iterations,
      iterations,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      samplesMs,
    });
  }
  return scenarioResults;
};

const run = async () => {
  runButton.disabled = true;
  try {
    setStatus('Preloading benchmark dependencies');
    await preloadBenchmarkModules();

    const results = {
      recordedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      listSize: LIST_SIZE,
      warmupRuns: WARMUP_RUNS,
      measuredRuns: MEASURED_RUNS,
      scenarios: {},
    };

    results.scenarios.wholeList = await runScenario('results-whole-list', 'whole-list patch', [
      ['Lumina generic rerender', benchmarkLuminaWholeList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19', benchmarkReactWholeList],
      ['Solid 1', benchmarkSolidWholeList],
    ], WHOLE_LIST_ITERATIONS);

    results.scenarios.mount = await runScenario('results-mount', 'initial mount', [
      ['Lumina render DOM', benchmarkLuminaMount],
      ['Vanilla DOM', benchmarkVanillaMount],
      ['React 19', benchmarkReactMount],
      ['Solid 1', benchmarkSolidMount],
    ], MOUNT_ITERATIONS);

    results.scenarios.indexList = await runScenario('results-index-list', 'indexed list patch', [
      ['Lumina indexList', benchmarkLuminaIndexList],
      ['Lumina indexList (compiled)', benchmarkLuminaCompiledIndexList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19 memo rows', benchmarkReactMemoList],
      ['Solid 1 Index', benchmarkSolidIndexList],
    ], INDEX_LIST_ITERATIONS);

    results.scenarios.forList = await runScenario('results-for-list', 'stable signal list patch', [
      ['Lumina forList', benchmarkLuminaForList],
      ['Lumina forList (compiled)', benchmarkLuminaCompiledForList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19 memo rows', benchmarkReactMemoKeyedList],
      ['Solid 1 Index', benchmarkSolidKeyedIndexList],
    ], FOR_LIST_ITERATIONS);

    results.scenarios.reorder = await runScenario('results-reorder', 'keyed reorder', [
      ['Lumina generic keyed patch', benchmarkLuminaReorder],
      ['Lumina keyed list', benchmarkLuminaKeyedListReorder],
      ['Lumina keyed list (compiled)', benchmarkLuminaCompiledReorder],
      ['Vanilla DOM', benchmarkVanillaReorder],
      ['React 19', benchmarkReactReorder],
    ], REORDER_ITERATIONS);

    results.scenarios.complexReorder = await runScenario('results-complex-reorder', 'complex keyed reorder window', [
      ['Lumina generic keyed patch', benchmarkLuminaComplexReorder],
      ['Lumina keyed list', benchmarkLuminaKeyedListComplexReorder],
      ['Lumina keyed list (compiled)', benchmarkLuminaCompiledComplexReorder],
      ['Vanilla DOM', benchmarkVanillaComplexReorder],
      ['React 19', benchmarkReactComplexReorder],
    ], COMPLEX_REORDER_ITERATIONS);

    results.scenarios.fineGrained = await runScenario('results-fine-grained', 'fine-grained row update', [
      ['Lumina signals + DOM', benchmarkLuminaFineGrained],
      ['Vanilla DOM', benchmarkVanillaFineGrained],
      ['Solid signals', benchmarkSolidFineGrained],
    ], FINE_GRAINED_ITERATIONS);

    saveBenchmarkRun(results);
    setStatus('Done');
  } finally {
    runButton.disabled = false;
  }
};

updateHistoryCount();

runButton.addEventListener('click', () => {
  run().catch((error) => {
    console.error(error);
    setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    alert(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});
