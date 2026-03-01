# Lumina Lessons

Hands-on lessons for learning Lumina in increasing difficulty.

## Order

1. `01-basics.md`
2. `02-types-and-collections.md`
3. `03-control-flow-and-patterns.md`
4. `04-errors-and-result.md`
5. `05-traits-and-generics.md`
6. `06-concurrency-and-async.md`
7. `07-wasm-and-tooling.md`

## Run Command Pattern

For each lesson file `lesson.lm`:

```bash
lumina check lesson.lm
lumina compile lesson.lm --target cjs --ast-js --out lesson.cjs
node lesson.cjs
```

Use `lumina fmt` and `lumina lint` after each exercise.
