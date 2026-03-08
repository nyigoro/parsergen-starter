import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractImports } from '../project/imports.js';
import type { LuminaProgram } from './ast.js';
import type { IRProgram } from './ir.js';
import type { Diagnostic } from '../parser/index.js';

const EXTERNAL_NODE_KINDS = new Set<ModuleKind>(['std', 'std-root']);
const STD_PREFIX = '@std/';
const STD_ROOT = '@std';
const DEFAULT_MAX_IMPORT_DEPTH = 500;
const DEFAULT_CACHE_DIR = path.resolve('.lumina', 'cache', 'modules');

const PACKAGE_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf-8')) as { version?: string };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
})();

const CACHE_VERSION = PACKAGE_VERSION;

export type ModuleKind = 'file' | 'package' | 'std' | 'std-root';
export type ModuleStatus = 'pending' | 'compiled' | 'cached' | 'error' | 'external';

export type SymbolInfo = {
  name: string;
  kind: string;
};

export type TypeInfo = {
  name: string;
};

export type ExportEnv = {
  symbols: Map<string, SymbolInfo>;
  types: Map<string, TypeInfo>;
};

export type ModuleNode = {
  key: string;
  path: string | null;
  kind: ModuleKind;
  packageName: string | null;
  packageVersion: string | null;
  packageIntegrity: string | null;
  importedBy: string[];
  imports: string[];
  resolvedDeps: string[];
  ast: LuminaProgram | null;
  ir: IRProgram | null;
  exportEnv: ExportEnv | null;
  contentHash: string | null;
  exportHash: string | null;
  cacheKey: string | null;
  status: ModuleStatus;
  diagnostics: Diagnostic[];
};

export type CycleError = {
  cycle: string[];
  message: string;
};

export type ModuleGraph = {
  nodes: Map<string, ModuleNode>;
  order: string[];
  entryKey: string;
  grammarHash: string;
  cycleErrors: CycleError[];
  buildOptions: BuildModuleGraphOptions;
};

type LockfilePackage = {
  version: string;
  resolved: string;
  path?: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
};

type LegacyLockfileData = {
  lockfileVersion?: number;
  packages?: Record<string, LockfilePackage>;
};

type ModernLockfileData = {
  version?: number;
  packages?: Record<
    string,
    {
      name?: string;
      version?: string;
      resolved?: string;
      path?: string;
      integrity?: string;
      lumina?: string | Record<string, string>;
    }
  >;
};

type LockfileData = {
  lockfileVersion: number;
  packages: Record<string, LockfilePackage>;
};

type ResolvedImport =
  | { kind: 'file'; key: string; path: string }
  | { kind: 'package'; key: string; path: string; packageName: string; packageVersion: string; integrity?: string }
  | { kind: 'std'; key: string }
  | { kind: 'std-root'; key: string }
  | { kind: 'error'; message: string };

export type CacheEntry = {
  cacheKey: string;
  ast: LuminaProgram | null;
  exportEnv: ExportEnv | null;
  contentHash: string | null;
  exportHash: string | null;
  imports: string[];
  resolvedDeps: string[];
  diagnostics: Diagnostic[];
};

export type BuildModuleGraphOptions = {
  stdPath: string;
  fileExtensions?: string[];
  lockfileRoot?: string | null;
  grammarPath?: string;
  compilerVersion?: string;
  maxImportDepth?: number;
  cacheDir?: string;
};

type BuildContext = {
  options: BuildModuleGraphOptions;
  lockfile: LockfileData | null;
  grammarHash: string;
  compilerVersion: string;
  maxDepth: number;
  cacheDir: string;
};

export type CompileNodeResult = {
  ast?: LuminaProgram | null;
  ir?: IRProgram | null;
  exportEnv?: ExportEnv | null;
  output?: string;
  diagnostics?: Diagnostic[];
  skipCacheWrite?: boolean;
};

export type CompileInOrderOptions = {
  compileNode?: (args: { node: ModuleNode; graph: ModuleGraph; importEnv: ExportEnv }) => Promise<CompileNodeResult> | CompileNodeResult;
  cacheDir?: string;
};

