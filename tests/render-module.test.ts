import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

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

    const ast = parseLuminaProgram(source);
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

    const ast = parseLuminaProgram(source);
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

    const ast = parseLuminaProgram(source);
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

  it('typechecks the component/context/headless render namespace surface', () => {
    const source = `
      import { render } from "@std";

      async fn loadChannel() -> string {
        "email"
      }

      fn build(active: Signal<string>, open: Signal<bool>) -> VNode {
        let _context = render.create_required_context();
        let _children = render.children([render.text("child")]);
        let _slot = render.slot_or(0, 0, render.text("fallback"));
        let _checked = render.props_checked(true);
        let _type = render.props_type("checkbox");
        let _name = render.props_name("contact");
        let _toggle = render.props_on_checked_change(fn(next: bool) -> void {
          let _ = next;
        });
        let _submit = render.props_on_submit(fn() -> void {
          let _ = 0;
        });
        let row = render.signal("email");
        let _live = render.liveText(row);
        let resource = render.createResource("channel", || loadChannel(), 0);
        let _status = render.resourceStatus(resource);
        let _data = render.resourceData(resource);
        let _error = render.resourceError(resource);
        let _refresh = render.resourceRefresh(resource);
        render.resourceInvalidate(resource);
        let _by_dep = render.resourceInvalidateDependency("contacts");
        let _by_scope = render.resourceInvalidateScope("route:contacts");
        let _clear_scope = render.resourceClearScope("route:contacts");
        let _value = render.resourceMutate(resource, "sms");
        let asyncUi = render.suspense(render.text("Loading"), || [
          render.errorBoundary(render.text("Error"), || [
            render.text(render.resourceRead(resource))
          ])
        ]);

        let tabs = render.tabsRoot(active, || [
          render.tabsList(render.props_class("tabs"), || [
            render.tabsTrigger("overview", render.props_class("tab"), [render.text("Overview")])
          ]),
          render.tabsPanel("overview", render.props_class("panel"), [render.text("Panel")])
        ]);

        let dialog = render.dialogRoot(open, || render.dialogPortal([
          render.dialogOverlay(render.props_class("overlay")),
          render.dialogContent(render.props_class("content"), [
            render.dialogTitle(render.props_class("title"), [render.text("Dialog")]),
            render.dialogDescription(render.props_class("description"), [render.text("Details")]),
            render.dialogClose(render.props_class("close"), [render.text("Close")])
          ])
        ]));

        let popover = render.popoverRoot(open, || [
          render.popoverTrigger(render.props_class("trigger"), [render.text("Open popover")]),
          render.popoverPortal([
            render.popoverContent(render.props_class("popover"), [render.text("Popover body")])
          ])
        ]);

        let tooltip = render.tooltipRoot(open, || [
          render.tooltipTrigger(render.props_class("tooltip-trigger"), [render.text("Hover me")]),
          render.tooltipPortal([
            render.tooltipContent(render.props_class("tooltip"), [render.text("Helpful copy")])
          ])
        ]);

        let toast = render.toastRoot(open, || render.toastPortal([
          render.toastContent(render.props_class("toast"), [
            render.toastTitle(render.props_class("toast-title"), [render.text("Saved")]),
            render.toastDescription(render.props_class("toast-description"), [render.text("Draft updated")]),
            render.toastClose(render.props_class("toast-close"), [render.text("Dismiss")])
          ])
        ]));

        let menu = render.menuRoot(open, || [
          render.menuTrigger(render.props_class("menu-trigger"), [render.text("Open menu")]),
          render.menuPortal([
            render.menuContent(render.props_class("menu"), [
              render.menuItem("rename", render.props_class("menu-item"), [render.text("Rename")])
            ])
          ])
        ]);

        let checked = render.signal(true);
        let choice = render.signal("email");
        let selectOpen = render.signal(false);
        let selectValue = render.signal("email");
        let comboboxOpen = render.signal(false);
        let comboboxValue = render.signal("email");
        let comboboxQuery = render.signal("em");
        let multiselectOpen = render.signal(false);
        let multiselectValues = render.signal(["email"]);

        let checkbox = render.checkboxRoot(checked, render.props_class("checkbox"), || [
          render.checkboxIndicator(render.props_class("checkbox-indicator"), [render.text("x")]),
          render.text("Accept terms")
        ]);

        let selectUi = render.selectRoot(selectOpen, selectValue, || [
          render.selectTrigger(render.props_class("select-trigger"), [render.text("Choose channel")]),
          render.selectPortal([
            render.selectContent(render.props_class("select-content"), [
              render.selectItem("email", render.props_class("select-item"), || [
                render.selectIndicator(render.props_class("select-indicator"), [render.text("o")]),
                render.text("Email")
              ])
            ])
          ])
        ]);

        let comboboxUi = render.comboboxRoot(comboboxOpen, comboboxValue, comboboxQuery, || [
          render.comboboxInput(render.props_placeholder("Search channels"), []),
          render.comboboxPortal([
            render.comboboxContent(render.props_class("combobox-content"), [
              render.comboboxItem("email", render.props_class("combobox-item"), || [
                render.comboboxIndicator(render.props_class("combobox-indicator"), [render.text("o")]),
                render.text("Email")
              ])
            ])
          ])
        ]);

        let multiselectUi = render.multiselectRoot(multiselectOpen, multiselectValues, || [
          render.multiselectTrigger(render.props_class("multiselect-trigger"), [render.text("Choose channels")]),
          render.multiselectPortal([
            render.multiselectContent(render.props_class("multiselect-content"), [
              render.multiselectItem("email", render.props_class("multiselect-item"), || [
                render.multiselectIndicator(render.props_class("multiselect-indicator"), [render.text("x")]),
                render.text("Email")
              ])
            ])
          ])
        ]);

        let radio = render.radioGroup(choice, render.props_class("radio-group"), || [
          render.radioItem("email", render.props_class("radio-item"), || [
            render.radioIndicator(render.props_class("radio-indicator"), [render.text("o")]),
            render.text("Email")
          ])
        ]);

        render.portalBody([asyncUi, tabs, dialog, popover, tooltip, toast, menu, selectUi, comboboxUi, multiselectUi, checkbox, radio])
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);
  });

  it('typechecks app SSR and testing helpers in the render namespace', () => {
    const source = `
      import { render } from "@std";

      fn app(label: string) -> VNode {
        let count = render.state(1);
        render.element("button", render.props_on_click(fn() -> void {
          render.set(count, render.get(count) + 1)
        }), [render.text(label), render.text(render.get(count))])
      }

      fn main() -> string {
        let harness = render.testingCreateDomHarness();
        let rows = render.signal(["a", "b"]);
        let _node = render.renderApp(fn(label: string) -> VNode {
          app(label)
        }, "Clicks");
        let _html = render.renderToStringApp(fn(label: string) -> VNode {
          app(label)
        }, "Clicks");
        let mounted = render.testingMountApp(harness, fn(label: string) -> VNode {
          app(label)
        }, "Clicks");
        let button = render.testingGetById(harness, "counter");
        let _text = render.testingGetByText(harness, "Clicks");
        let _role = render.testingGetByRole(harness, "button");
        let _roles = render.testingQueryAllByRole(harness, "button");
        let _transition = render.transitionPresence(render.signal(true), render.props_empty(), 120, fn() -> any {
          "fade"
        });
        let _index = render.indexList(rows, fn(row: Signal<any>, index: int) -> VNode {
          render.element("li", 0, [render.liveText(row), render.text(index)])
        });
        let keyedRows = render.signal(["Alpha", "Beta"]);
        let _for = render.forList(keyedRows, fn(row: any, index: int) -> any {
          row
        }, fn(row: Signal<any>, index: Signal<int>) -> VNode {
          render.element("li", 0, [
            render.liveText(row),
            render.text(render.get(index))
          ])
        });
        let _manual = render.keyed("summary", render.element("section", 0, [render.text("Summary")]));
        let _devtools = render.devtoolsSnapshot();
        let _installed = render.installDevtools();
        render.testingClick(button);
        render.testingInput(button, "Ada");
        render.testingKeydown(button, "Enter", false);
        render.testingSubmit(button);
        render.dispose_reactive(mounted);
        let hydrated = render.testingHydrateApp(harness, fn(label: string) -> VNode {
          app(label)
        }, "Clicks");
        render.dispose_reactive(hydrated);
        render.testingTextContent(render.testingBody(harness))
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('typechecks component keyword authoring with render wrappers', () => {
    const source = `
      import { renderToStringApp } from "@std/render";
      import { render } from "@std";

      component Counter(label: string) -> VNode {
        let count = render.state(1);
        render.element("button", render.props_on_click(fn() -> void {
          render.set(count, render.get(count) + 1)
        }), [render.text(label), render.text(render.get(count))])
      }

      fn main() -> string {
        renderToStringApp(fn(label: string) -> VNode {
          Counter(label)
        }, "Clicks")
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('typechecks web component interop helpers', () => {
    const source = `
      import { render } from "@std";

      component Badge(label: string) -> VNode {
        render.element("span", render.props_class("badge"), [render.text(label)])
      }

      fn main() -> void {
        let _defined = render.defineCustomElement("lumina-badge", fn(label: string) -> VNode {
          Badge(label)
        }, render.props_empty());
        let _mounted = render.mountCustomElement(render.props_empty(), fn(label: string) -> VNode {
          Badge(label)
        }, render.props_empty());
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const analysis = analyzeLumina(ast);
    const semanticErrors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('typechecks authoring sugar for defaults, slots, lists, boundaries, and transitions', () => {
    const source = `
      import { render } from "@std";

      component Panel(
        title: string = "Untitled",
        header: any = 0,
        children: any = 0
      ) -> VNode {
        render.element("section", props {
          class: "panel",
          when true => data_state: "ready"
        }, [
          render.slot_or(header, title, render.text(title)),
          render.slot_or(children, props {}, render.text("Body"))
        ])
      }

      fn app(rows: Signal<Vec<string>>, items: Signal<Vec<string>>, open: Signal<bool>) -> VNode {
        Panel(
          header: fn(title: string) -> VNode {
            render.element("h1", 0, [render.text(title)])
          },
          children: suspense(render.text("Loading")) {
            error_boundary(render.text("Failed")) {
              transition(open, 120, props { class: "fade" }) {
                render.element("ul", 0, [
                  show(render.get(open)) {
                    index (row, idx in rows) => render.element("li", props { data_index: idx }, [render.text(row)])
                  } else {
                    for (row, idx in items key row) => render.element("li", props { key: row }, [render.text(row), render.text(idx)])
                  }
                ])
              }
            }
          }
        )
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const inferred = inferProgram(ast);
    expect(inferred.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);
  });
});
