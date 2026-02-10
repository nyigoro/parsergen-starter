#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync, watchFile } from 'node:fs';
import path from 'node:path';

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
    process.exit(1);
  }
  const lowered = lowerLumina(ast as never);
  const optimized = optimizeIR(lowered) ?? lowered;
  const out = generateJS(optimized, { target }).code;
  await fs.writeFile(outPath, out, 'utf-8');
  console.log(`Lumina compiled: ${outPath}`);
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
    process.exit(1);
  }
  console.log('Lumina check passed');
}

async function runRepl(grammarPath: string) {
  const grammarText = await fs.readFile(grammarPath, 'utf-8');
  const parser = compileGrammar(grammarText);
  runREPLWithParser(parser, grammarText);
}

async function watchLumina(sourcePath: string, outPath: string, target: Target, grammarPath: string) {
  console.log(`Watching ${sourcePath}...`);
  await compileLumina(sourcePath, outPath, target, grammarPath);
  watchFile(sourcePath, { interval: 250 }, async () => {
    try {
      await compileLumina(sourcePath, outPath, target, grammarPath);
    } catch (err) {
      console.error(`Lumina watch error: ${err instanceof Error ? err.message : String(err)}`);
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
`);
}

async function main() {
  const { command, file, args } = parseArgs(process.argv.slice(2));
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const grammarPath = resolveGrammarPath(
    typeof args.get('--grammar') === 'string' ? (args.get('--grammar') as string) : undefined
  );
  const target = (args.get('--target') as Target) ?? 'esm';
  const outPath = (args.get('--out') as string) ?? 'lumina.out.js';

  if (command === 'compile') {
    if (!file) throw new Error('Missing <file> for compile');
    await compileLumina(path.resolve(file), path.resolve(outPath), target, grammarPath);
    return;
  }

  if (command === 'check') {
    if (!file) throw new Error('Missing <file> for check');
    await checkLumina(path.resolve(file), grammarPath);
    return;
  }

  if (command === 'watch') {
    if (!file) throw new Error('Missing <file> for watch');
    await watchLumina(path.resolve(file), path.resolve(outPath), target, grammarPath);
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
