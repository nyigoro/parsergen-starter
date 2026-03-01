import { render } from '../src/lumina-runtime.js';

describe('render additional targets', () => {
  test('SSR renderer outputs escaped HTML', () => {
    const renderer = render.create_ssr_renderer();
    const container: { html?: string } = {};
    const node = render.element('div', { id: 'app' }, [
      render.text('<unsafe>'),
      render.element('input', { disabled: true }, []),
    ]);

    render.mount(renderer, container, node);
    expect(container.html).toBe('<div id="app">&lt;unsafe&gt;<input disabled></div>');
    expect(render.render_to_string(node)).toBe(container.html);
  });

  test('hydrate + update works with DOM renderer', () => {
    const container = {
      childNodes: [
        {
          textContent: 'server',
          childNodes: [{ textContent: 'server', childNodes: [], parentNode: null }],
          parentNode: null,
          appendChild(node: unknown) {
            (this.childNodes as unknown[]).push(node);
            return node;
          },
          removeChild(node: unknown) {
            const idx = (this.childNodes as unknown[]).indexOf(node);
            if (idx >= 0) (this.childNodes as unknown[]).splice(idx, 1);
            return node;
          },
          replaceChild(newChild: unknown, oldChild: unknown) {
            const idx = (this.childNodes as unknown[]).indexOf(oldChild);
            if (idx >= 0) (this.childNodes as unknown[])[idx] = newChild;
            return oldChild;
          },
          setAttribute() {},
          removeAttribute() {},
        },
      ],
      appendChild(node: unknown) {
        (this.childNodes as unknown[]).push(node);
        return node;
      },
      removeChild(node: unknown) {
        const idx = (this.childNodes as unknown[]).indexOf(node);
        if (idx >= 0) (this.childNodes as unknown[]).splice(idx, 1);
        return node;
      },
      replaceChild(newChild: unknown, oldChild: unknown) {
        const idx = (this.childNodes as unknown[]).indexOf(oldChild);
        if (idx >= 0) (this.childNodes as unknown[])[idx] = newChild;
        return oldChild;
      },
    };

    const documentLike = {
      createElement: () => ({
        textContent: '',
        childNodes: [],
        parentNode: null,
        appendChild(node: unknown) {
          (this.childNodes as unknown[]).push(node);
          return node;
        },
        removeChild(node: unknown) {
          const idx = (this.childNodes as unknown[]).indexOf(node);
          if (idx >= 0) (this.childNodes as unknown[]).splice(idx, 1);
          return node;
        },
        replaceChild(newChild: unknown, oldChild: unknown) {
          const idx = (this.childNodes as unknown[]).indexOf(oldChild);
          if (idx >= 0) (this.childNodes as unknown[])[idx] = newChild;
          return oldChild;
        },
        setAttribute() {},
        removeAttribute() {},
      }),
      createTextNode: (value: string) => ({
        textContent: value,
        childNodes: [],
        parentNode: null,
        appendChild() {
          throw new Error('not supported');
        },
        removeChild() {
          throw new Error('not supported');
        },
      }),
    };

    const renderer = render.create_dom_renderer({ document: documentLike as never });
    const count = render.signal(0);
    const root = render.hydrate_reactive(renderer, container as never, () =>
      render.element('div', null, [render.text(`count:${render.get(count)}`)])
    );

    render.set(count, 1);
    return Promise.resolve().then(() => {
      expect(container.childNodes.length).toBe(1);
      render.dispose_reactive(root);
    });
  });

  test('canvas renderer issues drawing commands', () => {
    const commands: string[] = [];
    const ctx = {
      canvas: { width: 300, height: 100 },
      clearRect: () => commands.push('clear'),
      fillRect: () => commands.push('fillRect'),
      fillText: (text: string) => commands.push(`text:${text}`),
    };

    const renderer = render.create_canvas_renderer({ context: ctx as never });
    const node = render.fragment([
      render.element('rect', { x: 0, y: 0, width: 10, height: 10 }, []),
      render.text('hello'),
    ]);
    render.mount(renderer, ctx as never, node);

    expect(commands).toContain('clear');
    expect(commands).toContain('fillRect');
    expect(commands).toContain('text:hello');
  });

  test('terminal renderer writes text tree', () => {
    const sink: { output?: string } = {};
    const renderer = render.create_terminal_renderer();
    const node = render.element('app', null, [render.text('hi')]);
    render.mount(renderer, sink, node);

    expect(sink.output).toContain('<app>');
    expect(sink.output).toContain('hi');
    expect(render.render_to_terminal(node)).toContain('</app>');
  });
});
