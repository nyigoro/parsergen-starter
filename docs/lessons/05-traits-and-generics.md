# Lesson 5: Traits and Generics

## Goals

- Define traits and implementations.
- Use generic functions with trait bounds.
- Understand associated types and default methods.

## Basic Trait + Impl

```lumina
trait Printable {
  fn print(self: Self) -> void;
}

struct User {
  name: string
}

impl Printable for User {
  fn print(self: Self) -> void {
    io.println(self.name);
  }
}
```

## Generic Bounds

```lumina
fn print_one<T: Printable>(value: T) -> void {
  value.print();
}
```

## Multiple Bounds

```lumina
fn process<T: Printable + Clone>(value: T) -> T {
  value.print();
  value.clone()
}
```

## Associated Types + Defaults

```lumina
trait IteratorLike {
  type Item;
  fn next(mut self: Self) -> Option<Self::Item>;

  fn count(mut self: Self) -> i32 {
    let mut n = 0;
    while let Some(_) = self.next() {
      n = n + 1;
    }
    n
  }
}
```

## Exercises

1. Create trait `Debuggable` with `debug() -> string`, implement for a struct.
2. Add a default method to a trait and override it in one impl.
3. Write `fn show_all<T: Printable>(values: Vec<T>)` using `for`.
