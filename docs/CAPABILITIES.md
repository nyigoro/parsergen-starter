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
| Function overloading | Stable | Trait-based + ad-hoc stdlib overload resolution with `OVERLOAD_NO_MATCH`/`OVERLOAD_AMBIGUOUS` diagnostics |
| Macros | Beta | Expansion phase with matcher/transcriber subset, lexical scoping, `![]`/`!()`/`!{}` calls, recursion/cycle diagnostics |
| `#[derive(...)]` | Stable | Trait-based derived impl synthesis (`Clone`, `Debug`, `Eq`) for structs/enums, generic bound synthesis, collision diagnostics |
| Const generics | Stable | Const params across structs/enums/functions/traits, where-clauses, explicit const args (`::<...>`), semantic + HM checks, monomorphization, JS/WASM fixed-array codegen |
| GADTs | Stable | Indexed variants + existential constraints, recursive refinement guards (`GADT-008`), nested/multi-pattern refinement, WASM nested + multi-payload match lowering, HKT-indexed non-existential positions |
| Higher-kinded types | Stable | Kind polymorphism + higher-order inference + constraint solving (`HKT-001`), partial/curried constructors (`Result<_, E>`, `Result<i32>`), constructor aliases/composition, pattern refinement through HKT-applied positions, stable stdlib Functor/Applicative/Monad modules |

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
| LSP signature help | Stable | Cursor-aware nested call resolution, overload candidate lists, active parameter tracking, HM-instantiated call-site labels |
| LSP cross‑file definition | Stable | Aliases + namespace imports supported |
| LSP references | Stable | Cross-module references include declaration/call/import/type/pattern sites with deduplication |
| LSP rename | Stable | Cross-module rename with conflict checks, package-boundary protection, deterministic workspace edits |
| Canonical module IDs + alias‑aware hover | Stable | Cross‑file hover & definition via module graph |
| LSP quick‑fixes for type holes | Stable | Uses HM LUM‑010 with precise `_` replacement ranges for nested generic types |
| LSP inlay hints | Stable | Type hints for inferred lets + parameter hints |
| LSP refactor code actions | Stable | Extract local/type alias, inline variable, collection call style rewrites |
| LSP document/workspace symbols | Stable | Symbol kinds + workspace query coverage across multi-file projects |
| LSP semantic tokens | Stable | Keyword/literal/type/value tokenization with stable output across non-semantic edits |
| Diagnostic deduplication | Stable | HM + semantic merged |

## Standard Library & Runtime
| Feature | Status | Notes |
|---|---|---|
| Prelude enums (Option/Result) | Stable | Registry + prelude |
| Runtime stdlib expansion | Stable | Core modules: `io`, `str`, `math`, `list`, `vec`, `hashmap`, `hashset`, `fs`, `opfs`, `url`, `web_storage`, `dom`, `web_worker`, `web_streams`, `sab_channel`, `webgpu`, `http`, `time`, `regex`, `crypto` |
| Numeric API unification | Stable | Unified `abs`, `min`, `max`, `pow` over int/float overloads; `absf`/`minf`/`maxf`/`powf` remain as deprecated aliases |
| HKT stdlib traits | Stable | `@std/functor`, `@std/applicative`, `@std/monad` + Option/Result/Vec/HashMap helpers |
| Frontend/reactivity primitives | Beta | `@std/reactive` + `@std/render` (`Signal`, `Memo`, `Effect`, `VNode`, renderer contract + DOM/SSR/Canvas/Terminal renderers) |
| Runtime Option/Result | Stable | JS runtime + helpers |
| Async I/O | Stable | `io.readLineAsync()` |
| File system | Stable | `fs.readFile`, `fs.writeFile`, `fs.readDir`, `fs.metadata`, `fs.exists`, `fs.mkdir`, `fs.removeFile` |
| Browser OPFS | Beta | `opfs.readFile`, `opfs.writeFile`, `opfs.readDir`, `opfs.metadata`, `opfs.exists`, `opfs.mkdir`, `opfs.removeFile` |
| Browser URL module | Beta | `url.parse`, `url.build`, URL field getters/setters, query parameter append, `url.is_available` |
| Browser web storage | Beta | `web_storage.local_*` + `web_storage.session_*` with browser API + Node in-memory fallback |
| Browser DOM module | Beta | `dom.query/query_all/create`, attrs/text/html/style, child ops, event add/remove with opaque handles |
| Browser worker module | Beta | `web_worker.spawn/spawn_inline/post/on_message/on_error/terminate`, worker-context helpers |
| Browser streams module | Beta | `web_streams.from_fetch/from_string/from_bytes/read_chunk/read_all/read_text/pipe/cancel` |
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
| WASM codegen | Beta | Core language + collections + control-flow parity implemented; standalone range expressions lower to heap-backed range records; trait/type fallback dispatch hard-fail paths replaced with explicit diagnostics; `is` narrowing is now target-gated in semantic (`WASM-IS-001`) with match-based guidance; remaining explicit unsupported diagnostics are concentrated in non-string range indexing, declaration-in-expression-block paths, and selected cast edges; ~100x faster recursion in benchmarks |
| IR optimization (SSA) | Stable | Function‑scoped SSA + loop‑safe constant propagation |
| Source maps | Stable | External + inline options |
| Multi‑file module compilation | Stable | Import resolution via bundling (topological compile planned) |
| Package management | Beta | Registry workflow (`lumina add`, `lumina install`, `lumina publish`, `lumina search`) + lockfile migration; ecosystem/discovery still expanding |
| Web distribution tooling | Beta | `lumina bundle --target browser|wasm`, `lumina importmap`, browser lock generation (`lumina.browser.lock`), optional `lumina publish --cdn` artifact URL flow |
| JS↔WASM parity harness | Beta | `tests/parity/parity-harness.ts` + backend parity suite compare stdout + return values, including async/await, chained await, and async-calls-async cases |
| Browser smoke CI | Beta | Playwright smoke scaffolding in `tests/browser/` (`test:browser`) with OPFS/SAB/WebGPU/WASM load checks |
| WASM perf validation suite | Beta | `tests/wasm-perf-validation.test.ts` tracks workload peak memory, large-collection memory behavior, long-run retain/release stability, and wasm binary-size regression baseline |
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
