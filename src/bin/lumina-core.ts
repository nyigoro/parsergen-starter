import fs from 'node:fs/promises';
import { existsSync, watch, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import fg from 'fast-glob';
import { Worker } from 'node:worker_threads';

import { compileGrammar } from '../grammar/index.js';
import { parseInput, ParserUtils, type Diagnostic } from '../parser/index.js';
import { formatError, highlightSnippet } from '../utils/index.js';
import { analyzeLumina, lowerLumina, optimizeIR, generateJS, generateJSFromAst, irToDot } from '../index.js';
import { extractImports } from '../project/imports.js';
import { parseWithPanicRecovery } from '../project/panic.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { runREPLWithParser } from '../repl.js';
import { runParsergen } from './cli-core.js';

type Target = 'cjs' | 'esm';

const DEFAULT_GRAMMAR_PATHS = [
  path.resolve('src/grammar/lumina.peg'),
  path.resolve('examples/lumina.peg'),
];

type LuminaConfig = {
  grammarPath?: string;
  outDir?: string;
  target?: Target;
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
    if (raw.target === 'cjs' || raw.target === 'esm') normalized.target = raw.target;
    else errors.push('target must be "cjs" or "esm"');
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
  const [command, file] = argv;
  const args = new Map<string, string | boolean>();
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
    }
  }
  return { command, file, args };
}

function parseBooleanFlag(args: Map<string, string | boolean>, key: string): boolean {
  const value = args.get(key);
  if (value === undefined) return false;
  if (value === true) return true;
  if (typeof value === 'string') return value === 'true' || value === '1' || value === 'yes';
  return false;
}

function resolveTarget(value: string | undefined): Target | null {
  if (!value) return null;
  return value === 'cjs' || value === 'esm' ? value : null;
}

function resolveOutPath(sourcePath: string, outPathArg: string | undefined, outDir: string | undefined): string {
  if (outPathArg) return path.resolve(outPathArg);
  const base = path.basename(sourcePath, path.extname(sourcePath)) + '.js';
  if (outDir) return path.resolve(outDir, base);
  return path.resolve('lumina.out.js');
}

type BuildConfig = {
  fileExtensions: string[];
  stdPath: string;
  cacheDir: string;
};

type FileCacheEntry = {
  hash: string;
  ast: unknown;
  diagnostics: ReturnType<typeof analyzeLumina>['diagnostics'];
  ir: ReturnType<typeof optimizeIR>;
  grammarHash: string;
};

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

let configFileExtensions: string[] = ['.lm', '.lumina'];
let configStdPath = '';
const cliLexer = createLuminaLexer();

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

type DepCacheEntry = {
  hash: string;
  imports: string[];
};

type DepCacheFile = {
  files: Record<string, DepCacheEntry>;
};

const depCache = new Map<string, DepCacheEntry>();

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

function resolveImport(fromPath: string, spec: string, extensions: string[], stdPath: string): string | null {
  if (spec.startsWith('@std/')) {
    const rel = spec.slice('@std/'.length);
    const resolved = path.resolve(stdPath, rel);
    return ensureExtension(resolved, extensions);
  }
  if (!spec.startsWith('.')) return null;
  const base = path.dirname(fromPath);
  const resolved = path.resolve(base, spec);
  return ensureExtension(resolved, extensions);
}

