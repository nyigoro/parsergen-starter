# Stability and Reliability

This document tracks Lumina's stability-focused workstream.

## Phase 1 Scope

1. Comprehensive test expansion
1. Diagnostics quality and recoverability
1. Performance baselines and regressions

## Current Additions

### Reliability Tests

- `tests/hm-fuzz-property.test.ts`
  - Property-style randomized HM inference coverage.
  - Validates parser + inferencer do not crash on randomized arithmetic programs.
- `tests/stress-project-context.test.ts`
  - Stresses `ProjectContext` with 1000 documents.
- `tests/compile-concurrency.test.ts`
  - Compiles multiple programs concurrently to catch race regressions.
- `tests/memory-leak-guard.test.ts`
  - Repeated parse/infer loops with optional GC-based growth guard.
- `tests/type-system-edge-matrix.test.ts`
  - Cross-feature edge-case matrix for trait, cast, generics, and error propagation interactions.

### Diagnostics UX

- `lumina explain <CODE>`
  - Prints a structured explanation for known diagnostic codes.
- `src/lumina/diagnostic-explain.ts`
  - Central explanation registry with summary + fix guidance.
- LSP quick fix:
  - `Explain diagnostic <CODE>` inserts explanation comments at the diagnostic site.

### Multi-error Behavior

- Compile/check now aggregate parser recovery diagnostics with semantic diagnostics when AST payload is recoverable.
- This preserves additional errors in one run instead of failing on first recoverable syntax issue.

## Benchmarks

### Compile Bench

Run:

```bash
npm run bench:compile
```

Output is JSON with:

- Lumina compile time
- Optional `tsc`, `esbuild`, `swc` comparisons (if local binaries exist)

### Incremental Compile Bench

Run:

```bash
npm run bench:incremental
```

Output is JSON with:

- Cold compile latency
- Incremental compile latency percentiles (p50/p95/max)

### LSP Bench

Run:

```bash
npm run bench:lsp
```

Output is JSON with:

- Document open/update latency percentiles
- Symbol lookup latency percentiles

### Runtime Bench

Run:

```bash
npm run bench:runtime
```

Output is JSON with:

- Signal update throughput (`ops/s`)
- Lumina SSR rendering throughput
- React SSR reference sample (when available)

### Memory Bench

Run:

```bash
npm run bench:memory
```

Output is JSON with:

- Heap and RSS before/after stress loops
- Delta values in MB
- Whether explicit GC sampling was available

## Exit Criteria (Phase 1)

- Compiler does not crash on valid randomized inputs in fuzz/property tests.
- Stress test coverage includes 1000+ document projects.
- Concurrent compile tests run without race failures.
- Diagnostic explanations are available for high-frequency error codes.
- Benchmarks are versioned and reproducible in CI/local runs.
