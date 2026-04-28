export type ReactiveCleanup = () => void;

export interface ReactiveSourceObserver {
  invalidate: () => void;
}

export interface ReactiveSource {
  observers: Set<ReactiveSourceObserver>;
}

type ReactiveSignalKind = 'signal' | 'memo';

interface ReactiveCoreHooks {
  cloneValue: <T>(value: T) => T;
  equalsValue: (left: unknown, right: unknown) => boolean;
  scheduleMicrotask: (fn: () => void) => void;
  registerSignal?: (kind: ReactiveSignalKind, signal: Signal<unknown> | Memo<unknown>) => number;
  unregisterSignal?: (id: number) => void;
  notifyDevtools?: () => void;
}

const defaultHooks: ReactiveCoreHooks = {
  cloneValue: <T>(value: T): T => value,
  equalsValue: Object.is,
  scheduleMicrotask: (fn: () => void): void => {
    Promise.resolve().then(fn);
  },
  registerSignal: () => 0,
  unregisterSignal: () => undefined,
  notifyDevtools: () => undefined,
};

let reactiveHooks: ReactiveCoreHooks = defaultHooks;

export const configureReactiveCore = (hooks: Partial<ReactiveCoreHooks>): void => {
  reactiveHooks = { ...reactiveHooks, ...hooks };
};

let activeComputation: ReactiveComputation | null = null;
const pendingEffects = new Set<ReactiveComputation>();
let effectFlushPending = false;
let batchDepth = 0;

const flushEffects = (): void => {
  if (pendingEffects.size === 0) return;
  const toRun = Array.from(pendingEffects);
  pendingEffects.clear();
  for (const computation of toRun) {
    computation.run();
  }
  if (pendingEffects.size > 0 && batchDepth === 0) {
    scheduleEffectsFlush();
  }
};

const scheduleEffectsFlush = (): void => {
  if (batchDepth > 0 || effectFlushPending) return;
  effectFlushPending = true;
  reactiveHooks.scheduleMicrotask(() => {
    effectFlushPending = false;
    flushEffects();
  });
};

const trackReactiveSource = (source: ReactiveSource): void => {
  if (!activeComputation) return;
  if (activeComputation.isDisposed()) return;
  if (source.observers.has(activeComputation)) return;
  source.observers.add(activeComputation);
  activeComputation.dependencies.add(source);
};

const clearComputationDependencies = (computation: ReactiveComputation): void => {
  for (const dep of computation.dependencies) {
    dep.observers.delete(computation);
  }
  computation.dependencies.clear();
};

class ReactiveComputation implements ReactiveSourceObserver {
  readonly dependencies = new Set<ReactiveSource>();
  private cleanups: ReactiveCleanup[] = [];
  private disposed = false;
  private running = false;

  constructor(
    private readonly runner: (onCleanup: (cleanup: ReactiveCleanup) => void) => void,
    private readonly kind: 'memo' | 'effect',
    private readonly onInvalidate?: () => void
  ) {}

  isDisposed(): boolean {
    return this.disposed;
  }

  private runCleanups(): void {
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // Swallow cleanup failures to avoid tearing down the graph.
      }
    }
  }

  run(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.runCleanups();
    clearComputationDependencies(this);
    const previous = activeComputation;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- active dependency collector for this execution frame.
    activeComputation = this;
    try {
      this.runner((cleanup) => {
        if (!this.disposed) this.cleanups.push(cleanup);
      });
    } finally {
      activeComputation = previous;
      this.running = false;
    }
  }

  invalidate(): void {
    if (this.disposed) return;
    if (this.onInvalidate) {
      this.onInvalidate();
      return;
    }
    if (this.kind === 'effect') {
      pendingEffects.add(this);
      scheduleEffectsFlush();
      return;
    }
    this.run();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    pendingEffects.delete(this);
    this.runCleanups();
    clearComputationDependencies(this);
  }
}

const notifyReactiveObservers = (source: ReactiveSource): void => {
  const observers = Array.from(source.observers);
  for (const observer of observers) {
    observer.invalidate();
  }
};

export class Signal<T> implements ReactiveSource {
  observers = new Set<ReactiveSourceObserver>();
  readonly __luminaDevtoolsId: number;
  private value: T;

  constructor(initial: T) {
    this.__luminaDevtoolsId = reactiveHooks.registerSignal?.('signal', this as Signal<unknown>) ?? 0;
    this.value = reactiveHooks.cloneValue(initial);
  }

