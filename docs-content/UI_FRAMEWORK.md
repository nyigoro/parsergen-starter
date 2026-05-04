# UI Framework Direction

This document describes Lumina's target UI framework architecture.

It is intentionally a design-direction document, not a locked API specification.

References:

- [RENDER.md](RENDER.md) for the current renderer/runtime model
- [CAPABILITIES.md](CAPABILITIES.md) for implementation status and roadmap placement
- [RUNTIME_ARCHITECTURE.md](RUNTIME_ARCHITECTURE.md) for the current runtime layer map and ownership rules

## Current Foundation

Lumina already has a real UI runtime foundation.

Today the repo includes:

- fine-grained reactivity in `@std/reactive`
- portable `VNode` rendering in `@std/render`
- DOM, SSR, Canvas, and Terminal renderers behind one renderer contract
- browser routing in `@std/router`
- DOM-oriented prop helpers, including `key`
- component frames with stable local state on the JS runtime path
- keyed frame reuse and keyed DOM reconciliation
- scoped context, slots, children helpers, and prop/event composition
- portal support for layered DOM UI
- typed shared-state helpers in `@std/store`
- controlled form helpers and lightweight validation utilities in `@std/forms`
- cached async resource helpers in `@std/resource`
- app-level `renderApp`, `renderToStringApp`, `mountApp`, and `hydrateApp` wrappers
- lightweight DOM-oriented test helpers in `@std/testing`
- role/text-oriented DOM testing queries in `@std/testing`
- basic custom-element mounting and registry helpers for Web Components interop
- `component` declaration syntax as an authoring-friendly alias for component functions
- suspense and error-boundary render helpers
- transition-presence helpers for CSS-first mount/unmount animation flows
- devtools snapshot/install helpers plus a timeline API for signal, resource, frame, route, and hydration inspection
- SSG helpers for app/page rendering and file emission
- a first styled Tailwind-oriented `@std/ui` layer with button variants, theme roots, and app-shell wrappers on top of the headless primitives
- headless DOM primitives in `@std/tabs`, `@std/dialog`, `@std/popover`, `@std/tooltip`, `@std/toast`, `@std/menu`, `@std/select`, `@std/combobox`, `@std/multiselect`, `@std/checkbox`, and `@std/radio`

That foundation is now strong enough to support real headless UI authoring, but the broader app/framework layer is still intentionally incomplete.

Two current facts matter for the framework roadmap:

- `mount_reactive` and `hydrate_reactive` currently rerun a `view() -> VNode` function inside an effect
- component frames, local state, and keyed reconciliation now exist on the JS/DOM path, but not every higher-level UI concern has been lifted into first-class primitives yet

So the next step is not "invent rendering." It is "finish the remaining app-authoring and primitive layers on top of the rendering core."

## Design Goal

Lumina's ideal UI framework should combine the best parts of the modern web stack without copying any one framework wholesale.

The target should feel:

- Solid-like at the core: signals, memos, effects, and fine-grained updates
- React-familiar at the surface: components, props, composition, and clear mental models
- Radix-like at the library layer: headless, accessible, DOM-truthful primitives
- browser-native in behavior: real event semantics, focus rules, forms, keyboard interaction, and ARIA
- distinctly Lumina in expression: typed props, pattern matching, and portable renderer targets

## Layering

Lumina should keep a clean split between a universal UI core and a DOM-specific framework layer.

### UI Core

The portable core should work across DOM, SSR, Canvas, and Terminal targets.

Its responsibilities are:

- component boundaries
- component identity
- local state ownership
- memo and cleanup ownership
- context propagation
- slots and children semantics
- async resource ownership
- renderer-agnostic `VNode` production

### UI DOM

The DOM layer should build on the core and own browser-specific behavior.

Its responsibilities are:

- DOM event semantics
- portals and layered UI
- focus management
- form behavior
- store/context ergonomics for shared app state
- ARIA and keyboard interaction
- headless accessibility primitives
- DOM-specific reconciliation details

This split matters because Lumina's render story is broader than the browser, but the most important framework ergonomics will be DOM-first.

## Component Model

Lumina should not treat components as traits or instance objects first.

The better model is:

- components are functions with an explicit component boundary
- stateless view helpers can remain ordinary functions returning `VNode`
- mounted components own a hidden frame
- the frame stores local state slots, memoized values, cleanup handlers, context scope, and child identity

This gives Lumina the ergonomic benefits of function components without committing to React-style hooks as the core mental model.

The key rule is simple:

- local state belongs to the component frame, not to the re-executed function body

## Local State

Stable local state is the next major unlock for app authoring.

That unlock is now present on the JS runtime path through component frames.

The framework should eventually support:

- stable state slots scoped to component instances
- local memoization scoped to component instances
- cleanup registration tied to rerun and unmount boundaries
- nested local functions as the normal way to define event handlers and helpers

The desired developer experience is:

- explicit signal-style state
- explicit effects and cleanup
- stable behavior across rerenders
- no user-facing "virtual DOM tricks" required to understand state ownership

The current implementation uses runtime frame bookkeeping and stable slot order rules. The public model should remain simple and predictable even if the internal addressing scheme evolves later.

## Identity and Reconciliation

