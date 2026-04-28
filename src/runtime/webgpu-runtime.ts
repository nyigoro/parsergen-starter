import type { LuminaEnumLike } from './value-runtime.js';

type TaggedResult = { $tag: string; $payload?: unknown };

type WebGpuResultRuntime = {
  Ok: (value: unknown) => TaggedResult;
  Err: (message: string) => TaggedResult;
};

export type WebGpuRuntimeDeps = {
  resultOk: WebGpuResultRuntime['Ok'];
  resultErr: WebGpuResultRuntime['Err'];
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
  getEnumPayload: (value: LuminaEnumLike) => unknown;
};

type WebGpuAdapterLike = {
  requestDevice: () => Promise<unknown>;
};

type WebGpuLike = {
  requestAdapter: () => Promise<WebGpuAdapterLike | null>;
  getPreferredCanvasFormat?: () => string;
};

const getWebGpu = (): WebGpuLike | null => {
  const nav = (globalThis as { navigator?: { gpu?: WebGpuLike } }).navigator;
  const gpu = nav?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return null;
  return gpu;
};

const WEBGPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const WEBGPU_MAP_MODE = {
  READ: 0x0001,
  WRITE: 0x0002,
} as const;

type GpuElementType = 'i32' | 'u32' | 'f32' | 'f64' | 'u8';

type WebGpuBufferLike = {
  mapAsync?: (mode: number) => Promise<void>;
  getMappedRange?: () => ArrayBuffer;
  unmap?: () => void;
  destroy?: () => void;
};

type WebGpuPipelineLike = {
  getBindGroupLayout?: (index: number) => unknown;
};

type WebGpuCanvasContextLike = {
  configure?: (descriptor: { device: unknown; format: string; alphaMode?: string }) => void;
  getCurrentTexture?: () => { createView: () => unknown };
};

type WebGpuDeviceLike = {
  createShaderModule: (descriptor: { code: string }) => unknown;
  createBuffer: (descriptor: { size: number; usage: number }) => WebGpuBufferLike;
  createComputePipeline?: (descriptor: {
    layout: 'auto' | unknown;
    compute: { module: unknown; entryPoint: string };
  }) => WebGpuPipelineLike;
  createComputePipelineAsync?: (descriptor: {
    layout: 'auto' | unknown;
    compute: { module: unknown; entryPoint: string };
  }) => Promise<WebGpuPipelineLike>;
  createRenderPipeline?: (descriptor: {
    layout: 'auto' | unknown;
    vertex: { module: unknown; entryPoint: string; buffers?: unknown[] };
    fragment?: { module: unknown; entryPoint: string; targets: Array<{ format: string }> };
    primitive?: { topology?: string };
    depthStencil?: unknown;
  }) => WebGpuPipelineLike;
  createRenderPipelineAsync?: (descriptor: {
    layout: 'auto' | unknown;
    vertex: { module: unknown; entryPoint: string; buffers?: unknown[] };
    fragment?: { module: unknown; entryPoint: string; targets: Array<{ format: string }> };
    primitive?: { topology?: string };
    depthStencil?: unknown;
  }) => Promise<WebGpuPipelineLike>;
  createBindGroup?: (descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: unknown } }>;
  }) => unknown;
  createCommandEncoder: () => {
    beginComputePass?: () => {
      setPipeline: (pipeline: unknown) => void;
      setBindGroup: (index: number, bindGroup: unknown) => void;
      dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
      end: () => void;
    };
    beginRenderPass?: (descriptor: {
      colorAttachments: Array<{
        view: unknown;
        clearValue: { r: number; g: number; b: number; a: number };
        loadOp: 'clear' | 'load';
        storeOp: 'store';
      }>;
      depthStencilAttachment?: unknown;
    }) => {
      setPipeline?: (pipeline: unknown) => void;
      setVertexBuffer?: (slot: number, buffer: unknown) => void;
      setIndexBuffer?: (buffer: unknown, format: 'uint16' | 'uint32') => void;
      draw?: (vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number) => void;
      drawIndexed?: (
        indexCount: number,
        instanceCount?: number,
        firstIndex?: number,
        baseVertex?: number,
        firstInstance?: number
      ) => void;
      end: () => void;
    };
    copyBufferToBuffer: (
      source: unknown,
      sourceOffset: number,
      target: unknown,
      targetOffset: number,
      size: number
    ) => void;
    finish: () => unknown;
  };
  queue: {
    writeBuffer: (
      buffer: unknown,
      bufferOffset: number,
      data: ArrayBufferLike | ArrayBufferView,
      dataOffset?: number,
      size?: number
    ) => void;
    submit: (commands: unknown[]) => void;
    onSubmittedWorkDone?: () => Promise<void>;
  };
};

