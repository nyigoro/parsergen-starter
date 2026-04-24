import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar, { cache: true });

describe('Lumina AST JS codegen', () => {
  test('emits basic function and let binding', () => {
    const program = `
      fn add(a: int, b: int) { return a + b; }
      fn main() {
        let x = add(1, 2);
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('function add');
    expect(code).toContain('const x = add(1, 2);');
  });

  test('emits match expression as IIFE', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x = Option.Some(1);
        let y = match x {
          Option.Some(v) => v,
          Option.None => 0,
        };
        return y;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('(() =>');
    expect(code).toContain('$tag');
    expect(code).toContain('const v =');
    expect(code.includes('__match_result_') || code.includes('switch (__match_tag_')).toBe(true);
  });

  test('optimizes simple enum match expressions to switch-on-tag', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x = Option.Some(1);
        let y = match x {
          Option.Some(v) => v,
          Option.None => 0,
        };
        return y;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('switch (__match_tag_');
    expect(code).toContain('case "Some"');
    expect(code).toContain('case "None"');
  });

  test('registers Hash/Eq trait impls and tags struct literals', () => {
    const program = `
      trait Hash { fn hash(self: Self) -> u64; }
      trait Eq { fn eq(self: Self, other: Self) -> bool; }

      struct Point { x: i32, y: i32 }

      impl Hash for Point {
        fn hash(self: Point) -> u64 { return 1u64; }
      }

      impl Eq for Point {
        fn eq(self: Point, other: Point) -> bool { return self.x == other.x && self.y == other.y; }
      }

      fn make() -> Point {
        Point { x: 1, y: 2 }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('__lumina_register_trait_impl("Hash", "Point"');
    expect(code).toContain('__lumina_register_trait_impl("Eq", "Point"');
    expect(code).toContain('__lumina_struct("Point"');
  });

  test('hoists static render props and static vnode subtrees in JS codegen', () => {
    const program = `
      import { vnode, text, props_class } from "@std/render";

      fn shell(label: string) -> VNode {
        vnode("section", props_class("card"), [
          vnode("h1", props_class("title"), [text("Profile")]),
          vnode("p", props_class("title"), [text(label)])
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toContain('const __lumina_static_render_');
    expect(code.match(/props_class\("title"\)/g)?.length ?? 0).toBe(1);
    expect(code).toContain('return vnode("section", __lumina_static_render_');
  });

  test('hoists static namespace render trees after render lowering', () => {
    const program = `
      import { render } from "@std";

      component shell(label: string) -> VNode {
        render.element("section", render.props_class("card"), [
          render.element("h1", render.props_class("title"), [render.text("Profile")]),
          render.element("p", render.props_class("title"), [render.text(label)])
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toContain('const __lumina_static_render_');
    expect(code.match(/props_class\("title"\)/g)?.length ?? 0).toBe(1);
    expect(code).toContain('function shell');
  });

  test('emits DOM template metadata for fully static render subtrees', () => {
    const program = `
      import { render } from "@std";

      component shell(label: string) -> VNode {
        render.element("section", render.props_class("card"), [
          render.element("span", render.props_class("eyebrow"), [render.text("Profile")]),
          render.element("p", render.props_class("title"), [render.text(label)])
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toContain('domTemplateHtml = "<span class=\\"eyebrow\\">Profile</span>"');
  });

  test('lowers text(get(signal)) into liveText on the JS DOM path', () => {
    const program = `
      import { get } from "@std/reactive";
      import { text } from "@std/render";

      fn read(label: Signal<string>) -> VNode {
        text(get(label))
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toContain('render.liveText(label)');
    expect(code).not.toContain('text(get(label))');
  });

  test('includes list helper imports for compiled render list lowering', () => {
    const program = `
      import { get } from "@std/reactive";
      import { forList, indexList, text, vnode } from "@std/render";

      pub fn compiledIndexList(rows: Signal<Vec<string>>) -> VNode {
        vnode("ul", {}, [
          indexList(rows, fn(row: Signal<any>, _index: int) -> VNode {
            vnode("li", {}, [text(get(row))])
          })
        ])
      }

      pub fn compiledForList(rows: Signal<Vec<string>>) -> VNode {
        vnode("ul", {}, [
          forList(rows, fn(_row: any, index: int) -> int { index }, fn(row: Signal<any>, _index: Signal<int>) -> VNode {
            vnode("li", {}, [text(get(row))])
          })
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toMatch(/import \{[^}]*\bliveText\b[^}]*\bindexList\b[^}]*\bforList\b[^}]*\} from "\.\/lumina-runtime\.js";/s);
    expect(code).toContain('function compiledIndexList');
    expect(code).toContain('function compiledForList');
  });

  test('promotes mapped signal children into specialized list helpers during codegen', () => {
    const program = `
      import { get } from "@std/reactive";
      import { render } from "@std";

      component Rows(rows: Signal<Vec<any>>) -> VNode {
        render.element("ul", render.props_empty(), [
          get(rows).map(fn(row: any, index: int) -> VNode {
            render.element("li", render.props_key(row.id), [render.text(row.label)])
          })
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true });
    expect(code).toContain('forList(rows');
    expect(code).not.toContain('get(rows).map');
  });

  test('disables static render hoisting when source maps are enabled', () => {
    const program = `
      import { vnode, text, props_class } from "@std/render";

      fn shell() -> VNode {
        vnode("section", props_class("card"), [
          vnode("h1", props_class("title"), [text("Profile")])
        ])
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code, map } = generateJSFromAst(ast, { target: 'esm', includeRuntime: true, sourceMap: true });
    expect(map).toBeDefined();
    expect(code).not.toContain('__lumina_static_render_');
    expect(code).not.toContain('__LUMINA_STATIC_RENDER_HOISTS__');
  });
});
