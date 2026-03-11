# Lumina Language Milestones

## v0.5.1 - Web-Native Tooling Maturity (Current)

**Date:** March 2026

**Major Features:**
- ✅ List comprehensions + named/default arguments
- ✅ `@std/iter` helpers and `@std/query` pipelines
- ✅ Advanced LSP refactors with cross-editor protocol package
- ✅ Dual ESM/CJS output (`--target dual`) with exports map
- ✅ Lockfile integrity hardening and publish-time secret scanning
- ✅ Topological compile default + watch-mode hardening
- ✅ Vault-aware import completions in LSP

**Proven Capabilities:**
- Strong language core (HM inference, GADT/HKT support, traits, macros)
- Browser-first runtime with WebGPU, OPFS, streams, and workers
- Cross-file tooling: hover/rename/references across module graph
- Mature package workflows (add/install/publish/search)

**What's Next:** Registry discovery depth, GPU CI coverage, and further IDE refactors

---

## v0.3.0 - Multi-File Projects

**Date:** February 2026

**Major Features:**
- ✅ Multi-file module compilation with import resolution
- ✅ Phase 1 stdlib expansion (list/option/result helpers)
- ✅ Monomorphization for zero-cost generics
- ✅ Complete JSON parser project (500+ lines, multi-file)
- ✅ Source maps with external/inline options
- ✅ LSP quick-fixes for type holes
- ✅ Async/await with Promise types + async stdlib
- ✅ Cross-file LSP hover/definition (module graph)
- ✅ SSA optimization fixes (function-scoped SSA, loop-safe const folding)
- ✅ Package management (npm-based with lumina.lock.json)

**Proven Capabilities:**
- Production-grade type inference (HM + generics + row polymorphism)
- Move semantics with partial moves
- Pattern matching with exhaustiveness checking
- Working stdlib (io/str/math/list with 40+ functions)
- Real-world utility (JSON parser compiles and runs)

**What's Next:** Trait system, package registry, stdlib Phase 2

---

## v0.2.0 - Type System Maturity

**Date:** January 2026

**Major Features:**
- ✅ Row polymorphism (structural typing)
- ✅ Type holes with inference validation
- ✅ Move semantics (affine types)
- ✅ Exhaustiveness checking
- ✅ LSP with hover/diagnostics

---

## v0.1.0 - Foundation

**Date:** December 2025

**Major Features:**
- ✅ Hindley-Milner type inference
- ✅ ADTs and pattern matching
- ✅ Basic code generation (JS)
- ✅ LSP server
