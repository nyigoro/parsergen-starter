import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../../src/grammar/index.js';
import { inferProgram } from '../../src/lumina/hm-infer.js';

function makeProgram(): string {
  return `
    struct User { id: i32, score: i32 }
    fn calc(seed: i32) -> i32 {
      let u = User { id: seed, score: seed + 1 };
      u.id + u.score
    }
    fn main() -> i32 {
      let mut total = 0;
      total = total + calc(1);
      total = total + calc(2);
      total
    }
  `;
}

function toMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

async function main() {
  const grammarPath = path.resolve('examples/lumina.peg');
  const grammar = fs.readFileSync(grammarPath, 'utf-8');
  const parser = compileGrammar(grammar);
  const source = makeProgram();
  const loops = 3000;

  for (let i = 0; i < 200; i++) {
    const ast = parser.parse(source) as { type: string };
    inferProgram(ast as never);
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }
  const before = process.memoryUsage();

  for (let i = 0; i < loops; i++) {
    const ast = parser.parse(source) as { type: string };
    inferProgram(ast as never);
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }
  const after = process.memoryUsage();

  const payload = {
    timestamp: new Date().toISOString(),
    loops,
    gc_available: typeof global.gc === 'function',
    before_mb: {
      heap_used: toMb(before.heapUsed),
      rss: toMb(before.rss),
    },
    after_mb: {
      heap_used: toMb(after.heapUsed),
      rss: toMb(after.rss),
    },
    delta_mb: {
      heap_used: toMb(after.heapUsed - before.heapUsed),
      rss: toMb(after.rss - before.rss),
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${text}\n`);
  process.exit(1);
});

