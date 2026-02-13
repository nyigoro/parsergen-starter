# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- **Breaking:** Removed the `parsergen` binary. Use `lumina grammar` for parser generator tooling.

- Lumina language pipeline (lexer, parser, semantic checks, IR, codegen).
- Multi-file project context with panic recovery and dependency graph.
- Lumina LSP server (diagnostics, completion, symbols, rename, references, semantic tokens).
- CLI enhancements (`lumina`, `lumina-lsp`, `parsergen` updates).
- Optimizations (constant folding, dead code elimination, constant propagation).
- **Fix:** SSA IR codegen now hoists SSA temporaries and avoids loop-unsafe constant folding.
- Source maps support and improved watcher tooling.
