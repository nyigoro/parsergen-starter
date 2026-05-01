import type { LuminaCall, LuminaProgram, LuminaStatement } from '../src/lumina/ast.js';
import {
  getStaticDomTemplateHtml,
  isReactiveGetCall,
  lowerRenderProgram,
} from '../src/lumina/render-lowering.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

const collectCalls = (node: unknown, result: LuminaCall[] = []): LuminaCall[] => {
  if (!node) return result;
  if (Array.isArray(node)) {
    for (const entry of node) collectCalls(entry, result);
    return result;
  }
  if (typeof node !== 'object') return result;
  const record = node as Record<string, unknown>;
  if (record.type === 'Call') {
    result.push(record as LuminaCall);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === 'location') continue;
    collectCalls(value, result);
  }
  return result;
};

const findFnDecl = (
  program: LuminaProgram,
  name: string
): Extract<LuminaStatement, { type: 'FnDecl' }> =>
  program.body.find(
    (stmt): stmt is Extract<LuminaStatement, { type: 'FnDecl' }> =>
      stmt.type === 'FnDecl' && stmt.name === name
  )!;

describe('render lowering', () => {
  test('preserves component declarations and annotates namespace render calls', () => {
    const program = parseLuminaProgram(
      `
        import { render } from "@std";

        component Card(label: string) -> VNode {
          render.element("section", render.props_class("card"), [
            render.element("h1", render.props_class("title"), [render.text("Profile")]),
            render.element("p", 0, [render.text(label)])
          ])
        }
      `.trim() + '\n'
    );

    const fnDecl = findFnDecl(program, 'Card');
    expect(fnDecl.declarationKind).toBe('component');

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    const vnodeCalls = calls.filter((call) => call.renderLowering?.callee === 'vnode');
    const textCalls = calls.filter((call) => call.renderLowering?.callee === 'text');
    const propsCalls = calls.filter((call) => call.renderLowering?.callee === 'props_class');
    expect(vnodeCalls.length).toBeGreaterThanOrEqual(2);
    expect(textCalls.length).toBeGreaterThanOrEqual(2);
    expect(propsCalls.length).toBeGreaterThanOrEqual(1);
    expect(vnodeCalls.some((call) => call.renderLowering?.staticHoistable)).toBe(true);
  });

  test('annotates direct @std/render imports and leaves non-render calls alone', () => {
    const program = parseLuminaProgram(
      `
        import { vnode, text, props_class } from "@std/render";

        fn helper(value: string) -> string {
          value
        }

        fn shell(label: string) -> VNode {
          vnode("section", props_class("card"), [
            text("Profile"),
            text(helper(label))
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    expect(calls.filter((call) => call.renderLowering?.callee === 'vnode')).toHaveLength(1);
    expect(calls.filter((call) => call.renderLowering?.callee === 'text')).toHaveLength(2);
    expect(calls.filter((call) => call.renderLowering?.callee === 'props_class')).toHaveLength(1);
    const helperCall = calls.find(
      (call) => call.callee.type === 'Identifier' && call.callee.name === 'helper'
    );
    expect(helperCall?.renderLowering ?? null).toBeNull();
  });

  test('annotates reactive get calls and extracts static DOM template html', () => {
    const program = parseLuminaProgram(
      `
        import { reactive, render } from "@std";

        component Card(label: Signal<string>) -> VNode {
          render.element("article", render.props_class("card"), [
            render.element("span", render.props_class("eyebrow"), [render.text("Profile")]),
            render.text(reactive.get(label))
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    const reactiveGet = calls.find((call) => isReactiveGetCall(call));
    expect(reactiveGet).toBeDefined();

    const staticSpan = calls.find(
      (call) =>
        call.renderLowering?.callee === 'vnode' &&
        getStaticDomTemplateHtml(call) === '<span class="eyebrow">Profile</span>'
    );
    expect(staticSpan).toBeDefined();
  });

  test('promotes mapped signal children with row keys into forList lowering', () => {
    const program = parseLuminaProgram(
      `
        import { get } from "@std/reactive";
        import { render } from "@std";

        component Rows(rows: Signal<Vec<any>>) -> VNode {
          render.element("ul", render.props_empty(), [
            get(rows).map(fn(row: any, index: int) -> VNode {
              render.element("li", render.props_key(row.id), [render.text(row.label)])
            })
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    expect(calls.some((call) => call.renderLowering?.callee === 'forList')).toBe(true);
  });

  test('promotes mapped signal children with props-sugar keys into forList lowering', () => {
    const program = parseLuminaProgram(
      `
        import { get } from "@std/reactive";
        import { render } from "@std";

        component Rows(rows: Signal<Vec<any>>) -> VNode {
          render.element("ul", render.props_empty(), [
            get(rows).map(fn(row: any, index: int) -> VNode {
              render.element("li", props { class: "row", key: row.id }, [render.text(row.label)])
            })
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    expect(calls.some((call) => call.renderLowering?.callee === 'forList')).toBe(true);
  });

  test('promotes mapped signal children keyed by index into indexList lowering', () => {
    const program = parseLuminaProgram(
      `
        import { get } from "@std/reactive";
        import { render } from "@std";

        component Rows(rows: Signal<Vec<string>>) -> VNode {
          render.element("ul", render.props_empty(), [
            get(rows).map(fn(row: string, index: int) -> VNode {
              render.element("li", render.props_key(index), [render.text(row)])
            })
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    expect(calls.some((call) => call.renderLowering?.callee === 'indexList')).toBe(true);
  });

  test('promotes map_vec signal children into forList lowering', () => {
    const program = parseLuminaProgram(
      `
        import { get } from "@std/reactive";
        import { map_vec, render } from "@std";

        component Rows(rows: Signal<Vec<any>>) -> VNode {
          render.element("ul", render.props_empty(), [
            map_vec(get(rows), fn(row: any, index: int) -> VNode {
              render.element("li", render.props_key(row.id), [render.text(row.label)])
            })
          ])
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    expect(calls.some((call) => call.renderLowering?.callee === 'forList')).toBe(true);
  });

  test('normalizes named component args and lowers authoring props/helpers', () => {
    const program = parseLuminaProgram(
      `
        import { render } from "@std";

        component Card(
          title: string = "Untitled",
          header: any = 0,
          children: any = 0
        ) -> VNode {
          render.element("section", props {
            class: "card",
            when true => data_state: "ready",
            ...render.props_id("card")
          }, [
            render.slot_or(header, props { title: title }, render.text(title)),
            render.slot_or(children, props {}, render.text("Empty"))
          ])
        }

        fn app(open: Signal<bool>) -> VNode {
          Card(
            children: transition(open, 150, props { class: "fade" }) {
              show(render.get(open)) {
                render.text("Open")
              } else {
                render.text("Closed")
              }
            },
            header: fn(props: any) -> VNode {
              render.element("h1", 0, [render.text(props.title)])
            }
          )
        }
      `.trim() + '\n'
    );

    const lowered = lowerRenderProgram(program);
    const calls = collectCalls(lowered);
    const appDecl = findFnDecl(lowered, 'app');
    const cardCall = calls.find(
      (call) => call.callee.type === 'Identifier' && call.callee.name === 'Card'
    );

    expect(appDecl.params[0]?.defaultValue ?? null).toBeNull();
    expect(cardCall?.args.every((arg) => !arg.named)).toBe(true);
    expect(calls.some((call) => call.renderLowering?.callee === 'props_merge')).toBe(true);
    expect(calls.some((call) => call.renderLowering?.callee === 'props_when')).toBe(true);
    expect(calls.some((call) => call.renderLowering?.callee === 'props_attr')).toBe(true);
    expect(calls.some((call) => call.renderLowering?.callee === 'show')).toBe(true);
    expect(calls.some((call) => call.renderLowering?.callee === 'transitionPresence')).toBe(true);
  });
});
