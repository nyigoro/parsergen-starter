import fs from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import fg from 'fast-glob';
import { Worker } from 'node:worker_threads';

import { compileGrammar } from '../grammar/index.js';
import { parseInput, ParserUtils, type Diagnostic } from '../parser/index.js';
import { formatError, highlightSnippet } from '../utils/index.js';
import {
  analyzeLumina,
  lowerLumina,
  optimizeIR,
  generateJS,
  generateJSFromAst,
  generateWasmTextModuleFromAst,
  emitWasmBinary,
  irToDot,
  inferProgram,
  monomorphize,
  formatDiagnosticExplanation,
  getDiagnosticExplanation,
} from '../index.js';
import { emitWAT } from '../lumina/wasm-emit-wat.js';
import { inlinePass } from '../lumina/inline.js';
import { comptimePass } from '../lumina/comptime.js';
import { fuseVecPipelines } from '../lumina/stream-fusion.js';
import { createStdModuleRegistry } from '../lumina/module-registry.js';
import {
  buildModuleGraph,
  clearModuleGraphCache,
  compileInOrder,
  recompileAffected,
  type ExportEnv,
  type ModuleGraph,
} from '../lumina/module-graph.js';
import { loadWASM, callWASMFunction } from '../wasm-runtime.js';
import { ensureRuntimeForOutput } from './runtime.js';
import { extractImports } from '../project/imports.js';
import { parseWithPanicRecovery } from '../project/panic.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import {
  collectStyleLintIssues,
  formatLuminaSource,
  generateLuminaDocsMarkdown,
} from '../lumina/tooling.js';
import { startLuminaRepl } from '../repl/repl.js';
import { runLuminaGrammar } from './lumina-grammar.js';
import { type RawSourceMap } from 'source-map';
import { initProject, removePackages, listPackages } from '../commands/package.js';
import { runLuminaAdd } from './lumina-add.js';
import { runLuminaInstall } from './lumina-install.js';
import { runLuminaPublish } from './lumina-publish.js';
import { runLuminaBundle } from './lumina-bundle.js';
import { runLuminaImportmap } from './lumina-importmap.js';
import { readManifest } from '../lumina/package-manifest.js';
import { resolveRegistryConfig, search as searchRegistry } from '../lumina/registry-client.js';
import { LEGACY_LOCKFILE_FILENAME, LOCKFILE_FILENAME } from '../lumina/lockfile.js';
import {
  normalizeLockfileObject,
  parsePackageSpecifier,
  selectLockfilePackage,
  type NormalizedLockfile,
  type NormalizedLockfilePackage,
} from '../lumina/lockfile-format.js';
import { scanDirectory } from '../lumina/secret-scan.js';
import { generateExportsMap } from '../lumina/dual-output.js';
import { type AnalyzeTarget } from '../lumina/target-profiles.js';

type Target = 'cjs' | 'esm' | 'wasm' | 'dual';
type CliTarget = Target | 'js' | 'wasm-web' | 'wasm-standalone';
type ModuleFormat = 'esm' | 'cjs';

const DEFAULT_GRAMMAR_PATHS = [path.resolve('src/grammar/lumina.peg')];

type LuminaConfig = {
  grammarPath?: string;
  outDir?: string;
  target?: CliTarget;
  module?: ModuleFormat;
  entries?: string[];
  watch?: string[];
  stdPath?: string;
  fileExtensions?: string[];
  cacheDir?: string;
  recovery?: boolean;
};

function loadConfig(cwd = process.cwd()): LuminaConfig | null {
  const configPath = path.join(cwd, 'lumina.config.json');
  if (!existsSync(configPath)) return null;
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as LuminaConfig;
  return validateConfig(raw);
}

function validateConfig(raw: LuminaConfig): LuminaConfig {
  const errors: string[] = [];
  const normalized: LuminaConfig = {};

  if (raw.grammarPath !== undefined) {
    if (typeof raw.grammarPath === 'string') normalized.grammarPath = raw.grammarPath;
    else errors.push('grammarPath must be a string');
  }
  if (raw.outDir !== undefined) {
    if (typeof raw.outDir === 'string') normalized.outDir = raw.outDir;
    else errors.push('outDir must be a string');
  }
  if (raw.target !== undefined) {
    if (
      raw.target === 'cjs' ||
      raw.target === 'esm' ||
      raw.target === 'wasm' ||
      raw.target === 'dual' ||
      raw.target === 'js' ||
      raw.target === 'wasm-web' ||
      raw.target === 'wasm-standalone'
    )
      normalized.target = raw.target;
    else
      errors.push(
        'target must be "cjs", "esm", "wasm", "dual", "js", "wasm-web", or "wasm-standalone"'
      );
  }
  if ((raw as LuminaConfig & { module?: unknown }).module !== undefined) {
    const moduleValue = (raw as LuminaConfig & { module?: unknown }).module;
    if (moduleValue === 'esm' || moduleValue === 'cjs') normalized.module = moduleValue;
    else errors.push('module must be "esm" or "cjs"');
  }

  const normalizeList = (value: unknown, key: string): string[] | undefined => {
    if (value === undefined) return undefined;
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value;
    if (typeof value === 'string') return [value];
    errors.push(`${key} must be a string or string[]`);
    return undefined;
  };

  const entries = normalizeList(raw.entries, 'entries');
  const watch = normalizeList(raw.watch, 'watch');
  const fileExtensions = normalizeList(raw.fileExtensions, 'fileExtensions');
  if (entries) normalized.entries = entries;
  if (watch) normalized.watch = watch;
  if (fileExtensions) normalized.fileExtensions = fileExtensions;
  if (raw.stdPath !== undefined) {
    if (typeof raw.stdPath === 'string') normalized.stdPath = raw.stdPath;
    else errors.push('stdPath must be a string');
  }
  if (raw.cacheDir !== undefined) {
    if (typeof raw.cacheDir === 'string') normalized.cacheDir = raw.cacheDir;
    else errors.push('cacheDir must be a string');
  }
  if (raw.recovery !== undefined) {
    if (typeof raw.recovery === 'boolean') normalized.recovery = raw.recovery;
    else errors.push('recovery must be a boolean');
  }

  if (errors.length > 0) {
    console.error('Invalid lumina.config.json:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  return normalized;
}

function resolveGrammarPath(arg?: string): string {
  if (arg) return path.resolve(arg);
  for (const p of DEFAULT_GRAMMAR_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error('Lumina grammar not found. Provide --grammar <path>.');
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a.startsWith('--')) {
      if (next && !next.startsWith('--')) {
        args.set(a, next);
        i++;
      } else {
        args.set(a, true);
      }
      continue;
    }
    positional.push(a);
  }
  const [command, file] = positional;
  return { command, file, positional, args };
}

function parseBooleanFlag(args: Map<string, string | boolean>, key: string): boolean {
  const value = args.get(key);
  if (value === undefined) return false;
  if (value === true) return true;
  if (typeof value === 'string') return value === 'true' || value === '1' || value === 'yes';
  return false;
}

function formatRelativeDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return iso;
  const diff = Math.max(0, Date.now() - time);
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function buildNextPageCmd(
  query: string,
  nextOffset: number,
  sort: string | boolean | undefined,
  limit: string | boolean | undefined,
  tags: string | boolean | undefined
): string {
  const parts = [`lumina search "${query}"`, `--offset ${nextOffset}`];
  if (typeof limit === 'string' && limit.length > 0) parts.push(`--limit ${limit}`);
  if (typeof sort === 'string' && sort.length > 0) parts.push(`--sort ${sort}`);
  if (typeof tags === 'string' && tags.length > 0) parts.push(`--tags ${tags}`);
  return parts.join(' ');
}

function resolveTarget(value: string | undefined): CliTarget | null {
  if (!value) return null;
  return value === 'cjs' ||
    value === 'esm' ||
    value === 'wasm' ||
    value === 'dual' ||
    value === 'js' ||
    value === 'wasm-web' ||
    value === 'wasm-standalone'
    ? value
    : null;
}

function resolveModuleFormat(value: string | undefined): ModuleFormat | null {
  if (!value) return null;
  return value === 'esm' || value === 'cjs' ? value : null;
}

function resolveCompilePlan(
  target: CliTarget,
  moduleFormat?: ModuleFormat
): {
  compileTarget: Target;
  semanticTarget: AnalyzeTarget;
} {
  if (target === 'dual') {
    return { compileTarget: 'dual', semanticTarget: 'js' };
  }
  if (target === 'cjs') {
    return { compileTarget: 'cjs', semanticTarget: 'js' };
  }
  if (target === 'esm') {
    return { compileTarget: 'esm', semanticTarget: 'js' };
  }
  if (target === 'js') {
    return { compileTarget: moduleFormat ?? 'esm', semanticTarget: 'js' };
  }
  if (target === 'wasm-standalone') {
    return { compileTarget: 'wasm', semanticTarget: 'wasm-standalone' };
  }
  if (target === 'wasm-web') {
    return { compileTarget: 'wasm', semanticTarget: 'wasm-web' };
  }
  return { compileTarget: 'wasm', semanticTarget: 'wasm' };
}

const blockedOutputRoots = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
  '/System',
  '/Library',
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
];

const normalizePathForCompare = (value: string): string => {
  const normalized = path.normalize(path.resolve(value)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

const isPathInside = (candidate: string, root: string): boolean =>
  candidate === root || candidate.startsWith(`${root}${path.sep}`);

export function validateOutputPath(
  outputPath: string,
  options: { allowAbsoluteOutsideCwd?: boolean; cwd?: string } = {}
): string {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Security: Output path must be a non-empty string.');
  }

  if (outputPath.includes('\0')) {
    throw new Error('Security: Output path contains an invalid null byte.');
  }

  const cwd = normalizePathForCompare(options.cwd ?? process.cwd());
  const resolved = normalizePathForCompare(outputPath);

  if (!options.allowAbsoluteOutsideCwd) {
    const rel = path.relative(cwd, resolved);
    if (path.isAbsolute(outputPath) && (rel === '..' || rel.startsWith(`..${path.sep}`))) {
      throw new Error(
        `Security: Output path must be within current directory.\n` +
          `Attempted: ${outputPath}\n` +
          `Resolved: ${resolved}\n` +
          `Current directory: ${cwd}`
      );
    }
    if (outputPath.includes('..') && (rel === '..' || rel.startsWith(`..${path.sep}`))) {
      throw new Error(
        `Security: Path traversal detected: ${outputPath}\n` +
          `Relative path would escape current directory: ${rel}`
      );
    }
  }

  for (const blockedRoot of blockedOutputRoots) {
    const blocked = normalizePathForCompare(blockedRoot);
    if (isPathInside(resolved, blocked)) {
      throw new Error(
        `Security: Cannot write to system directory: ${blockedRoot}\n` +
          `Attempted path: ${outputPath}`
      );
    }
  }

  return resolved;
}

function resolveOutPath(
  sourcePath: string,
  outPathArg: string | undefined,
  outDir: string | undefined,
  target?: Target
): string {
  if (target === 'dual') {
    if (outPathArg) return validateOutputPath(outPathArg);
    if (outDir)
      return validateOutputPath(
        path.resolve(outDir, path.basename(sourcePath, path.extname(sourcePath)))
      );
    return validateOutputPath(path.resolve('dist'));
  }
  if (outPathArg) return validateOutputPath(outPathArg);
  const ext = target === 'wasm' ? '.wasm' : '.js';
  const base = path.basename(sourcePath, path.extname(sourcePath)) + ext;
  if (outDir) return validateOutputPath(path.resolve(outDir, base));
  return validateOutputPath(target === 'wasm' ? 'lumina.out.wasm' : 'lumina.out.js');
}

type BuildConfig = {
  fileExtensions: string[];
  stdPath: string;
  cacheDir: string;
};

type LuminaLockfile = NormalizedLockfile;

type BareResolveResult =
  | { resolved: string }
  | { error: { code: 'PKG-001' | 'PKG-002' | 'PKG-003' | 'PKG-004' | 'PKG-005'; message: string } };

type FileCacheEntry = {
  hash: string;
  ast: unknown;
  diagnostics: ReturnType<typeof analyzeLumina>['diagnostics'];
  ir: ReturnType<typeof optimizeIR>;
  grammarHash: string;
  compilerVersion?: string;
  semanticTarget?: AnalyzeTarget;
};

type DiagnosticLocationLike = Parameters<typeof highlightSnippet>[1];

type ReportableDiagnostic = {
  severity?: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  code?: string | number;
  location?: DiagnosticLocationLike;
  relatedInformation?: Array<{
    location?: DiagnosticLocationLike;
    message: string;
  }>;
};

type CompileLuminaResult =
  | { ok: false }
  | {
      ok: true;
      map?: RawSourceMap;
      ir?: Parameters<typeof irToDot>[0];
    };

type WasmArtifactPaths = {
  wasmPath: string;
  watPath?: string;
};

function resolveWasmArtifactPaths(outPath: string, emitWat: boolean): WasmArtifactPaths {
  if (/\.wat$/i.test(outPath)) {
    return {
      wasmPath: outPath.replace(/\.wat$/i, '.wasm'),
      watPath: outPath,
    };
  }
  if (/\.wasm$/i.test(outPath)) {
    return {
      wasmPath: outPath,
      watPath: emitWat ? outPath.replace(/\.wasm$/i, '.wat') : undefined,
    };
  }
  return {
    wasmPath: outPath,
    watPath: emitWat ? `${outPath}.wat` : undefined,
  };
}

async function emitWasmArtifacts(
  outPath: string,
  module: Parameters<typeof emitWasmBinary>[0],
  emitWat: boolean,
  options: { sourceMap?: boolean; inlineSourceMap?: boolean } = {}
): Promise<CompileLuminaResult> {
  const { wasmPath, watPath } = resolveWasmArtifactPaths(outPath, emitWat);
  try {
    const binary = emitWasmBinary(module);
    await fs.mkdir(path.dirname(wasmPath), { recursive: true });
    await fs.writeFile(wasmPath, binary);
    if (options.sourceMap && !options.inlineSourceMap && module.debugMetadata) {
      await fs.writeFile(
        `${wasmPath}.map`,
        `${JSON.stringify(module.debugMetadata, null, 2)}\n`,
        'utf-8'
      );
    }
    if (watPath) {
      await fs.mkdir(path.dirname(watPath), { recursive: true });
      await fs.writeFile(watPath, emitWAT(module), 'utf-8');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`WASM binary emission failed: ${message}`);
    return { ok: false };
  }
  console.log(`Compiled WASM: ${wasmPath}`);
  if (watPath) console.log(`WAT debug output: ${watPath}`);
  return { ok: true, map: undefined, ir: undefined };
}

type BuildCache = {
  grammarHash: string | null;
  grammarText: string | null;
  parser: ReturnType<typeof compileGrammar> | null;
  files: Map<string, FileCacheEntry>;
  cacheDir: string;
  stats: { hits: number; misses: number; writes: number; invalidations: number };
};

const buildCache: BuildCache = {
  grammarHash: null,
  grammarText: null,
  parser: null,
  files: new Map(),
  cacheDir: '.lumina-cache',
  stats: { hits: 0, misses: 0, writes: 0, invalidations: 0 },
};

const COMPILER_CACHE_VERSION = '2026-04-24-compiler-ui-dom-lowering-v1';

let configFileExtensions: string[] = ['.lm', '.lumina'];
let configStdPath = '';
const cliLexer = createLuminaLexer();

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function appendSourceMapComment(code: string, mapFileName: string): string {
  const trimmed = code.trimEnd();
  if (trimmed.endsWith(`//# sourceMappingURL=${mapFileName}`)) {
    return trimmed + '\n';
  }
  return `${trimmed}\n//# sourceMappingURL=${mapFileName}\n`;
}

function appendInlineSourceMapComment(code: string, map: RawSourceMap): string {
  const trimmed = code.trimEnd();
  const base64 = Buffer.from(JSON.stringify(map), 'utf-8').toString('base64');
  const comment = `//# sourceMappingURL=data:application/json;base64,${base64}`;
  if (trimmed.endsWith(comment)) {
    return trimmed + '\n';
  }
  return `${trimmed}\n${comment}\n`;
}

type DepCacheEntry = {
  hash: string;
  imports: string[];
};

type DepCacheFile = {
  files: Record<string, DepCacheEntry>;
};

const depCache = new Map<string, DepCacheEntry>();
const lockfileCache = new Map<string, { mtimeMs: number; data: LuminaLockfile }>();

function depsCachePath(): string {
  return path.resolve(buildCache.cacheDir, 'deps.json');
}

async function loadDepsCache() {
  try {
    const raw = await fs.readFile(depsCachePath(), 'utf-8');
    const parsed = JSON.parse(raw) as DepCacheFile;
    for (const [filePath, entry] of Object.entries(parsed.files ?? {})) {
      if (entry && typeof entry.hash === 'string' && Array.isArray(entry.imports)) {
        depCache.set(filePath, entry);
      }
    }
  } catch {
    // ignore cache load failures
  }
}

async function saveDepsCache() {
  try {
    await fs.mkdir(buildCache.cacheDir, { recursive: true });
    const files: Record<string, DepCacheEntry> = {};
    for (const [filePath, entry] of depCache.entries()) {
      files[filePath] = entry;
    }
    await fs.writeFile(depsCachePath(), JSON.stringify({ files }), 'utf-8');
  } catch {
    // ignore cache write failures
  }
}

function ensureExtension(resolved: string, extensions: string[]): string {
  if (path.extname(resolved)) return resolved;
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (existsSync(candidate)) return candidate;
  }
  return resolved + (extensions[0] ?? '.lm');
}

