import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runLuminaImportmap } from './lumina-importmap.js';

type Target = 'browser' | 'wasm';

type CompilePayload = {
  sourcePath: string;
  outPath: string;
  target: 'cjs' | 'esm' | 'wasm';
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
};

type CompileResult = { ok: boolean };

type BundleDependencies = {
  compileTask: (payload: CompilePayload) => Promise<CompileResult>;
};

export type BundleOptions = {
  cwd?: string;
  stdout?: Pick<Console, 'log'>;
  deps: BundleDependencies;
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
};

const parseFlagValue = (argv: string[], name: string): string | null => {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
};

const hasFlag = (argv: string[], name: string): boolean => argv.includes(name);

const positionalArgs = (argv: string[]): string[] => {
  const takesValue = new Set(['--target', '--out', '--loader-out', '--import-map']);
  const result: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      if (takesValue.has(item)) i += 1;
      continue;
    }
    result.push(item);
  }
  return result;
};

const stripCommentsAndWhitespace = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

const writeLoaderShim = async (loaderPath: string, wasmPath: string): Promise<void> => {
  const rel = path.relative(path.dirname(loaderPath), wasmPath).replace(/\\/g, '/');
  const loader = `export async function load(imports = {}) {\n  const wasmUrl = new URL('./${rel}', import.meta.url);\n  const source = await fetch(wasmUrl);\n  if (WebAssembly.instantiateStreaming) {\n    const { instance } = await WebAssembly.instantiateStreaming(source, imports);\n    return instance.exports;\n  }\n  const bytes = await source.arrayBuffer();\n  const { instance } = await WebAssembly.instantiate(bytes, imports);\n  return instance.exports;\n}\n`;
  await fs.mkdir(path.dirname(loaderPath), { recursive: true });
  await fs.writeFile(loaderPath, loader, 'utf-8');
};

export async function runLuminaBundle(argv: string[], options: BundleOptions): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const stdout = options.stdout ?? console;
  if (argv.includes('--help') || argv.includes('-h')) {
    stdout.log('Usage: lumina bundle <entry> --target <browser|wasm> [--out <path>] [--loader-out <path>] [--import-map <path>] [--minify]');
    return;
  }

  const args = positionalArgs(argv);
  const entryArg = args[0] ?? 'src/main.lm';
  const sourcePath = path.resolve(cwd, entryArg);
  const targetRaw = parseFlagValue(argv, '--target') ?? 'browser';
  const target: Target = targetRaw === 'wasm' ? 'wasm' : 'browser';
  const importMapOut = parseFlagValue(argv, '--import-map');

  if (target === 'browser') {
    const outArg = parseFlagValue(argv, '--out');
    const outPath = path.resolve(cwd, outArg ?? 'dist/index.js');
    const result = await options.deps.compileTask({
      sourcePath,
      outPath,
      target: 'esm',
      grammarPath: options.grammarPath,
      useRecovery: options.useRecovery,
      diCfg: options.diCfg,
      useAstJs: options.useAstJs,
      noOptimize: options.noOptimize,
      noInline: options.noInline,
      noComptime: options.noComptime,
      sourceMap: options.sourceMap,
      inlineSourceMap: options.inlineSourceMap,
      stopOnUnresolvedMemberError: options.stopOnUnresolvedMemberError,
    });
    if (!result.ok) throw new Error('Bundle failed: browser target compilation failed');

    if (hasFlag(argv, '--minify')) {
      const source = await fs.readFile(outPath, 'utf-8');
      await fs.writeFile(outPath, `${stripCommentsAndWhitespace(source)}\n`, 'utf-8');
    }

    if (importMapOut) {
      await runLuminaImportmap(['--out', importMapOut, '--write-browser-lock'], { cwd, stdout });
    }

    stdout.log(`Lumina bundled (browser): ${outPath}`);
    return;
  }

  const outArg = parseFlagValue(argv, '--out');
  const outPath = path.resolve(cwd, outArg ?? 'dist/index.wasm');
  const watPath = outPath.endsWith('.wasm') ? outPath.replace(/\.wasm$/i, '.wat') : `${outPath}.wat`;
  const loaderOutArg = parseFlagValue(argv, '--loader-out');
  const loaderPath = path.resolve(cwd, loaderOutArg ?? 'dist/index.js');

  const result = await options.deps.compileTask({
    sourcePath,
    outPath: watPath,
    target: 'wasm',
    grammarPath: options.grammarPath,
    useRecovery: options.useRecovery,
    diCfg: options.diCfg,
    useAstJs: options.useAstJs,
    noOptimize: options.noOptimize,
    noInline: options.noInline,
    noComptime: options.noComptime,
    sourceMap: false,
    inlineSourceMap: false,
    stopOnUnresolvedMemberError: options.stopOnUnresolvedMemberError,
  });
  if (!result.ok) throw new Error('Bundle failed: wasm target compilation failed');

  const producedWasm = watPath.replace(/\.wat$/i, '.wasm');
  if (!existsSync(producedWasm)) {
    throw new Error(`Expected wasm output missing: ${producedWasm}`);
  }

  if (producedWasm !== outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.copyFile(producedWasm, outPath);
  }

  await writeLoaderShim(loaderPath, outPath);

  if (importMapOut) {
    await runLuminaImportmap(['--out', importMapOut, '--write-browser-lock'], { cwd, stdout });
  }

  stdout.log(`Lumina bundled (wasm): ${outPath}`);
  stdout.log(`Loader shim: ${loaderPath}`);
}