export type CompileResult = {
  success: boolean;
  outputs: Map<string, string>;
  diagnostics: Map<string, Diagnostic[]>;
  stats: {
    compiled: number;
    cached: number;
    skipped: number;
    errors: number;
  };
};

export type TopoCompileResult = CompileResult;

const hashText = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const toPosix = (value: string): string => value.replace(/\\/g, '/');

export function computeExportHash(exportEnv: ExportEnv): string {
  const payload = {
    symbols: Array.from(exportEnv.symbols.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, info]) => [name, { name: info.name, kind: info.kind }]),
    types: Array.from(exportEnv.types.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, info]) => [name, { name: info.name }]),
  };
  return hashText(JSON.stringify(payload));
}

const ensureExtension = (resolved: string, extensions: string[]): string => {
  if (path.extname(resolved)) return resolved;
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (existsSync(candidate)) return candidate;
  }
  return resolved + (extensions[0] ?? '.lm');
};

const findLockfileRoot = (fromPath: string): string | null => {
  let current = path.dirname(fromPath);
  while (true) {
    if (existsSync(path.join(current, 'lumina.lock')) || existsSync(path.join(current, 'lumina.lock.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
};

const normalizeLockfile = (parsed: LegacyLockfileData | ModernLockfileData): LockfileData | null => {
  if (!parsed || typeof parsed !== 'object' || typeof parsed.packages !== 'object') return null;
  const modern = parsed as ModernLockfileData;
  const modernEntries = Object.values(modern.packages ?? {});
  const isModern =
    typeof modern.version === 'number' ||
    modernEntries.some((entry) => !!entry && typeof entry === 'object' && typeof entry.name === 'string');
  if (isModern) {
    const packages: Record<string, LockfilePackage> = {};
    for (const [key, entry] of Object.entries(modern.packages ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const fallbackName = key.startsWith('@') ? key.slice(0, key.lastIndexOf('@')) : key.split('@')[0];
      const name = typeof entry.name === 'string' ? entry.name : fallbackName;
      if (!name || typeof entry.version !== 'string' || typeof entry.resolved !== 'string') continue;
      packages[name] = {
        version: entry.version,
        resolved: entry.resolved,
        path: typeof entry.path === 'string' ? entry.path : undefined,
        integrity: typeof entry.integrity === 'string' ? entry.integrity : undefined,
        lumina: typeof entry.lumina === 'string' || typeof entry.lumina === 'object' ? entry.lumina : undefined,
      };
    }
    return {
      lockfileVersion: typeof modern.version === 'number' ? modern.version : 1,
      packages,
    };
  }
  const legacy = parsed as LegacyLockfileData;
  return {
    lockfileVersion: legacy.lockfileVersion ?? 1,
    packages: (legacy.packages ?? {}) as Record<string, LockfilePackage>,
  };
};

const readLockfile = (root: string | null | undefined): LockfileData | null => {
  if (!root) return null;
  const modernPath = path.join(root, 'lumina.lock');
  const legacyPath = path.join(root, 'lumina.lock.json');
  const candidate = existsSync(modernPath) ? modernPath : existsSync(legacyPath) ? legacyPath : null;
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(readFileSync(candidate, 'utf-8')) as LegacyLockfileData | ModernLockfileData;
    return normalizeLockfile(parsed);
  } catch {
    return null;
  }
};

const parsePackageSpecifier = (specifier: string): { pkgName: string; subpath: string | null } => {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) return { pkgName: specifier, subpath: null };
    const pkgName = `${parts[0]}/${parts[1]}`;
    const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : null;
    return { pkgName, subpath };
  }
  const slash = specifier.indexOf('/');
  if (slash === -1) return { pkgName: specifier, subpath: null };
  return { pkgName: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
};

const resolveBareImport = (
  fromPath: string,
  spec: string,
  extensions: string[],
  lockfile: LockfileData | null,
  lockfileRoot: string | null
): ResolvedImport => {
  if (!lockfile || !lockfileRoot) {
    return { kind: 'error', message: `Cannot resolve package import '${spec}': lockfile not found` };
  }
  const { pkgName, subpath } = parsePackageSpecifier(spec);
  const pkg = lockfile.packages[pkgName];
  if (!pkg || !pkg.lumina) {
    return { kind: 'error', message: `Cannot resolve package import '${spec}': package '${pkgName}' not found` };
  }
  const lumina = pkg.lumina;
  let entry: string | undefined;
  if (subpath) {
    if (typeof lumina === 'object') entry = lumina[subpath];
  } else if (typeof lumina === 'string') {
    entry = lumina;
  } else if (typeof lumina === 'object') {
    entry = lumina['.'];
  }
  if (!entry) {
    return { kind: 'error', message: `Cannot resolve package import '${spec}': missing lumina entry` };
  }
  let packageRoot = pkg.path ?? pkg.resolved;
  if (!path.isAbsolute(packageRoot)) packageRoot = path.resolve(lockfileRoot, packageRoot);
  const absolutePath = ensureExtension(path.resolve(packageRoot, entry), extensions);
  const sub = toPosix(path.relative(packageRoot, absolutePath));
  const key = `pkg:${pkgName}@${pkg.version}:${sub || '.'}`;
  return {
    kind: 'package',
    key,
    path: absolutePath,
    packageName: pkgName,
    packageVersion: pkg.version,
    integrity: pkg.integrity,
  };
};

const resolveImport = (
  raw: string,
  importerPath: string,
  extensions: string[],
  lockfile: LockfileData | null,
  lockfileRoot: string | null
): ResolvedImport => {
  if (raw === STD_ROOT) return { kind: 'std-root', key: 'std:@std' };
  if (raw.startsWith(STD_PREFIX)) return { kind: 'std', key: `std:${raw}` };
  if (raw.startsWith('.')) {
    const absolute = ensureExtension(path.resolve(path.dirname(importerPath), raw), extensions);
    return { kind: 'file', key: absolute, path: absolute };
  }
  return resolveBareImport(importerPath, raw, extensions, lockfile, lockfileRoot);
};

const parseExportEnv = (program: LuminaProgram): ExportEnv => {
  const symbols = new Map<string, SymbolInfo>();
  const types = new Map<string, TypeInfo>();
  for (const stmt of program.body ?? []) {
    if (!stmt || typeof stmt !== 'object') continue;
    const node = stmt as { type?: string; name?: string };
    if (!node.type || !node.name) continue;
    if (node.type === 'FnDecl' || node.type === 'Let' || node.type === 'TraitDecl' || node.type === 'ImplDecl') {
      symbols.set(node.name, { name: node.name, kind: node.type });
      continue;
    }
    if (node.type === 'StructDecl' || node.type === 'EnumDecl' || node.type === 'TypeDecl') {
      types.set(node.name, { name: node.name });
    }
  }
  return { symbols, types };
};

const mergeExportEnvs = (envs: Array<ExportEnv | null | undefined>): ExportEnv => {
  const symbols = new Map<string, SymbolInfo>();
  const types = new Map<string, TypeInfo>();
  for (const env of envs) {
    if (!env) continue;
    for (const [name, symbol] of env.symbols.entries()) symbols.set(name, symbol);
    for (const [name, typeInfo] of env.types.entries()) types.set(name, typeInfo);
  }
  return { symbols, types };
};

const serializeExportEnv = (env: ExportEnv | null): { symbols: Array<[string, SymbolInfo]>; types: Array<[string, TypeInfo]> } | null => {
  if (!env) return null;
  return { symbols: Array.from(env.symbols.entries()), types: Array.from(env.types.entries()) };
};

const deserializeExportEnv = (
  payload: { symbols?: Array<[string, SymbolInfo]>; types?: Array<[string, TypeInfo]> } | null | undefined
): ExportEnv | null => {
  if (!payload) return null;
  return {
    symbols: new Map<string, SymbolInfo>(Array.isArray(payload.symbols) ? payload.symbols : []),
    types: new Map<string, TypeInfo>(Array.isArray(payload.types) ? payload.types : []),
  };
};

const cachePathFor = (cacheDir: string, cacheKey: string): string => path.join(cacheDir, `${cacheKey}.json`);

export async function getCacheEntry(cacheKey: string, cacheDir: string = DEFAULT_CACHE_DIR): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(cachePathFor(cacheDir, cacheKey), 'utf-8');
    const parsed = JSON.parse(raw) as {
      cacheKey: string;
      ast?: LuminaProgram | null;
      exportEnv?: { symbols?: Array<[string, SymbolInfo]>; types?: Array<[string, TypeInfo]> } | null;
      contentHash?: string | null;
      exportHash?: string | null;
      hash?: string | null;
      imports?: string[];
      resolvedDeps?: string[];
      diagnostics?: Diagnostic[];
    };
    const exportEnv = deserializeExportEnv(parsed.exportEnv);
    return {
      cacheKey: parsed.cacheKey,
      ast: parsed.ast ?? null,
      exportEnv,
      contentHash: parsed.contentHash ?? parsed.hash ?? null,
      exportHash:
        parsed.exportHash ??
        (exportEnv ? computeExportHash(exportEnv) : null),
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
      resolvedDeps: Array.isArray(parsed.resolvedDeps) ? parsed.resolvedDeps : [],
      diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
    };
  } catch {
    return null;
  }
}

export async function setCacheEntry(cacheKey: string, entry: CacheEntry, cacheDir: string = DEFAULT_CACHE_DIR): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  const targetPath = cachePathFor(cacheDir, cacheKey);
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  const payload = {
    cacheKey,
    ast: entry.ast,
    exportEnv: serializeExportEnv(entry.exportEnv),
    contentHash: entry.contentHash,
    exportHash: entry.exportHash,
    imports: entry.imports,
    resolvedDeps: entry.resolvedDeps,
    diagnostics: entry.diagnostics,
  };
  await fs.writeFile(tempPath, JSON.stringify(payload), 'utf-8');
  await fs.rename(tempPath, targetPath);
}

