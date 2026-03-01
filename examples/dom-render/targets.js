import { render } from '../../dist/lumina-runtime.js';

const model = render.signal({
  title: 'Lumina',
  count: 1,
});

const view = () =>
  render.element('div', { className: 'panel' }, [
    render.element('h3', null, [render.text(`${render.get(model).title} SSR Demo`)]),
    render.element('p', null, [render.text(`count=${render.get(model).count}`)]),
    render.element(
      'button',
      {
        onClick: () =>
          render.update_signal(model, (state) => ({
            ...state,
            count: state.count + 1,
          })),
      },
      [render.text('increment')]
    ),
  ]);

const ssrOutput = document.getElementById('ssr-output');
const hydrateHost = document.getElementById('hydrate-host');
if (!ssrOutput || !hydrateHost) {
  throw new Error('Missing SSR target containers');
}

const ssrHtml = render.render_to_string(view());
ssrOutput.textContent = ssrHtml;
hydrateHost.innerHTML = ssrHtml;

const domRenderer = render.create_dom_renderer();
render.hydrate_reactive(domRenderer, hydrateHost, view);

const canvasHost = document.getElementById('canvas-host');
if (!canvasHost) throw new Error('Missing canvas host');
const canvasRenderer = render.create_canvas_renderer();

render.mount(canvasRenderer, canvasHost, render.fragment([
  render.element('rect', { x: 20, y: 24, width: 200, height: 80, fill: '#1d4ed8' }, []),
  render.element('text', { x: 36, y: 72, value: 'Canvas target', fill: '#e2e8f0', font: '18px sans-serif' }, []),
  render.element('circle', { x: 300, y: 64, radius: 36, fill: '#0ea5e9' }, []),
]));

const terminalOutput = document.getElementById('terminal-output');
if (!terminalOutput) throw new Error('Missing terminal output host');
const terminalRenderer = render.create_terminal_renderer();
render.mount(
  terminalRenderer,
  terminalOutput,
  render.element('app', null, [
    render.element('row', null, [render.text('status: ready')]),
    render.element('row', null, [render.text('target: terminal')]),
  ])
);