function getDependents(graph: Map<string, string[]>, target: string): string[] {
  const results: string[] = [];
  for (const [file, deps] of graph.entries()) {
    if (deps.includes(target)) results.push(file);
  }
  return results;
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

async function updateDependenciesForFile(sourcePath: string, source: string, extensions: string[], stdPath: string) {
  const fileHash = hashText(source);
  const cached = depCache.get(sourcePath);
  if (cached && cached.hash === fileHash) {
    return;
  }
  const rawImports = extractImports(source);
  const resolved = rawImports
    .map((imp) => resolveImport(sourcePath, imp, extensions, stdPath))
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
    buildCache.parser = compileGrammar(grammarText);
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

function formatDiagnosticsWithSnippet(source: string, diagnostics: ReturnType<typeof analyzeLumina>['diagnostics']) {
  for (const diag of diagnostics) {
    const code = diag.code ?? 'DIAG';
    console.error(`[${code}] ${diag.message}`);
    if (diag.location) {
      try {
        console.error(highlightSnippet(source, diag.location, true));
      } catch {
        // ignore snippet failures
      }
    }
  }
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

async function compileLumina(
  sourcePath: string,
  outPath: string,
  target: Target,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  useAstJs: boolean
) {
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  await updateDependenciesForFile(sourcePath, source, configFileExtensions, configStdPath);
  const fileHash = hashText(source);
  const cached = buildCache.files.get(sourcePath);
  if (cached && cached.hash === fileHash && cached.grammarHash === buildCache.grammarHash) {
    buildCache.stats.hits += 1;
    if (useAstJs) {
      const result = generateJSFromAst(cached.ast as never, { target });
      await fs.writeFile(outPath, result.code, 'utf-8');
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: cached.ir ?? lowerLumina(cached.ast as never) };
    }
    const result = generateJS(cached.ir ?? lowerLumina(cached.ast as never), { target, sourceMap: true });
    await fs.writeFile(outPath, result.code, 'utf-8');
    console.log(`Lumina compiled (cached): ${outPath}`);
    return { ok: true, map: result.map, ir: cached.ir ?? lowerLumina(cached.ast as never) };
  }
  const diskCache = await readDiskCache(sourcePath);
  if (diskCache && diskCache.hash === fileHash && diskCache.grammarHash === buildCache.grammarHash) {
    buildCache.stats.hits += 1;
    buildCache.files.set(sourcePath, diskCache);
    if (useAstJs) {
      const result = generateJSFromAst(diskCache.ast as never, { target });
      await fs.writeFile(outPath, result.code, 'utf-8');
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: diskCache.ir ?? lowerLumina(diskCache.ast as never) };
    }
    const result = generateJS(diskCache.ir ?? lowerLumina(diskCache.ast as never), { target, sourceMap: true });
    await fs.writeFile(outPath, result.code, 'utf-8');
    console.log(`Lumina compiled (cached): ${outPath}`);
    return { ok: true, map: result.map, ir: diskCache.ir ?? lowerLumina(diskCache.ast as never) };
  }
  buildCache.stats.misses += 1;

  const { ast, diagnostics: parseDiagnostics, parseError } = parseSource(source, parser, useRecovery);
  if (parseError) {
    return { ok: false };
  }
  if (parseDiagnostics.length > 0) {
    formatDiagnosticsWithSnippet(source, parseDiagnostics);
    return { ok: false };
  }
  if (!ast) {
    return { ok: false };
  }
  const analysis = analyzeLumina(ast as never, { diDebug: diCfg });
  if (analysis.diagnostics.length > 0) {
    formatDiagnosticsWithSnippet(source, analysis.diagnostics);
    return { ok: false };
  }
  let out = '';
  let optimized = null as ReturnType<typeof optimizeIR>;
  let result: { code: string; map?: { mappings: Array<{ line: number; kind: string }> } } | null = null;
  if (useAstJs) {
    result = generateJSFromAst(ast as never, { target });
    out = result.code;
  } else {
    const lowered = lowerLumina(ast as never);
    optimized = optimizeIR(lowered) ?? lowered;
    const gen = generateJS(optimized, { target, sourceMap: true });
    out = gen.code;
    result = gen;
  }
  await fs.writeFile(outPath, out, 'utf-8');
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
    ir: optimized,
    grammarHash: buildCache.grammarHash ?? '',
  };
  buildCache.files.set(sourcePath, entry);
  await writeDiskCache(sourcePath, entry);
  return { ok: true, map: result.map, ir: optimized };
}

