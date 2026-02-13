# JSON Parser Architecture

## Module Dependency Graph

```
main.lm
  ├─→ parser.lm
  │     ├─→ types.lm (JsonValue, Token, ParseError, Result, List)
  │     └─→ lexer.lm
  │           └─→ types.lm (Token, List)
  ├─→ stringify.lm
  │     └─→ types.lm (JsonValue, List)
  └─→ types.lm (Result, Option, ParseError)
```

## Data Flow Pipeline

```
String Input
    ↓
[Lexer: tokenize]
    ↓
List<Token>
    ↓
[Parser: parse_value]
    ↓
Result<JsonValue, ParseError>
    ↓
[Stringify: stringify]
    ↓
String Output
```

## Type Relationships

```
JsonValue
  ├─ Null
  ├─ Bool(bool)
  ├─ Number(float)
  ├─ String(string)
  ├─ Array(List<JsonValue>)     ← Recursive
  └─ Object(List<(string, JsonValue)>)  ← Recursive

Token
  ├─ LeftBrace / RightBrace
  ├─ LeftBracket / RightBracket
  ├─ Colon / Comma
  ├─ String(string)
  ├─ Number(float)
  ├─ True / False
  └─ Null

Result<T, E>
  ├─ Ok(T)
  └─ Err(E)

List<T>
  ├─ Nil
  └─ Cons(T, List<T>)           ← Recursive
```

## Function Call Graph

### Main REPL Loop
```
main()
  └─→ repl()
        ├─→ io.readLine() → Option<string>
        └─→ process_input(input)
              ├─→ parse(input) → Result<JsonValue, ParseError>
              │     └─→ tokenize(input) → List<Token>
              │           └─→ tokenize_helper() [recursive]
              │                 ├─→ tokenize_string() [recursive]
              │                 └─→ tokenize_number() [recursive]
              │     └─→ parse_value() → Result<(JsonValue, List<Token>), ParseError>
              │           ├─→ parse_array() [recursive]
              │           └─→ parse_object() [recursive]
              ├─→ stringify(value) → string
              │     ├─→ stringify_array() [recursive]
              │     └─→ stringify_object() [recursive]
              └─→ format_error(error) → string
```

## Memory Layout

### Input Processing
```
"{"name": "Lumina"}"
       ↓ (move)
tokenize(input)
       ↓ (move)
[Token.LeftBrace, Token.String("name"), Token.Colon, Token.String("Lumina"), Token.RightBrace]
       ↓ (move)
parse_value(tokens)
       ↓ (move)
JsonValue.Object(List.Cons(("name", JsonValue.String("Lumina")), List.Nil))
```

### No Copying - All Moves
- Lexer consumes input string
- Parser consumes token list
- Stringify consumes JsonValue
- No GC, no reference counting
- Predictable performance

## Algorithmic Complexity

### Lexer: O(n)
```
tokenize_helper(input, pos, len, acc)
  - Single character-by-character scan
  - Tail-recursive with accumulator
  - Linear in input length
```

### Parser: O(n)
```
parse_value(tokens)
parse_array(tokens, acc)
parse_object(tokens, acc)
  - Single pass over token list
  - Tail-recursive with accumulators
  - Linear in number of tokens
```

### Stringify: O(n)
```
stringify(value)
stringify_array_items(items, first)
stringify_object_pairs(pairs, first)
  - Single traversal of AST
  - Tail-recursive
  - Linear in AST size
```

### Overall: O(n)
- No backtracking
- Single-pass algorithms
- Optimal for streaming

## Error Handling Strategy

### Error Propagation
```
parse(input) → Result<JsonValue, ParseError>
  ├─ Result.Ok(value) → Happy path
  └─ Result.Err(error) → Error path
       ├─ UnexpectedToken(token, position)
       ├─ UnexpectedEof
       ├─ InvalidNumber(string)
       ├─ InvalidString(string)
       └─ UnexpectedChar(char, position)
```

### Error Context
- Position tracking throughout parsing
- Descriptive error messages
- No panic/crash - all errors handled
- User-friendly formatting

## Monomorphization Examples

### Generic Function Instances
```lumina
// Original generic
fn reverse<T>(list: List<T>) -> List<T>

// Generated instances
fn reverse_Token(list: List<Token>) -> List<Token>
fn reverse_JsonValue(list: List<JsonValue>) -> List<JsonValue>
fn reverse_Pair(list: List<(string, JsonValue)>) -> List<(string, JsonValue)>
```

### Generic Type Instances
```lumina
// Original generic
enum Result<T, E> { Ok(T), Err(E) }

// Generated instances
enum Result_JsonValue_ParseError { Ok(JsonValue), Err(ParseError) }
enum Result_Tuple_ParseError { Ok((JsonValue, List<Token>)), Err(ParseError) }
```

## Testing Strategy

### Unit Tests (Planned)
- `test_tokenize()` - Lexer correctness
- `test_parse_primitives()` - null, bool, number, string
- `test_parse_arrays()` - Empty, single, multiple elements
- `test_parse_objects()` - Empty, single, multiple pairs
- `test_parse_nested()` - Deep nesting
- `test_stringify_roundtrip()` - parse ∘ stringify = id

### Integration Tests
- REPL workflow
- Error message formatting
- Multi-line input handling
- Edge cases (empty input, whitespace)

### Property-Based Tests (Future)
- Roundtrip: `stringify(parse(json)) ≡ json`
- Idempotence: `parse(stringify(parse(json))) ≡ parse(json)`
- Error preservation: Invalid input always produces error

## Performance Benchmarks (Planned)

### Metrics to Measure
1. Compilation time vs input size
2. Monomorphization overhead
3. Parse throughput (MB/s)
4. Memory usage (peak RSS)
5. Binary size after compilation

### Expected Results
- Compilation: Linear in code size
- Parse: 10-100 MB/s (depends on JSON structure)
- Memory: O(n) with small constant
- Binary: 100-500 KB (with monomorphization)

## Extension Points

### Easy Additions
- [ ] Whitespace normalization in stringify
- [ ] Custom error messages per error type
- [ ] JSON validation mode (parse without AST)

### Medium Complexity
- [ ] Unicode escape sequences (`\uXXXX`)
- [ ] Streaming parser (for large files)
- [ ] Pretty-printing with indentation
- [ ] Comments support (non-standard)

### Advanced Features
- [ ] JSON Schema validation
- [ ] JSONPath queries
- [ ] JSON Patch (RFC 6902)
- [ ] JSON Merge Patch (RFC 7386)

---

**Last Updated**: 2025-02-12
**Lumina Version**: 0.1.0
**Status**: Implementation Complete ✅
