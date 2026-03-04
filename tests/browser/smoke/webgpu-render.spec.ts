import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('WebGPU render smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('configures canvas context and submits a simple render pass when available', async ({ page }) => {
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
        return { available: true, ok: true };
      });

      test.skip(!result.available, 'WebGPU unavailable in this browser context');
      expect(result.ok).toBe(true);
    } finally {
      await server.close();
    }
  });
});
