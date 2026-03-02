import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

const makeNumericExpr = (rng: SeededRandom, depth = 0): string => {
  if (depth >= 2 || rng.next() < 0.55) {
    return String(rng.int(0, 256));
  }
  const left = makeNumericExpr(rng, depth + 1);
  const right = makeNumericExpr(rng, depth + 1);
  const op = ['+', '-', '*'][rng.int(0, 2)];
  return `(${left} ${op} ${right})`;
};

const numericTypes = ['i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64'] as const;

const literalForType = (type: (typeof numericTypes)[number], value: number): string => {
  if (type === 'f32' || type === 'f64') {
    return `${value}.5${type}`;
  }
  const clamped = Math.max(0, value);
  return `${clamped}${type}`;
};

describe('HM property-style fuzzing', () => {
  test('random arithmetic programs never crash parser/inferencer', () => {
    const rng = new SeededRandom(0xC0FFEE);
    const samples = 6;

    for (let i = 0; i < samples; i++) {
      const exprA = makeNumericExpr(rng);
      const exprB = makeNumericExpr(rng);
      const program = `
        fn main() -> i32 {
          let a = ${exprA};
          let b = ${exprB};
          if (a > b) { a - b } else { b - a }
        }
      `;

      expect(() => {
        const ast = parser.parse(program) as { type: string };
        const inferred = inferProgram(ast as never);
        expect(Array.isArray(inferred.diagnostics)).toBe(true);
      }).not.toThrow();
    }
  });

  test('numeric cast matrix does not emit invalid cast diagnostics', () => {
    const subset = numericTypes.slice(0, 4);
    const samples = subset.flatMap((from) => subset.map((to) => ({ from, to })));
    let seed = 1337;

    for (const { from, to } of samples) {
      seed += 97;
      const literal = literalForType(from, seed % 127);
      const program = `
        fn convert() -> ${to} {
          let value: ${from} = ${literal};
          value as ${to}
        }
      `;

      const ast = parser.parse(program) as { type: string };
      const inferred = inferProgram(ast as never);
      const castErrors = inferred.diagnostics.filter((d) => d.code === 'TYPE-CAST');
      expect(castErrors).toHaveLength(0);
    }
  });
});