export async function clearCache(cacheDir: string = DEFAULT_CACHE_DIR): Promise<void> {
  await fs.rm(cacheDir, { recursive: true, force: true });
}

const createNode = (key: string, kind: ModuleKind, nodePath: string | null): ModuleNode => ({
  key,
  path: nodePath,
  kind,
  packageName: null,
  packageVersion: null,
  packageIntegrity: null,
  importedBy: [],
  imports: [],
  resolvedDeps: [],
  ast: null,
  ir: null,
  exportEnv: null,
  contentHash: null,
  exportHash: null,
  cacheKey: null,
  status: EXTERNAL_NODE_KINDS.has(kind) ? 'external' : 'pending',
  diagnostics: [],
});

const grammarHashFromPath = async (grammarPath: string | undefined): Promise<string> => {
  const candidates = [
    grammarPath ? path.resolve(grammarPath) : '',
    path.resolve('src/grammar/lumina.peg'),
    path.resolve('examples/lumina.peg'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf-8');
      return hashText(raw);
    } catch {
      // continue
    }
  }
  return hashText('missing-grammar');
};

const walkNode = async (
  key: string,
  graph: ModuleGraph,
  ctx: BuildContext,
  visiting: Set<string>,
  depth: number
): Promise<void> => {
  const node = graph.nodes.get(key);
  if (!node) return;
  if (EXTERNAL_NODE_KINDS.has(node.kind)) {
    node.status = 'external';
    return;
  }
  if (depth > ctx.maxDepth) {
    node.status = 'error';
    node.diagnostics.push({
      severity: 'error',
      code: 'MODULE-DEPTH-001',
      message: `Module import depth exceeded (${ctx.maxDepth}) while resolving '${node.path ?? node.key}'`,
      source: 'lumina',
    });
    return;
  }
  if (visiting.has(key)) return;
  visiting.add(key);
  try {
    if (!node.path) {
      node.status = 'error';
      node.diagnostics.push({
        severity: 'error',
        code: 'MODULE-PATH-001',
        message: `Module '${node.key}' has no path`,
        source: 'lumina',
      });
      return;
    }

    const source = await fs.readFile(node.path, 'utf-8');
    node.contentHash = hashText(source);
    const packageSeed =
      node.kind === 'package' && node.packageIntegrity ? node.packageIntegrity : node.contentHash;
    node.cacheKey = hashText(`${packageSeed}:${ctx.compilerVersion}:${ctx.grammarHash}:${CACHE_VERSION}`);

    const cached = node.cacheKey ? await getCacheEntry(node.cacheKey, ctx.cacheDir) : null;
    if (cached) {
      node.ast = cached.ast;
      node.exportEnv = cached.exportEnv;
      node.contentHash = cached.contentHash ?? node.contentHash;
      node.exportHash = cached.exportHash ?? (cached.exportEnv ? computeExportHash(cached.exportEnv) : null);
      node.imports = cached.imports;
      node.resolvedDeps = cached.resolvedDeps;
      node.diagnostics = cached.diagnostics;
      node.status = node.diagnostics.some((d) => d.severity === 'error') ? 'error' : 'cached';
    } else {
      node.imports = extractImports(source);
      node.resolvedDeps = [];
      node.status = 'pending';
    }

    for (const rawImport of node.imports) {
      const resolved = resolveImport(
        rawImport,
        node.path,
        ctx.options.fileExtensions ?? ['.lm', '.lumina'],
        ctx.lockfile,
        ctx.options.lockfileRoot ?? findLockfileRoot(node.path)
      );
      if (resolved.kind === 'error') {
        node.status = 'error';
        node.diagnostics.push({
          severity: 'error',
          code: 'MODULE-RESOLVE-001',
          message: resolved.message,
          source: 'lumina',
        });
        continue;
      }
      if (!graph.nodes.has(resolved.key)) {
        const nextKind: ModuleKind =
          resolved.kind === 'file'
            ? 'file'
            : resolved.kind === 'package'
              ? 'package'
              : resolved.kind === 'std'
                ? 'std'
                : 'std-root';
        const nextNode = createNode(resolved.key, nextKind, 'path' in resolved ? resolved.path : null);
        if (resolved.kind === 'package') {
          nextNode.packageName = resolved.packageName;
          nextNode.packageVersion = resolved.packageVersion;
          nextNode.packageIntegrity = resolved.integrity ?? null;
        }
        graph.nodes.set(resolved.key, nextNode);
      }
      node.resolvedDeps.push(resolved.key);
      const dep = graph.nodes.get(resolved.key)!;
      if (!dep.importedBy.includes(node.key)) dep.importedBy.push(node.key);
      if (!EXTERNAL_NODE_KINDS.has(dep.kind)) {
        await walkNode(dep.key, graph, ctx, visiting, depth + 1);
      }
    }

    if (node.status === 'cached' && !node.exportEnv && node.ast) {
      node.exportEnv = parseExportEnv(node.ast);
      node.exportHash = computeExportHash(node.exportEnv);
    } else if (node.exportEnv && !node.exportHash) {
      node.exportHash = computeExportHash(node.exportEnv);
    }
  } catch (error) {
    node.status = 'error';
    node.diagnostics.push({
      severity: 'error',
      code: 'MODULE-READ-001',
      message: `Failed to read module '${node.path ?? node.key}': ${error instanceof Error ? error.message : String(error)}`,
      source: 'lumina',
    });
  } finally {
    visiting.delete(key);
  }
};

