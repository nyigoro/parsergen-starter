import fs from 'node:fs';
import path from 'node:path';
import { runLumina } from '../src/bin/lumina-core.js';

const benchmarkCompiledSourcePath = path.resolve(__dirname, '../examples/dom-render/benchmark-compiled.lm');
const benchmarkCompiledSource = fs.readFileSync(benchmarkCompiledSourcePath, 'utf-8');
const benchmarkCompiledGeneratedPath = path.resolve(__dirname, '../examples/dom-render/benchmark-compiled.generated.js');

async function runCommand(argv: string[]) {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  let exitCode: number | null = null;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(' '));
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT:${exitCode}`);
  }) as typeof process.exit;

  try {
    await runLumina(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith('EXIT:')) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return {
    exitCode: exitCode ?? 0,
    stdout: logs.join('\n'),
    stderr: errors.join('\n'),
  };
}

describe('compiled DOM benchmark example', () => {
  test('documents compiler-driven list authoring', () => {
    expect(benchmarkCompiledSource).toContain('compiledWholeList');
    expect(benchmarkCompiledSource).toContain('compiledIndexList');
    expect(benchmarkCompiledSource).toContain('compiledForList');
    expect(benchmarkCompiledSource).toContain('compiledReorder');
    expect(benchmarkCompiledSource).toContain('text(get(row))');
    expect(benchmarkCompiledSource).toContain('text(row.label)');
    expect(benchmarkCompiledSource).toContain('props_class("bench-pill")');
    expect(benchmarkCompiledSource).toContain('props_key(row.id)');
  });

  test('passes the CLI checker', async () => {
    const result = await runCommand(['check', benchmarkCompiledSourcePath]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Lumina check passed');
  }, 15000);

  test('generated benchmark module uses compiler DOM lowering', () => {
    const output = fs.readFileSync(benchmarkCompiledGeneratedPath, 'utf-8');
    expect(output).toMatch(/import \{[^}]*\bindexList\b[^}]*\bforList\b[^}]*\} from "\.\/lumina-runtime\.js";/s);
    expect(output).toContain('domTemplateHtml = "<span class=\\"bench-pill\\">row</span>"');
    expect(output).toContain('render.indexList(');
    expect(output).toContain('render.forList(');
    expect(output).toContain('render.liveText(');
    expect(output).toContain('function compiledWholeList');
    expect(output).toContain('function compiledIndexList');
    expect(output).toContain('function compiledForList');
    expect(output).toContain('function compiledReorder');
    expect(output).toContain('export {');
  });
});
