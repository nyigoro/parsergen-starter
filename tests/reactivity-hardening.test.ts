import { render } from '../src/lumina-runtime.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string | null =>
  value && typeof value === 'object' && '$tag' in (value as Record<string, unknown>)
    ? String((value as Tagged).$tag)
    : null;

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

const snapshot = (node: FakeNode): string =>
  JSON.stringify({
    text: node.textContent,
    children: node.childNodes.map((child) => snapshot(child)),
  });

describe('reactivity hardening', () => {
  test('dispose/unmount APIs are idempotent with stale handles', async () => {
    expect(() => render.dispose_effect({} as never)).not.toThrow();
    expect(() => render.dispose_effect(null as never)).not.toThrow();

    const fx = render.effect(() => {});
    expect(() => render.dispose_effect(fx)).not.toThrow();
    expect(() => render.dispose_effect(fx)).not.toThrow();

    const r = render.create_renderer({
      mount() {},
      unmount() {},
    });
    const root = render.mount(r, {}, render.text('x'));
    if (getTag(root) === 'Err') throw new Error('unexpected mount failure');
    render.unmount(root);
    expect(() => render.unmount(root)).not.toThrow();

    const reactive = render.mount_reactive(r, {}, () => render.text('ok'));
    if (getTag(reactive) === 'Err') throw new Error('unexpected reactive mount failure');
    render.dispose_reactive(reactive);
    expect(() => render.dispose_reactive(reactive)).not.toThrow();

    await Promise.resolve();
  });

  test('mount with null container returns Err, not throw', () => {
    const renderer = render.create_dom_renderer({ document: new FakeDocument() as never });
    const result = render.mount(renderer, null, render.text('x'));
    expect(getTag(result)).toBe('Err');
  });

  test('create_renderer validation and deep render_to_string', () => {
    expect(() => render.create_renderer({ mount() {} , patch: 42 } as never)).toThrow(
      'Renderer.patch must be a function when provided'
    );

    let node = render.text('leaf');
    for (let i = 0; i < 250; i += 1) {
      node = render.element('div', { id: `n${i}` }, [node]);
    }
    const html = render.render_to_string(node);
    expect(html.startsWith('<div')).toBe(true);
    expect(html.includes('leaf')).toBe(true);
  });

  test('1000 signals/effects dispose cleanly and do not keep phantom runs', async () => {
    const signals = Array.from({ length: 1000 }, (_, idx) => render.signal(idx));
    const runs = new Array<number>(signals.length).fill(0);
    const effects = signals.map((signal, idx) =>
      render.effect(() => {
        render.get(signal);
        runs[idx] += 1;
      })
    );

    effects.forEach((fx) => render.dispose_effect(fx));
    signals.forEach((signal) => {
      render.set(signal, render.get(signal) + 1);
    });
    await Promise.resolve();

    expect(runs.every((count) => count === 1)).toBe(true);
  });

  test('deep memo chain and re-registering effects after dispose', async () => {
    const base = render.signal(1);
    const chain: Array<ReturnType<typeof render.memo<number>>> = [];
    for (let idx = 0; idx < 50; idx += 1) {
      if (idx === 0) {
        chain.push(render.memo(() => render.get(base) + 1));
      } else {
        const prev = chain[idx - 1];
        chain.push(render.memo(() => render.memo_get(prev) + 1));
      }
    }
    expect(render.memo_get(chain[49])).toBe(51);
    render.set(base, 2);
    expect(render.memo_get(chain[49])).toBe(52);

    const seen: number[] = [];
    const first = render.effect(() => {
      seen.push(render.get(base));
    });
    render.dispose_effect(first);
    const second = render.effect(() => {
      seen.push(render.get(base) * 10);
    });
    render.set(base, 3);
    await Promise.resolve();
    render.dispose_effect(second);
    expect(seen).toEqual([2, 20, 30]);
  });

  test('stress batching and dependency relevance', async () => {
    const value = render.signal(0);
    let runs = 0;
    const fx = render.effect(() => {
      render.get(value);
      runs += 1;
    });

    render.batch(() => {
      for (let i = 1; i <= 10_000; i += 1) {
        render.set(value, i);
      }
    });
    await Promise.resolve();
    render.dispose_effect(fx);
    expect(runs).toBe(2);

    const deps = Array.from({ length: 100 }, (_, idx) => render.signal(idx));
    let memoRuns = 0;
    const total = render.memo(() => {
      memoRuns += 1;
      return render.get(deps[0]) + render.get(deps[1]);
    });
    expect(render.memo_get(total)).toBe(1);
    expect(memoRuns).toBe(1);
    render.set(deps[50], 999);
    expect(render.memo_get(total)).toBe(1);
    expect(memoRuns).toBe(1);
    render.set(deps[1], 7);
    expect(render.memo_get(total)).toBe(7);
    expect(memoRuns).toBe(2);
  });

  test('sequential patch stress on renderer hooks', () => {
    let mountCalls = 0;
    let patchCalls = 0;
    const renderer = render.create_renderer({
      mount() {
        mountCalls += 1;
      },
      patch() {
        patchCalls += 1;
      },
      unmount() {},
    });

    const root = render.mount(renderer, {}, render.text('0'));
    if (getTag(root) === 'Err') throw new Error('unexpected mount failure');
    for (let i = 1; i <= 500; i += 1) {
      render.update(root, render.text(String(i)));
    }
    expect(mountCalls).toBe(1);
    expect(patchCalls).toBe(500);
  });

  test('DOM/SSR/terminal parity across mock containers', () => {
    const docA = new FakeDocument();
    const docB = new FakeDocument();
    const rendererA = render.create_dom_renderer({ document: docA as never });
    const rendererB = render.create_dom_renderer({ document: docB as never });
    const cA = docA.createElement('div');
    const cB = docB.createElement('div');
    const node = render.element('app', null, [render.text('hello')]);

    const rootA = render.mount(rendererA, cA, node);
    const rootB = render.mount(rendererB, cB, node);
    if (getTag(rootA) === 'Err' || getTag(rootB) === 'Err') throw new Error('unexpected mount error');
    expect(snapshot(cA)).toBe(snapshot(cB));

    const ssr = render.create_ssr_renderer();
    const s1: { html?: string } = {};
    const s2: { html?: string } = {};
    render.mount(ssr, s1, node);
    render.mount(ssr, s2, node);
    expect(s1.html).toBe(s2.html);

    const terminal = render.create_terminal_renderer();
    const t1: { output?: string } = {};
    const t2: { output?: string } = {};
    render.mount(terminal, t1, node);
    render.mount(terminal, t2, node);
    expect(t1.output).toBe(t2.output);
  });

  test('canvas renderer reports Err for missing container and records commands for mock context', () => {
    const renderer = render.create_canvas_renderer();
    const missing = render.mount(renderer, null, render.text('x'));
    expect(getTag(missing)).toBe('Err');

    const commands: string[] = [];
    const ctx = {
      canvas: { width: 320, height: 200 },
      clearRect: () => commands.push('clear'),
      fillRect: () => commands.push('rect'),
      fillText: (text: string) => commands.push(`text:${text}`),
    };
    const ok = render.mount(
      render.create_canvas_renderer({ context: ctx as never }),
      ctx as never,
      render.fragment([render.element('rect', { width: 10, height: 10 }, []), render.text('ok')])
    );
    expect(getTag(ok)).toBeNull();
    expect(commands).toContain('clear');
    expect(commands).toContain('rect');
    expect(commands).toContain('text:ok');
  });

  test('nested effect cleanup runs for inner and outer on dispose', async () => {
    const log: string[] = [];
    const gate = render.signal(0);
    let inner: ReturnType<typeof render.effect> | null = null;

    const outer = render.effect((onCleanup) => {
      render.get(gate);
      log.push('outer:run');
      if (!inner) {
        inner = render.effect((innerCleanup) => {
          render.get(gate);
          log.push('inner:run');
          innerCleanup(() => log.push('inner:cleanup'));
        });
      }
      onCleanup(() => log.push('outer:cleanup'));
    });

    render.set(gate, 1);
    await Promise.resolve();
    if (inner) render.dispose_effect(inner);
    render.dispose_effect(outer);

    expect(log).toContain('inner:cleanup');
    expect(log).toContain('outer:cleanup');
  });
});
