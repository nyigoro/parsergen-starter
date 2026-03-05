import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('Browser CDN consumption smoke', () => {
  test('loads ESM from URL and resolves bare specifier through import map', async ({ page }) => {
    test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');
    const server = await startSmokeServer();
    try {
      const response = await page.goto(`${server.baseUrl}/cdn/harness`);
      if (!response) {
        throw new Error('No response when loading CDN harness');
      }
      if (response.status() >= 400) {
        const body = await response.text();
        throw new Error(`CDN harness load failed (${response.status()}): ${body}`);
      }
      const supportsImportMap = await page.evaluate(
        () =>
          typeof HTMLScriptElement !== 'undefined' &&
          typeof (HTMLScriptElement as { supports?: (feature: string) => boolean }).supports === 'function' &&
          Boolean((HTMLScriptElement as { supports?: (feature: string) => boolean }).supports?.('importmap'))
      );
      test.skip(!supportsImportMap, 'Import maps are not supported in this browser context');
      await page.waitForFunction(
        () =>
          Boolean((window as Record<string, unknown>).__luminaCdnResult) ||
          typeof (window as Record<string, unknown>).__luminaCdnError === 'string'
      );

      const state = await page.evaluate(() => ({
        result: (window as Record<string, unknown>).__luminaCdnResult as
          | {
              marker: string;
              value: number;
              url: string;
              integrity: string;
            }
          | null,
        error: (window as Record<string, unknown>).__luminaCdnError as string | null,
      }));
      expect(state.error).toBeNull();
      const result = state.result;
      expect(result).toBeTruthy();
      if (!result) return;

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
