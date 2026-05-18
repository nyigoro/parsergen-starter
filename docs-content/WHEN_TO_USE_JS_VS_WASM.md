# When to Use JS vs WASM

Lumina supports JavaScript and WebAssembly because the web is already a hybrid platform. The practical target profiles are:

- `js` for platform glue, browser and Node interop, and the fastest edit-debug loop
- `wasm-web` for shared browser-native systems code that still uses explicit web host capabilities
- `wasm-standalone` for the strict portable subset with tighter capability boundaries

Legacy aliases like `esm`, `cjs`, and `wasm` still work, but the target profiles above are the preferred way to think about deployment.

The playground uses shorter button labels: JS, WASM, and Both. Those labels map to the interactive playground surfaces; for CLI builds, prefer the explicit profiles `js`, `wasm-web`, and `wasm-standalone`.

## Use the JS Target When

- you want the fastest edit-run-debug loop
- you are doing heavy browser or Node interop
- you are building the app shell, routing layer, or platform-facing glue code
- your app is UI-heavy and not bottlenecked by compute
- you want the easiest stack traces and source-level debugging today

## Use the `wasm-web` Target When

- you have compute-heavy hot paths
- you want worker-isolated execution in the browser
- you want shared-core parity with JS for strings, collections, control flow, traits, enums, and async behavior
- startup cost and binary size are acceptable tradeoffs for runtime behavior
- you are building browser-native systems code, simulations, parsers, or numeric workloads

Open the WASM playground example to compare source, generated WAT, and binary metrics.

<div class="docs-playground-card" data-playground-doc-preview="wasm-hello" data-preview-size="medium">
  <div class="docs-playground-card-header">
    <p class="docs-playground-card-kicker">Playground preview</p>
    <h3 class="docs-playground-card-title">Same single source, WebAssembly target</h3>
  </div>
  <div class="docs-playground-card-grid">
    <p><strong>What this shows:</strong> a small compute-oriented Lumina source opened directly to the WASM tab with size and WAT output visible.</p>
    <p><strong>Try this:</strong> change the arithmetic function, press Check, and compare the updated section metrics.</p>
  </div>
  <div class="docs-playground-card-footer">
    <div class="docs-playground-shot" role="img" aria-label="Static preview of the wasm-hello example in the WASM tab.">
      <span>WASM tab</span>
      <strong>wasm-hello</strong>
      <code>target=wasm -> WAT + section metrics</code>
    </div>
    <a class="docs-playground-open" href="../playground/?example=wasm-hello&amp;target=wasm&amp;tab=wasm" data-playground-link data-playground-example="wasm-hello" data-playground-target="wasm" data-playground-tab="wasm">Open in Playground</a>
  </div>
</div>

## Use the `wasm-standalone` Target When

- you want an import-light kernel or portable compute module
- you need stricter capability boundaries than `wasm-web`
- you are targeting embedders or WASI-style hosts
- you are willing to stay inside the standalone-supported runtime surface

## Use Both When

- your UI shell benefits from JS interop, but specific workloads benefit from WASM
- you want to keep browser and Node platform work on `js` while pushing shared compute to `wasm-web`
- you need one language across app code, workers, and browser compute modules

## Practical Guidance

Start with `js` when most of the work is platform-facing, UI-heavy, or integration-heavy.

Move shared workloads to `wasm-web` when:

- profiling points to CPU-bound work
- worker isolation helps the architecture
- bundle size remains acceptable
- you still need browser host capabilities through explicit imports

Choose `wasm-standalone` when:

- the module should compile and run with a stricter capability profile
- you want import-free or import-light behavior where Lumina already supports it
- you are treating the module more like a portable kernel than an app shell

## Rule of Thumb

- `js` owns browser and Node glue.
- `wasm-web` is the main systems target for browser-native Lumina code.
- `wasm-standalone` is the strict portable profile, not the default shape of the whole web app.

## Read Next

- [Why Lumina?](WHY_LUMINA.md)
- [Capabilities](CAPABILITIES.md)
- [Web-Native Roadmap](WEB_NATIVE_ROADMAP.md)
