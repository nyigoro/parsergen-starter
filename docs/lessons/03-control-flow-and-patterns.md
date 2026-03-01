# Lesson 3: Control Flow and Patterns

## Goals

- Use `if`, `while`, `for ... in ...`.
- Use `match` and `while let`.

## Branching and Loops

```lumina
import { io, str } from "@std";

fn main() -> void {
  let mut total = 0;

  for i in 0..5 {
    total = total + i;
  }

  if total > 5 {
    io.println(str.concat("total=", str.from_int(total)));
  } else {
    io.println("small total");
  }
}
```

## Pattern Matching

```lumina
import { io } from "@std";

fn print_option(v: Option<i32>) -> void {
  match v {
    Some(x) => io.println("value {x}"),
    None => io.println("none")
  }
}
```

## While-Let Pattern

```lumina
import { io, vec } from "@std";

fn main() -> void {
  let mut v = vec.new();
  v.push(1);
  v.push(2);
  v.push(3);

  while let Some(x) = v.pop() {
    io.println("popped {x}");
  }
}
```

## Exercises

1. Sum even numbers from `0..20`.
2. Write `fn describe(v: Option<i32>) -> string` using `match`.
3. Use `while let` to drain a vector and count popped elements.
