# Applicative in Lumina

`Applicative<F<_>>` extends mapping with value lifting and container-wrapped function application.

```lumina
trait Applicative<F<_>> {
  fn pure<A>(value: A) -> F<A>;
  fn ap<A, B>(fns: F<fn(A) -> B>, value: F<A>) -> F<B>;
}
```

## Standard Implementations

The `@std/applicative` module provides:

- `Option`
- `Result`
- `Vec`
- `HashMap` value-application helpers

```lumina
import { applicative, hashmap } from "@std";
```

### API

- `applicative.pure_option`
- `applicative.pure_result`
- `applicative.pure_vec`
- `applicative.pure_hashmap`
- `applicative.ap_option`
- `applicative.ap_result`
- `applicative.ap_vec`
- `applicative.ap_hashmap_values`

## Usage Patterns

### Option / Result

```lumina
let f = Option.Some(|n| n + 1);
let x = Option.Some(41);
let out = applicative.ap_option(f, x); // Some(42)
```

```lumina
let f = Result.Ok(|n| n * 2);
let x = Result.Ok(9);
let out = applicative.ap_result(f, x); // Ok(18)
```

### Vec (cross product apply)

```lumina
let fs = [|n| n + 1, |n| n * 10];
let xs = [2, 3];
let out = applicative.ap_vec(fs, xs); // [3, 4, 20, 30]
```

### HashMap (key-aligned apply)

```lumina
let fns = hashmap.new();
hashmap.insert(fns, "a", |n| n + 100);

let values = hashmap.new();
hashmap.insert(values, "a", 1);
hashmap.insert(values, "b", 2);

let out = applicative.ap_hashmap_values(fns, values);
// out contains only key "a"
```
