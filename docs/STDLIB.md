# Lumina Standard Library

## String Literals

Lumina supports several string literal forms:

### Regular strings
```lumina
let s = "hello\nworld";
```

Supports escape sequences like `\\n`, `\\t`, `\\r`, `\\uXXXX`, `\\u{1F600}`, `\\x41`.

### Raw strings
```lumina
let path = r"C:\path\to\file";
```

Raw strings do **not** process escape sequences or interpolation.

### Multi-line strings
```lumina
let m = """Hello
World""";
```

Triple-quoted strings can span multiple lines and support interpolation:
```lumina
let name = "Ada";
let msg = """Hello {name}""";
```

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
- Synchronous and non-blocking in Node
- For blocking reads, use `readLineAsync()` or host hooks

**Example:**
```lumina
match io.readLine() {
  Some(line) => io.println(line),
  None => io.println("No input available")
}
```

### readLineAsync() -> Promise<Option<String>>

Async line read. Uses `__luminaStdin` hook first, then Node TTY readline, then browser `prompt()` if available.

**Example:**
```lumina
match await io.readLineAsync() {
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

### substring(s: String, start: Int, end: Int) -> String
Returns a slice of `s` from `start` (inclusive) to `end` (exclusive).

**Notes:**
- Indices are clamped to non-negative integers.
- If `end <= start`, returns `""`.

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

## @std/fs

### readFile(path: String) -> Promise<Result<String, String>>
Reads a UTF-8 file (Node) or fetches text (browser).

### writeFile(path: String, content: String) -> Promise<Result<Void, String>>
Writes a UTF-8 file in Node. Returns an error in browsers.

## @std/vec

### new<T>() -> Vec<T>
Creates an empty vector.

### push<T>(vec: Vec<T>, value: T) -> Void
Appends a value to the end of the vector.

### get<T>(vec: Vec<T>, index: Int) -> Option<T>
Returns `Some(value)` when the index is in bounds, otherwise `None`.

### len<T>(vec: Vec<T>) -> Int
Returns the number of elements in the vector.

### pop<T>(vec: Vec<T>) -> Option<T>
Removes the last element and returns it, or `None` if empty.

### clear<T>(vec: Vec<T>) -> Void
Removes all elements from the vector.

### map<T, U>(vec: Vec<T>, mapper: fn(T) -> U) -> Vec<U>
Transforms each element with `mapper` and returns a new vector.

### filter<T>(vec: Vec<T>, predicate: fn(T) -> Bool) -> Vec<T>
Returns a new vector containing only elements that satisfy `predicate`.

### fold<T, U>(vec: Vec<T>, init: U, folder: fn(U, T) -> U) -> U
Reduces the vector into a single value.

### for_each<T>(vec: Vec<T>, action: fn(T) -> Void) -> Void
Applies `action` to every element.

## @std/hashmap

### new<K, V>() -> HashMap<K, V>
Creates an empty hash map.

### insert<K, V>(map: HashMap<K, V>, key: K, value: V) -> Option<V>
Inserts a key/value pair and returns the previous value if present.

### get<K, V>(map: HashMap<K, V>, key: K) -> Option<V>
Returns the value for a key, or `None` when missing.

### remove<K, V>(map: HashMap<K, V>, key: K) -> Option<V>
Removes a key and returns its value, or `None` when missing.

### contains_key<K, V>(map: HashMap<K, V>, key: K) -> Bool
Checks if the map contains the key.

### len<K, V>(map: HashMap<K, V>) -> Int
Returns the number of entries.

### clear<K, V>(map: HashMap<K, V>) -> Void
Removes all entries from the map.

### keys<K, V>(map: HashMap<K, V>) -> Vec<K>
Returns a vector of keys.

### values<K, V>(map: HashMap<K, V>) -> Vec<V>
Returns a vector of values.

## @std/hashset

### new<T>() -> HashSet<T>
Creates an empty set.

### insert<T>(set: HashSet<T>, value: T) -> Bool
Inserts a value and returns true if it was newly added.

### contains<T>(set: HashSet<T>, value: T) -> Bool
Checks whether the set contains a value.

### remove<T>(set: HashSet<T>, value: T) -> Bool
Removes a value and returns true if it existed.

### len<T>(set: HashSet<T>) -> Int
Returns the number of values.

### clear<T>(set: HashSet<T>) -> Void
Removes all values from the set.

### values<T>(set: HashSet<T>) -> Vec<T>
Returns a vector of all values.

## @std/channel

Message-passing channels built on Web Platform `MessageChannel`.

### new<T>() -> Channel<T>
Creates a new channel and returns a `Channel<T>` struct with `.sender` and `.receiver`.

### bounded<T>(capacity: Int) -> Channel<T>
Creates a bounded channel with a maximum number of in-flight messages.

**Capacity rules:**
- `capacity < 0` behaves like `new()` (unbounded).
- `capacity = 0` is rendezvous style: sends only succeed when a receiver is waiting.
- `capacity > 0` limits the number of buffered messages.

### send<T>(sender: Sender<T>, value: T) -> Bool
Sends a value. Returns `true` if the message was enqueued, `false` if the sender is closed.

### recv<T>(receiver: Receiver<T>) -> Promise<Option<T>>
Waits for the next message. Resolves to `Some(value)` or `None` if the channel is closed and empty.

### try_recv<T>(receiver: Receiver<T>) -> Option<T>
Attempts to receive a message without waiting.

### close_sender<T>(sender: Sender<T>) -> Void
Closes the sender. The receiver will eventually return `None` after draining messages.

### close_receiver<T>(receiver: Receiver<T>) -> Void
Closes the receiver and releases its MessagePort.

### is_available() -> Bool
Returns `true` if `MessageChannel` is available in the current runtime.

### WASM host bindings
When running WASM via `loadWASM`, the host exposes:
- `env.channel_is_available() -> i32`
- `env.channel_new(capacity: i32) -> i32`
- `env.channel_send(id: i32, value: i32) -> i32`
- `env.channel_try_recv_or(id: i32, fallback: i32) -> i32`
- `env.channel_close_sender(id: i32) -> void`
- `env.channel_close_receiver(id: i32) -> void`

**Example:**
```lumina
import { channel } from "@std";

fn main() -> void {
  let ch = channel.new<i32>();
  let sender = ch.sender;
  let receiver = ch.receiver;

  channel.send(sender, 42);

  match await channel.recv(receiver) {
    Some(value) => io.println(str.from_int(value)),
    None => io.println("closed")
  }
}
```
