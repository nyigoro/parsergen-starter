# Render Core (`@std/render`)

Lumina's UI runtime is organized as a three-layer architecture so the same reactive view logic can target different platforms.

## Architecture

### Layer 1: Reactive Logic Core

State and dependency tracking live in runtime primitives:

- `Signal<T>`
- `Memo<T>`
- `Effect`
- `batch` / `untrack`

This layer has no DOM assumptions.

### Layer 2: Abstract UI Tree

Views compile to platform-neutral `VNode` trees:

- `render.text(value)`
- `render.element(tag, props, children)`
- `render.fragment(children)`

The tree is serializable and can be rendered by any compatible target.

### Layer 3: Target Renderers

A renderer implements mount/update/unmount behavior for a host:

- DOM (`create_dom_renderer`)
- SSR (`create_ssr_renderer` + `render_to_string`)
- Canvas (`create_canvas_renderer`)
- Terminal (`create_terminal_renderer`)

## Long-Term Vision

Keep components and reactivity portable while swapping only the rendering target. The objective is one view model that can run in browser, server, graphics, and CLI environments with predictable semantics and minimal host-specific code.

## Related Docs

- `BENCHMARK_ARCHITECTURE.md` for the DOM benchmark contract, baseline flow, and perf-gate wiring

For idiomatic language-level state APIs, use `@std/reactive` (`createSignal`, `createMemo`, `createEffect`, `get`, `set`).

## Reactivity Model

### `Signal<T>`

- Mutable source value.
- Reads via `render.get(signal)` are tracked.
- Writes via `render.set(signal, value)` notify dependents only when value changes.
- `render.update_signal(signal, fn)` updates from the previous value.
- Values are cloned on read/write using runtime clone helpers, reducing accidental shared mutation.

### `Memo<T>`

- Derived value based on tracked reads.
- Recomputes lazily when stale.
- Notifies downstream dependents when computed result changes.

### `Effect`

- Runs side effects when dependencies change.
- Supports cleanup via `onCleanup`.
- Cleanup runs before rerun and on dispose.

### `batch` and `untrack`

- `render.batch(fn)` coalesces effect flushes for multiple writes.
- `render.untrack(fn)` executes without dependency collection.

## VNode Model

VNode is pure serializable data:

- `render.text(value)` -> text node
- `render.element(tag, props, children)` -> element node
- `render.fragment(children)` -> fragment node

Serialization helpers:

- `render.serialize(node)` -> JSON string
- `render.parse(json)` -> `VNode`

## Renderer Contract

Renderer shape:

```ts
{
  mount(node, container): void,
  patch?(prev, next, container): void,
  unmount?(container): void
}
```

`mount` is required. `patch` and `unmount` are optional.

Runtime helpers:

- `render.create_renderer(candidate)` validates contract.
- `render.create_root(renderer, container)` creates a root controller.
- `render.mount(renderer, container, node)` mounts and returns root.
- `render.update(root, node)` updates tree.
- `render.unmount(root)` unmounts current tree.

## DOM Target (Phase 2)

Use the built-in DOM renderer:

- `render.create_dom_renderer()` creates a renderer that maps VNodes to DOM.
- `render.mount_reactive(renderer, container, view)` links signals/memos to DOM updates.

Patch behavior:

- Text nodes update in place.
- Element props/styles/events are diffed and patched.
- Children without keys are patched by index with append/remove for length differences.
- Children with keys are matched by identity, moved with DOM insertion APIs, and checked for duplicate sibling keys.
- Unchanged signal writes do not trigger re-render.

### Keyed Lists

Use keys whenever a list can reorder, insert in the middle, remove retained
items, or contain stateful child components:

```lumina
render.element("ol", render.props_class("task-list"), [
  for (row, index in rows key row.id) =>
    render.element("li", props { class: "task-row" }, [
      render.text(row.label),
      render.text(index)
    ])
])
```

The lower-level API is `render.forList(rows, keyOf, renderRow)`. The key must
be a string or number and must be unique among siblings. Do not also put a
different `props { key: ... }` inside the row; Lumina treats that as a
conflicting identity.

Try the same identity idea in the playground. The tabs example keeps one Signal
as the source of truth for the triggers, panels, and visible state.

<div class="docs-playground-card" data-playground-doc-preview="tabs" data-preview-size="tall">
  <div class="docs-playground-card-header">
    <p class="docs-playground-card-kicker">Playground preview</p>
    <h3 class="docs-playground-card-title">Reactive tab state in the DOM renderer</h3>
  </div>
  <div class="docs-playground-card-grid">
    <p><strong>What this shows:</strong> one reactive state value coordinating tab buttons, keyed panel content, and the UI Preview surface.</p>
    <p><strong>Try this:</strong> add another tab label or change the active default, then press Refresh in the UI tab.</p>
  </div>
  <div class="docs-playground-card-footer">
    <div class="docs-playground-shot" role="img" aria-label="Static preview of the Tabs example in the UI tab.">
      <span>UI tab</span>
      <strong>Tabs</strong>
      <code>Signal&lt;string&gt; -> triggers + panels</code>
    </div>
    <a class="docs-playground-open" href="../playground/?example=tabs&amp;tab=ui" data-playground-link data-playground-example="tabs" data-playground-tab="ui">Open in Playground</a>
  </div>
