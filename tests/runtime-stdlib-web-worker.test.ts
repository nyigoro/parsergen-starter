type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('@std/web_worker runtime', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('spawn_inline + post + on_message round-trip in supported runtimes', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }

    const source = [
      'const isNode = typeof process !== "undefined" && !!process.versions?.node;',
      'if (isNode) {',
      '  const { parentPort } = require("node:worker_threads");',
      '  parentPort.on("message", (msg) => parentPort.postMessage(String(msg)));',
      '} else {',
      '  self.onmessage = (event) => self.postMessage(String(event.data));',
      '}',
    ].join('\n');

    const spawned = await web_worker.spawn_inline(source);
    if (getTag(spawned) === 'Err') {
      expect(typeof getPayload<string>(spawned)).toBe('string');
      return;
    }
    expect(getTag(spawned)).toBe('Ok');
    const handle = getPayload<number>(spawned);

    const incoming = new Promise<string>((resolve) => {
      web_worker.on_message(handle, (message: string) => {
        resolve(message);
      });
    });

    const posted = web_worker.post(handle, 'ping');
    expect(getTag(posted)).toBe('Ok');
    await expect(incoming).resolves.toBe('ping');

    web_worker.terminate(handle);
  });

  test('is_worker_context is false in main runtime', async () => {
    const { web_worker } = await loadRuntime();
    expect(web_worker.is_worker_context()).toBe(false);
  });
});
