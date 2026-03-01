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

describe('@std/render module', () => {
  it('typechecks signal/memo/effect usage', () => {
    const source = `
      import { render } from "@std";

      fn main() -> i32 {
        let count = render.signal(1);
        let doubled = render.memo(|| render.get(count) * 2);
        let fx = render.effect(|| {
          let _value = render.memo_get(doubled);
        });

        render.set(count, 2);
        render.dispose_effect(fx);
        render.memo_get(doubled)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('emits render runtime calls in JS codegen', () => {
    const source = `
      import { render } from "@std";

      fn main() -> void {
        let s = render.signal(0);
        render.set(s, 1);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('render.signal');
    expect(js).toContain('render.set');
  });
});
