#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync, watch, readFileSync } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

import { compileGrammar } from '../grammar/index.js';
import { parseInput, ParserUtils } from '../parser/index.js';
import { formatError } from '../utils/index.js';
import { analyzeLumina, lowerLumina, optimizeIR, generateJS } from '../index.js';
import { runREPLWithParser } from '../repl.js';

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
  if (entries) normalized.entries = entries;
  if (watch) normalized.watch = watch;

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

async function compileLumina(sourcePath: string, outPath: string, target: Target, grammarPath: string) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const parser = compileGrammar(grammarText);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const parsed = parseInput(parser, source);
  if (ParserUtils.isParseError(parsed)) {
    console.error(formatError(parsed));
    process.exit(1);
  }
  const ast = (parsed as { result: unknown }).result;
  const analysis = analyzeLumina(ast as never);
  if (analysis.diagnostics.length > 0) {
    analysis.diagnostics.forEach(d => {
      console.error(`[${d.code ?? 'DIAG'}] ${d.message}`);
    });
    return { ok: false };
  }
  const lowered = lowerLumina(ast as never);
  const optimized = optimizeIR(lowered) ?? lowered;
  const result = generateJS(optimized, { target, sourceMap: true });
  const out = result.code;
  await fs.writeFile(outPath, out, 'utf-8');
  console.log(`Lumina compiled: ${outPath}`);
  return { ok: true, map: result.map };
}

async function checkLumina(sourcePath: string, grammarPath: string) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const parser = compileGrammar(grammarText);
  const source = await fs.readFile(sourcePath, 'utf-8');
  const parsed = parseInput(parser, source);
  if (ParserUtils.isParseError(parsed)) {
    console.error(formatError(parsed));
    process.exit(1);
  }
  const ast = (parsed as { result: unknown }).result;
  const analysis = analyzeLumina(ast as never);
  if (analysis.diagnostics.length > 0) {
    analysis.diagnostics.forEach(d => {
      console.error(`[${d.code ?? 'DIAG'}] ${d.message}`);
    });
    return { ok: false };
  }
  console.log('Lumina check passed');
  return { ok: true };
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
  outPathArg?: string
) {
  const resolvedSources = sources.map((s) => path.resolve(s));
  const globbed = await fg(resolvedSources, { onlyFiles: true, unique: true, dot: false });
  const expandedSources = globbed.length > 0 ? globbed : resolvedSources;
  const onChange = async (filePath: string) => {
    try {
      const outPath = resolveOutPath(filePath, outPathArg, outDir);
      await compileLumina(filePath, outPath, target, grammarPath);
    } catch (err) {
      console.error(`Lumina watch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  for (const sourcePath of expandedSources) {
    const outPath = resolveOutPath(sourcePath, outPathArg, outDir);
    await compileLumina(sourcePath, outPath, target, grammarPath);
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
    for (const sourcePath of expandedSources) {
      schedule(sourcePath);
    }
  });
}

function printHelp() {
  console.log(`
lumina <command> [file] [options]

Commands:
  compile <file>   Compile Lumina source to JS
  check <file>     Parse + analyze only (no emit)
  watch <file>     Watch and recompile on change
  repl             Interactive REPL with Lumina grammar

Options:
  --out <file>         Output JS file (default: lumina.out.js)
  --target <cjs|esm>   Output module format (default: esm)
  --grammar <path>     Override grammar path
  --dry-run            Parse and analyze only (compile command)
  --list-config        Print resolved config and exit
  --sourcemap          Emit source map alongside output

Config file:
  lumina.config.json supports grammarPath, outDir, target, entries, watch
`);
}

async function main() {
  const { command, file, args } = parseArgs(process.argv.slice(2));
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
  const listConfig = parseBooleanFlag(args, '--list-config');
  const sourceMap = parseBooleanFlag(args, '--sourcemap');

  if (listConfig) {
    console.log(
      JSON.stringify(
        {
          grammarPath,
          target,
          outDir,
          entries: config.entries ?? [],
          watch: config.watch ?? [],
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'compile') {
    const entries = file ? [file] : config.entries ?? [];
    if (entries.length === 0) throw new Error('Missing <file> for compile');
    for (const entry of entries) {
      const sourcePath = path.resolve(entry);
      const outPath = resolveOutPath(sourcePath, outArg, outDir);
      if (dryRun) {
        const result = await checkLumina(sourcePath, grammarPath);
        if (!result.ok) process.exit(1);
      } else {
        const result = await compileLumina(sourcePath, outPath, target, grammarPath);
        if (!result.ok) process.exit(1);
        if (sourceMap && result.map) {
          const mapPath = outPath + '.map';
          await fs.writeFile(mapPath, JSON.stringify(result.map, null, 2), 'utf-8');
          console.log(`Source map: ${mapPath}`);
        }
      }
    }
    return;
  }

  if (command === 'check') {
    const entries = file ? [file] : config.entries ?? [];
    if (entries.length === 0) throw new Error('Missing <file> for check');
    for (const entry of entries) {
      const result = await checkLumina(path.resolve(entry), grammarPath);
      if (!result.ok) process.exit(1);
    }
    return;
  }

  if (command === 'watch') {
    const sources = file ? [file] : config.watch ?? config.entries ?? [];
    if (sources.length === 0) throw new Error('Missing <file> for watch');
    await watchLumina(sources, outDir, target, grammarPath, outArg);
    return;
  }

  if (command === 'repl') {
    await runRepl(grammarPath);
    return;
  }

  printHelp();
}

main().catch((err) => {
  console.error(`Lumina CLI error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
