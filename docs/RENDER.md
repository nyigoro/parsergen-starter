# Render Core (`@std/render`)

`@std/render` provides Lumina's frontend/runtime primitives:

- Fine-grained reactivity (`Signal<T>`, `Memo<T>`, `Effect`)
- Platform-agnostic VNodes (`VNode`)
- Renderer contract (`Renderer`, `RenderRoot`)

This layer is intentionally host-neutral. It does not depend on DOM APIs and can be used for browser, server rendering, terminal UIs, or custom targets.

For idiomatic language-level state API, use `@std/reactive` (`createSignal`, `createMemo`, `createEffect`, `get`, `set`).

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

See complete examples in `examples/dom-render/`:

- Counter (signal updates)
- Todo list (list patching)
- Async data loader (effect + async)
- Benchmark harness (`benchmark.html`) vs React/Solid/vanilla
- SSR/Canvas/Terminal target notes in the benchmark/readme pages

## Scope

Phase 1 includes runtime primitives and renderer contract.
Platform-specific renderers (DOM, SSR streaming, native) are expected to be built on top of this API.
