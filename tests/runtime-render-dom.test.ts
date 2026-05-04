import { render } from '../src/lumina-runtime.js';

type FakeNodeList<T> = ArrayLike<T> & Iterable<T>;

const createNodeListView = <T>(items: readonly T[]): FakeNodeList<T> => {
  const view: Record<number, T> & {
    length: number;
    item: (index: number) => T | null;
    [Symbol.iterator]: () => Iterator<T>;
  } = {
    length: items.length,
    item: (index: number) => items[index] ?? null,
    [Symbol.iterator]: function* (): Iterator<T> {
      yield* items;
    },
  };

  items.forEach((item, index) => {
    view[index] = item;
  });

  return view as FakeNodeList<T>;
};

class FakeNode {
  textContent: string | null = '';
  private readonly nodes: FakeNode[] = [];
  parentNode: FakeNode | null = null;

  get childNodes(): FakeNodeList<FakeNode> {
    return createNodeListView(this.nodes);
  }

  appendChild(node: FakeNode): FakeNode {
    const currentParent = node.parentNode;
    if (currentParent && currentParent !== this) {
      currentParent.removeChild(node);
    }
    if (currentParent === this) {
      const currentIndex = this.nodes.indexOf(node);
      if (currentIndex >= 0) {
        this.nodes.splice(currentIndex, 1);
      }
    }
    node.parentNode = this;
    this.nodes.push(node);
    return node;
  }

  insertBefore(node: FakeNode, referenceNode: FakeNode | null): FakeNode {
    const currentParent = node.parentNode;
    if (currentParent && currentParent !== this) {
      currentParent.removeChild(node);
    }
    if (currentParent === this) {
      const currentIndex = this.nodes.indexOf(node);
      if (currentIndex >= 0) {
        this.nodes.splice(currentIndex, 1);
      }
    }
    node.parentNode = this;
    if (referenceNode == null) {
      this.nodes.push(node);
      return node;
    }
    const index = this.nodes.indexOf(referenceNode);
    if (index < 0) {
      this.nodes.push(node);
      return node;
    }
    this.nodes.splice(index, 0, node);
    return node;
  }

  removeChild(node: FakeNode): FakeNode {
    const idx = this.nodes.indexOf(node);
    if (idx >= 0) {
      this.nodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChild(newChild: FakeNode, oldChild: FakeNode): FakeNode {
    const idx = this.nodes.indexOf(oldChild);
    if (idx >= 0) {
      this.nodes[idx] = newChild;
      oldChild.parentNode = null;
      newChild.parentNode = this;
    }
    return oldChild;
  }

  cloneNode(_deep?: boolean): FakeNode {
    const clone = new FakeNode();
    clone.textContent = this.textContent;
    return clone;
  }
}

class FakeDocumentFragment extends FakeNode {
  override cloneNode(deep = false): FakeNode {
    const clone = new FakeDocumentFragment();
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}

const parseTemplateIntoFragment = (
  html: string,
  ownerDocument: FakeDocument
): FakeDocumentFragment => {
  const fragment = new FakeDocumentFragment();
  const stack: FakeNode[] = [fragment];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    const token = match[0];
    if (!token || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const opening = /^<([A-Za-z0-9-]+)([^>]*)\/?>$/.exec(token.trim());
      if (!opening) continue;
      const [, tagName, rawAttrs] = opening;
      const element = new FakeElement(tagName, ownerDocument);
      const attrPattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:="([^"]*)")?/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrPattern.exec(rawAttrs))) {
        const [, name, value] = attrMatch;
        element.setAttribute(name, value ?? '');
      }
      stack[stack.length - 1].appendChild(element);
      if (!token.endsWith('/>')) {
        stack.push(element);
      }
      continue;
    }

