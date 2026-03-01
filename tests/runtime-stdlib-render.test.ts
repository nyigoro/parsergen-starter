import { render } from '../src/lumina-runtime.js';

describe('runtime render module', () => {
  test('signal + effect tracking', async () => {
    const count = render.signal(1);
    const seen: number[] = [];

    const fx = render.effect(() => {
      seen.push(render.get(count));
    });

    expect(seen).toEqual([1]);

    render.set(count, 2);
    await Promise.resolve();
    expect(seen).toEqual([1, 2]);

    expect(render.update_signal(count, (value) => value + 3)).toBe(5);
    await Promise.resolve();
    expect(seen).toEqual([1, 2, 5]);

    render.dispose_effect(fx);
  });

  test('memo is lazily recomputed', () => {
    const source = render.signal(2);
    let runs = 0;
    const doubled = render.memo(() => {
      runs += 1;
      return render.get(source) * 2;
    });

    expect(runs).toBe(0);
    expect(render.memo_get(doubled)).toBe(4);
    expect(runs).toBe(1);

    render.set(source, 3);
    expect(runs).toBe(1);
    expect(render.memo_get(doubled)).toBe(6);
    expect(runs).toBe(2);
  });

  test('effect cleanup runs before rerun and on dispose', async () => {
    const source = render.signal(0);
    const log: string[] = [];

    const fx = render.effect((onCleanup) => {
      const value = render.get(source);
      log.push(`run:${value}`);
      onCleanup(() => {
        log.push(`cleanup:${value}`);
      });
    });

    render.set(source, 1);
    await Promise.resolve();
    render.dispose_effect(fx);

    expect(log).toEqual(['run:0', 'cleanup:0', 'run:1', 'cleanup:1']);
  });

  test('vnode helpers produce serializable trees', () => {
    const node = render.element(
      'div',
      { id: 'root', class: 'demo' },
      [render.text('hello'), render.fragment([render.text('world')])]
    );

    expect(render.is_vnode(node)).toBe(true);
    const serialized = render.serialize(node);
    const parsed = render.parse(serialized);

    expect(parsed).toEqual(node);
    expect(parsed.kind).toBe('element');
  });

  test('renderer root lifecycle delegates to renderer hooks', () => {
    const events: string[] = [];
    const renderer = render.create_renderer({
      mount(node: { kind: string }) {
        events.push(`mount:${node.kind}`);
      },
      patch(prev: { kind: string }, next: { kind: string }) {
        events.push(`patch:${prev.kind}->${next.kind}`);
      },
      unmount() {
        events.push('unmount');
      },
    });

    const root = render.mount(renderer, { id: 'container' }, render.text('one'));
    render.update(root, render.element('span', null, [render.text('two')]));
    render.unmount(root);

    expect(events).toEqual(['mount:text', 'patch:text->element', 'unmount']);
  });

  test('create_renderer validates shape', () => {
    expect(() => render.create_renderer({})).toThrow('Renderer.mount must be a function');
  });
});
