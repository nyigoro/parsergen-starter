import {
  basenamePathBasic,
  dirnamePathBasic,
  extnamePathBasic,
  getNodePath,
  getNodeProcess,
  getNodeReadFileSync,
  getNodeSpawnSync,
  isAbsolutePathBasic,
  isNodeRuntime,
  joinPathBasic,
  normalizePathBasic,
} from './node-platform.js';

type LuminaEnumLike = { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] };

type OptionRuntime = {
  Some: <T>(value: T) => unknown;
  None: unknown;
};

type ResultRuntime = {
  Ok: <T>(value: T) => unknown;
  Err: (message: string) => unknown;
};

type SystemRuntimeDeps = {
  formatValue: (value: unknown) => string;
  getOption: () => OptionRuntime;
  getResult: () => ResultRuntime;
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
  getEnumPayload: (value: LuminaEnumLike) => unknown;
};

const padTimePart = (value: number): string => String(Math.trunc(value)).padStart(2, '0');

const localDateString = (date: Date): string =>
  `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;

const localTimeString = (date: Date): string =>
  `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`;

const localClockMs = (date: Date): number =>
  date.getHours() * 60 * 60 * 1000 +
  date.getMinutes() * 60 * 1000 +
  date.getSeconds() * 1000 +
  date.getMilliseconds();

const localTimeZoneName = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  } catch {
    return 'Local time';
  }
};

interface OpfsFileLike {
  size: number;
  lastModified: number;
  text: () => Promise<string>;
}

interface OpfsWritableLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface OpfsFileHandleLike {
  getFile: () => Promise<OpfsFileLike>;
  createWritable: () => Promise<OpfsWritableLike>;
}

interface OpfsDirectoryLike {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsDirectoryLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<OpfsFileHandleLike>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  entries?: () => AsyncIterable<[string, unknown]>;
  keys?: () => AsyncIterable<string>;
}

const blockedHttpHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
]);

const isPrivateIpv4Host = (host: string): boolean => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
};

const validateHttpUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol '${parsed.protocol}'. Only http and https are allowed.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (blockedHttpHosts.has(host)) {
    throw new Error(`Blocked host '${host}' for security reasons.`);
  }
  if (isPrivateIpv4Host(host)) {
    throw new Error(`Blocked private IP address: ${host}`);
  }
  return parsed.toString();
};

const hasOpfsSupport = (): boolean => {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: unknown } } }).navigator;
  return typeof nav?.storage?.getDirectory === 'function';
};

const getOpfsRoot = async (): Promise<OpfsDirectoryLike> => {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<OpfsDirectoryLike> } } })
    .navigator;
  const getter = nav?.storage?.getDirectory;
  if (typeof getter !== 'function') {
    throw new Error('OPFS is not available in this environment');
  }
  return await getter.call(nav!.storage);
};

const opfsError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};

const isOpfsNotFoundError = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  ((error as { name?: string }).name === 'NotFoundError' || (error as { code?: string }).code === 'ENOENT');

const splitOpfsPath = (path: string): string[] =>
  String(path)
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.');

const walkOpfsDirectory = async (segments: string[], create: boolean): Promise<OpfsDirectoryLike> => {
  let current = await getOpfsRoot();
  for (const segment of segments) {
    if (segment === '..') {
      throw new Error('OPFS path traversal is not supported');
    }
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
};

const resolveOpfsParent = async (
  path: string,
  createParent: boolean
): Promise<{ directory: OpfsDirectoryLike; name: string }> => {
  const segments = splitOpfsPath(path);
  if (segments.length === 0) {
    throw new Error('Path must not be empty');
  }
  const name = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const directory = await walkOpfsDirectory(parentSegments, createParent);
  return { directory, name };
};

const isLikelyRemotePath = (path: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('//');

const getMonotonicNow = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
};

const compileRegex = (pattern: string, flags: string = ''): RegExp | null => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
};

const toHex = (bytes: Uint8Array): string => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const toBase64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const getWebCrypto = async (): Promise<Crypto | null> => {
  if (globalThis.crypto && typeof globalThis.crypto.subtle !== 'undefined') {
    return globalThis.crypto;
  }
  if (!isNodeRuntime()) return null;
  try {
    const nodeCrypto = await import('node:crypto');
    return (nodeCrypto as { webcrypto?: Crypto }).webcrypto ?? null;
  } catch {
    return null;
  }
};

const utf8Encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const utf8Decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const deriveAesKey = async (web: Crypto, key: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> => {
  const digest = await web.subtle.digest('SHA-256', utf8Encode(key) as unknown as BufferSource);
  return await web.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [usage]);
};

const toIterableValues = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const iteratorFn = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iteratorFn === 'function') {
      return Array.from(value as Iterable<unknown>);
    }
  }
  return [];
};

export const createSystemRuntime = (deps: SystemRuntimeDeps) => {
  const toJsonValue = (value: unknown, seen: WeakSet<object>): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'function') return `[Function${value.name ? ` ${value.name}` : ''}]`;
    if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
    if (typeof value === 'object') {
      if (seen.has(value as object)) return '[Circular]';
      seen.add(value as object);
      if (deps.isEnumLike(value)) {
        const tag = deps.getEnumTag(value);
        const payload = deps.getEnumPayload(value);
        return payload === undefined ? { $tag: tag } : { $tag: tag, $payload: toJsonValue(payload, seen) };
      }
      const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toJsonValue(val, seen)]);
      return Object.fromEntries(entries);
    }
    return String(value);
  };

  const toJsonString = (value: unknown, pretty: boolean = true): string => {
    const normalized = toJsonValue(value, new WeakSet());
    return JSON.stringify(normalized, null, pretty ? 2 : undefined);
  };

  const resultOk = <T>(value: T) => deps.getResult().Ok(value);
  const resultErr = (message: string) => deps.getResult().Err(message);
  const optionSome = <T>(value: T) => deps.getOption().Some(value);
  const optionNone = () => deps.getOption().None;

  const renderArgs = (args: unknown[]): string => args.map((arg) => deps.formatValue(arg)).join(' ');

  const writeStdout = (text: string, newline: boolean) => {
    if (isNodeRuntime()) {
      const stdout = getNodeProcess()?.stdout;
      if (stdout?.write) {
        stdout.write(text + (newline ? '\n' : ''));
        return;
      }
    }
    // eslint-disable-next-line no-console -- runtime output
    console.log(text);
  };

  const writeStderr = (text: string, newline: boolean) => {
    if (isNodeRuntime()) {
      const stderr = getNodeProcess()?.stderr;
      if (stderr?.write) {
        stderr.write(text + (newline ? '\n' : ''));
        return;
      }
    }
    // eslint-disable-next-line no-console -- runtime output
    console.error(text);
  };

  let stdinCache: string[] | null = null;
  let stdinIndex = 0;

  const readStdinLines = (): string[] => {
    if (stdinCache) return stdinCache;
    const globalAny = globalThis as { __luminaStdin?: string | string[] };
    if (globalAny.__luminaStdin !== undefined) {
      const raw = globalAny.__luminaStdin;
      stdinCache = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/);
      return stdinCache;
    }
    if (isNodeRuntime()) {
      const stdin = getNodeProcess()?.stdin;
      const isTty = (stdin as { isTTY?: boolean } | undefined)?.isTTY;
      if (isTty !== true) {
        try {
          const readSync = getNodeReadFileSync();
          const raw = readSync ? readSync(0, 'utf8') : '';
          if (raw.length > 0) {
            stdinCache = raw.split(/\r?\n/);
            return stdinCache;
          }
        } catch {
          // ignore stdin read errors
        }
      }
      if (stdin?.setEncoding) stdin.setEncoding('utf8');
      const chunk = stdin?.read?.();
      if (typeof chunk === 'string') {
        stdinCache = chunk.split(/\r?\n/);
        return stdinCache;
      }
      if (chunk && typeof (chunk as { toString?: (enc: string) => string }).toString === 'function') {
        stdinCache = (chunk as { toString: (enc: string) => string }).toString('utf8').split(/\r?\n/);
        return stdinCache;
      }
    }
    stdinCache = [];
    return stdinCache;
  };

  const unwrapOption = (value: unknown): { isSome: boolean; value?: unknown } => {
    if (deps.isEnumLike(value)) {
      const tag = deps.getEnumTag(value);
      if (tag === 'Some') return { isSome: true, value: deps.getEnumPayload(value) };
      if (tag === 'None') return { isSome: false };
    }
    return { isSome: true, value };
  };

  const opfsReadFile = async (path: string) => {
    try {
      const { directory, name } = await resolveOpfsParent(path, false);
      const handle = await directory.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      const content = await file.text();
      return resultOk(content);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const opfsWriteFile = async (path: string, content: string) => {
    try {
      const { directory, name } = await resolveOpfsParent(path, true);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(String(content));
      await writable.close();
      return resultOk(undefined);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const opfsReadDir = async (path: string) => {
    try {
      const segments = splitOpfsPath(path);
      const directory = await walkOpfsDirectory(segments, false);
      const entries: string[] = [];
      if (typeof directory.entries === 'function') {
        for await (const [name] of directory.entries()) {
          entries.push(name);
        }
        return resultOk(entries);
      }
      if (typeof directory.keys === 'function') {
        for await (const name of directory.keys()) {
          entries.push(name);
        }
        return resultOk(entries);
      }
      return resultErr('OPFS directory iteration is not available');
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const opfsMetadata = async (path: string) => {
    try {
      const segments = splitOpfsPath(path);
      if (segments.length === 0) {
        return resultOk({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
      }
      const { directory, name } = await resolveOpfsParent(path, false);
      try {
        const fileHandle = await directory.getFileHandle(name, { create: false });
        const file = await fileHandle.getFile();
        return resultOk({
          isFile: true,
          isDirectory: false,
          size: Math.trunc(file.size),
          modifiedMs: Math.trunc(file.lastModified),
        });
      } catch (fileError) {
        if (!isOpfsNotFoundError(fileError)) {
          return resultErr(opfsError(fileError));
        }
      }
      const dirHandle = await directory.getDirectoryHandle(name, { create: false });
      if (dirHandle) {
        return resultOk({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
      }
      return resultErr(`Entry not found: ${path}`);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const opfsExists = async (path: string): Promise<boolean> => {
    try {
      const meta = await opfsMetadata(path);
      return deps.isEnumLike(meta) && deps.getEnumTag(meta) === 'Ok';
    } catch {
      return false;
    }
  };

  const opfsMkdir = async (path: string, recursive = true) => {
    try {
      const segments = splitOpfsPath(path);
      if (segments.length === 0) return resultOk(undefined);
      if (recursive) {
        await walkOpfsDirectory(segments, true);
        return resultOk(undefined);
      }
      const parentSegments = segments.slice(0, -1);
      const parent = await walkOpfsDirectory(parentSegments, false);
      await parent.getDirectoryHandle(segments[segments.length - 1], { create: true });
      return resultOk(undefined);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const opfsRemoveFile = async (path: string) => {
    try {
      const { directory, name } = await resolveOpfsParent(path, false);
      await directory.removeEntry(name, { recursive: false });
      return resultOk(undefined);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };

  const io = {
    print: (...args: unknown[]) => {
      writeStdout(renderArgs(args), false);
    },
    println: (...args: unknown[]) => {
      writeStdout(renderArgs(args), true);
    },
    eprint: (...args: unknown[]) => {
      writeStderr(renderArgs(args), false);
    },
    eprintln: (...args: unknown[]) => {
      writeStderr(renderArgs(args), true);
    },
    readLine: () => {
      const globalAny = globalThis as { __luminaReadLine?: () => string | null | undefined };
      if (typeof globalAny.__luminaReadLine === 'function') {
        const value = globalAny.__luminaReadLine();
        return value == null ? optionNone() : optionSome(value);
      }
      if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
        const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
        return value == null ? optionNone() : optionSome(value);
      }
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return optionNone();
      const value = lines[stdinIndex++];
      return optionSome(value);
    },
    readLineAsync: async () => {
      const globalAny = globalThis as { __luminaStdin?: string | string[] };
      if (globalAny.__luminaStdin !== undefined) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return optionNone();
        const value = lines[stdinIndex++];
        return optionSome(value);
      }
      if (isNodeRuntime()) {
        const nodeProcess = getNodeProcess();
        const stdin = nodeProcess?.stdin;
        if (stdin && stdin.isTTY !== true) {
          const lines = readStdinLines();
          if (stdinIndex >= lines.length) return optionNone();
          const value = lines[stdinIndex++];
          return optionSome(value);
        }
        if (stdin?.isTTY) {
          const readline = await import('node:readline');
          const rl = nodeProcess?.stdout
            ? readline.createInterface({
                input: stdin,
                output: nodeProcess.stdout,
              })
            : readline.createInterface({
                input: stdin,
              });
          return await new Promise((resolve) => {
            rl.question('', (answer) => {
              rl.close();
              resolve(optionSome(answer));
            });
          });
        }
      }
      if (typeof (globalThis as { prompt?: (message?: string) => string | null }).prompt === 'function') {
        const value = (globalThis as { prompt?: (message?: string) => string | null }).prompt?.();
        return value == null ? optionNone() : optionSome(value);
      }
      return optionNone();
    },
    printJson: (value: unknown, pretty: boolean = true) => {
      // eslint-disable-next-line no-console -- runtime output
      console.log(toJsonString(value, pretty));
    },
  };

  const str = {
    length: (value: string) => value.length,
    concat: (a: string, b: string) => a + b,
    substring: (value: string, start: number, end: number) => {
      const safeStart = Math.max(0, Math.trunc(start));
      const safeEnd = Math.max(safeStart, Math.trunc(end));
      return value.substring(safeStart, safeEnd);
    },
    slice: (value: string, range: { start: number | null; end: number | null; inclusive: boolean }) => {
      const start = range?.start ?? undefined;
      const end = range?.end ?? undefined;
      return value.slice(start ?? undefined, range?.inclusive && end !== undefined ? end + 1 : end ?? undefined);
    },
    split: (value: string, sep: string) => value.split(sep),
    trim: (value: string) => value.trim(),
    contains: (haystack: string, needle: string) => haystack.includes(needle),
    eq: (a: string, b: string) => a === b,
    char_at: (value: string, index: number) => {
      if (Number.isNaN(index) || index < 0 || index >= value.length) return optionNone();
      return optionSome(value.charAt(index));
    },
    is_whitespace: (value: string) => value === ' ' || value === '\n' || value === '\t' || value === '\r',
    is_digit: (value: string) => {
      if (!value || value.length === 0) return false;
      const code = value.charCodeAt(0);
      return code >= 48 && code <= 57;
    },
    to_int: (value: string) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? resultErr(`Invalid int: ${value}`) : resultOk(parsed);
    },
    to_float: (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? resultErr(`Invalid float: ${value}`) : resultOk(parsed);
    },
    from_int: (value: number) => String(Math.trunc(value)),
    from_float: (value: number) => String(value),
  };

  const math = {
    abs: (value: number) => Math.abs(value),
    min: (a: number, b: number) => Math.min(a, b),
    max: (a: number, b: number) => Math.max(a, b),
    absf: (value: number) => Math.abs(value),
    minf: (a: number, b: number) => Math.min(a, b),
    maxf: (a: number, b: number) => Math.max(a, b),
    sqrt: (value: number) => Math.sqrt(value),
    pow: (base: number, exp: number) => Math.pow(base, exp),
    powf: (base: number, exp: number) => Math.pow(base, exp),
    floor: (value: number) => Math.floor(value),
    ceil: (value: number) => Math.ceil(value),
    round: (value: number) => Math.round(value),
    pi: Math.PI,
    e: Math.E,
  };

  const opfs = {
    is_available: (): boolean => hasOpfsSupport(),
    readFile: async (path: string) => opfsReadFile(path),
    writeFile: async (path: string, content: string) => opfsWriteFile(path, content),
    readDir: async (path: string) => opfsReadDir(path),
    metadata: async (path: string) => opfsMetadata(path),
    exists: async (path: string): Promise<boolean> => opfsExists(path),
    mkdir: async (path: string, recursive = true) => opfsMkdir(path, recursive),
    removeFile: async (path: string) => opfsRemoveFile(path),
  };

  const fs = {
    readFile: async (path: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          const content = await fsPromises.readFile(path, 'utf8');
          return resultOk(content);
        }
        if (opfs.is_available() && !isLikelyRemotePath(path)) {
          return await opfs.readFile(path);
        }
        if (typeof fetch !== 'undefined') {
          const response = await fetch(path);
          if (!response.ok) {
            return resultErr(`HTTP ${response.status}: ${response.statusText}`);
          }
          const content = await response.text();
          return resultOk(content);
        }
        return resultErr('No file system available');
      } catch (error) {
        return resultErr(String(error));
      }
    },
    writeFile: async (path: string, content: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          await fsPromises.writeFile(path, content, 'utf8');
          return resultOk(undefined);
        }
        if (opfs.is_available()) {
          return await opfs.writeFile(path, content);
        }
        return resultErr('writeFile not supported in browser');
      } catch (error) {
        return resultErr(String(error));
      }
    },
    readDir: async (path: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          const entries = await fsPromises.readdir(path);
          return resultOk(entries);
        }
        if (opfs.is_available()) {
          return await opfs.readDir(path);
        }
        if (!isNodeRuntime()) {
          return resultErr('readDir is not supported in browser');
        }
        return resultErr('No file system available');
      } catch (error) {
        return resultErr(String(error));
      }
    },
    metadata: async (path: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          const stats = await fsPromises.stat(path);
          return resultOk({
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: Math.trunc(stats.size),
            modifiedMs: Math.trunc(stats.mtimeMs),
          });
        }
        if (opfs.is_available()) {
          return await opfs.metadata(path);
        }
        return resultErr('metadata is not supported in browser');
      } catch (error) {
        return resultErr(String(error));
      }
    },
    exists: async (path: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          await fsPromises.access(path);
          return true;
        }
        if (opfs.is_available()) return await opfs.exists(path);
        return false;
      } catch {
        return false;
      }
    },
    mkdir: async (path: string, recursive: boolean = true) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          await fsPromises.mkdir(path, { recursive: !!recursive });
          return resultOk(undefined);
        }
        if (opfs.is_available()) {
          return await opfs.mkdir(path, recursive);
        }
        return resultErr('mkdir is not supported in browser');
      } catch (error) {
        return resultErr(String(error));
      }
    },
    removeFile: async (path: string) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import('node:fs/promises');
          await fsPromises.unlink(path);
          return resultOk(undefined);
        }
        if (opfs.is_available()) {
          return await opfs.removeFile(path);
        }
        return resultErr('removeFile is not supported in browser');
      } catch (error) {
        return resultErr(String(error));
      }
    },
  };

  const path = {
    join: (left: string, right: string): string => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.join(String(left), String(right)) : joinPathBasic(String(left), String(right));
    },
    is_absolute: (value: string): boolean => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.isAbsolute(String(value)) : isAbsolutePathBasic(String(value));
    },
    extension: (value: string) => {
      const nodePath = getNodePath();
      const ext = nodePath ? nodePath.extname(String(value)) : extnamePathBasic(String(value));
      if (!ext) return optionNone();
      return optionSome(ext.startsWith('.') ? ext.slice(1) : ext);
    },
    dirname: (value: string): string => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.dirname(String(value)) : dirnamePathBasic(String(value));
    },
    basename: (value: string): string => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.basename(String(value)) : basenamePathBasic(String(value));
    },
    normalize: (value: string): string => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.normalize(String(value)) : normalizePathBasic(String(value));
    },
  };

  const env = {
    var: (name: string) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr('Environment variables are not available in this runtime');
      }
      const value = nodeProcess.env?.[String(name)];
      if (value === undefined) {
        return resultErr(`Environment variable '${name}' is not set`);
      }
      return resultOk(String(value));
    },
    set_var: (name: string, value: string) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr('Environment variables are not available in this runtime');
      }
      nodeProcess.env[String(name)] = String(value);
      return resultOk(undefined);
    },
    remove_var: (name: string) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr('Environment variables are not available in this runtime');
      }
      delete nodeProcess.env[String(name)];
      return resultOk(undefined);
    },
    args: (): string[] => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return [];
      return nodeProcess.argv.slice(2);
    },
    cwd: () => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr('Current working directory is not available in this runtime');
      }
      return resultOk(nodeProcess.cwd());
    },
  };

  const processRuntime = {
    spawn: (command: string, args: unknown = []) => {
      if (!isNodeRuntime()) {
        return resultErr('Process spawning is not available in this runtime');
      }
      const commandText = String(command).trim();
      if (!commandText) {
        return resultErr('Process command must be a non-empty string');
      }
      const argv = toIterableValues(args).map((part) => String(part));
      try {
        const spawn = getNodeSpawnSync();
        if (!spawn) {
          return resultErr('Process spawning is not available in this runtime');
        }
        const output = spawn(commandText, argv, {
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
        });
        if (output.error) {
          return resultErr(output.error.message || String(output.error));
        }
        return resultOk({
          status: typeof output.status === 'number' ? Math.trunc(output.status) : -1,
          success: output.status === 0,
          stdout: typeof output.stdout === 'string' ? output.stdout : String(output.stdout ?? ''),
          stderr: typeof output.stderr === 'string' ? output.stderr : String(output.stderr ?? ''),
        });
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    exit: (code: number = 0) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return;
      nodeProcess.exit(Math.trunc(code));
    },
    cwd: (): string => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? nodeProcess.cwd() : '';
    },
    pid: (): number => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? Math.trunc(nodeProcess.pid) : -1;
    },
  };

  const json = {
    to_string: (value: unknown) => {
      try {
        return resultOk(JSON.stringify(value));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    to_pretty_string: (value: unknown) => {
      try {
        return resultOk(toJsonString(value, true));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    from_string: (source: string) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    parse: (source: string) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
  };

  const http = {
    fetch: async (request: unknown) => {
      if (typeof fetch !== 'function') {
        return resultErr('Fetch API is not available');
      }
      if (!request || typeof request !== 'object') {
        return resultErr('Invalid request');
      }
      const req = request as {
        url?: unknown;
        method?: unknown;
        headers?: unknown;
        body?: unknown;
      };
      const rawUrl = typeof req.url === 'string' ? req.url : '';
      if (!rawUrl) {
        return resultErr('Invalid request url');
      }
      let url: string;
      try {
        url = validateHttpUrl(rawUrl);
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
      const method = typeof req.method === 'string' && req.method.length > 0 ? req.method : 'GET';
      const headerInput = unwrapOption(req.headers).value;
      const headers: Record<string, string> = {};
      if (Array.isArray(headerInput)) {
        for (const entry of headerInput) {
          if (Array.isArray(entry) && entry.length >= 2) {
            const [name, value] = entry;
            if (typeof name === 'string') {
              headers[name] = typeof value === 'string' ? value : String(value ?? '');
            }
            continue;
          }
          if (entry && typeof entry === 'object') {
            const name = (entry as { name?: unknown }).name;
            const value = (entry as { value?: unknown }).value;
            if (typeof name === 'string') {
              headers[name] = typeof value === 'string' ? value : String(value ?? '');
            }
          }
        }
      }
      const bodyValue = unwrapOption(req.body).value;
      const body = typeof bodyValue === 'string' ? bodyValue : bodyValue == null ? undefined : String(bodyValue);
      try {
        const response = await fetch(url, { method, headers, body });
        const text = await response.text();
        const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }));
        return resultOk({
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: text,
        });
      } catch (error) {
        return resultErr(String(error));
      }
    },
    get: async (url: string) =>
      await http.fetch({
        url,
        method: 'GET',
        headers: optionNone(),
        body: optionNone(),
      }),
    post: async (url: string, body?: unknown) =>
      await http.fetch({
        url,
        method: 'POST',
        headers: optionNone(),
        body: body === undefined ? optionNone() : optionSome(typeof body === 'string' ? body : JSON.stringify(body)),
      }),
    put: async (url: string, body?: unknown) =>
      await http.fetch({
        url,
        method: 'PUT',
        headers: optionNone(),
        body: body === undefined ? optionNone() : optionSome(typeof body === 'string' ? body : JSON.stringify(body)),
      }),
    del: async (url: string) =>
      await http.fetch({
        url,
        method: 'DELETE',
        headers: optionNone(),
        body: optionNone(),
      }),
  };

  const time = {
    nowMs: () => Math.trunc(Date.now()),
    nowIso: () => new Date().toISOString(),
    localDate: () => localDateString(new Date()),
    localTime: () => localTimeString(new Date()),
    localClockMs: () => Math.trunc(localClockMs(new Date())),
    timeZone: () => localTimeZoneName(),
    instantNow: () => Math.trunc(getMonotonicNow()),
    elapsedMs: (since: number) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)),
    sleep: async (ms: number) =>
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, Math.trunc(ms)));
      }),
  };

  const regex = {
    isValid: (pattern: string, flags: string = ''): boolean => compileRegex(pattern, flags) !== null,
    test: (pattern: string, text: string, flags: string = '') => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(re.test(text));
    },
    find: (pattern: string, text: string, flags: string = '') => {
      const re = compileRegex(pattern, flags);
      if (!re) return optionNone();
      const match = text.match(re);
      if (!match) return optionNone();
      return optionSome(match[0]);
    },
    findAll: (pattern: string, text: string, flags: string = '') => {
      const normalizedFlags = flags.includes('g') ? flags : `${flags}g`;
      const re = compileRegex(pattern, normalizedFlags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${normalizedFlags}`);
      const matches = Array.from(text.matchAll(re)).map((m) => m[0]);
      return resultOk(matches);
    },
    replace: (pattern: string, text: string, replacement: string, flags: string = '') => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(text.replace(re, replacement));
    },
  };

  const crypto = {
    isAvailable: async () => (await getWebCrypto()) !== null,
    sha256: async (value: string) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr('Crypto API is not available');
        const digest = await web.subtle.digest('SHA-256', utf8Encode(value) as unknown as BufferSource);
        return resultOk(toHex(new Uint8Array(digest)));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    hmacSha256: async (key: string, value: string) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr('Crypto API is not available');
        const cryptoKey = await web.subtle.importKey(
          'raw',
          utf8Encode(key) as unknown as BufferSource,
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await web.subtle.sign('HMAC', cryptoKey, utf8Encode(value) as unknown as BufferSource);
        return resultOk(toHex(new Uint8Array(signature)));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    randomBytes: async (length: number) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr('Crypto API is not available');
        const n = Math.max(0, Math.trunc(length));
        const bytes = new Uint8Array(n);
        web.getRandomValues(bytes);
        return resultOk(Array.from(bytes).map((b) => b | 0));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    randomInt: async (min: number, max: number) => {
      const lower = Math.trunc(Math.min(min, max));
      const upper = Math.trunc(Math.max(min, max));
      const span = upper - lower + 1;
      if (span <= 0) return resultErr('Invalid range');
      const random = await crypto.randomBytes(4);
      if (!deps.isEnumLike(random) || deps.getEnumTag(random) !== 'Ok') return random;
      const bytes = deps.getEnumPayload(random);
      if (!Array.isArray(bytes) || bytes.length < 4) return resultErr('Failed to generate randomness');
      const packed = new Uint8Array([bytes[0] as number, bytes[1] as number, bytes[2] as number, bytes[3] as number]);
      const value = new DataView(packed.buffer).getUint32(0, false);
      return resultOk(lower + (value % span));
    },
    aesGcmEncrypt: async (key: string, plaintext: string) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr('Crypto API is not available');
        const aesKey = await deriveAesKey(web, key, 'encrypt');
        const iv = new Uint8Array(12);
        web.getRandomValues(iv);
        const encrypted = await web.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, utf8Encode(plaintext) as unknown as BufferSource);
        const cipherBytes = new Uint8Array(encrypted);
        const packed = new Uint8Array(iv.length + cipherBytes.length);
        packed.set(iv, 0);
        packed.set(cipherBytes, iv.length);
        return resultOk(toBase64(packed));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    aesGcmDecrypt: async (key: string, payloadBase64: string) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr('Crypto API is not available');
        const packed = fromBase64(payloadBase64);
        if (packed.length < 13) return resultErr('Invalid AES payload');
        const iv = packed.slice(0, 12);
        const cipher = packed.slice(12);
        const aesKey = await deriveAesKey(web, key, 'decrypt');
        const plain = await web.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
        return resultOk(utf8Decode(new Uint8Array(plain)));
      } catch (error) {
        return resultErr(String(error));
      }
    },
  };

  return {
    toJsonString,
    io,
    str,
    math,
    opfs,
    fs,
    path,
    env,
    process: processRuntime,
    json,
    http,
    time,
    regex,
    crypto,
  };
};
