import { createDevtoolsController, snapshotComponentFrame } from '../src/runtime/devtools.js';

describe('runtime devtools controller', () => {
  test('tracks roots, signals, subscriptions, and install handle', async () => {
    const microtasks: Array<() => void> = [];
    const controller = createDevtoolsController<{ current: string | null; frames: unknown[] }, string | null>({
      scheduleMicrotask: (callback) => {
        microtasks.push(callback);
      },
      snapshotRoot: (root, id) => ({ id, current: root.current, frames: root.frames as never[] }),
      snapshotResources: () => [{ key: 'resource:alpha', status: 'success', hasData: true, error: null }],
    });

    const seen: Array<ReturnType<typeof controller.snapshot>> = [];
    const unsubscribe = controller.subscribe((snapshot) => {
      seen.push(snapshot);
    });

    expect(seen).toHaveLength(1);
    const signal = { peek: () => 'alpha' };
    const signalId = controller.registerSignal('signal', signal);
    const root = { current: 'node', frames: [] };
    controller.registerRoot(root);
    const event = controller.recordEvent('hydration', 'text mismatch', { path: 'root.0' });
    controller.scheduleNotify();

    while (microtasks.length > 0) {
      microtasks.shift()?.();
    }

    expect(seen.at(-1)?.signals).toEqual([{ id: signalId, kind: 'signal', value: 'alpha' }]);
    expect(seen.at(-1)?.roots).toEqual([{ id: 1, current: 'node', frames: [] }]);
    expect(seen.at(-1)?.resources[0]?.key).toBe('resource:alpha');
    expect(seen.at(-1)?.timeline).toEqual([event]);
    expect(controller.timeline()).toEqual([event]);

    const installed = controller.install('__LUMINA_DEVTOOLS_TEST__');
    expect((globalThis as Record<string, unknown>).__LUMINA_DEVTOOLS_TEST__).toBe(installed);
    expect(typeof (installed as { snapshot?: unknown }).snapshot).toBe('function');
    expect(typeof (installed as { timeline?: unknown }).timeline).toBe('function');
    const installedEvent = (installed as {
      recordEvent?: (type: string, label: string, detail: unknown) => unknown;
    }).recordEvent?.('route-transition', 'tasks', { to: '/tasks' });
    expect(installedEvent).toMatchObject({ type: 'route-transition', label: 'tasks' });
    expect(controller.timeline().at(-1)).toMatchObject({ type: 'route-transition', label: 'tasks' });
    controller.clearTimeline();
    expect(controller.timeline()).toEqual([]);

    controller.unregisterRoot(root);
    controller.unregisterSignal(signalId);
    controller.scheduleNotify();
    while (microtasks.length > 0) {
      microtasks.shift()?.();
    }

    expect(seen.at(-1)?.roots).toEqual([]);
    expect(seen.at(-1)?.signals).toEqual([]);
    unsubscribe();
  });

  test('snapshots component frames recursively', () => {
    const leaf = {
      id: 2,
      componentFn: function Child() {
        return null;
      },
      key: 'leaf',
      slots: [{ kind: 'state' }],
      keyedChildren: new Map(),
      unkeyedChildren: [],
    };
    const root = {
      id: 1,
      componentFn: null,
      key: null,
      slots: [{ kind: 'memo' }],
      keyedChildren: new Map([['leaf', leaf]]),
      unkeyedChildren: [],
    };

    expect(snapshotComponentFrame(root as never)).toEqual({
      id: 1,
      name: 'root',
      key: null,
      slots: [{ kind: 'memo' }],
      children: [
        {
          id: 2,
          name: 'Child',
          key: 'leaf',
          slots: [{ kind: 'state' }],
          children: [],
        },
      ],
    });
  });
});
