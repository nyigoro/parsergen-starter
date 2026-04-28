import { FrameManager } from '../src/frame-manager.js';
import { createFrameRuntime } from '../src/runtime/frame-runtime.js';
import { Signal } from '../src/runtime/reactive-core.js';

describe('runtime frame runtime', () => {
  test('runs components with context and preserves local state across rerenders', () => {
    const runtime = createFrameRuntime<string, Signal<unknown>>({
      coerceRenderable: (input) => String(input),
      createState: <T>(initial: T): Signal<T> => new Signal(initial),
    });

    const theme = runtime.createContext('light');
    const frameManager = new FrameManager();
    let rememberCalls = 0;
    let countSignal: Signal<number> | null = null;

    const Counter = ({ label }: { label: string }): string => {
      const count = runtime.state(1) as Signal<number>;
      countSignal = count;
      const memo = runtime.remember(() => {
        rememberCalls += 1;
        return `${label}-${runtime.useContext(theme)}`;
      });
      return `${memo}:${count.get()}`;
    };

    const first = runtime.runWithFrameManager(frameManager, () =>
      runtime.withContext(theme, 'dark', () => runtime.component(Counter, { label: 'count' }))
    );

    expect(first).toBe('count-dark:1');
    expect(rememberCalls).toBe(1);

    countSignal?.set(3);

    const second = runtime.runWithFrameManager(frameManager, () =>
      runtime.withContext(theme, 'dark', () => runtime.component(Counter, { label: 'count' }))
    );

    expect(second).toBe('count-dark:3');
    expect(rememberCalls).toBe(1);
  });

  test('throws when frame-only helpers are used outside a render pass', () => {
    const runtime = createFrameRuntime<string, Signal<unknown>>({
      coerceRenderable: (input) => String(input),
      createState: <T>(initial: T): Signal<T> => new Signal(initial),
    });

    expect(() => runtime.state(1)).toThrow(/render\.state/);
    expect(() => runtime.remember(() => 1)).toThrow(/render\.remember/);
  });

  test('required contexts still fail without a provider', () => {
    const runtime = createFrameRuntime<string, Signal<unknown>>({
      coerceRenderable: (input) => String(input),
      createState: <T>(initial: T): Signal<T> => new Signal(initial),
    });

    const required = runtime.createRequiredContext<string>();
    const frameManager = new FrameManager();

    expect(() =>
      runtime.runWithFrameManager(frameManager, () =>
        runtime.component(() => runtime.useContext(required), {})
      )
    ).toThrow(/No provider found/);
  });
});