export function setDefaultStdPath(stdPath: string) {
  configStdPath = stdPath;
}

export function setBuildConfig(config: BuildConfig) {
  configFileExtensions = config.fileExtensions;
  configStdPath = config.stdPath;
  buildCache.cacheDir = config.cacheDir;
}

function resolveImport(
  fromPath: string,
  spec: string,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
): string | null {
  if (spec.startsWith('@std/')) {
    const rel = spec.slice('@std/'.length);
    const resolved = path.resolve(stdPath, rel);
    return ensureExtension(resolved, extensions);
  }
  if (spec.startsWith('.')) {
    const base = path.dirname(fromPath);
    const resolved = path.resolve(base, spec);
    return ensureExtension(resolved, extensions);
  }
  return resolveBareImport(fromPath, spec, extensions, lockfileRoot);
}

function hasSourceBackedStdModule(
  fromPath: string,
  spec: string,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
): boolean {
  if (!spec.startsWith('@std/')) return false;
  const resolved = resolveImport(fromPath, spec, extensions, stdPath, lockfileRoot);
  return !!resolved && existsSync(resolved);
}

function shouldBundleImport(
  fromPath: string,
  spec: string,
  stdRegistry: ReturnType<typeof createStdModuleRegistry>,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
): boolean {
  return !stdRegistry.has(spec) || hasSourceBackedStdModule(fromPath, spec, extensions, stdPath, lockfileRoot);
}

function findLockfileRoot(fromPath: string): string | null {
  let current = path.dirname(fromPath);
  while (true) {
    const modern = path.join(current, LOCKFILE_FILENAME);
    const candidate = path.join(current, LEGACY_LOCKFILE_FILENAME);
    if (existsSync(modern) || existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadLockfile(root: string): LuminaLockfile | null {
  const modernLock = path.join(root, LOCKFILE_FILENAME);
  const lockPath = path.join(root, LEGACY_LOCKFILE_FILENAME);
  const candidate = existsSync(modernLock) ? modernLock : lockPath;
  try {
    const stat = statSync(candidate);
    const cached = lockfileCache.get(root);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const raw = readFileSync(candidate, 'utf-8');
    const parsed = normalizeLockfileObject(JSON.parse(raw));
    if (!parsed) return null;
    lockfileCache.set(root, { mtimeMs: stat.mtimeMs, data: parsed });
    return parsed;
  } catch {
    return null;
  }
}

function packageRootFor(root: string, pkg: NormalizedLockfilePackage): string {
  const pkgRoot = pkg.path ?? pkg.resolved;
  return path.isAbsolute(pkgRoot) ? path.resolve(pkgRoot) : path.resolve(root, pkgRoot);
}

function containingPackage(
  lockfile: LuminaLockfile,
  root: string,
  fromPath: string
): NormalizedLockfilePackage | null {
  const importer = path.resolve(fromPath);
  const matches = Object.values(lockfile.packages)
    .map((pkg) => ({ pkg, root: packageRootFor(root, pkg) }))
    .filter(({ root: pkgRoot }) => importer === pkgRoot || importer.startsWith(`${pkgRoot}${path.sep}`))
    .sort((left, right) => right.root.length - left.root.length);
  return matches[0]?.pkg ?? null;
}

function resolveBareImportDetailed(
  fromPath: string,
  spec: string,
  extensions: string[],
  lockfileRoot?: string | null
): BareResolveResult {
  const root = lockfileRoot ?? findLockfileRoot(fromPath);
  if (!root) {
    return {
      error: { code: 'PKG-004', message: `Cannot resolve package import '${spec}': ${LOCKFILE_FILENAME} not found` },
    };
  }
  const lockfile = loadLockfile(root);
  if (!lockfile) {
    return {
      error: { code: 'PKG-004', message: `Cannot resolve package import '${spec}': ${LOCKFILE_FILENAME} not found` },
    };
  }
  const { pkgName, subpath } = parsePackageSpecifier(spec);
  const selected = selectLockfilePackage(lockfile, pkgName, containingPackage(lockfile, root, fromPath));
  if ('error' in selected) {
    return {
      error: {
        code: selected.error === 'ambiguous' ? 'PKG-005' : 'PKG-001',
        message: selected.message,
      },
    };
  }
  const pkg = selected.entry;
  if (!pkg.lumina) {
    return {
      error: { code: 'PKG-002', message: `Package '${pkgName}' missing 'lumina' field in ${LOCKFILE_FILENAME}` },
    };
  }
  const lumina = pkg.lumina;
  let entry: string | undefined;
  if (subpath) {
    if (typeof lumina === 'object') {
      entry = lumina[subpath];
    }
    if (!entry) {
      return {
        error: { code: 'PKG-003', message: `Package '${pkgName}' does not export '${subpath}'` },
      };
    }
  } else if (typeof lumina === 'string') {
    entry = lumina;
  } else if (typeof lumina === 'object') {
    entry = lumina['.'];
  }
  if (!entry) {
    return { error: { code: 'PKG-003', message: `Package '${pkgName}' does not export '.'` } };
  }
  const pkgRoot = packageRootFor(root, pkg);
  const absolute = path.resolve(pkgRoot, entry);
  return { resolved: ensureExtension(absolute, extensions) };
}

function resolveBareImport(
  fromPath: string,
  spec: string,
  extensions: string[],
  lockfileRoot?: string | null
): string | null {
  const result = resolveBareImportDetailed(fromPath, spec, extensions, lockfileRoot);
  return 'resolved' in result ? result.resolved : null;
}

function collectPackageImportDiagnostics(
  filePath: string,
  source: string,
  parser: ReturnType<typeof compileGrammar>,
  extensions: string[],
  lockfileRoot?: string | null
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const imp of extractImports(source, { parser, grammarSource: filePath })) {
    if (imp.startsWith('.') || imp === '@std' || imp.startsWith('@std/')) continue;
    const result = resolveBareImportDetailed(filePath, imp, extensions, lockfileRoot);
    if ('resolved' in result) continue;
    diagnostics.push({
      severity: 'error',
      code: result.error.code,
      message: result.error.message,
      source: 'lumina',
    });
  }
  return diagnostics;
}

function buildDepGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const [filePath, entry] of depCache.entries()) {
    graph.set(filePath, entry.imports);
  }
  return graph;
}

function graphStats(graph: Map<string, string[]>): { nodes: number; edges: number } {
  let edges = 0;
  for (const deps of graph.values()) {
    edges += deps.length;
  }
  return { nodes: graph.size, edges };
}

async function updateDependenciesForFile(
  sourcePath: string,
  source: string,
  parser: ReturnType<typeof compileGrammar>,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
) {
  const fileHash = hashText(source);
  const cached = depCache.get(sourcePath);
  if (cached && cached.hash === fileHash) {
    return;
  }
  const rawImports = extractImports(source, { parser, grammarSource: sourcePath });
  const resolved = rawImports
    .map((imp) => resolveImport(sourcePath, imp, extensions, stdPath, lockfileRoot))
    .filter((imp): imp is string => Boolean(imp));
  depCache.set(sourcePath, { hash: fileHash, imports: resolved });
  await saveDepsCache();
}

async function loadGrammar(grammarPath: string) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const grammarHash = hashText(grammarText);
  if (buildCache.grammarHash !== grammarHash) {
    buildCache.grammarHash = grammarHash;
    buildCache.grammarText = grammarText;
    buildCache.parser = compileGrammar(grammarText, { cache: true });
    buildCache.files.clear();
    buildCache.stats.invalidations += 1;
  }
  return buildCache.parser as ReturnType<typeof compileGrammar>;
}

function cacheFilePath(sourcePath: string): string {
  const key = hashText(sourcePath);
  return path.resolve(buildCache.cacheDir, `${key}.json`);
}

