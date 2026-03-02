# Const Generics in Lumina

Const generics let you express compile-time numeric constraints and specialize types/functions by value.

## Quick Start

```lumina
struct Vec<T, const N: usize> {
  data: [T; N]
}
```

```lumina
fn repeat<const N: usize>(x: i32) -> [i32; N] where N > 0 {
  [x; N]
}
```

## Supported Const Parameter Types

- `usize` (recommended for sizes and indices)
- `i32`
- `i64`

## Supported Const Expressions

Arithmetic:
- `+`, `-`, `*`, `/`

Comparisons and boolean logic:
- `<`, `<=`, `>`, `>=`, `==`, `!=`
- `&&`, `||`, `!`

Helpers:
- `min(a, b)`, `max(a, b)`
- `if cond { a } else { b }`

## Where Clauses

Use const predicates to constrain valid instantiations:

```lumina
fn chunk<const N: usize>(x: i32) -> [i32; N] where N > 0 {
  [x; N]
}
```

```lumina
impl<const N: usize> Marker for [i32; N] where N > 0 {
  fn mark(self: Self) -> i32 { 1 }
}
```

## Explicit Const Arguments

Both generic call styles are accepted:

```lumina
let a = repeat<3>(7);
let b = repeat::<3>(7);
```

## Const Generic Traits

Traits can carry const parameters, and impls can match concrete values via generic const patterns.

```lumina
trait Index<const N: usize> {
  fn get(self: Self, idx: i32) -> i32;
}

impl<const N: usize> Index<N> for [i32; N] {
  fn get(self: Self, idx: i32) -> i32 { idx }
}
```

## Diagnostics

Const diagnostics include:
- evaluated expected size/value where possible
- origin expression in mismatches (for example `from 'N * 2'`)
- help notes for array-size fixes
- unbound const parameter diagnostics with declared-parameter context

## Performance and Specialization

- Const-generic declarations are specialized during monomorphization.
- Fixed-size arrays propagate concrete size metadata into codegen.
- WASM output includes fixed-size layout comments where available.

Run the dedicated benchmark:

```bash
npm run bench:const-generics
```

## Examples

See:
- `examples/const-generics/vec3.lm`
- `examples/const-generics/matrix.lm`
- `examples/const-generics/repeat.lm`
- `examples/const-generics/index-trait.lm`
- `examples/const-generics/ring-buffer.lm`

## Troubleshooting

`CONST-UNBOUND-PARAM`:
- Ensure the const name exists in the declaration (`const N: usize`).
- Check spelling and shadowing in nested generic contexts.

`CONST-WHERE-FAILED`:
- The provided const argument does not satisfy a `where` predicate.
- Inspect the predicate and call-site arguments.

`ARRAY-SIZE-MISMATCH` / `CONST-SIZE-MISMATCH`:
- Update literal length/repeat count or expected const expression so they agree.

## Current Limitations

- Const predicates are evaluated from explicit const arguments and resolvable const mappings.
- Trait const predicates are enforced in semantic/HM paths; advanced solver-style propagation is still limited.
- WASM backend is optimized primarily for numeric/fixed-size array paths.
