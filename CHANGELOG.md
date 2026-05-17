# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- **Playground:** Polished UI Preview and Run lifecycle states with clearer empty/loading/success/error surfaces, preview timeout recovery, stale-output reset behavior, and more precise compile/runtime/preview status wording.
- **Docs/Playground:** Embedded curated live playground examples into high-value docs pages, with docs-side iframe styling and local-dev URL normalization for `?embed=1` examples.
- **Playground:** Migrated the editor language path to Lezer-backed Lumina tokenization and polished Diagnostics explain cards with clearer code, location, why-it-happens, and fix guidance.
- **Playground:** Added `?embed=1` compact embed mode with Open in Playground state preservation, Copy Embed snippet support, and local settings for theme, editor font size, and tab size.
- **Playground:** Expanded the examples browser into a curated language tour with richer single-source examples across Language Core, Type System, Reactive UI, Web Native, and Advanced groups.
- **Playground:** Added a real Types tab that surfaces HM inference data with declaration and expression type tables, click-to-jump expression rows, and Copy JSON export.
- **Routing/UI:** Added `@std/router` with browser-history-aware navigation, current-path/search helpers, route matching/param extraction, and declarative link support for Lumina browser apps.
- **Demo:** Migrated the Lumina-authored browser demo from an internal route signal to URL-aware routing with back/forward browser navigation support.
- **Docs/Homepage:** Reworked the main landing experience with richer above-the-fold Lumina code, clickable docs links, a `Why Lumina?` comparison page, and target-selection guidance for JS vs WASM.
- **Demo:** Simplified the browser entry path and added legacy hash-route compatibility so static deep links like `#/lumina` resolve into the new URL-aware demo.

## [0.5.7] - 2026-04-06

- **Tooling:** Added a compile-and-run Lumina REPL with persistent declaration context, history, `:load`/`:ctx`/`:clear` commands, and symbol-aware completion.
- **UI runtime:** Expanded `@std/render` prop helpers with DOM-friendly `id/style/value/placeholder/href/disabled/key` setters plus text-input `on_input`/`on_change` handlers for larger Lumina browser UIs.
- **Demo:** Shipped a Lumina-authored browser demo with a Vite `.lm` plugin, browser shims, and an in-browser compiler bridge.
- **Editor tooling:** Expanded VS Code TextMate + semantic token highlighting for Lumina keywords, built-in types, declarations, and macro calls.
- **Release hygiene:** Fixed REPL lint violations so release verification passes on tagged builds.

## [0.5.3] - 2026-03-12

- **Packaging:** Build and verify `dist/` before publishing `lumina-lang`, ensuring compiled artifacts are included in the npm tarball.
- **VS Code extension:** Ignore parent `../packages` and `../node_modules` paths to prevent VSIX traversal outside the extension.


## [0.5.2] - 2026-03-12

- **Packaging:** Slimmed npm publish contents by enumerating dist artifacts and stdlib, excluding source maps and extra files.
- **LSP refactors:** Consolidated `offsetAt`/`positionAt` helpers to shared `ast-utils` across refactor actions.
- **CI:** Added build verification step to the main CI job.

## [0.5.1] - 2026-03-11

- **Package security:** Tightened lockfile integrity handling so missing hashes are reported explicitly, installs/adds fail with distinct missing-vs-mismatch errors, and added `lumina secret-scan` plus publish-time secret scanning with `.luminaignore` support.
- **JS distribution:** Added dual ESM/CJS output generation (`--target dual`) and dual-package metadata for `lumina-language-client`.
- **LSP completion:** Import completions now merge stdlib modules with packages discovered from `lumina.lock`, including vault-aware named export suggestions.
- **Stdlib collections:** Added `@std/iter` helpers (`filter`, `zip`, `enumerate`, `flatten`, `chunk`, `window`, `group_by`, etc.) plus eager `@std/query` pipelines that compose with `|>` for in-memory query-style transforms.
- **Language:** Added list comprehensions (`[expr for x in xs if cond]` and two-generator form) with Vec-only sources and clear diagnostics (`COMP-001/002`).
- **Language:** Added named arguments + default parameter values with call-site reordering and explicit diagnostics.
- **Language:** Made semicolons optional for all statement forms, including simple type aliases.
- **Compiler:** Switched the CLI and worker/watch compile default to the module-graph topological path; `--bundled-compile` now opts into the legacy bundled pipeline while `--topo-compile` remains accepted for compatibility.
- **Watch mode:** Replaced per-file `fs.watch` usage with chokidar-backed directory watching, batched rebuild scheduling, content-hash filtering, and export-aware incremental invalidation.
- **Borrow safety:** Added dedicated borrow/move regression coverage, field-aware borrow conflict tracking, loop move diagnostics, and statement-scoped release for temporary ref-parameter borrows.
- **LSP refactors:** Added typed AST plumbing in the LSP/module graph, shared AST edit utilities, and upgraded refactor rewrite precision away from ad-hoc text scanning for signature and symbol-move flows.
- **IDE tooling:** Added change-return-type, trait-method signature propagation across impls, and extract-module refactors, plus VS Code command flows for change-return-type and extract-module.
- **Editor integration:** Added the `lumina-language-client` protocol package plus editor integration docs for VS Code, Neovim, Helix, and Zed so advanced refactors can be driven outside VS Code.

