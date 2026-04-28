import { createRootRuntime } from '../src/runtime/root-runtime.js';
import type { RenderRootRenderer } from '../src/runtime/render-core.js';
import { Signal } from '../src/runtime/reactive-core.js';

type TestNode = { label: string };
type TestRoot = {
  update: jest.Mock<void, [TestNode]>;
  hydrate: jest.Mock<void, [TestNode]>;
};
type TestFrameManager = { kind: string };
type TestReactiveRoot = {
  root: TestRoot;
  dispose: jest.Mock<void, []>;
};

const createHarness = () => {
  const roots: TestRoot[] = [];
  const frameManagers: TestFrameManager[] = [];
  const renderers: Array<RenderRootRenderer<TestNode>> = [];
  const containers: unknown[] = [];

  const runtime = createRootRuntime<
    TestNode,
    TestRoot,
    TestFrameManager,
    TestReactiveRoot,
    { $tag: string; $payload?: unknown }
  >({
    createRenderRoot: (renderer, container) => {
      renderers.push(renderer);
      containers.push(container);
      const root = {
        update: jest.fn<void, [TestNode]>(),
        hydrate: jest.fn<void, [TestNode]>(),
      };
      roots.push(root);
      return root;
    },
    createFrameManager: () => {
      const frameManager = { kind: 'frame-manager' };
      frameManagers.push(frameManager);
      return frameManager;
    },
    runWithFrameManager: (_frameManager, renderView) => renderView(),
    createReactiveRoot: (root) => ({
      root,
      dispose: jest.fn<void, []>(),
    }),
    renderError: (message) => ({ $tag: 'Err', $payload: message }),
    toRenderErrorMessage: (error) => `render:${String(error)}`,
  });

  return { runtime, roots, frameManagers, renderers, containers };
};

describe('runtime root runtime', () => {
  test('mounts reactive views through extracted root orchestration', () => {
    const { runtime, roots, frameManagers, renderers, containers } = createHarness();
    const renderer = { mount: jest.fn<void, [TestNode, unknown]>() };
    const container = { id: 'mount' };
    const root = runtime.mountReactiveView(renderer, container, () => ({ label: 'Ship' })) as TestReactiveRoot;

    expect(frameManagers).toHaveLength(1);
    expect(renderers[0]).toBe(renderer);
    expect(containers).toEqual([container]);
    expect(roots[0]?.update).toHaveBeenCalledWith({ label: 'Ship' });
    expect(root.root).toBe(roots[0]);
  });

  test('hydrates the first render and updates subsequent runs', async () => {
    const { runtime, roots } = createHarness();
    const value = new Signal('Hello');
    const root = runtime.hydrateReactiveView(
      { mount: jest.fn<void, [TestNode, unknown]>() },
      { id: 'hydrate' },
      () => ({ label: value.get() })
    ) as TestReactiveRoot;

    expect(roots[0]?.hydrate).toHaveBeenCalledWith({ label: 'Hello' });
    expect(roots[0]?.update).not.toHaveBeenCalled();
    value.set('Again');
    await Promise.resolve();
    expect(roots[0]?.update).toHaveBeenCalledWith({ label: 'Again' });
    expect(root.root).toBe(roots[0]);
  });

  test('returns structured errors for missing containers and render failures', () => {
    const { runtime } = createHarness();
    expect(runtime.mountReactiveView({ mount: jest.fn() }, null, () => ({ label: 'x' }))).toEqual({
      $tag: 'Err',
      $payload: 'Render container is required',
    });

    const result = runtime.mountReactiveView({ mount: jest.fn() }, {}, () => {
      throw new Error('boom');
    });
    expect(result).toEqual({ $tag: 'Err', $payload: 'render:Error: boom' });
  });
});
