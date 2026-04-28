# Runtime Architecture

This document describes the current runtime layer map for Lumina.

It is a contributor-facing placement guide: when new runtime logic is added, this is the first place to decide where it belongs.

References:

- [UI_FRAMEWORK.md](UI_FRAMEWORK.md) for framework direction and DOM/UI goals
- [CAPABILITIES.md](CAPABILITIES.md) for shipped status and roadmap placement

## Design Goal

The runtime should be:

- layered by responsibility
- independent across layers where practical
- shared across targets where possible
- explicit about platform-specific behavior
- small at the top-level facade

The main runtime entrypoint should assemble the runtime, not own most of the implementation.

## Dependency Direction

The intended direction is:

1. value/reactive/frame/render core
2. resource/transition/vnode/props support
3. DOM, browser, SSR, target, app, and headless UI adapters
4. top-level `lumina-runtime.ts` facade

Compiler, parser, grammar, and CLI layers should not be imported by runtime support modules.

## Current Layer Map

### Core Runtime

These modules should stay platform-agnostic and reusable:

- `src/runtime/reactive-core.ts`
- `src/runtime/resource-core.ts`
- `src/runtime/frame-runtime.ts`
- `src/runtime/render-core.ts`
- `src/runtime/vnode-core.ts`
- `src/runtime/props-core.ts`

These files should not grow browser, Node, WebGPU, or concurrency dependencies unless there is a compelling architectural reason.

### Platform and System Runtime

These modules own host/platform behavior:

- `src/runtime/node-platform.ts`
- `src/runtime/system-runtime.ts`
- `src/runtime/browser-runtime.ts`
- `src/runtime/webgpu-runtime.ts`
- `src/runtime/concurrency-runtime.ts`
- `src/runtime/channel-runtime.ts`

### Rendering and App Runtime

These modules build on the core to expose rendering behavior:

- `src/runtime/dom-renderer.ts`
- `src/runtime/dom-reconciler.ts`
- `src/runtime/dom-accessibility.ts`
- `src/runtime/render-targets.ts`
- `src/runtime/ssr-renderer.ts`
- `src/runtime/root-runtime.ts`
- `src/runtime/app-runtime.ts`
- `src/runtime/render-api.ts`

### UI and Higher-Level Authoring Runtime

These modules own UI-specific behavior on top of the rendering layers:

- `src/runtime/headless-ui-runtime.ts`
- `src/runtime/headless-primitives-runtime.ts`
- `src/runtime/transition-runtime.ts`
- `src/runtime/custom-elements.ts`
- `src/runtime/testing-facade.ts`
- `src/runtime/devtools.ts`
- `src/runtime/ssg.ts`

### Value and Collection Surfaces

These modules own stdlib-style runtime helpers:

- `src/runtime/core-runtime.ts`
- `src/runtime/value-runtime.ts`
- `src/runtime/collections-runtime.ts`
- `src/runtime/algebra-runtime.ts`

## Facade Rule

`src/lumina-runtime.ts` should remain a facade/assembly layer.

It can:

- configure extracted modules
- wire dependencies together
- re-export the public runtime surface

It should avoid becoming the place where new behavior is implemented directly.

## Module Registry Rule

`src/lumina/module-registry.ts` is still larger than the runtime facade and remains the next major decomposition target.

For now:

- new `@std/*` assembly helpers should be added in `src/lumina/module-registry-domains.ts`
- `module-registry.ts` should prefer domain helper assembly over more inline registry tails

## Enforcement

The repo now has architecture tests that guard:

- runtime modules not importing compiler/parser/CLI layers
- core runtime modules staying platform-agnostic
- the main runtime facade staying under a line-count budget
- module-registry layering staying independent from runtime support modules

Those tests are there to keep the current architecture from slowly collapsing back into monoliths.
