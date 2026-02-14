import fs from 'node:fs/promises';
import { existsSync, watch, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  generateWATFromAst,
  irToDot,
  inferProgram,
  monomorphize,
} from '../index.js';
import { ensureRuntimeForOutput } from './runtime.js';
import { extractImports } from '../project/imports.js';
import { parseWithPanicRecovery } from '../project/panic.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { runREPLWithParser } from '../repl.js';
import { runParsergen } from './cli-core.js';
import { type RawSourceMap } from 'source-map';
import {
  initProject,
  installPackages,
  addPackages,
  removePackages,
  listPackages,
} from '../commands/package.js';

type Target = 'cjs' | 'esm' | 'wasm';

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
    if (raw.target === 'cjs' || raw.target === 'esm' || raw.target === 'wasm') normalized.target = raw.target;
    else errors.push('target must be "cjs", "esm", or "wasm"');
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
  return value === 'cjs' || value === 'esm' || value === 'wasm' ? value : null;
}

function resolveOutPath(
  sourcePath: string,
  outPathArg: string | undefined,
  outDir: string | undefined,
  target?: Target
): string {
  if (outPathArg) return path.resolve(outPathArg);
  const ext = target === 'wasm' ? '.wat' : '.js';
  const base = path.basename(sourcePath, path.extname(sourcePath)) + ext;
  if (outDir) return path.resolve(outDir, base);
  return path.resolve(target === 'wasm' ? 'lumina.out.wat' : 'lumina.out.js');
}

type BuildConfig = {
  fileExtensions: string[];
  stdPath: string;
  cacheDir: string;
};

type LuminaLockfile = {
  lockfileVersion: number;
  packages: Record<string, LockfilePackage>;
};