Component identity is stronger than positional child patching on the JS/DOM path.

`key` is a first-class identity boundary for component frames, DOM reconciliation, and SSR hydration.

That means:

- keyed list items preserve local state when reordered
- keyed conditional branches preserve the right instance when switched
- generic `key(value) => child` covers manual panels, slots, and prebuilt child arrays
- removing a keyed item disposes its frame and cleanup correctly
- DOM patching stays simple when keys are absent, but respects keyed identity when keys are present
- SSR emits hydration key markers so keyed client hydration can adopt existing DOM nodes
- hydration mismatch diagnostics report text/tag drift, missing keyed children, and extra DOM nodes; strict hydration can fail fast for parity tests

That requirement is implemented on the DOM renderer path and is one of the core reasons the current headless primitives feel stable.

## Composition Model

Lumina should support a composition model that feels natural to web developers without overfitting to JSX or any one syntax.

Important pieces are:

- typed props at component boundaries
- prop spreading and prop merging
- explicit children and slot semantics
- scoped context for shared state
- compound-component patterns for advanced primitives
- portals for overlays and layered UI

Compound components are especially important for the long-term library story.

They enable patterns such as:

- dialog root / trigger / content
- popover root / trigger / content
- tabs root / list / trigger / panel
- menu root / trigger / content / item

This is where Lumina should borrow heavily from Radix UI's philosophy.

## Accessibility and Headless Primitives

Lumina should aim for headless, accessible DOM primitives rather than styled framework widgets.

The framework library should default to:

- native semantics first
- keyboard support as part of the primitive
- ARIA only where native behavior is not enough
- styling left to the application or design system

High-value primitives include:

- button and input foundations
- dialog and popover
- menu and dropdown
- tabs
- checkbox, radio, and select-like controls
- combobox and listbox
- toast and alert primitives

The current shipped baseline is:

- tabs with keyboard navigation and ARIA wiring
- dialog with focus trap, restore, title/description wiring, and portals
- popover with anchored portal positioning and outside-dismiss
- tooltip with anchored portal positioning plus hover/focus visibility semantics
- toast with portal delivery, close controls, title/description wiring, and auto-dismiss
- menu with anchored portal positioning, item navigation, and selection
- select with anchored listbox positioning, option selection, indicator composition, and keyboard navigation
- checkbox with signal-backed checked state, ARIA wiring, keyboard toggle, and indicator composition
- radio group/item/indicator primitives with ARIA wiring, roving focus, and arrow-key navigation
- forms helpers for controlled values, checked state, submit handling, and lightweight validation
- store helpers for app-level signals, derived memo slices, and context-backed sharing
- route loader, prefetch, refresh, invalidation, and optimistic mutation helpers layered on `@std/router`
- testing helpers for mount, hydrate, events, text queries, and role queries
- transition presence helpers for CSS-first enter/exit state management
- devtools helpers for signal/resource/frame snapshots, timeline events, and browser install hooks
- SSG helpers for page wrapping, app rendering, and static file writing
- a first `@std/ui` styled layer with Tailwind-oriented wrappers, app-shell composition, theme roots, and default button semantics over headless primitives

The next goal is to widen that baseline while staying visually unopinionated.

## Styling Philosophy

Styling should remain framework-agnostic at the core.

Lumina should make the following easy:

- class merging
- style merging
- `data-*` and `aria-*` attributes
- theme tokens via CSS variables
- integration with utility CSS and design-system class names

Lumina should avoid forcing a CSS-in-JS strategy into the core framework.

The framework should help authors compose styling inputs well, but it should not require one styling technology.

## Async and Data

Async UI behavior should build on the component/frame model rather than arriving first.

After stable component frames and keyed identity are in place, Lumina can add:

- resource ownership scoped to components
- suspense-like async boundaries
- error boundaries
- retry and refetch control
- optimistic update patterns

The first route-data layer now exists in `@std/router` as route-keyed resource
helpers: `routeLoader`, `prefetchRoute`, `refreshRoute`, `invalidateRoute`, and
`optimisticRouteMutate`. This keeps the API close to the existing resource
runtime while leaving room for richer route actions and nested boundaries later.

This should come after the component foundation, not before it.

## Non-Goals

Lumina's ideal UI framework should explicitly avoid a few traps:

- a trait-first component model
- React-style hook ordering rules as the primary mental model
- syntax sugar before runtime semantics are stable
- DOM-specific assumptions leaking into every renderer target
- shipping a styled widget kit as the primary framework identity

## Priority Order

The practical build order should be:

1. continue portability and backend parity work where the framework currently leans JS/DOM-first
2. deepen the testing/devtools surface so app-level workflows are easier to validate and inspect
3. mature transitions, styled wrappers, and example coverage around the shipped headless/app stack
4. add optional syntax sugar only if it clearly improves authoring without hiding the runtime model

## Summary

Lumina's ideal UI framework is not "React in another language" and not "just a rendering runtime."

It should be:

- a Solid-like reactive core
- a React-familiar component surface
- a Radix-style headless DOM library
- a browser-truthful accessibility story
- a Lumina-native model built around typed props, explicit state, stable identity, and portable rendering

That is the framework shape that best fits the repo's current strengths and the next real blockers to app authoring.
