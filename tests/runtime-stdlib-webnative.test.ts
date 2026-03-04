type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

type NavigatorDescriptor = PropertyDescriptor | undefined;

class FakeOpfsDirectory {
  private readonly directories = new Map<string, FakeOpfsDirectory>();
  private readonly files = new Map<string, { content: string; modifiedMs: number }>();

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeOpfsDirectory> {
    const next = this.directories.get(name);
    if (next) return next;
    if (options?.create) {
      const created = new FakeOpfsDirectory();
      this.directories.set(name, created);
      return created;
    }
    const error = new Error(`Directory not found: ${name}`) as Error & { name: string };
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
    const existing = this.files.get(name);
    if (!existing && !options?.create) {
      const error = new Error(`File not found: ${name}`) as Error & { name: string };
      error.name = 'NotFoundError';
      throw error;
    }
    if (!existing && options?.create) {
      this.files.set(name, { content: '', modifiedMs: Date.now() });
    }
    return {
      getFile: async () => {
        const file = this.files.get(name);
        if (!file) {
          const error = new Error(`File not found: ${name}`) as Error & { name: string };
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
            this.files.set(name, { content: nextContent, modifiedMs: Date.now() });
          },
        };
      },
    };
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name)) return;
    if (this.directories.delete(name)) return;
    const error = new Error(`Entry not found: ${name}`) as Error & { name: string };
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
}

describe('Runtime web-native modules', () => {
  const originalNavigator: NavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const setNavigator = (value: unknown): void => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value,
    });
  };

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

  afterEach(() => {
    restoreNavigator();
  });

  test('@std/opfs supports browser file operations', async () => {
    const root = new FakeOpfsDirectory();
    setNavigator({
      storage: {
        getDirectory: async () => root,
      },
    });
    const { opfs } = await loadRuntime();

    expect(opfs.is_available()).toBe(true);
    expect(getTag(await opfs.mkdir('docs/nested', true))).toBe('Ok');
    expect(getTag(await opfs.writeFile('docs/nested/readme.txt', 'hello opfs'))).toBe('Ok');

    const readResult = await opfs.readFile('docs/nested/readme.txt');
    expect(getTag(readResult)).toBe('Ok');
    expect(getPayload<string>(readResult)).toBe('hello opfs');

    const exists = await opfs.exists('docs/nested/readme.txt');
    expect(exists).toBe(true);

    const listResult = await opfs.readDir('docs/nested');
    expect(getTag(listResult)).toBe('Ok');
    expect(getPayload<string[]>(listResult)).toContain('readme.txt');

    const metadataResult = await opfs.metadata('docs/nested/readme.txt');
    expect(getTag(metadataResult)).toBe('Ok');
    const metadata = getPayload<{ isFile: boolean; isDirectory: boolean; size: number }>(metadataResult);
    expect(metadata.isFile).toBe(true);
    expect(metadata.isDirectory).toBe(false);
    expect(metadata.size).toBe(10);

    expect(getTag(await opfs.removeFile('docs/nested/readme.txt'))).toBe('Ok');
    expect(await opfs.exists('docs/nested/readme.txt')).toBe(false);
  });

  test('@std/sab_channel provides bounded i32 channels', async () => {
    const { sab_channel } = await loadRuntime();
    if (!sab_channel.is_available()) {
      expect(sab_channel.is_available()).toBe(false);
      return;
    }

    const channel = sab_channel.bounded_i32(2);
    expect(sab_channel.try_send_i32(channel.sender, 11)).toBe(true);
    expect(sab_channel.try_send_i32(channel.sender, 13)).toBe(true);
    expect(sab_channel.try_send_i32(channel.sender, 17)).toBe(false);

    const first = sab_channel.try_recv_i32(channel.receiver);
    const second = sab_channel.try_recv_i32(channel.receiver);
    const third = sab_channel.try_recv_i32(channel.receiver);
    expect(getTag(first)).toBe('Some');
    expect(getPayload<number>(first)).toBe(11);
    expect(getTag(second)).toBe('Some');
    expect(getPayload<number>(second)).toBe(13);
    expect(getTag(third)).toBe('None');

    sab_channel.close_i32(channel);
    expect(sab_channel.is_sender_closed_i32(channel.sender)).toBe(true);
    expect(sab_channel.is_receiver_closed_i32(channel.receiver)).toBe(true);
  });

  test('@std/webgpu exposes compute-only availability and diagnostics', async () => {
    setNavigator({});
    const { webgpu } = await loadRuntime();
    expect(webgpu.is_available()).toBe(false);
    expect(getTag(await webgpu.request_adapter())).toBe('Err');
    expect(getTag(await webgpu.compute_i32('', 'main', [1, 2, 3], 3, 64))).toBe('Err');

    setNavigator({
      gpu: {
        requestAdapter: async () => null,
      },
    });
    expect(webgpu.is_available()).toBe(true);
    const noAdapter = await webgpu.request_adapter();
    expect(getTag(noAdapter)).toBe('Err');
  });
});
