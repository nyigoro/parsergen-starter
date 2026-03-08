import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';
const runWebGpuSmoke = process.env.LUMINA_WEBGPU_SMOKE === '1';

test.describe('WebGPU render smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');
  test.skip(
    !runWebGpuSmoke,
    'WebGPU smoke is skipped in standard CI (no GPU runner). ' +
      'To run locally: set LUMINA_BROWSER_SMOKE=1 LUMINA_WEBGPU_SMOKE=1 and use npm run test:webgpu. ' +
      'See docs/WEBGPU_TESTING.md for prerequisites and setup.'
  );

  test('performs GPU buffer round-trip and renders a non-background center pixel', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const result = await page.evaluate(async () => {
        const nav = navigator as Navigator & {
          gpu?: {
            requestAdapter: () => Promise<GPUAdapter | null>;
            getPreferredCanvasFormat: () => string;
          };
        };
        if (!nav.gpu) return { available: false, ok: false };
        const adapter = await nav.gpu.requestAdapter();
        if (!adapter) return { available: true, ok: false };
        const device = await adapter.requestDevice();
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        document.body.appendChild(canvas);
        const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (!context) return { available: true, ok: false };
        const format = nav.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: 'opaque' });

        const GPU_BUFFER_USAGE_COPY_SRC = 0x04;
        const GPU_BUFFER_USAGE_COPY_DST = 0x08;
        const GPU_BUFFER_USAGE_MAP_READ = 0x0001;
        const srcBuffer = device.createBuffer({
          size: 12,
          usage: GPU_BUFFER_USAGE_COPY_SRC | GPU_BUFFER_USAGE_COPY_DST,
        });
        const dstBuffer = device.createBuffer({
          size: 12,
          usage: GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_MAP_READ,
        });
        const input = new Uint32Array([7, 11, 13]);
        device.queue.writeBuffer(srcBuffer, 0, input);
        const copyEncoder = device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(srcBuffer, 0, dstBuffer, 0, 12);
        device.queue.submit([copyEncoder.finish()]);
        await dstBuffer.mapAsync(0x0001);
        const copied = Array.from(new Uint32Array(dstBuffer.getMappedRange().slice(0)));
        dstBuffer.unmap();
        srcBuffer.destroy();
        dstBuffer.destroy();
        const bufferRoundTrip = copied[0] === 7 && copied[1] === 11 && copied[2] === 13;

        const shader = device.createShaderModule({
          code: `
            @vertex fn vs_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
              var pos = array<vec2<f32>, 3>(
                vec2<f32>(0.0, 0.5),
                vec2<f32>(-0.5, -0.5),
                vec2<f32>(0.5, -0.5)
              );
              return vec4<f32>(pos[idx], 0.0, 1.0);
            }
            @fragment fn fs_main() -> @location(0) vec4<f32> {
              return vec4<f32>(1.0, 0.0, 0.0, 1.0);
            }
          `,
        });

        const pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module: shader, entryPoint: 'vs_main' },
          fragment: { module: shader, entryPoint: 'fs_main', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        });

        const encoder = device.createCommandEncoder();
        const view = context.getCurrentTexture().createView();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.draw(3, 1, 0, 0);
        pass.end();
        device.queue.submit([encoder.finish()]);

        if (typeof device.queue.onSubmittedWorkDone === 'function') {
          await device.queue.onSubmittedWorkDone();
        }

        let sampleSupported = false;
        let centerChanged = false;
        try {
          if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(canvas);
            const sampleCanvas = document.createElement('canvas');
            sampleCanvas.width = canvas.width;
            sampleCanvas.height = canvas.height;
            const ctx2d = sampleCanvas.getContext('2d');
            if (ctx2d) {
              ctx2d.drawImage(bitmap, 0, 0);
              const data = ctx2d.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
              sampleSupported = true;
              centerChanged = data[0] !== 0 || data[1] !== 0 || data[2] !== 0;
            }
          }
        } catch {
          sampleSupported = false;
        }

        return { available: true, ok: true, bufferRoundTrip, sampleSupported, centerChanged };
      });

      test.skip(!result.available, 'WebGPU unavailable in this browser context');
      expect(result.ok).toBe(true);
      expect(result.bufferRoundTrip).toBe(true);
      if (result.sampleSupported) {
        expect(result.centerChanged).toBe(true);
      }
    } finally {
      await server.close();
    }
  });
});