type WebGpuBufferKind = 'buffer' | 'uniform' | 'vertex' | 'index';

type WebGpuBufferRecord = {
  id: number;
  kind: WebGpuBufferKind;
  device: WebGpuDeviceLike;
  buffer: WebGpuBufferLike;
  usage: number;
  size: number;
  elementType: GpuElementType;
  elementCount: number;
};

type WebGpuPipelineRecord = {
  id: number;
  device: WebGpuDeviceLike;
  pipeline: WebGpuPipelineLike;
  config: {
    vertex_buffers?: number[];
    index_buffer?: number | null;
    uniforms?: number[];
    format?: string;
    topology?: string;
  };
};

type WebGpuCanvasRecord = {
  id: number;
  canvas: unknown;
  context: WebGpuCanvasContextLike;
  format: string;
  configuredDevice: WebGpuDeviceLike | null;
  hasSubmittedFrame: boolean;
};

const normalizeElementType = (typeHint: unknown): GpuElementType => {
  const value = String(typeHint ?? 'i32').toLowerCase();
  switch (value) {
    case 'u32':
      return 'u32';
    case 'f32':
      return 'f32';
    case 'f64':
      return 'f64';
    case 'u8':
      return 'u8';
    case 'i32':
    default:
      return 'i32';
  }
};

const elementSize = (elementType: GpuElementType): number => {
  switch (elementType) {
    case 'u8':
      return 1;
    case 'f64':
      return 8;
    case 'i32':
    case 'u32':
    case 'f32':
    default:
      return 4;
  }
};

const inferElementType = (data: ArrayBufferView): GpuElementType => {
  if (data instanceof Uint8Array) return 'u8';
  if (data instanceof Uint32Array) return 'u32';
  if (data instanceof Float32Array) return 'f32';
  if (data instanceof Float64Array) return 'f64';
  return 'i32';
};

const numberArrayToView = (values: number[], elementType: GpuElementType): ArrayBufferView => {
  switch (elementType) {
    case 'u8':
      return Uint8Array.from(values.map((value) => Math.trunc(value) & 0xff));
    case 'u32':
      return Uint32Array.from(values.map((value) => Math.trunc(value) >>> 0));
    case 'f32':
      return Float32Array.from(values);
    case 'f64':
      return Float64Array.from(values);
    case 'i32':
    default:
      return Int32Array.from(values.map((value) => Math.trunc(value) | 0));
  }
};

const toTypedArray = (
  data: unknown,
  typeHint: unknown,
): { view: ArrayBufferView; elementType: GpuElementType; elementCount: number } => {
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const view = data as ArrayBufferView;
    const elementType = inferElementType(view);
    const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
    return { view, elementType, elementCount };
  }
  const elementType = normalizeElementType(typeHint);
  const source = Array.isArray(data) ? data.map((value) => Number(value)) : [];
  const view = numberArrayToView(source, elementType);
  const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
  return { view, elementType, elementCount };
};

const readTypedArray = (buffer: ArrayBuffer, elementType: GpuElementType, elementCount: number): number[] => {
  const maxCount = Math.max(0, elementCount);
  switch (elementType) {
    case 'u8':
      return Array.from(new Uint8Array(buffer).subarray(0, maxCount));
    case 'u32':
      return Array.from(new Uint32Array(buffer).subarray(0, maxCount));
    case 'f32':
      return Array.from(new Float32Array(buffer).subarray(0, maxCount));
    case 'f64':
      return Array.from(new Float64Array(buffer).subarray(0, maxCount));
    case 'i32':
    default:
      return Array.from(new Int32Array(buffer).subarray(0, maxCount));
  }
};