type LockfilePackage = {
  version: string;
  resolved: string;
  integrity?: string;
  lumina?: string | Record<string, string>;
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

function findLockfileRoot(fromPath: string): string | null {
  let current = path.dirname(fromPath);
  while (true) {
    const candidate = path.join(current, 'lumina.lock.json');
    if (existsSync(candidate)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadLockfile(root: string): LuminaLockfile | null {
  const lockPath = path.join(root, 'lumina.lock.json');
  try {
    const stat = statSync(lockPath);
    const cached = lockfileCache.get(root);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const raw = readFileSync(lockPath, 'utf-8');
    const parsed = JSON.parse(raw) as LuminaLockfile;
    lockfileCache.set(root, { mtimeMs: stat.mtimeMs, data: parsed });
    return parsed;
  } catch {
    return null;
  }
}

function parsePackageSpecifier(specifier: string): { pkgName: string; subpath: string | null } {
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
}

function resolveBareImport(
  fromPath: string,
  spec: string,
  extensions: string[],
  lockfileRoot?: string | null
): string | null {
  const root = lockfileRoot ?? findLockfileRoot(fromPath);
  if (!root) return null;
  const lockfile = loadLockfile(root);
  if (!lockfile) return null;
  const { pkgName, subpath } = parsePackageSpecifier(spec);
  const pkg = lockfile.packages?.[pkgName];
  if (!pkg || !pkg.lumina) return null;
  const lumina = pkg.lumina;
  let entry: string | undefined;
  if (subpath) {
    if (typeof lumina === 'object') {
      entry = lumina[subpath];
    }
  } else if (typeof lumina === 'string') {
    entry = lumina;
  } else if (typeof lumina === 'object') {
    entry = lumina['.'];
  }
  if (!entry) return null;
  let pkgRoot = pkg.resolved;
  if (!path.isAbsolute(pkgRoot)) {
    pkgRoot = path.resolve(root, pkgRoot);
  }
  const absolute = path.resolve(pkgRoot, entry);
  return ensureExtension(absolute, extensions);
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

async function updateDependenciesForFile(
  sourcePath: string,
  source: string,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
) {
  const fileHash = hashText(source);
  const cached = depCache.get(sourcePath);
  if (cached && cached.hash === fileHash) {
    return;
  }
  const rawImports = extractImports(source);
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

type ImportBindingLite = { local: string; original: string; source: string; namespace: boolean };

function collectImportBindingsLite(program: { type?: string; body?: unknown[] }): ImportBindingLite[] {
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

function rewriteTypeNameLite(typeExpr: unknown, renameMap: Map<string, string>): unknown {
  if (typeof typeExpr !== 'string') return typeExpr;
  const parsed = parseTypeNameLite(typeExpr);
  if (!parsed) return renameMap.get(typeExpr) ?? typeExpr;
  const base = renameMap.get(parsed.base) ?? parsed.base;
  if (parsed.args.length === 0) return base;
  const args = parsed.args.map((arg) => rewriteTypeNameLite(arg, renameMap) as string);
  return `${base}<${args.join(',')}>`;
}

function rewriteProgramImports(
  program: { type?: string; body?: unknown[] },
  renameMap: Map<string, string>,
  namespaceAliases: Map<string, string | null>,
  resolvedImports: Set<string>
): { type: string; body: unknown[]; location?: unknown } {
  const makeIdentifier = (name: string, location?: unknown) => ({ type: 'Identifier', name, location });
  const rewriteExpr = (expr: unknown): unknown => {
    if (!expr || typeof expr !== 'object') return expr;
    const node = expr as { type?: string; [key: string]: unknown };
    switch (node.type) {
      case 'Identifier': {
        const name = node.name as string | undefined;
        if (name && renameMap.has(name)) node.name = renameMap.get(name);
        return node;
      }
      case 'Call': {
        const enumName = node.enumName as string | null | undefined;
        if (enumName) {
          if (renameMap.has(enumName)) {
            node.enumName = renameMap.get(enumName);
          } else if (namespaceAliases.has(enumName)) {
            const replacement = namespaceAliases.get(enumName);
            node.enumName = replacement ?? null;
          }
        }
        const callee = node.callee as { name?: string } | undefined;
        if (callee?.name && renameMap.has(callee.name)) {
          callee.name = renameMap.get(callee.name);
        }
        if (Array.isArray(node.args)) {
          node.args = node.args.map((arg) => rewriteExpr(arg));
        }
        return node;
      }
      case 'Member': {
        const object = node.object as { type?: string; name?: string } | undefined;
        if (object?.type === 'Identifier' && object.name && namespaceAliases.has(object.name)) {
          const replacement = namespaceAliases.get(object.name);
          if (replacement) {
            object.name = replacement;
            node.object = object;
            return node;
          }
          return makeIdentifier(node.property as string, node.location);
        }
        node.object = rewriteExpr(node.object);
        return node;
      }
      case 'Binary':
        node.left = rewriteExpr(node.left);
        node.right = rewriteExpr(node.right);
        return node;
      case 'Move':
        node.target = rewriteExpr(node.target);
        return node;
      case 'StructLiteral': {
        const name = node.name as string | undefined;
        if (name && renameMap.has(name)) node.name = renameMap.get(name);
        if (Array.isArray(node.fields)) {
          node.fields = node.fields.map((field: { value?: unknown }) => ({
            ...field,
            value: rewriteExpr(field.value),
          }));
        }
        return node;
      }
      case 'MatchExpr': {
        node.value = rewriteExpr(node.value);
        if (Array.isArray(node.arms)) {
          node.arms = node.arms.map((arm: { pattern?: unknown; body?: unknown }) => ({
            ...arm,
            pattern: rewritePattern(arm.pattern),
            body: rewriteExpr(arm.body),
          }));
        }
        return node;
      }
      case 'IsExpr': {
        const enumName = node.enumName as string | null | undefined;
        if (enumName) {
          if (renameMap.has(enumName)) {
            node.enumName = renameMap.get(enumName);
          } else if (namespaceAliases.has(enumName)) {
            const replacement = namespaceAliases.get(enumName);
            node.enumName = replacement ?? null;
          }
        }
        node.value = rewriteExpr(node.value);
        return node;
      }
      default:
        return node;
    }
  };

  const rewritePattern = (pattern: unknown): unknown => {
    if (!pattern || typeof pattern !== 'object') return pattern;
    const node = pattern as { type?: string; enumName?: string | null };
    if (node.type === 'EnumPattern' && node.enumName) {
      if (renameMap.has(node.enumName)) {
        node.enumName = renameMap.get(node.enumName) ?? node.enumName;
      } else if (namespaceAliases.has(node.enumName)) {
        const replacement = namespaceAliases.get(node.enumName);
        node.enumName = replacement ?? null;
      }
    }
    return node;
  };

  const rewriteStmt = (stmt: unknown): unknown => {
    if (!stmt || typeof stmt !== 'object') return stmt;
    const node = stmt as { type?: string; [key: string]: unknown };
    switch (node.type) {
      case 'FnDecl': {
        if (Array.isArray(node.params)) {
          node.params = node.params.map((param: { typeName?: unknown }) => ({
            ...param,
            typeName: rewriteTypeNameLite(param.typeName, renameMap),
          }));
        }
        node.returnType = rewriteTypeNameLite(node.returnType, renameMap);
        if (Array.isArray(node.typeParams)) {
          node.typeParams = node.typeParams.map((param: { bound?: unknown[] }) => ({
            ...param,
            bound: Array.isArray(param.bound)
              ? param.bound.map((bound) => rewriteTypeNameLite(bound, renameMap))
              : param.bound,
          }));
        }
        node.body = rewriteStmt(node.body);
        return node;
      }
      case 'Let':
        node.typeName = rewriteTypeNameLite(node.typeName, renameMap);
        node.value = rewriteExpr(node.value);
        return node;
      case 'Return':
        node.value = rewriteExpr(node.value);
        return node;
      case 'Assign':
        node.target = rewriteExpr(node.target);
        node.value = rewriteExpr(node.value);
        return node;
      case 'ExprStmt':
        node.expr = rewriteExpr(node.expr);
        return node;
      case 'If':
        node.condition = rewriteExpr(node.condition);
        node.thenBlock = rewriteStmt(node.thenBlock);
        if (node.elseBlock) node.elseBlock = rewriteStmt(node.elseBlock);
        return node;
      case 'While':
        node.condition = rewriteExpr(node.condition);
        node.body = rewriteStmt(node.body);
        return node;
      case 'MatchStmt':
        node.value = rewriteExpr(node.value);
        if (Array.isArray(node.arms)) {
          node.arms = node.arms.map((arm: { pattern?: unknown; body?: unknown }) => ({
            ...arm,
            pattern: rewritePattern(arm.pattern),
            body: rewriteStmt(arm.body),
          }));
        }
        return node;
      case 'Block':
        if (Array.isArray(node.body)) node.body = node.body.map(rewriteStmt);
        return node;
      case 'StructDecl':
      case 'TypeDecl': {
        if (Array.isArray(node.body)) {
          node.body = node.body.map((field: { typeName?: unknown }) => ({
            ...field,
            typeName: rewriteTypeNameLite(field.typeName, renameMap),
          }));
        }
        if (Array.isArray(node.typeParams)) {
          node.typeParams = node.typeParams.map((param: { bound?: unknown[] }) => ({
            ...param,
            bound: Array.isArray(param.bound)
              ? param.bound.map((bound) => rewriteTypeNameLite(bound, renameMap))
              : param.bound,
          }));
        }
        return node;
      }
      case 'EnumDecl': {
        if (Array.isArray(node.variants)) {
          node.variants = node.variants.map((variant: { params?: unknown[] }) => ({
            ...variant,
            params: Array.isArray(variant.params)
              ? variant.params.map((param) => rewriteTypeNameLite(param, renameMap))
              : variant.params,
          }));
        }
        if (Array.isArray(node.typeParams)) {
          node.typeParams = node.typeParams.map((param: { bound?: unknown[] }) => ({
            ...param,
            bound: Array.isArray(param.bound)
              ? param.bound.map((bound) => rewriteTypeNameLite(bound, renameMap))
              : param.bound,
          }));
        }
        return node;
      }
      case 'StructLiteral':
      case 'MatchExpr':
        return rewriteExpr(node);
      default:
        return node;
    }
  };

  const body = Array.isArray(program.body)
    ? program.body
        .filter((stmt) => {
          const node = stmt as { type?: string; source?: { value?: string } };
          if (node.type !== 'Import') return true;
          const source = node.source?.value ?? '';
          return !resolvedImports.has(source);
        })
        .map((stmt) => rewriteStmt(stmt))
    : [];

  return { type: 'Program', body, location: (program as { location?: unknown }).location };
}

async function bundleProgram(
  entryPath: string,
  parser: ReturnType<typeof compileGrammar>,
  useRecovery: boolean,
  extensions: string[],
  stdPath: string,
  lockfileRoot?: string | null
): Promise<{ program: unknown; sources: Map<string, string> } | null> {
  const visited = new Map<string, { ast: unknown; text: string; bindings: ImportBindingLite[]; resolvedImports: Set<string> }>();
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
    if (!ast) return false;
    const bindings = collectImportBindingsLite(ast as { type?: string; body?: unknown[] });
    const resolvedImports = new Set<string>();
    visited.set(filePath, { ast, text, bindings, resolvedImports });
    sources.set(filePath, text);

    const imports = extractImports(text);
    for (const imp of imports) {
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

  const mergedBody: unknown[] = [];
  for (const filePath of order) {
    const entry = visited.get(filePath);
    if (!entry) continue;
    const renameMap = new Map<string, string>();
    const namespaceAliases = new Map<string, string | null>();
    for (const binding of entry.bindings) {
      if (!entry.resolvedImports.has(binding.source)) continue;
      if (binding.namespace) {
        namespaceAliases.set(binding.local, null);
        continue;
      }
      if (binding.local !== binding.original) {
        renameMap.set(binding.local, binding.original);
      }
    }
    const rewritten = rewriteProgramImports(
      entry.ast as { type?: string; body?: unknown[] },
      renameMap,
      namespaceAliases,
      entry.resolvedImports
    );
    if (Array.isArray(rewritten.body)) {
      mergedBody.push(...rewritten.body);
    }
  }

  return { program: { type: 'Program', body: mergedBody }, sources };
}

function monomorphizeAst(program: unknown): unknown {
  const hm = inferProgram(program as never);
  const cloned = JSON.parse(JSON.stringify(program)) as never;
  return monomorphize(cloned, { inferredCalls: hm.inferredCalls });
}

async function compileLumina(
  sourcePath: string,
  outPath: string,
  target: Target,
  grammarPath: string,
  useRecovery: boolean,
  diCfg: boolean,
  useAstJs: boolean,
  noOptimize: boolean,
  sourceMap: boolean,
  inlineSourceMap: boolean
) {
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const lockfileRoot = findLockfileRoot(sourcePath);
  await updateDependenciesForFile(sourcePath, source, configFileExtensions, configStdPath, lockfileRoot);
  const hasProjectImports = extractImports(source).some((imp) => !imp.startsWith('@std/'));
  if (target === 'wasm') {
    if (hasProjectImports) {
      const bundle = await bundleProgram(
        sourcePath,
        parser,
        useRecovery,
        configFileExtensions,
        configStdPath,
        lockfileRoot
      );
      if (!bundle) return { ok: false };
      const analysis = analyzeLumina(bundle.program as never, { diDebug: diCfg });
      if (analysis.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, analysis.diagnostics);
        return { ok: false };
      }
      const monoAst = monomorphizeAst(bundle.program as never);
      const wasm = generateWATFromAst(monoAst as never, { exportMain: true });
      if (wasm.diagnostics.length > 0) {
        formatDiagnosticsWithSnippet(source, wasm.diagnostics);
        return { ok: false };
      }
      await fs.writeFile(outPath, wasm.wat, 'utf-8');
      console.log(`Lumina compiled (wasm): ${outPath}`);
      return { ok: true, map: undefined, ir: undefined };
    }

    const { ast, diagnostics: parseDiagnostics, parseError } = parseSource(source, parser, useRecovery);
    if (parseError) return { ok: false };
    if (parseDiagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, parseDiagnostics);
      return { ok: false };
    }
    if (!ast) return { ok: false };
    const analysis = analyzeLumina(ast as never, { diDebug: diCfg });
    if (analysis.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, analysis.diagnostics);
      return { ok: false };
    }
    const monoAst = monomorphizeAst(ast as never);
    const wasm = generateWATFromAst(monoAst as never, { exportMain: true });
    if (wasm.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, wasm.diagnostics);
      return { ok: false };
    }
    await fs.writeFile(outPath, wasm.wat, 'utf-8');
    console.log(`Lumina compiled (wasm): ${outPath}`);
    return { ok: true, map: undefined, ir: undefined };
  }
  if (hasProjectImports) {
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
      await updateDependenciesForFile(depPath, depSource, configFileExtensions, configStdPath, lockfileRoot);
    }
    const analysis = analyzeLumina(bundle.program as never, { diDebug: diCfg });
    if (analysis.diagnostics.length > 0) {
      formatDiagnosticsWithSnippet(source, analysis.diagnostics);
      return { ok: false };
    }
    let out = '';
    let optimized = null as ReturnType<typeof optimizeIR>;
    let result: { code: string; map?: RawSourceMap } | null = null;
    if (useAstJs) {
      const monoAst = monomorphizeAst(bundle.program as never);
      result = generateJSFromAst(monoAst as never, {
        target,
        sourceMap,
        sourceFile: sourcePath,
        sourceContent: source,
      });
      out = result.code;
    } else {
      const monoAst = monomorphizeAst(bundle.program as never);
      const lowered = lowerLumina(monoAst as never);
      optimized = noOptimize ? lowered : optimizeIR(lowered) ?? lowered;
      const gen = generateJS(optimized, { target, sourceMap, sourceFile: sourcePath, sourceContent: source });
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
    await fs.writeFile(outPath, out, 'utf-8');
    if (sourceMap && result.map && !inlineSourceMap) {
      const mapPath = outPath + '.map';
      await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
    }
    await ensureRuntimeForOutput(outPath, target);
    console.log(`Lumina compiled (bundled): ${outPath}`);
    return { ok: true, map: result.map, ir: optimized };
  }
  const fileHash = hashText(source);
  const cached = buildCache.files.get(sourcePath);
  if (cached && cached.hash === fileHash && cached.grammarHash === buildCache.grammarHash) {
    buildCache.stats.hits += 1;
    if (useAstJs) {
      const monoAst = monomorphizeAst(cached.ast as never);
      const result = generateJSFromAst(monoAst as never, {
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
      await fs.writeFile(outPath, out, 'utf-8');
      if (sourceMap && result.map && !inlineSourceMap) {
        const mapPath = outPath + '.map';
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
      }
      await ensureRuntimeForOutput(outPath, target);
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: cached.ir ?? lowerLumina(monoAst as never) };
    }
    const monoAst = monomorphizeAst(cached.ast as never);
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
  if (diskCache && diskCache.hash === fileHash && diskCache.grammarHash === buildCache.grammarHash) {
    buildCache.stats.hits += 1;
    buildCache.files.set(sourcePath, diskCache);
    if (useAstJs) {
      const monoAst = monomorphizeAst(diskCache.ast as never);
      const result = generateJSFromAst(monoAst as never, {
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
      await fs.writeFile(outPath, out, 'utf-8');
      if (sourceMap && result.map && !inlineSourceMap) {
        const mapPath = outPath + '.map';
        await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
      }
      await ensureRuntimeForOutput(outPath, target);
      console.log(`Lumina compiled (cached): ${outPath}`);
      return { ok: true, map: undefined, ir: diskCache.ir ?? lowerLumina(monoAst as never) };
    }
    const monoAst = monomorphizeAst(diskCache.ast as never);
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
  let result: { code: string; map?: RawSourceMap } | null = null;
  if (useAstJs) {
    const monoAst = monomorphizeAst(ast as never);
    result = generateJSFromAst(monoAst as never, {
      target,
      sourceMap,
      sourceFile: sourcePath,
      sourceContent: source,
    });
    out = result.code;
  } else {
    const monoAst = monomorphizeAst(ast as never);
    const lowered = lowerLumina(monoAst as never);
    optimized = noOptimize ? lowered : optimizeIR(lowered) ?? lowered;
    const gen = generateJS(optimized, { target, sourceMap, sourceFile: sourcePath, sourceContent: source });
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
  };
  buildCache.files.set(sourcePath, entry);
  await writeDiskCache(sourcePath, entry);
  return { ok: true, map: result.map, ir: optimized };
}

async function checkLumina(sourcePath: string, grammarPath: string, useRecovery: boolean, diCfg: boolean) {
  const parser = await loadGrammar(grammarPath);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const lockfileRoot = findLockfileRoot(sourcePath);
  await updateDependenciesForFile(sourcePath, source, configFileExtensions, configStdPath, lockfileRoot);
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
  noOptimize?: boolean;
  sourceMap?: boolean;
  inlineSourceMap?: boolean;
}) {
  return compileLumina(
    payload.sourcePath,
    payload.outPath,
    payload.target,
    payload.grammarPath,
    payload.useRecovery,
    payload.diCfg ?? false,
    payload.useAstJs ?? false,
    payload.noOptimize ?? false,
    payload.sourceMap ?? false,
    payload.inlineSourceMap ?? false
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
  diCfg: boolean = false,
  noOptimize: boolean = false,
  inlineSourceMap: boolean = false
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
      await compileLumina(
        filePath,
        outPath,
        target,
        grammarPath,
        useRecovery,
        diCfg,
        useAstJs,
        noOptimize,
        sourceMap,
        inlineSourceMap
      );
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
      noOptimize,
      sourceMap,
      inlineSourceMap,
    });
    if (!result.ok && result.error) {
      console.error(`Lumina worker error: ${result.error}`);
    }
  };
  const onChange = async (filePath: string) => {
    try {
      const outPath = resolveOutPath(filePath, outPathArg, outDir, target);
      await runCompile(filePath, outPath);
      const graph = buildDepGraph();
      const dependents = getDependents(graph, filePath);
      for (const dep of dependents) {
        const depOut = resolveOutPath(dep, outPathArg, outDir, target);
        await runCompile(dep, depOut);
      }
    } catch (err) {
      console.error(`Lumina watch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  for (const sourcePath of expandedSources) {
    const outPath = resolveOutPath(sourcePath, outPathArg, outDir, target);
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
      payload: {
        sourcePath: string;
        outPath: string;
        target: Target;
        grammarPath: string;
        useRecovery: boolean;
        diCfg: boolean;
        useAstJs?: boolean;
        noOptimize?: boolean;
        sourceMap?: boolean;
        inlineSourceMap?: boolean;
      };
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
    async compile(payload: { sourcePath: string; outPath: string; target: Target; grammarPath: string; useRecovery: boolean; diCfg: boolean; useAstJs?: boolean; noOptimize?: boolean; sourceMap?: boolean; inlineSourceMap?: boolean }) {
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
  --target <cjs|esm|wasm>   Output module format (default: esm)
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
  --ast-js             Emit JS directly from AST (no IR)
  --no-optimize        Skip IR SSA + constant folding (workaround for known issues)
  --yes                Use defaults without prompts (init)
  --frozen             Use npm ci if lockfile is present (install)
  --dev                Add package as dev dependency (add)

Config file:
  lumina.config.json supports grammarPath, outDir, target, entries, watch, stdPath, fileExtensions, cacheDir, recovery
Commands:
  init                 Initialize a Lumina project (package.json + src/)
  install              Install dependencies via npm and write lumina.lock.json
  add <pkg...>         Add dependency (supports @scope/pkg@version)
  remove <pkg...>      Remove dependency
  list                 List Lumina-resolvable packages from lumina.lock.json
`);
}

export async function runLumina(argv: string[] = process.argv.slice(2)) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const command = positional[0];
  const file = positional[1];
  const { args } = parseArgs(argv);
  const positionalArgs = positional.slice(1);
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const initYes = parseBooleanFlag(args, '--yes');
  const installFrozen = parseBooleanFlag(args, '--frozen');
  const addDev = parseBooleanFlag(args, '--dev');

  if (command === 'init') {
    await initProject({ yes: initYes });
    return;
  }

  if (command === 'install') {
    await installPackages({ frozen: installFrozen });
    return;
  }

  if (command === 'add') {
    await addPackages(positionalArgs, { dev: addDev });
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
  const noOptimize = parseBooleanFlag(args, '--no-optimize');
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
      const outPath = resolveOutPath(sourcePath, outArg, outDir, target);
      if (dryRun) {
        const result = await checkLumina(sourcePath, grammarPath, useRecovery, diCfg);
        if (!result.ok) process.exit(1);
      } else {
        const result = await compileLumina(
          sourcePath,
          outPath,
          target,
          grammarPath,
          useRecovery,
          diCfg,
          useAstJs,
          noOptimize,
          sourceMap,
          inlineSourceMap
        );
        if (!result.ok) process.exit(1);
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
    await watchLumina(sources, outDir, target, grammarPath, outArg, useRecovery, diCfg, noOptimize, inlineSourceMap);
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


  printHelp();
}
