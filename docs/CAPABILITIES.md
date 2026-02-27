# Lumina Capabilities Matrix

This document tracks the current state of the Lumina language/tooling and near‑term priorities.

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
| Row polymorphism (structural) | Beta | Read‑only / constraint‑based MVP |
| Flow‑sensitive narrowing (`is`) | Beta | Narrowing in HM + semantic |

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
| Runtime stdlib expansion | Stable | Core modules: `io`, `str`, `math`, `list`, `vec`, `hashmap`, `hashset`, `fs`, `http`, `time`, `regex`, `crypto` |
| Runtime Option/Result | Stable | JS runtime + helpers |
| Async I/O | Stable | `io.readLineAsync()` |
| File system | Stable | `fs.readFile`, `fs.writeFile`, `fs.readDir`, `fs.metadata`, `fs.exists`, `fs.mkdir`, `fs.removeFile` |
| Time/Duration | Stable | `time.nowMs`, `time.instantNow`, `time.elapsedMs`, `time.sleep` |
| Regex | Stable | Validation, test, find/findAll, replace |
| Crypto | Stable | SHA-256, HMAC-SHA256, random bytes/int, AES-GCM |

## Tooling & Codegen
| Feature | Status | Notes |
|---|---|---|
| AST lowering | Beta | Used by transpiler |
| JS codegen | Stable | Match lowering + IIFE + source map support |
| WASM codegen | Beta | ~100x faster for recursion in benchmarks |
| IR optimization (SSA) | Stable | Function‑scoped SSA + loop‑safe constant propagation |
| Source maps | Stable | External + inline options |
| Multi‑file module compilation | Stable | Import resolution via bundling (topological compile planned) |
| Package management | Stable | npm-based, lockfile, workspace support |
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
1. **WASM backend completeness** (broader AST/IR coverage + parity with JS path)
2. **Package registry** (publish/discovery workflow for Lumina packages)
3. **Borrow safety polish** (branch-merge borrow checks + stronger diagnostics)
4. **Advanced IDE refactors** (rename-safe transforms, extraction across modules)
5. **Function overloading / numeric API cleanup** (abs/absf → unified surface)
