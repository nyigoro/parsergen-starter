type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

const echoWorkerSource = [
  'const isNode = typeof process !== "undefined" && !!process.versions?.node;',
  'if (isNode) {',
  '  const { parentPort } = require("node:worker_threads");',
  '  parentPort.on("message", (msg) => parentPort.postMessage(String(msg)));',
  '} else {',
  '  self.onmessage = (event) => self.postMessage(String(event.data));',
  '}',
].join('\n');

describe('@std/web_worker runtime', () => {
  test('spawn_inline + post + on_message round-trip', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }

    const spawned = await web_worker.spawn_inline(echoWorkerSource);
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

  test('error paths return Err and never throw', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }

    expect(getTag(await web_worker.spawn(''))).toBe('Err');
    expect(getTag(await web_worker.spawn_inline(''))).toBe('Err');
    expect(getTag(web_worker.post(-1, 'unknown'))).toBe('Err');
  });

  test('post to terminated worker returns Err', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }
    const spawned = await web_worker.spawn_inline(echoWorkerSource);
    expect(getTag(spawned)).toBe('Ok');
    const handle = getPayload<number>(spawned);
    web_worker.terminate(handle);
    const postAfterTerminate = web_worker.post(handle, 'late');
    expect(getTag(postAfterTerminate)).toBe('Err');
  });

  test('message stress: 100 posts round-trip', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }
    const spawned = await web_worker.spawn_inline(echoWorkerSource);
    expect(getTag(spawned)).toBe('Ok');
    const handle = getPayload<number>(spawned);

    const expected = 100;
    const received: string[] = [];
    const completed = new Promise<void>((resolve) => {
      web_worker.on_message(handle, (message: string) => {
        received.push(message);
        if (received.length >= expected) resolve();
      });
    });

    for (let i = 0; i < expected; i += 1) {
      const posted = web_worker.post(handle, `msg-${i}`);
      expect(getTag(posted)).toBe('Ok');
    }
    await completed;
    expect(received).toHaveLength(expected);
    expect(received).toContain('msg-0');
    expect(received).toContain('msg-99');
    web_worker.terminate(handle);
  });

  test('spawn/terminate repeated cycles leave handles unusable', async () => {
    const { web_worker } = await loadRuntime();
    if (!web_worker.is_available()) {
      expect(web_worker.is_available()).toBe(false);
      return;
    }

    const handles: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const spawned = await web_worker.spawn_inline(echoWorkerSource);
      expect(getTag(spawned)).toBe('Ok');
      const handle = getPayload<number>(spawned);
      handles.push(handle);
      web_worker.terminate(handle);
    }

    for (const handle of handles) {
      const post = web_worker.post(handle, 'after-close');
      expect(getTag(post)).toBe('Err');
    }
  });

  test('node parity helpers', async () => {
    const { web_worker } = await loadRuntime();
    expect(web_worker.is_worker_context()).toBe(false);
    if (!web_worker.is_available()) return;
    const spawned = await web_worker.spawn_inline(echoWorkerSource);
    expect(['Ok', 'Err']).toContain(getTag(spawned));
    if (getTag(spawned) === 'Ok') {
      web_worker.terminate(getPayload<number>(spawned));
    }
  });
});