  get(): T {
    trackReactiveSource(this);
    return reactiveHooks.cloneValue(this.value);
  }

  peek(): T {
    return reactiveHooks.cloneValue(this.value);
  }

  set(next: T): boolean {
    const cloned = reactiveHooks.cloneValue(next);
    const currentIsAggregate = this.value !== null && typeof this.value === 'object';
    const nextIsAggregate = cloned !== null && typeof cloned === 'object';
    if (currentIsAggregate || nextIsAggregate) {
      if (Object.is(this.value, cloned)) return false;
    } else if (reactiveHooks.equalsValue(this.value, cloned)) {
      return false;
    }
    this.value = cloned;
    notifyReactiveObservers(this);
    reactiveHooks.notifyDevtools?.();
    return true;
  }

  update(updater: (value: T) => T): T {
    const next = updater(this.get());
    this.set(next);
    return this.get();
  }
}

export class Memo<T> implements ReactiveSource {
  observers = new Set<ReactiveSourceObserver>();
  readonly __luminaDevtoolsId: number;
  private readonly compute: () => T;
  private readonly computation: ReactiveComputation;
  private value!: T;
  private ready = false;
  private stale = true;

  constructor(compute: () => T) {
    this.__luminaDevtoolsId = reactiveHooks.registerSignal?.('memo', this as Memo<unknown>) ?? 0;
    this.compute = compute;
    this.computation = new ReactiveComputation(
      () => {
        const next = reactiveHooks.cloneValue(this.compute());
        const changed = !this.ready || !reactiveHooks.equalsValue(this.value, next);
        this.value = next;
        this.ready = true;
        this.stale = false;
        reactiveHooks.notifyDevtools?.();
        if (changed) {
          notifyReactiveObservers(this);
        }
      },
      'memo',
      () => {
        this.stale = true;
        notifyReactiveObservers(this);
        reactiveHooks.notifyDevtools?.();
      }
    );
  }

  private ensureFresh(): void {
    if (!this.ready || this.stale) {
      this.computation.run();
    }
  }

  get(): T {
    this.ensureFresh();
    trackReactiveSource(this);
    return reactiveHooks.cloneValue(this.value);
  }

  peek(): T {
    this.ensureFresh();
    return reactiveHooks.cloneValue(this.value);
  }

  dispose(): void {
    this.computation.dispose();
    this.observers.clear();
    if (this.__luminaDevtoolsId !== 0) {
      reactiveHooks.unregisterSignal?.(this.__luminaDevtoolsId);
    }
    reactiveHooks.notifyDevtools?.();
  }
}

export class Effect {
  private readonly computation: ReactiveComputation;

  constructor(effectFn: (onCleanup: (cleanup: ReactiveCleanup) => void) => void | ReactiveCleanup) {
    this.computation = new ReactiveComputation((onCleanup) => {
      const cleanup = effectFn(onCleanup);
      if (typeof cleanup === 'function') onCleanup(cleanup);
    }, 'effect');
    this.computation.run();
  }

  dispose(): void {
    this.computation.dispose();
  }
}

export const batch = <T>(fn: () => T): T => {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth = Math.max(0, batchDepth - 1);
    if (batchDepth === 0) {
      flushEffects();
    }
  }
};

export const untrack = <T>(fn: () => T): T => {
  const previous = activeComputation;
  activeComputation = null;
  try {
    return fn();
  } finally {
    activeComputation = previous;
  }
};

export const createStaticSignal = <T>(value: T): Signal<T> => {
  let current = reactiveHooks.cloneValue(value);
  return {
    observers: new Set<ReactiveSourceObserver>(),
    __luminaDevtoolsId: 0,
    get: (): T => reactiveHooks.cloneValue(current),
    peek: (): T => reactiveHooks.cloneValue(current),
    set: (next: T): boolean => {
      current = reactiveHooks.cloneValue(next);
      return true;
    },
    update: (updater: (source: T) => T): T => {
      current = reactiveHooks.cloneValue(updater(reactiveHooks.cloneValue(current)));
      return reactiveHooks.cloneValue(current);
    },
  } as Signal<T>;
};

export const readSignalRaw = <T>(signal: Signal<T>, tracked: boolean): T => {
  if (tracked) {
    trackReactiveSource(signal);
  }
  return (signal as unknown as { value: T }).value;
};
