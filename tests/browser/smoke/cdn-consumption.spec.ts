import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('Browser CDN consumption smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('loads ESM from URL and resolves bare specifier through import map', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      await page.goto(`${server.baseUrl}/cdn/harness`);

      const result = await page.evaluate(() => (window as Record<string, unknown>).__luminaCdnResult as {
        marker: string;
        value: number;
        url: string;
        integrity: string;
      });

      expect(result.marker).toBe('demo-pkg');
      expect(result.value).toBe(7);
      expect(result.url).toContain('/cdn/demo-pkg@1.0.0/index.js');

      const moduleBody = await page.request.get(result.url).then((res) => res.text());
      const expectedIntegrity = `sha256-${createHash('sha256').update(moduleBody).digest('base64')}`;
      expect(result.integrity).toBe(expectedIntegrity);
    } finally {
      await server.close();
    }
  });
});
