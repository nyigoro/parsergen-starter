# Web-Native Roadmap

This roadmap sets Lumina's execution priority as a web-native systems language while keeping the broader language vision intact.

## Direction

- First-class targets: `js`, `wasm-web`, and `wasm-standalone`
- Product center of gravity: `wasm-web` for shared browser-native systems workloads
- JS role: app shell, browser and Node glue, and the fastest edit-debug loop
- Standalone role: strict portable profile for import-light kernels, embedders, and WASI-style hosts
- Existing tracks retained: advanced type system, traits/macros, tooling/LSP, concurrency, and stdlib breadth

## Target Platforms

- Tier 1: Browser + `wasm-web`
- Tier 1.5: Browser/Node + `js`
- Tier 2: `wasm-standalone` and WASI-style hosts
- Tier 3: Non-web hosts kept functional with lower short-term priority

## Release Gates

### P0: Shared-Core Parity

- Deterministic behavior parity between `js` and `wasm-web` for shared core language features
- No unsupported diagnostics on production web flows that are inside the shared core/runtime surface
- Full browser smoke coverage for compile -> load -> execute paths
- Capability validation prevents leaking web-only or wasi-only APIs across target profiles
- Direct `.wasm` emission is the default path, with `--emit-wat` kept as debug output

### P1: Standalone Maturity

- Import-free pure compute modules stay supported
- Import-free string literals, concat, length, equality, and range slicing stay supported
- Unsupported host-backed features fail with explicit standalone diagnostics
- Deeper standalone-native or WASI-oriented replacements land for more collections, async, and runtime-backed helpers

### P2: Performance + Memory Discipline

- Benchmarks track Lumina JS vs `wasm-web` vs `wasm-standalone` across parse/runtime workloads
- Memory validation covers allocations, retain/release hooks, and long-running reactive apps
- Hot-path optimization continues for host calls, collection operations, and pattern-matching branches
- Binary-size regression coverage stays in place for the direct binary emitter

### P3: Browser-Native App Ergonomics

- Deeper UI app/data ergonomics on top of the current reactive/render/headless foundation
- Route-tree ownership, route-scoped data, safe action submit state, and
  streamed SSR helpers stay aligned with [COMPLEX_APP_ROADMAP.md](COMPLEX_APP_ROADMAP.md)
- Navigation API, URLPattern, and View Transition API are progressive
  enhancement layers, not required runtime assumptions
- Better package and distribution workflows for browser/WASM consumption
- Broader docs/examples that teach target boundaries clearly

## Active Workstreams

- `wasm-standalone` runtime expansion beyond the current compute + native string surface
- Binary size, perf, and debug metadata tuning on the direct WASM emitter
- Browser smoke CI expansion for OPFS, SAB, WebGPU, and WASM load paths
- Capability/profile docs and examples kept in sync with shipped behavior
- Packaging workflow for browser/WASM consumption
- Web distribution CLI surface (`bundle`, `importmap`, `publish --cdn`) and browser lock workflow (`lumina.browser.lock`)
- UI framework app/data ergonomics and broader non-DOM backend polish

## Current Runtime Coverage

- `@std/opfs`
- `@std/url`
- `@std/web_storage`
- `@std/dom`
- `@std/web_worker`
- `@std/web_streams`
- `@std/sab_channel`
- `@std/webgpu`
- headless UI primitives on the JS/DOM path

## Compatibility Policy

- Keep Node/Deno support operational for CLI/tooling and test infrastructure
- Prefer web-standard APIs as canonical abstractions
- Add host-specific shims only when web-standard behavior is preserved
- Keep target boundaries explicit instead of silently emulating unsupported capabilities

## Relationship to Existing Vision

- GADTs, HKTs, const generics, trait/macro systems, and IDE features remain first-class
- Prioritization changes only in sequencing: web-native runtime quality gates come first
