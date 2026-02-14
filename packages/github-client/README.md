# @lumina/github-client

A small GitHub API client built in Lumina.

## Installation

```bash
lumina add @lumina/github-client
```

## Usage

```lumina
import { get_user } from "@lumina/github-client";
import { io, str } from "@std";

async fn main() {
  match await get_user("octocat") {
    Result.Ok(user) => {
      io.println(str.concat("User: ", user.login));
      io.println(str.concat("Repos: ", str.from_int(user.public_repos)));
    },
    Result.Err(err) => io.eprintln(err)
  }
}
```

## API

- `get_user(username: string) -> Result<User, string>`

## Types

See `src/types.lm` for `User` and `Repository` structs.
