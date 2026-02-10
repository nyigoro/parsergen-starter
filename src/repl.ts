import { compileGrammar, CompiledGrammar } from './grammar/index.js';
import { ParseError, parseInput } from './parser/index.js';
import { formatErrorWithColors, printAST } from './utils/index.js';

import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';

export function runREPL() {
  runREPLWithParser(null);
}

export function runREPLWithParser(parser: CompiledGrammar<unknown> | null, grammar?: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'parsergen> ',
  });

  console.log('📘 ParserGen REPL');
  console.log('Commands:');
  console.log('  .help');
  console.log('  .exit');
  console.log('  .clear');
  console.log('  .grammar [inline|@file]');
  console.log('  .test [inline]');
  console.log('  .paste [--no-parse]');
  console.log('  .load <file>');
  console.log('  .save <file>');
  console.log('  .ast on|off|json|tree');
  console.log('  .stats');
  console.log('  .last ast|error');
  console.log('  .history [n]');
  console.log('  .debounce <ms>');
  console.log('  .copy ast|error|input');
  console.log('  .run [@file]');
  console.log('  .profile [n]');
  console.log('  Multiline: end a line with \\ to continue, or use .grammar/.test with no args and finish with .end');

  let currentParser: CompiledGrammar<unknown> | null = parser;
  let currentGrammar: string | null = grammar ?? null;

  const historyFile = path.join(os.homedir(), '.parsergen_history');
  const loadHistory = (): string[] => {
    try {
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, 'utf-8');
        return data.split('\n').filter(Boolean);
      }
    } catch {
      // ignore history load errors
    }
    return [];
  };

  const history = loadHistory();
  rl.history = history.reverse();

  let astFormat: 'json' | 'tree' | 'off' = 'json';
  let lastInput: string | null = null;
  let lastAst: unknown | null = null;
  let lastError: ParseError | null = null;
  let lastStats: { ms: number; nodes: number } | null = null;
  let lastAstText: string | null = null;
  let lastErrorText: string | null = null;
  let debounceMs = 200;

  let multilineMode: 'grammar' | 'test' | null = null;
  let bufferLines: string[] = [];
  let pasteBuffer: string[] = [];
  let pasteTimer: NodeJS.Timeout | null = null;
  let pasteNoParse = false;

  const saveHistoryLine = (line: string) => {
    try {
      fs.appendFileSync(historyFile, line + '\n');
    } catch {
      // ignore history save errors
    }
  };

  const setPrompt = (mode: 'default' | 'continue' | 'grammar' | 'test') => {
    if (mode === 'default') rl.setPrompt('parsergen> ');
    if (mode === 'continue') rl.setPrompt('...> ');
    if (mode === 'grammar') rl.setPrompt('grammar> ');
    if (mode === 'test') rl.setPrompt('input> ');
  };

  const countNodes = (node: unknown): number => {
    if (node === null || node === undefined) return 1;
    if (Array.isArray(node)) return node.reduce((sum, item) => sum + countNodes(item), 0);
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      return 1 + Object.values(obj).reduce((sum, value) => sum + countNodes(value), 0);
    }
    return 1;
  };

  const printResult = (result: unknown) => {
    if (astFormat === 'off') {
      console.log('✓ Parse successful');
      lastAstText = null;
      return;
    }
    if (astFormat === 'tree') {
      if (result && typeof result === 'object' && 'type' in (result as object)) {
        const tree = printAST(result as never);
        console.log(tree);
        lastAstText = tree;
        return;
      }
    }
    const json = JSON.stringify(result, null, 2);
    console.log(json);
    lastAstText = json;
  };

  const parseAndReport = (input: string) => {
    if (!currentParser) {
      console.error('✗ No grammar loaded. Use .grammar <grammar> first');
      return;
    }
    lastInput = input;
    const start = performance.now();
    try {
      const result = parseInput(currentParser, input);
      const ms = performance.now() - start;
      if (result && typeof result === 'object' && 'success' in (result as object) && (result as { success: boolean }).success === false) {
        lastError = result as ParseError;
        lastAst = null;
        lastStats = { ms, nodes: 0 };
        lastErrorText = formatErrorWithColors(lastError, false);
        console.error('✗ Parse error:\n' + formatErrorWithColors(lastError, true));
      } else {
        const payload = (result as { result: unknown }).result ?? result;
        lastAst = payload;
        lastError = null;
        lastErrorText = null;
        lastStats = { ms, nodes: countNodes(payload) };
        printResult(payload);
      }
    } catch (error) {
      const err = error as ParseError;
      lastError = err;
      lastAst = null;
      lastErrorText = formatErrorWithColors(err, false);
      lastStats = { ms: performance.now() - start, nodes: 0 };
      console.error('✗ Parse error:\n' + formatErrorWithColors(err, true));
    }
  };

  const copyToClipboard = (text: string) => {
    if (process.platform === 'win32') {
      spawnSync('cmd', ['/c', 'clip'], { input: text });
      return true;
    }
    if (process.platform === 'darwin') {
      spawnSync('pbcopy', [], { input: text });
      return true;
    }
    const xclip = spawnSync('xclip', ['-selection', 'clipboard'], { input: text });
    if (xclip.status === 0) return true;
    const xsel = spawnSync('xsel', ['--clipboard', '--input'], { input: text });
    return xsel.status === 0;
  };

  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (trimmed) saveHistoryLine(line);

    if (trimmed === '.exit') {
      rl.close();
      return;
    }

    if (trimmed === '.help') {
      console.log('Commands:');
      console.log('  .help');
      console.log('  .exit');
      console.log('  .clear');
      console.log('  .grammar [inline|@file]');
      console.log('  .test [inline]');
      console.log('  .paste [--no-parse]');
      console.log('  .load <file>');
      console.log('  .save <file>');
      console.log('  .ast on|off|json|tree');
      console.log('  .stats');
      console.log('  .last ast|error');
      console.log('  .history [n]');
      console.log('  .debounce <ms>');
      console.log('  .copy ast|error|input');
      console.log('  .run [@file]');
      console.log('  .profile [n]');
      console.log('  Multiline: end a line with \\ to continue, or use .grammar/.test with no args and finish with .end');
      rl.prompt();
      return;
    }

    if (trimmed === '.clear') {
      console.clear();
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.ast')) {
      const arg = trimmed.split(/\s+/)[1];
      if (arg === 'on' || arg === 'json') astFormat = 'json';
      else if (arg === 'tree') astFormat = 'tree';
      else if (arg === 'off') astFormat = 'off';
      console.log(`AST output: ${astFormat}`);
      rl.prompt();
      return;
    }

    if (trimmed === '.stats') {
      if (lastStats) {
        console.log(`Last parse: ${lastStats.ms.toFixed(2)}ms, ${lastStats.nodes} nodes`);
      } else {
        console.log('No stats yet');
      }
      rl.prompt();
      return;
    }

    if (trimmed === '.last ast') {
      if (lastAst) printResult(lastAst);
      else console.log('No AST available');
      rl.prompt();
      return;
    }

    if (trimmed === '.last error') {
      if (lastError) console.error(formatErrorWithColors(lastError, true));
      else console.log('No error available');
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.history')) {
      const arg = trimmed.split(/\s+/)[1];
      const count = arg ? Math.max(1, Number(arg)) : 20;
      const entries = rl.history.slice(0, count).reverse();
      entries.forEach((entry, idx) => {
        console.log(`${idx + 1}: ${entry}`);
      });
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.debounce ')) {
      const arg = trimmed.split(/\s+/)[1];
      const value = Number(arg);
      if (!Number.isFinite(value) || value < 0) {
        console.error('✗ Invalid debounce value');
      } else {
        debounceMs = value;
        console.log(`Debounce set to ${debounceMs}ms`);
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.copy ')) {
      const target = trimmed.split(/\s+/)[1];
      let text: string | null = null;
      if (target === 'ast') text = lastAstText;
      if (target === 'error') text = lastErrorText;
      if (target === 'input') text = lastInput;
      if (!text) {
        console.log('Nothing to copy');
      } else if (copyToClipboard(text)) {
        console.log('✓ Copied to clipboard');
      } else {
        console.log('✗ Clipboard tool not available');
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.load ')) {
      const filePath = trimmed.slice(6).trim();
      if (!filePath) {
        console.error('✗ Missing file path');
      } else {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          parseAndReport(content);
        } catch (error) {
          console.error(`✗ Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.save ')) {
      const filePath = trimmed.slice(6).trim();
      if (!filePath) {
        console.error('✗ Missing file path');
      } else {
        const payload = {
          grammar: currentGrammar,
          lastInput,
          lastAst,
          lastError,
          lastStats,
          astFormat,
          timestamp: new Date().toISOString(),
        };
        try {
          fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
          console.log(`✓ Session saved to ${filePath}`);
        } catch (error) {
          console.error(`✗ Failed to save: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      rl.prompt();
      return;
    }

    if (trimmed === '.grammar') {
      multilineMode = 'grammar';
      bufferLines = [];
      setPrompt('grammar');
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.grammar ')) {
      const arg = trimmed.slice(9).trim();
      if (arg.startsWith('@')) {
        const filePath = arg.slice(1);
        try {
          const grammarText = fs.readFileSync(filePath, 'utf-8');
          currentParser = compileGrammar(grammarText);
          currentGrammar = grammarText;
          console.log('✓ Grammar compiled successfully');
        } catch (error) {
          console.error('✗ Grammar error:\n' + formatErrorWithColors(error as ParseError, true));
        }
      } else {
        try {
          currentParser = compileGrammar(arg);
          currentGrammar = arg;
          console.log('✓ Grammar compiled successfully');
        } catch (error) {
          console.error('✗ Grammar error:\n' + formatErrorWithColors(error as ParseError, true));
        }
      }
      rl.prompt();
      return;
    }

    if (trimmed === '.test') {
      multilineMode = 'test';
      bufferLines = [];
      pasteNoParse = false;
      setPrompt('test');
      rl.prompt();
      return;
    }

    if (trimmed === '.paste' || trimmed.startsWith('.paste ')) {
      const arg = trimmed.split(/\s+/)[1];
      pasteNoParse = arg === '--no-parse';
      multilineMode = 'test';
      bufferLines = [];
      setPrompt('test');
      rl.prompt();
      return;
    }

    if (trimmed === '.end' && multilineMode) {
      const combined = bufferLines.join('\n');
      const mode = multilineMode;
      multilineMode = null;
      bufferLines = [];
      setPrompt('default');
      if (mode === 'grammar') {
        try {
          currentParser = compileGrammar(combined);
          currentGrammar = combined;
          console.log('✓ Grammar compiled successfully');
        } catch (error) {
          console.error('✗ Grammar error:\n' + formatErrorWithColors(error as ParseError, true));
        }
      } else if (mode === 'test') {
        if (pasteNoParse) {
          lastInput = combined;
          console.log('✓ Input buffered (not parsed). Use .test to parse or .copy input to export.');
        } else {
          parseAndReport(combined);
        }
        pasteNoParse = false;
      }
      rl.prompt();
      return;
    }

    if (multilineMode) {
      bufferLines.push(line);
      rl.prompt();
      return;
    }

    if (line.endsWith('\\')) {
      bufferLines.push(line.slice(0, -1));
      setPrompt('continue');
      rl.prompt();
      return;
    }

    if (bufferLines.length > 0) {
      bufferLines.push(line);
      const combined = bufferLines.join('\n');
      bufferLines = [];
      setPrompt('default');
      parseAndReport(combined);
      rl.prompt();
      return;
    }

    if (trimmed === '.run' || trimmed.startsWith('.run ')) {
      const arg = trimmed.split(/\s+/)[1];
      if (arg && arg.startsWith('@')) {
        const filePath = arg.slice(1);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          lastInput = content;
          parseAndReport(content);
        } catch (error) {
          console.error(`✗ Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (lastInput) {
        parseAndReport(lastInput);
      } else {
        console.log('No buffered input to run');
      }
      rl.prompt();
      return;
    }

    if (trimmed === '.profile' || trimmed.startsWith('.profile ')) {
      if (!currentParser) {
        console.error('✗ No grammar loaded. Use .grammar <grammar> first');
        rl.prompt();
        return;
      }
      if (!lastInput) {
        console.log('No buffered input to profile');
        rl.prompt();
        return;
      }
      const arg = trimmed.split(/\s+/)[1];
      const iterations = arg ? Math.max(1, Number(arg)) : 100;
      if (!Number.isFinite(iterations)) {
        console.error('✗ Invalid iteration count');
        rl.prompt();
        return;
      }
      const start = performance.now();
      let ok = 0;
      let failed = 0;
      for (let i = 0; i < iterations; i++) {
        try {
          const result = parseInput(currentParser, lastInput);
          if (result && typeof result === 'object' && 'success' in (result as object) && (result as { success: boolean }).success === false) {
            failed++;
          } else {
            ok++;
          }
        } catch {
          failed++;
        }
      }
      const end = performance.now();
      const totalMs = end - start;
      const avgMs = totalMs / iterations;
      const throughput = (iterations / totalMs) * 1000;
      console.log(`Profiled ${iterations} runs: avg ${avgMs.toFixed(3)}ms, total ${totalMs.toFixed(2)}ms, ok ${ok}, failed ${failed}, throughput ${throughput.toFixed(2)}/s`);
      rl.prompt();
      return;
    }

    // Auto-parse on paste with debounce
    if (trimmed.length > 0) {
      pasteBuffer.push(line);
      if (pasteTimer) clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => {
        const combined = pasteBuffer.join('\n');
        pasteBuffer = [];
        parseAndReport(combined);
        rl.prompt();
      }, debounceMs);
      return;
    }

    console.log('Unknown command. Use .help');

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}
