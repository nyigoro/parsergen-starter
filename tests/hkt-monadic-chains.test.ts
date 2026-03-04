import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('HKT monadic chain inference', () => {
  test('keeps long option flat_map chains inferable', () => {
    const source = `
      import { monad } from "@std";

      fn chain(value: Option<i32>) -> Option<i32> {
        let step1 = monad.flat_map_option(value, |n| Some(n + 1));
        let step2 = monad.flat_map_option(step1, |n| Some(n * 2));
        let step3 = monad.flat_map_option(step2, |n| Some(n - 3));
        monad.flat_map_option(step3, |n| Some(n + 4))
      }
    `.trim() + '\n';

    const result = inferProgram(parseProgram(source));
    const errors = result.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
