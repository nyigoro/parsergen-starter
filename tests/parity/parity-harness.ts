import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compileGrammar } from '../../src/grammar/index.js';
import { generateJSFromAst } from '../../src/lumina/codegen-js.js';
import { generateWATFromAst } from '../../src/lumina/codegen-wasm.js';
import { awaitWASMPromiseHandle, callWASMFunction, loadWASM } from '../../src/wasm-runtime.js';
import type { Diagnostic } from '../../src/parser/index.js';
import type { LuminaProgram } from '../../src/lumina/ast.js';

export interface ParityTestCase {
  name: string;
  source: string;
  expectedOut?: string;
  expectedRet?: number | null;
}

export interface ParityRunOutput {
  out: string;
  ret: number | null;
}

export interface ParityResult {
  jsOut: string;
  wasmOut: string;
  jsRet: number | null;
  wasmRet: number | null;
  match: boolean;
  diff: string | null;
}

const grammarPath = path.resolve(__dirname, '../../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);
const tmpDir = path.join(os.tmpdir(), 'lumina-parity');

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

const normalizeOutput = (value: string): string => value.replace(/\r\n/g, '\n').trimEnd();

const normalizeReturn = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
};

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const assertNoHardErrors = (diagnostics: Diagnostic[], phase: string): void => {
  const hard = diagnostics.filter((d) => d.severity === 'error');
  if (hard.length === 0) return;
  const first = hard[0];
  throw new Error(`${phase} failed with ${hard.length} error(s): ${first.code ?? 'NO_CODE'} ${first.message}`);
};

const hashText = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 16);

export const supportsParityWasm = (): boolean => hasWabt();

export async function runJS(source: string): Promise<ParityRunOutput> {
  const ast = parseProgram(source);
  const { code } = generateJSFromAst(ast, {
    target: 'cjs',
    includeRuntime: false,
  });

  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const modulePath = path.join(tmpDir, `parity-js-${hashText(source)}-${Date.now()}.cjs`);
  const wrapped = `${code}\n\nconst __luminaParityLogs = [];\nconst __luminaOrigLog = console.log;\nconsole.log = (...args) => { __luminaParityLogs.push(args.map((entry) => String(entry)).join(' ')); };\n(async () => {\n  let __luminaParityRet = null;\n  let __luminaParityErr = null;\n  try {\n    if (typeof main === 'function') {\n      const __luminaValue = main();\n      const __luminaResolved = (__luminaValue && typeof __luminaValue.then === 'function')\n        ? await __luminaValue\n        : __luminaValue;\n      if (typeof __luminaResolved === 'number') {\n        __luminaParityRet = Number(__luminaResolved);\n      } else if (typeof __luminaResolved === 'bigint') {\n        __luminaParityRet = Number(__luminaResolved);\n      }\n    }\n  } catch (error) {\n    __luminaParityErr = error instanceof Error ? error.message : String(error);\n  } finally {\n    console.log = __luminaOrigLog;\n  }\n  globalThis.process.stdout.write(JSON.stringify({ out: __luminaParityLogs.join('\\\\n'), ret: __luminaParityRet, error: __luminaParityErr }));\n})();\n`;
  fs.writeFileSync(modulePath, wrapped, 'utf-8');
  const raw = execSync(`node "${modulePath}"`, { encoding: 'utf-8' }).trim();
  const payload = (raw ? JSON.parse(raw) : { out: '', ret: null }) as {
    out: string;
    ret: number | null;
    error?: string | null;
  };
  if (payload.error) {
    throw new Error(`JS parity execution failed: ${payload.error}`);
  }
  return {
    out: normalizeOutput(payload.out),
    ret: normalizeReturn(payload.ret),
  };
}

export async function runWasm(source: string): Promise<ParityRunOutput> {
  if (!hasWabt()) {
    throw new Error('wat2wasm is required for WASM parity tests');
  }

  const ast = parseProgram(source);
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  assertNoHardErrors(diagnostics, 'WASM codegen');

  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const stem = `parity-wasm-${hashText(source)}-${Date.now()}`;
  const watPath = path.join(tmpDir, `${stem}.wat`);
  const wasmPath = path.join(tmpDir, `${stem}.wasm`);
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((entry) => String(entry)).join(' '));
  };

  const mainDecl = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'main');
  const isAsyncMain = !!(mainDecl && mainDecl.type === 'FnDecl' && mainDecl.async);
  let ret: unknown = null;
  try {
    const runtime = await loadWASM(wasmPath);
    ret = callWASMFunction(runtime, 'main');
    if (isAsyncMain && typeof ret === 'number') {
      ret = await awaitWASMPromiseHandle(ret);
    }
  } finally {
    console.log = originalLog;
  }

  return {
    out: normalizeOutput(logs.join('\n')),
    ret: normalizeReturn(ret),
  };
}

export async function parityTest(testCase: ParityTestCase): Promise<ParityResult> {
  const js = await runJS(testCase.source);
  const wasm = await runWasm(testCase.source);
  const match = js.out === wasm.out && js.ret === wasm.ret;
  const diff = match
    ? null
    : [
        `JS out : ${js.out}`,
        `WASM out: ${wasm.out}`,
        `JS ret : ${String(js.ret)}`,
        `WASM ret: ${String(wasm.ret)}`,
      ].join('\n');

  if (typeof testCase.expectedOut === 'string') {
    if (js.out !== normalizeOutput(testCase.expectedOut) || wasm.out !== normalizeOutput(testCase.expectedOut)) {
      throw new Error(`Expected stdout mismatch for '${testCase.name}'`);
    }
  }

  if (typeof testCase.expectedRet !== 'undefined') {
    if (js.ret !== testCase.expectedRet || wasm.ret !== testCase.expectedRet) {
      throw new Error(`Expected return mismatch for '${testCase.name}'`);
    }
  }

  return {
    jsOut: js.out,
    wasmOut: wasm.out,
    jsRet: js.ret,
    wasmRet: wasm.ret,
    match,
    diff,
  };
}
