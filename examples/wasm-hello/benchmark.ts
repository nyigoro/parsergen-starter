import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadWASM, callWASMFunction } from '../../src/wasm-runtime.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, 'math.wasm');
const jsPath = path.join(__dirname, 'math.cjs');

const runtime = await loadWASM(wasmPath);

console.time('WASM fibonacci(35)');
const wasmResult = callWASMFunction(runtime, 'fibonacci', 35);
console.timeEnd('WASM fibonacci(35)');
console.log('WASM result:', wasmResult);

const require = createRequire(import.meta.url);
const code = fs.readFileSync(jsPath, 'utf-8');
const context = {
  console,
  require,
  module: { exports: {} },
  exports: {},
};
vm.createContext(context);
vm.runInContext(code, context);

const jsFib = (context as any).fibonacci as (n: number) => number;
console.time('JS fibonacci(35)');
const jsResult = jsFib(35);
console.timeEnd('JS fibonacci(35)');
console.log('JS result:', jsResult);
