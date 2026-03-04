import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('WASM load smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('compiles, loads, and executes a WASM main function', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 42 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/wasm?source=${encodeURIComponent(source)}`);
      await page.waitForFunction(() => Boolean((window as { __luminaSmokeResult?: unknown }).__luminaSmokeResult));
      const result = await page.evaluate(() => (window as { __luminaSmokeResult?: { ret?: number | null; error?: string | null } }).__luminaSmokeResult);
      expect(result?.error ?? null).toBeNull();
      expect(result?.ret).toBe(42);
    } finally {
      await server.close();
    }
  });
});
