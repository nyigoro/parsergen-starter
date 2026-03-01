import { render as luminaRender } from '../../dist/lumina-runtime.js';

const LIST_SIZE = 1000;
const ITERATIONS = 300;

const makeRows = () => Array.from({ length: LIST_SIZE }, (_, i) => `row-${i}`);

const mutateRows = (rows, step) => {
  const index = step % rows.length;
  const next = rows.slice();
  next[index] = `${rows[index]}*`;
  return next;
};

const nextTick = () => Promise.resolve();

const benchmarkLumina = async () => {
  const host = document.getElementById('host-lumina');
  const renderer = luminaRender.create_dom_renderer();
  const rows = luminaRender.signal(makeRows());
  const root = luminaRender.mount_reactive(renderer, host, () =>
    luminaRender.element(
      'ul',
      null,
      luminaRender.get(rows).map((value, idx) => luminaRender.element('li', { key: idx }, [luminaRender.text(value)]))
    )
  );

  let value = luminaRender.get(rows);
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    value = mutateRows(value, i);
    luminaRender.set(rows, value);
    await nextTick();
  }
  const total = performance.now() - start;
  luminaRender.dispose_reactive(root);
  return total;
};

const benchmarkVanilla = async () => {
  const host = document.getElementById('host-vanilla');
  host.textContent = '';
  const ul = document.createElement('ul');
  const nodes = [];
  const rows = makeRows();
  for (let i = 0; i < rows.length; i += 1) {
    const li = document.createElement('li');
    li.textContent = rows[i];
    nodes.push(li);
    ul.appendChild(li);
  }
  host.appendChild(ul);

  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    const index = i % rows.length;
    rows[index] = `${rows[index]}*`;
    nodes[index].textContent = rows[index];
    await nextTick();
  }
  return performance.now() - start;
};

const benchmarkReact = async () => {
  const React = (await import('https://esm.sh/react@19.2.0')).default;
  const ReactDOMClient = await import('https://esm.sh/react-dom@19.2.0/client');
  const ReactDOM = await import('https://esm.sh/react-dom@19.2.0');
  const host = document.getElementById('host-react');
  host.textContent = '';
  const root = ReactDOMClient.createRoot(host);

  const renderList = (rows) =>
    React.createElement(
      'ul',
      null,
      rows.map((value, i) => React.createElement('li', { key: i }, value))
    );

  let rows = makeRows();
  ReactDOM.flushSync(() => root.render(renderList(rows)));

  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    ReactDOM.flushSync(() => root.render(renderList(rows)));
    await nextTick();
  }
  const total = performance.now() - start;
  root.unmount();
  return total;
};

const benchmarkSolid = async () => {
  const solid = await import('https://esm.sh/solid-js@1.9.4');
  const solidHtml = (await import('https://esm.sh/solid-js@1.9.4/html')).default;
  const solidWeb = await import('https://esm.sh/solid-js@1.9.4/web');
  const host = document.getElementById('host-solid');
  host.textContent = '';

  let setRowsRef = null;
  const dispose = solid.createRoot((disposeRoot) => {
    const [rows, setRows] = solid.createSignal(makeRows());
    setRowsRef = setRows;
    solidWeb.render(
      () =>
        solidHtml`<ul>${() => rows().map((value) => solidHtml`<li>${value}</li>`)}</ul>`,
      host
    );
    return disposeRoot;
  });

  let rows = makeRows();
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    rows = mutateRows(rows, i);
    setRowsRef(() => rows);
    await nextTick();
  }
  const total = performance.now() - start;
  dispose();
  host.textContent = '';
  return total;
};

const appendResult = (name, total) => {
  const tbody = document.getElementById('results');
  const row = document.createElement('tr');
  const avg = total / ITERATIONS;
  row.innerHTML = `<td>${name}</td><td>${total.toFixed(2)}</td><td>${avg.toFixed(4)}</td>`;
  tbody.appendChild(row);
};

const run = async () => {
  const tbody = document.getElementById('results');
  tbody.innerHTML = '';

  const suites = [
    ['Lumina render DOM', benchmarkLumina],
    ['Vanilla DOM', benchmarkVanilla],
    ['React 19', benchmarkReact],
    ['Solid 1', benchmarkSolid],
  ];

  for (const [name, bench] of suites) {
    const total = await bench();
    appendResult(name, total);
  }
};

document.getElementById('run').addEventListener('click', () => {
  run().catch((error) => {
    console.error(error);
    alert(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});
