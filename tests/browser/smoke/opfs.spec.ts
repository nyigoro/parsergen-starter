import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('OPFS smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('writes and reads a file in OPFS when available', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const available = await page.evaluate(() => Boolean((navigator as Navigator & { storage?: { getDirectory?: unknown } }).storage?.getDirectory));
      test.skip(!available, 'OPFS unavailable in this browser context');

      const result = await page.evaluate(async () => {
        const storage = (navigator as Navigator & { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } }).storage;
        const root = await storage!.getDirectory!();
        const dir = await root.getDirectoryHandle('lumina-smoke', { create: true });
        const file = await dir.getFileHandle('opfs.txt', { create: true });
        const writable = await file.createWritable();
        await writable.write('ok-opfs');
        await writable.close();
        const loaded = await file.getFile();
        const text = await loaded.text();
        await dir.removeEntry('opfs.txt');
        return { text };
      });

      expect(result.text).toBe('ok-opfs');
    } finally {
      await server.close();
    }
  });
});
