import { webgpu } from '../src/lumina-runtime.js';
import { MockGpuDevice } from './helpers/webgpu-mock.js';

type Tagged = { $tag: string; $payload?: unknown };

const getTag = (value: unknown): string => (value as Tagged).$tag;
const getPayload = <T>(value: unknown): T => (value as Tagged).$payload as T;

const bufferUsage =
  webgpu.GPU_BUFFER_USAGE_STORAGE |
  webgpu.GPU_BUFFER_USAGE_COPY_DST |
  webgpu.GPU_BUFFER_USAGE_COPY_SRC;

describe('webgpu buffer runtime', () => {
  test.each([
    ['i32', [1, 2, 3, 4]],
    ['u32', [9, 7, 5]],
    ['f32', [1.5, 2.25, -3.75]],
    ['f64', [Math.PI, Math.E]],
    ['u8', [10, 20, 30, 255]],
  ])('buffer_create/write/read round-trip for %s', async (typeHint, input) => {
    const device = new MockGpuDevice();
    const bytes =
      typeHint === 'f64'
        ? input.length * 8
        : typeHint === 'u8'
          ? input.length
          : input.length * 4;

    const created = webgpu.buffer_create(device, bytes, bufferUsage);
    expect(getTag(created)).toBe('Ok');
    const handle = getPayload<number>(created);

    const wrote = webgpu.buffer_write(device, handle, input, 0, typeHint);
    expect(getTag(wrote)).toBe('Ok');

    const read = await webgpu.buffer_read(device, handle, bytes, typeHint);
    expect(getTag(read)).toBe('Ok');
    expect(getPayload<number[]>(read).slice(0, input.length)).toEqual(input);
  });

  test('buffer_destroy removes handle and subsequent writes fail', () => {
    const device = new MockGpuDevice();
    const created = webgpu.buffer_create(device, 16, bufferUsage);
    expect(getTag(created)).toBe('Ok');

    const handle = getPayload<number>(created);
    webgpu.buffer_destroy(handle);

    const wrote = webgpu.buffer_write(device, handle, [1, 2, 3], 0, 'i32');
    expect(getTag(wrote)).toBe('Err');
    expect(String(getPayload(wrote))).toContain('Unknown WebGPU buffer handle');
  });
});
