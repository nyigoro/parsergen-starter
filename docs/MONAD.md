# Monad in Lumina

`Monad<M<_>>` captures dependent sequencing (`flat_map`) and flattening (`join`).

```lumina
trait Monad<M<_>> {
  fn flat_map<A, B>(value: M<A>, mapper: fn(A) -> M<B>) -> M<B>;
}
```

## Standard Implementations

The `@std/monad` module provides:

- `Option`
- `Result`
- `Vec`
- `HashMap` value-flattening helpers

```lumina
import { monad, Option, Result, hashmap } from "@std";
```

### API

- `monad.flat_map_option`
- `monad.flat_map_result`
- `monad.flat_map_vec`
- `monad.flat_map_hashmap_values`
- `monad.join_option`
- `monad.join_result`
- `monad.join_vec`
- `monad.join_hashmap_values`

## Usage Patterns

### Option

```lumina
let maybe_id = Option.Some(7);
let maybe_user = monad.flat_map_option(maybe_id, |id| find_user(id));
```

### Result

```lumina
let validated = monad.flat_map_result(parse_int("42"), |n| validate(n));
```

### Vec

```lumina
let xs = [1, 2, 3];
let out = monad.flat_map_vec(xs, |n| [n, n * 10]);
```

### HashMap Values

```lumina
let base = hashmap.new();
hashmap.insert(base, "x", 2);

let expanded = monad.flat_map_hashmap_values(base, |n| {
  let out = hashmap.new();
  hashmap.insert(out, "double", n * 2);
  out
});
```
