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

### readDir(path: String) -> Promise<Result<List<String>, String>>
Returns directory entry names for `path` (Node). Returns `Err` in browsers.

### metadata(path: String) -> Promise<Result<FileMetadata, String>>
Returns metadata for a file path (Node):
- `isFile: Bool`
- `isDirectory: Bool`
- `size: Int`
- `modifiedMs: Int`

### exists(path: String) -> Promise<Bool>
Returns whether `path` exists.

### mkdir(path: String, recursive: Bool) -> Promise<Result<Void, String>>
Creates directories for `path` (Node). Returns `Err` in browsers.

### removeFile(path: String) -> Promise<Result<Void, String>>
Removes a file path (Node). Returns `Err` in browsers.

## @std/time

### nowMs() -> Int
Unix timestamp in milliseconds (`Date.now()`).

### nowIso() -> String
Current UTC timestamp in ISO-8601 format.

### instantNow() -> Int
Monotonic-ish clock for measuring durations (`performance.now()` when available).

### elapsedMs(since: Int) -> Int
Returns elapsed milliseconds since `instantNow()` value.

### sleep(ms: Int) -> Promise<Void>
Async sleep/delay helper.

## @std/regex

### isValid(pattern: String, flags: String) -> Bool
Returns whether a regex pattern compiles.

### test(pattern: String, text: String, flags: String) -> Result<Bool, String>
Returns `Ok(true/false)` when valid, `Err` when pattern/flags are invalid.

### find(pattern: String, text: String, flags: String) -> Option<String>
Returns first match as `Some`, otherwise `None`.

### findAll(pattern: String, text: String, flags: String) -> Result<List<String>, String>
Returns all matches (global mode), or `Err` when invalid.

### replace(pattern: String, text: String, replacement: String, flags: String) -> Result<String, String>
Returns replaced string, or `Err` when invalid.

## @std/crypto

All functions rely on Web Crypto (`globalThis.crypto.subtle`) with Node fallback.

### isAvailable() -> Promise<Bool>
Returns whether crypto support is available.

### sha256(value: String) -> Promise<Result<String, String>>
Returns lowercase hex SHA-256 digest.

### hmacSha256(key: String, value: String) -> Promise<Result<String, String>>
Returns lowercase hex HMAC-SHA256 signature.

### randomBytes(length: Int) -> Promise<Result<List<Int>, String>>
Returns `length` random bytes (`0..255`).

### randomInt(min: Int, max: Int) -> Promise<Result<Int, String>>
Returns a random integer within `[min, max]`.

### aesGcmEncrypt(key: String, plaintext: String) -> Promise<Result<String, String>>
Encrypts with AES-GCM and returns base64 payload (`iv + ciphertext`).

### aesGcmDecrypt(key: String, payload: String) -> Promise<Result<String, String>>
Decrypts base64 payload from `aesGcmEncrypt`.

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

## @std/thread

Worker-based threading API for Node (via `worker_threads`) and Web Worker hosts.

### is_available() -> Bool
Returns `true` when worker threading is available in the runtime.

### spawn(task: fn() -> T) -> ThreadHandle<T>
Spawns a local task handle from a zero-arg function and returns a joinable handle.

### join(handle: ThreadHandle<T>) -> Promise<Result<T, String>>
Waits for local task completion and returns `Ok(value)` or `Err(message)`.

### spawn_worker(specifier: String) -> Promise<Result<Thread, String>>
Spawns a worker from a module specifier/path.

### post(thread: Thread, value: Any) -> Bool
Posts a message to the worker.

### recv(thread: Thread) -> Promise<Option<Any>>
Waits for the next message from the worker, or `None` after termination/close.

### try_recv(thread: Thread) -> Option<Any>
Non-blocking poll for worker messages.

### terminate(thread: Thread) -> Promise<Void>
Terminates the worker.

### join_worker(thread: Thread) -> Promise<Int>
Waits for worker exit and returns its exit code.

## @std/sync

Synchronization primitives for async/threaded coordination.

### mutex_new() -> Mutex
Creates a new unlocked mutex.

### mutex_acquire(mutex: Mutex) -> Promise<Bool>
Waits until the mutex is acquired.

### mutex_try_acquire(mutex: Mutex) -> Bool
Attempts to acquire immediately.

### mutex_release(mutex: Mutex) -> Bool
Releases the mutex. Returns `false` if it was not locked.

### mutex_is_locked(mutex: Mutex) -> Bool
Returns lock state.

### semaphore_new(permits: Int) -> Semaphore
Creates a semaphore with initial permits.

### semaphore_acquire(semaphore: Semaphore) -> Promise<Bool>
Waits for a permit.

### semaphore_try_acquire(semaphore: Semaphore) -> Bool
Attempts to acquire a permit immediately.

### semaphore_release(semaphore: Semaphore, count: Int) -> Void
Releases one or more permits.

### semaphore_available(semaphore: Semaphore) -> Int
Returns currently available permits.

### atomic_i32_new(initial: Int) -> AtomicI32
Creates an atomic 32-bit integer.

### atomic_i32_is_available() -> Bool
Returns whether `SharedArrayBuffer` + `Atomics` are available.

### atomic_i32_load(atomic: AtomicI32) -> Int
Loads current value.

### atomic_i32_store(atomic: AtomicI32, value: Int) -> Int
Stores and returns the written value.

### atomic_i32_add(atomic: AtomicI32, delta: Int) -> Int
Adds and returns the previous value.

### atomic_i32_sub(atomic: AtomicI32, delta: Int) -> Int
Subtracts and returns the previous value.

### atomic_i32_compare_exchange(atomic: AtomicI32, expected: Int, replacement: Int) -> Int
CAS operation returning the previous value.
