# Lesson 2: Types and Collections

## Goals

- Use explicit numeric types.
- Work with arrays, `Vec`, `HashMap`, and `HashSet`.

## Numeric Types

```lumina
let a: i32 = 42;
let b: f64 = 3.14;
let c = 255u8;
let d = 2.5f32;
```

Use conversion with `as` when needed:

```lumina
let x: i32 = 10;
let y: f64 = x as f64;
```

## Arrays and Vec

```lumina
import { io, vec, str } from "@std";

fn main() -> void {
  let nums = [1, 2, 3, 4];

  match nums[2] {
    Some(v) => io.println("nums[2] = {v}"),
    None => io.println("missing")
  }

  let v = vec.new();
  v.push(10);
  v.push(20);
  io.println(str.concat("len=", str.from_int(v.len())));
}
```

## HashMap and HashSet

```lumina
import { io, hashmap, hashset, str } from "@std";

fn main() -> void {
  let m = hashmap.new();
  m.insert("alice", 30);
  m.insert("bob", 25);

  match m.get("alice") {
    Some(age) => io.println("alice age {age}"),
    None => io.println("not found")
  }

  let s = hashset.new();
  s.insert(1);
  s.insert(1);
  s.insert(2);
  io.println(str.concat("set size=", str.from_int(s.len())));
}
```

## Exercises

1. Build a `Vec<i32>` of 5 numbers, then fold to a sum.
2. Create a map of 3 users and print one by key.
3. Insert duplicates in a set and verify uniqueness via `len()`.