</div>

Inline mapped signal children with row keys lower to `forList`. Already-built
child arrays stay on the generic keyed fallback path.

### Generic Keyed Children

Use `key(value) => child` or `render.keyed(value, child)` when identity is not a
data-list row: manual panels, keyed branches, slots, or hand-built child arrays.

```lumina
render.element("section", props { class: "panels" }, [
  key("profile") =>
    render.element("article", props { class: "panel" }, [render.text("Profile")]),
  key("settings") =>
    render.element("article", props { class: "panel" }, [render.text("Settings")])
])
```

For browser hydration, put the key on an element or component whose root is an
element so SSR can emit `data-lumina-key`. Keyed text/fragments work for client
patching, but they have no element attribute to hydrate by.

`props_key(value)` remains the helper form for explicit VNode construction.

Server rendering emits `data-lumina-key` for keyed elements so hydration can
adopt existing DOM by identity before applying updates. This follows the web
platform behavior that moving an existing node with `insertBefore` preserves the
node object, and keeps focus order meaningful for keyboard users. References:
[WHATWG DOM insertion/move algorithms](https://dom.spec.whatwg.org/),
[MDN `Node.insertBefore`](https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore),
[W3C WCAG Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html),
and [TC39 keyed collection semantics](https://tc39.es/ecma262/multipage/keyed-collections.html).

## Additional Targets (Phase 3)

### SSR Renderer

- `render.create_ssr_renderer()`
- `render.render_to_string(node)`
- Supports escaped HTML output for fast server responses.
- Normalizes common DOM prop names such as `className -> class` and `htmlFor -> for`.
- Hydration path:
  - server: serialize VNode to HTML
  - client: `render.hydrate(...)` or `render.hydrate_reactive(...)`

Hydration can be configured with `create_dom_renderer({
onHydrationMismatch, strictHydration })`. The callback receives diagnostics for
text, tag, missing keyed child, and extra DOM node mismatches. Default hydration
recovers in place; `strictHydration: true` turns the first mismatch into a
hydrate error.

Keyed hydration does not let a missing keyed client child steal an unkeyed SSR
node. This follows the DOM model where element identity is the actual node
object, and aligns with HTML `data-*` attributes for framework-owned hydration
metadata. References: [WHATWG DOM node trees](https://dom.spec.whatwg.org/),
[WHATWG HTML `data-*`](https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes),
and [W3C APG keyboard/focus guidance](https://www.w3.org/WAI/ARIA/apg/).

### Canvas Renderer

- `render.create_canvas_renderer()`
- Maps VNode primitives to Canvas 2D drawing commands.
- Useful for data-heavy or animation-heavy targets.
- Same reactive component/view logic, different output backend.

### Terminal Renderer (bonus)

- `render.create_terminal_renderer()`
- `render.render_to_terminal(node)`
- Produces plain text tree output for CLI UIs and logs.
- Demonstrates renderer-agnostic component model.

## Example

```lumina
import { render } from "@std";

fn main() {
  let count = render.signal(0);
  let doubled = render.memo(|| render.get(count) * 2);

  let fx = render.effect(|| {
    io.println("count={render.get(count)}, doubled={render.memo_get(doubled)}");
  });

  render.set(count, 1);
  render.set(count, 2);
  render.dispose_effect(fx);
}
```

### Browser Counter Example (Lumina)

```lumina
import { createSignal, get } from "@std/reactive";
import { vnode, text, createDomRenderer, mount_reactive, props_on_click_dec, props_on_click_inc, props_class, dom_get_element_by_id } from "@std/render";

fn view(count: Signal<i32>) -> VNode {
  return vnode("div", props_class("counter"), [
    vnode("button", props_on_click_dec(count), [text("-")]),
    vnode("span", props_class("count"), [text(get(count))]),
    vnode("button", props_on_click_inc(count), [text("+")]),
  ]);
}

fn main() -> void {
  let count = createSignal(0);
  let root = dom_get_element_by_id("app");
  let renderer = createDomRenderer();
  let _mounted = mount_reactive(renderer, root, || view(count));
}

main();
```

See complete examples in `examples/dom-render/`:

- Counter (signal updates)
- Todo list (list patching)
- Async data loader (effect + async)
- Benchmark harness (`benchmark.html`) vs React/Solid/vanilla
- SSR/Canvas/Terminal target notes in the benchmark/readme pages

### Benchmark Harness Contract

The DOM benchmark harness keeps its comparable list scenarios on one DOM shape:

- `ul.bench-list`
- `li.bench-row`
- `span.bench-pill`
- `span.bench-value`

That shape lines up with the [WHATWG DOM Standard](https://dom.spec.whatwg.org/) node-tree model so framework-specific wrapper differences do not distort the measurement.

Per measured run, the harness records totals with [`performance.now()`](https://developer.mozilla.org/docs/Web/API/Performance/now) and emits [`performance.mark()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark) / [`performance.measure()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure) entries for inspection through the browser [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data).

The import/perf-gate step validates scenario order, suite order, sample math, and baseline compatibility before accepting a run into benchmark history.

## Scope

Phase 1 includes runtime primitives and renderer contract.
Platform-specific renderers (DOM, SSR streaming, native) are expected to be built on top of this API.
