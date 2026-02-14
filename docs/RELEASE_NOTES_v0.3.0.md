# Lumina v0.3.0 Release Notes

**Date:** 2026-02-14  
**Package:** `lumina-lang`  

Lumina v0.3.0 marks the transition from prototype to a usable, end-to-end language toolchain. This release ships async/await, package management, multi-file compilation, LSP cross-file features, and real-world examples that validate the stack.

## Highlights
- **Async/await** with `Promise<T>` semantics and runtime support.
- **Package management** (npm-backed) with `lumina.lock.json` for reproducible builds.
- **Multi-file compilation** with import resolution and bundling.
- **LSP improvements**: cross-file hover/definition + package diagnostics.
- **Monomorphization** for zero-cost generics.
- **Source maps** (inline + external).
- **Stdlib expansion**: `io`, `str`, `math`, `list`, `fs`, and HTTP helpers.
- **Real-world projects**: JSON parser, HTTP client, GitHub API client demo.

## New Features
### Language
- Async functions: `async fn` and `await` expressions.
- Promise types (`Promise<T>`) integrated into HM inference.
- Monomorphization for specialized generics at compile time.

### Tooling & Compiler
- Multi-file compilation with dependency graph and bundling.
- Source maps for debugging (inline/external).
- Improved LSP: cross-file hover and go-to-definition.

### Package Management
- CLI commands: `lumina init`, `lumina install`, `lumina add`, `lumina remove`, `lumina list`.
- `lumina.lock.json` with integrity hashes.
- Workspace packages + bare-specifier resolution.
- LSP package diagnostics (PKG-001..PKG-004).

### Standard Library
- `@std/io`: sync + async I/O.
- `@std/fs`: async `readFile`/`writeFile`.
- `@std/str`: `substring`, `split`, `trim`, `contains`, `char_at`, `to_int`, `to_float`, etc.
- `@std/list`: `map`, `filter`, `fold`, `reverse`, `length`, `append`, `take`, `drop`, `find`, `any`, `all`.
- `@std/http`: fetch-based HTTP helper in runtime.

## Fixes
- SSA IR codegen now hoists temporaries and avoids loop-unsafe constant folding.
- Cross-file resolution now works through package imports in compiler + LSP.

## Known Limitations
- Alias rewrite in the bundler can mis-handle certain imported symbols.
- JSON parser package uses `JList` to avoid `List` collisions (temporary naming).

## Migration Notes
- Package renamed to **`lumina-lang`** (formerly `parsergen-starter`).
- The `parsergen` binary is removed; use `lumina grammar` instead.

## Verify Installation
```bash
npm install -g lumina-lang
lumina --help
```

## Roadmap Preview
- Trait system and richer abstractions.
- Additional stdlib modules (collections, regex, http client package).
- More real-world examples and tutorials.

