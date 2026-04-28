import { createRenderTargetsRuntime } from '../src/runtime/render-targets.js';

type TestNode = {
  kind: string;
  tag?: string;
  text?: string;
  signalValue?: unknown;
  props?: Record<string, unknown>;
  children?: TestNode[];
  materialized?: TestNode[];
};

const text = (value: string): TestNode => ({ kind: 'text', text: value });
const element = (tag: string, props?: Record<string, unknown>, children: TestNode[] = []): TestNode => ({
  kind: 'element',
  tag,
  props,
  children,
});

const runtime = createRenderTargetsRuntime<TestNode>({
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signalValue,
  materializeIndexListChildren: (node) => node.materialized ?? [],
  materializeForListChildren: (node) => node.materialized ?? [],
});

describe('runtime render targets helpers', () => {
  test('renders terminal text trees and materialized list nodes', () => {
    const tree: TestNode = {
      kind: 'fragment',
      children: [
        element('app', undefined, [text('hi')]),
        { kind: 'index_list', materialized: [element('row', undefined, [text('one')])] },
      ],
    };

    expect(runtime.renderToTerminal(tree)).toContain('<app>');
    expect(runtime.renderToTerminal(tree)).toContain('one');
  });

  test('issues canvas draw commands for shapes and text', () => {
    const commands: string[] = [];
    const ctx = {
      canvas: { width: 200, height: 100 },
      clearRect: () => commands.push('clear'),
      fillRect: () => commands.push('fillRect'),
      fillText: (value: string) => commands.push(`text:${value}`),
    };

    const renderer = runtime.createCanvasRenderer({ context: ctx });
    renderer.mount(
      {
        kind: 'fragment',
        children: [
          element('rect', { width: 10, height: 10 }, []),
          text('hello'),
        ],
      },
      ctx
    );

    expect(commands).toContain('clear');
    expect(commands).toContain('fillRect');
    expect(commands).toContain('text:hello');
  });

  test('terminal renderer writes and clears sink output', () => {
    const sink: { output?: string } = {};
    const renderer = runtime.createTerminalRenderer();
    const node = element('app', undefined, [text('ready')]);

    renderer.mount(node, sink);
    expect(sink.output).toContain('ready');

    renderer.unmount?.(sink);
    expect(sink.output).toBe('');
  });
});
