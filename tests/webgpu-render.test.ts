import { webgpu } from '../src/lumina-runtime.js';
import { createMockNavigator, MockGpuCanvasContext, MockGpuDevice } from './helpers/webgpu-mock.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string => (value as Tagged).$tag;
const getPayload = <T>(value: unknown): T => (value as Tagged).$payload as T;

const vertexShader = `
@vertex
fn main(@location(0) pos: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(pos.x, pos.y, 0.0, 1.0);
}
`;

const fragmentShader = `
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(0.2, 0.4, 0.8, 1.0);
}
`;

describe('webgpu render runtime', () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousNavigator = (globalThis as { navigator?: unknown }).navigator;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = previousDocument;
    (globalThis as { navigator?: unknown }).navigator = previousNavigator;
  });

  test('canvas handle resolves by selector', () => {
    const context = new MockGpuCanvasContext();
    (globalThis as { document?: unknown }).document = {
      querySelector: (selector: string) =>
        selector === '#app'
          ? {
              getContext: (name: string) => (name === 'webgpu' ? context : null),
            }
          : null,
    };

    const canvasResult = webgpu.canvas('#app');
    expect(getTag(canvasResult)).toBe('Ok');
  });

  test('render_pipeline + render_frame submit draw commands', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const context = new MockGpuCanvasContext();
    (globalThis as { document?: unknown }).document = {
      querySelector: (selector: string) =>
        selector === '#app'
          ? {
              getContext: (name: string) => (name === 'webgpu' ? context : null),
            }
          : null,
    };

    const canvasResult = webgpu.canvas('#app');
    expect(getTag(canvasResult)).toBe('Ok');
    const canvas = getPayload<number>(canvasResult);

    const vertexBuffer = webgpu.vertex_buffer(device, [0, 0, 1, 0, 0, 1], 'f32');
    expect(getTag(vertexBuffer)).toBe('Ok');
    const indexBuffer = webgpu.index_buffer(device, [0, 1, 2], 'u32');
    expect(getTag(indexBuffer)).toBe('Ok');

    const pipelineResult = await webgpu.render_pipeline(device, {
      vertex_shader: vertexShader,
      fragment_shader: fragmentShader,
      vertex_buffers: [getPayload<number>(vertexBuffer)],
      index_buffer: getPayload<number>(indexBuffer),
      vertex_layout: [{ attribute: 0, format: 'float32x2', offset: 0, stride: 8 }],
      format: 'bgra8unorm',
      topology: 'triangle-list',
    });

    expect(getTag(pipelineResult)).toBe('Ok');
    const pipeline = getPayload<number>(pipelineResult);

    const frameResult = webgpu.render_frame(device, pipeline, {
      canvas,
      clear_color: [0, 0, 0, 1],
      draw_count: 3,
      indexed: true,
    });

    expect(getTag(frameResult)).toBe('Ok');
    expect(device.submitCalls).toBeGreaterThan(0);
    expect(device.renderDrawCalls).toContainEqual({ mode: 'drawIndexed', count: 3 });
    expect(context.configured).toBe(true);
  });
});
