type NodeRequireFn = (id: string) => unknown;
type NodeProcessWithBuiltin = NodeJS.Process & {
  getBuiltinModule?: (id: string) => unknown;
  mainModule?: { require?: NodeRequireFn };
};

export interface NodePathLike {
  join: (...parts: string[]) => string;
  isAbsolute: (value: string) => boolean;
  extname: (value: string) => string;
  dirname: (value: string) => string;
  basename: (value: string) => string;
  normalize: (value: string) => string;
  resolve: (...parts: string[]) => string;
}

let cachedNodeRequire: NodeRequireFn | null | undefined;
let cachedNodePath: NodePathLike | null | undefined;
let cachedReadFileSync: ((fd: number, encoding: BufferEncoding) => string) | null | undefined;
let cachedSpawnSync:
  | ((command: string, args?: ReadonlyArray<string>, options?: Record<string, unknown>) => {
      status: number | null;
      stdout?: unknown;
      stderr?: unknown;
      error?: Error;
    })
  | null
  | undefined;

export const isNodeRuntime = (): boolean =>
  typeof (globalThis as { process?: unknown }).process !== 'undefined' &&
  typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';

export const getNodeProcess = (): NodeJS.Process | null => {
  const candidate = (globalThis as { process?: NodeJS.Process }).process;
  return candidate ?? null;
};

const getNodeRequire = (): NodeRequireFn | null => {
  if (cachedNodeRequire !== undefined) return cachedNodeRequire;
  const fromGlobal = (globalThis as { __luminaRequire?: NodeRequireFn; require?: NodeRequireFn }).__luminaRequire ??
    (globalThis as { require?: NodeRequireFn }).require;
  if (typeof fromGlobal === 'function') {
    cachedNodeRequire = fromGlobal;
    return cachedNodeRequire;
  }
  try {
    const fromEval = Function('return (typeof require !== "undefined") ? require : undefined;')() as NodeRequireFn | undefined;
    if (typeof fromEval === 'function') {
      cachedNodeRequire = fromEval;
      return cachedNodeRequire;
    }
  } catch {
    // ignore
  }
  const mainModuleReq = (getNodeProcess() as NodeProcessWithBuiltin | null)?.mainModule?.require;
  if (typeof mainModuleReq === 'function') {
    cachedNodeRequire = mainModuleReq.bind((getNodeProcess() as NodeProcessWithBuiltin | null)?.mainModule);
    return cachedNodeRequire;
  }
  cachedNodeRequire = null;
  return cachedNodeRequire;
};

export const getNodeBuiltinModule = (id: string): unknown => {
  const proc = getNodeProcess() as NodeProcessWithBuiltin | null;
  const getter = proc?.getBuiltinModule;
  if (typeof getter === 'function') {
    const direct = getter(id);
    if (direct) return direct;
  }
  const req = getNodeRequire();
  if (!req) return null;
  try {
    return req(id);
  } catch {
    return null;
  }
};

export const getNodePath = (): NodePathLike | null => {
  if (cachedNodePath !== undefined) return cachedNodePath;
  const req = getNodeRequire();
  if (!req && !(getNodeProcess() as NodeProcessWithBuiltin | null)?.getBuiltinModule) {
    cachedNodePath = null;
    return cachedNodePath;
  }
  try {
    const mod = (getNodeBuiltinModule('node:path') ?? getNodeBuiltinModule('path')) as
      | { default?: NodePathLike }
      | NodePathLike;
    cachedNodePath = ((mod as { default?: NodePathLike }).default ?? mod) as NodePathLike;
    return cachedNodePath;
  } catch {
    cachedNodePath = null;
    return cachedNodePath;
  }
};

export const getNodeReadFileSync = (): ((fd: number, encoding: BufferEncoding) => string) | null => {
  if (cachedReadFileSync !== undefined) return cachedReadFileSync;
  if (!getNodeRequire() && !(getNodeProcess() as NodeProcessWithBuiltin | null)?.getBuiltinModule) {
    cachedReadFileSync = null;
    return cachedReadFileSync;
  }
  try {
    const mod = (getNodeBuiltinModule('node:fs') ?? getNodeBuiltinModule('fs')) as {
      readFileSync?: (fd: number, encoding: BufferEncoding) => string;
    };
    cachedReadFileSync = typeof mod.readFileSync === 'function' ? mod.readFileSync.bind(mod) : null;
    return cachedReadFileSync;
  } catch {
    cachedReadFileSync = null;
    return cachedReadFileSync;
  }
};

export const getNodeSpawnSync = ():
  | ((command: string, args?: ReadonlyArray<string>, options?: Record<string, unknown>) => {
      status: number | null;
      stdout?: unknown;
      stderr?: unknown;
      error?: Error;
    })
  | null => {
  if (cachedSpawnSync !== undefined) return cachedSpawnSync;
  if (!getNodeRequire() && !(getNodeProcess() as NodeProcessWithBuiltin | null)?.getBuiltinModule) {
    cachedSpawnSync = null;
    return cachedSpawnSync;
  }
  try {
    const mod = (getNodeBuiltinModule('node:child_process') ?? getNodeBuiltinModule('child_process')) as {
      spawnSync?: (command: string, args?: ReadonlyArray<string>, options?: Record<string, unknown>) => {
        status: number | null;
        stdout?: unknown;
        stderr?: unknown;
        error?: Error;
      };
    };
    cachedSpawnSync = typeof mod.spawnSync === 'function' ? mod.spawnSync.bind(mod) : null;
    return cachedSpawnSync;
  } catch {
    cachedSpawnSync = null;
    return cachedSpawnSync;
  }
};

export const pathSeparator = (): string => ((getNodeProcess()?.platform ?? '').startsWith('win') ? '\\' : '/');

export const normalizePathBasic = (value: string): string => {
  const sep = pathSeparator();
  const replaced = String(value).replace(/[\\/]+/g, sep);
  const isAbs = sep === '\\'
    ? /^[A-Za-z]:\\/.test(replaced) || replaced.startsWith('\\\\')
    : replaced.startsWith('/');
  const drive = sep === '\\' && /^[A-Za-z]:/.test(replaced) ? replaced.slice(0, 2) : '';
  const body = drive ? replaced.slice(2) : replaced;
  const parts = body.split(sep).filter((part) => part.length > 0 && part !== '.');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!isAbs) out.push(part);
      continue;
    }
    out.push(part);
  }
  const prefix = drive ? `${drive}${sep}` : isAbs ? sep : '';
  const joined = out.join(sep);
  return `${prefix}${joined}` || (isAbs ? sep : '.');
};

export const joinPathBasic = (left: string, right: string): string =>
  normalizePathBasic(`${String(left)}${pathSeparator()}${String(right)}`);

export const isAbsolutePathBasic = (value: string): boolean => {
  const text = String(value);
  if (pathSeparator() === '\\') return /^[A-Za-z]:[\\/]/.test(text) || text.startsWith('\\\\');
  return text.startsWith('/');
};

export const dirnamePathBasic = (value: string): string => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  if (idx <= 0) return '.';
  return normalized.slice(0, idx);
};

export const basenamePathBasic = (value: string): string => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  return idx === -1 ? normalized : normalized.slice(idx + 1);
};

export const extnamePathBasic = (value: string): string => {
  const base = basenamePathBasic(value);
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx);
};

export const resolvePathBasic = (value: string): string => {
  const text = String(value);
  if (isAbsolutePathBasic(text)) return normalizePathBasic(text);
  const cwd = getNodeProcess()?.cwd?.() ?? '.';
  return normalizePathBasic(`${cwd}${pathSeparator()}${text}`);
};
