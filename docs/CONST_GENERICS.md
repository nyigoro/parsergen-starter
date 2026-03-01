# Const Generics in Lumina

Const generics let you parameterize types with compile-time constant values.

## Basic Syntax

```lumina
struct Vec<T, const N: usize> {
  data: [T; N]
}
```

## Const Parameter Types

- `usize` (recommended for sizes)
- `i32`
- `i64`

## Fixed-Size Arrays

```lumina
struct Vec3 {
  data: [f64; 3]
}
```

## Const Expressions

```lumina
struct Matrix<T, const ROWS: usize, const COLS: usize> {
  data: [T; ROWS * COLS]
}
```

Supported operators: `+`, `-`, `*`, `/`.

## Runtime Safety

- Array literal size checks are validated.
- Array indexing is bounds-checked at runtime.

## Performance Notes

- Const sizes enable better specialization.
- Monomorphization creates concrete specialized declarations/functions.
- WASM layout comments expose fixed-size byte totals for structs.

## Current Limitations

- Const expressions must be compile-time evaluable.
- Trait-level const-generic bounds are still limited.
- WASM backend support remains focused on numeric and fixed-size array paths.