async function readDiskCache(sourcePath: string): Promise<FileCacheEntry | null> {
  try {
    const filePath = cacheFilePath(sourcePath);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as FileCacheEntry;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(sourcePath: string, entry: FileCacheEntry) {
  try {
    await fs.mkdir(buildCache.cacheDir, { recursive: true });
    const filePath = cacheFilePath(sourcePath);
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
    buildCache.stats.writes += 1;
  } catch {
    // ignore cache write failures
  }
}

function formatDiagnosticsWithSnippet(
  source: string,
  diagnostics: readonly ReportableDiagnostic[]
) {
  for (const diag of diagnostics) {
    const code = diag.code !== undefined ? String(diag.code) : 'DIAG';
    console.error(`[${code}] ${diag.message}`);
    const explanation = getDiagnosticExplanation(code);
    if (explanation.summary && explanation.code === code) {
      console.error(`help: ${explanation.summary}`);
    }
    if (diag.location) {
      try {
        console.error(highlightSnippet(source, diag.location, true));
      } catch {
        // ignore snippet failures
      }
    }
  }
}

function reportDiagnosticsAndFail(
  source: string,
  diagnostics: readonly ReportableDiagnostic[]
): false {
  if (diagnostics.length > 0) {
    formatDiagnosticsWithSnippet(source, diagnostics);
  }
  return false;
}

function parseSource(
  source: string,
  parser: ReturnType<typeof compileGrammar>,
  useRecovery: boolean
): { ast: unknown | null; diagnostics: Diagnostic[]; parseError: boolean } {
  if (!useRecovery) {
    const parsed = parseInput(parser, source);
    if (ParserUtils.isParseError(parsed)) {
      console.error(formatError(parsed));
      return { ast: null, diagnostics: [], parseError: true };
    }
    const ast = (parsed as { result: unknown }).result;
    return { ast, diagnostics: [], parseError: false };
  }

  const result = parseWithPanicRecovery(parser, source, {
    syncTokenTypes: luminaSyncTokenTypes,
    syncKeywordValues: [
      'import',
      'type',
      'struct',
      'enum',
      'fn',
      'let',
      'return',
      'if',
      'else',
      'for',
      'while',
      'match',
      'extern',
      'pub',
    ],
    lexer: (input: string) => {
      const stream = cliLexer.reset(input);
      return {
        [Symbol.iterator]: function* () {
          for (const token of stream as Iterable<LuminaToken>) {
            yield token;
          }
        },
      };
    },
  });

  const payload = (result.result as { result?: unknown })?.result ?? result.result ?? null;
  return { ast: payload, diagnostics: result.diagnostics, parseError: payload === null };
}

type ImportBindingLite = { local: string; original: string; source: string; namespace: boolean };

function collectImportBindingsLite(program: {
  type?: string;
  body?: unknown[];
}): ImportBindingLite[] {
  const bindings: ImportBindingLite[] = [];
  if (!program || !Array.isArray(program.body)) return bindings;
  for (const stmt of program.body) {
    const node = stmt as { type?: string; spec?: unknown; source?: { value?: string } };
    if (node.type !== 'Import') continue;
    const source = node.source?.value;
    if (!source) continue;
    const spec = node.spec;
    if (Array.isArray(spec)) {
      for (const item of spec) {
        if (typeof item === 'string') {
          bindings.push({ local: item, original: item, source, namespace: false });
          continue;
        }
        if (!item || typeof item !== 'object') continue;
        const specItem = item as { name?: string; alias?: string; namespace?: boolean };
        const name = specItem.name;
        if (!name) continue;
        const local = specItem.alias ?? name;
        bindings.push({ local, original: name, source, namespace: Boolean(specItem.namespace) });
      }
      continue;
    }
    if (typeof spec === 'string') {
      bindings.push({ local: spec, original: spec, source, namespace: true });
      continue;
    }
    if (spec && typeof spec === 'object' && 'name' in (spec as { name?: string })) {
      const specItem = spec as { name?: string; alias?: string; namespace?: boolean };
      const name = specItem.name;
      if (!name) continue;
      const local = specItem.alias ?? name;
      bindings.push({ local, original: name, source, namespace: Boolean(specItem.namespace) });
    }
  }
  return bindings;
}

function parseTypeNameLite(typeName: string): { base: string; args: string[] } | null {
  const lt = typeName.indexOf('<');
  if (lt < 0) return { base: typeName, args: [] };
  if (!typeName.endsWith('>')) return null;
  const base = typeName.slice(0, lt);
  const inner = typeName.slice(lt + 1, -1);
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '<') depth += 1;
    if (ch === '>') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = inner.slice(start).trim();
  if (tail.length > 0) args.push(tail);
  return { base, args };
}

type RewriteScopeLite = {
  values: Set<string>;
  types: Set<string>;
};

const createRewriteScopeLite = (): RewriteScopeLite => ({
  values: new Set<string>(),
  types: new Set<string>(),
});

const extendValueScopeLite = (
  scope: RewriteScopeLite,
  names: Iterable<string>,
  renameMap: Map<string, string>,
  namespaceAliases: Map<string, string | null>
): RewriteScopeLite => {
  let next: Set<string> | null = null;
  for (const name of names) {
    if (!renameMap.has(name) && !namespaceAliases.has(name)) continue;
    const active = next ?? scope.values;
    if (active.has(name)) continue;
    if (!next) next = new Set(scope.values);
    next.add(name);
  }
  return next ? { ...scope, values: next } : scope;
};

const extendTypeScopeLite = (
  scope: RewriteScopeLite,
  names: Iterable<string>,
  renameMap: Map<string, string>
): RewriteScopeLite => {
  let next: Set<string> | null = null;
  for (const name of names) {
    if (!renameMap.has(name)) continue;
    const active = next ?? scope.types;
    if (active.has(name)) continue;
    if (!next) next = new Set(scope.types);
    next.add(name);
  }
  return next ? { ...scope, types: next } : scope;
};

function collectPatternBindingsLite(pattern: unknown): string[] {
  if (!pattern || typeof pattern !== 'object') return [];
  const node = pattern as {
    type?: string;
    name?: string;
    bindings?: unknown[];
    patterns?: unknown[];
    elements?: unknown[];
    fields?: Array<{ pattern?: unknown }>;
  };

  switch (node.type) {
    case 'BindingPattern':
    case 'RefBindingPattern':
      return typeof node.name === 'string' ? [node.name] : [];
    case 'EnumPattern': {
      const bindings = Array.isArray(node.bindings)
        ? node.bindings.filter((value): value is string => typeof value === 'string')
        : [];
      const nested = Array.isArray(node.patterns)
        ? node.patterns.flatMap((child) => collectPatternBindingsLite(child))
        : [];
      return [...bindings, ...nested];
    }
    case 'TuplePattern':
      return Array.isArray(node.elements)
        ? node.elements.flatMap((child) => collectPatternBindingsLite(child))
        : [];
    case 'StructPattern':
      return Array.isArray(node.fields)
        ? node.fields.flatMap((field) => collectPatternBindingsLite(field?.pattern))
        : [];
    default:
      return [];
  }
}

function rewriteTypeNameLiteScoped(
  typeExpr: unknown,
  renameMap: Map<string, string>,
  typeScope: Set<string>
): unknown {
  if (typeof typeExpr !== 'string') return typeExpr;
  const parsed = parseTypeNameLite(typeExpr);
  if (!parsed) return typeScope.has(typeExpr) ? typeExpr : (renameMap.get(typeExpr) ?? typeExpr);
  const base = typeScope.has(parsed.base)
    ? parsed.base
    : (renameMap.get(parsed.base) ?? parsed.base);
  if (parsed.args.length === 0) return base;
  const args = parsed.args.map(
    (arg) => rewriteTypeNameLiteScoped(arg, renameMap, typeScope) as string
  );
  return `${base}<${args.join(',')}>`;
}

function rewriteTypeParamsLite(
  typeParams: unknown,
  scope: RewriteScopeLite,
  renameMap: Map<string, string>
): { typeParams: unknown; scope: RewriteScopeLite } {
  if (!Array.isArray(typeParams)) return { typeParams, scope };
  let currentScope = scope;
  const rewritten = typeParams.map((param) => {
    const node = param as { name?: unknown; bound?: unknown[] };
    const next = { ...(param as Record<string, unknown>) };
    if (Array.isArray(node.bound)) {
      next.bound = node.bound.map((bound) =>
        rewriteTypeNameLiteScoped(bound, renameMap, currentScope.types)
      );
    }
    if (typeof node.name === 'string') {
      currentScope = extendTypeScopeLite(currentScope, [node.name], renameMap);
    }
    return next;
  });
  return { typeParams: rewritten, scope: currentScope };
}

function rewriteProgramImports(
  program: { type?: string; body?: unknown[] },
  renameMap: Map<string, string>,
  namespaceAliases: Map<string, string | null>,
  resolvedImports: Set<string>,
  namespaceMemberRenames: Map<string, Map<string, string>> = new Map()
): { type: string; body: unknown[]; location?: unknown } {
  const makeIdentifier = (name: string, location?: unknown) => ({
    type: 'Identifier',
    name,
    location,
  });
  const rewriteWhereTypeBounds = (bounds: unknown, scope: RewriteScopeLite): unknown =>
    Array.isArray(bounds)
      ? bounds.map((bound) => {
          const node = bound as { bounds?: unknown[] };
          return {
            ...(bound as Record<string, unknown>),
            bounds: Array.isArray(node.bounds)
              ? node.bounds.map((entry) => rewriteTypeNameLiteScoped(entry, renameMap, scope.types))
              : node.bounds,
          };
        })
      : bounds;

  const rewritePattern = (pattern: unknown, scope: RewriteScopeLite): unknown => {
    if (!pattern || typeof pattern !== 'object') return pattern;
    const node = pattern as {
      type?: string;
      enumName?: string | null;
      name?: string;
      fields?: unknown[];
      patterns?: unknown[];
    };
    switch (node.type) {
      case 'EnumPattern':
        if (node.enumName) {
          if (!scope.types.has(node.enumName) && renameMap.has(node.enumName)) {
            node.enumName = renameMap.get(node.enumName) ?? node.enumName;
          } else if (!scope.values.has(node.enumName) && namespaceAliases.has(node.enumName)) {
            const replacement = namespaceAliases.get(node.enumName);
            node.enumName = replacement ?? null;
          }
        }
        if (Array.isArray(node.patterns)) {
          node.patterns = node.patterns.map((child) => rewritePattern(child, scope));
        }
        return node;
      case 'TuplePattern':
        if (Array.isArray((node as { elements?: unknown[] }).elements)) {
          (node as { elements: unknown[] }).elements = (
            node as { elements: unknown[] }
          ).elements.map((child) => rewritePattern(child, scope));
        }
        return node;
      case 'StructPattern':
        if (
          typeof node.name === 'string' &&
          !scope.types.has(node.name) &&
          renameMap.has(node.name)
        ) {
          node.name = renameMap.get(node.name) ?? node.name;
        }
        if (Array.isArray(node.fields)) {
          node.fields = node.fields.map((field) => ({
            ...(field as Record<string, unknown>),
            pattern: rewritePattern((field as { pattern?: unknown }).pattern, scope),
          }));
        }
        return node;
      default:
        return node;
    }
  };

  const rewriteExpr = (expr: unknown, scope: RewriteScopeLite): unknown => {
    if (!expr || typeof expr !== 'object') return expr;
    const node = expr as { type?: string; [key: string]: unknown };
    switch (node.type) {
      case 'Identifier': {
        const name = node.name as string | undefined;
        if (name && !scope.values.has(name) && renameMap.has(name)) {
          node.name = renameMap.get(name);
        }
        return node;
      }
      case 'Call': {
        const enumName = node.enumName as string | null | undefined;
        if (enumName) {
          if (!scope.types.has(enumName) && renameMap.has(enumName)) {
            node.enumName = renameMap.get(enumName);
          } else if (!scope.values.has(enumName) && namespaceAliases.has(enumName)) {
            const replacement = namespaceAliases.get(enumName);
            node.enumName = replacement ?? null;
          }
        }
        const callee = node.callee as { name?: string } | undefined;
        if (
          !node.receiver &&
          !enumName &&
          callee?.name &&
          !scope.values.has(callee.name) &&
          renameMap.has(callee.name)
        ) {
          callee.name = renameMap.get(callee.name);
        }
        if (Array.isArray(node.typeArgs)) {
          node.typeArgs = node.typeArgs.map((arg) =>
            rewriteTypeNameLiteScoped(arg, renameMap, scope.types)
          );
        }
        if (node.receiver) {
          node.receiver = rewriteExpr(node.receiver, scope);
        }
        if (Array.isArray(node.args)) {
          node.args = node.args.map((arg) => {
            if (arg && typeof arg === 'object' && 'value' in (arg as { value?: unknown })) {
              return {
                ...(arg as Record<string, unknown>),
                value: rewriteExpr((arg as { value?: unknown }).value, scope),
              };
            }
            return rewriteExpr(arg, scope);
          });
        }
        return node;
      }
      case 'Member': {
        const object = node.object as { type?: string; name?: string } | undefined;
        if (
          object?.type === 'Identifier' &&
          object.name &&
          !scope.values.has(object.name) &&
          namespaceAliases.has(object.name)
        ) {
          const replacement = namespaceAliases.get(object.name);
          if (replacement) {
            object.name = replacement;
            node.object = object;
            return node;
          }
          const propertyName = String(node.property ?? '');
          const memberMap = namespaceMemberRenames.get(object.name);
          return makeIdentifier(memberMap?.get(propertyName) ?? propertyName, node.location);
        }
        node.object = rewriteExpr(node.object, scope);
        return node;
      }
      case 'Binary':
        node.left = rewriteExpr(node.left, scope);
        node.right = rewriteExpr(node.right, scope);
        return node;
      case 'ArrayLiteral':
        if (Array.isArray(node.elements)) {
          node.elements = node.elements.map((element) => rewriteExpr(element, scope));
        }
        return node;
      case 'ArrayRepeatLiteral':
        node.value = rewriteExpr(node.value, scope);
        node.count = rewriteExpr(node.count, scope);
        return node;
      case 'Lambda':
      case 'FnExpr': {
        let lambdaScope = scope;
        if (Array.isArray(node.typeParams)) {
          const rewrittenTypeParams = rewriteTypeParamsLite(
            node.typeParams,
            lambdaScope,
            renameMap
          );
          node.typeParams = rewrittenTypeParams.typeParams as never;
          lambdaScope = rewrittenTypeParams.scope;
        }
        if (Array.isArray(node.params)) {
          node.params = node.params.map(
            (param: { name?: unknown; typeName?: unknown; defaultValue?: unknown }) => {
              const rewritten = {
                ...param,
                typeName: rewriteTypeNameLiteScoped(param.typeName, renameMap, lambdaScope.types),
                defaultValue:
                  'defaultValue' in param
                    ? rewriteExpr(param.defaultValue, lambdaScope)
                    : param.defaultValue,
              };
              if (typeof param.name === 'string') {
                lambdaScope = extendValueScopeLite(
                  lambdaScope,
                  [param.name],
                  renameMap,
                  namespaceAliases
                );
              }
              return rewritten;
            }
          );
        }
        node.returnType = rewriteTypeNameLiteScoped(node.returnType, renameMap, lambdaScope.types);
        node.body = rewriteStmt(node.body, false, lambdaScope);
        return node;
      }
      case 'Move':
        node.target = rewriteExpr(node.target, scope);
        return node;
      case 'Await':
      case 'Try':
        node.value = rewriteExpr(node.value, scope);
        return node;
      case 'Cast':
        node.expr = rewriteExpr(node.expr, scope);
        node.targetType = rewriteTypeNameLiteScoped(node.targetType, renameMap, scope.types);
        return node;
      case 'StructLiteral': {
        const name = node.name as string | undefined;
        if (name && !scope.types.has(name) && renameMap.has(name)) {
          node.name = renameMap.get(name);
        }
        if (Array.isArray(node.typeArgs)) {
          node.typeArgs = node.typeArgs.map((arg) =>
            rewriteTypeNameLiteScoped(arg, renameMap, scope.types)
          );
        }
        if (Array.isArray(node.fields)) {
          node.fields = node.fields.map((field: { value?: unknown }) => ({
            ...field,
            value: rewriteExpr(field.value, scope),
          }));
        }
        return node;
      }
      case 'MatchExpr': {
        node.value = rewriteExpr(node.value, scope);
        if (Array.isArray(node.arms)) {
          node.arms = node.arms.map(
            (arm: { pattern?: unknown; guard?: unknown; body?: unknown }) => {
              const pattern = rewritePattern(arm.pattern, scope);
              const armScope = extendValueScopeLite(
                scope,
                collectPatternBindingsLite(pattern),
                renameMap,
                namespaceAliases
              );
              return {
                ...arm,
                pattern,
                guard: rewriteExpr(arm.guard, armScope),
                body: rewriteExpr(arm.body, armScope),
              };
            }
          );
        }
        return node;
      }
      case 'IsExpr': {
        const enumName = node.enumName as string | null | undefined;
        if (enumName) {
          if (!scope.types.has(enumName) && renameMap.has(enumName)) {
            node.enumName = renameMap.get(enumName);
          } else if (!scope.values.has(enumName) && namespaceAliases.has(enumName)) {
            const replacement = namespaceAliases.get(enumName);
            node.enumName = replacement ?? null;
          }
        }
        node.value = rewriteExpr(node.value, scope);
        return node;
      }
      case 'InterpolatedString':
        if (Array.isArray(node.parts)) {
          node.parts = node.parts.map((part) =>
            typeof part === 'string' ? part : rewriteExpr(part, scope)
          );
        }
        return node;
      case 'TupleLiteral':
        if (Array.isArray(node.elements)) {
          node.elements = node.elements.map((element) => rewriteExpr(element, scope));
        }
        return node;
      case 'Index':
        node.object = rewriteExpr(node.object, scope);
        node.index = rewriteExpr(node.index, scope);
        return node;
      case 'Range':
        node.start = rewriteExpr(node.start, scope);
        node.end = rewriteExpr(node.end, scope);
        return node;
      case 'SelectExpr':
        if (Array.isArray(node.arms)) {
          node.arms = node.arms.map(
            (arm: { binding?: unknown; value?: unknown; body?: unknown }) => {
              const armScope =
                typeof arm.binding === 'string'
                  ? extendValueScopeLite(scope, [arm.binding], renameMap, namespaceAliases)
                  : scope;
              return {
                ...arm,
                value: rewriteExpr(arm.value, scope),
                body: rewriteExpr(arm.body, armScope),
              };
            }
          );
        }
        return node;
      case 'ListComprehension': {
        node.source = rewriteExpr(node.source, scope);
        let comprehensionScope = extendValueScopeLite(
          scope,
          [String(node.binding ?? '')],
          renameMap,
          namespaceAliases
        );
        if (node.source2) {
          node.source2 = rewriteExpr(node.source2, comprehensionScope);
        }
        if (typeof node.binding2 === 'string') {
          comprehensionScope = extendValueScopeLite(
            comprehensionScope,
            [node.binding2],
            renameMap,
            namespaceAliases
          );
        }
        node.filter = rewriteExpr(node.filter, comprehensionScope);
        node.body = rewriteExpr(node.body, comprehensionScope);
        return node;
      }
      case 'MacroInvoke':
        if (Array.isArray(node.args)) {
          node.args = node.args.map((arg) => rewriteExpr(arg, scope));
        }
        return node;
      default:
        return node;
    }
  };

  const extendScopeForStmt = (scope: RewriteScopeLite, stmt: unknown): RewriteScopeLite => {
    if (!stmt || typeof stmt !== 'object') return scope;
    const node = stmt as { type?: string; name?: string; names?: unknown[]; pattern?: unknown };
    switch (node.type) {
      case 'Let':
        return typeof node.name === 'string'
          ? extendValueScopeLite(scope, [node.name], renameMap, namespaceAliases)
          : scope;
      case 'LetTuple':
        return Array.isArray(node.names)
          ? extendValueScopeLite(
              scope,
              node.names.filter((name): name is string => typeof name === 'string'),
              renameMap,
              namespaceAliases
            )
          : scope;
      case 'LetElse':
        return extendValueScopeLite(
          scope,
          collectPatternBindingsLite(node.pattern),
          renameMap,
          namespaceAliases
        );
      case 'FnDecl':
        return typeof node.name === 'string'
          ? extendValueScopeLite(scope, [node.name], renameMap, namespaceAliases)
          : scope;
      default:
        return scope;
    }
  };

  const rewriteStmt = (stmt: unknown, isTopLevel: boolean, scope: RewriteScopeLite): unknown => {
    if (!stmt || typeof stmt !== 'object') return stmt;
    const node = stmt as { type?: string; [key: string]: unknown };
    if (isTopLevel && typeof node.name === 'string' && renameMap.has(node.name)) {
      node.name = renameMap.get(node.name);
    }
    switch (node.type) {
      case 'FnDecl': {
        let bodyScope = scope;
        if (Array.isArray(node.typeParams)) {
          const rewrittenTypeParams = rewriteTypeParamsLite(node.typeParams, bodyScope, renameMap);
          node.typeParams = rewrittenTypeParams.typeParams as never;
          bodyScope = rewrittenTypeParams.scope;
        }
        if (Array.isArray(node.params)) {
          node.params = node.params.map(
            (param: { name?: unknown; typeName?: unknown; defaultValue?: unknown }) => {
              const rewritten = {
                ...param,
                typeName: rewriteTypeNameLiteScoped(param.typeName, renameMap, bodyScope.types),
                defaultValue:
                  'defaultValue' in param
                    ? rewriteExpr(param.defaultValue, bodyScope)
                    : param.defaultValue,
              };
              if (typeof param.name === 'string') {
                bodyScope = extendValueScopeLite(
                  bodyScope,
                  [param.name],
                  renameMap,
                  namespaceAliases
                );
              }
              return rewritten;
            }
          );
        }
        if (!isTopLevel && typeof node.name === 'string') {
          bodyScope = extendValueScopeLite(bodyScope, [node.name], renameMap, namespaceAliases);
        }
        node.returnType = rewriteTypeNameLiteScoped(node.returnType, renameMap, bodyScope.types);
        node.whereTypeBounds = rewriteWhereTypeBounds(node.whereTypeBounds, bodyScope);
        node.body = rewriteStmt(node.body, false, bodyScope);
        return node;
      }
      case 'Let':
        node.typeName = rewriteTypeNameLiteScoped(node.typeName, renameMap, scope.types);
        node.value = rewriteExpr(node.value, scope);
        return node;
      case 'LetTuple':
        node.value = rewriteExpr(node.value, scope);
        return node;
      case 'LetElse':
        node.pattern = rewritePattern(node.pattern, scope);
        node.value = rewriteExpr(node.value, scope);
        node.elseBlock = rewriteStmt(node.elseBlock, false, scope);
        return node;
      case 'Return':
        node.value = rewriteExpr(node.value, scope);
        return node;
      case 'Assign':
        node.target = rewriteExpr(node.target, scope);
        node.value = rewriteExpr(node.value, scope);
        return node;
      case 'ExprStmt':
        node.expr = rewriteExpr(node.expr, scope);
        return node;
      case 'If':
        node.condition = rewriteExpr(node.condition, scope);
        node.thenBlock = rewriteStmt(node.thenBlock, false, scope);
        if (node.elseBlock) node.elseBlock = rewriteStmt(node.elseBlock, false, scope);
        return node;
      case 'IfLet': {
        const pattern = rewritePattern(node.pattern, scope);
        const thenScope = extendValueScopeLite(
          scope,
          collectPatternBindingsLite(pattern),
          renameMap,
          namespaceAliases
        );
        node.pattern = pattern;
        node.value = rewriteExpr(node.value, scope);
        node.thenBlock = rewriteStmt(node.thenBlock, false, thenScope);
        if (node.elseBlock) node.elseBlock = rewriteStmt(node.elseBlock, false, scope);
        return node;
      }
      case 'While':
        node.condition = rewriteExpr(node.condition, scope);
        node.body = rewriteStmt(node.body, false, scope);
        return node;
      case 'WhileLet': {
        const pattern = rewritePattern(node.pattern, scope);
        const bodyScope = extendValueScopeLite(
          scope,
          collectPatternBindingsLite(pattern),
          renameMap,
          namespaceAliases
        );
        node.pattern = pattern;
        node.value = rewriteExpr(node.value, scope);
        node.body = rewriteStmt(node.body, false, bodyScope);
        return node;
      }
      case 'For': {
        node.iterable = rewriteExpr(node.iterable, scope);
        const bodyScope =
          typeof node.iterator === 'string'
            ? extendValueScopeLite(scope, [node.iterator], renameMap, namespaceAliases)
            : scope;
        node.body = rewriteStmt(node.body, false, bodyScope);
        return node;
      }
      case 'MatchStmt':
        node.value = rewriteExpr(node.value, scope);
        if (Array.isArray(node.arms)) {
          node.arms = node.arms.map(
            (arm: { pattern?: unknown; guard?: unknown; body?: unknown }) => {
              const pattern = rewritePattern(arm.pattern, scope);
              const armScope = extendValueScopeLite(
                scope,
                collectPatternBindingsLite(pattern),
                renameMap,
                namespaceAliases
              );
              return {
                ...arm,
                pattern,
                guard: rewriteExpr(arm.guard, armScope),
                body: rewriteStmt(arm.body, false, armScope),
              };
            }
          );
        }
        return node;
      case 'Block':
        if (Array.isArray(node.body)) {
          let blockScope = scope;
          node.body = node.body.map((child) => {
            const rewritten = rewriteStmt(child, false, blockScope);
            blockScope = extendScopeForStmt(blockScope, child);
            return rewritten;
          });
        }
        return node;
      case 'StructDecl':
      case 'TypeDecl': {
        let typeScope = scope;
        if (Array.isArray(node.typeParams)) {
          const rewrittenTypeParams = rewriteTypeParamsLite(node.typeParams, typeScope, renameMap);
          node.typeParams = rewrittenTypeParams.typeParams as never;
          typeScope = rewrittenTypeParams.scope;
        }
        if (node.aliasType !== undefined) {
          node.aliasType = rewriteTypeNameLiteScoped(node.aliasType, renameMap, typeScope.types);
        }
        if (Array.isArray(node.body)) {
          node.body = node.body.map((field: { typeName?: unknown }) => ({
            ...field,
            typeName: rewriteTypeNameLiteScoped(field.typeName, renameMap, typeScope.types),
          }));
        }
        return node;
      }
      case 'EnumDecl': {
        let typeScope = scope;
        if (Array.isArray(node.typeParams)) {
          const rewrittenTypeParams = rewriteTypeParamsLite(node.typeParams, typeScope, renameMap);
          node.typeParams = rewrittenTypeParams.typeParams as never;
          typeScope = rewrittenTypeParams.scope;
        }
        if (Array.isArray(node.variants)) {
          node.variants = node.variants.map((variant: { params?: unknown[] }) => ({
            ...variant,
            params: Array.isArray(variant.params)
              ? variant.params.map((param) =>
                  rewriteTypeNameLiteScoped(param, renameMap, typeScope.types)
                )
              : variant.params,
          }));
        }
        return node;
      }
      case 'StructLiteral':
      case 'MatchExpr':
        return rewriteExpr(node, scope);
      default:
        return node;
    }
  };

  const rootScope = createRewriteScopeLite();
  const body = Array.isArray(program.body)
    ? program.body
        .filter((stmt) => {
          const node = stmt as { type?: string; source?: { value?: string } };
          if (node.type !== 'Import') return true;
          const source = node.source?.value ?? '';
          return !resolvedImports.has(source);
        })
        .map((stmt) => rewriteStmt(stmt, true, rootScope))
    : [];

  return { type: 'Program', body, location: (program as { location?: unknown }).location };
}

function makeBundledSymbolName(moduleIndex: number, original: string, used: Set<string>): string {
  const safeOriginal = original.replace(/[^A-Za-z0-9_]/g, '_');
  const base = `__lumina_bundle_${moduleIndex}_${safeOriginal}`;
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix++}`;
  }
  used.add(candidate);
  return candidate;
}

async function bundleProgram(
  entryPath: string,
  parser: ReturnType<typeof compileGrammar>,
  useRecovery: boolean,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
): Promise<{ program: unknown; sources: Map<string, string> } | null> {
  const stdRegistry = createStdModuleRegistry();
  const visited = new Map<
    string,
    { ast: unknown; text: string; bindings: ImportBindingLite[]; resolvedImports: Set<string> }
  >();
  const order: string[] = [];
  const sources = new Map<string, string>();

  const visit = async (filePath: string): Promise<boolean> => {
    if (visited.has(filePath)) return true;
    const text = await fs.readFile(filePath, 'utf-8');
    const { ast, diagnostics, parseError } = parseSource(text, parser, useRecovery);
    if (parseError) return false;
    if (diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(text, diagnostics);
      return false;
    }
    const packageDiagnostics = collectPackageImportDiagnostics(filePath, text, parser, extensions, lockfileRoot);
    if (packageDiagnostics.length > 0) {
      formatDiagnosticsWithSnippet(text, packageDiagnostics);
      return false;
    }
    if (!ast) return false;
    const bindings = collectImportBindingsLite(ast as { type?: string; body?: unknown[] });
    const resolvedImports = new Set<string>();
    visited.set(filePath, { ast, text, bindings, resolvedImports });
    sources.set(filePath, text);

    const imports = extractImports(text, { parser, grammarSource: filePath });
    for (const imp of imports) {
      if (!shouldBundleImport(filePath, imp, stdRegistry, extensions, stdPath, lockfileRoot)) continue;
      const resolved = resolveImport(filePath, imp, extensions, stdPath, lockfileRoot);
      if (!resolved) continue;
      resolvedImports.add(imp);
      const ok = await visit(resolved);
      if (!ok) return false;
    }
    order.push(filePath);
    return true;
  };

  const ok = await visit(entryPath);
  if (!ok) return null;

  const bundledDeclarationRenames = new Map<string, Map<string, string>>();
  const usedBundledNames = new Set<string>();
  order.forEach((filePath, index) => {
    if (filePath === entryPath) return;
    const entry = visited.get(filePath);
    if (!entry) return;
    const exportEnv = collectModuleExportEnv(entry.ast);
    const renameMap = new Map<string, string>();
    for (const name of [...exportEnv.symbols.keys(), ...exportEnv.types.keys()]) {
      renameMap.set(name, makeBundledSymbolName(index, name, usedBundledNames));
    }
    bundledDeclarationRenames.set(filePath, renameMap);
  });

  const mergedBody: unknown[] = [];
  for (const filePath of order) {
    const entry = visited.get(filePath);
    if (!entry) continue;
    const renameMap = new Map<string, string>(bundledDeclarationRenames.get(filePath) ?? []);
    const namespaceAliases = new Map<string, string | null>();
    const namespaceMemberRenames = new Map<string, Map<string, string>>();
    for (const binding of entry.bindings) {
      if (!entry.resolvedImports.has(binding.source)) continue;
      const resolved = resolveImport(filePath, binding.source, extensions, stdPath, lockfileRoot);
      const importedRenames = resolved ? bundledDeclarationRenames.get(resolved) : undefined;
      if (binding.namespace) {
        namespaceAliases.set(binding.local, null);
        if (importedRenames) {
          namespaceMemberRenames.set(binding.local, importedRenames);
        }
        continue;
      }
      const targetName = importedRenames?.get(binding.original) ?? binding.original;
      if (binding.local !== targetName) {
        renameMap.set(binding.local, targetName);
      }
    }
    const rewritten = rewriteProgramImports(
      entry.ast as { type?: string; body?: unknown[] },
      renameMap,
      namespaceAliases,
      entry.resolvedImports,
      namespaceMemberRenames
    );
    if (Array.isArray(rewritten.body)) {
      mergedBody.push(...rewritten.body);
    }
  }

  return { program: { type: 'Program', body: mergedBody }, sources };
}

async function runSsgCommand(options: {
  sourcePath: string;
  outPath: string;
  exportName: string;
  propsJson?: string;
  title?: string;
  lang?: string;
  hydrateModule?: string;
  grammarPath: string;
  useRecovery: boolean;
}): Promise<boolean> {
  const grammar = await fs.readFile(options.grammarPath, 'utf-8');
  const parser = compileGrammar(grammar, { cache: true });
  const bundled = await bundleProgram(
    options.sourcePath,
    parser,
    options.useRecovery,
    configFileExtensions,
    configStdPath,
    findLockfileRoot(options.sourcePath)
  );

  if (!bundled) return false;

  const sourceContent = bundled.sources.get(options.sourcePath) ?? '';
  const generated = generateJSFromAst(bundled.program as never, {
    target: 'esm',
    includeRuntime: true,
    sourceMap: false,
    sourceFile: options.sourcePath,
    sourceContent,
  }).code;
  const entryExportPattern = new RegExp(
    `export\\s+(?:function|const|let|var|\\{[^}]*\\b${options.exportName}\\b)`
  );
  const bundledSource = entryExportPattern.test(generated)
    ? generated
    : `${generated.trimEnd()}\nexport { ${options.exportName} };\n`;

  const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.lumina-ssg-'));
  const tempEntry = path.join(tempDir, 'entry.mjs');

  try {
    await fs.writeFile(tempEntry, bundledSource, 'utf-8');
    await ensureRuntimeForOutput(tempEntry, 'esm');

    let props: unknown = undefined;
    if (typeof options.propsJson === 'string' && options.propsJson.trim().length > 0) {
      try {
        props = JSON.parse(options.propsJson);
      } catch (error) {
        console.error(
          `Invalid --props JSON: ${error instanceof Error ? error.message : String(error)}`
        );
        return false;
      }
    }

    const runnerSource = `
      import * as entry from ${JSON.stringify(pathToFileURL(tempEntry).href)};
      import * as runtime from ${JSON.stringify(pathToFileURL(path.join(tempDir, 'lumina-runtime.js')).href)};
      const exported = entry[${JSON.stringify(options.exportName)}];
      if (typeof exported !== 'function') {
        throw new Error(${JSON.stringify(`SSG export '${options.exportName}' was not found in ${options.sourcePath}`)});
      }
      const props = ${JSON.stringify(props ?? null)};
      const createHydrationState = () => ({
        props,
        route: runtime.router?.getCurrentPath?.() ?? '/',
        resources: runtime.devtoolsSnapshot?.().resources ?? [],
      });
      const serializeHydrationState = (value) => JSON.stringify(value ?? null)
        .replace(/</g, '\\\\u003c')
        .replace(/\\u2028/g, '\\\\u2028')
        .replace(/\\u2029/g, '\\\\u2029');
      const ensureHydrationState = (html) => {
        if (html.includes('__lumina-hydration')) return html;
        const script = '<script type="application/json" id="__lumina-hydration">' + serializeHydrationState(hydrationState) + '</script>';
        return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
      };
      const result = await exported(props === null ? undefined : props);
      const hydrationState = createHydrationState();
      const html = typeof result === 'string' && result.trimStart().toLowerCase().startsWith('<!doctype')
        ? result
        : runtime.ssgPage(result, {
            title: ${JSON.stringify(options.title ?? '')},
            lang: ${JSON.stringify(options.lang ?? 'en')},
            hydrateModule: ${JSON.stringify(options.hydrateModule ?? '')},
            hydrationState,
          });
      process.stdout.write(ensureHydrationState(html));
    `;

    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', runnerSource], {
      encoding: 'utf-8',
      cwd: path.dirname(options.sourcePath),
    });

    if (child.status !== 0) {
      const stderr = String(child.stderr ?? '').trim();
      console.error(stderr.length > 0 ? stderr : `SSG execution failed for ${options.sourcePath}`);
      return false;
    }

    const html = String(child.stdout ?? '');
    await fs.mkdir(path.dirname(options.outPath), { recursive: true });
    await fs.writeFile(options.outPath, html, 'utf-8');
    console.log(`Lumina SSG: ${options.outPath}`);
    return true;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function monomorphizeAst(
  program: unknown,
  options: { noInline?: boolean; noComptime?: boolean } = {}
): { ast: unknown; diagnostics: Diagnostic[] } {
  const hm = inferProgram(program as never, { useRowPolymorphism: true });
  const cloned = JSON.parse(JSON.stringify(program)) as never;
  const monomorphized = monomorphize(cloned, { inferredCalls: hm.inferredCalls });
  const comptimeResult = options.noComptime
    ? { ast: monomorphized, diagnostics: [] as Diagnostic[] }
    : comptimePass(monomorphized as never);
  const inlined = options.noInline
    ? comptimeResult.ast
    : inlinePass(comptimeResult.ast as never).ast;
  return {
    ast: fuseVecPipelines(inlined as never),
    diagnostics: comptimeResult.diagnostics ?? [],
  };
}

function collectModuleExportEnv(program: unknown): ExportEnv {
  const symbols = new Map<string, { name: string; kind: string }>();
  const types = new Map<string, { name: string }>();
  const body = (program as { body?: unknown[] } | null)?.body;
  if (!Array.isArray(body)) return { symbols, types };
  for (const stmt of body) {
    if (!stmt || typeof stmt !== 'object') continue;
    const node = stmt as { type?: string; name?: string };
    if (!node.type || !node.name) continue;
    if (
      node.type === 'FnDecl' ||
      node.type === 'Let' ||
      node.type === 'TraitDecl' ||
      node.type === 'ImplDecl'
    ) {
      symbols.set(node.name, { name: node.name, kind: node.type });
      continue;
    }
    if (node.type === 'StructDecl' || node.type === 'EnumDecl' || node.type === 'TypeDecl') {
      types.set(node.name, { name: node.name });
    }
  }
  return { symbols, types };
}

function createModuleGraphCompileNode(
  parser: ReturnType<typeof compileGrammar>,
  useRecovery: boolean
) {
  return async ({ node }: { node: { path: string | null } }) => {
    if (!node.path) return { skipCacheWrite: true };
    const nodeSource = await fs.readFile(node.path, 'utf-8');
    const { ast, diagnostics, parseError } = parseSource(nodeSource, parser, useRecovery);
    if (parseError || !ast) {
      if (diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(nodeSource, diagnostics);
      }
      return {
        diagnostics,
        ast: null,
        exportEnv: null,
        skipCacheWrite: true,
      };
    }
    return {
      ast: ast as never,
      exportEnv: collectModuleExportEnv(ast),
      diagnostics,
    };
  };
}

function formatModuleGraphDiagnostics(result: { diagnostics: Map<string, Diagnostic[]> }): void {
  for (const [nodeKey, diagnostics] of result.diagnostics.entries()) {
    const first = diagnostics.find((diag) => diag.severity === 'error');
    if (!first) continue;
    console.error(`[${first.code ?? 'DIAG'}] ${first.message} (${nodeKey})`);
  }
}

function programUsesAstOnlySyntax(program: unknown): boolean {
  const visitExpr = (expr: unknown): boolean => {
    if (!expr || typeof expr !== 'object') return false;
    const node = expr as { type?: string; [key: string]: unknown };
    if (
      node.type === 'Lambda' ||
      node.type === 'ListComprehension' ||
      node.type === 'ArrayLiteral' ||
      node.type === 'TupleLiteral' ||
      node.type === 'SelectExpr'
    ) {
      return true;
    }
    switch (node.type) {
      case 'Binary':
        return visitExpr(node.left) || visitExpr(node.right);
      case 'Call':
        return (
          visitExpr(node.receiver) ||
          (Array.isArray(node.args)
            ? node.args.some((arg) => visitExpr((arg as { value?: unknown }).value ?? arg))
            : false)
        );
      case 'ArrayLiteral':
        return Array.isArray(node.elements)
          ? node.elements.some((element) => visitExpr(element))
          : false;
      case 'Member':
        return visitExpr(node.object);
      case 'StructLiteral':
        return Array.isArray(node.fields)
          ? node.fields.some((field) => visitExpr((field as { value?: unknown }).value))
          : false;
      case 'MatchExpr':
        return (
          visitExpr(node.value) ||
          (Array.isArray(node.arms)
            ? node.arms.some((arm) => {
                const armNode = arm as {
                  body?: unknown;
                  guard?: unknown;
                  pattern?: { type?: string };
                };
                if (armNode.guard && visitExpr(armNode.guard)) return true;
                const patternType = armNode.pattern?.type;
                if (
                  patternType &&
                  patternType !== 'EnumPattern' &&
                  patternType !== 'WildcardPattern'
                )
                  return true;
                return visitExpr(armNode.body);
              })
            : false)
        );
      case 'IsExpr':
      case 'Cast':
      case 'Await':
      case 'Try':
      case 'Move':
        return visitExpr(node.value ?? node.expr ?? node.target);
      case 'InterpolatedString':
        return Array.isArray(node.parts)
          ? node.parts.some((part) => typeof part === 'object' && part !== null && visitExpr(part))
          : false;
      case 'SelectExpr':
        return Array.isArray(node.arms)
          ? node.arms.some((arm) => {
              const armNode = arm as { value?: unknown; body?: unknown };
              return visitExpr(armNode.value) || visitExpr(armNode.body);
            })
          : false;
      case 'Range':
        return visitExpr(node.start) || visitExpr(node.end);
      case 'Index':
        return visitExpr(node.object) || visitExpr(node.index);
      default:
        return false;
    }
  };

  const visitStmt = (stmt: unknown): boolean => {
    if (!stmt || typeof stmt !== 'object') return false;
    const node = stmt as { type?: string; [key: string]: unknown };
    switch (node.type) {
      case 'FnDecl':
        return Array.isArray((node.body as { body?: unknown[] } | undefined)?.body)
          ? (node.body as { body: unknown[] }).body.some((inner) => visitStmt(inner))
          : false;
      case 'LetElse':
      case 'IfLet':
      case 'WhileLet':
      case 'Break':
      case 'Continue':
        return true;
      case 'Let':
      case 'Return':
      case 'ExprStmt':
        return visitExpr(node.value ?? node.expr);
      case 'Assign':
        return visitExpr(node.target) || visitExpr(node.value);
      case 'If':
        return (
          visitExpr(node.condition) ||
          visitStmt(node.thenBlock) ||
          (node.elseBlock ? visitStmt(node.elseBlock) : false)
        );
      case 'While':
        return visitExpr(node.condition) || visitStmt(node.body);
      case 'MatchStmt':
        return (
          visitExpr(node.value) ||
          (Array.isArray(node.arms)
            ? node.arms.some((arm) => {
                const armNode = arm as {
                  body?: unknown;
                  guard?: unknown;
                  pattern?: { type?: string };
                };
                if (armNode.guard && visitExpr(armNode.guard)) return true;
                const patternType = armNode.pattern?.type;
                if (
                  patternType &&
                  patternType !== 'EnumPattern' &&
                  patternType !== 'WildcardPattern'
                )
                  return true;
                return visitStmt(armNode.body);
              })
            : false)
        );
      case 'Block':
      case 'Program':
        return Array.isArray(node.body) ? node.body.some((inner) => visitStmt(inner)) : false;
      default:
        return false;
    }
  };

  const body = (program as { body?: unknown[] } | null)?.body;
  return Array.isArray(body) ? body.some((stmt) => visitStmt(stmt)) : false;
}

async function compileLuminaTopologically(
  sourcePath: string,
  outPath: string,
  target: Target,
  emitWat: boolean,
  semanticTarget: AnalyzeTarget,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  useAstJs: boolean,
  noOptimize: boolean,
  noInline: boolean,
  noComptime: boolean,
  sourceMap: boolean,
  inlineSourceMap: boolean,
  stopOnUnresolvedMemberError: boolean
) {
  const parser = await loadGrammar(grammarPath);
  const lockfileRoot = findLockfileRoot(sourcePath);
  const graph = await buildModuleGraph(sourcePath, {
    stdPath: configStdPath,
    fileExtensions: configFileExtensions,
    lockfileRoot,
    grammarPath,
  });

  if (graph.cycleErrors.length > 0) {
    for (const cycle of graph.cycleErrors) {
      console.error(`[MODULE-CYCLE-001] ${cycle.message}`);
    }
    return { ok: false, map: undefined, ir: undefined };
  }

  const topoResult = await compileInOrder(graph, {
    compileNode: createModuleGraphCompileNode(parser, useRecovery),
  });

  if (!topoResult.success) {
    formatModuleGraphDiagnostics(topoResult);
    return { ok: false, map: undefined, ir: undefined };
  }

  // Topological mode validates and caches module units first, then emits via the current
  // stable compiler pipeline to preserve output parity during rollout.
  return compileLumina(
    sourcePath,
    outPath,
    target,
    emitWat,
    semanticTarget,
    grammarPath,
    useRecovery,
    diCfg,
    useAstJs,
    noOptimize,
    noInline,
    noComptime,
    sourceMap,
    inlineSourceMap,
    stopOnUnresolvedMemberError
  );
}

async function compileLumina(
  sourcePath: string,
  outPath: string,
  target: Target,
  emitWat: boolean,
  semanticTarget: AnalyzeTarget,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  useAstJs: boolean,
  noOptimize: boolean,
  noInline: boolean,
  noComptime: boolean,
  sourceMap: boolean,
  inlineSourceMap: boolean,
  stopOnUnresolvedMemberError: boolean
): Promise<CompileLuminaResult> {
  if (target === 'dual') {
    const outDir = validateOutputPath(outPath);
    const esmOut = path.join(outDir, 'esm', 'index.js');
    const cjsOut = path.join(outDir, 'cjs', 'index.cjs');
    await fs.mkdir(path.dirname(esmOut), { recursive: true });
    await fs.mkdir(path.dirname(cjsOut), { recursive: true });
    const esmResult = await compileLumina(
      sourcePath,
      esmOut,
      'esm',
      emitWat,
      semanticTarget,
      grammarPath,
      useRecovery,
      diCfg,
      useAstJs,
      noOptimize,
      noInline,
      noComptime,
      sourceMap,
      inlineSourceMap,
      stopOnUnresolvedMemberError
    );
    if (!esmResult.ok) return esmResult;
    const cjsResult = await compileLumina(
      sourcePath,
      cjsOut,
      'cjs',
      emitWat,
      semanticTarget,
      grammarPath,
      useRecovery,
      diCfg,
      useAstJs,
      noOptimize,
      noInline,
      noComptime,
      sourceMap,
      inlineSourceMap,
      stopOnUnresolvedMemberError
    );
    if (!cjsResult.ok) return cjsResult;
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'package.json'), generateExportsMap(), 'utf-8');
    console.log(`built ESM + CJS -> ${outDir} with exports map`);
    return { ok: true, map: undefined, ir: cjsResult.ir ?? esmResult.ir };
  }
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  let warnedLambdaFallback = false;
  const shouldUseAstJs = (program: unknown): boolean => {
    if (useAstJs) return true;
    if (!programUsesAstOnlySyntax(program)) return false;
    if (!warnedLambdaFallback) {
      console.warn('Detected AST-only syntax; forcing AST JS codegen for this compilation.');
      warnedLambdaFallback = true;
    }
    return true;
  };
  const analysisOptions = { diDebug: diCfg, stopOnUnresolvedMemberError, target: semanticTarget };
  const lockfileRoot = findLockfileRoot(sourcePath);
  const applyMonomorphize = (program: unknown): unknown | null => {
    const mono = monomorphizeAst(program, { noInline, noComptime });
    if (mono.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, mono.diagnostics);
      return null;
    }
    return mono.ast;
  };
  await updateDependenciesForFile(
    sourcePath,
    source,
    parser,
    configFileExtensions,
    configStdPath,
    lockfileRoot
  );
  const stdRegistry = createStdModuleRegistry();
  const needsBundling = extractImports(source, { parser, grammarSource: sourcePath }).some((imp) =>
    shouldBundleImport(sourcePath, imp, stdRegistry, configFileExtensions, configStdPath, lockfileRoot)
  );
  if (target === 'wasm') {
    if (needsBundling) {
      const bundle = await bundleProgram(
        sourcePath,
        parser,
        useRecovery,
        configFileExtensions,
        configStdPath,
        lockfileRoot
      );
      if (!bundle) return { ok: false };
      const analysis = analyzeLumina(bundle.program as never, analysisOptions);
      if (analysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, analysis.diagnostics);
        return { ok: false };
      }
      const monoAst = applyMonomorphize(bundle.program as never);
      if (!monoAst) return { ok: false };
      const wasm = generateWasmTextModuleFromAst(monoAst as never, {
        exportMain: true,
        targetProfile: semanticTarget === 'wasm-standalone' ? 'wasm-standalone' : 'wasm-web',
        sourceFile: sourcePath,
        emitDebugMetadata: sourceMap,
      });
      if (wasm.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, wasm.diagnostics);
        return { ok: false };
      }
      return emitWasmArtifacts(outPath, wasm.module, emitWat, { sourceMap, inlineSourceMap });
    }

    const {
      ast,
      diagnostics: parseDiagnostics,
      parseError,
    } = parseSource(source, parser, useRecovery);
    if (parseError) return { ok: false };
    if (!ast) return { ok: false };
    const analysis = analyzeLumina(ast as never, analysisOptions);
    const combinedDiagnostics = [...parseDiagnostics, ...analysis.diagnostics];
    if (combinedDiagnostics.length > 0) {
      reportDiagnosticsAndFail(source, combinedDiagnostics);
      return { ok: false };
    }
    const monoAst = applyMonomorphize(ast as never);
    if (!monoAst) return { ok: false };
    const wasm = generateWasmTextModuleFromAst(monoAst as never, {
      exportMain: true,
      targetProfile: semanticTarget === 'wasm-standalone' ? 'wasm-standalone' : 'wasm-web',
      sourceFile: sourcePath,
      emitDebugMetadata: sourceMap,
    });
    if (wasm.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, wasm.diagnostics);
      return { ok: false };
    }
    return emitWasmArtifacts(outPath, wasm.module, emitWat, { sourceMap, inlineSourceMap });
  }
  if (needsBundling) {
    const bundle = await bundleProgram(
      sourcePath,
      parser,
      useRecovery,
      configFileExtensions,
      configStdPath,
      lockfileRoot
    );
    if (!bundle) return { ok: false };
    for (const [depPath, depSource] of bundle.sources.entries()) {
      await updateDependenciesForFile(
        depPath,
        depSource,
        parser,
        configFileExtensions,
        configStdPath,
        lockfileRoot
      );
    }
    const analysis = analyzeLumina(bundle.program as never, analysisOptions);
    if (analysis.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, analysis.diagnostics);
      return { ok: false };
    }
    let out = '';
    let optimized = null as ReturnType<typeof optimizeIR>;
    let result: { code: string; map?: RawSourceMap } | null = null;
    if (shouldUseAstJs(bundle.program)) {
      const monoAst = applyMonomorphize(bundle.program as never);
      if (!monoAst) return { ok: false };
      const monoAnalysis = analyzeLumina(monoAst as never, analysisOptions);
      if (monoAnalysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, monoAnalysis.diagnostics);
        return { ok: false };
      }
      result = generateJSFromAst(monoAst as never, {
        target,
        sourceMap,
        sourceFile: sourcePath,
        sourceContent: source,
        traitMethodResolutions: monoAnalysis.traitMethodResolutions,
      });
      out = result.code;
    } else {
      const monoAst = applyMonomorphize(bundle.program as never);
      if (!monoAst) return { ok: false };
      const lowered = lowerLumina(monoAst as never);
      optimized = noOptimize ? lowered : (optimizeIR(lowered) ?? lowered);
      const gen = generateJS(optimized, {
        target,
        sourceMap,
        sourceFile: sourcePath,
        sourceContent: source,
      });
      out = gen.code;
      result = gen;
    }
    if (sourceMap && result.map) {
      if (inlineSourceMap) {
        out = appendInlineSourceMapComment(out, result.map);
      } else {
        const mapFileName = path.basename(outPath) + '.map';
        out = appendSourceMapComment(out, mapFileName);
      }
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, out, 'utf-8');
    if (sourceMap && result.map && !inlineSourceMap) {
      const mapPath = outPath + '.map';
      await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
    }
    await ensureRuntimeForOutput(outPath, target);
    console.log(`Lumina compiled (bundled): ${outPath}`);
    return { ok: true, map: result.map, ir: optimized ?? undefined };
  }
  const fileHash = hashText(source);
  const cached = buildCache.files.get(sourcePath);
  if (
    cached &&
    cached.hash === fileHash &&
    cached.grammarHash === buildCache.grammarHash &&
    cached.compilerVersion === COMPILER_CACHE_VERSION
  ) {
    buildCache.stats.hits += 1;
    if (shouldUseAstJs(cached.ast)) {
      const analysis = analyzeLumina(cached.ast as never, analysisOptions);
      if (analysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, analysis.diagnostics);
        return { ok: false };
      }
      const monoAst = applyMonomorphize(cached.ast as never);
      if (!monoAst) return { ok: false };
      const monoAnalysis = analyzeLumina(monoAst as never, analysisOptions);
      if (monoAnalysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, monoAnalysis.diagnostics);
        return { ok: false };
      }
      const result = generateJSFromAst(monoAst as never, {
        target,
        sourceMap,
        sourceFile: sourcePath,
        sourceContent: source,
        traitMethodResolutions: monoAnalysis.traitMethodResolutions,
      });
      let out = result.code;
      if (sourceMap && result.map) {
        if (inlineSourceMap) {
          out = appendInlineSourceMapComment(out, result.map);
        } else {
          const mapFileName = path.basename(outPath) + '.map';
          out = appendSourceMapComment(out, mapFileName);
        }
      }
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, out, 'utf-8');
      if (sourceMap && result.map && !inlineSourceMap) {
        const mapPath = outPath + '.map';
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
      }
      await ensureRuntimeForOutput(outPath, target);
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: cached.ir ?? lowerLumina(monoAst as never) };
    }
    const monoAst = applyMonomorphize(cached.ast as never);
    if (!monoAst) return { ok: false };
    const lowered = lowerLumina(monoAst as never);
    const ir = noOptimize ? lowered : (cached.ir ?? optimizeIR(lowered) ?? lowered);
    const result = generateJS(ir, {
      target,
      sourceMap,
      sourceFile: sourcePath,
      sourceContent: source,
    });
    let out = result.code;
    if (sourceMap && result.map) {
      if (inlineSourceMap) {
        out = appendInlineSourceMapComment(out, result.map);
      } else {
        const mapFileName = path.basename(outPath) + '.map';
        out = appendSourceMapComment(out, mapFileName);
      }
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, out, 'utf-8');
    if (sourceMap && result.map && !inlineSourceMap) {
      const mapPath = outPath + '.map';
      await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
    }
    await ensureRuntimeForOutput(outPath, target);
    console.log(`Lumina compiled (cached): ${outPath}`);
    return { ok: true, map: result.map, ir };
  }
  const diskCache = await readDiskCache(sourcePath);
  if (
    diskCache &&
    diskCache.hash === fileHash &&
    diskCache.grammarHash === buildCache.grammarHash &&
    diskCache.compilerVersion === COMPILER_CACHE_VERSION
  ) {
    buildCache.stats.hits += 1;
    buildCache.files.set(sourcePath, diskCache);
    if (shouldUseAstJs(diskCache.ast)) {
      const analysis = analyzeLumina(diskCache.ast as never, analysisOptions);
      if (analysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, analysis.diagnostics);
        return { ok: false };
      }
      const monoAst = applyMonomorphize(diskCache.ast as never);
      if (!monoAst) return { ok: false };
      const monoAnalysis = analyzeLumina(monoAst as never, analysisOptions);
      if (monoAnalysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, monoAnalysis.diagnostics);
        return { ok: false };
      }
      const result = generateJSFromAst(monoAst as never, {
        target,
        sourceMap,
        sourceFile: sourcePath,
        sourceContent: source,
        traitMethodResolutions: monoAnalysis.traitMethodResolutions,
      });
      let out = result.code;
      if (sourceMap && result.map) {
        if (inlineSourceMap) {
          out = appendInlineSourceMapComment(out, result.map);
        } else {
          const mapFileName = path.basename(outPath) + '.map';
          out = appendSourceMapComment(out, mapFileName);
        }
      }
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, out, 'utf-8');
      if (sourceMap && result.map && !inlineSourceMap) {
        const mapPath = outPath + '.map';
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
      }
      await ensureRuntimeForOutput(outPath, target);
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: diskCache.ir ?? lowerLumina(monoAst as never) };
    }
    const monoAst = applyMonomorphize(diskCache.ast as never);
    if (!monoAst) return { ok: false };
    const lowered = lowerLumina(monoAst as never);
    const ir = noOptimize ? lowered : (diskCache.ir ?? optimizeIR(lowered) ?? lowered);
    const result = generateJS(ir, {
      target,
      sourceMap,
      sourceFile: sourcePath,
      sourceContent: source,
    });
    let out = result.code;
    if (sourceMap && result.map) {
      if (inlineSourceMap) {
        out = appendInlineSourceMapComment(out, result.map);
      } else {
        const mapFileName = path.basename(outPath) + '.map';
        out = appendSourceMapComment(out, mapFileName);
      }
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, out, 'utf-8');
    if (sourceMap && result.map && !inlineSourceMap) {
      const mapPath = outPath + '.map';
      await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
    }
    await ensureRuntimeForOutput(outPath, target);
    console.log(`Lumina compiled (cached): ${outPath}`);
    return { ok: true, map: result.map, ir };
  }
  buildCache.stats.misses += 1;

  const {
    ast,
    diagnostics: parseDiagnostics,
    parseError,
  } = parseSource(source, parser, useRecovery);
  if (parseError) {
    return { ok: false };
  }
  if (!ast) {
    return { ok: false };
  }
  const analysis = analyzeLumina(ast as never, analysisOptions);
  const combinedDiagnostics = [...parseDiagnostics, ...analysis.diagnostics];
  if (combinedDiagnostics.length > 0) {
    reportDiagnosticsAndFail(source, combinedDiagnostics);
    return { ok: false };
  }
  let out = '';
  let optimized = null as ReturnType<typeof optimizeIR>;
  let result: { code: string; map?: RawSourceMap } | null = null;
  if (shouldUseAstJs(ast)) {
    const monoAst = applyMonomorphize(ast as never);
    if (!monoAst) return { ok: false };
    const monoAnalysis = analyzeLumina(monoAst as never, analysisOptions);
    if (monoAnalysis.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, monoAnalysis.diagnostics);
      return { ok: false };
    }
    result = generateJSFromAst(monoAst as never, {
      target,
      sourceMap,
      sourceFile: sourcePath,
      sourceContent: source,
      traitMethodResolutions: monoAnalysis.traitMethodResolutions,
    });
    out = result.code;
  } else {
    const monoAst = applyMonomorphize(ast as never);
    if (!monoAst) return { ok: false };
    const lowered = lowerLumina(monoAst as never);
    optimized = noOptimize ? lowered : (optimizeIR(lowered) ?? lowered);
    const gen = generateJS(optimized, {
      target,
      sourceMap,
      sourceFile: sourcePath,
      sourceContent: source,
    });
    out = gen.code;
    result = gen;
  }
  if (sourceMap && result.map) {
    if (inlineSourceMap) {
      out = appendInlineSourceMapComment(out, result.map);
    } else {
      const mapFileName = path.basename(outPath) + '.map';
      out = appendSourceMapComment(out, mapFileName);
    }
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, out, 'utf-8');
  if (sourceMap && result.map && !inlineSourceMap) {
    const mapPath = outPath + '.map';
    await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
  }
  await ensureRuntimeForOutput(outPath, target);
  console.log(`Lumina compiled: ${outPath}`);
  if (diCfg && analysis.diGraphs) {
    const base = path.basename(outPath, path.extname(outPath));
    const dir = path.dirname(outPath);
    for (const [fn, dot] of analysis.diGraphs.entries()) {
      const filePath = path.join(dir, `${base}.${fn}.cfg.dot`);
      await fs.writeFile(filePath, dot, 'utf-8');
      console.log(`CFG: ${filePath}`);
    }
  }
  const entry: FileCacheEntry = {
    hash: fileHash,
    ast,
    diagnostics: analysis.diagnostics,
    ir: noOptimize ? null : optimized,
    grammarHash: buildCache.grammarHash ?? '',
    compilerVersion: COMPILER_CACHE_VERSION,
    semanticTarget,
  };
  buildCache.files.set(sourcePath, entry);
  await writeDiskCache(sourcePath, entry);
  return { ok: true, map: result.map, ir: optimized ?? undefined };
}

async function checkLumina(
  sourcePath: string,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  stopOnUnresolvedMemberError: boolean,
  semanticTarget: AnalyzeTarget
) {
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const lockfileRoot = findLockfileRoot(sourcePath);
  const stdRegistry = createStdModuleRegistry();
  const needsBundling = extractImports(source, { parser, grammarSource: sourcePath }).some((imp) =>
    shouldBundleImport(sourcePath, imp, stdRegistry, configFileExtensions, configStdPath, lockfileRoot)
  );
  await updateDependenciesForFile(
    sourcePath,
    source,
    parser,
    configFileExtensions,
    configStdPath,
    lockfileRoot
  );
  const fileHash = hashText(source);
  const cached = buildCache.files.get(sourcePath);
  if (
    cached &&
    cached.hash === fileHash &&
    cached.grammarHash === buildCache.grammarHash &&
    cached.compilerVersion === COMPILER_CACHE_VERSION &&
    (cached.semanticTarget ?? 'js') === semanticTarget
  ) {
    buildCache.stats.hits += 1;
    if (cached.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, cached.diagnostics);
      return { ok: false };
    }
    console.log('Lumina check passed (cached)');
    return { ok: true };
  }
  const diskCache = await readDiskCache(sourcePath);
  if (
    diskCache &&
    diskCache.hash === fileHash &&
    diskCache.grammarHash === buildCache.grammarHash &&
    diskCache.compilerVersion === COMPILER_CACHE_VERSION &&
    (diskCache.semanticTarget ?? 'js') === semanticTarget
  ) {
    buildCache.stats.hits += 1;
    buildCache.files.set(sourcePath, diskCache);
    if (diskCache.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, diskCache.diagnostics);
      return { ok: false };
    }
    console.log('Lumina check passed (cached)');
    return { ok: true };
  }
  buildCache.stats.misses += 1;
  const {
    ast,
    diagnostics: parseDiagnostics,
    parseError,
  } = parseSource(source, parser, useRecovery);
  if (parseError) {
    return { ok: false };
  }
  if (!ast) {
    return { ok: false };
  }
  const packageDiagnostics = collectPackageImportDiagnostics(
    sourcePath,
    source,
    parser,
    configFileExtensions,
    lockfileRoot
  );
  if (packageDiagnostics.length > 0) {
    reportDiagnosticsAndFail(source, packageDiagnostics);
    return { ok: false };
  }
  let programForAnalysis: unknown = ast;
  if (needsBundling) {
    const bundle = await bundleProgram(
      sourcePath,
      parser,
      useRecovery,
      configFileExtensions,
      configStdPath,
      lockfileRoot
    );
    if (!bundle) return { ok: false };
    programForAnalysis = bundle.program;
  }
  const analysis = analyzeLumina(programForAnalysis as never, {
    diDebug: diCfg,
    stopOnUnresolvedMemberError,
    target: semanticTarget,
  });
  const combinedDiagnostics = [...parseDiagnostics, ...analysis.diagnostics];
  if (combinedDiagnostics.length > 0) {
    reportDiagnosticsAndFail(source, combinedDiagnostics);
    return { ok: false };
  }
  if (diCfg && analysis.diGraphs) {
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const dir = path.dirname(sourcePath);
    for (const [fn, dot] of analysis.diGraphs.entries()) {
      const filePath = path.join(dir, `${base}.${fn}.cfg.dot`);
      await fs.writeFile(filePath, dot, 'utf-8');
      console.log(`CFG: ${filePath}`);
    }
  }
  console.log('Lumina check passed');
  const entry: FileCacheEntry = {
    hash: fileHash,
    ast: programForAnalysis as never,
    diagnostics: combinedDiagnostics as never,
    ir: null,
    grammarHash: buildCache.grammarHash ?? '',
    compilerVersion: COMPILER_CACHE_VERSION,
    semanticTarget,
  };
  buildCache.files.set(sourcePath, entry);
  await writeDiskCache(sourcePath, entry);
  return { ok: true };
}

async function compileLuminaWithStrategy(
  sourcePath: string,
  outPath: string,
  target: Target,
  emitWat: boolean,
  semanticTarget: AnalyzeTarget,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  useAstJs: boolean,
  noOptimize: boolean,
  noInline: boolean,
  noComptime: boolean,
  sourceMap: boolean,
  inlineSourceMap: boolean,
  stopOnUnresolvedMemberError: boolean,
  useBundledCompile: boolean
) {
  return useBundledCompile
    ? compileLumina(
        sourcePath,
        outPath,
        target,
        emitWat,
        semanticTarget,
        grammarPath,
        useRecovery,
        diCfg,
        useAstJs,
        noOptimize,
        noInline,
        noComptime,
        sourceMap,
        inlineSourceMap,
        stopOnUnresolvedMemberError
      )
    : compileLuminaTopologically(
        sourcePath,
        outPath,
        target,
        emitWat,
        semanticTarget,
        grammarPath,
        useRecovery,
        diCfg,
        useAstJs,
        noOptimize,
        noInline,
        noComptime,
        sourceMap,
        inlineSourceMap,
        stopOnUnresolvedMemberError
      );
}

export async function compileLuminaTask(payload: {
  sourcePath: string;
  outPath: string;
  target: Target;
  emitWat?: boolean;
  semanticTarget?: AnalyzeTarget;
  grammarPath: string;
  useRecovery: boolean;
  diCfg?: boolean;
  useAstJs?: boolean;
  noOptimize?: boolean;
  noInline?: boolean;
  noComptime?: boolean;
  sourceMap?: boolean;
  inlineSourceMap?: boolean;
  stopOnUnresolvedMemberError?: boolean;
  useBundledCompile?: boolean;
}) {
  return compileLuminaWithStrategy(
    payload.sourcePath,
    payload.outPath,
    payload.target,
    payload.emitWat ?? false,
    payload.semanticTarget ?? (payload.target === 'wasm' ? 'wasm' : 'js'),
    payload.grammarPath,
    payload.useRecovery,
    payload.diCfg ?? false,
    payload.useAstJs ?? false,
    payload.noOptimize ?? false,
    payload.noInline ?? false,
    payload.noComptime ?? false,
    payload.sourceMap ?? false,
    payload.inlineSourceMap ?? false,
    payload.stopOnUnresolvedMemberError ?? false,
    payload.useBundledCompile ?? false
  );
}

export async function checkLuminaTask(payload: {
  sourcePath: string;
  grammarPath: string;
  useRecovery: boolean;
  diCfg?: boolean;
  stopOnUnresolvedMemberError?: boolean;
  semanticTarget?: AnalyzeTarget;
}) {
  return checkLumina(
    payload.sourcePath,
    payload.grammarPath,
    payload.useRecovery,
    payload.diCfg ?? false,
    payload.stopOnUnresolvedMemberError ?? false,
    payload.semanticTarget ?? 'js'
  );
}

async function runRepl(grammarPath: string) {
  await startLuminaRepl(grammarPath);
}

type WatchSession = {
  dirtyPaths: Set<string>;
  pendingPaths: Set<string>;
  rebuildScheduled: NodeJS.Timeout | null;
  buildInFlight: boolean;
  rerunRequested: boolean;
  lastSeenHashes: Map<string, string>;
};

export function createWatchSessionController(options: {
  runIncrementalBuild: (changedPaths: string[]) => Promise<void>;
  delay?: number;
  hashFile?: (filePath: string) => Promise<string | null>;
}) {
  const delay = options.delay ?? 100;
  const hashFile =
    options.hashFile ??
    (async (filePath: string): Promise<string | null> => {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return hashText(raw);
      } catch {
        return null;
      }
    });

  const session: WatchSession = {
    dirtyPaths: new Set<string>(),
    pendingPaths: new Set<string>(),
    rebuildScheduled: null,
    buildInFlight: false,
    rerunRequested: false,
    lastSeenHashes: new Map<string, string>(),
  };

  const runIncrementalBuild = async () => {
    if (session.buildInFlight) {
      session.rerunRequested = true;
      return;
    }
    session.buildInFlight = true;
    const changed = Array.from(session.dirtyPaths);
    session.pendingPaths = new Set(changed);
    session.dirtyPaths.clear();
    try {
      if (changed.length > 0) {
        await options.runIncrementalBuild(changed);
      }
    } finally {
      session.pendingPaths.clear();
      session.buildInFlight = false;
      if (session.rerunRequested || session.dirtyPaths.size > 0) {
        session.rerunRequested = false;
        scheduleRebuild(0);
      }
    }
  };

  const scheduleRebuild = (nextDelay: number = delay) => {
    if (session.rebuildScheduled) clearTimeout(session.rebuildScheduled);
    session.rebuildScheduled = setTimeout(() => {
      session.rebuildScheduled = null;
      void runIncrementalBuild();
    }, nextDelay);
  };

  const report = async (filePath: string) => {
    const resolved = path.resolve(filePath);
    const nextHash = await hashFile(resolved);
    if (nextHash !== null) {
      if (session.lastSeenHashes.get(resolved) === nextHash) return;
      session.lastSeenHashes.set(resolved, nextHash);
    } else {
      const hadPreviousValue = session.lastSeenHashes.delete(resolved);
      if (
        !hadPreviousValue &&
        !session.pendingPaths.has(resolved) &&
        !session.dirtyPaths.has(resolved)
      ) {
        session.dirtyPaths.add(resolved);
        scheduleRebuild();
        return;
      }
    }
    session.dirtyPaths.add(resolved);
    scheduleRebuild();
  };

  const seedHash = (filePath: string, hash: string) => {
    session.lastSeenHashes.set(path.resolve(filePath), hash);
  };

  const dispose = () => {
    if (session.rebuildScheduled) clearTimeout(session.rebuildScheduled);
    session.rebuildScheduled = null;
  };

  return { session, report, scheduleRebuild, seedHash, dispose };
}

async function watchLumina(
  sources: string[],
  outDir: string | undefined,
  target: Target,
  emitWat: boolean,
  semanticTarget: AnalyzeTarget,
  grammarPath: string,
  outPathArg?: string,
  useRecovery: boolean = false,
  diCfg: boolean = false,
  noOptimize: boolean = false,
  noInline: boolean = false,
  noComptime: boolean = false,
  useAstJs: boolean = false,
  sourceMap: boolean = false,
  inlineSourceMap: boolean = false,
  stopOnUnresolvedMemberError: boolean = false,
  useBundledCompile: boolean = false
) {
  const resolvedSources = sources.map((s) => path.resolve(s));
  const globbed = await fg(resolvedSources, { onlyFiles: true, unique: true, dot: false });
  const expandedSources = globbed.length > 0 ? globbed : resolvedSources;
  const resolvedGrammarPath = path.resolve(grammarPath);
  const watchRoots = Array.from(
    new Set([
      ...expandedSources.map((sourcePath) => path.dirname(sourcePath)),
      path.dirname(resolvedGrammarPath),
    ])
  );
  const worker = createWorkerRunner({
    fileExtensions: configFileExtensions,
    stdPath: configStdPath,
    cacheDir: buildCache.cacheDir,
  });
  const entryGraphs = new Map<string, ModuleGraph>();
  const graphOptionsFor = (entryPath: string) => ({
    stdPath: configStdPath,
    fileExtensions: configFileExtensions,
    lockfileRoot: findLockfileRoot(entryPath),
    grammarPath: resolvedGrammarPath,
  });

  const runCompile = async (filePath: string, outPath: string) => {
    if (!worker) {
      return compileLuminaWithStrategy(
        filePath,
        outPath,
        target,
        emitWat,
        semanticTarget,
        grammarPath,
        useRecovery,
        diCfg,
        useAstJs,
        noOptimize,
        noInline,
        noComptime,
        sourceMap,
        inlineSourceMap,
        stopOnUnresolvedMemberError,
        useBundledCompile
      );
    }
    const result = await worker.compile({
      sourcePath: filePath,
      outPath,
      target,
      emitWat,
      semanticTarget,
      grammarPath,
      useRecovery,
      diCfg,
      useAstJs,
      noOptimize,
      noInline,
      noComptime,
      sourceMap,
      inlineSourceMap,
      stopOnUnresolvedMemberError,
      useBundledCompile,
    });
    if (!result.ok && result.error) {
      console.error(`Lumina worker error: ${result.error}`);
    }
    return { ok: result.ok };
  };

  const syncGraphHashes = (
    graph: ModuleGraph,
    controller: ReturnType<typeof createWatchSessionController>
  ) => {
    for (const node of graph.nodes.values()) {
      if (node.path && node.contentHash) {
        controller.seedHash(node.path, node.contentHash);
      }
    }
  };

  const graphContainsAnyPath = (graph: ModuleGraph, changedPaths: string[]) => {
    const paths = new Set<string>();
    for (const node of graph.nodes.values()) {
      if (node.path) paths.add(path.resolve(node.path));
    }
    return changedPaths.some((changedPath) => paths.has(changedPath));
  };

  const refreshEntryGraph = async (sourcePath: string) => {
    const graph = await buildModuleGraph(sourcePath, graphOptionsFor(sourcePath));
    entryGraphs.set(sourcePath, graph);
    return graph;
  };

  const compileEntry = async (sourcePath: string) => {
    const outPath = resolveOutPath(sourcePath, outPathArg, outDir, target);
    const result = await runCompile(sourcePath, outPath);
    await refreshEntryGraph(sourcePath);
    return result;
  };

  const controller = createWatchSessionController({
    delay: 100,
    runIncrementalBuild: async (changedPaths) => {
      try {
        const grammarChanged = changedPaths.includes(resolvedGrammarPath);
        if (grammarChanged) {
          buildCache.grammarHash = null;
          buildCache.grammarText = null;
          buildCache.parser = null;
          buildCache.files.clear();
          buildCache.stats.invalidations += 1;
          await clearModuleGraphCache();
        }

        const parser = await loadGrammar(resolvedGrammarPath);
        const compileNode = createModuleGraphCompileNode(parser, useRecovery);

        for (const sourcePath of expandedSources) {
          let graph = entryGraphs.get(sourcePath);
          if (!graph) {
            graph = await refreshEntryGraph(sourcePath);
          }
          if (!grammarChanged && !graphContainsAnyPath(graph, changedPaths)) {
            continue;
          }
          if (grammarChanged) {
            graph = await refreshEntryGraph(sourcePath);
          }

          if (graph.cycleErrors.length > 0) {
            for (const cycle of graph.cycleErrors) {
              console.error(`[MODULE-CYCLE-001] ${cycle.message}`);
            }
            continue;
          }

          const topoResult = grammarChanged
            ? await compileInOrder(graph, { compileNode })
            : await recompileAffected(graph, changedPaths, { compileNode });

          if (!topoResult.success) {
            formatModuleGraphDiagnostics(topoResult);
            syncGraphHashes(graph, controller);
            continue;
          }

          const result = await runCompile(
            sourcePath,
            resolveOutPath(sourcePath, outPathArg, outDir, target)
          );
          if (result?.ok) {
            await refreshEntryGraph(sourcePath);
          }
          const nextGraph = entryGraphs.get(sourcePath);
          if (nextGraph) syncGraphHashes(nextGraph, controller);
        }
      } catch (err) {
        console.error(`Lumina watch error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  for (const sourcePath of expandedSources) {
    const result = await compileEntry(sourcePath);
    const graph = entryGraphs.get(sourcePath);
    if (graph) syncGraphHashes(graph, controller);
    if (!result?.ok) {
      console.error(`Initial watch compile failed: ${sourcePath}`);
    }
  }
  try {
    controller.seedHash(
      resolvedGrammarPath,
      hashText(await fs.readFile(resolvedGrammarPath, 'utf-8'))
    );
  } catch {
    // ignore missing grammar hash seed
  }

  const { default: chokidar } = await import('chokidar');
  const watcher = chokidar.watch(watchRoots, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    ignored: (watchedPath, stats) => {
      const resolved = path.resolve(String(watchedPath));
      if (resolved.includes(`${path.sep}node_modules${path.sep}`)) return true;
      if (resolved.includes(`${path.sep}.lumina${path.sep}cache${path.sep}`)) return true;
      if (resolved === resolvedGrammarPath) return false;
      const ext = path.extname(resolved);
      if (!stats?.isFile() && ext.length === 0) return false;
      return ext !== '.lm' && ext !== '.lumina';
    },
    persistent: true,
  });

  console.log(`Watching ${watchRoots.length} root(s)...`);
  watcher.on('change', (filePath) => {
    void controller.report(filePath);
  });
  watcher.on('add', (filePath) => {
    void controller.report(filePath);
  });
  watcher.on('unlink', (filePath) => {
    void controller.report(filePath);
  });
  watcher.on('error', (err) => {
    console.error(`Watch error: ${err instanceof Error ? err.message : String(err)}`);
  });
}

