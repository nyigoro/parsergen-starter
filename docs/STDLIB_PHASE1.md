# Stdlib Phase 1 Expansion

Core functional programming utilities for List, Option, and Result.

## @std/list

```lumina
pub fn map<A, B>(f: fn(A) -> B, xs: List<A>) -> List<B>
pub fn filter<A>(pred: fn(A) -> bool, xs: List<A>) -> List<A>
pub fn fold<A, B>(f: fn(B, A) -> B, init: B, xs: List<A>) -> B
pub fn reverse<A>(xs: List<A>) -> List<A>
pub fn length<A>(xs: List<A>) -> int
pub fn append<A>(xs: List<A>, ys: List<A>) -> List<A>
pub fn take<A>(n: int, xs: List<A>) -> List<A>
pub fn drop<A>(n: int, xs: List<A>) -> List<A>
pub fn find<A>(pred: fn(A) -> bool, xs: List<A>) -> Option<A>
pub fn any<A>(pred: fn(A) -> bool, xs: List<A>) -> bool
pub fn all<A>(pred: fn(A) -> bool, xs: List<A>) -> bool
```

## @std/option

```lumina
pub fn map<A, B>(f: fn(A) -> B, opt: Option<A>) -> Option<B>
pub fn and_then<A, B>(f: fn(A) -> Option<B>, opt: Option<A>) -> Option<B>
pub fn or_else<A>(fallback: fn() -> Option<A>, opt: Option<A>) -> Option<A>
pub fn unwrap_or<A>(default: A, opt: Option<A>) -> A
pub fn is_some<A>(opt: Option<A>) -> bool
pub fn is_none<A>(opt: Option<A>) -> bool
```

## @std/result

```lumina
pub fn map<T, E, U>(f: fn(T) -> U, res: Result<T, E>) -> Result<U, E>
pub fn and_then<T, E, U>(f: fn(T) -> Result<U, E>, res: Result<T, E>) -> Result<U, E>
pub fn or_else<T, E, F>(f: fn(E) -> Result<T, F>, res: Result<T, E>) -> Result<T, F>
pub fn unwrap_or<T, E>(default: T, res: Result<T, E>) -> T
pub fn is_ok<T, E>(res: Result<T, E>) -> bool
pub fn is_err<T, E>(res: Result<T, E>) -> bool
```

## Implementation Priority

1. List ops (most impact)
2. Option helpers (commonly needed)
3. Result helpers (error handling)
