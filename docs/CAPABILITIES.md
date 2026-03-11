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
| `ref` / `ref mut` | Stable | Parameter + pattern binding support (`let ref`, match/if-let/while-let ref bindings) with semantic borrow checks, conflict diagnostics, and scoped borrow release |
| Move expressions (`move x`) | Stable | **Partial moves** supported with path tracking, field-aware borrow conflicts, loop move diagnostics, and use-after-move coverage |
| Type holes (`_`) in annotations | Stable | **HM validation** + LUM‑010 |
| Async/await | Stable | `async fn`, `await`, Promise<T> |
| Error handling (`?`) | Stable | Rust-style Result propagation |
| String interpolation | Stable | `"Hello {name}"` |
| String slicing | Stable | `s[0..5]`, `s[..5]`, `s[5..]`, `s[..]` |
| Raw + multiline strings | Stable | `r"..."`, `"""..."""` |
| Array literals + indexing | Stable | `[1,2,3]`, `v[0]` |
| List comprehensions | Beta | `[expr for x in xs if cond]` (Vec-only source) |
| Lambda expressions | Stable | `|x| x + 1` |
| Named + default arguments | Stable | Named call syntax (`f(x: 1)`) + default parameter values |
| Collection method syntax | Stable | `v.push(1)` style lowering to stdlib calls |
| Function overloading | Stable | Trait-based + ad-hoc stdlib overload resolution with `OVERLOAD_NO_MATCH`/`OVERLOAD_AMBIGUOUS` diagnostics |
| Macros | Stable | Expansion phase with lexical scoping, `![]`/`!()`/`!{}` calls, structured diagnostics (`MACRO-001..005`), multi-var + nested (depth<=2) repetition support, and deterministic recursion/cycle handling |
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
| LSP completion | Stable | Context-aware completion for in-scope symbols, member access, namespace access, import paths/names, keyword fallback, and vault-aware package imports from `lumina.lock` |
| LSP hover (HM‑backed) | Stable | Uses HM inferred types + cross‑file source info |
| LSP signature help | Stable | Cursor-aware nested call resolution, overload candidate lists, active parameter tracking, HM-instantiated call-site labels |
| LSP cross‑file definition | Stable | Aliases + namespace imports supported |
| LSP references | Stable | Cross-module references include declaration/call/import/type/pattern sites with deduplication |
| LSP rename | Stable | Cross-module rename with conflict checks, package-boundary protection, deterministic workspace edits |
| Canonical module IDs + alias‑aware hover | Stable | Cross‑file hover & definition via module graph |
| LSP quick‑fixes for type holes | Stable | Uses HM LUM‑010 with precise `_` replacement ranges for nested generic types |
| LSP inlay hints | Stable | Type hints for inferred lets + parameter hints |
| LSP refactor code actions | Stable | AST-backed rewrite substrate for refactors plus extract local/type alias/function/module, inline variable, promote-to-ref, split variable, trait stubs, change signature, change return type, change trait signature across impls, move symbol, async/result rewrites, if/else↔match transforms, and collection call style rewrites; Lumina now exposes a shared editor-agnostic command protocol package (`lumina-language-client`) and VS Code layers editor UI on top of it |
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
| Collection iteration + query helpers | Stable | `@std/iter` adds `filter/zip/enumerate/flatten/chunk/window/group_by/...`; `@std/query` adds eager `Query<T>` pipelines (`where_q`, `select_q`, `order_by_q`, `limit_q`, `join_q`) that compose with `|>` |
| Frontend/reactivity primitives | Stable | `@std/reactive` + `@std/render` (`Signal`, `Memo`, `Effect`, `VNode`, renderer contract + DOM/SSR/Canvas/Terminal renderers) with hardening coverage for idempotent cleanup, stress batching, parity, and renderer error paths |
| Runtime Option/Result | Stable | JS runtime + helpers |
| Async I/O | Stable | `io.readLineAsync()` |
| File system | Stable | `fs.readFile`, `fs.writeFile`, `fs.readDir`, `fs.metadata`, `fs.exists`, `fs.mkdir`, `fs.removeFile` |
| Browser OPFS | Stable | `opfs.readFile`, `opfs.writeFile`, `opfs.readDir`, `opfs.metadata`, `opfs.exists`, `opfs.mkdir`, `opfs.removeFile` with stress + error-path + parity coverage |
| Browser URL module | Stable | `url.parse`, `url.build`, URL field getters/setters, query parameter append, `url.is_available` with edge parsing matrix + stress coverage |
| Browser web storage | Stable | `web_storage.local_*` + `web_storage.session_*` with quota/error-path coverage and Node in-memory parity tests |
| Browser DOM module | Stable | `dom.query/query_all/create`, attrs/text/html/style, child ops, event add/remove with Node-stub and cleanup coverage |
| Browser worker module | Stable | `web_worker.spawn/spawn_inline/post/on_message/on_error/terminate`, worker-context helpers with round-trip + stress + cleanup tests |
| Browser streams module | Stable | `web_streams.from_fetch/from_string/from_bytes/read_chunk/read_all/read_text/pipe/cancel` with async/error/stress/cleanup coverage |
| SAB channels | Stable | Typed `sab_channel` APIs (`i32/u32/f32/f64`) with timeout/backpressure, close semantics, fallback parity, and stress coverage |
| WebGPU compute | Stable | Generic `webgpu.compute(...)` (`i32/u32/f32/f64/u8`) + `compute_i32` compatibility alias |
| WebGPU buffers/resources | Stable | Typed buffers + uniform/vertex/index lifecycle with stale-handle errors, cleanup checks, and stress/handle-leak coverage |
| WebGPU render pipeline | Stable | `render_pipeline`/`render_frame`/`present` lifecycle with explicit Err paths, browser smoke rendering, and repeated build/destroy validation |
| WGSL shader DSL | Stable | `shader compute|vertex|fragment ...` + structural validation coverage; raw WGSL passthrough remains supported |
| Time/Duration | Stable | `time.nowMs`, `time.instantNow`, `time.elapsedMs`, `time.sleep` |
| Regex | Stable | Validation, test, find/findAll, replace |
| Crypto | Stable | SHA-256, HMAC-SHA256, random bytes/int, AES-GCM |

