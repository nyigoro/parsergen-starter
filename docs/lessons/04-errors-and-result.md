# Lesson 4: Error Handling with `Option`, `Result`, and `?`

## Goals

- Handle optional values safely.
- Propagate errors with `?` in `Result` functions.

## Option

```lumina
fn safe_div(a: i32, b: i32) -> Option<i32> {
  if b == 0 {
    None
  } else {
    Some(a / b)
  }
}
```

## Result + `?`

```lumina
import { fs } from "@std";

fn load(path: string) -> Result<string, string> {
  let content = fs.read_file(path)?;
  Ok(content)
}
```

`?` behavior:

- `Ok(v)` -> unwraps to `v`.
- `Err(e)` -> returns early from current function.

## Converting Between Error Shapes

When error types differ, map explicitly:

```lumina
fn parse_or_default(s: string) -> Result<i32, string> {
  match str.to_int(s) {
    Some(v) => Ok(v),
    None => Err("invalid integer")
  }
}
```

## Exercises

1. Implement `read_config(path) -> Result<string, string>` with `?`.
2. Chain 2 `Result`-returning functions with `?`.
3. Replace nested `match Result` blocks with `?`.
