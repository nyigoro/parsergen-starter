import { Effect } from './reactive-core.js';
import { coerceRenderer as coerceRendererBase, type RenderRootRenderer } from './render-core.js';

interface UpdatableRenderRoot<TNode> {
  update: (node: TNode) => void;
  hydrate: (node: TNode) => void;
}

interface RootRuntimeDeps<TNode, TRenderRoot extends UpdatableRenderRoot<TNode>, TFrameManager, TReactiveRoot, TRenderError> {
  createRenderRoot: (renderer: RenderRootRenderer<TNode>, container: unknown) => TRenderRoot;
  createFrameManager: () => TFrameManager;
  runWithFrameManager: (frameManager: TFrameManager, renderView: () => TNode) => TNode;
  createReactiveRoot: (root: TRenderRoot, effect: Effect, frameManager: TFrameManager) => TReactiveRoot;
  renderError: (message: string) => TRenderError;
  toRenderErrorMessage: (error: unknown) => string;
}

export const coerceRenderer = <TNode>(candidate: unknown): RenderRootRenderer<TNode> =>
  coerceRendererBase<TNode>(candidate);

export const createRootRuntime = <
  TNode,
  TRenderRoot extends UpdatableRenderRoot<TNode>,
  TFrameManager,
  TReactiveRoot,
  TRenderError,
>(
  deps: RootRuntimeDeps<TNode, TRenderRoot, TFrameManager, TReactiveRoot, TRenderError>
) => {
  const mountReactiveView = (
    renderer: unknown,
    container: unknown,
    view: () => TNode
  ): TReactiveRoot | TRenderError => {
    if (container == null) return deps.renderError('Render container is required');
    const root = deps.createRenderRoot(coerceRendererBase<TNode>(renderer), container);
    const frameManager = deps.createFrameManager();
    try {
      const effect = new Effect(() => {
        const node = deps.runWithFrameManager(frameManager, view);
        root.update(node);
      });
      return deps.createReactiveRoot(root, effect, frameManager);
    } catch (error) {
      return deps.renderError(deps.toRenderErrorMessage(error));
    }
  };

  const hydrateReactiveView = (
    renderer: unknown,
    container: unknown,
    view: () => TNode
  ): TReactiveRoot | TRenderError => {
    if (container == null) return deps.renderError('Render container is required');
    const root = deps.createRenderRoot(coerceRendererBase<TNode>(renderer), container);
    const frameManager = deps.createFrameManager();
    let initialized = false;
    try {
      const effect = new Effect(() => {
        const node = deps.runWithFrameManager(frameManager, view);
        if (!initialized) {
          root.hydrate(node);
          initialized = true;
          return;
        }
        root.update(node);
      });
      return deps.createReactiveRoot(root, effect, frameManager);
    } catch (error) {
      return deps.renderError(deps.toRenderErrorMessage(error));
    }
  };

  return {
    coerceRenderer,
    mountReactiveView,
    hydrateReactiveView,
  };
};
