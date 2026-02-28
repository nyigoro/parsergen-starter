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

  test('spawn supports local function tasks with join', async () => {
    const handle = thread.spawn(() => 42 * 2);
    expect(handle instanceof ThreadHandle).toBe(true);
    if (!(handle instanceof ThreadHandle)) return;

    const joined = await handle.join();
    expect(unwrapResult(joined).$tag).toBe('Ok');
    expect(unwrapResult(joined).$payload).toBe(84);

    const viaHelper = await thread.join(handle as never);
    expect(unwrapResult(viaHelper).$tag).toBe('Ok');
    expect(unwrapResult(viaHelper).$payload).toBe(84);
  });

  test('spawn propagates task errors via Result.Err', async () => {
    const handle = thread.spawn(() => {
      throw new Error('boom');
    });
    expect(handle instanceof ThreadHandle).toBe(true);
    if (!(handle instanceof ThreadHandle)) return;

    const joined = await handle.join();
    expect(unwrapResult(joined).$tag).toBe('Err');
    expect(String(unwrapResult(joined).$payload)).toContain('boom');
  });

  test('supports multiple local task handles and joins', async () => {
    const handles = [0, 1, 2, 3].map((i) => thread.spawn(() => i * 2));
    expect(handles.every((h) => h instanceof ThreadHandle)).toBe(true);

    const joined = await Promise.all(handles.map((h) => thread.join(h as never)));
    const tags = joined.map((item) => unwrapResult(item).$tag);
    const payloads = joined.map((item) => unwrapResult(item).$payload);

    expect(tags).toEqual(['Ok', 'Ok', 'Ok', 'Ok']);
    expect(payloads).toEqual([0, 2, 4, 6]);
  });

  test('parallel fibonacci pattern with local handles', async () => {
    const fib = (n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2));
    const inputs = [10, 11, 12, 13];
    const handles = inputs.map((n) => thread.spawn(() => fib(n)));

    const joined = await Promise.all(handles.map((h) => thread.join(h as never)));
    const tags = joined.map((item) => unwrapResult(item).$tag);
    const values = joined.map((item) => unwrapResult(item).$payload);

    expect(tags).toEqual(['Ok', 'Ok', 'Ok', 'Ok']);
    expect(values).toEqual([55, 89, 144, 233]);
  });

  test('worker pool fan-out/fan-in pattern with fixed workers', async () => {
    const jobs = [1, 2, 3, 4, 5, 6, 7, 8];
    const chunkA = jobs.filter((_, idx) => idx % 2 === 0);
    const chunkB = jobs.filter((_, idx) => idx % 2 === 1);
    const worker = (chunk: number[]) => chunk.reduce((acc, value) => acc + value * value, 0);

    const handles = [thread.spawn(() => worker(chunkA)), thread.spawn(() => worker(chunkB))];
    const joined = await Promise.all(handles.map((h) => thread.join(h as never)));
    const totals = joined.map((item) => unwrapResult(item).$payload as number);

    expect(totals[0] + totals[1]).toBe(204);
  });

  test('error handling pattern across multiple thread joins', async () => {
    const handles = [
      thread.spawn(() => 21 * 2),
      thread.spawn(() => {
        throw new Error('worker-failed');
      }),
    ];
    const joined = await Promise.all(handles.map((h) => thread.join(h as never)));
    const tags = joined.map((item) => unwrapResult(item).$tag);

    expect(tags).toEqual(['Ok', 'Err']);
    expect(unwrapResult(joined[0]).$payload).toBe(42);
    expect(String(unwrapResult(joined[1]).$payload)).toContain('worker-failed');
  });
});
