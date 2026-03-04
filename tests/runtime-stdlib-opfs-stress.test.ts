type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

class FakeOpfsDirectory {
  private readonly directories = new Map<string, FakeOpfsDirectory>();
  private readonly files = new Map<string, { content: string; modifiedMs: number }>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeOpfsDirectory> {
    const key = String(name);
    const next = this.directories.get(key);
    if (next) return next;
    if (options?.create) {
      const created = new FakeOpfsDirectory();
      this.directories.set(key, created);
      return created;
    }
    const error = new Error(`Directory not found: ${key}`) as Error & { name: string };
    error.name = 'NotFoundError';
    throw error;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<{
    getFile: () => Promise<{ size: number; lastModified: number; text: () => Promise<string> }>;
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  }> {
    const key = String(name);
    const existing = this.files.get(key);
    if (!existing && !options?.create) {
      const error = new Error(`File not found: ${key}`) as Error & { name: string };
      error.name = 'NotFoundError';
      throw error;
    }
    if (!existing && options?.create) {
      this.files.set(key, { content: '', modifiedMs: Date.now() });
    }
    return {
      getFile: async () => {
        const file = this.files.get(key);
        if (!file) {
          const error = new Error(`File not found: ${key}`) as Error & { name: string };
          error.name = 'NotFoundError';
          throw error;
        }
        return {
          size: Buffer.byteLength(file.content, 'utf8'),
          lastModified: file.modifiedMs,
          text: async () => file.content,
        };
      },
      createWritable: async () => {
        let nextContent = '';
        return {
          write: async (data: string) => {
            nextContent = String(data);
          },
          close: async () => {
            this.files.set(key, { content: nextContent, modifiedMs: Date.now() });
          },
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    const key = String(name);
    if (this.files.delete(key)) return;
    if (this.directories.delete(key)) return;
    const error = new Error(`Entry not found: ${key}`) as Error & { name: string };
    error.name = 'NotFoundError';
    throw error;
  }

  async *entries(): AsyncIterable<[string, unknown]> {
    for (const [name, directory] of this.directories.entries()) {
      yield [name, directory];
    }
    for (const [name, file] of this.files.entries()) {
      yield [name, file];
    }
  }

  async *keys(): AsyncIterable<string> {
    for (const [name] of this.directories.entries()) yield name;
    for (const [name] of this.files.entries()) yield name;
  }
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

const restoreNavigator = (): void => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
    return;
  }
  delete (globalThis as { navigator?: unknown }).navigator;
};

const loadRuntime = async () => {
  jest.resetModules();
  return await import('../src/lumina-runtime.js');
};

describe('@std/opfs runtime stress + error paths', () => {
  afterEach(() => {
    restoreNavigator();
  });

  test('stress: write/read/delete cycles and directory scans', async () => {
    const root = new FakeOpfsDirectory();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { storage: { getDirectory: async () => root } },
    });

    const { opfs } = await loadRuntime();
    expect(opfs.is_available()).toBe(true);

    for (let i = 0; i < 100; i += 1) {
      expect(getTag(await opfs.writeFile(`docs/f${i}.txt`, `value-${i}`))).toBe('Ok');
    }
    for (let i = 0; i < 100; i += 1) {
      const read = await opfs.readFile(`docs/f${i}.txt`);
      expect(getTag(read)).toBe('Ok');
      expect(getPayload<string>(read)).toBe(`value-${i}`);
    }

    for (let i = 0; i < 50; i += 1) {
      const path = `cycle/c${i}.txt`;
      expect(getTag(await opfs.writeFile(path, `c${i}`))).toBe('Ok');
      expect(getTag(await opfs.readFile(path))).toBe('Ok');
      expect(getTag(await opfs.removeFile(path))).toBe('Ok');
      expect(await opfs.exists(path)).toBe(false);
    }

    for (let i = 0; i < 200; i += 1) {
      expect(getTag(await opfs.writeFile(`bulk/b${i}.txt`, `bulk-${i}`))).toBe('Ok');
    }
    const list = await opfs.readDir('bulk');
    expect(getTag(list)).toBe('Ok');
    expect(getPayload<string[]>(list)).toHaveLength(200);
  });

  test('stress: 1MB payload round-trip', async () => {
    const root = new FakeOpfsDirectory();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { storage: { getDirectory: async () => root } },
    });

    const { opfs } = await loadRuntime();
    const payload = 'x'.repeat(1024 * 1024);
    expect(getTag(await opfs.writeFile('big/data.txt', payload))).toBe('Ok');
    const read = await opfs.readFile('big/data.txt');
    expect(getTag(read)).toBe('Ok');
    expect(getPayload<string>(read).length).toBe(payload.length);
  });

  test('error paths return Err and never throw', async () => {
    const root = new FakeOpfsDirectory();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { storage: { getDirectory: async () => root } },
    });

    const { opfs } = await loadRuntime();
    const missing = await opfs.readFile('missing/file.txt');
    expect(getTag(missing)).toBe('Err');

    const removeMissing = await opfs.removeFile('missing/file.txt');
    expect(getTag(removeMissing)).toBe('Err');

    const metadataMissing = await opfs.metadata('missing/file.txt');
    expect(getTag(metadataMissing)).toBe('Err');

    const traversalWrite = await opfs.writeFile('../escape.txt', 'x');
    expect(getTag(traversalWrite)).toBe('Err');

    const traversalRead = await opfs.readFile('../escape.txt');
    expect(getTag(traversalRead)).toBe('Err');
  });

  test('mkdir existing path is stable and removeFile clears existence', async () => {
    const root = new FakeOpfsDirectory();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { storage: { getDirectory: async () => root } },
    });

    const { opfs } = await loadRuntime();
    expect(getTag(await opfs.mkdir('existing/path', true))).toBe('Ok');
    expect(getTag(await opfs.mkdir('existing/path', true))).toBe('Ok');
    expect(getTag(await opfs.writeFile('existing/path/file.txt', 'ok'))).toBe('Ok');
    expect(await opfs.exists('existing/path/file.txt')).toBe(true);
    expect(getTag(await opfs.removeFile('existing/path/file.txt'))).toBe('Ok');
    expect(await opfs.exists('existing/path/file.txt')).toBe(false);
  });

  test('Node fs fallback parity for Result shapes', async () => {
    const { fs: runtimeFs } = await loadRuntime();
    const nodeOs = await import('node:os');
    const nodePath = await import('node:path');
    const nodeFs = await import('node:fs/promises');
    const root = await nodeFs.mkdtemp(nodePath.join(nodeOs.tmpdir(), 'lumina-opfs-parity-'));
    const file = nodePath.join(root, 'x.txt');
    try {
      expect(getTag(await runtimeFs.writeFile(file, 'hello'))).toBe('Ok');
      const read = await runtimeFs.readFile(file);
      expect(getTag(read)).toBe('Ok');
      expect(getPayload<string>(read)).toBe('hello');

      const meta = await runtimeFs.metadata(file);
      expect(getTag(meta)).toBe('Ok');
      const payload = getPayload<{ isFile: boolean; isDirectory: boolean; size: number }>(meta);
      expect(typeof payload.isFile).toBe('boolean');
      expect(typeof payload.isDirectory).toBe('boolean');
      expect(typeof payload.size).toBe('number');

      expect(await runtimeFs.exists(file)).toBe(true);
      expect(getTag(await runtimeFs.removeFile(file))).toBe('Ok');
      expect(await runtimeFs.exists(file)).toBe(false);
    } finally {
      await nodeFs.rm(root, { recursive: true, force: true });
    }
  });
});
