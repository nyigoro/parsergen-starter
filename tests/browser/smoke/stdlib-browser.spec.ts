import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('Browser stdlib smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('covers crypto/time/fetch primitives in browser context', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const result = await page.evaluate(async () => {
        const nowA = Date.now();
        const nowB = Date.now();
        const encoder = new TextEncoder();
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode('lumina'));
        const response = await fetch('/health');
        const health = await response.json();
        return {
          monotonic: nowB >= nowA,
          digestBytes: digest.byteLength,
          healthOk: Boolean((health as { ok?: unknown }).ok),
        };
      });

      expect(result.monotonic).toBe(true);
      expect(result.digestBytes).toBe(32);
      expect(result.healthOk).toBe(true);
    } finally {
      await server.close();
    }
  });
});
