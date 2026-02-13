# Lumina JSON Parser

A complete JSON parser written in Lumina, demonstrating:
- Multi-file modules with imports
- Recursive ADTs (List, JsonValue)
- Pattern matching and exhaustiveness
- Generic functions with monomorphization
- Error handling with Result types
- String manipulation stdlib

## Files

- `types.lm` - Core ADTs (JsonValue, Token, ParseError, List, Option, Result)
- `lexer.lm` - Tokenization with escape handling
- `parser.lm` - Recursive descent parser
- `stringify.lm` - Pretty-printing JSON values
- `main.lm` - REPL interface
- `cli.lm` - CLI interface (stdin/pipe friendly)

## Usage

### REPL Mode (interactive)

```bash
lumina compile examples/json-parser/main.lm --out examples/json-parser/json-repl.js --target esm --ast-js
node -e 'globalThis.__luminaStdin=["{\"test\": 123}","exit"]; import("./examples/json-parser/json-repl.js");'
```

### CLI Mode (pipes/files)

```bash
lumina compile examples/json-parser/cli.lm --out examples/json-parser/json-cli.js --target esm --ast-js
echo '{"test": 123}' | node examples/json-parser/json-cli.js
cat data.json | node examples/json-parser/json-cli.js
```

## Example Session

```
Lumina JSON Parser
Enter JSON (or 'exit' to quit):

> {"name": "Alice", "age": 30}
Parsed successfully:
{
  "name": "Alice",
  "age": 30
}

> [1, 2, 3, true, null, "hello"]
Parsed successfully:
[
  1,
  2,
  3,
  true,
  null,
  "hello"
]

> exit
Goodbye!
```

## Features Demonstrated

- **Type inference**: All function types inferred by Hindley-Milner
- **Monomorphization**: Generic List/Option/Result specialized per type
- **Move semantics**: Safe ownership transfer in parser combinators
- **Pattern matching**: Exhaustive matches on tokens and values
- **Error handling**: Informative parse errors with position info
