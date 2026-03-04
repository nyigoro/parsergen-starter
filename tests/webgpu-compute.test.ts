import { webgpu } from '../src/lumina-runtime.js';
import { createMockNavigator, MockGpuDevice } from './helpers/webgpu-mock.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string => (value as Tagged).$tag;
const getPayload = <T>(value: unknown): T => (value as Tagged).$payload as T;

const shader = `
@group(0) @binding(0) var<storage, read> input_data: array<i32>;
@group(0) @binding(1) var<storage, read_write> output_data: array<i32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  output_data[i] = input_data[i];
}
`;

describe('webgpu compute runtime', () => {
  const previousNavigator = (globalThis as { navigator?: unknown }).navigator;

  afterEach(() => {
    (globalThis as { navigator?: unknown }).navigator = previousNavigator;
  });

  test('compute<f32> returns typed output', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const result = await webgpu.compute(shader, 'main', [1.5, 2.5, 3.5], 3, 64, 'f32');
    expect(getTag(result)).toBe('Ok');
    expect(getPayload<number[]>(result)).toEqual([1.5, 2.5, 3.5]);
  });

  test('compute<u32> returns typed output', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const result = await webgpu.compute(shader, 'main', [1, 4, 9, 16], 4, 64, 'u32');
    expect(getTag(result)).toBe('Ok');
    expect(getPayload<number[]>(result)).toEqual([1, 4, 9, 16]);
  });

  test('compute_i32 remains backward-compatible alias', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const result = await webgpu.compute_i32(shader, 'main', [3, 6, 9], 3, 64);
    expect(getTag(result)).toBe('Ok');
    expect(getPayload<number[]>(result)).toEqual([3, 6, 9]);
  });

  test('workgroup size affects dispatch count', async () => {
    const device = new MockGpuDevice();
    (globalThis as { navigator?: unknown }).navigator = createMockNavigator(device);

    const result = await webgpu.compute(shader, 'main', [1, 2, 3, 4, 5], 5, 2, 'i32');
    expect(getTag(result)).toBe('Ok');
    expect(device.dispatchWorkgroupsCalls.at(-1)).toBe(3);
  });
});
