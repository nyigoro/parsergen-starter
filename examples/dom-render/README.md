# DOM Renderer Examples

This folder demonstrates Phase 2 (`DOM`) for `@std/render`.

## Run Demo

1. Build runtime:

```bash
npm run build
```

2. Serve repository root with any static server:

```bash
npx serve .
```

3. Open:

- `http://localhost:3000/examples/dom-render/index.html` (counter/todo/async)
- `http://localhost:3000/examples/dom-render/benchmark.html` (bench harness)
- `http://localhost:3000/examples/dom-render/targets.html` (SSR/Canvas/Terminal)

## What it proves

- VNodes map to real DOM nodes.
- Signals/memos/effects trigger targeted DOM patching.
- List updates patch by child index (no full container re-render).
- Async effects support cleanup for stale requests.

## Benchmark Notes

- Benchmark scenario: update one row in a 1,000-item list over 300 iterations.
- Framework results vary by browser, CPU, and devtools state.
- Use production browser mode for consistent numbers.
