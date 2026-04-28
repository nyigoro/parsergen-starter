import {
  createContextToken,
  FrameManager,
  type ComponentFunction,
  type ContextToken,
} from '../frame-manager.js';
import { runWithFrameManager as runWithFrameManagerBase } from './render-core.js';

export interface FrameRuntimeOptions<TRenderable, TState> {
  coerceRenderable: (input: unknown) => TRenderable;
  createState: <T>(initial: T) => TState;
}

export interface FrameRuntime<TRenderable, TState> {
  runWithFrameManager: <T>(frameManager: FrameManager, renderView: () => T) => T;
  requireActiveFrameManager: (apiName: string) => FrameManager;
  component: <P>(componentFn: ComponentFunction<P, unknown>, props: P, key?: unknown) => TRenderable;
  createContext: <T>(defaultValue?: T) => ContextToken<T>;
  createRequiredContext: <T>() => ContextToken<T>;
  withContext: <T>(context: ContextToken<T>, value: T, renderChildren: () => unknown) => TRenderable;
  useContext: <T>(context: ContextToken<T>) => T;
  state: <T>(initial: T) => TState;
  remember: <T>(compute: () => T) => T;
}

export const createFrameRuntime = <TRenderable, TState>(
  options: FrameRuntimeOptions<TRenderable, TState>
): FrameRuntime<TRenderable, TState> => {
  let activeFrameManager: FrameManager | null = null;

  const runWithFrameManager = <T>(frameManager: FrameManager, renderView: () => T): T =>
    runWithFrameManagerBase<FrameManager['rootFrame'], FrameManager, T>(
      frameManager,
      () => activeFrameManager,
      (next) => {
        activeFrameManager = next as FrameManager | null;
      },
      renderView
    );

  const requireActiveFrameManager = (apiName: string): FrameManager => {
    if (!activeFrameManager) {
      throw new Error(`${apiName} can only be used while rendering inside mount_reactive`);
    }
    return activeFrameManager;
  };

  return {
    runWithFrameManager,
    requireActiveFrameManager,
    component: <P>(componentFn: ComponentFunction<P, unknown>, props: P, key?: unknown): TRenderable => {
      const frameManager = requireActiveFrameManager('render.component');
      const parentFrame = frameManager.currentFrame ?? frameManager.rootFrame;
      const { result } = frameManager.executeComponent(parentFrame, componentFn, key ?? null, props);
      return options.coerceRenderable(result);
    },
    createContext: <T>(defaultValue?: T): ContextToken<T> => createContextToken(defaultValue),
    createRequiredContext: <T>(): ContextToken<T> => createContextToken<T>(),
    withContext: <T>(context: ContextToken<T>, value: T, renderChildren: () => unknown): TRenderable => {
      const frameManager = requireActiveFrameManager('render.with_context');
      return options.coerceRenderable(frameManager.withContext(context, value, renderChildren));
    },
    useContext: <T>(context: ContextToken<T>): T => {
      const frameManager = requireActiveFrameManager('render.use_context');
      return frameManager.useContext(context);
    },
    state: <T>(initial: T): TState => {
      const frameManager = requireActiveFrameManager('render.state');
      return frameManager.getSlot('state', () => options.createState(initial)) as TState;
    },
    remember: <T>(compute: () => T): T => {
      const frameManager = requireActiveFrameManager('render.remember');
      return frameManager.getSlot('memo', compute);
    },
  };
};
