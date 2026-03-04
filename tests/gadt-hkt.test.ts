import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('GADT + HKT interaction', () => {
  test('supports non-existential HKTs in indexed GADT positions', () => {
    const source = `
      enum Container<F<_>, A> {
        Wrap(F<A>): Container<F, A>,
        Empty: Container<F, A>
      }

      fn take(c: Container<Option, i32>) -> i32 {
        match c {
          Container.Wrap(Some(v)) => v,
          Container.Wrap(None) => 0,
          Container.Empty => 0
        }
      }
    `.trim() + '\n';

    const inferred = inferProgram(parseProgram(source));
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('keeps existential HKTs rejected with GADT-005', () => {
    const source = `
      enum Bad {
        Wrap exists <F<_>>(F<i32>): Bad
      }
    `.trim() + '\n';

    const sem = analyzeLumina(parseProgram(source));
    expect(sem.diagnostics.some((diag) => diag.code === 'GADT-005')).toBe(true);
  });
});
