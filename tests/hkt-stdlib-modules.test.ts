import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('@std HKT helper modules', () => {
  it('typechecks functor/applicative/monad/foldable/traversable usage', () => {
    const source = `
      import { vec, Option, Result, functor, applicative, monad, foldable, traversable } from "@std";

      fn main() -> i32 {
        let values = vec.new();
        vec.push(values, 1);
        vec.push(values, 2);
        vec.push(values, 3);

        let mapped = functor.map_vec(values, |x| x + 1);
        let lifted = applicative.pure_option(10);
        let chained = monad.flat_map_option(lifted, |x| Option.Some(x + 2));
        let total = foldable.fold_vec(mapped, 0, |acc, x| acc + x);
        let traversed = traversable.traverse_vec_result(mapped, |x| Result.Ok(x));

        let _ = chained;
        let _ = traversed;
        total
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const semErrors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semErrors).toHaveLength(0);

    const hm = inferProgram(ast);
    const hmErrors = hm.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('emits runtime calls for new HKT helper modules', () => {
    const source = `
      import { functor, foldable, vec } from "@std";

      fn main() -> i32 {
        let values = vec.new();
        vec.push(values, 1);
        let mapped = functor.map_vec(values, |x| x + 1);
        foldable.fold_vec(mapped, 0, |acc, x| acc + x)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('functor.map_vec');
    expect(js).toContain('foldable.fold_vec');
  });
});
