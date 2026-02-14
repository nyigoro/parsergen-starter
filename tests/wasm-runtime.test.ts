import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { loadWASM, callWASMFunction } from '../src/wasm-runtime.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const tempDir = path.join(__dirname, '../.tmp-wasm');

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const compileAndLoad = async (source: string) => {
  const ast = parseProgram(source);
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  expect(diagnostics.length).toBe(0);

  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'test.wat');
  const wasmPath = path.join(tempDir, 'test.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
};

describe('WASM runtime', () => {
  it('runs simple addition', async () => {
    if (!hasWabt()) return;
    const source = `
      fn add(a: int, b: int) -> int { return a + b; }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    const result = callWASMFunction(runtime, 'add', 5, 7);
    expect(result).toBe(12);
  });

  it('handles recursion (fib)', async () => {
    if (!hasWabt()) return;
    const source = `
      fn fib(n: int) -> int {
        if n <= 1 {
          return n;
        } else {
          return fib(n - 1) + fib(n - 2);
        }
      }
    `.trim() + '\n';
    const runtime = await compileAndLoad(source);
    expect(callWASMFunction(runtime, 'fib', 0)).toBe(0);
    expect(callWASMFunction(runtime, 'fib', 1)).toBe(1);
    expect(callWASMFunction(runtime, 'fib', 10)).toBe(55);
  });
});
