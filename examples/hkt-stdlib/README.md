# HKT Stdlib Example

This example demonstrates `Functor`, `Applicative`, and `Monad` helper usage from `@std`.

Covered containers:

- `Option`
- `Result`
- `Vec`
- `HashMap` (value-aligned applicative/monadic helpers)

## Run

```bash
npm run build
node dist/bin/lumina.js compile examples/hkt-stdlib/main.lm --out examples/hkt-stdlib/main.generated.js --target esm --ast-js
node examples/hkt-stdlib/main.generated.js
```
