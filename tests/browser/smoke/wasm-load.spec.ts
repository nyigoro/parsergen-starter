import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';
const hasWat2Wasm = (() => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test.describe('WASM load smoke', () => {
  test('compiles, loads, and executes a WASM main function', async ({ page }) => {
    test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');
    test.skip(!hasWat2Wasm, 'wat2wasm is required for browser wasm smoke');
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 42 }', 'utf-8').toString('base64');
      const response = await page.goto(`${server.baseUrl}/harness/wasm?source=${encodeURIComponent(source)}`);
      if (!response) {
        throw new Error('No response when loading wasm harness');
      }
      if (response.status() >= 400) {
        const body = await response.text();
        throw new Error(`Server compile error (${response.status()}): ${body}`);
      }
      await page.waitForFunction(() => Boolean((window as { __luminaSmokeResult?: unknown }).__luminaSmokeResult), undefined, {
        timeout: 25_000,
      });
      const result = await page.evaluate(() => (window as { __luminaSmokeResult?: { ret?: number | null; error?: string | null } }).__luminaSmokeResult);
      expect(result?.error ?? null).toBeNull();
      expect(result?.ret).toBe(42);
    } finally {
      await server.close();
    }
  });
});
