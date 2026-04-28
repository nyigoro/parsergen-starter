export interface Canvas2DLike {
  canvas?: { width?: number; height?: number };
  clearRect?: (x: number, y: number, width: number, height: number) => void;
  fillRect?: (x: number, y: number, width: number, height: number) => void;
  strokeRect?: (x: number, y: number, width: number, height: number) => void;
  beginPath?: () => void;
  arc?: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void;
  fill?: () => void;
  stroke?: () => void;
  fillText?: (text: string, x: number, y: number) => void;
  font?: string;
  fillStyle?: unknown;
  strokeStyle?: unknown;
}

export interface CanvasLike {
  getContext?: (kind: '2d') => Canvas2DLike | null;
  width?: number;
  height?: number;
}

export interface CanvasRendererOptions {
  context?: Canvas2DLike;
  clear?: boolean;
  width?: number;
  height?: number;
}

export interface TerminalSink {
  textContent?: string;
  output?: string;
  write?: (text: string) => void;
}

type TargetRenderer<TNode> = {
  mount: (node: TNode, container: unknown) => void;
  patch?: (prev: TNode | null, next: TNode, container: unknown) => void;
  hydrate?: (node: TNode, container: unknown) => void;
  unmount?: (container: unknown) => void;
};

type RenderTargetRuntimeDeps<TNode> = {
  getKind: (node: TNode) => string;
  getTag: (node: TNode) => string | undefined;
  getProps: (node: TNode) => Record<string, unknown> | undefined;
  getChildren: (node: TNode) => TNode[];
  getText: (node: TNode) => string | undefined;
  getSignalValue: (node: TNode) => unknown;
  materializeIndexListChildren: (node: TNode, tracked: boolean) => TNode[];
  materializeForListChildren: (node: TNode, tracked: boolean) => TNode[];
};

const resolveCanvasContext = (container: unknown, options?: CanvasRendererOptions): Canvas2DLike => {
  if (options?.context) return options.context;
  if (container && typeof container === 'object') {
    const maybeContext = container as Canvas2DLike;
    if (typeof maybeContext.fillText === 'function' || typeof maybeContext.fillRect === 'function') {
      return maybeContext;
    }
    const canvas = container as CanvasLike;
    if (typeof canvas.getContext === 'function') {
      const ctx = canvas.getContext('2d');
      if (ctx) return ctx;
    }
  }
  throw new Error('Canvas renderer requires a 2D context or canvas');
};

const setTerminalOutput = (container: unknown, text: string): void => {
  if (!container || typeof container !== 'object') return;
  const sink = container as TerminalSink;
  if (typeof sink.write === 'function') {
    sink.write(text);
    return;
  }
  if (typeof sink.textContent === 'string' || 'textContent' in sink) {
    sink.textContent = text;
    return;
  }
  if (typeof sink.output === 'string' || 'output' in sink) {
    sink.output = text;
    return;
  }
  sink.output = text;
};