const detectCycles = (graph: ModuleGraph): CycleError[] => {
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles: CycleError[] = [];
  const keys = Array.from(graph.nodes.values())
    .filter((node) => !EXTERNAL_NODE_KINDS.has(node.kind))
    .map((node) => node.key);

  const onCycle = (fromKey: string): void => {
    const index = stack.lastIndexOf(fromKey);
    if (index === -1) return;
    const cycle = stack.slice(index).concat(fromKey);
    const message = `Module cycle detected: ${cycle.join(' -> ')}`;
    cycles.push({ cycle, message });
    for (const key of cycle) {
      const node = graph.nodes.get(key);
      if (!node) continue;
      node.status = 'error';
      node.diagnostics.push({
        severity: 'error',
        code: 'MODULE-CYCLE-001',
        message,
        source: 'lumina',
      });
    }
  };

  const visit = (key: string): void => {
    if (color.get(key) === 2) return;
    if (color.get(key) === 1) {
      onCycle(key);
      return;
    }
    color.set(key, 1);
    stack.push(key);
    const node = graph.nodes.get(key);
    for (const depKey of node?.resolvedDeps ?? []) {
      const dep = graph.nodes.get(depKey);
      if (!dep || EXTERNAL_NODE_KINDS.has(dep.kind)) continue;
      visit(depKey);
    }
    stack.pop();
    color.set(key, 2);
  };

  for (const key of keys) {
    if (!color.has(key)) visit(key);
  }
  return cycles;
};

