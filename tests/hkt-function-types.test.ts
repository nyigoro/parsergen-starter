import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('HKT function-type signatures', () => {
  it('parses fn(...) -> ... in type positions', () => {
    const source = `
      trait Functor<F<_>> {
        fn map<A, B>(fa: F<A>, mapper: fn(A) -> B) -> F<B>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const trait = ast.body.find((stmt) => stmt.type === 'TraitDecl');
    expect(trait).toBeDefined();
    if (!trait || trait.type !== 'TraitDecl') return;
    const map = trait.methods.find((method) => method.name === 'map');
    expect(map).toBeDefined();
    const mapperType = map?.params.find((param) => param.name === 'mapper')?.typeName;
    expect(mapperType).toBe('Fn<A,B>');
  });

  it('typechecks function signatures that use fn types', () => {
    const source = `
      fn keep_mapper<A, B>(mapper: fn(A) -> B) -> i32 {
        1
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
});