type WorkerRequest =
  | { type: 'init'; payload: BuildConfig }
  | {
      type: 'compile';
      id: number;
      payload: {
        sourcePath: string;
        outPath: string;
        target: Target;
        emitWat?: boolean;
        semanticTarget?: AnalyzeTarget;
        grammarPath: string;
        useRecovery: boolean;
        diCfg: boolean;
        useAstJs?: boolean;
        noOptimize?: boolean;
        noInline?: boolean;
        noComptime?: boolean;
        sourceMap?: boolean;
        inlineSourceMap?: boolean;
        stopOnUnresolvedMemberError?: boolean;
        useBundledCompile?: boolean;
      };
    };

type WorkerResponse = { id?: number; ok?: boolean; error?: string };

function createWorkerRunner(config: BuildConfig) {
  const workerPath = resolveWorkerPath();
  if (!workerPath) return null;
  const isCjs = workerPath.endsWith('.cjs');
  const worker = new Worker(workerPath, {
    type: isCjs ? 'commonjs' : 'module',
  } as unknown as ConstructorParameters<typeof Worker>[1]);
  let requestId = 0;
  const pending = new Map<number, { resolve: (value: { ok: boolean; error?: string }) => void }>();

  worker.on('message', (msg: WorkerResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (typeof msg.id !== 'number') return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    entry.resolve({ ok: Boolean(msg.ok), error: msg.error });
  });

  worker.on('error', (err) => {
    for (const entry of pending.values()) {
      entry.resolve({ ok: false, error: (err as Error).message });
    }
    pending.clear();
  });

  worker.postMessage({ type: 'init', payload: config } satisfies WorkerRequest);

  return {
    async compile(payload: {
      sourcePath: string;
      outPath: string;
      target: Target;
      emitWat?: boolean;
      semanticTarget?: AnalyzeTarget;
      grammarPath: string;
      useRecovery: boolean;
      diCfg: boolean;
      useAstJs?: boolean;
      noOptimize?: boolean;
      noInline?: boolean;
      noComptime?: boolean;
      sourceMap?: boolean;
      inlineSourceMap?: boolean;
      stopOnUnresolvedMemberError?: boolean;
      useBundledCompile?: boolean;
    }) {
      const id = requestId++;
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        pending.set(id, { resolve });
        worker.postMessage({ type: 'compile', id, payload } satisfies WorkerRequest);
      });
    },
  };
}

