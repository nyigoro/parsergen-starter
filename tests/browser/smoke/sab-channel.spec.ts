import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('SAB channel smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('round-trips an i32 over SharedArrayBuffer through a worker', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const hasSab = await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined');
      test.skip(!hasSab, 'SharedArrayBuffer unavailable in this browser context');

      const value = await page.evaluate(async () => {
        const sab = new SharedArrayBuffer(4);
        const view = new Int32Array(sab);
        view[0] = 0;
        const workerCode = `onmessage = (event) => {
          const arr = new Int32Array(event.data);
          arr[0] = 99;
          postMessage(arr[0]);
        };`;
        const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
        const worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        const next = await new Promise<number>((resolve) => {
          worker.onmessage = (event) => resolve(Number(event.data));
          worker.postMessage(sab);
        });
        worker.terminate();
        return { workerValue: next, atomicValue: Atomics.load(view, 0) };
      });

      expect(value.workerValue).toBe(99);
      expect(value.atomicValue).toBe(99);
    } finally {
      await server.close();
    }
  });
});