    if (token.length > 0) {
      stack[stack.length - 1].appendChild(new FakeTextNode(token));
    }
  }

  return fragment;
};

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void };
  readonly ownerDocument: FakeDocument;
  boundingRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  value = '';
  checked = false;
  disabled = false;
  name = '';
  type = '';

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super();
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.boundingRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
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

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(event: string, listener: (event: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  removeEventListener(event: string): void {
    this.listeners.delete(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  getBoundingClientRect(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } {
    return { ...this.boundingRect };
  }

  override cloneNode(deep = false): FakeNode {
    const clone = new FakeElement(this.tagName, this.ownerDocument);
    clone.textContent = this.textContent;
    clone.value = this.value;
    clone.checked = this.checked;
    clone.disabled = this.disabled;
    clone.name = this.name;
    clone.type = this.type;
    clone.boundingRect = { ...this.boundingRect };
    for (const [name, value] of this.attributes.entries()) {
      clone.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(this.style)) {
      if (name === 'setProperty') continue;
      clone.style[name] = value;
    }
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}

class FakeTextNode extends FakeNode {
  constructor(value: string) {
    super();
    this.textContent = value;
  }

  override cloneNode(): FakeNode {
    return new FakeTextNode(this.textContent ?? '');
  }
}

class FakeTemplateElement extends FakeElement {
  readonly content: FakeDocumentFragment;
  private html = '';

  constructor(ownerDocument: FakeDocument) {
    super('template', ownerDocument);
    this.content = new FakeDocumentFragment();
  }

  set innerHTML(value: string) {
    this.html = value;
    const parsed = parseTemplateIntoFragment(value, this.ownerDocument);
    while (this.content.childNodes.length > 0) {
      this.content.removeChild(this.content.childNodes[0]);
    }
    for (const child of parsed.childNodes) {
      this.content.appendChild(child.cloneNode(true));
    }
  }

  get innerHTML(): string {
    return this.html;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body: FakeElement;

  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tag: string): FakeElement {
    if (tag.toLowerCase() === 'template') {
      return new FakeTemplateElement(this) as unknown as FakeElement;
    }
    return new FakeElement(tag, this);
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value);
  }

  getElementById(id: string): FakeElement | null {
    const visit = (node: FakeNode): FakeElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement && child.getAttribute('id') === id) {
          return child;
        }
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };

    return visit(this.body);
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

  test('clones static DOM templates for hoisted element vnodes when template support exists', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const vnode = render.element('section', { className: 'card' }, [
      render.element('span', { className: 'eyebrow' }, [render.text('Profile')]),
    ]);
    vnode.domTemplateHtml = '<section class="card"><span class="eyebrow">Profile</span></section>';

    render.mount(renderer, container, vnode);

    const section = container.childNodes[0] as FakeElement;
    expect(section.tagName).toBe('section');
    expect(section.getAttribute('class')).toBe('card');
    const span = section.childNodes[0] as FakeElement;
    expect(span.tagName).toBe('span');
    expect(span.getAttribute('class')).toBe('eyebrow');
    expect(span.childNodes[0].textContent).toBe('Profile');
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

  test('controlled form props update checkbox state and submit handling', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const accepted = render.signal(false);
    const submit = jest.fn();

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element('form', render.props_on_submit(submit), [
        render.element(
          'input',
          render.props_merge(
            render.props_type('checkbox'),
            render.props_merge(
              render.props_checked(render.get(accepted)),
              render.props_on_checked_change((next) => {
                render.set(accepted, next);
              })
            )
          ),
          []
        ),
      ])
    );

    const form = container.childNodes[0] as FakeElement;
    const input = form.childNodes[0] as FakeElement;
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(false);

    input.listeners.get('change')?.({ target: { checked: true } } as Event);
    await Promise.resolve();
    expect(render.get(accepted)).toBe(true);
    expect(input.checked).toBe(true);

    const preventDefault = jest.fn();
    form.listeners.get('submit')?.({ preventDefault } as Event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);

    render.dispose_reactive(mounted);
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

  test('liveText updates a mounted text node without a reactive root rerender', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const value = render.signal('A');

    const root = render.mount(
      renderer,
      container,
      render.element('div', null, [render.liveText(value)])
    );

    const host = container.childNodes[0] as FakeElement;
    const textNode = host.childNodes[0];
    expect(textNode.textContent).toBe('A');

    render.set(value, 'B');
    await Promise.resolve();
    expect(textNode.textContent).toBe('B');

    root.unmount();
    expect(container.childNodes).toHaveLength(0);
  });

  test('indexList fans out one array signal into stable row text updates', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal(['A', 'B', 'C']);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.indexList(rows, (row, index) =>
          render.element('li', { 'data-index': String(index) }, [render.liveText(row)])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0] as FakeElement;
    const rowB = listHost.childNodes[1] as FakeElement;
    const rowC = listHost.childNodes[2] as FakeElement;

    render.set(rows, ['A*', 'B', 'C']);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowA);
    expect(listHost.childNodes[1]).toBe(rowB);
    expect(listHost.childNodes[2]).toBe(rowC);
    expect(rowA.childNodes[0].textContent).toBe('A*');
    expect(rowB.childNodes[0].textContent).toBe('B');
    expect(rowC.childNodes[0].textContent).toBe('C');

    root.unmount();
    expect(container.childNodes).toHaveLength(0);
  });

  test('indexList rebuilds its row set when the source length changes', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal(['A', 'B']);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.indexList(rows, (row) => render.element('li', null, [render.liveText(row)])),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    expect(listHost.childNodes).toHaveLength(2);

    render.set(rows, ['A', 'B', 'C']);
    await Promise.resolve();
    expect(listHost.childNodes).toHaveLength(3);
    expect((listHost.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('C');

    render.set(rows, ['A']);
    await Promise.resolve();
    expect(listHost.childNodes).toHaveLength(1);
    expect((listHost.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('A');

    root.unmount();
  });

  test('forList updates keyed row signals without remounting stable rows', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', { 'data-index': render.get(index) }, [
              render.liveText(render.memo(() => render.get(row).label)),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0] as FakeElement;
    const rowB = listHost.childNodes[1] as FakeElement;

    render.set(rows, [
      { id: 'a', label: 'Alpha*' },
      { id: 'b', label: 'Beta' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowA);
    expect(listHost.childNodes[1]).toBe(rowB);
    expect(rowA.childNodes[0].textContent).toBe('Alpha*');
    expect(rowB.childNodes[0].textContent).toBe('Beta');

    root.unmount();
  });

  test('forList reorders keyed rows while preserving DOM identity and index signals', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', { 'data-row-id': render.memo(() => render.get(row).id) }, [
              render.liveText(render.memo(() => `${render.get(row).label}:${render.get(index)}`)),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0] as FakeElement;
    const rowB = listHost.childNodes[1] as FakeElement;
    const rowC = listHost.childNodes[2] as FakeElement;

    render.set(rows, [
      { id: 'c', label: 'Gamma' },
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta*' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowC);
    expect(listHost.childNodes[1]).toBe(rowA);
    expect(listHost.childNodes[2]).toBe(rowB);
    expect((listHost.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('Gamma:0');
    expect((listHost.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('Alpha:1');
    expect((listHost.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('Beta*:2');

    root.unmount();
  });

  test('forList rerenders plain row bodies when values and indexes change', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', null, [
              render.text(`${render.get(row).label}:${render.get(index)}`),
            ])
        ),
      ])
    );

    const host = (container.childNodes[0] as FakeElement).childNodes[0] as FakeElement;
    const rowA = host.childNodes[0] as FakeElement;
    const rowB = host.childNodes[1] as FakeElement;

    render.set(rows, [
      { id: 'b', label: 'Beta*' },
      { id: 'a', label: 'Alpha' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(rowB);
    expect(host.childNodes[1]).toBe(rowA);
    expect((host.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('Beta*:0');
    expect((host.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('Alpha:1');

    root.unmount();
  });

  test('forList adjacent keyed swaps use one DOM move without rebuild', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row) =>
            render.element('li', { 'data-row-id': render.memo(() => render.get(row).id) }, [
              render.liveText(render.memo(() => render.get(row).label)),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0];
    const rowB = listHost.childNodes[1];
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = listHost.appendChild.bind(listHost);
    const removeChild = listHost.removeChild.bind(listHost);
    const insertBefore = listHost.insertBefore.bind(listHost);
    listHost.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof listHost.appendChild;
    listHost.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof listHost.removeChild;
    listHost.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof listHost.insertBefore;

    render.set(rows, [
      { id: 'b', label: 'Beta' },
      { id: 'a', label: 'Alpha' },
      { id: 'c', label: 'Gamma' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowB);
    expect(listHost.childNodes[1]).toBe(rowA);
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    root.unmount();
  });

  test('forList adjacent keyed swaps only rerun affected row memos', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]);
    const runs = { a: 0, b: 0, c: 0 };

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', null, [
              render.liveText(
                render.memo(() => {
                  const value = render.get(row);
                  runs[value.id as 'a' | 'b' | 'c'] += 1;
                  return `${value.label}:${render.get(index)}`;
                })
              ),
            ])
        ),
      ])
    );

    runs.a = 0;
    runs.b = 0;
    runs.c = 0;

    render.set(rows, [
      { id: 'b', label: 'Beta' },
      { id: 'a', label: 'Alpha' },
      { id: 'c', label: 'Gamma' },
    ]);
    await Promise.resolve();

    expect(runs.a).toBeGreaterThan(0);
    expect(runs.b).toBeGreaterThan(0);
    expect(runs.c).toBe(0);

    root.unmount();
  });

  test('forList single keyed move updates only the moved range without rebuild', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'd', label: 'Delta' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', { 'data-row-id': render.memo(() => render.get(row).id) }, [
              render.liveText(render.memo(() => `${render.get(row).label}:${render.get(index)}`)),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0];
    const rowB = listHost.childNodes[1];
    const rowC = listHost.childNodes[2];
    const rowD = listHost.childNodes[3];
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = listHost.appendChild.bind(listHost);
    const removeChild = listHost.removeChild.bind(listHost);
    const insertBefore = listHost.insertBefore.bind(listHost);
    listHost.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof listHost.appendChild;
    listHost.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof listHost.removeChild;
    listHost.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof listHost.insertBefore;

    render.set(rows, [
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'a', label: 'Alpha' },
      { id: 'd', label: 'Delta' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowB);
    expect(listHost.childNodes[1]).toBe(rowC);
    expect(listHost.childNodes[2]).toBe(rowA);
    expect(listHost.childNodes[3]).toBe(rowD);
    expect((listHost.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('Beta:0');
    expect((listHost.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('Gamma:1');
    expect((listHost.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('Alpha:2');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    root.unmount();
  });

  test('forList single keyed move leaves unaffected trailing rows untouched', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'd', label: 'Delta' },
    ]);
    const runs = { a: 0, b: 0, c: 0, d: 0 };

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', null, [
              render.liveText(
                render.memo(() => {
                  const value = render.get(row);
                  runs[value.id as 'a' | 'b' | 'c' | 'd'] += 1;
                  return `${value.label}:${render.get(index)}`;
                })
              ),
            ])
        ),
      ])
    );

    runs.a = 0;
    runs.b = 0;
    runs.c = 0;
    runs.d = 0;

    render.set(rows, [
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'a', label: 'Alpha' },
      { id: 'd', label: 'Delta' },
    ]);
    await Promise.resolve();

    expect(runs.a).toBeGreaterThan(0);
    expect(runs.b).toBeGreaterThan(0);
    expect(runs.c).toBeGreaterThan(0);
    expect(runs.d).toBe(0);

    root.unmount();
  });

  test('forList complex middle keyed reorders preserve stable edges and patch stable-edge value changes', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'd', label: 'Delta' },
      { id: 'e', label: 'Epsilon' },
      { id: 'f', label: 'Zeta' },
    ]);
    const runs = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', { 'data-row-id': render.memo(() => render.get(row).id) }, [
              render.liveText(
                render.memo(() => {
                  const value = render.get(row);
                  runs[value.id as 'a' | 'b' | 'c' | 'd' | 'e' | 'f'] += 1;
                  return `${value.label}:${render.get(index)}`;
                })
              ),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0];
    const rowB = listHost.childNodes[1];
    const rowC = listHost.childNodes[2];
    const rowD = listHost.childNodes[3];
    const rowE = listHost.childNodes[4];
    const rowF = listHost.childNodes[5];
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = listHost.appendChild.bind(listHost);
    const removeChild = listHost.removeChild.bind(listHost);
    const insertBefore = listHost.insertBefore.bind(listHost);
    listHost.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof listHost.appendChild;
    listHost.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof listHost.removeChild;
    listHost.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof listHost.insertBefore;

    runs.a = 0;
    runs.b = 0;
    runs.c = 0;
    runs.d = 0;
    runs.e = 0;
    runs.f = 0;

    render.set(rows, [
      { id: 'a', label: 'Alpha*' },
      { id: 'd', label: 'Delta' },
      { id: 'b', label: 'Beta' },
      { id: 'e', label: 'Epsilon' },
      { id: 'c', label: 'Gamma' },
      { id: 'f', label: 'Zeta' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowA);
    expect(listHost.childNodes[1]).toBe(rowD);
    expect(listHost.childNodes[2]).toBe(rowB);
    expect(listHost.childNodes[3]).toBe(rowE);
    expect(listHost.childNodes[4]).toBe(rowC);
    expect(listHost.childNodes[5]).toBe(rowF);
    expect((listHost.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('Alpha*:0');
    expect((listHost.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('Delta:1');
    expect((listHost.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('Beta:2');
    expect((listHost.childNodes[3] as FakeElement).childNodes[0].textContent).toBe('Epsilon:3');
    expect((listHost.childNodes[4] as FakeElement).childNodes[0].textContent).toBe('Gamma:4');
    expect((listHost.childNodes[5] as FakeElement).childNodes[0].textContent).toBe('Zeta:5');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(2);
    expect(runs.a).toBeGreaterThan(0);
    expect(runs.b).toBeGreaterThan(0);
    expect(runs.c).toBeGreaterThan(0);
    expect(runs.d).toBeGreaterThan(0);
    expect(runs.e).toBeGreaterThan(0);
    expect(runs.f).toBe(0);

    root.unmount();
  });

  test('forList skips host child reordering when keyed order stays the same', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]);

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row) =>
            render.element('li', null, [render.liveText(render.memo(() => render.get(row).label))])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = listHost.appendChild.bind(listHost);
    const removeChild = listHost.removeChild.bind(listHost);
    const insertBefore = listHost.insertBefore.bind(listHost);
    listHost.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof listHost.appendChild;
    listHost.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof listHost.removeChild;
    listHost.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof listHost.insertBefore;

    render.set(rows, [
      { id: 'a', label: 'Alpha*' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ]);
    await Promise.resolve();

    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(0);

    root.unmount();
  });

  test('forList complex middle-window reorders only rerun unstable rows', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const rows = render.signal([
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
      { id: 'd', label: 'Delta' },
      { id: 'e', label: 'Epsilon' },
      { id: 'f', label: 'Zeta' },
    ]);
    const runs = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };

    const root = render.mount(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row, index) =>
            render.element('li', { 'data-row-id': render.memo(() => render.get(row).id) }, [
              render.liveText(
                render.memo(() => {
                  const value = render.get(row);
                  runs[value.id as keyof typeof runs] += 1;
                  return `${value.label}:${render.get(index)}`;
                })
              ),
            ])
        ),
      ])
    );

    const ul = container.childNodes[0] as FakeElement;
    const listHost = ul.childNodes[0] as FakeElement;
    const rowA = listHost.childNodes[0];
    const rowF = listHost.childNodes[5];

    for (const key of Object.keys(runs) as Array<keyof typeof runs>) {
      runs[key] = 0;
    }

    render.set(rows, [
      { id: 'a', label: 'Alpha' },
      { id: 'd', label: 'Delta' },
      { id: 'b', label: 'Beta' },
      { id: 'e', label: 'Epsilon' },
      { id: 'c', label: 'Gamma' },
      { id: 'f', label: 'Zeta' },
    ]);
    await Promise.resolve();

    expect(listHost.childNodes[0]).toBe(rowA);
    expect(listHost.childNodes[5]).toBe(rowF);
    expect((listHost.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('Delta:1');
    expect((listHost.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('Beta:2');
    expect((listHost.childNodes[3] as FakeElement).childNodes[0].textContent).toBe('Epsilon:3');
    expect((listHost.childNodes[4] as FakeElement).childNodes[0].textContent).toBe('Gamma:4');
    expect(runs.a).toBe(0);
    expect(runs.f).toBe(0);
    expect(runs.b).toBeGreaterThan(0);
    expect(runs.c).toBeGreaterThan(0);
    expect(runs.d).toBeGreaterThan(0);
    expect(runs.e).toBeGreaterThan(0);

    root.unmount();
  });

  test('component-local state survives parent rerenders', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const label = render.signal('A');

    const Counter = (props: { label: string }) => {
      const count = render.state(0);
      return render.element(
        'button',
        {
          onClick: () => {
            render.set(count, render.get(count) + 1);
          },
        },
        [render.text(`${props.label}:${render.get(count)}`)]
      );
    };

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element('section', null, [render.component(Counter, { label: render.get(label) })])
    );

    const host = container.childNodes[0] as FakeElement;
    const button = host.childNodes[0] as FakeElement;
    const textNode = button.childNodes[0];

    expect(textNode.textContent).toBe('A:0');

    button.listeners.get('click')?.({} as Event);
    await Promise.resolve();
    expect(textNode.textContent).toBe('A:1');

    render.set(label, 'B');
    await Promise.resolve();
    expect(textNode.textContent).toBe('B:1');

    render.dispose_reactive(mounted);
  });

  test('reorders keyed component children without losing local state', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);

    const Counter = (props: { id: string; label: string }) => {
      const count = render.state(0);
      return render.element(
        'button',
        {
          onClick: () => {
            render.set(count, render.get(count) + 1);
          },
          'data-id': props.id,
        },
        [render.text(`${props.label}:${render.get(count)}`)]
      );
    };

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render.get(items).map((item) => render.component(Counter, item, item.id))
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[0] as FakeElement;
    const buttonB = host.childNodes[1] as FakeElement;

    buttonA.listeners.get('click')?.({} as Event);
    await Promise.resolve();
    expect(buttonA.childNodes[0].textContent).toBe('A:1');

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(buttonB);
    expect(host.childNodes[1]).toBe(buttonA);
    expect((host.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('B:0');
    expect((host.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('A:1');

    render.dispose_reactive(mounted);
  });

  test('reorders keyed children without removing and re-appending the whole list', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C' },
    ]);
    await Promise.resolve();

    expect((host.childNodes[0] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('a');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    render.dispose_reactive(mounted);
  });

  test('render.keyed reorders manual sibling panels while preserving DOM identity', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const active = render.signal<'profile' | 'settings'>('profile');

    const mounted = render.mount_reactive(renderer, container, () => {
      const first = render.get(active);
      const second = first === 'profile' ? 'settings' : 'profile';
      return render.element('section', null, [
        render.keyed(first, render.element('article', { id: first }, [render.text(first)])),
        render.keyed(second, render.element('article', { id: second }, [render.text(second)])),
      ]);
    });

    const host = container.childNodes[0] as FakeElement;
    const profile = host.childNodes[0] as FakeElement;
    const settings = host.childNodes[1] as FakeElement;

    render.set(active, 'settings');
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(settings);
    expect(host.childNodes[1]).toBe(profile);
    expect((host.childNodes[0] as FakeElement).attributes.get('id')).toBe('settings');

    render.dispose_reactive(mounted);
  });

  test('reorders keyed children with a long stable tail using one DOM move', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C' },
      { id: 'b', label: 'B' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
    ]);
    await Promise.resolve();

    expect((host.childNodes[0] as FakeElement).getAttribute('data-id')).toBe('a');
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('c');
    expect((host.childNodes[2] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[3] as FakeElement).getAttribute('data-id')).toBe('d');
    expect((host.childNodes[4] as FakeElement).getAttribute('data-id')).toBe('e');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    render.dispose_reactive(mounted);
  });

  test('reorders adjacent keyed children and still patches changed moved content', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[0] as FakeElement;
    const buttonB = host.childNodes[1] as FakeElement;

    render.set(items, [
      { id: 'b', label: 'B!' },
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(buttonB);
    expect(host.childNodes[1]).toBe(buttonA);
    expect((host.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('B!');
    expect((host.childNodes[1] as FakeElement).childNodes[0].textContent).toBe('A');

    render.dispose_reactive(mounted);
  });

  test('reorders adjacent keyed children and still patches unchanged-position siblings', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonC = host.childNodes[2] as FakeElement;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C!' },
      { id: 'd', label: 'D' },
    ]);
    await Promise.resolve();

    expect((host.childNodes[0] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('a');
    expect(host.childNodes[2]).toBe(buttonC);
    expect((host.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('C!');

    render.dispose_reactive(mounted);
  });

  test('reorders a tail-edge adjacent keyed pair with one DOM move', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonC = host.childNodes[2] as FakeElement;
    const buttonD = host.childNodes[3] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'd', label: 'D' },
      { id: 'c', label: 'C' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[2]).toBe(buttonD);
    expect(host.childNodes[3]).toBe(buttonC);
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    render.dispose_reactive(mounted);
  });

  test('reorders keyed children across consecutive adjacent swaps without losing identity', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[0] as FakeElement;
    const buttonB = host.childNodes[1] as FakeElement;
    const buttonC = host.childNodes[2] as FakeElement;
    const buttonD = host.childNodes[3] as FakeElement;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);
    await Promise.resolve();

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
      { id: 'd', label: 'D' },
    ]);
    await Promise.resolve();

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'a', label: 'A' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(buttonB);
    expect(host.childNodes[1]).toBe(buttonC);
    expect(host.childNodes[2]).toBe(buttonD);
    expect(host.childNodes[3]).toBe(buttonA);

    render.dispose_reactive(mounted);
  });

  test('moves one keyed child without rebuilding the whole list', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
      { id: 'd', label: 'D' },
    ]);
    await Promise.resolve();

    expect((host.childNodes[0] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('c');
    expect((host.childNodes[2] as FakeElement).getAttribute('data-id')).toBe('a');
    expect((host.childNodes[3] as FakeElement).getAttribute('data-id')).toBe('d');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    render.dispose_reactive(mounted);
  });

  test('complex keyed middle-window reorder preserves stable edge identity without rebuilding', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
      { id: 'f', label: 'F' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const rowA = host.childNodes[0];
    const rowF = host.childNodes[5];
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'a', label: 'A' },
      { id: 'd', label: 'D' },
      { id: 'b', label: 'B' },
      { id: 'e', label: 'E' },
      { id: 'c', label: 'C' },
      { id: 'f', label: 'F' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(rowA);
    expect(host.childNodes[5]).toBe(rowF);
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('d');
    expect((host.childNodes[2] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[3] as FakeElement).getAttribute('data-id')).toBe('e');
    expect((host.childNodes[4] as FakeElement).getAttribute('data-id')).toBe('c');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBeGreaterThan(0);

    render.dispose_reactive(mounted);
  });

  test('complex keyed middle-window reorder still patches stable edge content changes', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
      { id: 'f', label: 'F' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const rowA = host.childNodes[0] as FakeElement;
    const rowF = host.childNodes[5] as FakeElement;

    render.set(items, [
      { id: 'a', label: 'A!' },
      { id: 'd', label: 'D' },
      { id: 'b', label: 'B' },
      { id: 'e', label: 'E' },
      { id: 'c', label: 'C' },
      { id: 'f', label: 'F!' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(rowA);
    expect(host.childNodes[5]).toBe(rowF);
    expect((host.childNodes[0] as FakeElement).childNodes[0].textContent).toBe('A!');
    expect((host.childNodes[5] as FakeElement).childNodes[0].textContent).toBe('F!');

    render.dispose_reactive(mounted);
  });

  test('moves one keyed child and still patches changed moved content', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const itemA = host.childNodes[0] as FakeElement;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A!' },
      { id: 'd', label: 'D' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[2]).toBe(itemA);
    expect((host.childNodes[2] as FakeElement).childNodes[0].textContent).toBe('A!');

    render.dispose_reactive(mounted);
  });

  test('moves one keyed child and still patches unchanged-position siblings', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const itemE = host.childNodes[4] as FakeElement;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E!' },
    ]);
    await Promise.resolve();

    expect((host.childNodes[0] as FakeElement).getAttribute('data-id')).toBe('b');
    expect((host.childNodes[1] as FakeElement).getAttribute('data-id')).toBe('c');
    expect((host.childNodes[2] as FakeElement).getAttribute('data-id')).toBe('a');
    expect(host.childNodes[4]).toBe(itemE);
    expect((host.childNodes[4] as FakeElement).childNodes[0].textContent).toBe('E!');

    render.dispose_reactive(mounted);
  });

  test('moves one keyed child to the tail and still patches changed moved content', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const itemA = host.childNodes[0] as FakeElement;
    let appendCount = 0;
    let removeCount = 0;
    let insertCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    const insertBefore = host.insertBefore.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;
    host.insertBefore = ((node: FakeNode, referenceNode: FakeNode | null) => {
      insertCount += 1;
      return insertBefore(node, referenceNode);
    }) as typeof host.insertBefore;

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'a', label: 'A!' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[3]).toBe(itemA);
    expect((host.childNodes[3] as FakeElement).childNodes[0].textContent).toBe('A!');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);
    expect(insertCount).toBe(1);

    render.dispose_reactive(mounted);
  });

  test('reorders keyed children with removal and insertion while preserving retained identity', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'ul',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('li', { key: item.id, 'data-id': item.id }, [render.text(item.label)])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const rowA = host.childNodes[0];
    const rowB = host.childNodes[1];
    const rowD = host.childNodes[3];
    const rowE = host.childNodes[4];

    render.set(items, [
      { id: 'a', label: 'A' },
      { id: 'd', label: 'D' },
      { id: 'b', label: 'B' },
      { id: 'f', label: 'F' },
      { id: 'e', label: 'E!' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(rowA);
    expect(host.childNodes[1]).toBe(rowD);
    expect(host.childNodes[2]).toBe(rowB);
    expect((host.childNodes[3] as FakeElement).getAttribute('data-id')).toBe('f');
    expect(host.childNodes[4]).toBe(rowE);
    expect((host.childNodes[4] as FakeElement).childNodes[0].textContent).toBe('E!');

    render.dispose_reactive(mounted);
  });

  test('patches same-order keyed children without rebuilding the parent child list', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render
          .get(items)
          .map((item) =>
            render.element('button', { key: item.id, 'data-id': item.id }, [
              render.text(item.label),
            ])
          )
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[0] as FakeElement;
    const buttonB = host.childNodes[1] as FakeElement;
    const buttonC = host.childNodes[2] as FakeElement;

    let appendCount = 0;
    let removeCount = 0;
    const appendChild = host.appendChild.bind(host);
    const removeChild = host.removeChild.bind(host);
    host.appendChild = ((node: FakeNode) => {
      appendCount += 1;
      return appendChild(node);
    }) as typeof host.appendChild;
    host.removeChild = ((node: FakeNode) => {
      removeCount += 1;
      return removeChild(node);
    }) as typeof host.removeChild;

    render.set(items, [
      { id: 'a', label: 'A*' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(buttonA);
    expect(host.childNodes[1]).toBe(buttonB);
    expect(host.childNodes[2]).toBe(buttonC);
    expect(buttonA.childNodes[0].textContent).toBe('A*');
    expect(appendCount).toBe(0);
    expect(removeCount).toBe(0);

    render.dispose_reactive(mounted);
  });

  test('removing and re-adding a keyed component resets its local state', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const items = render.signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);

    const Counter = (props: { id: string; label: string }) => {
      const count = render.state(0);
      return render.element(
        'button',
        {
          onClick: () => {
            render.set(count, render.get(count) + 1);
          },
          'data-id': props.id,
        },
        [render.text(`${props.label}:${render.get(count)}`)]
      );
    };

    const mounted = render.mount_reactive(renderer, container, () =>
      render.element(
        'section',
        null,
        render.get(items).map((item) => render.component(Counter, item, item.id))
      )
    );

    const host = container.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[0] as FakeElement;
    const buttonB = host.childNodes[1] as FakeElement;

    buttonA.listeners.get('click')?.({} as Event);
    await Promise.resolve();
    expect(buttonA.childNodes[0].textContent).toBe('A:1');

    render.set(items, [{ id: 'b', label: 'B' }]);
    await Promise.resolve();
    expect(host.childNodes).toHaveLength(1);
    expect(host.childNodes[0]).toBe(buttonB);

    render.set(items, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ]);
    await Promise.resolve();

    const readdedA = host.childNodes[1] as FakeElement;
    expect(readdedA).not.toBe(buttonA);
    expect(readdedA.childNodes[0].textContent).toBe('A:0');

    render.dispose_reactive(mounted);
  });

  test('matches mixed keyed and unkeyed children with explicit rules', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const root = render.create_root(renderer, container);
    root.mount(
      render.element('section', null, [
        render.element('p', null, [render.text('lead')]),
        render.element('button', { key: 'a' }, [render.text('A')]),
        render.element('span', null, [render.text('middle')]),
        render.element('button', { key: 'b' }, [render.text('B')]),
      ])
    );

    const host = container.childNodes[0] as FakeElement;
    const lead = host.childNodes[0] as FakeElement;
    const buttonA = host.childNodes[1] as FakeElement;
    const middle = host.childNodes[2] as FakeElement;
    const buttonB = host.childNodes[3] as FakeElement;

    root.update(
      render.element('section', null, [
        render.element('p', null, [render.text('lead!')]),
        render.element('button', { key: 'b' }, [render.text('B')]),
        render.element('span', null, [render.text('middle!')]),
        render.element('button', { key: 'a' }, [render.text('A')]),
      ])
    );

    expect(host.childNodes[0]).toBe(lead);
    expect(host.childNodes[1]).toBe(buttonB);
    expect(host.childNodes[2]).toBe(middle);
    expect(host.childNodes[3]).toBe(buttonA);
    expect((lead.childNodes[0] as FakeNode).textContent).toBe('lead!');
    expect((middle.childNodes[0] as FakeNode).textContent).toBe('middle!');
  });

  test('throws on duplicate keyed siblings during patch', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const root = render.create_root(renderer, container);
    root.mount(
      render.element('section', null, [
        render.element('button', { key: 'a' }, [render.text('A')]),
        render.element('button', { key: 'b' }, [render.text('B')]),
      ])
    );

    expect(() =>
      root.update(
        render.element('section', null, [
          render.element('button', { key: 'a' }, [render.text('A')]),
          render.element('button', { key: 'a' }, [render.text('Again')]),
        ])
      )
    ).toThrow("Duplicate keyed child 'a'");
  });

  test('throws on duplicate keyed siblings during mount and hydrate', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const duplicateTree = render.element('section', null, [
      render.element('button', { key: 'a' }, [render.text('A')]),
      render.element('button', { key: 'a' }, [render.text('Again')]),
    ]);

    expect(render.mount(renderer, container, duplicateTree)).toMatchObject({
      $tag: 'Err',
      $payload: expect.stringContaining("Duplicate keyed child 'a'"),
    });

    const hydratedContainer = fakeDocument.createElement('div');
    hydratedContainer.appendChild(fakeDocument.createElement('section'));
    expect(render.hydrate(renderer, hydratedContainer, duplicateTree)).toMatchObject({
      $tag: 'Err',
      $payload: expect.stringContaining("Duplicate keyed child 'a'"),
    });
  });

  test('hydrates keyed children by hydration key while preserving focus and DOM identity', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const section = fakeDocument.createElement('section');
    const buttonA = fakeDocument.createElement('button');
    buttonA.setAttribute('data-lumina-key', 'a');
    buttonA.appendChild(fakeDocument.createTextNode('A'));
    const buttonB = fakeDocument.createElement('button');
    buttonB.setAttribute('data-lumina-key', 'b');
    buttonB.appendChild(fakeDocument.createTextNode('B'));
    section.appendChild(buttonA);
    section.appendChild(buttonB);
    container.appendChild(section);
    buttonA.focus();

    const root = render.hydrate(
      renderer,
      container,
      render.element('section', null, [
        render.element('button', { key: 'b' }, [render.text('B!')]),
        render.element('button', { key: 'a' }, [render.text('A!')]),
      ])
    );

    expect(container.childNodes[0]).toBe(section);
    expect(section.childNodes[0]).toBe(buttonB);
    expect(section.childNodes[1]).toBe(buttonA);
    expect(buttonB.childNodes[0].textContent).toBe('B!');
    expect(buttonA.childNodes[0].textContent).toBe('A!');
    expect(fakeDocument.activeElement).toBe(buttonA);
    render.unmount(root);
  });

  test('reports hydration text and tag mismatches without making recovery strict by default', () => {
    const fakeDocument = new FakeDocument();
    const diagnostics: Array<{ kind: string; path: string; expected?: string; actual?: string }> =
      [];
    const renderer = render.create_dom_renderer({
      document: fakeDocument as never,
      onHydrationMismatch: (diagnostic: unknown) => {
        diagnostics.push(diagnostic as never);
      },
    } as never);
    const container = fakeDocument.createElement('div');
    const section = fakeDocument.createElement('section');
    const heading = fakeDocument.createElement('h1');
    heading.appendChild(fakeDocument.createTextNode('Old'));
    section.appendChild(heading);
    container.appendChild(section);

    const root = render.hydrate(
      renderer,
      container,
      render.element('section', null, [
        render.element('h2', null, [render.text('New')]),
      ])
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'tag',
          path: 'root.0',
          expected: 'h2',
          actual: 'h1',
        }),
      ])
    );
    expect((section.childNodes[0] as FakeElement).tagName).toBe('h2');
    expect(section.childNodes[0].childNodes[0].textContent).toBe('New');
    render.unmount(root);

    const textContainer = fakeDocument.createElement('div');
    const textSection = fakeDocument.createElement('section');
    textSection.appendChild(fakeDocument.createTextNode('Old text'));
    textContainer.appendChild(textSection);
    const textRoot = render.hydrate(
      renderer,
      textContainer,
      render.element('section', null, [render.text('New text')])
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'text',
          path: 'root.0',
          expected: 'New text',
          actual: 'Old text',
        }),
      ])
    );
    expect(textSection.childNodes[0].textContent).toBe('New text');
    render.unmount(textRoot);
  });

  test('strict hydration converts mismatches into hydrate errors', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({
      document: fakeDocument as never,
      strictHydration: true,
    } as never);
    const container = fakeDocument.createElement('div');
    const section = fakeDocument.createElement('section');
    section.appendChild(fakeDocument.createTextNode('Old'));
    container.appendChild(section);

    expect(
      render.hydrate(
        renderer,
        container,
        render.element('section', null, [render.text('New')])
      )
    ).toMatchObject({
      $tag: 'Err',
      $payload: expect.stringContaining('Hydration mismatch at root.0'),
    });
  });

  test('missing keyed hydration children are created instead of stealing unkeyed DOM', () => {
    const fakeDocument = new FakeDocument();
    const diagnostics: Array<{ kind: string; path: string; key?: string | number }> = [];
    const renderer = render.create_dom_renderer({
      document: fakeDocument as never,
      onHydrationMismatch: (diagnostic: unknown) => {
        diagnostics.push(diagnostic as never);
      },
    } as never);
    const container = fakeDocument.createElement('div');
    const section = fakeDocument.createElement('section');
    const unkeyedInput = fakeDocument.createElement('input');
    unkeyedInput.value = 'typed fallback';
    section.appendChild(unkeyedInput);
    container.appendChild(section);

    const root = render.hydrate(
      renderer,
      container,
      render.element('section', null, [
        render.element('button', { key: 'new' }, [render.text('New')]),
      ])
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing_keyed_child', path: 'root.0', key: 'new' }),
        expect.objectContaining({ kind: 'extra_node', path: 'root' }),
      ])
    );
    expect(section.childNodes[0]).not.toBe(unkeyedInput);
    expect((section.childNodes[0] as FakeElement).tagName).toBe('button');
    render.unmount(root);
  });

  test('hydrates forList rows from SSR keys without remounting retained input state', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const ul = fakeDocument.createElement('ul');
    const host = fakeDocument.createElement('lumina-for-list');
    const rowA = fakeDocument.createElement('li');
    rowA.setAttribute('data-lumina-key', 'a');
    const inputA = fakeDocument.createElement('input');
    inputA.value = 'typed A';
    rowA.appendChild(inputA);
    rowA.appendChild(fakeDocument.createTextNode('Alpha'));
    const rowB = fakeDocument.createElement('li');
    rowB.setAttribute('data-lumina-key', 'b');
    const inputB = fakeDocument.createElement('input');
    inputB.value = 'typed B';
    rowB.appendChild(inputB);
    rowB.appendChild(fakeDocument.createTextNode('Beta'));
    host.appendChild(rowA);
    host.appendChild(rowB);
    ul.appendChild(host);
    container.appendChild(ul);
    inputA.focus();

    const rows = render.signal([
      { id: 'b', label: 'Beta' },
      { id: 'a', label: 'Alpha' },
    ]);

    const root = render.hydrate(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row) =>
            render.element('li', { 'data-id': render.memo(() => render.get(row).id) }, [
              render.element('input', null, []),
              render.liveText(render.memo(() => render.get(row).label)),
            ])
        ),
      ])
    );

    expect(host.childNodes[0]).toBe(rowB);
    expect(host.childNodes[1]).toBe(rowA);
    expect((rowA.childNodes[0] as FakeElement).value).toBe('typed A');
    expect((rowB.childNodes[0] as FakeElement).value).toBe('typed B');
    expect(fakeDocument.activeElement).toBe(inputA);

    render.set(rows, [
      { id: 'b', label: 'Beta!' },
      { id: 'a', label: 'Alpha' },
    ]);
    await Promise.resolve();

    expect(host.childNodes[0]).toBe(rowB);
    expect(rowB.childNodes[1].textContent).toBe('Beta!');
    render.unmount(root);
  });

  test('hydrates missing forList keys by mounting fresh rows instead of adopting unkeyed fallbacks', () => {
    const fakeDocument = new FakeDocument();
    const diagnostics: Array<{ kind: string; key?: string | number }> = [];
    const renderer = render.create_dom_renderer({
      document: fakeDocument as never,
      onHydrationMismatch: (diagnostic: unknown) => {
        diagnostics.push(diagnostic as never);
      },
    } as never);
    const container = fakeDocument.createElement('div');
    const ul = fakeDocument.createElement('ul');
    const host = fakeDocument.createElement('lumina-for-list');
    const unkeyedRow = fakeDocument.createElement('li');
    const input = fakeDocument.createElement('input');
    input.value = 'typed fallback';
    unkeyedRow.appendChild(input);
    host.appendChild(unkeyedRow);
    ul.appendChild(host);
    container.appendChild(ul);
    const rows = render.signal([{ id: 'b', label: 'Beta' }]);

    const root = render.hydrate(
      renderer,
      container,
      render.element('ul', null, [
        render.forList(
          rows,
          (row: { id: string }) => row.id,
          (row) =>
            render.element('li', null, [
              render.element('input', null, []),
              render.liveText(render.memo(() => render.get(row).label)),
            ])
        ),
      ])
    );

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing_keyed_child', key: 'b' }),
        expect.objectContaining({ kind: 'extra_node' }),
      ])
    );
    expect(host.childNodes[0]).not.toBe(unkeyedRow);
    expect(((host.childNodes[0] as FakeElement).childNodes[0] as FakeElement).value).toBe('');
    render.unmount(root);
  });

  test('context, lazy children, and slot helpers compose without prop drilling', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const ThemeContext = render.create_context('light');

    const ThemeRoot = (props: {
      theme: string;
      header?: ((props: { theme: string }) => unknown) | null;
      children: () => unknown;
    }) =>
      render.with_context(ThemeContext, props.theme, () =>
        render.element('section', { 'data-theme': render.use_context(ThemeContext) }, [
          render.slot(
            props.header,
            { theme: render.use_context(ThemeContext) },
            render.text('fallback')
          ),
          ...render.children(props.children),
        ])
      );

    const ThemeLabel = (props: { prefix: string }) =>
      render.element('span', null, [
        render.text(`${props.prefix}:${render.use_context(ThemeContext)}`),
      ]);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.component(ThemeRoot, {
        theme: 'dark',
        header: ({ theme }: { theme: string }) => render.element('h1', null, [render.text(theme)]),
        children: () => render.component(ThemeLabel, { prefix: 'theme' }),
      })
    );

    expect((mounted as { $tag?: string }).$tag).toBeUndefined();

    const section = container.childNodes[0] as FakeElement;
    const header = section.childNodes[0] as FakeElement;
    const label = section.childNodes[1] as FakeElement;

    expect(section.attributes.get('data-theme')).toBe('dark');
    expect(header.childNodes[0].textContent).toBe('dark');
    expect(label.childNodes[0].textContent).toBe('theme:dark');

    render.dispose_reactive(mounted);
  });

  test('portal mounts into document body and cleans up on unmount', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const root = render.mount(
      renderer,
      container,
      render.element('section', null, [
        render.text('inline'),
        render.portal_body([render.element('aside', { id: 'portaled' }, [render.text('In body')])]),
      ])
    ) as { update: (node: unknown) => void; unmount: () => void };

    const section = container.childNodes[0] as FakeElement;
    const anchor = section.childNodes[1] as FakeElement;
    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const portaled = host.childNodes[0] as FakeElement;

    expect(section.tagName).toBe('section');
    expect(anchor.tagName).toBe('lumina-portal-anchor');
    expect(anchor.attributes.get('data-lumina-portal-anchor')).toBe('true');
    expect(fakeDocument.body.childNodes).toHaveLength(1);
    expect(portaled.tagName).toBe('aside');
    expect(portaled.attributes.get('id')).toBe('portaled');
    expect(portaled.childNodes[0]?.textContent).toBe('In body');

    root.update(
      render.element('section', null, [
        render.text('inline'),
        render.portal_body([
          render.element('aside', { id: 'portaled' }, [render.text('Updated body')]),
        ]),
      ])
    );

    const updatedHost = fakeDocument.body.childNodes[0] as FakeElement;
    const updatedPortaled = updatedHost.childNodes[0] as FakeElement;
    expect(updatedPortaled.childNodes[0]?.textContent).toBe('Updated body');

    render.unmount(root);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless tabs wire aria state and compose trigger handlers', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const active = render.signal('profile');
    const externalClick = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.tabs_root(active, () =>
        render.element('section', null, [
          render.tabs_list({ 'aria-label': 'Sections' }, () => [
            render.tabs_trigger('profile', null, [render.text('Profile')]),
            render.tabs_trigger('settings', { onClick: externalClick }, [render.text('Settings')]),
            render.tabs_trigger('billing', null, [render.text('Billing')]),
          ]),
          render.tabs_panel('profile', null, [render.text('Profile panel')]),
          render.tabs_panel('settings', null, [render.text('Settings panel')]),
          render.tabs_panel('billing', null, [render.text('Billing panel')]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const list = section.childNodes[0] as FakeElement;
    const triggerProfile = list.childNodes[0] as FakeElement;
    const triggerSettings = list.childNodes[1] as FakeElement;
    const triggerBilling = list.childNodes[2] as FakeElement;
    const panelProfile = section.childNodes[1] as FakeElement;
    const panelSettings = section.childNodes[2] as FakeElement;
    const panelBilling = section.childNodes[3] as FakeElement;

    expect(list.attributes.get('role')).toBe('tablist');
    expect(list.attributes.get('aria-label')).toBe('Sections');
    expect(triggerProfile.attributes.get('role')).toBe('tab');
    expect(triggerProfile.attributes.get('aria-selected')).toBe('true');
    expect(triggerSettings.attributes.get('aria-selected')).toBe('false');
    expect(triggerBilling.attributes.get('aria-selected')).toBe('false');
    expect(triggerProfile.attributes.get('aria-controls')).toBe(panelProfile.attributes.get('id'));
    expect(panelProfile.attributes.get('role')).toBe('tabpanel');
    expect(isHidden(panelProfile)).toBe(false);
    expect(isHidden(panelSettings)).toBe(true);
    expect(isHidden(panelBilling)).toBe(true);

    triggerSettings.listeners.get('click')?.({} as Event);
    await Promise.resolve();

    expect(externalClick).toHaveBeenCalledTimes(1);
    expect(render.get(active)).toBe('settings');
    expect(triggerProfile.attributes.get('aria-selected')).toBe('false');
    expect(triggerSettings.attributes.get('aria-selected')).toBe('true');
    expect(isHidden(panelProfile)).toBe(true);
    expect(isHidden(panelSettings)).toBe(false);
    expect(isHidden(panelBilling)).toBe(true);

    const preventDefault = jest.fn();
    triggerSettings.listeners.get('keydown')?.({
      key: 'ArrowRight',
      preventDefault,
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(active)).toBe('billing');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(triggerBilling.attributes.get('aria-selected')).toBe('true');
    expect(isHidden(panelBilling)).toBe(false);

    triggerBilling.listeners.get('keydown')?.({
      key: 'Home',
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(active)).toBe('profile');
    expect(triggerProfile.attributes.get('aria-selected')).toBe('true');
    expect(isHidden(panelProfile)).toBe(false);

    triggerProfile.listeners.get('keydown')?.({
      key: 'End',
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(active)).toBe('billing');

    triggerBilling.listeners.get('keydown')?.({
      key: 'ArrowLeft',
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(active)).toBe('settings');

    render.dispose_reactive(mounted);
  });

  test('headless dialog opens and closes through trigger, overlay, escape, and close button', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const externalTriggerClick = jest.fn();
    const externalCloseClick = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.dialog_root(open, () =>
        render.element('section', null, [
          render.dialog_trigger({ onClick: externalTriggerClick }, [render.text('Open dialog')]),
          render.dialog_overlay({ className: 'overlay' }),
          render.dialog_content({ className: 'content' }, [
            render.dialog_title(null, [render.text('Dialog title')]),
            render.dialog_description(null, [render.text('Dialog description')]),
            render.element('button', { id: 'dialog-action' }, [render.text('Dialog action')]),
            render.dialog_close({ onClick: externalCloseClick }, [render.text('Close dialog')]),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    const overlay = section.childNodes[1] as FakeElement;
    const content = section.childNodes[2] as FakeElement;
    const title = content.childNodes[0] as FakeElement;
    const description = content.childNodes[1] as FakeElement;
    const actionButton = content.childNodes[2] as FakeElement;
    const closeButton = content.childNodes[3] as FakeElement;

    expect(section.childNodes).toHaveLength(3);
    expect(trigger.attributes.get('aria-haspopup')).toBe('dialog');
    expect(trigger.attributes.get('aria-expanded')).toBe('false');
    expect(isHidden(overlay)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(fakeDocument.activeElement).toBeNull();

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(externalTriggerClick).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('aria-expanded')).toBe('true');
    expect(trigger.attributes.get('aria-controls')).toBe(content.attributes.get('id'));
    expect(content.attributes.get('role')).toBe('dialog');
    expect(content.attributes.get('aria-modal')).toBe('true');
    expect(content.attributes.get('aria-labelledby')).toBe(title.attributes.get('id'));
    expect(content.attributes.get('aria-describedby')).toBe(description.attributes.get('id'));
    expect(overlay.attributes.get('data-lumina-dialog-overlay')).toBe('true');
    expect(title.tagName).toBe('h2');
    expect(description.tagName).toBe('p');
    expect(title.attributes.get('data-lumina-dialog-title')).toBe('true');
    expect(description.attributes.get('data-lumina-dialog-description')).toBe('true');
    expect(isHidden(overlay)).toBe(false);
    expect(isHidden(content)).toBe(false);
    expect(trigger.attributes.get('inert')).toBe('');
    expect(overlay.attributes.get('inert')).toBeUndefined();
    expect(fakeDocument.activeElement).toBe(actionButton);

    const preventForwardTab = jest.fn();
    content.listeners.get('keydown')?.({
      key: 'Tab',
      currentTarget: content,
      preventDefault: preventForwardTab,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventForwardTab).not.toHaveBeenCalled();
    expect(fakeDocument.activeElement).toBe(actionButton);

    closeButton.focus();
    const preventWrappedTab = jest.fn();
    content.listeners.get('keydown')?.({
      key: 'Tab',
      currentTarget: content,
      preventDefault: preventWrappedTab,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventWrappedTab).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(actionButton);

    actionButton.focus();
    const preventReverseTab = jest.fn();
    content.listeners.get('keydown')?.({
      key: 'Tab',
      shiftKey: true,
      currentTarget: content,
      preventDefault: preventReverseTab,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventReverseTab).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(closeButton);

    const preventEscape = jest.fn();
    content.listeners.get('keydown')?.({
      key: 'Escape',
      currentTarget: content,
      preventDefault: preventEscape,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventEscape).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(false);
    expect(isHidden(overlay)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(trigger.attributes.get('inert')).toBeUndefined();
    expect(fakeDocument.activeElement).toBe(trigger);

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    overlay.listeners.get('click')?.({} as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(isHidden(overlay)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(trigger.attributes.get('inert')).toBeUndefined();
    expect(fakeDocument.activeElement).toBe(trigger);

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    closeButton.listeners.get('click')?.({} as Event);
    await Promise.resolve();

    expect(externalCloseClick).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(false);
    expect(isHidden(overlay)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(trigger.attributes.get('inert')).toBeUndefined();
    expect(fakeDocument.activeElement).toBe(trigger);

    render.dispose_reactive(mounted);
  });

  test('dialog portal renders overlay and content into document body', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    fakeDocument.body.appendChild(container);
    const open = render.signal(true);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.dialog_root(open, () =>
        render.element('section', null, [
          render.dialog_trigger(null, [render.text('Open dialog')]),
          render.dialog_portal([
            render.dialog_overlay({ className: 'overlay' }),
            render.dialog_content({ className: 'content' }, [
              render.dialog_title(null, [render.text('Dialog title')]),
              render.dialog_close(null, [render.text('Close dialog')]),
            ]),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    const anchor = section.childNodes[1] as FakeElement;
    const host = fakeDocument.body.childNodes[1] as FakeElement;
    const overlay = host.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;

    await Promise.resolve();
    await Promise.resolve();

    expect(section.childNodes).toHaveLength(2);
    expect(trigger.tagName).toBe('button');
    expect(anchor.tagName).toBe('lumina-portal-anchor');
    expect(fakeDocument.body.childNodes).toHaveLength(2);
    expect(overlay.attributes.get('data-lumina-dialog-overlay')).toBe('true');
    expect(content.attributes.get('role')).toBe('dialog');
    expect(content.attributes.get('hidden')).toBeUndefined();
    expect(container.attributes.get('inert')).toBe('');
    expect(fakeDocument.activeElement).toBe(content.childNodes[1] as FakeElement);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(1);
    expect(container.attributes.get('inert')).toBeUndefined();
  });

  test('headless popover opens in a portal, positions from the trigger, and dismisses cleanly', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const externalTriggerClick = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.popover_root(open, () =>
        render.element('section', null, [
          render.popover_trigger({ onClick: externalTriggerClick }, [render.text('Open popover')]),
          render.popover_portal([
            render.popover_content(
              { className: 'content', side: 'bottom', align: 'start', offset: 12 },
              [render.element('button', { id: 'popover-action' }, [render.text('Popover action')])]
            ),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.boundingRect = { left: 120, top: 48, right: 200, bottom: 80, width: 80, height: 32 };

    expect(section.childNodes).toHaveLength(2);
    expect(trigger.attributes.get('aria-expanded')).toBe('false');

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const dismiss = host.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const actionButton = content.childNodes[0] as FakeElement;

    expect(externalTriggerClick).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('aria-expanded')).toBe('true');
    expect(dismiss.attributes.get('data-lumina-popover-dismiss')).toBe('true');
    expect(content.attributes.get('data-lumina-popover-content')).toBe('true');
    expect(content.attributes.get('data-side')).toBe('bottom');
    expect(content.attributes.get('aria-labelledby')).toBe(trigger.attributes.get('id'));
    expect(content.style.position).toBe('fixed');
    expect(content.style.top).toBe('92px');
    expect(content.style.left).toBe('120px');
    expect(fakeDocument.activeElement).toBe(content);

    const preventEscape = jest.fn();
    content.listeners.get('keydown')?.({
      key: 'Escape',
      currentTarget: content,
      preventDefault: preventEscape,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventEscape).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(false);
    expect(isHidden(dismiss)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(fakeDocument.activeElement).toBe(trigger);

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    dismiss.listeners.get('click')?.({} as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(isHidden(dismiss)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(actionButton.childNodes[0]?.textContent).toBe('Popover action');

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless tooltip opens on hover/focus, positions from the trigger, and closes on leave/blur', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const externalEnter = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.tooltip_root(open, () =>
        render.element('section', null, [
          render.tooltip_trigger({ className: 'tooltip-trigger', onMouseEnter: externalEnter }, [
            render.text('Hover target'),
          ]),
          render.tooltip_portal([
            render.tooltip_content(
              { className: 'tooltip', side: 'top', align: 'start', offset: 6 },
              [render.text('Helpful copy')]
            ),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.boundingRect = { left: 88, top: 120, right: 148, bottom: 152, width: 60, height: 32 };

    expect(render.get(open)).toBe(false);
    expect(trigger.attributes.get('data-state')).toBe('closed');

    trigger.listeners.get('mouseenter')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const content = host.childNodes[0] as FakeElement;

    expect(externalEnter).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('aria-describedby')).toBe(content.attributes.get('id'));
    expect(trigger.attributes.get('data-state')).toBe('open');
    expect(content.attributes.get('role')).toBe('tooltip');
    expect(content.attributes.get('data-lumina-tooltip-content')).toBe('true');
    expect(content.attributes.get('data-side')).toBe('top');
    expect(content.style.position).toBe('fixed');
    expect(content.style.top).toBe('114px');
    expect(content.style.left).toBe('88px');
    expect(isHidden(content)).toBe(false);
    expect(content.childNodes[0]?.textContent).toBe('Helpful copy');

    trigger.listeners.get('mouseleave')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(trigger.attributes.get('aria-describedby')).toBeUndefined();
    expect(trigger.attributes.get('data-state')).toBe('closed');
    expect(isHidden(content)).toBe(true);

    trigger.listeners.get('focus')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    expect(render.get(open)).toBe(true);
    expect(isHidden(content)).toBe(false);

    trigger.listeners.get('blur')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    expect(render.get(open)).toBe(false);
    expect(isHidden(content)).toBe(true);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless toast portals content, supports close, and auto-dismisses', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    let mounted: { dispose?: () => void } | undefined;
    try {
      const fakeDocument = new FakeDocument();
      const renderer = render.create_dom_renderer({ document: fakeDocument as never });
      const container = fakeDocument.createElement('div');
      const open = render.signal(true);
      const externalClose = jest.fn();
      const isHidden = (node: FakeElement): boolean =>
        node.attributes.get('hidden') === 'true' ||
        (node as FakeElement & { hidden?: boolean }).hidden === true;

      mounted = render.mount_reactive(renderer, container, () =>
        render.toast_root(open, () =>
          render.toast_portal([
            render.toast_content({ className: 'toast', duration: 500 }, [
              render.toast_title(null, [render.text('Saved')]),
              render.toast_description(null, [render.text('Draft updated')]),
              render.toast_close({ onClick: externalClose }, [render.text('Dismiss')]),
            ]),
          ])
        )
      );

      const anchor = container.childNodes[0] as FakeElement;
      const host = fakeDocument.body.childNodes[0] as FakeElement;
      const content = host.childNodes[0] as FakeElement;
      const title = content.childNodes[0] as FakeElement;
      const description = content.childNodes[1] as FakeElement;
      const close = content.childNodes[2] as FakeElement;

      expect(anchor.tagName).toBe('lumina-portal-anchor');
      expect(content.attributes.get('role')).toBe('status');
      expect(content.attributes.get('data-lumina-toast-content')).toBe('true');
      expect(content.attributes.get('aria-live')).toBe('polite');
      expect(content.attributes.get('aria-labelledby')).toBe(title.attributes.get('id'));
      expect(content.attributes.get('aria-describedby')).toBe(description.attributes.get('id'));
      expect(content.style.position).toBe('fixed');
      expect(content.style.top).toBe('16px');
      expect(content.style.right).toBe('16px');
      expect(isHidden(content)).toBe(false);

      close.listeners.get('click')?.({ currentTarget: close } as unknown as Event);
      await Promise.resolve();

      expect(externalClose).toHaveBeenCalledTimes(1);
      expect(render.get(open)).toBe(false);
      expect(isHidden(content)).toBe(true);

      render.set(open, true);
      await Promise.resolve();
      expect(isHidden(content)).toBe(false);

      await jest.advanceTimersByTimeAsync(500);

      expect(render.get(open)).toBe(false);
      expect(isHidden(content)).toBe(true);

      render.dispose_reactive(mounted);
      expect(fakeDocument.body.childNodes).toHaveLength(0);
    } finally {
      if (mounted && typeof mounted.dispose === 'function') {
        mounted.dispose();
      }
      jest.useRealTimers();
    }
  });

  test('headless menu opens in a portal, supports keyboard navigation, and selects items', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const selected: string[] = [];
    const externalTriggerClick = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.menu_root(open, () =>
        render.element('section', null, [
          render.menu_trigger({ onClick: externalTriggerClick }, [render.text('Open menu')]),
          render.menu_portal([
            render.menu_content({ className: 'menu', side: 'bottom', align: 'start' }, [
              render.menu_item('open', { onClick: () => selected.push('open') }, [
                render.text('Open file'),
              ]),
              render.menu_item('rename', { onClick: () => selected.push('rename') }, [
                render.text('Rename'),
              ]),
              render.menu_item('delete', { onClick: () => selected.push('delete') }, [
                render.text('Delete'),
              ]),
            ]),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.boundingRect = { left: 40, top: 20, right: 100, bottom: 50, width: 60, height: 30 };

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const dismiss = host.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemOpen = content.childNodes[0] as FakeElement;
    const itemRename = content.childNodes[1] as FakeElement;
    const itemDelete = content.childNodes[2] as FakeElement;

    expect(externalTriggerClick).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('aria-haspopup')).toBe('menu');
    expect(content.attributes.get('role')).toBe('menu');
    expect(content.style.left).toBe('40px');
    expect(content.style.top).toBe('58px');
    expect(fakeDocument.activeElement).toBe(itemOpen);

    const preventDown = jest.fn();
    itemOpen.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: itemOpen,
      preventDefault: preventDown,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDown).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemRename);

    const preventEnd = jest.fn();
    itemRename.listeners.get('keydown')?.({
      key: 'End',
      currentTarget: itemRename,
      preventDefault: preventEnd,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventEnd).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemDelete);

    const preventUp = jest.fn();
    itemDelete.listeners.get('keydown')?.({
      key: 'ArrowUp',
      currentTarget: itemDelete,
      preventDefault: preventUp,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventUp).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemRename);

    const preventEnter = jest.fn();
    itemRename.listeners.get('keydown')?.({
      key: 'Enter',
      currentTarget: itemRename,
      preventDefault: preventEnter,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventEnter).toHaveBeenCalledTimes(1);
    expect(selected).toEqual(['rename']);
    expect(render.get(open)).toBe(false);
    expect(isHidden(dismiss)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(fakeDocument.activeElement).toBe(trigger);

    const preventUpOpen = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'ArrowUp',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventUpOpen,
    } as unknown as Event);
    await Promise.resolve();

    const reopenedHost = fakeDocument.body.childNodes[0] as FakeElement;
    const reopenedContent = reopenedHost.childNodes[1] as FakeElement;
    const reopenedDelete = reopenedContent.childNodes[2] as FakeElement;
    expect(preventUpOpen).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(fakeDocument.activeElement).toBe(reopenedDelete);

    const preventTypeahead = jest.fn();
    reopenedDelete.listeners.get('keydown')?.({
      key: 'r',
      currentTarget: reopenedDelete,
      preventDefault: preventTypeahead,
    } as unknown as Event);
    await Promise.resolve();

    const reopenedRename = reopenedContent.childNodes[1] as FakeElement;
    expect(preventTypeahead).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(reopenedRename);

    const preventTab = jest.fn();
    reopenedRename.listeners.get('keydown')?.({
      key: 'Tab',
      currentTarget: reopenedRename,
      preventDefault: preventTab,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventTab).not.toHaveBeenCalled();
    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(reopenedRename);

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();
    dismiss.listeners.get('click')?.({} as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(isHidden(dismiss)).toBe(true);
    expect(isHidden(content)).toBe(true);
    expect(fakeDocument.activeElement).toBe(trigger);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless select opens in a portal, selects items, and supports keyboard navigation', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const value = render.signal('email');
    const selected: string[] = [];
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.select_root(open, value, () =>
        render.element('section', null, [
          render.select_trigger(null, [render.text('Choose channel')]),
          render.select_portal([
            render.select_content(
              { className: 'select', side: 'bottom', align: 'start', offset: 10 },
              [
                render.select_item('email', { onClick: () => selected.push('email') }, () => [
                  render.select_indicator(null, [render.text('o')]),
                  render.text('Email'),
                ]),
                render.select_item('sms', { onClick: () => selected.push('sms') }, () => [
                  render.select_indicator(null, [render.text('o')]),
                  render.text('SMS'),
                ]),
                render.select_item('push', { onClick: () => selected.push('push') }, () => [
                  render.select_indicator(null, [render.text('o')]),
                  render.text('Push'),
                ]),
              ]
            ),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.boundingRect = { left: 64, top: 32, right: 164, bottom: 68, width: 100, height: 36 };

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const dismiss = host.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemEmail = content.childNodes[0] as FakeElement;
    const itemSms = content.childNodes[1] as FakeElement;
    const indicatorEmail = itemEmail.childNodes[0] as FakeElement;
    const indicatorSms = itemSms.childNodes[0] as FakeElement;

    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('aria-haspopup')).toBe('listbox');
    expect(trigger.attributes.get('aria-expanded')).toBe('true');
    expect(trigger.attributes.get('aria-activedescendant')).toBe(itemEmail.attributes.get('id'));
    expect(content.attributes.get('role')).toBe('listbox');
    expect(content.style.left).toBe('64px');
    expect(content.style.top).toBe('78px');
    expect(itemEmail.attributes.get('aria-selected')).toBe('true');
    expect(itemEmail.attributes.get('data-active')).toBe('true');
    expect(isHidden(indicatorEmail)).toBe(false);
    expect(isHidden(indicatorSms)).toBe(true);
    expect(fakeDocument.activeElement).toBe(trigger);

    itemSms.listeners.get('click')?.({ currentTarget: itemSms } as unknown as Event);
    await Promise.resolve();

    expect(selected).toEqual(['sms']);
    expect(render.get(value)).toBe('sms');
    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(isHidden(content)).toBe(true);

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const reopenedHost = fakeDocument.body.childNodes[0] as FakeElement;
    const reopenedContent = reopenedHost.childNodes[1] as FakeElement;
    const reopenedSms = reopenedContent.childNodes[1] as FakeElement;
    const reopenedPush = reopenedContent.childNodes[2] as FakeElement;

    expect(fakeDocument.activeElement).toBe(trigger);
    expect(trigger.attributes.get('aria-activedescendant')).toBe(reopenedSms.attributes.get('id'));

    const preventDown = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventDown,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDown).toHaveBeenCalledTimes(1);
    expect(render.get(value)).toBe('sms');
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(trigger.attributes.get('aria-activedescendant')).toBe(reopenedPush.attributes.get('id'));

    const preventEnter = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'Enter',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventEnter,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventEnter).toHaveBeenCalledTimes(1);
    expect(render.get(value)).toBe('push');
    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(trigger);

    dismiss.listeners.get('click')?.({ currentTarget: dismiss } as unknown as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(isHidden(reopenedContent)).toBe(true);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless select opens on printable keys and clamps vertical movement', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const value = render.signal('email');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.select_root(open, value, () =>
        render.element('section', null, [
          render.select_trigger(null, [render.text('Choose channel')]),
          render.select_portal([
            render.select_content(null, [
              render.select_item('email', null, () => [render.text('Email')]),
              render.select_item('sms', null, () => [render.text('SMS')]),
              render.select_item('push', null, () => [render.text('Push')]),
            ]),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.focus();

    const preventTypeahead = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'p',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventTypeahead,
    } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemPush = content.childNodes[2] as FakeElement;

    expect(preventTypeahead).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(render.get(value)).toBe('email');
    expect(fakeDocument.activeElement).toBe(trigger);
    expect(trigger.attributes.get('aria-activedescendant')).toBe(itemPush.attributes.get('id'));

    const preventDown = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventDown,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDown).toHaveBeenCalledTimes(1);
    expect(trigger.attributes.get('aria-activedescendant')).toBe(itemPush.attributes.get('id'));
    expect(render.get(value)).toBe('email');

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless combobox filters by query, selects items, and restores focus', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const value = render.signal('email');
    const query = render.signal('');
    const selected: string[] = [];
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.combobox_root(open, value, query, () =>
        render.element('section', null, [
          render.combobox_input({ placeholder: 'Search channels' }, []),
          render.combobox_portal([
            render.combobox_content(
              { className: 'combobox', side: 'bottom', align: 'start', offset: 6 },
              [
                render.combobox_item('email', { onClick: () => selected.push('email') }, () => [
                  render.combobox_indicator(null, [render.text('o')]),
                  render.text('Email'),
                ]),
                render.combobox_item('sms', { onClick: () => selected.push('sms') }, () => [
                  render.combobox_indicator(null, [render.text('o')]),
                  render.text('SMS'),
                ]),
              ]
            ),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const input = section.childNodes[0] as FakeElement;
    input.boundingRect = { left: 20, top: 40, right: 220, bottom: 76, width: 200, height: 36 };
    input.focus();

    input.listeners.get('input')?.({
      currentTarget: input,
      target: { value: 'sm' },
    } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemEmail = content.childNodes[0] as FakeElement;
    const itemSms = content.childNodes[1] as FakeElement;

    expect(render.get(open)).toBe(true);
    expect(render.get(query)).toBe('sm');
    expect(input.attributes.get('role')).toBe('combobox');
    expect(input.attributes.get('aria-expanded')).toBe('true');
    expect(content.attributes.get('role')).toBe('listbox');
    expect(content.style.left).toBe('20px');
    expect(content.style.top).toBe('82px');
    expect(isHidden(itemEmail)).toBe(true);
    expect(isHidden(itemSms)).toBe(false);

    itemSms.listeners.get('click')?.({ currentTarget: itemSms } as unknown as Event);
    await Promise.resolve();

    expect(selected).toEqual(['sms']);
    expect(render.get(value)).toBe('sms');
    expect(render.get(query)).toBe('sms');
    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(input);

    input.listeners.get('click')?.({ currentTarget: input } as unknown as Event);
    await Promise.resolve();

    const reopenedHost = fakeDocument.body.childNodes[0] as FakeElement;
    const reopenedContent = reopenedHost.childNodes[1] as FakeElement;
    const reopenedSms = reopenedContent.childNodes[1] as FakeElement;
    expect(isHidden(reopenedSms)).toBe(false);

    input.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: input,
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(fakeDocument.activeElement).toBe(input);
    expect(input.attributes.get('aria-activedescendant')).toBe(reopenedSms.attributes.get('id'));

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless multiselect toggles multiple values and supports keyboard navigation', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const values = render.signal<string[]>(['email']);
    const selected: string[] = [];
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.multiselect_root(open, values, () =>
        render.element('section', null, [
          render.multiselect_trigger(null, [render.text('Choose channels')]),
          render.multiselect_portal([
            render.multiselect_content(
              { className: 'multiselect', side: 'bottom', align: 'start', offset: 8 },
              [
                render.multiselect_item('email', { onClick: () => selected.push('email') }, () => [
                  render.multiselect_indicator(null, [render.text('x')]),
                  render.text('Email'),
                ]),
                render.multiselect_item('sms', { onClick: () => selected.push('sms') }, () => [
                  render.multiselect_indicator(null, [render.text('x')]),
                  render.text('SMS'),
                ]),
                render.multiselect_item('push', { onClick: () => selected.push('push') }, () => [
                  render.multiselect_indicator(null, [render.text('x')]),
                  render.text('Push'),
                ]),
              ]
            ),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.boundingRect = { left: 48, top: 16, right: 168, bottom: 52, width: 120, height: 36 };

    trigger.listeners.get('click')?.({ currentTarget: trigger } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemEmail = content.childNodes[0] as FakeElement;
    const itemSms = content.childNodes[1] as FakeElement;
    const itemPush = content.childNodes[2] as FakeElement;
    const indicatorEmail = itemEmail.childNodes[0] as FakeElement;
    const indicatorSms = itemSms.childNodes[0] as FakeElement;

    expect(render.get(open)).toBe(true);
    expect(trigger.attributes.get('role')).toBeUndefined();
    expect(trigger.attributes.get('aria-haspopup')).toBe('listbox');
    expect(content.attributes.get('aria-multiselectable')).toBe('true');
    expect(isHidden(indicatorEmail)).toBe(false);
    expect(isHidden(indicatorSms)).toBe(true);
    expect(fakeDocument.activeElement).toBe(itemEmail);

    itemSms.listeners.get('click')?.({ currentTarget: itemSms } as unknown as Event);
    await Promise.resolve();

    expect(selected).toEqual(['sms']);
    expect(render.get(values)).toEqual(['email', 'sms']);
    expect(render.get(open)).toBe(true);
    expect(isHidden(indicatorSms)).toBe(false);

    const preventDown = jest.fn();
    itemSms.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: itemSms,
      preventDefault: preventDown,
    } as unknown as Event);
    await Promise.resolve();
    expect(preventDown).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemPush);

    itemPush.listeners.get('keydown')?.({
      key: 'Enter',
      currentTarget: itemPush,
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(values)).toEqual(['email', 'sms', 'push']);
    expect(render.get(open)).toBe(true);

    itemPush.listeners.get('keydown')?.({
      key: 'Escape',
      currentTarget: itemPush,
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(trigger);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('headless multiselect opens on keyboard and keeps movement clamped', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const open = render.signal(false);
    const values = render.signal<string[]>(['sms']);

    const mounted = render.mount_reactive(renderer, container, () =>
      render.multiselect_root(open, values, () =>
        render.element('section', null, [
          render.multiselect_trigger(null, [render.text('Choose channels')]),
          render.multiselect_portal([
            render.multiselect_content(null, [
              render.multiselect_item('email', null, () => [render.text('Email')]),
              render.multiselect_item('sms', null, () => [render.text('SMS')]),
              render.multiselect_item('push', null, () => [render.text('Push')]),
            ]),
          ]),
        ])
      )
    );

    const section = container.childNodes[0] as FakeElement;
    const trigger = section.childNodes[0] as FakeElement;
    trigger.focus();

    const preventTypeahead = jest.fn();
    trigger.listeners.get('keydown')?.({
      key: 'p',
      currentTarget: trigger,
      target: trigger,
      preventDefault: preventTypeahead,
    } as unknown as Event);
    await Promise.resolve();

    const host = fakeDocument.body.childNodes[0] as FakeElement;
    const content = host.childNodes[1] as FakeElement;
    const itemEmail = content.childNodes[0] as FakeElement;
    const itemPush = content.childNodes[2] as FakeElement;

    expect(preventTypeahead).toHaveBeenCalledTimes(1);
    expect(render.get(open)).toBe(true);
    expect(fakeDocument.activeElement).toBe(itemPush);
    expect(itemPush.attributes.get('data-active')).toBe('true');

    const preventDown = jest.fn();
    itemPush.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: itemPush,
      preventDefault: preventDown,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDown).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemPush);

    const preventHome = jest.fn();
    itemPush.listeners.get('keydown')?.({
      key: 'Home',
      currentTarget: itemPush,
      preventDefault: preventHome,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventHome).toHaveBeenCalledTimes(1);
    expect(fakeDocument.activeElement).toBe(itemEmail);

    const preventSpace = jest.fn();
    itemEmail.listeners.get('keydown')?.({
      key: ' ',
      currentTarget: itemEmail,
      preventDefault: preventSpace,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventSpace).toHaveBeenCalledTimes(1);
    expect(render.get(values)).toEqual(['sms', 'email']);

    itemEmail.listeners.get('keydown')?.({
      key: 'Escape',
      currentTarget: itemEmail,
      preventDefault: jest.fn(),
    } as unknown as Event);
    await Promise.resolve();

    expect(render.get(open)).toBe(false);
    expect(fakeDocument.activeElement).toBe(trigger);

    render.dispose_reactive(mounted);
    expect(fakeDocument.body.childNodes).toHaveLength(0);
  });

  test('resource suspense shows fallback first and then resolved content', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    let resolveLoad!: (value: string) => void;
    const resource = render.createResource(
      `user:${Date.now()}:suspense`,
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
      0
    );

    const mounted = render.mount_reactive(renderer, container, () =>
      render.suspense(render.element('div', { id: 'loading' }, [render.text('Loading')]), () =>
        render.element('div', { id: 'content' }, [
          render.text(render.resourceRead<string>(resource)),
        ])
      )
    );

    const loading = container.childNodes[0] as FakeElement;
    expect(loading.attributes.get('id')).toBe('loading');
    expect(loading.childNodes[0]?.textContent).toBe('Loading');

    resolveLoad('Ada');
    await Promise.resolve();
    await Promise.resolve();

    const content = container.childNodes[0] as FakeElement;
    expect(content.attributes.get('id')).toBe('content');
    expect(content.childNodes[0]?.textContent).toBe('Ada');

    render.dispose_reactive(mounted);
  });

  test('error boundary catches rejected resource reads after suspense settles', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    let rejectLoad!: (error: Error) => void;
    const resource = render.createResource(
      `user:${Date.now()}:error`,
      () =>
        new Promise<string>((_, reject) => {
          rejectLoad = reject;
        }),
      0
    );

    const mounted = render.mount_reactive(renderer, container, () =>
      render.suspense(render.element('div', { id: 'loading' }, [render.text('Loading')]), () =>
        render.error_boundary(
          (error: unknown) =>
            render.element('div', { id: 'error' }, [
              render.text(String((error as Error)?.message ?? error)),
            ]),
          () =>
            render.element('div', { id: 'content' }, [
              render.text(render.resourceRead<string>(resource)),
            ])
        )
      )
    );

    const loading = container.childNodes[0] as FakeElement;
    expect(loading.attributes.get('id')).toBe('loading');

    rejectLoad(new Error('Request failed'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorNode = container.childNodes[0] as FakeElement;
    expect(errorNode.attributes.get('id')).toBe('error');
    expect(errorNode.childNodes[0]?.textContent).toBe('Request failed');

    render.dispose_reactive(mounted);
  });

  test('headless checkbox toggles signal state and indicator visibility', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const checked = render.signal(false);
    const externalClick = jest.fn();
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.checkbox_root(checked, { onClick: externalClick }, () => [
        render.checkbox_indicator(null, [render.text('check')]),
        render.text('Accept'),
      ])
    );

    const root = container.childNodes[0] as FakeElement;
    const indicator = root.childNodes[0] as FakeElement;

    expect(root.attributes.get('role')).toBe('checkbox');
    expect(root.attributes.get('aria-checked')).toBe('false');
    expect(root.attributes.get('data-state')).toBe('unchecked');
    expect(isHidden(indicator)).toBe(true);

    root.listeners.get('click')?.({ currentTarget: root } as unknown as Event);
    await Promise.resolve();

    expect(externalClick).toHaveBeenCalledTimes(1);
    expect(render.get(checked)).toBe(true);
    expect(root.attributes.get('aria-checked')).toBe('true');
    expect(root.attributes.get('data-state')).toBe('checked');
    expect(isHidden(indicator)).toBe(false);

    const preventDefault = jest.fn();
    root.listeners.get('keydown')?.({
      key: 'Enter',
      currentTarget: root,
      preventDefault,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(render.get(checked)).toBe(false);
    expect(root.attributes.get('aria-checked')).toBe('false');
    expect(isHidden(indicator)).toBe(true);

    render.dispose_reactive(mounted);
  });

  test('headless radio group supports click selection, keyboard navigation, and indicators', async () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');
    const value = render.signal('email');
    const selected: string[] = [];
    const isHidden = (node: FakeElement): boolean =>
      node.attributes.get('hidden') === 'true' ||
      (node as FakeElement & { hidden?: boolean }).hidden === true;

    const mounted = render.mount_reactive(renderer, container, () =>
      render.radio_group(value, null, () => [
        render.radio_item('email', { onClick: () => selected.push('email') }, () => [
          render.radio_indicator(null, [render.text('o')]),
          render.text('Email'),
        ]),
        render.radio_item('sms', { onClick: () => selected.push('sms') }, () => [
          render.radio_indicator(null, [render.text('o')]),
          render.text('SMS'),
        ]),
        render.radio_item('push', { onClick: () => selected.push('push') }, () => [
          render.radio_indicator(null, [render.text('o')]),
          render.text('Push'),
        ]),
      ])
    );

    const group = container.childNodes[0] as FakeElement;
    const itemEmail = group.childNodes[0] as FakeElement;
    const itemSms = group.childNodes[1] as FakeElement;
    const itemPush = group.childNodes[2] as FakeElement;
    const indicatorEmail = itemEmail.childNodes[0] as FakeElement;
    const indicatorSms = itemSms.childNodes[0] as FakeElement;

    expect(group.attributes.get('role')).toBe('radiogroup');
    expect(itemEmail.attributes.get('aria-checked')).toBe('true');
    expect(itemEmail.attributes.get('tabIndex')).toBe('0');
    expect(itemSms.attributes.get('aria-checked')).toBe('false');
    expect(itemSms.attributes.get('tabIndex')).toBe('-1');
    expect(isHidden(indicatorEmail)).toBe(false);
    expect(isHidden(indicatorSms)).toBe(true);

    itemSms.listeners.get('click')?.({ currentTarget: itemSms } as unknown as Event);
    await Promise.resolve();

    expect(selected).toEqual(['sms']);
    expect(render.get(value)).toBe('sms');
    expect(itemSms.attributes.get('aria-checked')).toBe('true');
    expect(itemSms.attributes.get('tabIndex')).toBe('0');
    expect(isHidden(indicatorSms)).toBe(false);
    expect(isHidden(indicatorEmail)).toBe(true);

    const preventDefault = jest.fn();
    itemSms.listeners.get('keydown')?.({
      key: 'ArrowDown',
      currentTarget: itemSms,
      preventDefault,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(render.get(value)).toBe('push');
    expect(fakeDocument.activeElement).toBe(itemPush);
    expect(itemPush.attributes.get('aria-checked')).toBe('true');

    const preventHome = jest.fn();
    itemPush.listeners.get('keydown')?.({
      key: 'Home',
      currentTarget: itemPush,
      preventDefault: preventHome,
    } as unknown as Event);
    await Promise.resolve();

    expect(preventHome).toHaveBeenCalledTimes(1);
    expect(render.get(value)).toBe('email');
    expect(fakeDocument.activeElement).toBe(itemEmail);

    render.dispose_reactive(mounted);
  });

  test('tabs helpers throw when used outside a tabs root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.tabs_trigger('profile', null, [render.text('Profile')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('dialog helpers throw when used outside a dialog root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.dialog_trigger(null, [render.text('Open dialog')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('popover helpers throw when used outside a popover root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.popover_trigger(null, [render.text('Open popover')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('tooltip helpers throw when used outside a tooltip root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.tooltip_trigger(null, [render.text('Hover target')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('toast helpers throw when used outside a toast root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.toast_content(null, [render.text('Saved')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('menu helpers throw when used outside a menu root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.menu_trigger(null, [render.text('Open menu')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('select helpers throw when used outside a select root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.select_indicator(null, [render.text('o')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('combobox helpers throw when used outside a combobox root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.combobox_indicator(null, [render.text('o')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('multiselect helpers throw when used outside a multiselect root provider', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () =>
      render.multiselect_indicator(null, [render.text('x')])
    );

    expect((mounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((mounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('checkbox/radio helpers throw when used outside their providers', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const checkboxContainer = fakeDocument.createElement('div');
    const radioContainer = fakeDocument.createElement('div');

    const checkboxMounted = render.mount_reactive(renderer, checkboxContainer, () =>
      render.checkbox_indicator(null, [render.text('check')])
    );
    const radioMounted = render.mount_reactive(renderer, radioContainer, () =>
      render.radio_indicator(null, [render.text('dot')])
    );

    expect((checkboxMounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((checkboxMounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
    expect((radioMounted as { $tag?: string; $payload?: unknown }).$tag).toBe('Err');
    expect(String((radioMounted as { $payload?: unknown }).$payload)).toContain(
      'No provider found for context'
    );
  });

  test('render.state throws outside a component frame', () => {
    const fakeDocument = new FakeDocument();
    const renderer = render.create_dom_renderer({ document: fakeDocument as never });
    const container = fakeDocument.createElement('div');

    const mounted = render.mount_reactive(renderer, container, () => {
      render.state(0);
      return render.text('bad');
    });

    expect((mounted as { $tag?: string }).$tag).toBe('Err');
  });
});
