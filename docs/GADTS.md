# GADTs in Lumina

Lumina supports indexed enum variants (GADT-style declarations) with branch-local type refinement and existential witness tracking.

## Quick Start

```lumina
enum Expr<T> {
  Lit(i32): Expr<i32>,
  Bool(bool): Expr<bool>
}

fn eval_i32(e: Expr<i32>) -> i32 {
  match e {
    Expr.Lit(n) => n
  }
}
```

The `Expr.Bool` variant is excluded for `Expr<i32>` and does not need to be matched.

## Syntax

### Indexed Variants

```lumina
enum Expr<T> {
  Lit(i32): Expr<i32>,
  Wrap(T): Expr<T>
}
```

### Existential Variant Parameters

```lumina
trait Show {
  fn show(self: Self) -> string;
}

enum ShowBox {
  Box exists <T>(T): ShowBox where T: Show
}
```

Existential types are scoped to the arm that introduces them.

## Current Guarantees

- `GADT-001`: variant result must return the declaring enum.
- `GADT-002`: variant type variables must be declared (enum params or existential params).
- `GADT-004`: existential parameters cannot be const.
- `GADT-005`: existential higher-kinded params are rejected.
- `LUM-003`: non-exhaustive matches are reported with index-aware filtering.
- `LUM-004`: unreachable match arms are reported when index constraints rule them out.
- `GADT-006`: existential values escaping an arm are rejected.
- JS codegen uses optimized tag-switch lowering for simple enum/GADT matches.
- WASM backend supports:
  - discriminant-only enum/GADT matching (zero-payload variants)
  - payload enum constructor lowering (single and multi-payload)
  - payload binding in simple matches (`Enum.Variant(a, b, ...)`)

## Example 1: Type-Safe AST

```lumina
enum Expr<T> {
  Lit(i32): Expr<i32>,
  Add(Expr<i32>, Expr<i32>): Expr<i32>
}

fn eval(e: Expr<i32>) -> i32 {
  match e {
    Expr.Lit(n) => n,
    Expr.Add(a, b) => eval(a) + eval(b)
  }
}
```

## Example 2: Typed State Machine

```lumina
enum Session<S> {
  Open(i32): Session<OpenState>,
  Closed: Session<ClosedState>
}
```

Indexed states keep impossible transitions out of valid branches.

## Example 3: Existential Packaging

```lumina
enum ShowBox {
  Box exists <T>(T): ShowBox where T: Show
}

fn consume(box: ShowBox) -> i32 {
  match box {
    ShowBox.Box(_) => 1
  }
}
```

## Migration Guide

- Start from plain enums and add result indices only where branch refinements matter.
- Use existential variants for packed values that should stay abstract to callers.
- Keep existential values local to the arm where they are introduced.

## Known Limits

- WASM simple-match lowering currently requires direct enum variants (no guards, no deep nested destructuring).
- Exhaustiveness diagnostics are index-aware, but nested constraint explanations can still improve.
- Trait integration with deeply nested GADT refinements is still evolving.
