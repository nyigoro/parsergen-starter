# Lumina Capabilities Matrix

This document tracks the current state of the Lumina language/tooling and near‑term priorities.

## Strategic Focus
- **Primary identity**: Web-native systems language (WASM + browser runtime first).
- **Primary backend target**: WASM in browser environments; JS remains stable fallback/debug path.
- **Platform model**: Browser-first APIs and performance constraints drive runtime/codegen priorities.
- **Scope policy**: Existing vision areas (types, traits, macros, tooling, concurrency) remain in scope.

## Legend
- **Stable**: Implemented + covered by tests
- **Beta**: Implemented but still evolving / limited tests
- **Planned**: Not implemented yet

## Language & Syntax
| Feature | Status | Notes |
|---|---|---|
| Functions, let bindings, blocks | Stable | Core syntax supported |
| Numeric types | Stable | i8-i128, u8-u128, f32, f64 with literal suffixes |
| Structs / Enums / ADTs | Stable | Includes ADT sugar |
| Pattern matching | Stable | Exhaustiveness checks in HM + semantic |
| Member access / namespace access | Stable | Module/struct/enum/trait resolution order covered by regressions |
| Pipe operator (`|>`) | Stable | Lowered in semantic / HM |
| `ref` / `ref mut` | Beta | Grammar + semantic checks |
| Move expressions (`move x`) | Stable | **Partial moves** supported with path tracking + tests |
| Type holes (`_`) in annotations | Stable | **HM validation** + LUM‑010 |
| Async/await | Stable | `async fn`, `await`, Promise<T> |
| Error handling (`?`) | Stable | Rust-style Result propagation |
| String interpolation | Stable | `"Hello {name}"` |
| String slicing | Stable | `s[0..5]`, `s[..5]`, `s[5..]`, `s[..]` |
| Raw + multiline strings | Stable | `r"..."`, `"""..."""` |
| Array literals + indexing | Stable | `[1,2,3]`, `v[0]` |
| Lambda expressions | Stable | `|x| x + 1` |
| Collection method syntax | Stable | `v.push(1)` style lowering to stdlib calls |
| Macros | Beta | Expansion phase with matcher/transcriber subset, lexical scoping, `![]`/`!()`/`!{}` calls, recursion/cycle diagnostics |
| `#[derive(...)]` | Stable | Trait-based derived impl synthesis (`Clone`, `Debug`, `Eq`) for structs/enums, generic bound synthesis, collision diagnostics |
| Const generics | Stable | Const params across structs/enums/functions/traits, where-clauses, explicit const args (`::<...>`), semantic + HM checks, monomorphization, JS/WASM fixed-array codegen |
| GADTs (baseline) | Beta | Indexed variants + existential constraints, branch refinement, unreachable/index-aware diagnostics, existential escape checks |
| Higher-kinded types (MVP+) | Beta | Kind polymorphism + higher-order kind inference + constraint solving (`HKT-001`), partial/curried constructors (`Result<_, E>`, `Result<i32>`), constructor aliases/composition (`type Compose<F<_>, G<_>, A> = F<G<A>>`), `where` constructor bounds, associated-type arity (`type Wrapped<_>;`) |

## Type System (HM)
| Feature | Status | Notes |
|---|---|---|
| Hindley‑Milner inference | Stable | Inference for lets, params, calls |
| Generic instantiation | Stable | Freshening on use |
| Enum exhaustiveness | Stable | LUM‑003 |
| Type holes (`_`) | Stable | LUM‑010 when unresolved |
| Monomorphization | Stable | Generic functions specialized at compile‑time |
| Traits | Stable | Trait declarations + impls + method dispatch |
| Trait bounds | Stable | Single and multiple bounds (`T: A + B`) |
| Associated types | Stable | `type Item` in traits/impls |
| Default trait methods | Stable | Trait methods with default bodies |


