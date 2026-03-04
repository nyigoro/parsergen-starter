export class MockGpuBuffer {
  readonly bytes: Uint8Array;
  destroyed = false;

  constructor(size: number) {
    this.bytes = new Uint8Array(Math.max(0, Math.trunc(size)));
  }

  async mapAsync(_mode: number): Promise<void> {
    return;
  }

  getMappedRange(): ArrayBuffer {
    return this.bytes.buffer;
  }

  unmap(): void {
    // no-op for tests
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export class MockGpuPipeline {
  getBindGroupLayout(_index: number): Record<string, never> {
    return {};
  }
}

type MockBindGroup = {
  layout: unknown;
  entries: Array<{ binding: number; resource: { buffer: MockGpuBuffer } }>;
};

const asUint8 = (data: ArrayBufferLike | ArrayBufferView): Uint8Array => {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
};

export class MockGpuCommandEncoder {
  constructor(private readonly owner: MockGpuDevice) {}

  beginComputePass(): {
    setPipeline: (pipeline: unknown) => void;
    setBindGroup: (index: number, bindGroup: MockBindGroup) => void;
    dispatchWorkgroups: (_x: number, _y?: number, _z?: number) => void;
    end: () => void;
  } {
    let bindGroup: MockBindGroup | null = null;

    return {
      setPipeline: (_pipeline: unknown) => {},
      setBindGroup: (_index: number, next: MockBindGroup) => {
        bindGroup = next;
      },
      dispatchWorkgroups: (x: number) => {
        this.owner.dispatchWorkgroupsCalls.push(Math.trunc(x));
        if (!bindGroup) return;
        const input = bindGroup.entries.find((entry) => entry.binding === 0)?.resource.buffer;
        const output = bindGroup.entries.find((entry) => entry.binding === 1)?.resource.buffer;
        if (!input || !output) return;
        const length = Math.min(input.bytes.length, output.bytes.length);
        output.bytes.set(input.bytes.subarray(0, length), 0);
      },
      end: () => {},
    };
  }

  beginRenderPass(_descriptor: unknown): {
    setPipeline: (_pipeline: unknown) => void;
    setVertexBuffer: (_slot: number, _buffer: unknown) => void;
    setIndexBuffer: (_buffer: unknown, _format: 'uint16' | 'uint32') => void;
    draw: (vertexCount: number) => void;
    drawIndexed: (indexCount: number) => void;
    end: () => void;
  } {
    return {
      setPipeline: () => {},
      setVertexBuffer: () => {},
      setIndexBuffer: () => {},
      draw: (vertexCount: number) => {
        this.owner.renderDrawCalls.push({ mode: 'draw', count: Math.trunc(vertexCount) });
      },
      drawIndexed: (indexCount: number) => {
        this.owner.renderDrawCalls.push({ mode: 'drawIndexed', count: Math.trunc(indexCount) });
      },
      end: () => {},
    };
  }

  copyBufferToBuffer(
    source: MockGpuBuffer,
    sourceOffset: number,
    target: MockGpuBuffer,
    targetOffset: number,
    size: number
  ): void {
    const srcStart = Math.max(0, Math.trunc(sourceOffset));
    const dstStart = Math.max(0, Math.trunc(targetOffset));
    const count = Math.max(0, Math.trunc(size));
    target.bytes.set(source.bytes.subarray(srcStart, srcStart + count), dstStart);
  }

  finish(): Record<string, never> {
    return {};
  }
}

export class MockGpuDevice {
  readonly renderDrawCalls: Array<{ mode: 'draw' | 'drawIndexed'; count: number }> = [];
  readonly dispatchWorkgroupsCalls: number[] = [];
  submitCalls = 0;

  queue = {
    writeBuffer: (
      buffer: MockGpuBuffer,
      bufferOffset: number,
      data: ArrayBufferLike | ArrayBufferView,
      dataOffset = 0,
      size?: number
    ): void => {
      const src = asUint8(data);
      const start = Math.max(0, Math.trunc(dataOffset));
      const count = size === undefined ? src.length - start : Math.max(0, Math.trunc(size));
      const dst = Math.max(0, Math.trunc(bufferOffset));
      buffer.bytes.set(src.subarray(start, start + count), dst);
    },
    submit: (_commands: unknown[]): void => {
      this.submitCalls += 1;
    },
    onSubmittedWorkDone: async (): Promise<void> => {
      return;
    },
  };

  createShaderModule(descriptor: { code: string }): { code: string } {
    return { code: descriptor.code };
  }

  createBuffer(descriptor: { size: number; usage: number }): MockGpuBuffer {
    void descriptor.usage;
    return new MockGpuBuffer(descriptor.size);
  }

  createComputePipeline(_descriptor: unknown): MockGpuPipeline {
    return new MockGpuPipeline();
  }

  async createComputePipelineAsync(_descriptor: unknown): Promise<MockGpuPipeline> {
    return new MockGpuPipeline();
  }

  createRenderPipeline(_descriptor: unknown): MockGpuPipeline {
    return new MockGpuPipeline();
  }

  async createRenderPipelineAsync(_descriptor: unknown): Promise<MockGpuPipeline> {
    return new MockGpuPipeline();
  }

  createBindGroup(descriptor: MockBindGroup): MockBindGroup {
    return descriptor;
  }

  createCommandEncoder(): MockGpuCommandEncoder {
    return new MockGpuCommandEncoder(this);
  }
}

export class MockGpuCanvasContext {
  configured = false;

  configure(_descriptor: unknown): void {
    this.configured = true;
  }

  getCurrentTexture(): { createView: () => Record<string, never> } {
    return {
      createView: () => ({}),
    };
  }
}

export const createMockNavigator = (
  device: MockGpuDevice
): {
  gpu: {
    requestAdapter: () => Promise<{ requestDevice: () => Promise<MockGpuDevice> }>;
    getPreferredCanvasFormat: () => string;
  };
} => ({
  gpu: {
    requestAdapter: async () => ({
      requestDevice: async () => device,
    }),
    getPreferredCanvasFormat: () => 'bgra8unorm',
  },
});