const topoSort = (graph: ModuleGraph): string[] => {
  const cycleKeys = new Set(graph.cycleErrors.flatMap((c) => c.cycle));
  const compileNodes = Array.from(graph.nodes.values()).filter(
    (node) => !EXTERNAL_NODE_KINDS.has(node.kind) && !cycleKeys.has(node.key)
  );
  const indegree = new Map<string, number>();
  const reverse = new Map<string, string[]>();

  for (const node of compileNodes) {
    const deps = node.resolvedDeps.filter((depKey) => {
      const dep = graph.nodes.get(depKey);
      return !!dep && !EXTERNAL_NODE_KINDS.has(dep.kind) && !cycleKeys.has(depKey);
    });
    indegree.set(node.key, deps.length);
    for (const depKey of deps) {
      const dependents = reverse.get(depKey) ?? [];
      dependents.push(node.key);
      reverse.set(depKey, dependents);
    }
  }

  const queue = Array.from(indegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([key]) => key);
  const order: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    order.push(key);
    for (const dependent of reverse.get(key) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }
  return order;
};

export async function buildModuleGraph(entryPath: string, options: BuildModuleGraphOptions): Promise<ModuleGraph> {
  const absoluteEntry = path.resolve(entryPath);
  const grammarHash = await grammarHashFromPath(options.grammarPath);
  const compilerVersion = options.compilerVersion ?? PACKAGE_VERSION;
  const maxDepth = options.maxImportDepth ?? DEFAULT_MAX_IMPORT_DEPTH;
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const lockfileRoot = options.lockfileRoot ?? findLockfileRoot(absoluteEntry);

  const graph: ModuleGraph = {
    nodes: new Map([[absoluteEntry, createNode(absoluteEntry, 'file', absoluteEntry)]]),
    order: [],
    entryKey: absoluteEntry,
    grammarHash,
    cycleErrors: [],
    buildOptions: { ...options, lockfileRoot, cacheDir, compilerVersion, maxImportDepth: maxDepth },
  };

  const ctx: BuildContext = {
    options: { ...options, lockfileRoot },
    lockfile: readLockfile(lockfileRoot),
    grammarHash,
    compilerVersion,
    maxDepth,
    cacheDir,
  };

  await walkNode(absoluteEntry, graph, ctx, new Set<string>(), 0);
  graph.cycleErrors = detectCycles(graph);
  graph.order = topoSort(graph);
  return graph;
}

