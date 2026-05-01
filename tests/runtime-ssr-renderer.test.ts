import { createSsrRuntime, escapeHtml, serializePropsToHtml } from '../src/runtime/ssr-renderer.js';

type TestNode = {
  kind: string;
  tag?: string;
  key?: string | number;
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
    expect(serializePropsToHtml({ key: 'row-a' })).toBe(' data-lumina-key="row-a"');
  });

  test('renders markup and updates containers through the SSR renderer', () => {
    const runtime = createSsrRuntime<TestNode>({
      normalizeNodeForHtml: (node) => node,
      getKind: (node) => node.kind,
      getTag: (node) => node.tag,
      getKey: (node) => node.key,
      getProps: (node) => node.props,
      getChildren: (node) => node.children ?? [],
      getText: (node) => node.text,
      getSignalValue: (node) => node.signal?.get(),
      getTarget: (node) => node.target,
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

  test('renders vnode keys as hydration keys without exposing key props', () => {
    const runtime = createSsrRuntime<TestNode>({
      normalizeNodeForHtml: (node) => node,
      getKind: (node) => node.kind,
      getTag: (node) => node.tag,
      getKey: (node) => node.key,
      getProps: (node) => node.props,
      getChildren: (node) => node.children ?? [],
      getText: (node) => node.text,
      getSignalValue: (node) => node.signal?.get(),
    });

    expect(
      runtime.renderToString({
        kind: 'element',
        tag: 'ul',
        children: [
          {
            kind: 'element',
            tag: 'li',
            key: 'a',
            props: { className: 'row' },
            children: [{ kind: 'text', text: 'A' }],
          },
          {
            kind: 'element',
            tag: 'li',
            key: 2,
            props: {},
            children: [{ kind: 'text', text: 'B' }],
          },
        ],
      })
    ).toBe('<ul><li className="row" data-lumina-key="a">A</li><li data-lumina-key="2">B</li></ul>');
  });

  test('renders portals as hydration anchors instead of inline duplicate content', () => {
    const runtime = createSsrRuntime<TestNode>({
      normalizeNodeForHtml: (node) => node,
      getKind: (node) => node.kind,
      getTag: (node) => node.tag,
      getProps: (node) => node.props,
      getChildren: (node) => node.children ?? [],
      getText: (node) => node.text,
      getSignalValue: (node) => node.signal?.get(),
      getTarget: (node) => node.target,
    });

    expect(
      runtime.renderToString({
        kind: 'portal',
        target: '#modal',
        children: [{ kind: 'element', tag: 'dialog', children: [{ kind: 'text', text: 'Open' }] }],
      })
    ).toBe(
      '<lumina-portal-anchor hidden data-lumina-portal-anchor="true" data-lumina-portal-target="#modal"></lumina-portal-anchor>'
    );
  });
});