## Diagnostics & LSP
| Feature | Status | Notes |
|---|---|---|
| Structured diagnostics | Stable | Error / warning severity |
| HM type formatting | Stable | Pretty formatting for errors |
| LSP hover (HM‑backed) | Stable | Uses HM inferred types + cross‑file source info |
| LSP signature help | Beta | NodeID‑based mapping |
| LSP cross‑file definition | Stable | Aliases + namespace imports supported |
| Canonical module IDs + alias‑aware hover | Stable | Cross‑file hover & definition via module graph |
| LSP quick‑fixes for type holes | Stable | Uses HM LUM‑010; **range precision for nested generics deferred** |
| LSP inlay hints | Stable | Type hints for inferred lets + parameter hints |
| LSP refactor code actions | Stable | Extract local + collection call style rewrite |
| Diagnostic deduplication | Stable | HM + semantic merged |

## Standard Library & Runtime
| Feature | Status | Notes |
|---|---|---|
| Prelude enums (Option/Result) | Stable | Registry + prelude |
| Runtime stdlib expansion | Stable | Core modules: `io`, `str`, `math`, `list`, `vec`, `hashmap`, `hashset`, `fs`, `opfs`, `sab_channel`, `webgpu`, `http`, `time`, `regex`, `crypto` |
| HKT stdlib traits | Stable | `@std/functor`, `@std/applicative`, `@std/monad` + Option/Result/Vec/HashMap helpers |
| Frontend/reactivity primitives | Beta | `@std/reactive` + `@std/render` (`Signal`, `Memo`, `Effect`, `VNode`, renderer contract + DOM/SSR/Canvas/Terminal renderers) |
| Runtime Option/Result | Stable | JS runtime + helpers |
| Async I/O | Stable | `io.readLineAsync()` |
| File system | Stable | `fs.readFile`, `fs.writeFile`, `fs.readDir`, `fs.metadata`, `fs.exists`, `fs.mkdir`, `fs.removeFile` |
| Browser OPFS | Beta | `opfs.readFile`, `opfs.writeFile`, `opfs.readDir`, `opfs.metadata`, `opfs.exists`, `opfs.mkdir`, `opfs.removeFile` |
| SAB channels | Beta | `sab_channel` bounded i32 channel API with send/recv/close helpers |
| WebGPU compute | Stable | Generic `webgpu.compute(...)` (`i32/u32/f32/f64/u8`) + `compute_i32` compatibility alias |
| WebGPU buffers/resources | Beta | Typed buffers (`buffer_create/write/read/destroy`), uniforms, vertex/index buffers, canvas/present handles |
| WebGPU render pipeline | Beta | `render_pipeline` + `render_frame` with vertex/index binding and clear/draw submission |
| WGSL shader DSL | Beta | `shader compute|vertex|fragment ...` syntax + compiler to WGSL strings; raw WGSL strings still supported |
| Time/Duration | Stable | `time.nowMs`, `time.instantNow`, `time.elapsedMs`, `time.sleep` |
| Regex | Stable | Validation, test, find/findAll, replace |
| Crypto | Stable | SHA-256, HMAC-SHA256, random bytes/int, AES-GCM |

## Tooling & Codegen
| Feature | Status | Notes |
|---|---|---|
| AST lowering | Beta | Used by transpiler |
| JS codegen | Stable | Match lowering + IIFE + source map support |
| WASM codegen | Beta | Broad JS parity, async/select lowering via promise handles, ~100x faster recursion in benchmarks |
| IR optimization (SSA) | Stable | Function‑scoped SSA + loop‑safe constant propagation |
| Source maps | Stable | External + inline options |
| Multi‑file module compilation | Stable | Import resolution via bundling (topological compile planned) |
| Package management | Beta | Registry workflow (`lumina add`, `lumina install`, `lumina publish`, `lumina search`) + lockfile migration; ecosystem/discovery still expanding |
| `lumina fmt` | Stable | Whitespace normalization + check mode |
| `lumina lint` | Stable | Semantic diagnostics + style checks |
| `lumina doc` | Stable | Markdown API extraction from declarations |

---

