# Lumina v0.5.1

Released: 2026-03-11

## Highlights

- **List comprehensions** — `[x * 2 for x in xs if x > 0]`
- **Named and default arguments** — `fn f(x: int, y: int = 10)`, `f(y: 2, x: 1)`
- **std/iter + std/query** — 22 collection operations and pipe-based Query DSL
- **Advanced IDE refactors** — 13 transforms including cross-file change signature and move symbol
- **Universal editor protocol** — `lumina-language-client` package for Neovim, Helix, Zed
- **CJS/ESM dual output** — `--target dual` with auto-generated exports map
- **Lockfile integrity hardening** — distinct missing vs mismatch errors
- **Secret scanning** — `lumina publish` blocks on detected secrets
- **LSP vault completion** — installed packages appear in import completions
- **Whitespace/semicolon consistency** — semicolons optional in all statement forms

## Language

### List Comprehensions
List comprehensions are now supported with Vec-only sources, including a two-generator form and clear diagnostics (`COMP-001/002`).

### Named and Default Arguments
Function parameters can now define default values, and call sites can supply arguments by name with automatic reordering and explicit diagnostics.

### Semicolons Optional Everywhere
Semicolons are now optional across all statement forms, including simple type aliases.

## Standard Library

### `@std/iter`
New iterator helpers include `filter`, `zip`, `enumerate`, `flatten`, `chunk`, `window`, `group_by`, and more.

### `@std/query`
Eager in-memory query pipelines now compose cleanly with `|>` for query-style transforms.

## IDE / LSP

- Advanced refactor set expanded with typed-AST precision.
- New `lumina-language-client` protocol package enables cross-editor refactors.
- Import completion now includes packages discovered from `lumina.lock` (vault-aware exports).

## Package Manager

- Lockfile integrity is enforced with distinct missing vs mismatch errors.
- `lumina publish` now runs secret scanning with `.luminaignore` support.

## Tooling / Distribution

- `--target dual` outputs ESM + CJS with auto-generated exports map.
- Topological compile path is now the default with legacy bundled path still supported.
- Watch mode hardened with chokidar, batching, and export-aware invalidation.

## Breaking Changes

None.

## Migration

No migration required from v0.5.0.