async function checkLumina(sourcePath: string, grammarPath: string, useRecovery: boolean, diCfg: boolean) {
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  await updateDependenciesForFile(sourcePath, source, configFileExtensions, configStdPath);
  const fileHash = hashText(source);
  const cached = buildCache.files.get(sourcePath);
  if (cached && cached.hash === fileHash && cached.grammarHash === buildCache.grammarHash) {
    buildCache.stats.hits += 1;
    if (cached.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, cached.diagnostics);
      return { ok: false };
    }
    console.log('Lumina check passed (cached)');
    return { ok: true };
  }
  const diskCache = await readDiskCache(sourcePath);
  if (diskCache && diskCache.hash === fileHash && diskCache.grammarHash === buildCache.grammarHash) {
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
  const { ast, diagnostics: parseDiagnostics, parseError } = parseSource(source, parser, useRecovery);
  if (parseError) {
    return { ok: false };
  }
  if (parseDiagnostics.length > 0) {
    formatDiagnosticsWithSnippet(source, parseDiagnostics);
    return { ok: false };
  }
  if (!ast) {
    return { ok: false };
  }
  const analysis = analyzeLumina(ast as never, { diDebug: diCfg });
  if (analysis.diagnostics.length > 0) {
    formatDiagnosticsWithSnippet(source, analysis.diagnostics);
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
    ast,
    diagnostics: analysis.diagnostics,
    ir: null,
    grammarHash: buildCache.grammarHash ?? '',
  };
  buildCache.files.set(sourcePath, entry);
  await writeDiskCache(sourcePath, entry);
  return { ok: true };
}

export async function compileLuminaTask(payload: {
  sourcePath: string;
  outPath: string;
  target: Target;
  grammarPath: string;
  useRecovery: boolean;
  diCfg?: boolean;
  useAstJs?: boolean;
}) {
  return compileLumina(
    payload.sourcePath,
    payload.outPath,
    payload.target,
    payload.grammarPath,
    payload.useRecovery,
    payload.diCfg ?? false,
    payload.useAstJs ?? false
  );
}

export async function checkLuminaTask(payload: {
  sourcePath: string;
  grammarPath: string;
  useRecovery: boolean;
  diCfg?: boolean;
}) {
  return checkLumina(payload.sourcePath, payload.grammarPath, payload.useRecovery, payload.diCfg ?? false);
}

async function runRepl(grammarPath: string) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const parser = compileGrammar(grammarText);
  runREPLWithParser(parser, grammarText);
}

