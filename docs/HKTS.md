# Higher-Kinded Types in Lumina

Lumina supports first-class higher-kinded type parameters and kind checking for common `* -> *` and `* -> * -> *` patterns.

## Core Syntax

```lumina
trait Functor<F<_>> {
  fn map<A, B>(fa: F<A>, f: fn(A) -> B) -> F<B>;
}

trait BiFunctor<F<_,_>> {
  fn map_left<A, B, C>(fab: F<A, C>, f: fn(A) -> B) -> F<B, C>;
}
```

Lumina accepts `fn(A) -> B` in type positions and lowers it to internal function-type form for semantic + HM checking.

## Partial Type-Constructor Application

Use `_` placeholders to keep constructor positions open:

```lumina
trait Monad<M<_>> {}

struct Demo {}

impl Monad<Result<_, i32>> for Demo {}
```

`Result<_, i32>` has kind `* -> *` and is valid where a unary constructor is required.

## Kind Mismatch Diagnostics

When constructor kinds do not match, Lumina reports `HKT-001` with:

- expected kind (`*`, `* -> *`, …),
- actual kind,
- contextual help (for example suggesting `Result<_, E>` when a unary constructor is expected).

## Current Scope

- Supported:
  - arity-based kind checking for type constructors.
  - placeholder-based partial application (`_`).
  - kind validation in traits, impls, function signatures, and bounds.
  - user-defined generic constructors in HKT positions (for example `impl Monad<MyType> ...` when `MyType<T>` is declared).
- Not yet complete:
  - full higher-order kind polymorphism (`forall k` style).
  - advanced kind-constraint solving beyond arity checks.
  - complete HKT stdlib hierarchy (`Functor`, `Applicative`, `Monad`, etc.) in `@std`.
