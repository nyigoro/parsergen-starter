import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('Async runtime helpers', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('io.readLineAsync uses test hook', async () => {
    const { io, Option } = await loadRuntime();
    (globalThis as { __luminaStdin?: string[] }).__luminaStdin = ['test input'];

    const result = await io.readLineAsync();

    expect(result).toMatchObject(Option.Some('test input'));
    delete (globalThis as { __luminaStdin?: string[] }).__luminaStdin;
  });

  test('fs.readFile reads file content', async () => {
    const { fs: luminaFs } = await loadRuntime();
    const tempFile = path.join(os.tmpdir(), 'lumina-test.txt');
    fs.writeFileSync(tempFile, 'Hello, Lumina!', 'utf8');

    const result = await luminaFs.readFile(tempFile);

    expect(result).toMatchObject({ $tag: 'Ok' });
    if (result && typeof result === 'object' && (result as { $tag?: string }).$tag === 'Ok') {
      expect((result as { $payload?: string }).$payload).toBe('Hello, Lumina!');
    }

    fs.unlinkSync(tempFile);
  });

  test('fs.writeFile creates file', async () => {
    const { fs: luminaFs } = await loadRuntime();
    const tempFile = path.join(os.tmpdir(), 'lumina-write-test.txt');

    const result = await luminaFs.writeFile(tempFile, 'Test content');

    expect(result).toMatchObject({ $tag: 'Ok' });
    expect(fs.readFileSync(tempFile, 'utf8')).toBe('Test content');

    fs.unlinkSync(tempFile);
  });
});
