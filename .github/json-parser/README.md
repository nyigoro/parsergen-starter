# Lumina JSON Parser

A complete JSON parser implementation in Lumina demonstrating:
- Algebraic Data Types (ADTs)
- Pattern matching
- Generic types with monomorphization
- Multi-file module system
- Recursive data structures
- Move semantics

## Project Structure

```
examples/json-parser/
├── types.lm       # Core ADT definitions (JsonValue, Token, ParseError, Result, Option, List)
├── lexer.lm       # Tokenization (String → List<Token>)
├── parser.lm      # Recursive descent parser (List<Token> → Result<JsonValue, ParseError>)
├── stringify.lm   # Pretty-printer (JsonValue → String)
├── main.lm        # CLI REPL interface
└── README.md      # This file
```

## Features

### Supported JSON Types
- `null`
- Booleans (`true`, `false`)
- Numbers (floating point)
- Strings (with basic escape handling)
- Arrays
- Objects (key-value pairs)

### Error Handling
- Position-aware error messages
- Descriptive parse errors
- Graceful failure with error recovery

## Usage

### Compile
```bash
luminac examples/json-parser/main.lm -o json-parser
```

### Run
```bash
./json-parser
```

### Interactive REPL
```
Lumina JSON Parser
Enter JSON (or 'exit' to quit):

> {"name": "Lumina", "version": 1.0}
Parsed successfully:
{"name": "Lumina", "version": 1.0}

> [1, 2, 3, true, null]
Parsed successfully:
[1, 2, 3, true, null]

> exit
Goodbye!
```

## Test Cases

### Valid JSON
```json
null
true
false
42
"hello"
[1, 2, 3]
{"key": "value"}
{"nested": {"objects": [1, 2, 3]}}
```

### Invalid JSON
```json
{key: "value"}           # Keys must be quoted
[1, 2, 3,]               # Trailing commas not allowed
{"a": }                  # Missing value
```

## Implementation Highlights

### Type System Features

**Recursive ADTs**:
```lumina
enum JsonValue {
  Array(List<JsonValue>),              // Self-referential
  Object(List<(string, JsonValue)>)    // Self-referential
}
```

**Generic Types with Monomorphization**:
```lumina
enum Result<T, E> {
  Ok(T),
  Err(E)
}

// Monomorphized to:
// - Result<JsonValue, ParseError>
// - Result<(JsonValue, List<Token>), ParseError>
```

**Pattern Matching**:
```lumina
match parse_value(tokens) {
  Result.Ok((value, remaining)) => Result.Ok(value),
  Result.Err(err) => Result.Err(err)
}
```

### Move Semantics
All values are moved by default, ensuring memory safety without runtime overhead:
```lumina
let tokens = tokenize(input);  // 'input' moved
match parse_value(tokens) {     // 'tokens' moved into function
  Result.Ok(value) => ...       // 'value' moved
}
```

### Tail Recursion
All recursive functions use accumulator-passing style for tail-call optimization:
```lumina
fn tokenize_helper(input: string, pos: int, len: int, acc: List<Token>) -> List<Token> {
  if pos >= len {
    reverse(acc)
  } else {
    // ... process and recurse
    tokenize_helper(input, pos + 1, len, new_acc)
  }
}
```

## Compiler Validation

This project exercises:
1. **Multi-file compilation** - 5 modules with cross-references
2. **Monomorphization** - Generic types instantiated for multiple concrete types
3. **Type inference** - Minimal type annotations
4. **Pattern matching exhaustiveness** - All enum variants covered
5. **Move semantics validation** - No use-after-move errors
6. **Source maps** - Error positions map back to original source

## Performance Characteristics

- **Compilation**: O(n) monomorphization passes
- **Parsing**: O(n) single-pass recursive descent
- **Memory**: O(n) maximum recursion depth = JSON nesting level
- **No GC**: Move semantics eliminate need for garbage collection

## Future Enhancements

- [ ] Unicode escape sequences (`\uXXXX`)
- [ ] Better error recovery
- [ ] Streaming parser for large files
- [ ] JSON Schema validation
- [ ] Pretty-printing with indentation
- [ ] HashMap-based objects (when stdlib provides it)

## License

MIT
