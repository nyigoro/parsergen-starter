# Web-Native Roadmap

This roadmap sets Lumina's execution priority as a **web-native systems language** while keeping the broader language vision intact.

## Direction
- Primary execution target: **WASM in browser environments**.
- Primary runtime constraints: startup cost, memory discipline, predictable host interop, safe async boundaries.
- JS backend role: stable fallback/debug target, not primary product identity.
- Existing tracks retained: advanced type system, traits/macros, tooling/LSP, concurrency, stdlib breadth.

## Target Platforms
- Tier 1: Browser + WASM
- Tier 2: Node/Deno as compatibility hosts
- Tier 3: Non-web hosts (kept functional, lower short-term priority)

## Release Gates

### P0: Web Runtime Parity
- No unsupported diagnostics on production web flows (`await`, `select`, match guards/patterns, core std calls).
- WASM runtime host imports cover required web-native modules and fallback routing.
- Deterministic behavior parity between JS and WASM for core language features.
- Full browser smoke suite for compile -> load -> execute paths.
- WASM-target semantic gating for intentionally out-of-scope constructs (`WASM-IS-001`) with actionable alternatives.

### WASM v1 Explicit Unsupported Surface (Intentional)
- `is` runtime narrowing (`WASM-IS-001`) stays out of scope for v1 backend.
- Complex cast paths not yet modeled in backend (`WASM-CAST-001`).
- Non-string range indexing (`WASM-RANGE-002`).
- Declaration statements inside executable blocks (`WASM-STMT-001`).
- Invalid expression-call targets that survive lowering (`WASM-EXPR-001`).

### P1: Performance + Memory Discipline
- Benchmarks: Lumina JS vs Lumina WASM across parse/runtime workloads.
- Memory validation for allocations, retain/release hooks, and long-running reactive apps.
- Hot-path optimization for host calls, collection operations, and pattern-matching branches.
- Automated validation suite for peak memory, collection load behavior, allocator stability, and wasm binary size drift.

### P2: Browser-Native Stdlib Surface
- `@std/dom` (query, node creation, event bindings).
- `@std/web_worker` (spawn, postMessage, lifecycle).
- `@std/web_storage` (localStorage/sessionStorage wrappers).
- `@std/url` + fetch/request helpers aligned with browser APIs.
- `@std/web_streams` integration.

## Active Workstreams
- WASM codegen hardening for remaining cast/range/dispatch edge cases.
- JS↔WASM parity harness expansion (`tests/parity/`) with async parity now enabled (await chains + async-calls-async).
- Browser smoke CI expansion (`tests/browser/` Playwright) for OPFS, SAB, WebGPU, and WASM load paths.
- WASM runtime import surface + module-call dispatcher maturity.
- WASM perf/memory regression coverage (`tests/wasm-perf-validation.test.ts`).
- Web-native docs/examples and capability matrix sync.
- Packaging workflow for browser/WASM consumption.
- Web distribution CLI surface (`bundle`, `importmap`, `publish --cdn`) and browser lock workflow (`lumina.browser.lock`).

## Browser-Native Runtime Rollout
- [x] OPFS module (`@std/opfs`) with read/write/metadata/exists/dir operations.
- [x] URL module (`@std/url`) with parse/build helpers and field manipulation APIs.
- [x] Web storage module (`@std/web_storage`) with local/session key-value APIs and fallback behavior.
- [x] DOM module (`@std/dom`) with query/create/manipulation/event APIs via opaque handles.
- [x] Web worker module (`@std/web_worker`) with spawn/spawn_inline lifecycle + message APIs.
- [x] Web streams module (`@std/web_streams`) with readable stream constructors, read helpers, and pipe/cancel.
- [x] SharedArrayBuffer channels (`@std/sab_channel`) with bounded i32 send/recv/close semantics.
- [x] WebGPU compute generalized (`@std/webgpu.compute`) with typed input/output (`i32/u32/f32/f64/u8`) and `compute_i32` alias.
- [x] WebGPU typed resource surface (`buffer_create/write/read/destroy`, uniforms, vertex/index buffers).
- [x] WebGPU canvas + render path (`canvas`, `present`, `render_pipeline`, `render_frame`) for browser rendering flows.
- [x] WGSL DSL compiler (`shader compute|vertex|fragment`) with raw WGSL pass-through support.

## Beta Promotion Gates
### OPFS -> Stable
- [ ] Playwright round-trip coverage for `readFile`/`writeFile`/`readDir`/`metadata`/`exists`/`mkdir`/`removeFile` in real browser OPFS.
- [ ] Error paths return `Err` values (no throws) for not-found and permission failures.
- [ ] Node fallback route remains deterministic when OPFS API is unavailable.

### SAB Channel -> Stable
- [ ] Generic `SABChannel<T>` surface beyond bounded i32 (`i32`/`u32`/`f32`/`f64`).
- [ ] Browser smoke coverage with worker-to-worker round-trip and close semantics.
- [ ] Backpressure behavior validated for full/empty queue boundaries.

### WebGPU Resources/Render/DSL -> Stable
- [ ] Typed buffer round-trip coverage (`f32`/`f64`/`i32`/`u32`/`u8`) with destroy leak checks.
- [ ] Browser render smoke assertion (successful draw submission to canvas).
- [ ] WGSL DSL output validation and raw WGSL pass-through parity.

## Compatibility Policy
- Keep Node/Deno support operational for CLI/tooling and test infrastructure.
- Prefer web-standard APIs as canonical abstractions.
- Add host-specific shims only when web-standard behavior is preserved.

## Relationship to Existing Vision
- GADTs/HKTs/const generics, trait/macro systems, and IDE features remain first-class.
- Prioritization changes only in sequencing: web-native runtime quality gates come first.
