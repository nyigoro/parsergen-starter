import {
  batch,
  configureReactiveCore,
  createStaticSignal,
  Effect,
  Memo,
  readSignalRaw,
  Signal,
  untrack,
} from '../src/runtime/reactive-core.js';

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.slice() as T;
  }
  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
};

describe('runtime reactive core', () => {
  test('signals clone values, schedule effects, and notify devtools hooks', () => {
    const microtasks: Array<() => void> = [];
    const notifications: string[] = [];
    let nextId = 0;

    configureReactiveCore({
      cloneValue,
      equalsValue: Object.is,
      scheduleMicrotask: (fn) => {
        microtasks.push(fn);
      },
      registerSignal: (kind) => {
        notifications.push(`register:${kind}`);
        nextId += 1;
        return nextId;
      },
      unregisterSignal: (id) => {
        notifications.push(`unregister:${id}`);
      },
      notifyDevtools: () => {
        notifications.push('notify');
      },
    });

    const signal = new Signal<{ count: number }>({ count: 1 });
    const seen: number[] = [];
    new Effect(() => {
      seen.push(signal.get().count);
    });

    const value = signal.get();
    value.count = 99;
    expect(signal.peek().count).toBe(1);

    signal.set({ count: 2 });
    expect(seen).toEqual([1]);
    while (microtasks.length > 0) {
      const task = microtasks.shift();
      task?.();
    }

    expect(seen).toEqual([1, 2]);
    expect(notifications).toEqual(['register:signal', 'notify']);
  });

  test('memo, batch, and untrack preserve dependency behavior', () => {
    const microtasks: Array<() => void> = [];
    configureReactiveCore({
      cloneValue,
      equalsValue: Object.is,
      scheduleMicrotask: (fn) => {
        microtasks.push(fn);
      },
      registerSignal: () => 0,
      unregisterSignal: () => undefined,
      notifyDevtools: () => undefined,
    });

    const signal = new Signal(1);
    const memo = new Memo(() => signal.get() * 2);
    const seen: number[] = [];
    new Effect(() => {
      seen.push(memo.get());
    });

    batch(() => {
      signal.set(2);
      signal.set(3);
    });
    expect(seen).toEqual([2, 6]);

    const detached = untrack(() => memo.get());
    expect(detached).toBe(6);

    signal.set(4);
    while (microtasks.length > 0) {
      const task = microtasks.shift();
      task?.();
    }
    expect(seen).toEqual([2, 6, 8]);

    memo.dispose();
    expect(memo.peek()).toBe(8);
  });

  test('static signals and raw reads support un-cloned access paths', () => {
    configureReactiveCore({
      cloneValue,
      equalsValue: Object.is,
      scheduleMicrotask: (fn) => {
        fn();
      },
      registerSignal: () => 0,
      unregisterSignal: () => undefined,
      notifyDevtools: () => undefined,
    });

    const source = new Signal([1, 2, 3]);
    const raw = readSignalRaw(source, false);
    const cloned = source.get();
    expect(raw).toEqual([1, 2, 3]);
    expect(raw).not.toBe(cloned);

    const staticSignal = createStaticSignal({ label: 'row' });
    const staticValue = staticSignal.get();
    staticValue.label = 'changed';
    expect(staticSignal.peek().label).toBe('row');
  });
});
