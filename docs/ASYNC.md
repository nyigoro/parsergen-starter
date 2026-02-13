# Lumina Async/Await Guide

This guide describes the async/await model in Lumina and how it maps to JavaScript.

## Syntax

```lumina
async fn fetch_data() -> string {
  let result = await get_url("https://api.example.com");
  result
}
```

- `async fn` marks a function as asynchronous.
- `await` can only be used inside `async fn`.

## Types

In the type system, an async function returning `T` is treated as returning `Promise<T>`:

```lumina
async fn get_value() -> int { 42 }
// inferred type: fn() -> Promise<int>
```

`await` expects a `Promise<T>` and evaluates to `T`.

## Errors

- Using `await` outside an async function produces:
  - `AWAIT_OUTSIDE_ASYNC`

## Standard Library Async APIs

### `@std/io`
- `readLineAsync() -> Promise<Option<string>>`

### `@std/fs`
- `readFile(path: string) -> Promise<Result<string, string>>`
- `writeFile(path: string, content: string) -> Promise<Result<void, string>>`

## Example

```lumina
import { fs, io } from "@std";

async fn main() {
  match await fs.readFile("data.json") {
    Result.Ok(content) => io.println(content),
    Result.Err(error) => io.eprintln(error)
  }
}
```

## Notes

- Async/await compiles directly to JavaScript `async` / `await`.
- The runtime uses Node.js `fs/promises` when available; in browsers it falls back to `fetch` for reads.
