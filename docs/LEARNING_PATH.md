# Lumina Learning Path

This is a practical, step-by-step path to learn Lumina with runnable exercises.

## Prerequisites

- Complete `docs/GETTING_STARTED.md`
- Confirm `lumina check` and `lumina compile` work locally

## How to Use This Path

1. Read one lesson.
2. Create a `.lm` file and type the code yourself.
3. Run `lumina check` and `lumina compile`.
4. Complete the exercises before moving on.

## Lesson Sequence

1. `docs/lessons/01-basics.md`
- Functions, bindings, numbers, strings, interpolation.

2. `docs/lessons/02-types-and-collections.md`
- Numeric types, arrays, `Vec`, `HashMap`, `HashSet`.

3. `docs/lessons/03-control-flow-and-patterns.md`
- `if`, `while`, `for ... in ...`, `match`, `while let`.

4. `docs/lessons/04-errors-and-result.md`
- `Option`, `Result`, and `?` error propagation.

5. `docs/lessons/05-traits-and-generics.md`
- Traits, impls, bounds, associated types, default methods.

6. `docs/lessons/06-concurrency-and-async.md`
- Threads/channels and async ecosystem patterns.

7. `docs/lessons/07-wasm-and-tooling.md`
- WASM compile/run flow, lint/fmt/doc, release workflow.

## Suggested Schedule

- Day 1: Lessons 1–2
- Day 2: Lessons 3–4
- Day 3: Lesson 5
- Day 4: Lesson 6
- Day 5: Lesson 7 + mini project

## Mini Project Ideas

- CLI todo app using `HashMap` + file I/O.
- Worker pipeline using `thread` + `channel`.
- Numeric benchmark comparing JS vs WASM output.

## Reference While Learning

- `docs/USING_LUMINA.md`
- `docs/STDLIB.md`
- `docs/CAPABILITIES.md`
