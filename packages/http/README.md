# @lumina/http

HTTP client library for Lumina.

## Installation

```bash
lumina add @lumina/http
```

## Usage

```lumina
import { get } from "@lumina/http";
import { io, str } from "@std";

async fn example() {
  match await get("https://api.github.com/users/octocat") {
    Result.Ok(response) => {
      io.println(str.concat("Status: ", str.from_int(response.status)));
      io.println(response.body);
    },
    Result.Err(error) => {
      io.eprintln(error);
    }
  }
}
```

## API

- `get(url: string) -> Result<Response, string>`
- `post(url: string, body: string) -> Result<Response, string>`
- `put(url: string, body: string) -> Result<Response, string>`
- `del(url: string) -> Result<Response, string>` *(Note: named `del` to avoid JavaScript keyword conflict)*
- `request(req: Request) -> Result<Response, string>`

## Types

See `src/request.lm` and `src/response.lm` for the type definitions.

## Why `del` instead of `delete`?

`delete` is a reserved keyword in JavaScript. To avoid codegen conflicts, the HTTP DELETE method is exposed as `del()`.
