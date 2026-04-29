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

### DOM Render Benchmark

The DOM render smoke benchmark is the perf-gate fixture for `examples/dom-render/benchmark.html`.

Run the browser smoke harness to produce an export:

```bash
npm run test:browser:benchmark
```

Validate or archive an export with the benchmark importer:

```bash
node --import tsx scripts/benchmark/dom-render-bench.ts --input <export.json> --baseline tests/benchmark/dom-render-smoke.baseline.json --summary-path <summary.json>
```

Contract notes:

- Scenario keys and order are fixed: `wholeList`, `mount`, `indexList`, `forList`, `reorder`, `complexReorder`, `fineGrained`.
- Local smoke suites are fixed per scenario, so suite-name drift fails validation before baseline medians are compared.
- Comparable DOM scenarios keep the same [WHATWG DOM](https://dom.spec.whatwg.org/) shape: `ul.bench-list > li.bench-row > span.bench-pill + span.bench-value`.
- Timings use [`performance.now()`](https://developer.mozilla.org/docs/Web/API/Performance/now) totals and [`performance.mark()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark) / [`performance.measure()`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measure) entries so samples align with the browser Performance API model.
- The importer validates manifest compatibility, scenario keys, suite order, sample counts, summary math, and latest-history parity before applying baseline tolerances.

## Exit Criteria (Phase 1)

- Compiler does not crash on valid randomized inputs in fuzz/property tests.
- Stress test coverage includes 1000+ document projects.
- Concurrent compile tests run without race failures.
- Diagnostic explanations are available for high-frequency error codes.
- Benchmarks are versioned and reproducible in CI/local runs.
