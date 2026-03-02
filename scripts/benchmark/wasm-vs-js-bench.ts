import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileGrammar } from '../../src/grammar/index.js';
import { generateWATFromAst } from '../../src/lumina/codegen-wasm.js';
import { loadWASM, callWASMFunction } from '../../src/wasm-runtime.js';
import type { LuminaProgram } from '../../src/lumina/ast.js';

type BenchSample = {
  name: string;
  iterations: number;
  ms: number;
  opsPerSec: number;
};

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const sample = (name: string, iterations: number, fn: () => void): BenchSample => {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  return {
    name,
    iterations,
    ms: Math.round(ms * 100) / 100,
    opsPerSec: ms > 0 ? Math.round((iterations / (ms / 1000)) * 100) / 100 : 0,
  };
};

const luminaSource = `
  fn sum_to(n: int) -> int {
    let mut i = 0;
    let mut acc = 0;
    while (i <= n) {
      acc = acc + i;
      i = i + 1;
    }
    return acc;
  }

  fn heavy_loop(n: int) -> int {
    let mut i = 0;
    let mut acc = 1;
    while (i < n) {
      acc = (acc * 1664525 + 1013904223) % 2147483647;
      i = i + 1;
    }
    return acc;
  }

  fn main() -> int {
    return sum_to(100) + heavy_loop(1000);
  }
`;

const jsSumTo = (n: number): number => {
  let acc = 0;
  for (let i = 0; i <= n; i++) acc += i;
  return acc;
};

const jsHeavyLoop = (n: number): number => {
  let i = 0;
  let acc = 1;
  while (i < n) {
    acc = (acc * 1664525 + 1013904223) % 2147483647;
    i += 1;
  }
  return acc;
};

async function compileRuntime() {
  const grammarPath = path.resolve('examples/lumina.peg');
  const grammar = fs.readFileSync(grammarPath, 'utf-8');
  const parser = compileGrammar(grammar);
  const ast = parser.parse(luminaSource) as LuminaProgram;
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`WASM codegen errors: ${errors.map((d) => `${d.code}:${d.message}`).join(', ')}`);
  }

  const tmpDir = path.resolve('.tmp-wasm-bench');
  fs.mkdirSync(tmpDir, { recursive: true });
  const watPath = path.join(tmpDir, 'wasm-vs-js.wat');
  const wasmPath = path.join(tmpDir, 'wasm-vs-js.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return loadWASM(wasmPath);
}

async function main() {
  if (!hasWabt()) {
    process.stdout.write(
      `${JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          skipped: true,
          reason: 'wat2wasm not found',
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const runtime = await compileRuntime();
  const heavyIterations = 1500;
  const sumIterations = 8000;

  const wasmHeavy = sample('wasm_heavy_loop_800', heavyIterations, () => {
    for (let i = 0; i < heavyIterations; i++) {
      callWASMFunction(runtime, 'heavy_loop', 800);
    }
  });
  const jsHeavySample = sample('js_heavy_loop_800', heavyIterations, () => {
    for (let i = 0; i < heavyIterations; i++) {
      jsHeavyLoop(800);
    }
  });

  const wasmSum = sample('wasm_sum_to_5000', sumIterations, () => {
    for (let i = 0; i < sumIterations; i++) {
      callWASMFunction(runtime, 'sum_to', 5000);
    }
  });
  const jsSumSample = sample('js_sum_to_5000', sumIterations, () => {
    for (let i = 0; i < sumIterations; i++) {
      jsSumTo(5000);
    }
  });

  const payload = {
    timestamp: new Date().toISOString(),
    samples: [wasmHeavy, jsHeavySample, wasmSum, jsSumSample],
    speedup: {
      heavy_vs_js: jsHeavySample.ms > 0 ? Math.round((jsHeavySample.ms / wasmHeavy.ms) * 100) / 100 : null,
      sum_vs_js: jsSumSample.ms > 0 ? Math.round((jsSumSample.ms / wasmSum.ms) * 100) / 100 : null,
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
