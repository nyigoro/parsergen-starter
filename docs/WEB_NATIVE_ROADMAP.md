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

### WASM v1 Explicit Unsupported Surface (Intentional)
- `is` runtime narrowing (`WASM-IS-001`) stays out of scope for v1 backend.
- Complex cast paths not yet modeled in backend (`WASM-CAST-001`).
- Standalone range expressions and non-string range indexing (`WASM-RANGE-001`, `WASM-RANGE-002`).
- Declaration statements inside executable blocks (`WASM-STMT-001`).
- Unknown expression-kind fallback (`WASM-EXPR-001`).
- Fallback unresolved method/type lowering (`WASM-TRAIT-001`, `WASM-TYPE-001`).

### P1: Performance + Memory Discipline
- Benchmarks: Lumina JS vs Lumina WASM across parse/runtime workloads.
- Memory validation for allocations, retain/release hooks, and long-running reactive apps.
- Hot-path optimization for host calls, collection operations, and pattern-matching branches.

### P2: Browser-Native Stdlib Surface
- `@std/dom` (query, node creation, event bindings).
- `@std/web_worker` (spawn, postMessage, lifecycle).
- `@std/web_storage` (localStorage/sessionStorage wrappers).
- `@std/url` + fetch/request helpers aligned with browser APIs.
- `@std/web_streams` integration.

## Active Workstreams
- WASM codegen hardening for remaining edge cases.
- WASM runtime import surface + module-call dispatcher maturity.
- Web-native docs/examples and capability matrix sync.
- Packaging workflow for browser/WASM consumption.

## Browser-Native Runtime Rollout
- [x] OPFS module (`@std/opfs`) with read/write/metadata/exists/dir operations.
- [x] SharedArrayBuffer channels (`@std/sab_channel`) with bounded i32 send/recv/close semantics.
- [x] WebGPU compute generalized (`@std/webgpu.compute`) with typed input/output (`i32/u32/f32/f64/u8`) and `compute_i32` alias.
- [x] WebGPU typed resource surface (`buffer_create/write/read/destroy`, uniforms, vertex/index buffers).
- [x] WebGPU canvas + render path (`canvas`, `present`, `render_pipeline`, `render_frame`) for browser rendering flows.
- [x] WGSL DSL compiler (`shader compute|vertex|fragment`) with raw WGSL pass-through support.

## Compatibility Policy
- Keep Node/Deno support operational for CLI/tooling and test infrastructure.
- Prefer web-standard APIs as canonical abstractions.
- Add host-specific shims only when web-standard behavior is preserved.

## Relationship to Existing Vision
- GADTs/HKTs/const generics, trait/macro systems, and IDE features remain first-class.
- Prioritization changes only in sequencing: web-native runtime quality gates come first.
