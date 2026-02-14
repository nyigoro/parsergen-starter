# @lumina/json-parser

JSON parser and stringify utilities for Lumina.

## Installation

```bash
lumina add @lumina/json-parser
```

## Usage

```lumina
import { parse } from "@lumina/json-parser";
import { stringify } from "@lumina/json-parser/stringify";

match parse("{\"x\": 1}") {
  Result.Ok(value) => io.println(stringify(value)),
  Result.Err(err) => io.eprintln("Parse failed")
}
```

## Exports

- `parse` from `src/parser.lm`
- `types` from `src/types.lm`
- `stringify` from `src/stringify.lm`