function replaceGraphState(target: ModuleGraph, source: ModuleGraph): void {
  target.nodes = source.nodes;
  target.order = source.order;
  target.entryKey = source.entryKey;
  target.grammarHash = source.grammarHash;
  target.cycleErrors = source.cycleErrors;
  target.buildOptions = source.buildOptions;
}

function collectErrorDiagnostics(graph: ModuleGraph): Map<string, Diagnostic[]> {
  const diagnostics = new Map<string, Diagnostic[]>();
  for (const [key, node] of graph.nodes.entries()) {
    if (node.diagnostics.some((diag) => diag.severity === 'error')) {
      diagnostics.set(key, [...node.diagnostics]);
    }
  }
  return diagnostics;
}

async function writeNodeCache(node: ModuleNode, cacheDir: string, skipCacheWrite?: boolean): Promise<void> {
  if (skipCacheWrite || !node.cacheKey) return;
  await setCacheEntry(
    node.cacheKey,
    {
      cacheKey: node.cacheKey,
      ast: node.ast,
      exportEnv: node.exportEnv,
      contentHash: node.contentHash,
      exportHash: node.exportHash,
      imports: node.imports,
      resolvedDeps: node.resolvedDeps,
      diagnostics: node.diagnostics,
    },
    cacheDir
  );
}

