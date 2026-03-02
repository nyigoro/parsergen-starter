import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { compileLuminaTask } from '../../src/bin/lumina-core.js';

type TimingSample = { label: string; ms: number; ok: boolean };

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function makeProgram(size = 6000): string {
  const lines: string[] = ['fn main() -> i32 {', '  let mut acc = 0;'];
  for (let i = 0; i < size; i++) {
    lines.push(`  acc = acc + ${i % 17};`);
  }
  lines.push('  acc', '}');
  return lines.join('\n');
}

async function compileOnce(sourcePath: string, outPath: string, grammarPath: string): Promise<TimingSample> {
  const started = performance.now();
  const result = await compileLuminaTask({
    sourcePath,
    outPath,
    target: 'esm',
    grammarPath,
    useRecovery: true,
  });
  const elapsed = performance.now() - started;
  return { label: 'compile', ms: elapsed, ok: result.ok };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lumina-bench-incremental-'));
  const sourcePath = path.join(root, 'main.lm');
  const outPath = path.join(root, 'main.js');
  const grammarPath = path.resolve('examples/lumina.peg');
  const iterations = 20;

  try {
    await fs.writeFile(sourcePath, makeProgram(), 'utf-8');

    const cold = await compileOnce(sourcePath, outPath, grammarPath);

    const incrementalTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const updated = `${makeProgram()}\n// tweak ${i}\n`;
      await fs.writeFile(sourcePath, updated, 'utf-8');
      const result = await compileOnce(sourcePath, outPath, grammarPath);
      incrementalTimes.push(result.ms);
    }

    const payload = {
      timestamp: new Date().toISOString(),
      iterations,
      cold_ms: cold.ms,
      incremental: {
        p50_ms: percentile(incrementalTimes, 50),
        p95_ms: percentile(incrementalTimes, 95),
        max_ms: Math.max(...incrementalTimes),
      },
      success: cold.ok,
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(payload.success ? 0 : 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