## Tooling & Codegen
| Feature | Status | Notes |
|---|---|---|
| AST lowering | Stable | Dedicated lowering coverage for declarations, pattern forms, pipe/try lowering, and compile-time declaration stripping |
| JS codegen | Stable | Match lowering + IIFE + source map support |
| WASM codegen | Stable | Core language + collections + control-flow parity implemented; standalone range expressions lower to heap-backed range records; trait/type fallback dispatch hard-fail paths replaced with explicit diagnostics; range indexing lowers for strings, Vec slices, and fixed arrays; declaration statements in executable blocks are compile-time-only no-ops; cast-to-bool lowering and implicit-return stack handling are covered; `is` narrowing remains an intentional semantic target gate (`WASM-IS-001`) with concrete match-rewrite guidance, explain output, and LSP quick-fix support; ~100x faster recursion in benchmarks |
| IR optimization (SSA) | Stable | Function‑scoped SSA + loop‑safe constant propagation |
| Source maps | Stable | External + inline options |
| Multi‑file module compilation | Stable | Module-graph topological compile is now the default path, with dependency ordering, per-module cache keys, export-aware invalidation, chokidar-backed watch batching, and `--bundled-compile` as a legacy opt-out |
| Package management | Stable | Registry workflow (`lumina add`, `lumina install`, `lumina publish`, `lumina search`) with integrity enforcement, secret scanning on publish, CDN artifact coverage, richer search metadata/pagination UX, add/install edge-case tests, and lockfile migration |
| Web distribution tooling | Stable | `lumina bundle --target browser|wasm`, `lumina importmap`, browser lock generation (`lumina.browser.lock`), optional `lumina publish --cdn`, and browser CDN/import-map consumption smoke coverage |
| JS↔WASM parity harness | Stable | `tests/parity/parity-harness.ts` + expanded parity matrix (core language, async loops/chains, Result `?`, GADT/HKT-shaped programs) with explicit wat2wasm availability gating |
| Browser smoke CI | Stable | Playwright smoke suite for OPFS/SAB/WASM load/WebGPU/stdlib browser modules + CDN import-map path, with retries/traces, dedicated CI job gating (`LUMINA_BROWSER_SMOKE=1`), and GPU-specific local tooling via `npm run doctor:webgpu` / `npm run test:webgpu` |
| WASM perf validation suite | Stable | `tests/wasm-perf-validation.test.ts` covers workload peak memory, load/fragmentation behavior, binary-size regression baselines, and explicit wat2wasm/update-baseline guardrails |
| `lumina fmt` | Stable | Whitespace normalization + check mode |
| `lumina lint` | Stable | Semantic diagnostics + style checks |
| `lumina doc` | Stable | Markdown API extraction from declarations |

---

## Proven Capabilities
- Multi‑file projects (500+ lines) via bundling and topological module-graph compilation
- Recursive generic ADTs (List/Option/Result, JsonValue)
- Pattern matching with exhaustiveness checks
- Monomorphization in practice (zero‑cost generics)
- Stdlib integration (`io`, `str`, `math`, `list`, `vec`)
- Source maps for debugging
- Real‑world utility: working JSON parser

## Near‑Term Roadmap (Next 3–5)
1. **Topological compile rollout** (promote module-graph path to default, watch-mode invalidation hardening, large-project profiling)
2. **WASM backend polish** (opt-in boundaries like `WASM-IS-001`, diagnostics UX, perf/memory tuning beyond baseline)
3. **GPU CI coverage** (dedicated GPU-capable runner for `LUMINA_WEBGPU_SMOKE=1` specs)
4. **Registry ecosystem/discovery depth** (search ranking/pagination, package quality metadata, adoption workflows)
5. **Cross-file refactor depth + registry polish** (broader semantic-aware LSP transforms, package metadata quality, and higher-order workflow refinements)

Reference: `docs/WEB_NATIVE_ROADMAP.md`