function applyCompileNodeResult(node: ModuleNode, compileResult: CompileNodeResult): void {
  if (compileResult.ast !== undefined) node.ast = compileResult.ast;
  if (compileResult.ir !== undefined) node.ir = compileResult.ir;
  if (compileResult.exportEnv !== undefined) node.exportEnv = compileResult.exportEnv;
  if (!node.exportEnv && node.ast) node.exportEnv = parseExportEnv(node.ast);
  node.exportHash = node.exportEnv ? computeExportHash(node.exportEnv) : null;
}

export function invalidate(graph: ModuleGraph, changedPaths: string[]): string[] {
  const changedKeys = new Set<string>();
  const normalized = changedPaths.map((value) => path.resolve(value));
  for (const [key, node] of graph.nodes.entries()) {
    if (!node.path) continue;
    if (normalized.includes(path.resolve(node.path))) changedKeys.add(key);
  }
  const queue = Array.from(changedKeys);
  const visited = new Set<string>(queue);
  while (queue.length > 0) {
    const key = queue.shift()!;
    const node = graph.nodes.get(key);
    if (!node) continue;
    node.status = EXTERNAL_NODE_KINDS.has(node.kind) ? 'external' : 'pending';
    node.ast = null;
    node.ir = null;
    node.exportEnv = null;
    node.exportHash = null;
    for (const dependent of node.importedBy) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      queue.push(dependent);
    }
  }
  return Array.from(visited);
}

export async function compileInOrder(graph: ModuleGraph, options: CompileInOrderOptions = {}): Promise<CompileResult> {
  const diagnostics = new Map<string, Diagnostic[]>();
  const outputs = new Map<string, string>();
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const stats = { compiled: 0, cached: 0, skipped: 0, errors: 0 };

  for (const key of graph.order) {
    const node = graph.nodes.get(key);
    if (!node) continue;
    if (EXTERNAL_NODE_KINDS.has(node.kind)) {
      node.status = 'external';
      stats.skipped += 1;
      continue;
    }
    if (node.status === 'error') {
      stats.errors += 1;
      diagnostics.set(node.key, [...node.diagnostics]);
      continue;
    }
    if (node.status === 'cached' && node.exportEnv) {
      stats.cached += 1;
      continue;
    }

    const importEnv = mergeExportEnvs(node.resolvedDeps.map((depKey) => graph.nodes.get(depKey)?.exportEnv ?? null));
    const compileResult = options.compileNode ? await options.compileNode({ node, graph, importEnv }) : {};
    const nodeDiagnostics = compileResult.diagnostics ?? [];
    node.diagnostics = [...node.diagnostics, ...nodeDiagnostics];
    if (node.diagnostics.some((diag) => diag.severity === 'error')) {
      node.status = 'error';
      stats.errors += 1;
      diagnostics.set(node.key, [...node.diagnostics]);
      continue;
    }

    applyCompileNodeResult(node, compileResult);
    if (compileResult.output !== undefined) outputs.set(node.key, compileResult.output);
    node.status = 'compiled';
    stats.compiled += 1;

    await writeNodeCache(node, cacheDir, compileResult.skipCacheWrite);
  }

  return { success: stats.errors === 0, outputs, diagnostics, stats };
}

