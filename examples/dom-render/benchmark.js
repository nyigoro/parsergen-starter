import { render as luminaRender } from './lumina-runtime.js';
import {
  compiledForList,
  compiledIndexList,
  compiledReorder,
  compiledWholeList,
} from './benchmark-compiled.generated.js';

const LIST_SIZE = 1000;
const WHOLE_LIST_ITERATIONS = 300;
const INDEX_LIST_ITERATIONS = 300;
const FOR_LIST_ITERATIONS = 300;
const REORDER_ITERATIONS = 300;
const FINE_GRAINED_ITERATIONS = 300;
const MOUNT_ITERATIONS = 40;

const workspace = document.getElementById('workspace');
const runButton = document.getElementById('run');
const statusNode = document.getElementById('status');

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

const renderLuminaList = (rows) =>
  luminaRender.element(
    'ul',
    null,
    rows.map((value, index) => luminaRender.element('li', { key: index }, [luminaRender.text(value)]))
  );

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

const benchmarkLuminaCompiledWholeList = async () => {
  const host = createHost('host-whole-list-lumina-compiled');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount(renderer, host, compiledWholeList(rows));

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < WHOLE_LIST_ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  root.unmount();
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

  const Row = React.memo(function Row({ label }) {
    return React.createElement('li', null, label);
  });

  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
      rows.map((row) => React.createElement(Row, { key: row.id, label: row.label }))
    );

  let rows = makeKeyedRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    rows = mutateKeyedRows(rows, i);
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
    const [rows, setRows] = solid.createSignal(makeKeyedRows());
    setRowsRef = setRows;
    solidWeb.render(
      () =>
        solidHtml`<ul><${solid.Index} each=${rows}>${(item) => solidHtml`<li>${() => item().label}</li>`}</${solid.Index}></ul>`,
      host
    );
    return () => {
      disposeRoot();
      host.textContent = '';
    };
  });

  let rows = makeKeyedRows();
  const start = performance.now();
  for (let i = 0; i < FOR_LIST_ITERATIONS; i += 1) {
    rows = mutateKeyedRows(rows, i);
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
    luminaRender.element('ul', null, [
      luminaRender.indexList(rows, (rowSignal, index) =>
        luminaRender.element('li', { key: index }, [luminaRender.liveText(rowSignal)])
      ),
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
    luminaRender.element('ul', null, [
      luminaRender.forList(
        rows,
        (_, index) => index,
        (rowSignal) => luminaRender.element('li', null, [luminaRender.liveText(rowSignal)])
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
  for (const [name, benchmark] of suites) {
    setStatus(`Running ${label}: ${name}`);
    const total = await benchmark();
    appendResult(tableId, name, total, iterations);
  }
};

const run = async () => {
  runButton.disabled = true;
  try {
    await runScenario('results-whole-list', 'whole-list patch', [
      ['Lumina render DOM', benchmarkLuminaWholeList],
      ['Lumina render DOM (compiled)', benchmarkLuminaCompiledWholeList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19', benchmarkReactWholeList],
      ['Solid 1', benchmarkSolidWholeList],
    ], WHOLE_LIST_ITERATIONS);

    await runScenario('results-mount', 'initial mount', [
      ['Lumina render DOM', benchmarkLuminaMount],
      ['Vanilla DOM', benchmarkVanillaMount],
      ['React 19', benchmarkReactMount],
      ['Solid 1', benchmarkSolidMount],
    ], MOUNT_ITERATIONS);

    await runScenario('results-index-list', 'indexed list patch', [
      ['Lumina indexList', benchmarkLuminaIndexList],
      ['Lumina indexList (compiled)', benchmarkLuminaCompiledIndexList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19 memo rows', benchmarkReactMemoList],
      ['Solid 1 Index', benchmarkSolidIndexList],
    ], INDEX_LIST_ITERATIONS);

    await runScenario('results-for-list', 'keyed signal list patch', [
      ['Lumina forList', benchmarkLuminaForList],
      ['Lumina forList (compiled)', benchmarkLuminaCompiledForList],
      ['Vanilla DOM', benchmarkVanillaWholeList],
      ['React 19 memo rows', benchmarkReactMemoKeyedList],
      ['Solid 1 Index', benchmarkSolidKeyedIndexList],
    ], FOR_LIST_ITERATIONS);

    await runScenario('results-reorder', 'keyed reorder', [
      ['Lumina render DOM', benchmarkLuminaReorder],
      ['Lumina render DOM (compiled)', benchmarkLuminaCompiledReorder],
      ['Vanilla DOM', benchmarkVanillaReorder],
      ['React 19', benchmarkReactReorder],
    ], REORDER_ITERATIONS);

    await runScenario('results-fine-grained', 'fine-grained row update', [
      ['Lumina signals + DOM', benchmarkLuminaFineGrained],
      ['Vanilla DOM', benchmarkVanillaFineGrained],
      ['Solid signals', benchmarkSolidFineGrained],
    ], FINE_GRAINED_ITERATIONS);

    setStatus('Done');
  } finally {
    runButton.disabled = false;
  }
};

runButton.addEventListener('click', () => {
  run().catch((error) => {
    console.error(error);
    setStatus(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    alert(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});
