import { webgpu } from '../src/lumina-runtime.js';
import { compileShaderDsl, parseShaderDsl } from '../src/lumina/wgsl-compiler.js';
import { createMockNavigator, MockGpuCanvasContext, MockGpuDevice } from './helpers/webgpu-mock.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string => (value as Tagged).$tag;
const getPayload = <T>(value: unknown): T => (value as Tagged).$payload as T;

const bufferUsage =
  webgpu.GPU_BUFFER_USAGE_STORAGE |
  webgpu.GPU_BUFFER_USAGE_COPY_DST |
  webgpu.GPU_BUFFER_USAGE_COPY_SRC;

const validVertexShader = `
@vertex
fn main(@location(0) pos: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(pos.x, pos.y, 0.0, 1.0);
}
`;

const validFragmentShader = `
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(0.8, 0.1, 0.2, 1.0);
}
`;

describe('webgpu hardening', () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousNavigator = (globalThis as { navigator?: unknown }).navigator;

  const installCanvas = (selector: string = '#app'): number => {
    const context = new MockGpuCanvasContext();
    (globalThis as { document?: unknown }).document = {
      querySelector: (query: string) =>
        query === selector
          ? {
              getContext: (name: string) => (name === 'webgpu' ? context : null),
            }
          : null,
    };
    const result = webgpu.canvas(selector);
    expect(getTag(result)).toBe('Ok');
    return getPayload<number>(result);
  };

  afterEach(() => {
    (globalThis as { document?: unknown }).document = previousDocument;
    (globalThis as { navigator?: unknown }).navigator = previousNavigator;
  });

  test('uniform lifecycle handles stale updates as Err', () => {
    const device = new MockGpuDevice();
    const before = webgpu.__debug_counts().buffers;
    const created = webgpu.uniform_create(device, [1, 2, 3, 4], 'f32');
    expect(getTag(created)).toBe('Ok');
    const uniformHandle = getPayload<number>(created);

    const updated = webgpu.uniform_update(device, uniformHandle, [5, 6, 7, 8], 'f32');
    expect(getTag(updated)).toBe('Ok');

    webgpu.uniform_destroy(uniformHandle);
    expect(webgpu.__debug_counts().buffers).toBe(before);

    const stale = webgpu.uniform_update(device, uniformHandle, [1], 'f32');
    expect(getTag(stale)).toBe('Err');
    expect(String(getPayload(stale))).toContain('Unknown WebGPU uniform handle');
  });

  test('vertex/index destroy cleanup and stale usage returns Err', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);
    const canvasHandle = installCanvas('#mesh');
    const before = webgpu.__debug_counts().buffers;

    const vb = webgpu.vertex_buffer(device, [0, 0, 1, 0, 0, 1], 'f32');
    const ib = webgpu.index_buffer(device, [0, 1, 2], 'u32');
    expect(getTag(vb)).toBe('Ok');
    expect(getTag(ib)).toBe('Ok');
    const vbHandle = getPayload<number>(vb);
    const ibHandle = getPayload<number>(ib);

    const pipelineResult = await webgpu.render_pipeline(device, {
      vertex_shader: validVertexShader,
      fragment_shader: validFragmentShader,
      vertex_buffers: [vbHandle],
      index_buffer: ibHandle,
      vertex_layout: [{ attribute: 0, format: 'float32x2', offset: 0, stride: 8 }],
      format: 'bgra8unorm',
      topology: 'triangle-list',
    });
    expect(getTag(pipelineResult)).toBe('Ok');
    const pipeline = getPayload<number>(pipelineResult);

    webgpu.vertex_buffer_destroy(vbHandle);
    webgpu.index_buffer_destroy(ibHandle);
    expect(webgpu.__debug_counts().buffers).toBe(before);

    const frame = webgpu.render_frame(device, pipeline, {
      canvas: canvasHandle,
      clear_color: [0, 0, 0, 1],
      draw_count: 3,
      indexed: true,
    });
    expect(getTag(frame)).toBe('Err');
    expect(String(getPayload(frame))).toContain('Unknown WebGPU vertex buffer handle');

    webgpu.render_pipeline_destroy(pipeline);
    webgpu.canvas_destroy(canvasHandle);
  });

  test('error paths return Err instead of throwing', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);
    installCanvas('#err');

    const invalidSelector = webgpu.canvas('#missing');
    expect(getTag(invalidSelector)).toBe('Err');

    const invalidPipeline = await webgpu.render_pipeline(device, {
      vertex_shader: 'fn nope() {}',
      fragment_shader: validFragmentShader,
    });
    expect(getTag(invalidPipeline)).toBe('Err');

    const stalePipeline = webgpu.render_frame(device, 999999, {
      canvas: 1,
      draw_count: 1,
    });
    expect(getTag(stalePipeline)).toBe('Err');

    const staleCanvasPresent = webgpu.present(device, 999999, 0);
    expect(getTag(staleCanvasPresent)).toBe('Err');

    const created = webgpu.buffer_create(device, 16, bufferUsage);
    expect(getTag(created)).toBe('Ok');
    const handle = getPayload<number>(created);
    webgpu.buffer_destroy(handle);
    const staleWrite = webgpu.buffer_write(device, handle, [1, 2, 3], 0, 'i32');
    expect(getTag(staleWrite)).toBe('Err');
  });

  test('handle leak checks for buffer/uniform/pipeline maps', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);
    const baseline = webgpu.__debug_counts();

    const buffers: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const created = webgpu.buffer_create(device, 32, bufferUsage);
      expect(getTag(created)).toBe('Ok');
      buffers.push(getPayload<number>(created));
    }
    for (const handle of buffers) webgpu.buffer_destroy(handle);
    expect(webgpu.__debug_counts().buffers).toBe(baseline.buffers);

    const uniforms: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const created = webgpu.uniform_create(device, [i, i + 1], 'f32');
      expect(getTag(created)).toBe('Ok');
      uniforms.push(getPayload<number>(created));
    }
    for (const handle of uniforms) webgpu.uniform_destroy(handle);
    expect(webgpu.__debug_counts().buffers).toBe(baseline.buffers);

    const pipelines: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const created = await webgpu.render_pipeline(device, {
        vertex_shader: validVertexShader,
        fragment_shader: validFragmentShader,
      });
      expect(getTag(created)).toBe('Ok');
      pipelines.push(getPayload<number>(created));
    }
    for (const handle of pipelines) webgpu.render_pipeline_destroy(handle);
    expect(webgpu.__debug_counts().pipelines).toBe(baseline.pipelines);
  });

  test('stress: repeated buffer and pipeline lifecycle does not grow maps', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);
    const baseline = webgpu.__debug_counts();

    for (let i = 0; i < 200; i += 1) {
      const created = webgpu.buffer_create(device, 16, bufferUsage);
      expect(getTag(created)).toBe('Ok');
      const handle = getPayload<number>(created);
      expect(getTag(webgpu.buffer_write(device, handle, [i, i + 1], 0, 'i32'))).toBe('Ok');
      const read = await webgpu.buffer_read(device, handle, 16, 'i32');
      expect(getTag(read)).toBe('Ok');
      webgpu.buffer_destroy(handle);
    }

    for (let i = 0; i < 50; i += 1) {
      const created = await webgpu.render_pipeline(device, {
        vertex_shader: validVertexShader,
        fragment_shader: validFragmentShader,
      });
      expect(getTag(created)).toBe('Ok');
      webgpu.render_pipeline_destroy(getPayload<number>(created));
    }

    expect(webgpu.__debug_counts()).toEqual(baseline);
  });

  test('WGSL structural validation + invalid builtin diagnostics', () => {
    const compute = compileShaderDsl(`
shader compute main(id: vec3<u32> @builtin(global_invocation_id)) @workgroup_size(64) {
  let i = id.x;
}
`);
    expect(compute.ok).toBe(true);
    expect(compute.wgsl).toContain('@compute');
    expect(compute.wgsl).toContain('fn main(');

    const vertex = compileShaderDsl(`
shader vertex vs_main(pos: vec3<f32> @location(0)) -> vec4<f32> @builtin(position) {
  return vec4<f32>(pos.x, pos.y, pos.z, 1.0);
}
`);
    expect(vertex.ok).toBe(true);
    expect(vertex.wgsl).toContain('@vertex');
    expect(vertex.wgsl).toContain('@builtin(position)');

    const fragment = compileShaderDsl(`
shader fragment fs_main(color: vec4<f32> @location(0)) -> vec4<f32> @builtin(target(0)) {
  return color;
}
`);
    expect(fragment.ok).toBe(true);
    expect(fragment.wgsl).toContain('@fragment');

    const invalid = parseShaderDsl(`
shader vertex bad(pos: vec3<f32> @location(0)) -> vec4<f32> @location(0) {
  return vec4<f32>(pos.x, pos.y, pos.z, 1.0);
}
`);
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics.join('\n')).toContain('@builtin(position)');
  });
});
