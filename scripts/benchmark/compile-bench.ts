import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { compileLuminaTask } from '../../src/bin/lumina-core.js';

type BenchmarkSample = {
  name: string;
  ms: number;
  ok: boolean;
  details?: string;
};

function makeLuminaProgram(lines = 10000): string {
  const chunks: string[] = ['fn main() -> i32 {'];
  chunks.push('  let mut acc = 0;');
  for (let i = 0; i < lines; i++) {
    chunks.push(`  acc = acc + ${i % 7};`);
  }
  chunks.push('  acc');
  chunks.push('}');
  return chunks.join('\n');
}

function makeTsProgram(lines = 10000): string {
  const chunks: string[] = ['export function main(): number {', '  let acc = 0;'];
  for (let i = 0; i < lines; i++) {
    chunks.push(`  acc = acc + ${i % 7};`);
  }
  chunks.push('  return acc;');
  chunks.push('}');
  return chunks.join('\n');
}

async function runLuminaSample(workDir: string): Promise<BenchmarkSample> {
  const sourcePath = path.join(workDir, 'bench.lm');
  const outPath = path.join(workDir, 'bench.js');
  const grammarPath = path.resolve('examples/lumina.peg');
  await fs.writeFile(sourcePath, makeLuminaProgram(), 'utf-8');

  const start = performance.now();
  const result = await compileLuminaTask({
    sourcePath,
    outPath,
    target: 'esm',
    grammarPath,
    useRecovery: true,
    noOptimize: false,
  });
  const ms = performance.now() - start;
  return {
    name: 'lumina_compile',
    ms,
    ok: result.ok,
    details: existsSync(outPath) ? outPath : 'no output file emitted',
  };
}

function runExternalCompiler(
  name: string,
  command: string,
  args: string[],
  cwd: string
): BenchmarkSample {
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
  });
  const ms = performance.now() - start;
  return {
    name,
    ms,
    ok: result.status === 0,
    details: result.status === 0 ? 'ok' : (result.stderr || result.stdout || `exit=${result.status}`),
  };
}

async function main() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumina-bench-compile-'));
  const tsPath = path.join(workDir, 'bench.ts');
  await fs.writeFile(tsPath, makeTsProgram(), 'utf-8');

  const samples: BenchmarkSample[] = [];
  samples.push(await runLuminaSample(workDir));

  const tscJs = path.resolve('node_modules/typescript/bin/tsc');
  if (existsSync(tscJs)) {
    samples.push(
      runExternalCompiler(
        'tsc_no_emit',
        process.execPath,
        [
          tscJs,
          '--noEmit',
          '--target',
          'ES2020',
          '--skipLibCheck',
          '--moduleResolution',
          'node',
          '--types',
          'node',
          tsPath,
        ],
        process.cwd()
      )
    );
  }

  const esbuildJs = path.resolve('node_modules/esbuild/bin/esbuild');
  if (existsSync(esbuildJs)) {
    samples.push(
      runExternalCompiler(
        'esbuild_bundle',
        process.execPath,
        [esbuildJs, tsPath, '--bundle', '--outfile=' + path.join(workDir, 'bench.esbuild.js')],
        process.cwd()
      )
    );
  }

  const payload = {
    timestamp: new Date().toISOString(),
    samples,
    success: samples.find((s) => s.name === 'lumina_compile')?.ok === true,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  await fs.rm(workDir, { recursive: true, force: true });
  process.exit(payload.success ? 0 : 1);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});