function resolveWorkerPath(): string | null {
  const binDir = process.argv[1] ? path.dirname(process.argv[1]) : path.resolve('dist/bin');
  const esmPath = path.join(binDir, 'lumina-worker.js');
  const cjsPath = path.join(binDir, 'lumina-worker.cjs');
  if (existsSync(esmPath)) return esmPath;
  if (existsSync(cjsPath)) return cjsPath;
  return null;
}

function printHelp() {
  console.log(`
lumina <command> [file] [options]

  Commands:
    compile <file>   Compile Lumina source to JS
    check <file>     Parse + analyze only (no emit)
    ssg <file>       Render a static HTML page from a Lumina entry
    explain <code>   Show explanation for a diagnostic code
  fmt [paths...]   Normalize Lumina source whitespace
  lint [paths...]  Run semantic diagnostics + style lints
  doc [paths...]   Generate Markdown API docs
  watch <file>     Watch and recompile on change
  run-wasm <file>  Execute a .wasm file and print return value
  repl             Interactive compile-and-run Lumina REPL
  grammar          Lumina grammar validation and compiler tools
  init             Initialize a Lumina browser app starter
  add <pkg...>     Add package(s) from Lumina registry
  install          Install packages from lumina.lock
  remove <pkg...>  Remove package(s) from lumina.toml and lockfiles
  list             List Lumina-resolvable packages from lumina.lock
  publish          Publish current package to registry
  bundle <file>    Bundle Lumina source for browser/wasm distribution
  importmap        Generate browser import map from lock data
  search <query>   Search Lumina package registry
  secret-scan [d]  Scan a directory for likely secrets

Options:
  --out <file>         Output file (default: lumina.out.js; wasm target: lumina.out.wasm)
  --target <js|wasm-web|wasm-standalone|cjs|esm|wasm|dual>   Target profile / legacy target (default: esm)
  --module <esm|cjs>   JS module format when --target js is used
  --emit-wat           Emit companion .wat debug output for wasm target
  --loader-out <file>  Loader output path for wasm bundle target
  --import-map <file>  Emit browser import-map.json during bundle
  --minify             Minify browser bundle output
  --cdn                Upload browser/wasm CDN artifacts on publish
  --cdn-provider <p>   CDN provider: lumina | npm | both
  --allow-secrets      Allow publish to continue when secret scan finds matches
  --grammar <path>     Override grammar path
  --dry-run            Parse and analyze only (compile command)
  --recovery           Enable resilient parsing (panic mode)
  --di-cfg             Emit CFG dot files during compile/check
  --list-config        Print resolved config and exit
  --source-map <mode>  Emit source map: inline | external | none
  --sourcemap          Emit source map alongside output (legacy)
  --inline-sourcemap   Embed base64 source map (legacy)
  --debug-ir           Emit Graphviz .dot for optimized IR
  --profile-cache      Print cache hit/miss stats
  --clear-cache        Clear module-graph cache before running command
  --ast-js             Emit JS directly from AST (no IR)
  --no-optimize        Skip IR SSA + constant folding (workaround for known issues)
  --no-inline          Disable AST inlining pass after monomorphization
  --no-comptime        Disable comptime function evaluation pass
  --stop-on-unresolved Halt analysis on first unresolved namespace/member error
  --check              Verify formatting only, do not write files (fmt)
  --public-only        Include only public declarations in docs (doc)
  --yes                Use defaults without prompts (init)
  --template <name>    Starter template: routed | minimal | ssr | auth | testing | deploy | large-app (init)
  --vite-plugin        Emit a plugin-native Vite dev setup for init
  --frozen             Require lumina.lock to match the manifest (install)
  --dev                Add package as dev dependency (add)
  --limit <n>          Limit search result count (search)
  --offset <n>         Search result offset (search)
  --sort <mode>        Search sort: relevance|downloads|updated
  --tags <a,b>         Comma-separated tag filter for search
  --json               Print search output as JSON

Config file:
  lumina.config.json supports grammarPath, outDir, target, entries, watch, stdPath, fileExtensions, cacheDir, recovery
`);
}

