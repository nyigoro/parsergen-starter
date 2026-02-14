# Lumina Language Milestones

## v0.3.0 - Multi-File Projects (Current)

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
