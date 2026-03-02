import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { compileLuminaTask } from '../../src/bin/lumina-core.js';

type BenchResult = {
  label: string;
  compileMs: number;
  ok: boolean;
  outSizeBytes: number | null;
  wasmSizeBytes: number | null;
  wasmLayoutBytes: number | null;
  error?: string;
};

const grammarPath = path.resolve('examples/lumina.peg');

const fixedSizeSource = `
struct FixedBlock<const N: usize> {
  data: [i32; N]
}

fn run() -> i32 {
  let block: FixedBlock<8> = FixedBlock { data: [1, 2, 3, 4, 5, 6, 7, 8] };
  let _ = block;
  1
}
`.trim() + '\n';

const dynamicSource = `
struct DynamicBlock {
  data: Vec<i32>
}

fn run() -> i32 {
  let block = DynamicBlock { data: [1, 2, 3, 4, 5, 6, 7, 8] };
  let _ = block;
  1
}
`.trim() + '\n';

function parseWasmLayoutBytes(content: string): number | null {
  const match = content.match(/Total size:\s*(\d+)\s*bytes/i);
  if (!match) return null;
  return Number(match[1]);
}

async function compileSource(workDir: string, label: string, source: string): Promise<BenchResult> {
  const sourcePath = path.join(workDir, `${label}.lm`);
  const outPath = path.join(workDir, `${label}.js`);
  const wasmOutPath = path.join(workDir, `${label}.wat`);
  await fs.writeFile(sourcePath, source, 'utf-8');

  const compileStart = performance.now();
  const jsResult = await compileLuminaTask({
    sourcePath,
    outPath,
    target: 'esm',
    grammarPath,
    useRecovery: true,
    noOptimize: false,
    stopOnUnresolvedMemberError: true,
  });
  const compileMs = performance.now() - compileStart;
  if (!jsResult.ok) {
    return {
      label,
      compileMs,
      ok: false,
      outSizeBytes: null,
      wasmSizeBytes: null,
      wasmLayoutBytes: null,
      error: jsResult.error,
    };
  }

  let wasmSizeBytes: number | null = null;
  let wasmLayoutBytes: number | null = null;
  const wasmResult = await compileLuminaTask({
    sourcePath,
    outPath: wasmOutPath,
    target: 'wasm',
    grammarPath,
    useRecovery: true,
    noOptimize: false,
    stopOnUnresolvedMemberError: true,
  });
  if (wasmResult.ok && existsSync(wasmOutPath)) {
    const wasmContent = await fs.readFile(wasmOutPath, 'utf-8');
    const wasmStats = await fs.stat(wasmOutPath);
    wasmSizeBytes = wasmStats.size;
    wasmLayoutBytes = parseWasmLayoutBytes(wasmContent);
  }

  const outSizeBytes = existsSync(outPath) ? (await fs.stat(outPath)).size : null;
  return {
    label,
    compileMs,
    ok: true,
    outSizeBytes,
    wasmSizeBytes,
    wasmLayoutBytes,
    error: wasmResult.ok ? undefined : wasmResult.error,
  };
}

async function main() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumina-bench-const-'));
  const fixed = await compileSource(workDir, 'fixed', fixedSizeSource);
  const dynamic = await compileSource(workDir, 'dynamic', dynamicSource);

  const payload = {
    timestamp: new Date().toISOString(),
    fixed,
    dynamic,
    comparison: {
      compileDeltaMs: fixed.compileMs - dynamic.compileMs,
      jsSizeDeltaBytes:
        fixed.outSizeBytes != null && dynamic.outSizeBytes != null
          ? fixed.outSizeBytes - dynamic.outSizeBytes
          : null,
      wasmSizeDeltaBytes:
        fixed.wasmSizeBytes != null && dynamic.wasmSizeBytes != null
          ? fixed.wasmSizeBytes - dynamic.wasmSizeBytes
          : null,
      wasmLayoutBytes: {
        fixed: fixed.wasmLayoutBytes,
        dynamic: dynamic.wasmLayoutBytes,
      },
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  await fs.rm(workDir, { recursive: true, force: true });
  process.exit(fixed.ok && dynamic.ok ? 0 : 1);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
