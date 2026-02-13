# Monomorphization in Lumina

This document describes Lumina’s monomorphization pass: what it is, why it matters, and how it is implemented in the compiler today.

## What Is Monomorphization?

Monomorphization is a compile‑time optimization that specializes generic functions for the concrete types used at each call site. Instead of keeping a single polymorphic implementation at runtime, Lumina generates concrete versions with type parameters substituted by the inferred types.

Benefits:
- **Performance**: Avoids boxing and dynamic dispatch for generics.
- **Smaller runtime surface**: No generic machinery required at runtime.
- **Better JS output**: Specializations become straightforward functions.

## How It Works in Lumina

Lumina performs monomorphization after HM inference:

1. **Analysis**  
   Collect concrete instantiations from HM‑inferred call signatures.
2. **Specialization**  
   Clone the generic function AST, substitute type parameters with concrete types, and rename it using a mangled name.
3. **Rewrite Call Sites**  
   Replace generic calls with the correct specialized function name.
4. **Emit**  
   Append specialized functions to the program and continue codegen.

## Name Mangling Strategy

Format:
```
{functionName}_{typeArg1}_{typeArg2}...
```

Examples:
- `identity<T>` called with `int` → `identity_int`
- `pair<A,B>` called with `(int, string)` → `pair_int_string`
- `wrap<T>` called with `Option<int>` → `wrap_Option_int`

If a type parameter cannot be fully resolved, the mangled name may still include a placeholder segment (e.g., `T85`). This is tracked as a known limitation (see below).

## Examples

### Identity
```lumina
fn identity<T>(x: T) -> T { return x; }
let a = identity(42);
let b = identity("hello");
```

Generated (conceptually):
```lumina
fn identity_int(x: int) -> int { return x; }
fn identity_string(x: string) -> string { return x; }

let a = identity_int(42);
let b = identity_string("hello");
```

### Multiple Type Parameters
```lumina
struct Pair<A, B> { first: A, second: B }
fn pair<A, B>(a: A, b: B) -> Pair<A, B> {
  return Pair { first: a, second: b };
}

let p = pair(1, "x");
```

Generated:
```
pair_int_string(...)
```

### Nested Generics
```lumina
fn wrap<T>(x: T) -> Option<T> { return Option.Some(x); }
let o = wrap(Option.Some(42));
```

Generated:
```
wrap_Option_int(...)
```

## Performance Implications

- Monomorphization increases code size (one function per specialization).
- Runtime performance improves because the specialized code avoids generic branching.
- The compiler can eliminate unused specializations (future work).

## Current Limitations

1. **ADT type parameters may remain unresolved**  
   Some specializations can still carry unresolved type parameters in nested contexts (tracked in TODO).

2. **Qualified calls are not rewritten**  
   Calls like `Module.fn(...)` or `Enum.Variant(...)` are left intact. This keeps module/enum semantics stable but can limit specialization in those paths.

3. **Dead code elimination not yet applied**  
   Unused specialized variants are not removed post‑generation (tracked in TODO).

## Implementation Files

- `src/lumina/monomorphize.ts`  
  Analysis, specialization, call rewrite.
- `src/lumina/hm-infer.ts`  
  Provides per‑call instantiated signatures.
- `src/bin/lumina-core.ts`, `src/bin/cli-core.ts`  
  Integrate monomorphization into the compilation pipeline.

## Future Work

See `docs/TODO.md` for:
- Full type parameter resolution in ADT specialization
- Dead code elimination for unused monomorphic variants
