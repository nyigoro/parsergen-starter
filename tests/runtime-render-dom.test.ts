import { render } from '../src/lumina-runtime.js';

class FakeNode {
  textContent: string | null = '';
  childNodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;

  appendChild(node: FakeNode): FakeNode {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  removeChild(node: FakeNode): FakeNode {
    const idx = this.childNodes.indexOf(node);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChild(newChild: FakeNode, oldChild: FakeNode): FakeNode {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx >= 0) {
      this.childNodes[idx] = newChild;
      oldChild.parentNode = null;
      newChild.parentNode = this;
    }
    return oldChild;
  }
}

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void };

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toLowerCase();
    this.style = {
      setProperty: (name: string, value: string) => {
        this.style[name] = value;
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(event: string, listener: (event: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  removeEventListener(event: string): void {
    this.listeners.delete(event);
  }
}

class FakeTextNode extends FakeNode {
  constructor(value: string) {
    super();
    this.textContent = value;
  }
}

class FakeDocument {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value);
  }
}

describe('render DOM renderer', () => {
  test('mounts vnode tree into container', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const vnode = render.element('section', { id: 'root' }, [
      render.text('hello'),
      render.element('span', { className: 'value' }, [render.text('world')]),
    ]);

    render.mount(renderer, container, vnode);

    const section = container.childNodes[0] as FakeElement;
    expect(section.tagName).toBe('section');
    expect(section.attributes.get('id')).toBe('root');
    expect(section.childNodes[0].textContent).toBe('hello');
    const span = section.childNodes[1] as FakeElement;
    expect(span.tagName).toBe('span');
    expect(span.childNodes[0].textContent).toBe('world');
  });

  test('patches text in place without replacing host node', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const first = render.element('p', null, [render.text('one')]);
    const root = render.mount(renderer, container, first);
    const nodeBefore = container.childNodes[0];

    render.update(root, render.element('p', null, [render.text('two')]));
    const nodeAfter = container.childNodes[0];

    expect(nodeAfter).toBe(nodeBefore);
    expect((nodeAfter as FakeElement).childNodes[0].textContent).toBe('two');
  });

  test('updates event handlers and props', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const onClickA = jest.fn();
    const onClickB = jest.fn();

    const root = render.mount(
      renderer,
      container,
      render.element('button', { onClick: onClickA, title: 'a' }, [render.text('go')])
    );

    const button = container.childNodes[0] as FakeElement;
    expect(button.listeners.get('click')).toBe(onClickA);
    expect(button.attributes.get('title')).toBe('a');

    render.update(
      root,
      render.element('button', { onClick: onClickB, title: 'b' }, [render.text('go')])
    );

    expect(button.listeners.get('click')).toBe(onClickB);
    expect(button.attributes.get('title')).toBe('b');
  });

  test('mount_reactive updates on signal changes', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const value = render.signal('A');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element('div', null, [render.text(render.get(value))])
    );

    const host = container.childNodes[0] as FakeElement;
    const textNode = host.childNodes[0];
    expect(textNode.textContent).toBe('A');

    render.set(value, 'B');
    await Promise.resolve();
    expect(textNode.textContent).toBe('B');

    render.dispose_reactive(mounted);
    expect(container.childNodes).toHaveLength(0);
  });
});
