import {
  createSignal,
  get,
  set,
  vnode,
  text,
  renderToString,
} from '../../src/lumina-runtime.js';

type RuntimeSample = {
  name: string;
  ms: number;
  ops: number;
  opsPerSec: number;
  ok: boolean;
  details?: string;
};

function sample(name: string, ops: number, fn: () => void): RuntimeSample {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  return {
    name,
    ms,
    ops,
    opsPerSec: ms > 0 ? Math.round((ops / (ms / 1000)) * 100) / 100 : 0,
    ok: true,
  };
}

async function benchReactSsr(ops: number): Promise<RuntimeSample> {
  try {
    const React = await import('react');
    const ReactDomServer = await import('react-dom/server');
    const start = performance.now();
    for (let i = 0; i < ops; i++) {
      const tree = React.createElement(
        'div',
        { className: 'root' },
        React.createElement('span', null, String(i)),
        React.createElement('button', { type: 'button' }, '+')
      );
      ReactDomServer.renderToString(tree);
    }
    const ms = performance.now() - start;
    return {
      name: 'react_ssr_render',
      ms,
      ops,
      opsPerSec: ms > 0 ? Math.round((ops / (ms / 1000)) * 100) / 100 : 0,
      ok: true,
    };
  } catch (error) {
    return {
      name: 'react_ssr_render',
      ms: 0,
      ops: 0,
      opsPerSec: 0,
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const signalOps = 250000;
  const ssrOps = 15000;

  const signalSample = sample('lumina_signal_update', signalOps, () => {
    const counter = createSignal(0);
    for (let i = 0; i < signalOps; i++) {
      set(counter, get(counter) + 1);
    }
  });

  const luminaSsrSample = sample('lumina_ssr_render', ssrOps, () => {
    for (let i = 0; i < ssrOps; i++) {
      const node = vnode('div', { class: 'root' }, [
        vnode('span', {}, [text(i)]),
        vnode('button', { type: 'button' }, [text('+')]),
      ]);
      renderToString(node);
    }
  });

  const reactSsrSample = await benchReactSsr(ssrOps);
  const samples = [signalSample, luminaSsrSample, reactSsrSample];
  const payload = {
    timestamp: new Date().toISOString(),
    samples,
    success: samples.some((s) => s.name === 'lumina_signal_update' && s.ok),
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(payload.success ? 0 : 1);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});

