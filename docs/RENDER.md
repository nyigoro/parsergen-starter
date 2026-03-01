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
- Children are patched by index with append/remove for length differences.
- Unchanged signal writes do not trigger re-render.

## Additional Targets (Phase 3)

### SSR Renderer

- `render.create_ssr_renderer()`
- `render.render_to_string(node)`
- Supports escaped HTML output for fast server responses.
- Hydration path:
  - server: serialize VNode to HTML
  - client: `render.hydrate(...)` or `render.hydrate_reactive(...)`

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

## Scope

Phase 1 includes runtime primitives and renderer contract.
Platform-specific renderers (DOM, SSR streaming, native) are expected to be built on top of this API.
