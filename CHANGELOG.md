# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
