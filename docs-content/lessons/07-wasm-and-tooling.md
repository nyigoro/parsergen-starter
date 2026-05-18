# Lesson 7: WASM and Tooling Workflow

## Goals

- Compile/run Lumina on JS and WASM.
- Use formatter, linter, and doc generator in a repeatable workflow.

## Compile Targets

JavaScript:

```bash
lumina compile examples/wasm-hello/math.lm --target js --module cjs --out math.cjs
node math.cjs
```

WASM:

```bash
lumina compile examples/wasm-hello/math.lm --target wasm-web --out math.wasm
lumina run-wasm math.wasm main
```

Use `--target js --module esm|cjs` for JavaScript output. Use `wasm-web` for browser-hosted WebAssembly and `wasm-standalone` for stricter import-light kernels.

Optional debug output:

```bash
lumina compile examples/wasm-hello/math.lm --target wasm-web --out math.wasm --emit-wat
```

## Basic Benchmark Pattern

```bash
time lumina run-wasm math.wasm fibonacci 35
time node -e "const m=require('./math.cjs'); console.log(m.fibonacci(35));"
```

## Quality Gates

Run these before commit:

```bash
lumina fmt "examples/**/*.lm"
lumina lint "examples/**/*.lm"
npm run lint
npm test
npm run build
```

## API Documentation

```bash
lumina doc "src/**/*.lm" --out API.md
```

## Final Exercise

Build a small numeric app with:

- one generic type,
- one trait impl,
- one `Result` flow with `?`,
- one `Vec` pipeline,
- and both `js` + `wasm-web` compile runs.
