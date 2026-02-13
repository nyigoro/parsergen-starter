# Lumina Standard Library

## @std/io

### print(s: String) -> Unit
Prints without a newline.

### println(s: String) -> Unit
Prints with a newline.

### eprint(s: String) -> Unit
Prints to stderr without a newline.

### eprintln(s: String) -> Unit
Prints to stderr with a newline.

### readLine() -> Option<String>

Reads a line from standard input.

**Platform behavior:**
- **Browser**: Uses `prompt()` if available
- **Node.js**: Non-blocking read from `process.stdin` (returns `None` if no data buffered)
- **Custom hosts**: Provide `globalThis.__luminaReadLine()` for blocking/async reads

**Limitations:**
- Currently synchronous and non-blocking in Node
- For true blocking stdin, use host hooks or wait for async/await support
- Future: Will become `readLine() -> Promise<Option<String>>` when async is added

**Example:**
```lumina
match io.readLine() {
  Some(line) => io.println(line),
  None => io.println("No input available")
}
```

## @std/str

### length(s: String) -> Int
Returns the length of a string.

### concat(a: String, b: String) -> String
Concatenates two strings.

**Edge cases:**
- `concat("", "")` returns `""`
- `concat("a", "")` returns `"a"`

### split(s: String, sep: String) -> List<String>
Splits a string by a separator.

**Edge cases (matches JS behavior):**
- `split("", ",")` → `[""]`
- `split("abc", "")` → `["a", "b", "c"]`
- `split("abc", ",")` → `["abc"]`
- `split("a,,b", ",")` → `["a", "", "b"]`

### trim(s: String) -> String
Removes leading and trailing whitespace.

**Edge cases:**
- `trim("")` → `""`
- `trim("   ")` → `""`
- `trim("abc")` → `"abc"`
- `trim("  a b  ")` → `"a b"`

### contains(haystack: String, needle: String) -> Bool
Checks if `needle` occurs within `haystack`.

**Edge cases (matches JS behavior):**
- `contains("abc", "")` → `true`
- `contains("", "x")` → `false`
- `contains("", "")` → `true`

## @std/math

### abs(n: Int) -> Int
Absolute value for integers.

### min(a: Int, b: Int) -> Int
### max(a: Int, b: Int) -> Int
Minimum / maximum for integers.

### absf(n: Float) -> Float
### minf(a: Float, b: Float) -> Float
### maxf(a: Float, b: Float) -> Float
Floating‑point variants (temporary until overloading).

### sqrt(n: Float) -> Float
Square root.

### pow(base: Float, exp: Float) -> Float
Power function.

### floor(n: Float) -> Int
### ceil(n: Float) -> Int
### round(n: Float) -> Int
Rounding helpers (return integers).

### pi: Float
### e: Float
Math constants.
