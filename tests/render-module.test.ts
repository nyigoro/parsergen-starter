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
        let dom = render.create_dom_renderer();
        let ssr = render.create_ssr_renderer();
        let canvas = render.create_canvas_renderer();
        let tty = render.create_terminal_renderer();
        let doubled = render.memo(|| render.get(count) * 2);
        let fx = render.effect(|| {
          let _value = render.memo_get(doubled);
        });
        let container = 0;
        let mounted = render.mount_reactive(dom, container, || render.text("ok"));
        let hydrated = render.hydrate(ssr, container, render.text("ssr"));
        let _html = render.render_to_string(render.text("x"));
        let _tty = render.render_to_terminal(render.text("x"));

        render.set(count, 2);
        render.dispose_effect(fx);
        render.dispose_reactive(mounted);
        render.unmount(hydrated);
        let _ = canvas;
        let __ = tty;
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

  it('supports language-level reactive/render wrappers', () => {
    const source = `
      import { createSignal, get, set, createMemo, createEffect } from "@std/reactive";
      import { vnode, text, mount_reactive, createDomRenderer } from "@std/render";

      fn view(count: Signal<i32>) -> VNode {
        vnode("div", 0, [text("Count: "), text(get(count))])
      }

      fn main() -> i32 {
        let count = createSignal(0);
        let memo = createMemo(|| get(count) + 1);
        let fx = createEffect(|| {
          let _value = get(count);
        });
        let renderer = createDomRenderer();
        let container = 0;
        let mounted = mount_reactive(renderer, container, || view(count));
        set(count, 1);
        let _ = memo;
        let __ = fx;
        let ___ = mounted;
        get(count)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('createSignal');
    expect(js).toContain('mount_reactive');
    expect(js).toContain('createDomRenderer');
  });
});