## Proven Capabilities
- Multi‑file projects (500+ lines) via bundling import resolution
- Recursive generic ADTs (List/Option/Result, JsonValue)
- Pattern matching with exhaustiveness checks
- Monomorphization in practice (zero‑cost generics)
- Stdlib integration (`io`, `str`, `math`, `list`, `vec`)
- Source maps for debugging
- Real‑world utility: working JSON parser

## Near‑Term Roadmap (Next 3–5)
1. **Web-native P0 runtime parity** (browser + WASM host-call surface, deterministic behavior, no unsupported production paths)
2. **WASM backend stabilization** (remaining edge-case lowering, diagnostics hardening, perf and memory validation)
3. **Browser-native stdlib expansion** (`dom`, `web_worker`, `web_storage`, `url`, `web_streams` modules)
4. **Package registry + web distribution** (publish/discovery + browser/WASM package consumption workflow)
5. **Borrow safety polish + advanced IDE refactors** (same goals, sequenced after web-native P0)

Reference: `docs/WEB_NATIVE_ROADMAP.md`

### P0 Release Gate: Core Language Features in WASM (Must Complete Entirely)
- [x] String operations (beyond numerics)
- [x] String interpolation codegen
- [x] String slicing in WASM
- [x] Struct construction and field access
- [x] Enum construction and pattern matching
- [x] Trait method dispatch in WASM
- [x] Closures/lambdas in WASM
- [x] Error handling (`?` operator)
- [x] Async/await + select support (lowered through WASM promise-handle runtime imports)

### 1.2 Collections in WASM (Priority: P0)
- [x] Vec operations (push, get, len, pop, clear, take, skip)
- [x] HashMap operations (new/len/insert/get/remove/contains_key/clear)
- [x] HashSet operations (new/len/insert/contains/remove/clear)
- [x] Array indexing with bounds checks
- [x] Iterator methods in WASM (any/all/map/filter/fold/find/position)

### 1.3 Control Flow in WASM (Priority: P0)
- [x] If/else statements
- [x] While loops
- [x] For loops (range loops)
- [x] Match expressions with all patterns (enum/literal/wildcard/binding/tuple/struct)
- [x] Break/continue (available in language syntax + JS/WASM lowering)
- [x] Return from nested contexts

### 1.4 Memory Management (Priority: P1)
- [x] String allocation in linear memory (host string ops now allocate/write string objects in WASM linear memory via exported allocator when available)
- [x] Struct allocation (linear-memory bump allocator via `alloc`)
- [x] Reference counting (if needed) (runtime hooks: `mem_retain` / `mem_release` / `mem_stats_live` for managed heap pointers)
- [x] Garbage collection strategy (or explicit memory management) (explicit memory management: allocator + free-list + exported `__free`; no tracing GC)

### 1.5 WASM Testing (Priority: P0)
- [x] Comprehensive WASM codegen tests (50+ tests) (`tests/codegen-wasm-matrix.test.ts` + existing WASM codegen suites)
- [x] Runtime behavior tests (not just compilation) (`tests/wasm-runtime-behavior.test.ts`, `tests/wasm-runtime.test.ts`, `tests/wasm-channel-runtime.test.ts`)
- [x] Performance benchmarks vs JS (`scripts/benchmark/wasm-vs-js-bench.ts`, run with `npm run bench:wasm-vs-js`)
- [x] Memory usage validation (`tests/wasm-memory-validation.test.ts`, `scripts/benchmark/wasm-memory-bench.ts`, run with `npm run bench:wasm-memory`)

### WASM v1 Explicit Unsupported Diagnostics
- `is` expressions / runtime narrowing in WASM (`WASM-IS-001`)
- Unsupported cast combinations (`WASM-CAST-001`)
- Standalone range expressions (`WASM-RANGE-001`)
- Range slicing on non-string values (`WASM-RANGE-002`)
- Statement declarations in executable blocks (trait/impl/struct/type/import) (`WASM-STMT-001`)
- Unknown expression kind in backend lowering (`WASM-EXPR-001`)
- Unresolved method dispatch paths (`WASM-TRAIT-001`)
- Unresolved type-to-WASM mapping (`WASM-TYPE-001`)