## 0.5.0 - 2026-03-05

- **Language/Type System:** Stabilized advanced features already in tree (function overloading, macro system hardening, ref/ref mut pattern support, GADT/HKT coverage, numeric API unification, and cast semantics hardening).
- **Compiler:** Added module-graph topological multi-file compile path with dependency ordering, per-module cache invalidation, and `--topo-compile` CLI support.
- **WASM backend:** Closed remaining production lowering gaps, fixed implicit return stack handling for expression-bodied functions, and kept `WASM-IS-001` as an intentional semantic target gate.
- **Runtime/Web-native:** Stabilized browser stdlib modules (`opfs`, `url`, `web_storage`, `dom`, `web_worker`, `web_streams`), SAB typed channels, and WebGPU compute/render/resource/DSL surfaces with hardening tests.
- **Tooling/Distribution:** Stabilized package and web distribution workflows (`lumina add/install/publish/search`, `bundle --target browser|wasm`, `importmap`, browser lock flow, optional CDN artifact publish).
- **Quality/CI:** Expanded JS↔WASM parity matrix, browser smoke coverage, perf validation harnesses, publish/bundle/lowering tests, and hardened browser smoke CI reliability (wabt install + robust smoke harness checks).
- **Docs:** Refreshed `docs/CAPABILITIES.md` to match implemented status (WASM codegen + topological multi-file compile reflected as implemented).

## 0.4.1 - 2026-02-15

- **Security:** Added HTTP URL validation in runtime (`http`/`https` only), with blocks for localhost/loopback, metadata endpoints, and private IPv4 ranges.
- **Security:** Added CLI output path hardening to prevent traversal outside workspace by default and block writes to sensitive system directories.
- **Docs:** Updated capabilities matrix to reflect current implemented language/tooling status and refreshed near-term roadmap.
- **Quality:** Added security regression tests for HTTP SSRF controls and path traversal protections; full test suite remains green.

## 0.4.0 - 2026-02-15

- **Language:** Added lambda expressions, array literals (`[a, b, c]`), collection method syntax (`v.push(1)`), and improved namespace/member resolution.
- **Types:** Added full numeric type family (`i8..i128`, `u8..u128`, `f32`, `f64`) with conversions and canonical diagnostics.
- **Traits:** Added trait system foundations, method dispatch, trait bounds, associated types, and default trait implementations.
- **Strings:** Added interpolation (`"Hello {name}"`), multiline/raw strings, better escape handling, and range-based slicing (`s[start..end]`).
- **Collections:** Added/expanded `Vec`, `HashMap`, and `HashSet` with functional iterator helpers (`map`, `filter`, `fold`, `for_each`).
- **Error handling:** Added `?` operator for ergonomic `Result` propagation.
- **Concurrency:** Added MessageChannel-based channels, bounded/backpressure channel behavior, thread helpers, and sync primitives.
- **WASM:** Added runnable WASM workflow improvements and runtime bridge updates.
- **Tooling:** Added advanced LSP features (inlay hints, richer code actions), stronger diagnostics/cascade suppression, and VS Code extension scaffolding.
- **Quality:** Expanded test coverage to 378 passing tests and tightened lint/build/test verification.

## 0.3.0 - 2026-02-14

- **Breaking:** Removed the `parsergen` binary. Use `lumina grammar` for parser generator tooling.
- **Rename:** Package published as `lumina-lang` (formerly `parsergen-starter`).
- Lumina language pipeline (lexer, parser, semantic checks, IR, codegen).
- Multi-file project context with panic recovery and dependency graph.
- Lumina LSP server (diagnostics, completion, symbols, rename, references, semantic tokens).
- CLI enhancements (`lumina`, `lumina-lsp`, `parsergen` updates).
- Optimizations (constant folding, dead code elimination, constant propagation).
- **Fix:** SSA IR codegen now hoists SSA temporaries and avoids loop-unsafe constant folding.
- Source maps support and improved watcher tooling.
