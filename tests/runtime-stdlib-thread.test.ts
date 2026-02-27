import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { thread, ThreadHandle } from '../src/lumina-runtime.js';

const unwrapResult = (value: unknown) => value as { $tag?: string; $payload?: unknown };
const unwrapOption = (value: unknown) => value as { $tag?: string; $payload?: unknown };

describe('runtime thread helpers', () => {
  const tmpDir = path.join(os.tmpdir(), 'lumina-thread-tests');
  const workerPath = path.join(tmpDir, 'echo-worker.mjs');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      workerPath,
      [
        "import { parentPort } from 'node:worker_threads';",
        'if (!parentPort) {',
        "  throw new Error('No parentPort');",
        '}',
        "parentPort.postMessage('ready');",
        "parentPort.on('message', (value) => {",
        "  if (value === 'stop') {",
        '    process.exit(0);',
        '  }',
        '  if (typeof value === "number") {',
        '    parentPort.postMessage(value * 2);',
        '  } else {',
        '    parentPort.postMessage(value);',
        '  }',
        '});',
      ].join('\n'),
      'utf-8'
    );
  });

  test('spawn/post/recv/join', async () => {
    if (!thread.is_available()) return;

    const spawned = await thread.spawn(workerPath);
    expect(unwrapResult(spawned).$tag).toBe('Ok');
    const handle = unwrapResult(spawned).$payload;
    expect(handle).toBeDefined();
    if (!handle) return;

    try {
      const ready = await thread.recv(handle as never);
      expect(unwrapOption(ready).$tag).toBe('Some');
      expect(unwrapOption(ready).$payload).toBe('ready');

      expect(thread.post(handle as never, 21)).toBe(true);
      const value = await thread.recv(handle as never);
      expect(unwrapOption(value).$tag).toBe('Some');
      expect(unwrapOption(value).$payload).toBe(42);

      const empty = thread.try_recv(handle as never);
      expect(unwrapOption(empty).$tag ?? 'None').toBe('None');

      expect(thread.post(handle as never, 'stop')).toBe(true);
      const exitCode = await thread.join(handle as never);
      expect(exitCode).toBe(0);
    } finally {
      await thread.terminate(handle as never);
    }
  });

  test('join resolves after terminate', async () => {
    if (!thread.is_available()) return;

    const spawned = await thread.spawn(workerPath);
    expect(unwrapResult(spawned).$tag).toBe('Ok');
    const handle = unwrapResult(spawned).$payload;
    expect(handle).toBeDefined();
    if (!handle) return;

    const ready = await thread.recv(handle as never);
    expect(unwrapOption(ready).$tag).toBe('Some');
    expect(unwrapOption(ready).$payload).toBe('ready');

    await thread.terminate(handle as never);
    const code = await thread.join(handle as never);
    expect(typeof code).toBe('number');
  });

  test('spawn supports local function tasks with join', () => {
    const handle = thread.spawn(() => 42 * 2);
    expect(handle instanceof ThreadHandle).toBe(true);
    if (!(handle instanceof ThreadHandle)) return;

    const joined = handle.join();
    expect(joined).toBe(84);

    const viaHelper = thread.join(handle as never);
    expect(viaHelper).toBe(84);
  });
});
