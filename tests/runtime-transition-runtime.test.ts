import { Signal } from '../src/runtime/reactive-core.js';
import { createTransitionRuntime } from '../src/runtime/transition-runtime.js';

type TestNode =
  | { kind: 'fragment'; children: TestNode[] }
  | { kind: 'element'; tag: string; props: Record<string, unknown>; children: TestNode[] }
  | { kind: 'text'; text: string };

const text = (value: string): TestNode => ({ kind: 'text', text: value });

const createHarness = () => {
  const slots: unknown[] = [];
  let slotIndex = 0;

  const runtime = createTransitionRuntime<TestNode, TestNode[]>({
    state: <T>(initial: T): Signal<T> => {
      const current = slotIndex++;
      if (!(slots[current] instanceof Signal)) {
        slots[current] = new Signal(initial);
      }
      return slots[current] as Signal<T>;
    },
    remember: <T>(compute: () => T): T => {
      const current = slotIndex++;
      if (slots[current] === undefined) {
        slots[current] = compute();
      }
      return slots[current] as T;
    },
    mergeProps: (left, right) => ({
      ...((left as Record<string, unknown> | null | undefined) ?? {}),
      ...((right as Record<string, unknown> | null | undefined) ?? {}),
    }),
    element: (tag, props, children) => ({
      kind: 'element',
      tag,
      props: props ?? {},
      children,
    }),
    fragment: (children) => ({
      kind: 'fragment',
      children,
    }),
    resolveChildrenInput: (children) => children() as TestNode[],
    runMicrotask: (fn) => queueMicrotask(fn),
  });

  const render = (
    open: Signal<boolean>,
    props: Record<string, unknown> | null | undefined = { id: 'panel' },
    durationMs = 10
  ): TestNode => {
    slotIndex = 0;
    return runtime.transitionPresence(open, props, durationMs, () => [text('Panel')]);
  };

  return { render };
};

describe('runtime transition runtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps exit content mounted until timeout and annotates phase props', async () => {
    const { render } = createHarness();
    const open = new Signal(false);

    const hidden = render(open);
    expect(hidden.kind).toBe('fragment');

    open.set(true);
    const enter = render(open);
    expect(enter.kind).toBe('element');
    if (enter.kind !== 'element') throw new Error('expected element');
    expect(enter.props['data-transition-state']).toBe('enter-from');
    expect(enter.props['data-transition-open']).toBe('true');
    expect(enter.props['data-transition-duration']).toBe('10');

    await Promise.resolve();
    jest.runOnlyPendingTimers();
    const entered = render(open);
    expect(entered.kind).toBe('element');
    if (entered.kind !== 'element') throw new Error('expected element');
    expect(entered.props['data-transition-state']).toBe('entered');

    open.set(false);
    const exit = render(open);
    expect(exit.kind).toBe('element');
    if (exit.kind !== 'element') throw new Error('expected element');
    expect(exit.props['data-transition-state']).toBe('exit-from');

    await Promise.resolve();
    jest.advanceTimersByTime(11);
    const gone = render(open);
    expect(gone.kind).toBe('fragment');
  });

  test('preserves mounted content when reopening before exit timer settles', async () => {
    const { render } = createHarness();
    const open = new Signal(true);

    render(open);
    jest.advanceTimersByTime(11);
    render(open);

    open.set(false);
    render(open);
    open.set(true);
    const reopened = render(open);
    expect(reopened.kind).toBe('element');
    if (reopened.kind !== 'element') throw new Error('expected element');
    expect(reopened.props['data-transition-state']).toBe('enter-from');

    await Promise.resolve();
    jest.advanceTimersByTime(11);
    const settled = render(open);
    expect(settled.kind).toBe('element');
    if (settled.kind !== 'element') throw new Error('expected element');
    expect(settled.props['data-transition-state']).toBe('entered');
  });
});
