import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM codegen gap closures', () => {
  it('treats declaration statements in executable blocks as compile-time only', () => {
    const source = `
      fn main() -> i32 {
        type Local = i32;
        1
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-STMT-001')).toBe(false);
    expect(result.wat).toContain('(func $main');
  });

  it('lowers cast<bool> without WASM-CAST-001', () => {
    const source = 'fn main() -> bool { cast<bool>(5) }';
    const result = generateWATFromAst(parseProgram(source + '\n'));
    expect(result.diagnostics.some((d) => d.code === 'WASM-CAST-001')).toBe(false);
    expect(result.wat).toContain('i32.ne');
  });

  it('lowers vec range indexing with vec_skip + vec_take', () => {
    const source = `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        vec.push(v, 2);
        let s = v[0..1];
        vec.len(s)
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-RANGE-002')).toBe(false);
    expect(result.wat).toContain('call $vec_skip');
    expect(result.wat).toContain('call $vec_take');
  });

  it('lowers fixed-array range indexing without unsupported diagnostics', () => {
    const source = `
      fn main() -> i32 {
        let arr: [i32; 4] = [1, 2, 3, 4];
        let s = arr[1..3];
        s[0]
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-RANGE-002')).toBe(false);
    expect(result.wat).toContain('arr_slice_loop_');
  });

  it('lowers nested local functions without WASM-STMT-001', () => {
    const source = `
      fn main() -> i32 {
        let value = add1(4);
        fn add1(x: i32) -> i32 { x + 1 }
        value
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-STMT-001')).toBe(false);
    expect(result.wat).toContain('local.tee $add1');
    expect(result.wat).toContain('call $__local_fn_add1_');
  });

  it('lowers mutually recursive nested local functions via closures', () => {
    const source = `
      fn main() -> i32 {
        let ok = even(4);
        fn even(n: i32) -> bool {
          if (n == 0) { return true; }
          odd(n - 1)
        }
        fn odd(n: i32) -> bool {
          if (n == 0) { return false; }
          even(n - 1)
        }
        if (ok) { return 1; }
        0
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source));
    expect(result.diagnostics.some((d) => d.code === 'WASM-STMT-001')).toBe(false);
    expect(result.wat).toContain('local.tee $even');
    expect(result.wat).toContain('local.tee $odd');
    expect(result.wat).toContain('call $closure_call1');
  });

  it('accepts the core component/state render subset on wasm-web', () => {
    const source = `
      import { render } from "@std";

      component Counter(label: string) -> VNode {
        let count = render.state(1);
        fn inc() -> void {
          let _did = render.set(count, render.get(count) + 1);
        }
        render.element("button", render.props_on_click(inc), [
          render.text(label),
          render.text(render.get(count))
        ])
      }

      fn main() -> VNode {
        render.renderApp(fn(label: string) -> VNode {
          Counter(label)
        }, "Clicks")
      }
    `.trim() + '\n';

    const result = generateWATFromAst(parseProgram(source), { targetProfile: 'wasm-web' });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(result.wat).toContain('call $module_call');
    expect(result.wat).toContain('(func $__local_fn_inc_');
  });
});