export const createRenderTargetsRuntime = <TNode>(deps: RenderTargetRuntimeDeps<TNode>) => {
  const drawCanvasNode = (
    ctx: Canvas2DLike,
    node: TNode,
    state: { x: number; y: number; lineHeight: number }
  ): number => {
    const kind = deps.getKind(node);
    if (kind === 'text') {
      if (ctx.fillText) ctx.fillText(deps.getText(node) ?? '', state.x, state.y);
      return state.y + state.lineHeight;
    }
    if (kind === 'live_text') {
      if (ctx.fillText) ctx.fillText(String(deps.getSignalValue(node) ?? ''), state.x, state.y);
      return state.y + state.lineHeight;
    }
    if (kind === 'index_list') {
      let y = state.y;
      for (const child of deps.materializeIndexListChildren(node, false)) {
        y = drawCanvasNode(ctx, child, { ...state, y });
      }
      return y;
    }
    if (kind === 'for_list') {
      let y = state.y;
      for (const child of deps.materializeForListChildren(node, false)) {
        y = drawCanvasNode(ctx, child, { ...state, y });
      }
      return y;
    }
    if (kind === 'fragment' || kind === 'portal') {
      let y = state.y;
      for (const child of deps.getChildren(node)) {
        y = drawCanvasNode(ctx, child, { ...state, y });
      }
      return y;
    }

    const props = deps.getProps(node) ?? {};
    const tag = String(deps.getTag(node) ?? '').toLowerCase();
    if (typeof props.fill === 'string') ctx.fillStyle = props.fill;
    if (typeof props.stroke === 'string') ctx.strokeStyle = props.stroke;
    if (typeof props.font === 'string') ctx.font = props.font;

    if (tag === 'rect') {
      const x = Number(props.x ?? state.x);
      const y = Number(props.y ?? state.y);
      const width = Number(props.width ?? 50);
      const height = Number(props.height ?? 20);
      if (ctx.fillRect) ctx.fillRect(x, y, width, height);
      if (ctx.strokeRect) ctx.strokeRect(x, y, width, height);
      return Math.max(state.y + state.lineHeight, y + height + 4);
    }

    if (tag === 'circle') {
      const x = Number(props.x ?? state.x);
      const y = Number(props.y ?? state.y);
      const radius = Number(props.radius ?? 10);
      if (ctx.beginPath && ctx.arc) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (ctx.fill) ctx.fill();
        if (ctx.stroke) ctx.stroke();
      }
      return Math.max(state.y + state.lineHeight, y + radius + 4);
    }

    if (tag === 'text') {
      const value =
        typeof props.value === 'string'
          ? props.value
          : deps.getChildren(node).map((child) => deps.getText(child) ?? '').join('');
      const x = Number(props.x ?? state.x);
      const y = Number(props.y ?? state.y);
      if (ctx.fillText) ctx.fillText(value, x, y);
      return Math.max(state.y + state.lineHeight, y + state.lineHeight);
    }

    let y = state.y;
    for (const child of deps.getChildren(node)) {
      y = drawCanvasNode(ctx, child, { ...state, y });
    }
    return y;
  };

  const renderNodeToTerminalLines = (node: TNode, depth = 0): string[] => {
    const indent = '  '.repeat(depth);
    const kind = deps.getKind(node);
    if (kind === 'text') {
      return [`${indent}${deps.getText(node) ?? ''}`];
    }
    if (kind === 'live_text') {
      return [`${indent}${String(deps.getSignalValue(node) ?? '')}`];
    }
    if (kind === 'index_list') {
      return deps.materializeIndexListChildren(node, false).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    if (kind === 'for_list') {
      return deps.materializeForListChildren(node, false).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    if (kind === 'fragment' || kind === 'portal') {
      return deps.getChildren(node).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    const tag = deps.getTag(node) ?? 'div';
    const head = `${indent}<${tag}>`;
    const children = deps.getChildren(node).flatMap((child) => renderNodeToTerminalLines(child, depth + 1));
    const tail = `${indent}</${tag}>`;
    return [head, ...children, tail];
  };

  const renderToTerminal = (node: TNode): string => renderNodeToTerminalLines(node).join('\n');

  const createCanvasRenderer = (options?: CanvasRendererOptions): TargetRenderer<TNode> => {
    let context: Canvas2DLike | null = options?.context ?? null;
    return {
      mount(node: TNode, container: unknown): void {
        context = resolveCanvasContext(container, options);
        const width = Number(options?.width ?? context.canvas?.width ?? 800);
        const height = Number(options?.height ?? context.canvas?.height ?? 600);
        if (options?.clear !== false && context.clearRect) {
          context.clearRect(0, 0, width, height);
        }
        drawCanvasNode(context, node, { x: 8, y: 20, lineHeight: 20 });
      },
      patch(_prev: TNode | null, next: TNode, container: unknown): void {
        const ctx = context ?? resolveCanvasContext(container, options);
        context = ctx;
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (options?.clear !== false && ctx.clearRect) {
          ctx.clearRect(0, 0, width, height);
        }
        drawCanvasNode(ctx, next, { x: 8, y: 20, lineHeight: 20 });
      },
      unmount(container: unknown): void {
        const ctx = context ?? resolveCanvasContext(container, options);
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (ctx.clearRect) ctx.clearRect(0, 0, width, height);
        context = null;
      },
    };
  };

  const createTerminalRenderer = (): TargetRenderer<TNode> => ({
    mount(node: TNode, container: unknown): void {
      setTerminalOutput(container, renderToTerminal(node));
    },
    patch(_prev: TNode | null, next: TNode, container: unknown): void {
      setTerminalOutput(container, renderToTerminal(next));
    },
    hydrate(node: TNode, container: unknown): void {
      setTerminalOutput(container, renderToTerminal(node));
    },
    unmount(container: unknown): void {
      setTerminalOutput(container, '');
    },
  });

  return {
    createCanvasRenderer,
    createTerminalRenderer,
    renderToTerminal,
  };
};
