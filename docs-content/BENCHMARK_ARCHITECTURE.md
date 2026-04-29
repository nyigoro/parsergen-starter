# DOM Benchmark Architecture

Lumina's DOM benchmark flow has two jobs:

1. measure canonical UI paths with a versioned harness
2. keep those measurements comparable over time

## Sources of Truth

- live page: `examples/dom-render/benchmark.html`
- harness: `examples/dom-render/benchmark.js`
- compiled fixture: `examples/dom-render/benchmark-compiled.lm`
- browser contract: `tests/browser/smoke/dom-render-benchmark.spec.ts`
- checked-in smoke baseline: `tests/benchmark/dom-render-smoke.baseline.json`
- checked-in local baseline: `tests/benchmark/dom-render-local.baseline.json`
- export/gate CLI: `scripts/benchmark/dom-render-bench.ts`

## Export Contract

The page writes a versioned payload to `window.__luminaBenchmarkExport`.

The payload includes:

- `schemaVersion`
- `suiteVersion`
- `manifest`
- `environment`
- `latest`
- `history`
- `historyMeta`

Each scenario entry includes:

- suite name
- iteration count
- warmup/measured run counts
- `samplesMs`
- `minMs`
- `medianMs`
- `maxMs`
- `meanMs`
- `avgMsPerIteration`

The manifest is tiered and now includes:

- `tier`: `smoke`, `local`, or `full`

## Benchmark Modes

- smoke tier:
  - `?tier=smoke`
  - browser-safe, local-only, and checked into tests
  - current canonical smoke size: `32`
- local tier:
  - `?tier=local`
  - 1,000-row local Lumina + Vanilla comparison without network framework imports
- full tier:
  - `?tier=full`
  - 1,000-row cross-framework comparison including React and Solid

Saved history is namespaced by tier, so smoke/local/full runs do not overwrite each other.

## DOM Parity Rules

Cross-framework benchmark rows should share the same decorated shell:

- `ul.bench-list`
- `li.bench-row`
- `span.bench-pill`
- `span.bench-value`

That keeps DOM-shape differences from distorting row-level comparisons.

## Contract and Gate Flow

1. Run the browser smoke contract:
   - `npm run test:browser:benchmark:smoke`
2. Capture the export JSON.
3. Compare it with the checked-in smoke baseline:
   - `npm run bench:dom-render:smoke:check -- --input <export.json>`
4. Archive the run and fail on regressions.

The current checked-in gate is intentionally stricter than the first rollout:

- median ratio limit: `3x`
- median regression budget: `2ms`

## Baseline Refresh

When the harness changes intentionally:

1. run the smoke benchmark
2. inspect the export JSON
3. refresh the baseline:
   - `npm run bench:dom-render:smoke:update-baseline -- --input <export.json>`
4. rerun the browser contract and the gate

## Local 1000-Row Flow

Use the local tier when you want the real 1,000-row Lumina + Vanilla profile without CI-sized smoke constraints.

1. run the browser local contract:
   - `npm run test:browser:benchmark:local`
2. compare the exported run with the checked-in local baseline:
   - `npm run bench:dom-render:local:check -- --input .tmp/dom-render-benchmark/local-export.json`
3. if the harness changed intentionally, refresh the local baseline:
   - `npm run bench:dom-render:local:update-baseline -- --input .tmp/dom-render-benchmark/local-export.json`
4. the local history archive is written under:
   - `benchmarks/dom-render-history/local`

CI stays smoke-only. The local tier is for contributor perf verification and deeper manual regression tracking.

## Relative Ordering

The smoke browser contract now also protects the core keyed reorder ordering:

- `Lumina keyed list` must stay faster than `Lumina generic keyed patch`
- `Lumina keyed list (compiled)` must stay faster than `Lumina generic keyed patch`

## Interpretation

- `generic keyed patch` tracks the raw fallback path
- `keyed list` tracks the specialized runtime path
- `keyed list (compiled)` tracks the compiler-lowered path

The canonical Lumina reorder story should be judged primarily from the specialized and compiled keyed-list paths, while the generic keyed path remains a fallback quality metric.
