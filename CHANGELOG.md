# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
