import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('HKT pattern positions', () => {
  test('refines nested enum patterns through HKT-applied struct fields', () => {
    const source = `
      struct Wrapper<F<_>, A> {
        value: F<A>
      }

      fn take(w: Wrapper<Option, i32>) -> i32 {
        match w {
          Wrapper { value: Some(v) } => v,
          Wrapper { value: None } => 0
        }
      }
    `.trim() + '\n';

    const result = inferProgram(parseProgram(source));
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