async function resolveLuminaInputs(inputs: string[], extensions: string[]): Promise<string[]> {
  const resolved = new Set<string>();
  const patterns = inputs.length > 0 ? inputs : extensions.map((ext) => `**/*${ext}`);

  for (const item of patterns) {
    const abs = path.resolve(item);
    if (existsSync(abs)) {
      const stats = statSync(abs);
      if (stats.isDirectory()) {
        const globbed = await fg(
          extensions.map((ext) => `**/*${ext}`),
          {
            cwd: abs,
            onlyFiles: true,
            unique: true,
            dot: false,
            absolute: true,
          }
        );
        globbed.forEach((filePath) => resolved.add(path.resolve(filePath)));
      } else if (stats.isFile()) {
        resolved.add(abs);
      }
      continue;
    }

    const globbed = await fg([item], {
      onlyFiles: true,
      unique: true,
      dot: false,
      absolute: true,
    });
    globbed.forEach((filePath) => resolved.add(path.resolve(filePath)));
  }

  return Array.from(resolved).sort((a, b) => a.localeCompare(b));
}

async function runFmtCommand(
  inputs: string[],
  extensions: string[],
  checkOnly: boolean
): Promise<boolean> {
  const files = await resolveLuminaInputs(inputs, extensions);
  if (files.length === 0) {
    console.error('No Lumina files found for formatting.');
    return false;
  }

  let changed = 0;
  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf-8');
    const formatted = formatLuminaSource(source);
    if (formatted === source) continue;
    changed += 1;
    if (checkOnly) {
      console.error(`Needs formatting: ${filePath}`);
      continue;
    }
    await fs.writeFile(filePath, formatted, 'utf-8');
    console.log(`Formatted: ${filePath}`);
  }

  if (checkOnly) {
    if (changed === 0) {
      console.log(`Formatting check passed (${files.length} file(s)).`);
      return true;
    }
    console.error(`Formatting check failed: ${changed} file(s) need changes.`);
    return false;
  }

  console.log(
    `Formatting complete: ${changed} file(s) updated, ${files.length - changed} unchanged.`
  );
  return true;
}

