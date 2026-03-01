# Lesson 1: Basics

## Goals

- Write and run a Lumina program.
- Use `fn`, `let`, arithmetic, and string interpolation.

## Example

```lumina
import { io, str } from "@std";

fn add(a: i32, b: i32) -> i32 {
  a + b
}

fn main() -> void {
  let x = 10;
  let y = 20;
  let total = add(x, y);
  io.println("x = {x}, y = {y}, total = {total}");
  io.println(str.concat("double total = ", str.from_int(total * 2)));
}
```

## What to Observe

- `let x = 10;` infers `i32`.
- Interpolation converts expressions to string automatically.
- Expression-bodied function returns the last expression.

## Exercises

1. Add `sub(a, b)` and print result.
2. Add `mul(a, b)` and print result.
3. Print one message using interpolation and one using `str.concat`.

## Check Yourself

- Program compiles with `lumina check`.
- Output matches expected math values.