async function watchLumina(
  sources: string[],
  outDir: string | undefined,
  target: Target,
  grammarPath: string,
  outPathArg?: string,
  useRecovery: boolean = false,
  diCfg: boolean = false
) {
  const resolvedSources = sources.map((s) => path.resolve(s));
  const globbed = await fg(resolvedSources, { onlyFiles: true, unique: true, dot: false });
  const expandedSources = globbed.length > 0 ? globbed : resolvedSources;
  const worker = createWorkerRunner({
    fileExtensions: configFileExtensions,
    stdPath: configStdPath,
    cacheDir: buildCache.cacheDir,
  });

  const runCompile = async (filePath: string, outPath: string) => {
    if (!worker) {
      await compileLumina(filePath, outPath, target, grammarPath, useRecovery, diCfg, useAstJs);
      return;
    }
    const result = await worker.compile({
      sourcePath: filePath,
      outPath,
      target,
      grammarPath,
      useRecovery,
      diCfg,
      useAstJs,
    });
    if (!result.ok && result.error) {
      console.error(`Lumina worker error: ${result.error}`);
    }
  };
  const onChange = async (filePath: string) => {
    try {
      const outPath = resolveOutPath(filePath, outPathArg, outDir);
      await runCompile(filePath, outPath);
      const graph = buildDepGraph();
      const dependents = getDependents(graph, filePath);
      for (const dep of dependents) {
        const depOut = resolveOutPath(dep, outPathArg, outDir);
        await runCompile(dep, depOut);
      }
    } catch (err) {
      console.error(`Lumina watch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  for (const sourcePath of expandedSources) {
    const outPath = resolveOutPath(sourcePath, outPathArg, outDir);
    await runCompile(sourcePath, outPath);
  }

  const debounce = new Map<string, NodeJS.Timeout>();
  const schedule = (filePath: string) => {
    const key = filePath;
    const existing = debounce.get(key);
    if (existing) clearTimeout(existing);
    debounce.set(
      key,
      setTimeout(() => {
        debounce.delete(key);
        onChange(filePath);
      }, 150)
    );
  };

  console.log(`Watching ${expandedSources.length} file(s)...`);
  for (const sourcePath of expandedSources) {
    watch(sourcePath, () => schedule(sourcePath));
  }
  watch(grammarPath, () => {
    buildCache.grammarHash = null;
    for (const sourcePath of expandedSources) {
      schedule(sourcePath);
    }
  });
}

type WorkerRequest =
  | { type: 'init'; payload: BuildConfig }
  | {
      type: 'compile';
      id: number;
      payload: { sourcePath: string; outPath: string; target: Target; grammarPath: string; useRecovery: boolean; diCfg: boolean };
    };

type WorkerResponse = { id?: number; ok?: boolean; error?: string };

function createWorkerRunner(config: BuildConfig) {
  const workerPath = resolveWorkerPath();
  if (!workerPath) return null;
  const isCjs = workerPath.endsWith('.cjs');
  const worker = new Worker(workerPath, { type: isCjs ? 'commonjs' : 'module' });
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
      entry.resolve({ ok: false, error: err.message });
    }
    pending.clear();
  });

  worker.postMessage({ type: 'init', payload: config } satisfies WorkerRequest);

  return {
    async compile(payload: { sourcePath: string; outPath: string; target: Target; grammarPath: string; useRecovery: boolean; diCfg: boolean }) {
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
  watch <file>     Watch and recompile on change
  repl             Interactive REPL with Lumina grammar
  grammar          Parser generator tools (was parsergen)
  init             Initialize a parser project template

Options:
  --out <file>         Output JS file (default: lumina.out.js)
  --target <cjs|esm>   Output module format (default: esm)
  --grammar <path>     Override grammar path
  --dry-run            Parse and analyze only (compile command)
  --recovery           Enable resilient parsing (panic mode)
  --di-cfg             Emit CFG dot files during compile/check
  --list-config        Print resolved config and exit
  --sourcemap          Emit source map alongside output
  --debug-ir           Emit Graphviz .dot for optimized IR
  --profile-cache      Print cache hit/miss stats
  --ast-js             Emit JS directly from AST (no IR)

Config file:
  lumina.config.json supports grammarPath, outDir, target, entries, watch, stdPath, fileExtensions, cacheDir, recovery
`);
}

export async function runLumina(argv: string[] = process.argv.slice(2)) {
  const { command, file, args } = parseArgs(argv);
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const config = loadConfig() ?? {};
  const grammarPath = resolveGrammarPath(
    typeof args.get('--grammar') === 'string'
      ? (args.get('--grammar') as string)
      : config.grammarPath
  );
  const target =
    resolveTarget(args.get('--target') as string | undefined) ??
    config.target ??
    'esm';
  const outArg = (args.get('--out') as string) ?? undefined;
  const outDir = config.outDir;
  const dryRun = parseBooleanFlag(args, '--dry-run');
  const useRecovery = parseBooleanFlag(args, '--recovery') || config.recovery === true;
  const diCfg = parseBooleanFlag(args, '--di-cfg');
  const useAstJs = parseBooleanFlag(args, '--ast-js');
  const listConfig = parseBooleanFlag(args, '--list-config');
  const sourceMap = parseBooleanFlag(args, '--sourcemap');
  const debugIr = parseBooleanFlag(args, '--debug-ir');
  const profileCache = parseBooleanFlag(args, '--profile-cache');
  buildCache.cacheDir = config.cacheDir ?? '.lumina-cache';
  configFileExtensions = (config.fileExtensions ?? ['.lm', '.lumina']).map((ext) =>
    ext.startsWith('.') ? ext : `.${ext}`
  );
  configStdPath = config.stdPath
    ? path.resolve(config.stdPath)
    : (configStdPath || path.resolve('std'));
  await loadDepsCache();

  if (listConfig) {
    console.log(
      JSON.stringify(
        {
          grammarPath,
          target,
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

  if (command === 'compile') {
    const entries = file ? [file] : config.entries ?? [];
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (entries.length === 0) {
      const globbed = await fg(extensions.map((ext) => `**/*${ext}`), { onlyFiles: true, unique: true, dot: false });
      entries.push(...globbed);
    }
    if (entries.length === 0) throw new Error('Missing <file> for compile');
    for (const entry of entries) {
      const sourcePath = path.resolve(entry);
      const outPath = resolveOutPath(sourcePath, outArg, outDir);
      if (dryRun) {
        const result = await checkLumina(sourcePath, grammarPath, useRecovery, diCfg);
        if (!result.ok) process.exit(1);
      } else {
        const result = await compileLumina(sourcePath, outPath, target, grammarPath, useRecovery, diCfg, useAstJs);
        if (!result.ok) process.exit(1);
        if (sourceMap && result.map) {
          const mapPath = outPath + '.map';
          await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
          console.log(`Source map: ${mapPath}`);
        }
        if (debugIr && result.ir) {
          const dotPath = outPath + '.dot';
          const dot = irToDot(result.ir);
          await fs.writeFile(dotPath, dot, 'utf-8');
          console.log(`IR graph: ${dotPath}`);
        }
        if (profileCache) {
          const graph = buildDepGraph();
          const stats = graphStats(graph);
          console.log(`Cache: ${buildCache.stats.hits} hit(s), ${buildCache.stats.misses} miss(es), ${buildCache.stats.writes} write(s), ${buildCache.stats.invalidations} invalidation(s)`);
          console.log(`Deps: ${stats.nodes} file(s), ${stats.edges} edge(s)`);
        }
      }
    }
    return;
  }

  if (command === 'check') {
    const entries = file ? [file] : config.entries ?? [];
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (entries.length === 0) {
      const globbed = await fg(extensions.map((ext) => `**/*${ext}`), { onlyFiles: true, unique: true, dot: false });
      entries.push(...globbed);
    }
    if (entries.length === 0) throw new Error('Missing <file> for check');
    for (const entry of entries) {
      const result = await checkLumina(path.resolve(entry), grammarPath, useRecovery, diCfg);
      if (!result.ok) process.exit(1);
      if (profileCache) {
        const graph = buildDepGraph();
        const stats = graphStats(graph);
        console.log(`Cache: ${buildCache.stats.hits} hit(s), ${buildCache.stats.misses} miss(es), ${buildCache.stats.writes} write(s), ${buildCache.stats.invalidations} invalidation(s)`);
        console.log(`Deps: ${stats.nodes} file(s), ${stats.edges} edge(s)`);
      }
    }
    return;
  }

  if (command === 'watch') {
    const sources = file ? [file] : config.watch ?? config.entries ?? [];
    const extensions = config.fileExtensions ?? ['.lm', '.lumina'];
    if (sources.length === 0) {
      sources.push(...extensions.map((ext) => `**/*${ext}`));
    }
    if (sources.length === 0) throw new Error('Missing <file> for watch');
    await watchLumina(sources, outDir, target, grammarPath, outArg, useRecovery, diCfg);
    return;
  }

  if (command === 'repl') {
    await runRepl(grammarPath);
    return;
  }

  if (command === 'grammar') {
    await runParsergen(process.argv.slice(3));
    return;
  }

  if (command === 'init') {
    await runParsergen(['--init']);
    return;
  }

  printHelp();
}
