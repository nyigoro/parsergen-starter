import { parseLuminaProgram } from './helpers/lumina-parser.js';

type AuthoringCase = {
  name: string;
  source: string;
  expectedTopLevel: string[];
};

const authoringCases: AuthoringCase[] = [
  {
    name: 'component stateful counter',
    expectedTopLevel: ['Counter', 'main'],
    source: `
      import { render } from "@std";

      component Counter(label: string) -> VNode {
        let count = render.state(1);
        render.element("button", render.props_id("counter"), [render.text(label), render.text(render.get(count))])
      }

      fn main() -> VNode {
        Counter("Clicks")
      }
    `.trim() + '\n',
  },
  {
    name: 'transition presence card',
    expectedTopLevel: ['panel', 'main'],
    source: `
      import { render } from "@std";

      fn panel(open: Signal<bool>) -> VNode {
        render.transitionPresence(open, render.props_class("card"), 180, || [
          render.text("visible")
        ])
      }

      fn main() -> VNode {
        panel(render.signal(true))
      }
    `.trim() + '\n',
  },
  {
    name: 'testing app helpers',
    expectedTopLevel: ['App', 'main'],
    source: `
      import { render } from "@std";
      import { createDomHarness, mountApp, hydrateApp, getById, getByText, click } from "@std/testing";

      component App(label: string) -> VNode {
        render.element("button", render.props_id("counter"), [render.text(label)])
      }

      fn main() -> string {
        let harness = createDomHarness();
        let mounted = mountApp(harness, App, "Clicks");
        let hydrated = hydrateApp(harness, App, "Clicks");
        let _button = getById(harness, "counter");
        let _text = getByText(harness, "Clicks");
        click(_button);
        let _ = mounted;
        let __ = hydrated;
        "ok"
      }
    `.trim() + '\n',
  },
  {
    name: 'dialog portal composition',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, portal, overlay, content, title, description, close } from "@std/dialog";

      fn screen(open: Signal<bool>) -> VNode {
        root(open, || portal([
          overlay(render.props_class("overlay")),
          content(render.props_class("content"), [
            title(render.props_class("title"), [render.text("Profile")]),
            description(render.props_class("desc"), [render.text("Dialog body")]),
            close(render.props_class("close"), [render.text("Close")])
          ])
        ]))
      }

      fn main() -> VNode {
        screen(render.signal(true))
      }
    `.trim() + '\n',
  },
  {
    name: 'popover anchored content',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, portal, trigger, content } from "@std/popover";

      fn screen(open: Signal<bool>) -> VNode {
        root(open, || [
          trigger(render.props_id("trigger"), [render.text("Open")]),
          portal([
            content(render.props_class("surface"), [render.text("Popover")])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal(true))
      }
    `.trim() + '\n',
  },
  {
    name: 'menu dropdown composition',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, trigger, portal, content, item } from "@std/menu";

      fn screen(open: Signal<bool>) -> VNode {
        root(open, || [
          trigger(render.props_class("trigger"), [render.text("Menu")]),
          portal([
            content(render.props_class("content"), [
              item("open", render.props_class("item"), [render.text("Open")]),
              item("archive", render.props_class("item"), [render.text("Archive")])
            ])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal(true))
      }
    `.trim() + '\n',
  },
  {
    name: 'select composition',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, trigger, portal, content, item, indicator } from "@std/select";

      fn screen(value: Signal<string>) -> VNode {
        root(value, || [
          trigger(render.props_class("trigger"), [render.text(render.get(value))]),
          portal([
            content(render.props_class("content"), [
              item("one", render.props_class("item"), [render.text("One"), indicator(render.props_class("icon"), [render.text("•")])]),
              item("two", render.props_class("item"), [render.text("Two")])
            ])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal("one"))
      }
    `.trim() + '\n',
  },
  {
    name: 'combobox composition',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, input, portal, content, item, indicator } from "@std/combobox";

      fn screen(value: Signal<string>) -> VNode {
        root(value, || [
          input(render.props_class("input")),
          portal([
            content(render.props_class("content"), [
              item("Ada", render.props_class("item"), [render.text("Ada"), indicator(render.props_class("icon"), [render.text("•")])]),
              item("Grace", render.props_class("item"), [render.text("Grace")])
            ])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal("Ada"))
      }
    `.trim() + '\n',
  },
  {
    name: 'multiselect composition',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { root, trigger, portal, content, item, indicator } from "@std/multiselect";

      fn screen(values: Signal<Vec<string>>) -> VNode {
        root(values, || [
          trigger(render.props_class("trigger"), [render.text("Tags")]),
          portal([
            content(render.props_class("content"), [
              item("ui", render.props_class("item"), [render.text("UI"), indicator(render.props_class("icon"), [render.text("•")])]),
              item("wasm", render.props_class("item"), [render.text("WASM")])
            ])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal([]))
      }
    `.trim() + '\n',
  },
  {
    name: 'checkbox and radio controls',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { checkbox } from "@std/checkbox";
      import { group, item, indicator } from "@std/radio";

      fn screen(ready: Signal<bool>, choice: Signal<string>) -> VNode {
        render.fragment([
          checkbox(ready, render.props_class("ready"), [render.text("Ready")]),
          group(choice, || [
            item("one", render.props_class("radio"), [render.text("One"), indicator(render.props_class("icon"), [render.text("•")])]),
            item("two", render.props_class("radio"), [render.text("Two")])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal(false), render.signal("one"))
      }
    `.trim() + '\n',
  },
  {
    name: 'forms store and resource interplay',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { bindValue, checkbox, submitProps } from "@std/forms";
      import { createStore, selectMemo, set } from "@std/store";
      import { createResource, read } from "@std/resource";

      async fn loadName() -> string {
        "donald"
      }

      fn screen() -> VNode {
        let form = createStore("draft");
        let accepted = render.signal(false);
        let resource = createResource("name", || loadName());
        let selected = selectMemo(form, fn(value: string) -> string { value });

        render.fragment([
          render.element("input", bindValue(form), []),
          render.element("button", submitProps(fn() -> void {
            set(form, render.memo_get(selected));
          }), [render.text(read(resource))]),
          checkbox(accepted, render.props_class("accepted"), [render.text("Accepted")])
        ])
      }

      fn main() -> VNode {
        screen()
      }
    `.trim() + '\n',
  },
  {
    name: 'devtools and ssg helpers',
    expectedTopLevel: ['page', 'main'],
    source: `
      import { render } from "@std";
      import { install, snapshot } from "@std/devtools";
      import { page, renderApp, writePage } from "@std/ssg";

      fn view() -> VNode {
        render.text("Docs")
      }

      fn page() -> string {
        let _installed = install();
        let _snapshot = snapshot();
        let _rendered = renderApp(fn(_: i32) -> VNode { view() }, 0, 0);
        writePage("docs/index.html", view(), 0)
      }

      fn main() -> string {
        page()
      }
    `.trim() + '\n',
  },
  {
    name: 'web components interop',
    expectedTopLevel: ['Widget', 'main'],
    source: `
      import { render } from "@std";
      import { defineCustomElement, mountCustomElement } from "@std/web_components";

      component Widget(label: string) -> VNode {
        render.element("span", render.props_class("widget"), [render.text(label)])
      }

      fn main() -> string {
        let element = defineCustomElement("lumina-widget", Widget, 0);
        let _mounted = mountCustomElement("lumina-widget", Widget, "Hi", 0);
        let _ = element;
        "ok"
      }
    `.trim() + '\n',
  },
  {
    name: 'styled ui wrappers',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { card, button, tabsListStyled, tabsTriggerStyled, tabsPanelStyled, presenceCard } from "@std/ui";

      fn screen(open: Signal<bool>, active: Signal<string>) -> VNode {
        card(render.props_class("shell"), [
          button(render.props_class("action"), [render.text("Save")]),
          render.tabsRoot(active, || [
            tabsListStyled(render.props_class("list"), || [
              tabsTriggerStyled("overview", render.props_class("trigger"), [render.text("Overview")]),
              tabsTriggerStyled("activity", render.props_class("trigger"), [render.text("Activity")])
            ]),
            tabsPanelStyled("overview", render.props_class("panel"), [
              presenceCard(open, render.props_class("presence"), [render.text("Visible")])
            ])
          ])
        ])
      }

      fn main() -> VNode {
        screen(render.signal(true), render.signal("overview"))
      }
    `.trim() + '\n',
  },
  {
    name: 'router browser authoring',
    expectedTopLevel: ['screen', 'main'],
    source: `
      import { render } from "@std";
      import { createRouter, currentPath, link, navigate } from "@std/router";

      fn screen() -> VNode {
        let router = createRouter("/");
        let _path = currentPath(router);
        let _next = navigate(router, "/docs");
        render.fragment([
          link(router, "/docs", render.props_class("link"), [render.text("Docs")]),
          render.text("Router")
        ])
      }

      fn main() -> VNode {
        screen()
      }
    `.trim() + '\n',
  },
  {
    name: 'app wrappers and hydration',
    expectedTopLevel: ['App', 'main'],
    source: `
      import { render } from "@std";

      component App(label: string) -> VNode {
        render.element("button", render.props_id("counter"), [render.text(label)])
      }

      fn main() -> string {
        let renderer = render.create_dom_renderer();
        let container = render.dom_get_element_by_id("root");
        let _app = render.renderApp(App, "Hydrate");
        let _html = render.renderToStringApp(App, "Hydrate");
        let mounted = render.mountApp(renderer, container, App, "Hydrate");
        let hydrated = render.hydrateApp(renderer, container, App, "Hydrate");
        render.dispose_reactive(mounted);
        render.dispose_reactive(hydrated);
        "ok"
      }
    `.trim() + '\n',
  },
];

const getTopLevelNames = (source: string): string[] => {
  const ast = parseLuminaProgram(source);
  return ast.body
    .filter((stmt) => stmt.type === 'FnDecl')
    .map((stmt) => (stmt as { name?: string }).name)
    .filter((name): name is string => typeof name === 'string');
};

describe('UI authoring parser matrix', () => {
  test.each(authoringCases)('parses $name without syntax failures', ({ source }) => {
    const ast = parseLuminaProgram(source);
    expect(ast.type).toBe('Program');
  });

  test.each(authoringCases)('keeps expected top-level declarations for $name', ({ source, expectedTopLevel }) => {
    const names = getTopLevelNames(source);
    expect(names).toEqual(expect.arrayContaining(expectedTopLevel));
  });
});