async function runLintCommand(
  inputs: string[],
  extensions: string[],
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  stopOnUnresolvedMemberError: boolean
): Promise<boolean> {
  const files = await resolveLuminaInputs(inputs, extensions);
  if (files.length === 0) {
    console.error('No Lumina files found for lint.');
    return false;
  }

  const parser = await loadGrammar(grammarPath);
  let errorCount = 0;
  let warningCount = 0;

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf-8');
    const {
      ast,
      diagnostics: parseDiagnostics,
      parseError,
    } = parseSource(source, parser, useRecovery);

    if (parseError) {
      errorCount += 1;
      continue;
    }

    if (parseDiagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, parseDiagnostics as never);
      errorCount += parseDiagnostics.length;
    }

    if (ast) {
      const analysis = analyzeLumina(ast as never, { diDebug: diCfg, stopOnUnresolvedMemberError });
      const seenDiagnostics = new Set<string>();
      for (const diag of analysis.diagnostics) {
        const locationKey = diag.location
          ? `${diag.location.start.line}:${diag.location.start.column}:${diag.location.end.line}:${diag.location.end.column}`
          : '-';
        const key = `${diag.severity}|${diag.code ?? 'DIAG'}|${diag.message}|${locationKey}`;
        if (seenDiagnostics.has(key)) continue;
        seenDiagnostics.add(key);
        const code = diag.code ?? 'DIAG';
        const where = diag.location
          ? `:${diag.location.start.line}:${diag.location.start.column}`
          : '';
        const level = diag.severity === 'error' ? 'error' : 'warning';
        console.error(`${filePath}${where} [${code}] ${diag.message}`);
        if (diag.location) {
          try {
            console.error(highlightSnippet(source, diag.location, true));
          } catch {
            // ignore snippet failures
          }
        }
        if (level === 'error') errorCount += 1;
        else warningCount += 1;
      }
    }

    const styleIssues = collectStyleLintIssues(source);
    for (const issue of styleIssues) {
      console.error(`${filePath}:${issue.line}:${issue.column} [${issue.code}] ${issue.message}`);
      if (issue.severity === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }

  console.log(
    `Lint summary: ${files.length} file(s), ${errorCount} error(s), ${warningCount} warning(s).`
  );
  return errorCount === 0;
}