const resolveWebGpuDevice = (device: unknown): WebGpuDeviceLike | null => {
  if (device && typeof (device as { createBuffer?: unknown }).createBuffer === 'function') {
    return device as WebGpuDeviceLike;
  }
  return null;
};

const alignTo4 = (value: number): number => {
  const v = Math.max(4, Math.trunc(value));
  const mod = v % 4;
  return mod === 0 ? v : v + (4 - mod);
};

const hasWgslStageEntryPoint = (source: string, stage: 'compute' | 'vertex' | 'fragment', entryPoint: string): boolean => {
  const escaped = entryPoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`@${stage}[\\s\\S]*\\bfn\\s+${escaped}\\s*\\(`, 'm');
  return pattern.test(source);
};

export const createWebGpuRuntime = (
  { resultOk, resultErr, isEnumLike, getEnumTag, getEnumPayload }: WebGpuRuntimeDeps,
) => {
  let webgpuNextHandle = 1;
  const webgpuBuffers = new Map<number, WebGpuBufferRecord>();
  const webgpuPipelines = new Map<number, WebGpuPipelineRecord>();
  const webgpuCanvases = new Map<number, WebGpuCanvasRecord>();

  const newWebGpuHandle = (): number => {
    const handle = webgpuNextHandle;
    webgpuNextHandle += 1;
    return handle;
  };

  const formatError = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
  };

  const webgpu = {
    GPU_BUFFER_USAGE_STORAGE: WEBGPU_BUFFER_USAGE.STORAGE,
    GPU_BUFFER_USAGE_UNIFORM: WEBGPU_BUFFER_USAGE.UNIFORM,
    GPU_BUFFER_USAGE_VERTEX: WEBGPU_BUFFER_USAGE.VERTEX,
    GPU_BUFFER_USAGE_INDEX: WEBGPU_BUFFER_USAGE.INDEX,
    GPU_BUFFER_USAGE_COPY_SRC: WEBGPU_BUFFER_USAGE.COPY_SRC,
    GPU_BUFFER_USAGE_COPY_DST: WEBGPU_BUFFER_USAGE.COPY_DST,
    is_available: (): boolean => getWebGpu() !== null,
    request_adapter: async (): Promise<{ $tag: string; $payload?: unknown }> => {
      try {
        const gpu = getWebGpu();
        if (!gpu) return resultErr('WebGPU is not available in this environment');
        const adapter = await gpu.requestAdapter();
        if (!adapter) return resultErr('No WebGPU adapter available');
        return resultOk(adapter);
      } catch (error) {
        return resultErr(formatError(error));
      }
    },
  request_device: async (adapter: unknown): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const source = (adapter as WebGpuAdapterLike | null) ?? null;
      const resolved =
        source && typeof source.requestDevice === 'function'
          ? source
          : ((await webgpu.request_adapter()) as LuminaEnumLike);
      if (isEnumLike(resolved) && getEnumTag(resolved) === 'Err') return resolved as { $tag: string; $payload?: unknown };
      const adapterLike = (isEnumLike(resolved) ? getEnumPayload(resolved as LuminaEnumLike) : resolved) as WebGpuAdapterLike;
      if (!adapterLike || typeof adapterLike.requestDevice !== 'function') {
        return resultErr('Invalid WebGPU adapter');
      }
      const device = await adapterLike.requestDevice();
      return resultOk(device);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  buffer_create: (
    device: unknown,
    size: number,
    usage: number
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const byteSize = alignTo4(Math.max(0, Math.trunc(size)));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE,
      });
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'buffer',
        device: resolvedDevice,
        buffer,
        usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE,
        size: byteSize,
        elementType: 'i32',
        elementCount: 0,
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  buffer_write: (
    device: unknown,
    bufferHandle: number,
    data: unknown,
    offset: number = 0,
    typeHint: unknown = 'i32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return resultErr(`Unknown WebGPU buffer handle ${bufferHandle}`);
      if (resolvedDevice && entry.device !== resolvedDevice) {
        return resultErr('WebGPU buffer handle does not belong to provided device');
      }
      const typed = toTypedArray(data, typeHint);
      const byteOffset = Math.max(0, Math.trunc(offset));
      entry.device.queue.writeBuffer(entry.buffer, byteOffset, typed.view, 0, typed.view.byteLength);
      entry.elementType = typed.elementType;
      entry.elementCount = typed.elementCount;
      return resultOk(undefined);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  buffer_read: async (
    device: unknown,
    bufferHandle: number,
    size: number,
    typeHint: unknown = 'i32'
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return resultErr(`Unknown WebGPU buffer handle ${bufferHandle}`);
      if (resolvedDevice && entry.device !== resolvedDevice) {
        return resultErr('WebGPU buffer handle does not belong to provided device');
      }
      const readDevice = entry.device;
      const bytes = alignTo4(Math.max(0, Math.trunc(size)));
      const readBuffer = readDevice.createBuffer({
        size: bytes,
        usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ,
      });
      const encoder = readDevice.createCommandEncoder();
      encoder.copyBufferToBuffer(entry.buffer, 0, readBuffer, 0, bytes);
      readDevice.queue.submit([encoder.finish()]);
      if (typeof readDevice.queue.onSubmittedWorkDone === 'function') {
        await readDevice.queue.onSubmittedWorkDone();
      }
      if (typeof readBuffer.mapAsync !== 'function' || typeof readBuffer.getMappedRange !== 'function') {
        return resultErr('WebGPU readback buffer does not support mapAsync');
      }
      await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
      const mapped = readBuffer.getMappedRange();
      const elementType = normalizeElementType(typeHint ?? entry.elementType);
      const count = Math.max(0, Math.floor(bytes / elementSize(elementType)));
      const result = readTypedArray(mapped, elementType, count);
      readBuffer.unmap?.();
      readBuffer.destroy?.();
      return resultOk(result);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  buffer_destroy: (bufferHandle: number): void => {
    const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
    if (!entry) return;
    entry.buffer.destroy?.();
    webgpuBuffers.delete(Math.trunc(bufferHandle));
  },
  uniform_create: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'uniform',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  uniform_update: (
    device: unknown,
    uniformHandle: number,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    const entry = webgpuBuffers.get(Math.trunc(uniformHandle));
    if (!entry || entry.kind !== 'uniform') return resultErr(`Unknown WebGPU uniform handle ${uniformHandle}`);
    return webgpu.buffer_write(device, uniformHandle, data, 0, typeHint);
  },
  uniform_destroy: (uniformHandle: number): void => {
    webgpu.buffer_destroy(uniformHandle);
  },
  vertex_buffer: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'f32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'vertex',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  index_buffer: (
    device: unknown,
    data: unknown,
    typeHint: unknown = 'u32'
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const typed = toTypedArray(data, typeHint);
      const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
      const buffer = resolvedDevice.createBuffer({
        size: byteSize,
        usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
      const id = newWebGpuHandle();
      webgpuBuffers.set(id, {
        id,
        kind: 'index',
        device: resolvedDevice,
        buffer,
        usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST,
        size: byteSize,
        elementType: typed.elementType,
        elementCount: typed.elementCount,
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  vertex_buffer_destroy: (handle: number): void => {
    webgpu.buffer_destroy(handle);
  },
  index_buffer_destroy: (handle: number): void => {
    webgpu.buffer_destroy(handle);
  },
  canvas: (selector: string): { $tag: string; $payload?: unknown } => {
    try {
      const documentRef = (globalThis as { document?: { querySelector?: (query: string) => unknown } }).document;
      if (!documentRef || typeof documentRef.querySelector !== 'function') {
        return resultErr('DOM is not available in this environment');
      }
      const canvas = documentRef.querySelector(String(selector));
      if (!canvas || typeof (canvas as { getContext?: unknown }).getContext !== 'function') {
        return resultErr(`Canvas not found for selector '${selector}'`);
      }
      const context = (canvas as { getContext: (name: string) => WebGpuCanvasContextLike | null }).getContext('webgpu');
      if (!context) {
        return resultErr('Canvas does not support WebGPU context');
      }
      const format = getWebGpu()?.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
      const id = newWebGpuHandle();
      webgpuCanvases.set(id, {
        id,
        canvas,
        context,
        format,
        configuredDevice: null,
        hasSubmittedFrame: false,
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  canvas_destroy: (canvasHandle: number): void => {
    webgpuCanvases.delete(Math.trunc(canvasHandle));
  },
  present: (
    device: unknown,
    canvasHandle: number,
    _pipelineHandle?: number | null
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const canvasEntry = webgpuCanvases.get(Math.trunc(canvasHandle));
      if (!canvasEntry) return resultErr(`Unknown WebGPU canvas handle ${canvasHandle}`);
      if (!canvasEntry.hasSubmittedFrame) {
        return resultErr('No submitted render frame available for present');
      }
      if (typeof canvasEntry.context.configure === 'function' && canvasEntry.configuredDevice !== resolvedDevice) {
        canvasEntry.context.configure({
          device: resolvedDevice,
          format: canvasEntry.format,
          alphaMode: 'opaque',
        });
        canvasEntry.configuredDevice = resolvedDevice;
      }
      canvasEntry.hasSubmittedFrame = false;
      return resultOk(undefined);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  render_pipeline: async (
    device: unknown,
    config: {
      vertex_shader?: string;
      fragment_shader?: string;
      vertex_buffers?: number[];
      index_buffer?: number | null;
      uniforms?: number[];
      vertex_layout?: Array<{ attribute: number; format: string; offset: number; stride: number }>;
      format?: string;
      topology?: string;
    }
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const vertexShader = String(config?.vertex_shader ?? '');
      const fragmentShader = String(config?.fragment_shader ?? '');
      if (!vertexShader || !fragmentShader) return resultErr('Render pipeline requires vertex and fragment shaders');
      if (!hasWgslStageEntryPoint(vertexShader, 'vertex', 'main')) {
        return resultErr('Invalid WGSL vertex shader: expected @vertex fn main(...)');
      }
      if (!hasWgslStageEntryPoint(fragmentShader, 'fragment', 'main')) {
        return resultErr('Invalid WGSL fragment shader: expected @fragment fn main(...)');
      }
      const vertexModule = resolvedDevice.createShaderModule({ code: vertexShader });
      const fragmentModule = resolvedDevice.createShaderModule({ code: fragmentShader });
      const vertexLayouts = Array.isArray(config?.vertex_layout) ? config.vertex_layout : [];
      const buffers = vertexLayouts.length
        ? vertexLayouts.map((layout) => ({
            arrayStride: Math.max(0, Math.trunc(layout.stride)),
            attributes: [
              {
                shaderLocation: Math.max(0, Math.trunc(layout.attribute)),
                offset: Math.max(0, Math.trunc(layout.offset)),
                format: String(layout.format ?? 'float32x4'),
              },
            ],
          }))
        : [];
      const descriptor = {
        layout: 'auto' as const,
        vertex: { module: vertexModule, entryPoint: 'main', buffers },
        fragment: {
          module: fragmentModule,
          entryPoint: 'main',
          targets: [{ format: String(config?.format ?? 'bgra8unorm') }],
        },
        primitive: {
          topology: String(config?.topology ?? 'triangle-list'),
        },
      };
      const pipeline = resolvedDevice.createRenderPipelineAsync
        ? await resolvedDevice.createRenderPipelineAsync(descriptor)
        : resolvedDevice.createRenderPipeline?.(descriptor);
      if (!pipeline) return resultErr('WebGPU device does not support render pipelines');
      const id = newWebGpuHandle();
      webgpuPipelines.set(id, {
        id,
        device: resolvedDevice,
        pipeline,
        config: {
          vertex_buffers: Array.isArray(config?.vertex_buffers) ? config.vertex_buffers.map((v) => Math.trunc(v)) : [],
          index_buffer: config?.index_buffer == null ? null : Math.trunc(config.index_buffer),
          uniforms: Array.isArray(config?.uniforms) ? config.uniforms.map((v) => Math.trunc(v)) : [],
          format: config?.format ? String(config.format) : undefined,
          topology: config?.topology ? String(config.topology) : undefined,
        },
      });
      return resultOk(id);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  render_pipeline_destroy: (pipelineHandle: number): void => {
    webgpuPipelines.delete(Math.trunc(pipelineHandle));
  },
  render_frame: (
    device: unknown,
    pipelineHandle: number,
    config: { canvas: number; clear_color?: [number, number, number, number]; draw_count?: number; indexed?: boolean }
  ): { $tag: string; $payload?: unknown } => {
    try {
      const resolvedDevice = resolveWebGpuDevice(device);
      if (!resolvedDevice) return resultErr('Invalid WebGPU device');
      const pipelineEntry = webgpuPipelines.get(Math.trunc(pipelineHandle));
      if (!pipelineEntry) return resultErr(`Unknown WebGPU pipeline handle ${pipelineHandle}`);
      const canvasEntry = webgpuCanvases.get(Math.trunc(config?.canvas));
      if (!canvasEntry) return resultErr(`Unknown WebGPU canvas handle ${config?.canvas}`);
      if (typeof canvasEntry.context.configure === 'function' && canvasEntry.configuredDevice !== resolvedDevice) {
        canvasEntry.context.configure({
          device: resolvedDevice,
          format: canvasEntry.format,
          alphaMode: 'opaque',
        });
        canvasEntry.configuredDevice = resolvedDevice;
      }
      const currentTexture = canvasEntry.context.getCurrentTexture?.();
      if (!currentTexture || typeof currentTexture.createView !== 'function') {
        return resultErr('Canvas context does not provide current texture');
      }
      const encoder = resolvedDevice.createCommandEncoder();
      const pass = encoder.beginRenderPass?.({
        colorAttachments: [
          {
            view: currentTexture.createView(),
            clearValue: {
              r: Number(config?.clear_color?.[0] ?? 0),
              g: Number(config?.clear_color?.[1] ?? 0),
              b: Number(config?.clear_color?.[2] ?? 0),
              a: Number(config?.clear_color?.[3] ?? 1),
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      if (!pass) return resultErr('WebGPU command encoder does not support render passes');
      pass.setPipeline?.(pipelineEntry.pipeline);
      for (const [slot, bufferHandle] of (pipelineEntry.config.vertex_buffers ?? []).entries()) {
        const bufferEntry = webgpuBuffers.get(Math.trunc(bufferHandle));
        if (!bufferEntry) return resultErr(`Unknown WebGPU vertex buffer handle ${bufferHandle}`);
        pass.setVertexBuffer?.(slot, bufferEntry.buffer);
      }
      for (const uniformHandle of pipelineEntry.config.uniforms ?? []) {
        const uniformEntry = webgpuBuffers.get(Math.trunc(uniformHandle));
        if (!uniformEntry || uniformEntry.kind !== 'uniform') {
          return resultErr(`Unknown WebGPU uniform handle ${uniformHandle}`);
        }
      }
      const indexHandle = pipelineEntry.config.index_buffer;
      const shouldIndexed = !!config?.indexed || (indexHandle !== null && indexHandle !== undefined);
      const drawCount = Math.max(0, Math.trunc(config?.draw_count ?? 0));
      if (shouldIndexed && indexHandle !== null && indexHandle !== undefined) {
        const indexEntry = webgpuBuffers.get(Math.trunc(indexHandle));
        if (!indexEntry) return resultErr(`Unknown WebGPU index buffer handle ${indexHandle}`);
        pass.setIndexBuffer?.(indexEntry.buffer, 'uint32');
        pass.drawIndexed?.(drawCount || indexEntry.elementCount || 0, 1, 0, 0, 0);
      } else {
        pass.draw?.(drawCount, 1, 0, 0);
      }
      pass.end();
      resolvedDevice.queue.submit([encoder.finish()]);
      canvasEntry.hasSubmittedFrame = true;
      return webgpu.present(resolvedDevice, canvasEntry.id, pipelineHandle);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  compute: async (
    wgsl: string,
    entryPoint: string,
    input: unknown,
    outputLength?: number,
    workgroupSize: number = 64,
    typeHint: unknown = 'i32'
  ): Promise<{ $tag: string; $payload?: unknown }> => {
    try {
      const deviceResult = await webgpu.request_device(null);
      if (isEnumLike(deviceResult) && getEnumTag(deviceResult) === 'Err') return deviceResult;
      const device = getEnumPayload(deviceResult as LuminaEnumLike) as WebGpuDeviceLike;

      const typedInput = toTypedArray(input, typeHint);
      const outLen = Math.max(0, Math.trunc(outputLength ?? typedInput.elementCount));
      const inputType = normalizeElementType(typeHint ?? typedInput.elementType);
      const inBytes = alignTo4(Math.max(typedInput.view.byteLength, 4));
      const outBytes = alignTo4(outLen * elementSize(inputType));
      const safeWorkgroupSize = Math.max(1, Math.trunc(workgroupSize));
      const dispatchCount = Math.max(1, Math.ceil(outLen / safeWorkgroupSize));

      const shaderSource = String(wgsl);
      if (!hasWgslStageEntryPoint(shaderSource, 'compute', String(entryPoint))) {
        return resultErr(`Invalid WGSL compute shader: expected @compute fn ${String(entryPoint)}(...)`);
      }
      const shaderModule = device.createShaderModule({ code: shaderSource });
      const inputBuffer = device.createBuffer({
        size: inBytes,
        usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_DST,
      });
      const outputBuffer = device.createBuffer({
        size: outBytes,
        usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_SRC,
      });
      const readBuffer = device.createBuffer({
        size: outBytes,
        usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ,
      });

      device.queue.writeBuffer(inputBuffer, 0, typedInput.view, 0, typedInput.view.byteLength);
      const pipeline = device.createComputePipelineAsync
        ? await device.createComputePipelineAsync({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: String(entryPoint) },
          })
        : device.createComputePipeline!({
            layout: 'auto',
            compute: { module: shaderModule, entryPoint: String(entryPoint) },
          });

      const bindGroup = device.createBindGroup!({
        layout: (pipeline as { getBindGroupLayout: (index: number) => unknown }).getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass!();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(dispatchCount, 1, 1);
      pass.end();
      encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outBytes);
      device.queue.submit([encoder.finish()]);
      if (typeof device.queue.onSubmittedWorkDone === 'function') {
        await device.queue.onSubmittedWorkDone();
      }
      if (typeof readBuffer.mapAsync !== 'function' || typeof readBuffer.getMappedRange !== 'function') {
        return resultErr('WebGPU readback buffer does not support mapAsync');
      }
      await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
      const mapped = readBuffer.getMappedRange();
      const result = readTypedArray(mapped, inputType, outLen);
      readBuffer.unmap?.();
      inputBuffer.destroy?.();
      outputBuffer.destroy?.();
      readBuffer.destroy?.();
      return resultOk(result);
    } catch (error) {
      return resultErr(formatError(error));
    }
  },
  compute_i32: async (
    wgsl: string,
    entryPoint: string,
    input: number[],
    outputLength?: number,
    workgroupSize: number = 64
  ): Promise<{ $tag: string; $payload?: unknown }> =>
    webgpu.compute(wgsl, entryPoint, input, outputLength, workgroupSize, 'i32'),
  __debug_counts: (): { buffers: number; pipelines: number; canvases: number } => ({
    buffers: webgpuBuffers.size,
    pipelines: webgpuPipelines.size,
    canvases: webgpuCanvases.size,
  }),
};

  return webgpu;
};

export type WebGpuRuntime = ReturnType<typeof createWebGpuRuntime>;
