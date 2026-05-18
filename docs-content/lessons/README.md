# Lumina Lessons

Hands-on lessons for learning Lumina in increasing difficulty.

## Order

| Step | Lesson | Focus |
|---|---|---|
| 1 | [Basics](01-basics.md) | Functions, bindings, output |
| 2 | [Types and collections](02-types-and-collections.md) | Numbers, arrays, `Vec`, maps, sets |
| 3 | [Control flow and patterns](03-control-flow-and-patterns.md) | Branching, loops, `match`, `while let` |
| 4 | [Errors and Result](04-errors-and-result.md) | `Option`, `Result`, and `?` |
| 5 | [Traits and generics](05-traits-and-generics.md) | Bounds, impls, associated types |
| 6 | [Concurrency and async](06-concurrency-and-async.md) | Host-runtime async, threads, channels |
| 7 | [WASM and tooling](07-wasm-and-tooling.md) | Target profiles, WAT, fmt/lint/doc |

## Run Command Pattern

For each lesson file `lesson.lm`:

```bash
lumina check lesson.lm
lumina compile lesson.lm --target js --module cjs --out lesson.cjs
node lesson.cjs
```

Use `lumina fmt` and `lumina lint` after each exercise.

For browser-facing examples, open the related playground preview from the parent docs page when available. DOM-mounted UI examples belong in the UI tab rather than the Worker Run tab.
