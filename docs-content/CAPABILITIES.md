# Lumina Capabilities Matrix

This document tracks the current state of the Lumina language/tooling and near-term priorities.
Last updated for v0.5.8.

## Strategic Focus

- **Primary identity**: Web-native systems language with first-class `js`, `wasm-web`, and `wasm-standalone` target profiles
- **Primary delivery model**: Keep JS-native shell and platform glue on `js`, push shared systems workloads to `wasm-web`, and treat `wasm-standalone` as the strict portable profile
- **Platform model**: Capability-checked targets and browser-first constraints drive runtime and codegen priorities
- **Scope policy**: Existing vision areas like advanced types, traits, macros, tooling/LSP, concurrency, and stdlib breadth remain in scope

## Docs and Playground Surface

The docs site is the primary learning surface, and the playground is the focused execution surface.

| Surface | Current role |
|---|---|
| Docs preview cards | Explain why an example matters and link to the full playground without embedding a heavy iframe into every lesson |
| Run tab | Executes non-DOM examples in an isolated runtime |
| UI tab | Renders DOM-mounted examples in a document-backed preview |
| Types tab | Shows HM declaration and expression inference |
| Diagnostics tab | Shows compile diagnostics and educational explain content |
| JS/WASM tabs | Show generated JavaScript and WAT/binary metrics as read-only output surfaces |

## Legend

- **Stable**: Implemented and covered by tests
- **Beta**: Implemented but still evolving or narrower in coverage
- **Planned**: Not implemented yet

## Language and Syntax

| Feature | Status | Notes |
|---|---|---|
| Functions, let bindings, blocks | Stable | Core syntax supported |
| Structs, enums, ADTs | Stable | Includes algebraic data modeling patterns |
| Pattern matching | Stable | Exhaustiveness checks in HM and semantic analysis |
| Async/await and `?` | Stable | Shared-core parity covered on `js` and `wasm-web` |
| Strings and slicing | Stable | Interpolation, raw strings, multiline strings, and range slicing |
| Arrays and collections syntax | Stable | Literals, indexing, collection methods, and iterator-style helpers |
| Lambdas and computed call targets | Stable | Immediate lambda calls and function-valued calls supported |
| Traits, impls, associated types, defaults | Stable | Shared across `js` and WASM targets |
| Const generics, GADTs, HKTs | Stable | Shipped and covered by dedicated tests |
| Macros and `#[derive(...)]` | Stable | Expansion, structured diagnostics, and derived impl synthesis |

## Type System (HM)

| Feature | Status | Notes |
|---|---|---|
| Hindley-Milner inference | Stable | Lets, params, calls, and generic freshening |
| Traits and bounds | Stable | Multiple bounds and method dispatch supported |
| Associated types | Stable | Trait declarations and impls |
| Monomorphization | Stable | Compile-time specialization for generic functions |
| Exhaustiveness and holes | Stable | Enum exhaustiveness and `_` diagnostics |

Explore the type-system surface in the playground's Types tab.

<div class="docs-playground-card" data-playground-doc-preview="hkt-stdlib" data-preview-size="medium">
  <div class="docs-playground-card-header">
    <p class="docs-playground-card-kicker">Playground preview</p>
    <h3 class="docs-playground-card-title">Higher-kinded patterns with inferred types</h3>
  </div>
  <div class="docs-playground-card-grid">
    <p><strong>What this shows:</strong> single-source HKT-oriented code with declaration and expression types exposed in the Types tab.</p>
    <p><strong>Try this:</strong> click an expression type row to jump the editor to the inferred source location.</p>
  </div>
  <div class="docs-playground-card-footer">
    <div class="docs-playground-shot" role="img" aria-label="Static preview of the HKT stdlib example in the Types tab.">
      <span>Types tab</span>
      <strong>HKT stdlib</strong>
      <code>Functor&lt;F&gt; declarations + inferred rows</code>
    </div>
    <a class="docs-playground-open" href="../playground/?example=hkt-stdlib&amp;tab=types" data-playground-link data-playground-example="hkt-stdlib" data-playground-tab="types">Open in Playground</a>
  </div>
</div>

## Diagnostics and LSP

| Feature | Status | Notes |
|---|---|---|
| Structured diagnostics | Stable | Error and warning severity with focused codes |
| Hover, completion, definition, references | Stable | Cross-file and alias-aware |
| Rename and refactors | Stable | Semantic-aware cross-file edits |
| Signature help and inlay hints | Stable | HM-backed call-site support |
| Semantic tokens and symbols | Stable | Stable editor-facing metadata |

