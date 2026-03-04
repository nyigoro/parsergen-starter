import { test, expect } from '@playwright/test';
import { startSmokeServer } from '../fixtures/serve';

const runSmoke = process.env.LUMINA_BROWSER_SMOKE === '1';

test.describe('Browser stdlib module smoke', () => {
  test.skip(!runSmoke, 'Set LUMINA_BROWSER_SMOKE=1 to run browser smoke tests');

  test('covers url/web_storage/dom/web_streams browser module behavior', async ({ page }) => {
    const server = await startSmokeServer();
    try {
      const source = Buffer.from('fn main() -> i32 { 0 }', 'utf-8').toString('base64');
      await page.goto(`${server.baseUrl}/harness/js?source=${encodeURIComponent(source)}`);

      const result = await page.evaluate(async () => {
        const parsed = new URL('https://user:pass@example.com:8443/path/a?q=1&x=2#frag');

        const localKey = '__lumina_smoke_local__';
        const sessionKey = '__lumina_smoke_session__';
        localStorage.setItem(localKey, 'alpha');
        sessionStorage.setItem(sessionKey, 'beta');
        const localRoundTrip = localStorage.getItem(localKey);
        const sessionRoundTrip = sessionStorage.getItem(sessionKey);
        localStorage.removeItem(localKey);
        sessionStorage.removeItem(sessionKey);

        const host = document.createElement('div');
        host.id = 'lumina-dom-host';
        document.body.appendChild(host);
        const child = document.createElement('span');
        child.textContent = 'dom-ok';
        host.appendChild(child);
        let clicks = 0;
        child.addEventListener('click', () => {
          clicks += 1;
        });
        child.dispatchEvent(new Event('click'));
        const domQuery = document.querySelector('#lumina-dom-host span')?.textContent ?? '';

        const textStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('stream-ok'));
            controller.close();
          },
        });
        const textReader = textStream.getReader();
        const textChunks: Uint8Array[] = [];
        while (true) {
          const next = await textReader.read();
          if (next.done) break;
          textChunks.push(next.value);
        }
        const streamText = new TextDecoder().decode(
          textChunks.length === 1 ? textChunks[0] : new Uint8Array(textChunks.flatMap((chunk) => Array.from(chunk)))
        );

        const fetchRes = await fetch('/health');
        const fetchReader = fetchRes.body?.getReader();
        const fetchChunks: Uint8Array[] = [];
        if (fetchReader) {
          while (true) {
            const next = await fetchReader.read();
            if (next.done) break;
            fetchChunks.push(next.value);
          }
        }
        const fetchBytes = fetchChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

        return {
          url: {
            origin: parsed.origin,
            pathname: parsed.pathname,
            search: parsed.search,
            hash: parsed.hash,
            host: parsed.host,
          },
          storage: {
            localRoundTrip,
            sessionRoundTrip,
          },
          dom: {
            queryText: domQuery,
            clicks,
          },
          streams: {
            streamText,
            fetchBytes,
          },
        };
      });

      expect(result.url.origin).toBe('https://example.com:8443');
      expect(result.url.pathname).toBe('/path/a');
      expect(result.url.search).toBe('?q=1&x=2');
      expect(result.url.hash).toBe('#frag');
      expect(result.url.host).toBe('example.com:8443');

      expect(result.storage.localRoundTrip).toBe('alpha');
      expect(result.storage.sessionRoundTrip).toBe('beta');

      expect(result.dom.queryText).toBe('dom-ok');
      expect(result.dom.clicks).toBe(1);

      expect(result.streams.streamText).toBe('stream-ok');
      expect(result.streams.fetchBytes).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });
});
