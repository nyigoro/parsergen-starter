import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('memory leak guard', () => {
  test('repeated parse/infer does not grow memory without bound', () => {
    const sample = `
      struct User { id: i32, score: i32 }
      fn bump(u: User) -> i32 {
        let next = u.score + 1;
        next
      }
      fn main() -> i32 {
        let u = User { id: 1, score: 41 };
        bump(u)
      }
    `;

    const runBatch = (iterations: number) => {
      for (let i = 0; i < iterations; i++) {
        const ast = parser.parse(sample) as { type: string };
        const result = inferProgram(ast as never);
        expect(Array.isArray(result.diagnostics)).toBe(true);
      }
    };

    const hasGc = typeof global.gc === 'function';
    runBatch(200);
    if (!hasGc) {
      return;
    }

    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    runBatch(600);
    global.gc?.();
    const after = process.memoryUsage().heapUsed;
    const growthBytes = after - before;

    // Guardrail value: growth should remain under 24MB for this workload.
    expect(growthBytes).toBeLessThan(24 * 1024 * 1024);
  });
});

