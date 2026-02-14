/* eslint-disable no-console */
import fs from 'node:fs';

export interface WASMRuntime {
  instance: WebAssembly.Instance;
  memory?: WebAssembly.Memory;
}

type EnvImports = {
  env: {
    print_int: (n: number) => void;
    print_float: (n: number) => void;
    print_bool: (b: number) => void;
    abs_int: (n: number) => number;
    abs_float: (n: number) => number;
  };
};

const defaultImports: EnvImports = {
  env: {
    print_int: (n: number) => console.log(n),
    print_float: (n: number) => console.log(n),
    print_bool: (b: number) => console.log(b === 1 ? 'true' : 'false'),
    abs_int: (n: number) => Math.abs(n | 0),
    abs_float: (n: number) => Math.abs(n),
  },
};

export async function loadWASM(
  wasmPath: string,
  imports: EnvImports = defaultImports
): Promise<WASMRuntime> {
  const buffer = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(buffer, imports);
  const memory = instance.exports.memory as WebAssembly.Memory | undefined;
  return { instance, memory };
}

export function callWASMFunction(
  runtime: WASMRuntime,
  funcName: string,
  ...args: number[]
): number {
  const fn = runtime.instance.exports[funcName] as (...params: number[]) => number;
  if (!fn) {
    throw new Error(`Function ${funcName} not found in WASM exports`);
  }
  return fn(...args);
}