export async function recompileAffected(
  graph: ModuleGraph,
  changedPaths: string[],
  options: CompileInOrderOptions = {}
): Promise<TopoCompileResult> {
  const cacheDir = options.cacheDir ?? graph.buildOptions.cacheDir ?? DEFAULT_CACHE_DIR;
  const nextGraph = await buildModuleGraph(graph.entryKey, { ...graph.buildOptions, cacheDir });
  const outputs = new Map<string, string>();
  const diagnostics = collectErrorDiagnostics(nextGraph);
  const stats = { compiled: 0, cached: 0, skipped: 0, errors: diagnostics.size };

  if (nextGraph.cycleErrors.length > 0 || diagnostics.size > 0) {
    replaceGraphState(graph, nextGraph);
    return { success: false, outputs, diagnostics, stats };
  }

  const normalizedChanged = new Set(changedPaths.map((value) => path.resolve(value)));
  const oldByPath = new Map<string, ModuleNode>();
  for (const node of graph.nodes.values()) {
    if (node.path) oldByPath.set(path.resolve(node.path), node);
  }

  const pending = new Set<string>();
  for (const node of nextGraph.nodes.values()) {
    if (EXTERNAL_NODE_KINDS.has(node.kind)) continue;
    const resolvedPath = node.path ? path.resolve(node.path) : null;
    const oldNode = graph.nodes.get(node.key) ?? (resolvedPath ? oldByPath.get(resolvedPath) ?? null : null);
    if (!oldNode) {
      pending.add(node.key);
      continue;
    }
    if (resolvedPath && normalizedChanged.has(resolvedPath) && oldNode.contentHash !== node.contentHash) {
      pending.add(node.key);
    }
  }

  for (const changedPath of normalizedChanged) {
    const oldNode = oldByPath.get(changedPath);
    const nextNode = Array.from(nextGraph.nodes.values()).find(
      (candidate) => candidate.path && path.resolve(candidate.path) === changedPath
    );
    if (!oldNode || nextNode) continue;
    for (const dependent of oldNode.importedBy) {
      if (nextGraph.nodes.has(dependent)) pending.add(dependent);
    }
  }

  for (const key of nextGraph.order) {
    const node = nextGraph.nodes.get(key);
    if (!node) continue;
    if (EXTERNAL_NODE_KINDS.has(node.kind)) {
      node.status = 'external';
      stats.skipped += 1;
      continue;
    }
    if (node.status === 'error') {
      stats.errors += 1;
      diagnostics.set(node.key, [...node.diagnostics]);
      continue;
    }

    const oldNode = graph.nodes.get(node.key) ?? (node.path ? oldByPath.get(path.resolve(node.path)) ?? null : null);
    const changedOnDisk = !oldNode || oldNode.contentHash !== node.contentHash;
    const newlyDiscovered = !oldNode;
    const needsCompile = pending.has(node.key) || changedOnDisk || newlyDiscovered || node.status !== 'cached';

    if (!needsCompile) {
      if (node.exportHash !== (oldNode?.exportHash ?? null)) {
        for (const dependent of node.importedBy) pending.add(dependent);
      }
      stats.cached += 1;
      continue;
    }

    const importEnv = mergeExportEnvs(node.resolvedDeps.map((depKey) => nextGraph.nodes.get(depKey)?.exportEnv ?? null));
    const compileResult = options.compileNode ? await options.compileNode({ node, graph: nextGraph, importEnv }) : {};
    const nodeDiagnostics = compileResult.diagnostics ?? [];
    node.diagnostics = [...node.diagnostics, ...nodeDiagnostics];
    if (node.diagnostics.some((diag) => diag.severity === 'error')) {
      node.status = 'error';
      stats.errors += 1;
      diagnostics.set(node.key, [...node.diagnostics]);
      continue;
    }

    applyCompileNodeResult(node, compileResult);
    if (compileResult.output !== undefined) outputs.set(node.key, compileResult.output);
    node.status = 'compiled';
    stats.compiled += 1;
    await writeNodeCache(node, cacheDir, compileResult.skipCacheWrite);

    if (node.exportHash !== (oldNode?.exportHash ?? null)) {
      for (const dependent of node.importedBy) pending.add(dependent);
    }
  }

  replaceGraphState(graph, nextGraph);
  return { success: stats.errors === 0, outputs, diagnostics, stats };
}

export async function clearModuleGraphCache(cacheDir?: string): Promise<void> {
  await clearCache(cacheDir ?? DEFAULT_CACHE_DIR);
}
