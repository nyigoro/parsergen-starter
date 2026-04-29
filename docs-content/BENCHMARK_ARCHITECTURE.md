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

## Benchmark Modes

- smoke/local contract:
  - `?smoke=1&localOnly=1`
  - small list size
  - browser-safe and checked into tests
- local perf runs:
  - `?localOnly=1`
  - full Lumina + Vanilla comparison without network framework imports
- full comparison runs:
  - default page
  - includes React and Solid

## DOM Parity Rules

Cross-framework benchmark rows should share the same decorated shell:

- `ul.bench-list`
- `li.bench-row`
- `span.bench-pill`
- `span.bench-value`

That keeps DOM-shape differences from distorting row-level comparisons.

## Contract and Gate Flow

1. Run the browser smoke contract:
   - `npm run test:browser:benchmark`
2. Capture the export JSON.
3. Compare it with the checked-in smoke baseline:
   - `npm run bench:dom-render:check -- --input <export.json>`
4. Archive the run and fail on regressions.

The current checked-in gate is intentionally stricter than the first rollout:

- median ratio limit: `3x`
- median regression budget: `2ms`

## Baseline Refresh

When the harness changes intentionally:

1. run the smoke benchmark
2. inspect the export JSON
3. refresh the baseline:
   - `npm run bench:dom-render:update-baseline -- --input <export.json>`
4. rerun the browser contract and the gate

## Interpretation

- `generic keyed patch` tracks the raw fallback path
- `keyed list` tracks the specialized runtime path
- `keyed list (compiled)` tracks the compiler-lowered path

The canonical Lumina reorder story should be judged primarily from the specialized and compiled keyed-list paths, while the generic keyed path remains a fallback quality metric.
