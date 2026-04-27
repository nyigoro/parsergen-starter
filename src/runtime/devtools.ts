import type { ComponentFrame } from '../frame-manager.js';

export interface DevtoolsSignalSnapshot {
  id: number;
  kind: 'signal' | 'memo';
  value: unknown;
}

export interface DevtoolsResourceSnapshot {
  key: string;
  status: string;
  hasData: boolean;
  error: unknown;
}

export interface DevtoolsFrameSnapshot {
  id: number;
  name: string;
  key: unknown;
  slots: Array<{ kind: string }>;
  children: DevtoolsFrameSnapshot[];
}

export interface DevtoolsSnapshot<TCurrent = unknown> {
  roots: Array<{ id: number; current: TCurrent | null; frames: DevtoolsFrameSnapshot[] }>;
  resources: DevtoolsResourceSnapshot[];
  signals: DevtoolsSignalSnapshot[];
}

export type DevtoolsListener<TCurrent = unknown> = (snapshot: DevtoolsSnapshot<TCurrent>) => void;

export interface DevtoolsSignalLike {
  peek(): unknown;
}

export interface DevtoolsControllerDeps<TRoot extends object, TCurrent> {
  scheduleMicrotask: (callback: () => void) => void;
  snapshotRoot: (root: TRoot, id: number) => { id: number; current: TCurrent | null; frames: DevtoolsFrameSnapshot[] };
  snapshotResources: () => DevtoolsResourceSnapshot[];
}

export const snapshotComponentFrame = (frame: ComponentFrame): DevtoolsFrameSnapshot => ({
  id: frame.id,
  name: frame.componentFn?.name?.trim() || (frame.componentFn ? '<anonymous component>' : 'root'),
  key: frame.key ?? null,
  slots: frame.slots.map((slot) => ({ kind: slot.kind })),
  children: [
    ...Array.from(frame.keyedChildren.values()).map(snapshotComponentFrame),
    ...frame.unkeyedChildren.map(snapshotComponentFrame),
  ],
});

export const createDevtoolsController = <TRoot extends object, TCurrent>(
  deps: DevtoolsControllerDeps<TRoot, TCurrent>
) => {
  let nextSignalId = 1;
  let nextRootId = 1;
  let notifyPending = false;
  const signalEntries = new Map<number, { kind: 'signal' | 'memo'; source: DevtoolsSignalLike }>();
  const roots = new Map<number, TRoot>();
  const rootIds = new WeakMap<TRoot, number>();
  const listeners = new Set<DevtoolsListener<TCurrent>>();

  const snapshot = (): DevtoolsSnapshot<TCurrent> => ({
    roots: Array.from(roots.entries()).map(([id, root]) => deps.snapshotRoot(root, id)),
    resources: deps.snapshotResources(),
    signals: Array.from(signalEntries.entries()).map(([id, entry]) => ({
      id,
      kind: entry.kind,
      value: entry.source.peek(),
    })),
  });

  const scheduleNotify = (): void => {
    if (listeners.size === 0 || notifyPending) return;
    notifyPending = true;
    deps.scheduleMicrotask(() => {
      notifyPending = false;
      const next = snapshot();
      for (const listener of Array.from(listeners)) {
        try {
          listener(next);
        } catch {
          // Ignore observer failures.
        }
      }
    });
  };

  const subscribe = (listener: DevtoolsListener<TCurrent>): (() => void) => {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    registerSignal(kind: 'signal' | 'memo', source: DevtoolsSignalLike): number {
      const id = nextSignalId++;
      signalEntries.set(id, { kind, source });
      return id;
    },
    unregisterSignal(id: number): void {
      if (signalEntries.delete(id)) {
        scheduleNotify();
      }
    },
    registerRoot(root: TRoot): number {
      if (!rootIds.has(root)) {
        rootIds.set(root, nextRootId++);
      }
      const id = rootIds.get(root)!;
      roots.set(id, root);
      scheduleNotify();
      return id;
    },
    unregisterRoot(root: TRoot): void {
      const id = rootIds.get(root);
      if (id !== undefined && roots.delete(id)) {
        scheduleNotify();
      }
    },
    snapshot,
    subscribe,
    install(key: string = '__LUMINA_DEVTOOLS__'): Record<string, unknown> {
      const globalRecord = globalThis as Record<string, unknown>;
      const handle = {
        version: 'beta',
        snapshot: () => snapshot(),
        subscribe,
      };
      globalRecord[key] = handle;
      return handle;
    },
    scheduleNotify,
  };
};
