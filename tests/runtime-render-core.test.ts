import {
  coerceRenderer,
  isDisposableLike,
  isUnmountableLike,
  ReactiveRenderRoot,
  RenderRoot,
  runWithFrameManager,
} from '../src/runtime/render-core.js';

describe('runtime render core', () => {
  test('render root mounts, hydrates, updates, and unmounts through renderer hooks', () => {
    const calls: string[] = [];
    const renderer = {
      mount: (node: string) => calls.push(`mount:${node}`),
      patch: (prev: string | null, next: string) => calls.push(`patch:${prev}->${next}`),
      hydrate: (node: string) => calls.push(`hydrate:${node}`),
      unmount: () => calls.push('unmount'),
    };

    const root = new RenderRoot(renderer, {});
    root.mount('a');
    root.update('b');
    root.hydrate('c');
    root.unmount();

    expect(calls).toEqual(['mount:a', 'patch:a->b', 'hydrate:c', 'unmount']);
    expect(root.currentNode()).toBeNull();
  });

  test('coerces renderer-like objects and validates hooks', () => {
    const renderer = coerceRenderer<string>({ mount: () => undefined });
    expect(typeof renderer.mount).toBe('function');
    expect(() => coerceRenderer<string>({})).toThrow(/Renderer\.mount/);
  });

  test('runWithFrameManager swaps active manager during render and restores it after', () => {
    const active: Array<unknown> = [];
    type FrameDriver = {
      renderEpoch: number;
      rootFrame: { seenEpoch: number };
      beginRender: () => void;
      renderFrame: (_frame: { seenEpoch: number }, renderView: () => string) => string;
    };

    const previousManager: FrameDriver = {
      renderEpoch: 0,
      rootFrame: { seenEpoch: 0 },
      beginRender: () => undefined,
      renderFrame: (_frame: { seenEpoch: number }, renderView: () => string) => renderView(),
    };
    const frameManager: FrameDriver = {
      renderEpoch: 0,
      rootFrame: { seenEpoch: 0 },
      beginRender: () => {
        frameManager.renderEpoch += 1;
      },
      renderFrame: (_frame: { seenEpoch: number }, renderView: () => string) => {
        active.push(current === previousManager ? 'previous' : current === frameManager ? 'current' : 'missing');
        return renderView();
      },
    };
    let current: FrameDriver | null = previousManager;

    const result = runWithFrameManager(
      frameManager,
      () => current,
      (next) => {
        current = next;
      },
      () => {
        active.push(current === frameManager ? 'current' : 'other');
        return 'ok';
      }
    );

    expect(result).toBe('ok');
    expect(frameManager.rootFrame.seenEpoch).toBe(1);
    expect(active).toEqual(['current', 'current']);
    expect(current).toBe(previousManager);
  });

  test('reactive render root uses hooks and disposes effect/frame state', () => {
    const log: string[] = [];
    const root = new RenderRoot<string>({ mount: () => undefined, unmount: () => log.push('unmount') }, {});
    const effect = { dispose: () => log.push('effect') };
    const frameManager = {
      renderEpoch: 0,
      rootFrame: { seenEpoch: 0 },
      beginRender: () => undefined,
      renderFrame: (_frame: { seenEpoch: number }, renderView: () => string) => renderView(),
      disposeFrame: (_frame: { seenEpoch: number }, deep: boolean) => log.push(`frame:${deep}`),
    };

    const reactive = new ReactiveRenderRoot(root, effect, frameManager, {
      onInit: () => log.push('init'),
      onDispose: () => log.push('dispose'),
    });

    reactive.dispose();

    expect(log).toEqual(['init', 'dispose', 'effect', 'frame:false', 'unmount']);
  });

  test('detects disposable and unmountable handles structurally', () => {
    expect(isDisposableLike({ dispose() {} })).toBe(true);
    expect(isUnmountableLike({ unmount() {} })).toBe(true);
    expect(isDisposableLike({})).toBe(false);
    expect(isUnmountableLike(null)).toBe(false);
  });
});
