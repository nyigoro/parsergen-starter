import { createSsrRuntime, escapeHtml, serializePropsToHtml } from '../src/runtime/ssr-renderer.js';

type TestNode = {
  kind: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: TestNode[];
  text?: string;
  signal?: { get(): unknown };
};

describe('runtime ssr renderer', () => {
  test('escapes html and serializes props', () => {
    expect(escapeHtml('<div>"x"&</div>')).toBe('&lt;div&gt;&quot;x&quot;&amp;&lt;/div&gt;');
    expect(
      serializePropsToHtml({
        id: 'hero',
        hidden: true,
        style: { backgroundColor: 'red', width: 10 },
        onClick: () => null,
      })
    ).toBe(' id="hero" hidden style="background-color:red;width:10"');
  });

  test('renders markup and updates containers through the SSR renderer', () => {
    const runtime = createSsrRuntime<TestNode>({
      normalizeNodeForHtml: (node) => node,
      getKind: (node) => node.kind,
      getTag: (node) => node.tag,
      getProps: (node) => node.props,
      getChildren: (node) => node.children ?? [],
      getText: (node) => node.text,
      getSignalValue: (node) => node.signal?.get(),
    });

    const node: TestNode = {
      kind: 'element',
      tag: 'section',
      props: { id: 'app' },
      children: [
        { kind: 'text', text: 'Hello ' },
        { kind: 'live_text', signal: { get: () => 'Lumina' } },
        { kind: 'element', tag: 'br', props: {}, children: [] },
      ],
    };

    expect(runtime.renderToString(node)).toBe('<section id="app">Hello Lumina<br></section>');

    const container: { html?: string } = {};
    const renderer = runtime.createRenderer();
    renderer.mount(node, container);
    expect(container.html).toBe('<section id="app">Hello Lumina<br></section>');
    renderer.unmount(container);
    expect(container.html).toBe('');
  });
});
