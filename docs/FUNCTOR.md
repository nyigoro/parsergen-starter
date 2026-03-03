# Functor in Lumina

`Functor<F<_>>` captures "map over a container-like constructor".

```lumina
trait Functor<F<_>> {
  fn map<A, B>(value: F<A>, mapper: fn(A) -> B) -> F<B>;
}
```

## Standard Implementations

The `@std/functor` module provides concrete mappings for:

- `Option`
- `Result`
- `Vec`
- `HashMap` (value mapping, keys preserved)

```lumina
import { functor, Option, Result, vec, hashmap } from "@std";
```

### API

- `functor.map_option`
- `functor.map_result`
- `functor.map_vec`
- `functor.map_hashmap_values`

## Usage Patterns

### Option

```lumina
let maybe_name = Option.Some("lumina");
let maybe_len = functor.map_option(maybe_name, |s| str.len(s));
```

### Result

```lumina
let parsed = Result.Ok(10);
let scaled = functor.map_result(parsed, |n| n * 3);
```

### Vec

```lumina
let xs = [1, 2, 3];
let ys = functor.map_vec(xs, |n| n + 1);
```

### HashMap Values

```lumina
let prices = hashmap.new();
hashmap.insert(prices, "cpu", 100);
let with_tax = functor.map_hashmap_values(prices, |p| p + 15);
```