## Standard Library and Runtime

| Feature | Status | Notes |
|---|---|---|
| Core stdlib (`io`, `str`, `math`, `vec`, `hashmap`, `hashset`) | Stable | Shared core surface covered on `js` and `wasm-web` |
| Browser runtime modules | Stable | `dom`, `web_worker`, `web_storage`, `opfs`, `url`, `web_streams`, `http`, `webgpu`, `sab_channel` |
| Reactive/runtime UI foundation | Stable | `@std/reactive`, `@std/render`, routing, portals, frame manager, headless primitives, and decomposed runtime layers on the JS/DOM path |
| UI framework authoring model | Beta | Strong JS/DOM path with route-tree ownership, route match/data/action helpers, safe submit lifecycle, SSR chunk/stream helpers, hydration diagnostics, testing helpers, Web Components interop, transition presence helpers, progressive Navigation API / URLPattern / View Transition API hooks, devtools snapshots/timeline/inspector events, SSG hydration-state helpers, and a styled `@std/ui` layer; broader backend parity still in progress |
| `wasm-standalone` runtime surface | Beta | Pure compute plus native strings are import-free today; broader host-backed features remain intentionally restricted |

## Tooling and Codegen

| Feature | Status | Notes |
|---|---|---|
| AST lowering | Stable | Dedicated lowering coverage for declarations and pattern forms |
| JS codegen | Stable | Shared trait resolution and runtime behavior aligned with parity suite |
| WASM codegen | Stable | `wasm-web` has expanded shared-core parity coverage with JS, direct `.wasm` emission, structured module/codegen IR, and optional `--emit-wat` debug output |
| `wasm-standalone` hardening | Stable | Import pruning, native string helpers, and explicit `WASM-STANDALONE-001` diagnostics for unsupported host-backed features |
| Capability system and target profiles | Stable | `js`, `wasm-web`, and `wasm-standalone` profiles with `CAP-001`, `CAP-002`, and `CAP-003` validation |
| Multi-file compilation | Stable | Module-graph topological compile is the default path |
| Package management and bundling | Stable | Registry workflow, browser locks, bundling, import maps, and CDN-oriented paths |
| JS<->WASM parity harness | Stable | Expanded shared-core matrix for strings, collections, closures, async flows, traits, enums, and control flow |
| Browser smoke CI | Stable | Playwright smoke suite for browser modules, WASM load, and WebGPU paths |
| WASM perf validation | Stable | Peak memory, load behavior, and binary-size regression coverage on the direct binary emitter |
| REPL | Beta | Persistent declaration context and quality-of-life commands |

## Proven Capabilities

- Multi-file projects through topological module-graph compilation
- Shared-core parity between `js` and `wasm-web` on the expanded tested surface
- Direct `.wasm` emission with optional WAT debug output
- Strict target validation through capability profiles
- `wasm-standalone` import-free pure compute and native string support
- Browser-native modules for storage, workers, streams, DOM, and WebGPU

## Near-Term Roadmap (Next 3-5)

1. **Standalone runtime depth**: expand import-free collections, async/runtime coverage, and WASI-oriented replacements beyond the current compute + string surface
2. **WASM optimizer and debug depth**: improve name/debug metadata, binary-size tuning, and lowering optimizations
3. **GPU CI coverage**: strengthen dedicated GPU-backed validation for browser smoke and WebGPU paths
4. **Registry ecosystem/discovery depth**: improve package ranking, metadata quality, and adoption workflows
5. **UI framework parity and tooling**: expand non-DOM/backend parity, deepen testing/devtools, and continue documentation/examples around the shipped app/data/styled surface and [LARGE_APP_ARCHITECTURE.md](LARGE_APP_ARCHITECTURE.md)
6. **Cross-file refactor and publishing polish**: broaden semantic-aware LSP transforms and package workflow refinement

Reference: [WEB_NATIVE_ROADMAP.md](WEB_NATIVE_ROADMAP.md)

Complex app roadmap: [COMPLEX_APP_ROADMAP.md](COMPLEX_APP_ROADMAP.md)

Architecture reference: [RUNTIME_ARCHITECTURE.md](RUNTIME_ARCHITECTURE.md)