async function runDocCommand(
  inputs: string[],
  extensions: string[],
  grammarPath: string,
  useRecovery: boolean,
  outPath: string | undefined,
  publicOnly: boolean
): Promise<boolean> {
  const files = await resolveLuminaInputs(inputs, extensions);
  if (files.length === 0) {
    console.error('No Lumina files found for doc generation.');
    return false;
  }

  const parser = await loadGrammar(grammarPath);
  const chunks: string[] = [];
  let failures = 0;

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf-8');
    const { ast, diagnostics, parseError } = parseSource(source, parser, useRecovery);
    if (parseError || diagnostics.length > 0 || !ast) {
      failures += 1;
      console.error(`Skipping ${filePath}: parse failed.`);
      continue;
    }
    chunks.push(generateLuminaDocsMarkdown(ast as never, filePath, { publicOnly }));
  }

  if (chunks.length === 0) {
    console.error('No docs generated due to parse failures.');
    return false;
  }

  const markdown = `${chunks.join('\n\n---\n\n').trimEnd()}\n`;
  if (outPath) {
    const resolved = validateOutputPath(outPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, markdown, 'utf-8');
    console.log(`Docs written: ${resolved}`);
  } else {
    process.stdout.write(markdown);
  }

  if (failures > 0) {
    console.error(`Doc generation completed with ${failures} skipped file(s).`);
  }
  return true;
}

async function runSecretScanCommand(dir: string | undefined): Promise<boolean> {
  const targetDir = path.resolve(dir ?? process.cwd());
  const result = await scanDirectory(targetDir);
  if (result.findings.length === 0) {
    console.log(`Secret scan clean: ${targetDir} (${result.scanned} file(s) scanned).`);
    return true;
  }
  console.error(`Secret scan found ${result.findings.length} issue(s) in ${targetDir}:`);
  for (const finding of result.findings) {
    console.error(
      `${finding.file}:${finding.line}:${finding.column} [${finding.kind}] ${finding.preview}`
    );
  }
  return false;
}

export async function runLumina(argv: string[] = process.argv.slice(2)) {
  const { command, file, positional, args } = parseArgs(argv);
  const positionalArgs = positional.slice(1);
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const initYes = parseBooleanFlag(args, '--yes');
  const initTemplate = typeof args.get('--template') === 'string' ? String(args.get('--template')) : undefined;
  const initVitePlugin = parseBooleanFlag(args, '--vite-plugin');
  const fmtCheck = parseBooleanFlag(args, '--check');
  const docPublicOnly = parseBooleanFlag(args, '--public-only');

  if (command === 'init') {
    await initProject({ yes: initYes, template: initTemplate, vitePlugin: initVitePlugin });
    return;
  }

  if (command === 'install') {
    await runLuminaInstall(argv.slice(1));
    return;
  }

  if (command === 'add') {
    await runLuminaAdd(argv.slice(1));
    return;
  }

  if (command === 'publish') {
    await runLuminaPublish(argv.slice(1));
    return;
  }

  if (command === 'secret-scan') {
    const ok = await runSecretScanCommand(file || positionalArgs[0]);
    if (!ok) {
      throw new Error('Secret scan found one or more findings.');
    }
    return;
  }

  if (command === 'importmap') {
    await runLuminaImportmap(argv.slice(1));
    return;
  }

  if (command === 'grammar') {
    await runLuminaGrammar(argv.slice(1));
    return;
  }

  if (command === 'search') {
    const query = positionalArgs.join(' ').trim();
    if (query.length === 0) {
      console.log('Usage: lumina search <query>');
      console.log('       lumina search <query> --sort downloads');
      console.log('       lumina search <query> --limit 20 --offset 0');
      return;
    }
    const manifest = await readManifest(process.cwd()).catch(() => ({
      name: '',
      version: '0.0.0',
      entry: 'src/main.lm',
      description: null,
      authors: [],
      license: null,
      dependencies: new Map<string, string>(),
      devDeps: new Map<string, string>(),
      registry: null,
    }));
    const registryConfig = resolveRegistryConfig(manifest, process.env);
    const limitRaw = args.get('--limit');
    const offsetRaw = args.get('--offset');
    const sortRaw = args.get('--sort');
    const tagsRaw = args.get('--tags');
    const asJson = parseBooleanFlag(args, '--json');
    const limit = typeof limitRaw === 'string' ? Number(limitRaw) : undefined;
    const offset = typeof offsetRaw === 'string' ? Number(offsetRaw) : undefined;
    const sort =
      sortRaw === 'relevance' || sortRaw === 'downloads' || sortRaw === 'updated'
        ? sortRaw
        : undefined;
    const tags =
      typeof tagsRaw === 'string'
        ? tagsRaw
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : undefined;

    const result = await searchRegistry(query, registryConfig, {
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
      sort,
      tags,
    });
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.total === 0) {
      console.log('Found 0 package(s).');
      return;
    }
    const offsetValue = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset ?? 0)) : 0;
    const rangeEnd = offsetValue + result.results.length;
    console.log(`\nFound ${result.total} package(s) - showing ${offsetValue + 1}-${rangeEnd}:\n`);
    for (const entry of result.results) {
      const tagSuffix = entry.tags.length > 0 ? `  [${entry.tags.join(', ')}]` : '';
      console.log(`  ${entry.name}@${entry.version}${tagSuffix}`);
      if (entry.description) {
        console.log(`    ${entry.description}`);
      }
      const meta: string[] = [];
      if (entry.downloads !== null) meta.push(`↓ ${entry.downloads.toLocaleString()}`);
      if (entry.dependents !== null) meta.push(`${entry.dependents.toLocaleString()} dependents`);
      if (entry.updatedAt) meta.push(`updated ${formatRelativeDate(entry.updatedAt)}`);
      if (meta.length > 0) {
        console.log(`    ${meta.join('  ·  ')}`);
      }
      console.log('');
    }
    if (result.hasMore && result.nextOffset !== null) {
      console.log(
        `  -> More results: ${buildNextPageCmd(query, result.nextOffset, sortRaw, limitRaw, tagsRaw)}\n`
      );
    }
    return;
  }

  if (command === 'remove') {
    await removePackages(positionalArgs);
    return;
  }

  if (command === 'list') {
    await listPackages();
    return;
  }

  if (command === 'run-wasm') {
    const argsList = process.argv.slice(2);
    const wasmPath = file ? path.resolve(file) : argsList[1] ? path.resolve(argsList[1]) : '';
    if (!wasmPath) {
      throw new Error('Missing <file> for run-wasm');
    }
    const funcName = argsList[2] ?? 'main';
    const funcArgs = argsList.slice(3).map((value) => {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid numeric argument: ${value}`);
      }
      return parsed;
    });
    const runtime = await loadWASM(wasmPath);
    const result = callWASMFunction(runtime, funcName, ...funcArgs);
    console.log(`Result: ${result}`);
    return;
  }

  if (command === 'explain') {
    const code = file || positionalArgs[0];
    if (!code) {
      throw new Error('Missing <code> for explain');
    }
    console.log(formatDiagnosticExplanation(code));
    return;
  }

  const config = loadConfig() ?? {};
  const grammarPath = resolveGrammarPath(
    typeof args.get('--grammar') === 'string'
      ? (args.get('--grammar') as string)
      : config.grammarPath
  );
  const cliTarget =
    resolveTarget(args.get('--target') as string | undefined) ?? config.target ?? 'esm';
  const moduleFormat =
    resolveModuleFormat(args.get('--module') as string | undefined) ?? config.module;
  const { compileTarget: target, semanticTarget } = resolveCompilePlan(cliTarget, moduleFormat);
  const outArg = (args.get('--out') as string) ?? undefined;
  const outDir = config.outDir;
  const dryRun = parseBooleanFlag(args, '--dry-run');
  const useRecovery = parseBooleanFlag(args, '--recovery') || config.recovery === true;
  const diCfg = parseBooleanFlag(args, '--di-cfg');
  const useAstJs = parseBooleanFlag(args, '--ast-js');
  const noOptimize = parseBooleanFlag(args, '--no-optimize');
  const noInline = parseBooleanFlag(args, '--no-inline');
  const noComptime = parseBooleanFlag(args, '--no-comptime');
  // Hidden compatibility switch for older automation. The public compile path
  // is the module-graph/topological compiler.
  const bundledCompile = parseBooleanFlag(args, '--bundled-compile');
  const emitWat = parseBooleanFlag(args, '--emit-wat');
  // Accepted as a no-op for older scripts that passed the now-default mode.
  parseBooleanFlag(args, '--topo-compile');
  const clearModuleCache = parseBooleanFlag(args, '--clear-cache');
  const stopOnUnresolvedMemberError = parseBooleanFlag(args, '--stop-on-unresolved');
  const listConfig = parseBooleanFlag(args, '--list-config');
  const sourceMapMode = args.get('--source-map') as string | undefined;
  let sourceMap = parseBooleanFlag(args, '--sourcemap');
  let inlineSourceMap = parseBooleanFlag(args, '--inline-sourcemap');
  if (typeof sourceMapMode === 'string') {
    const mode = sourceMapMode.toLowerCase();
    if (mode === 'none') {
      sourceMap = false;
      inlineSourceMap = false;
    } else if (mode === 'inline') {
      sourceMap = true;
      inlineSourceMap = true;
    } else if (mode === 'external') {
      sourceMap = true;
      inlineSourceMap = false;
    }
  }
  const debugIr = parseBooleanFlag(args, '--debug-ir');
  const profileCache = parseBooleanFlag(args, '--profile-cache');
  buildCache.cacheDir = config.cacheDir ?? '.lumina-cache';
  configFileExtensions = (config.fileExtensions ?? ['.lm', '.lumina']).map((ext) =>
    ext.startsWith('.') ? ext : `.${ext}`
  );
  configStdPath = config.stdPath
    ? path.resolve(config.stdPath)
    : configStdPath || path.resolve('std');
  await loadDepsCache();

  if (clearModuleCache) {
    await clearModuleGraphCache();
    console.log('Cleared module graph cache.');
  }

  if (listConfig) {
    console.log(
      JSON.stringify(
        {
          grammarPath,
          target: cliTarget,
          module: moduleFormat ?? null,
          outDir,
          entries: config.entries ?? [],
          watch: config.watch ?? [],
          recovery: config.recovery ?? false,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'fmt') {
    const ok = await runFmtCommand(positionalArgs, configFileExtensions, fmtCheck);
    if (!ok) process.exit(1);
    return;
  }

  if (command === 'lint') {
    const ok = await runLintCommand(
      positionalArgs,
      configFileExtensions,
      grammarPath,
      useRecovery,
      diCfg,
      stopOnUnresolvedMemberError
    );
    if (!ok) process.exit(1);
    return;
  }

  if (command === 'doc') {
    const ok = await runDocCommand(
      positionalArgs,
      configFileExtensions,
      grammarPath,
      useRecovery,
      outArg,
      docPublicOnly
    );
    if (!ok) process.exit(1);
    return;
  }

  if (command === 'ssg') {
    const sourcePath = file
      ? path.resolve(file)
      : positionalArgs[0]
        ? path.resolve(positionalArgs[0])
        : '';
    if (!sourcePath) {
      console.error('Usage: lumina ssg <file> --out <file> [--export main] [--props <json>]');
      process.exit(1);
    }
    const defaultSsgOut = outDir
      ? path.join(outDir, 'index.html')
      : path.join(process.cwd(), 'index.html');
    const outPath = path.resolve(String(args.get('--out') ?? defaultSsgOut));
    const ok = await runSsgCommand({
      sourcePath,
      outPath,
      exportName: String(args.get('--export') ?? 'main'),
      propsJson: typeof args.get('--props') === 'string' ? String(args.get('--props')) : undefined,
      title: typeof args.get('--title') === 'string' ? String(args.get('--title')) : undefined,
      lang: typeof args.get('--lang') === 'string' ? String(args.get('--lang')) : undefined,
      hydrateModule:
        typeof args.get('--hydrate') === 'string' ? String(args.get('--hydrate')) : undefined,
      grammarPath,
      useRecovery,
    });
    if (!ok) process.exit(1);
    return;
  }

  if (command === 'compile') {
    const entries = file ? [file] : (config.entries ?? []);
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (entries.length === 0) {
      const globbed = await fg(
        extensions.map((ext) => `**/*${ext}`),
        { onlyFiles: true, unique: true, dot: false }
      );
      entries.push(...globbed);
    }
    if (entries.length === 0) throw new Error('Missing <file> for compile');
    for (const entry of entries) {
      const sourcePath = path.resolve(entry);
      const outPath = resolveOutPath(sourcePath, outArg, outDir, target);
      if (dryRun) {
        const result = await checkLumina(
          sourcePath,
          grammarPath,
          useRecovery,
          diCfg,
          stopOnUnresolvedMemberError,
          semanticTarget
        );
        if (!result.ok) process.exit(1);
      } else {
        const compileResult = await compileLuminaWithStrategy(
          sourcePath,
          outPath,
          target,
          emitWat,
          semanticTarget,
          grammarPath,
          useRecovery,
          diCfg,
          useAstJs,
          noOptimize,
          noInline,
          noComptime,
          sourceMap,
          inlineSourceMap,
          stopOnUnresolvedMemberError,
          bundledCompile
        );
        if (!compileResult.ok) process.exit(1);
        if (debugIr && compileResult.ir) {
          const dotPath = outPath + '.dot';
          const dot = irToDot(compileResult.ir);
          await fs.writeFile(dotPath, dot, 'utf-8');
          console.log(`IR graph: ${dotPath}`);
        }
        if (profileCache) {
          const graph = buildDepGraph();
          const stats = graphStats(graph);
          console.log(
            `Cache: ${buildCache.stats.hits} hit(s), ${buildCache.stats.misses} miss(es), ${buildCache.stats.writes} write(s), ${buildCache.stats.invalidations} invalidation(s)`
          );
          console.log(`Deps: ${stats.nodes} file(s), ${stats.edges} edge(s)`);
        }
      }
    }
    return;
  }

  if (command === 'bundle') {
    await runLuminaBundle(argv.slice(1), {
      cwd: process.cwd(),
      deps: {
        compileTask: compileLuminaTask,
      },
      grammarPath,
      useRecovery,
      diCfg,
      useAstJs,
      noOptimize,
      noInline,
      noComptime,
      sourceMap,
      inlineSourceMap,
      stopOnUnresolvedMemberError,
    });
    return;
  }

  if (command === 'check') {
    const entries = file ? [file] : (config.entries ?? []);
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (entries.length === 0) {
      const globbed = await fg(
        extensions.map((ext) => `**/*${ext}`),
        { onlyFiles: true, unique: true, dot: false }
      );
      entries.push(...globbed);
    }
    if (entries.length === 0) throw new Error('Missing <file> for check');
    for (const entry of entries) {
      const result = await checkLumina(
        path.resolve(entry),
        grammarPath,
        useRecovery,
        diCfg,
        stopOnUnresolvedMemberError,
        semanticTarget
      );
      if (!result.ok) process.exit(1);
      if (profileCache) {
        const graph = buildDepGraph();
        const stats = graphStats(graph);
        console.log(
          `Cache: ${buildCache.stats.hits} hit(s), ${buildCache.stats.misses} miss(es), ${buildCache.stats.writes} write(s), ${buildCache.stats.invalidations} invalidation(s)`
        );
        console.log(`Deps: ${stats.nodes} file(s), ${stats.edges} edge(s)`);
      }
    }
    return;
  }

  if (command === 'watch') {
    const sources = file ? [file] : (config.watch ?? config.entries ?? []);
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (sources.length === 0) {
      sources.push(...extensions.map((ext) => `**/*${ext}`));
    }
    if (sources.length === 0) throw new Error('Missing <file> for watch');
    await watchLumina(
      sources,
      outDir,
      target,
      emitWat,
      semanticTarget,
      grammarPath,
      outArg,
      useRecovery,
      diCfg,
      noOptimize,
      noInline,
      noComptime,
      useAstJs,
      sourceMap,
      inlineSourceMap,
      stopOnUnresolvedMemberError,
      bundledCompile
    );
    return;
  }

  if (command === 'repl') {
    await runRepl(grammarPath);
    return;
  }

  printHelp();
}
