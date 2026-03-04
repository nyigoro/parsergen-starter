import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';
const runWebGpuSmoke = process.env.LUMINA_WEBGPU_SMOKE === '1';

test.describe('WebGPU compute smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');
  test.skip(!runWebGpuSmoke, 'Set LUMINA_WEBGPU_SMOKE=1 on a GPU-capable runner');

  test('requests adapter/device and creates a compute pipeline when available', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const result = await page.evaluate(async () => {
        const nav = navigator as Navigator & {
          gpu?: {
            requestAdapter: () => Promise<GPUAdapter | null>;
            getPreferredCanvasFormat?: () => string;
          };
        };
        if (!nav.gpu) return { available: false, ok: false };
        const adapter = await nav.gpu.requestAdapter();
        if (!adapter) return { available: true, ok: false };
        const device = await adapter.requestDevice();
        const module = device.createShaderModule({
          code: `@compute @workgroup_size(1) fn main() {}`,
        });
        device.createComputePipeline({
          layout: 'auto',
          compute: { module, entryPoint: 'main' },
        });
        return { available: true, ok: true };
      });

      test.skip(!result.available, 'WebGPU unavailable in this browser context');
      expect(result.ok).toBe(true);
    } finally {
      await server.close();
    }
  });
});
