# GADTs in Lumina (Baseline)

Lumina now includes baseline support for GADT-style enum declarations.

## Supported Syntax

```lumina
enum Expr<T> {
  Lit(i32): Expr<i32>,
  Wrap(T): Expr<T>
}
```

Variant-level existential parameters and constraints are parsed:

```lumina
trait Show {
  fn show(self: Self) -> string;
}

enum Pack<T> {
  Hidden exists <A>(A): Pack<T> where A: Show
}
```

## Current Semantic Checks

Implemented:

- Variant result type must return the declaring enum (`GADT-001`)
- Type variables used in variant types must be declared via:
  - enum type parameters, or
  - variant existential parameters (`GADT-002`)
- Existential parameters cannot be const (`GADT-004`)
- Existential higher-kinded parameters are rejected for now (`GADT-005`)

## Not Yet Implemented

- Branch-local HM type refinement from GADT pattern matches
- Existential witness propagation through match arms
- GADT-aware exhaustiveness per index space
- Specialized GADT runtime codegen behavior

These are planned for the next stages.

