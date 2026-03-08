# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- **Compiler:** Switched the CLI and worker/watch compile default to the module-graph topological path; `--bundled-compile` now opts into the legacy bundled pipeline while `--topo-compile` remains accepted for compatibility.
- **Watch mode:** Replaced per-file `fs.watch` usage with chokidar-backed directory watching, batched rebuild scheduling, content-hash filtering, and export-aware incremental invalidation.

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
