# Higher-Kinded Types in Lumina

Lumina supports higher-kinded type parameters with kind inference and constraint solving across declarations.

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

Currying-style prefix application is also supported:

```lumina
trait Unary<F<_>> {}
impl Unary<Result<i32>> for Demo {}
```

`Result<i32>` is treated as a unary constructor waiting for the remaining type argument.

## Type Constructor Aliases and Composition

Type aliases can define and compose constructors:

```lumina
type IntMap<V> = HashMap<i32, V>;
type Compose<F<_>, G<_>, A> = F<G<A>>;
```

These aliases can be used in constructor positions:

```lumina
trait Unary<F<_>> {}
impl Unary<IntMap> for Demo {}
impl Unary<Compose<Option, Vec>> for Demo2 {}
```

## HKT Bounds in `where` Clauses

Lumina supports constructor constraints in `where` clauses:

```lumina
trait Functor<F<_>> {}

fn keep<F<_>, A>(value: F<A>) -> F<A>
where F: Functor {
  value
}
```

You can mix constructor bounds with const clauses in one `where` list.

## Associated Types in HKT Context

Associated types can declare constructor arity:

```lumina
trait Collection<C<_>> {
  type Wrapped<_>;
  fn wrap<A>(value: A) -> Self::Wrapped<A>;
}
```

Impls must match associated-type arity.

## Kind Mismatch Diagnostics

When constructor kinds do not match, Lumina reports `HKT-001` with:

- expected kind (`*`, `* -> *`, …),
- actual kind,
- contextual help (for example suggesting `Result<_, E>` when a unary constructor is expected),
- concrete examples for the expected kind shape.

## Higher-Order Kind Inference

Lumina infers higher-order kinds directly from usage:

```lumina
trait Lift<G<_>, F<_>> {
  fn lift(x: G<F>) -> G<F>;
}
```

From this signature, `F` is inferred as `* -> *` and `G` as `(* -> *) -> *`.

Type parameters without explicit `<_>` arity also infer constructor kinds from usage:

```lumina
trait Wrap<F> {
  fn wrap(x: F<i32>) -> F<i32>;
}
```

## Current Scope

- Supported:
  - kind inference for type expressions in traits, impls, function signatures, associated types, and bounds.
  - full kind polymorphism for type parameters via inferred kind variables.
  - higher-order kind inference (for example `(* -> *) -> *`).
  - kind-constraint solving across signatures and repeated uses.
  - placeholder-based partial application (`_`).
  - user-defined generic constructors in HKT positions (for example `impl Monad<MyType> ...` when `MyType<T>` is declared).
  - type-constructor constraints in `where` clauses (`where F: Functor`).
  - HKT bounds in type-parameter lists (`F<_>: Functor`, `G<_,_>: BiCtx`).
  - HKT associated-type arity (`type Wrapped<_>;`) with impl arity validation.
  - stdlib HKT traits/modules for `Functor`, `Applicative`, and `Monad` with implementations for `Option`, `Result`, `Vec`, and `HashMap` helpers.
