export interface RenderRootRenderer<TNode> {
  mount: (node: TNode, container: unknown) => void;
  patch?: (prev: TNode | null, next: TNode, container: unknown) => void;
  hydrate?: (node: TNode, container: unknown) => void;
  unmount?: (container: unknown) => void;
}

export interface DisposableLike {
  dispose: () => void;
}

export interface UnmountableLike {
  unmount: () => void;
}

export interface FrameRenderRootLike {
  seenEpoch: number;
}

export interface FrameRenderDriver<TFrame extends FrameRenderRootLike> {
  renderEpoch: number;
  rootFrame: TFrame;
  beginRender: () => void;
  renderFrame: <T>(frame: TFrame, renderView: () => T) => T;
}

export interface ReactiveFrameManagerLike<TFrame extends FrameRenderRootLike>
  extends FrameRenderDriver<TFrame> {
  disposeFrame: (frame: TFrame, disposeSelf: boolean) => void;
}

export interface ReactiveRenderRootHooks<TRoot> {
  onInit?: (root: TRoot) => void;
  onDispose?: (root: TRoot) => void;
}

export class RenderRoot<TNode> {
  private current: TNode | null = null;

  constructor(
    private readonly renderer: RenderRootRenderer<TNode>,
    private readonly container: unknown
  ) {}

  mount(node: TNode): void {
    this.current = node;
    this.renderer.mount(node, this.container);
  }

  hydrate(node: TNode): void {
    this.current = node;
    if (typeof this.renderer.hydrate === 'function') {
      this.renderer.hydrate(node, this.container);
      return;
    }
    this.renderer.mount(node, this.container);
  }

  update(node: TNode): void {
    if (!this.current) {
      this.mount(node);
      return;
    }
    if (typeof this.renderer.patch === 'function') {
      this.renderer.patch(this.current, node, this.container);
    } else {
      this.renderer.mount(node, this.container);
    }
    this.current = node;
  }

  unmount(): void {
    if (typeof this.renderer.unmount === 'function') {
      this.renderer.unmount(this.container);
    }
    this.current = null;
  }

  currentNode(): TNode | null {
    return this.current;
  }
}

export class ReactiveRenderRoot<
  TNode,
  TFrame extends FrameRenderRootLike,
  TFrameManager extends ReactiveFrameManagerLike<TFrame>,
> {
  constructor(
    readonly root: RenderRoot<TNode>,
    readonly effect: DisposableLike,
    readonly frameManager: TFrameManager,
    private readonly hooks?: ReactiveRenderRootHooks<ReactiveRenderRoot<TNode, TFrame, TFrameManager>>
  ) {
    this.hooks?.onInit?.(this);
  }

  dispose(): void {
    this.hooks?.onDispose?.(this);
    this.effect.dispose();
    this.frameManager.disposeFrame(this.frameManager.rootFrame, false);
    this.root.unmount();
  }
}

export const isDisposableLike = (value: unknown): value is DisposableLike =>
  !!value && typeof value === 'object' && typeof (value as { dispose?: unknown }).dispose === 'function';

export const isUnmountableLike = (value: unknown): value is UnmountableLike =>
  !!value && typeof value === 'object' && typeof (value as { unmount?: unknown }).unmount === 'function';

export const coerceRenderer = <TNode>(candidate: unknown): RenderRootRenderer<TNode> => {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Renderer must be an object with a mount function');
  }
  const renderer = candidate as RenderRootRenderer<TNode>;
  if (typeof renderer.mount !== 'function') {
    throw new Error('Renderer.mount must be a function');
  }
  if (renderer.patch && typeof renderer.patch !== 'function') {
    throw new Error('Renderer.patch must be a function when provided');
  }
  if (renderer.unmount && typeof renderer.unmount !== 'function') {
    throw new Error('Renderer.unmount must be a function when provided');
  }
  return renderer;
};

export const runWithFrameManager = <
  TFrame extends FrameRenderRootLike,
  TFrameManager extends FrameRenderDriver<TFrame>,
  T,
>(
  frameManager: TFrameManager,
  getActiveManager: () => TFrameManager | null,
  setActiveManager: (next: TFrameManager | null) => void,
  renderView: () => T
): T => {
  frameManager.beginRender();
  frameManager.rootFrame.seenEpoch = frameManager.renderEpoch;
  const previousManager = getActiveManager();
  setActiveManager(frameManager);
  try {
    return frameManager.renderFrame(frameManager.rootFrame, renderView);
  } finally {
    setActiveManager(previousManager);
  }
};
