# Using Lumina

This guide documents daily Lumina usage: CLI workflow, language patterns, and build targets.

## CLI Workflow

Check program types/semantics:

```bash
lumina check src/main.lm
```

Compile to JavaScript:

```bash
lumina compile src/main.lm --target js --module esm --out dist/main.js
```

Compile to CommonJS:

```bash
lumina compile src/main.lm --target js --module cjs --out dist/main.cjs
```

Compile to `wasm-web`:

```bash
lumina compile src/main.lm --target wasm-web --out dist/main.wasm
lumina run-wasm dist/main.wasm main
```

Compile to `wasm-standalone`:

```bash
lumina compile src/main.lm --target wasm-standalone --out dist/kernel.wasm
```

Optional debug WAT:

```bash
lumina compile src/main.lm --target wasm-web --out dist/main.wasm --emit-wat
```

Format, lint, and generate docs:

```bash
lumina fmt "src/**/*.lm"
lumina lint "src/**/*.lm"
lumina doc "src/**/*.lm" --out API.md
```

## Core Language Patterns

## Types and Inference

```lumina
let a = 42;        // i32
let b = 3.14;      // f64
let c = 255u8;     // explicit
let d = 2.0f32;    // explicit
```

## Collections

Array literals:

```lumina
let nums = [1, 2, 3, 4, 5];
```

Direct indexing is for indexes that must exist. It returns the element type
directly and fails loudly when the index is out of bounds:

```lumina
let third = nums[2]; // 3
```

Use `get(index)` when the index might be missing:

```lumina
match nums.get(10) {
  Some(x) => io.println(str.from_int(x)),
  None => io.println("out of bounds")
}
```

For loop indexes are named explicitly:

```lumina
for index in 0..nums.len() {
  match nums.get(index) {
    Some(x) => io.println(str.from_int(x)),
    None => io.println("out of bounds")
  }
}
```

Method syntax:

```lumina
let v = vec.new();
v.push(10);
v.push(20);
io.println(str.from_int(v.len()));
```

Iterator-style helpers:

```lumina
let doubled = v.map(|x| x * 2);
let sum = v.fold(0, |acc, x| acc + x);
```

## Keyed UI Lists

For reactive UI lists, use a stable key when rows can move or preserve local
state:

```lumina
render.element("ol", render.props_class("task-list"), [
  for (row, index in rows key row.id) =>
    render.element("li", props { key: row.id }, [
      render.text(row.label),
      render.text(index)
    ])
])
```

Keys are string or number identity values. Duplicate sibling keys fail loudly.
During SSR hydration, Lumina uses the emitted hydration key to adopt and move the
existing DOM node instead of rebuilding the row.

## Error Handling (`?`)

```lumina
fn load_user(path: string) -> Result<string, string> {
  let content = fs.read_file(path)?;
  Ok(content)
}
```

## Traits

```lumina
trait Printable {
  fn print(self: Self) -> void;
}
```

Implement and call with method syntax:

```lumina
impl Printable for User {
  fn print(self: Self) -> void {
    io.println(self.name);
  }
}

let u = User { name: "Alice" };
u.print();
```

## Strings

- Interpolation: `"Hello {name}"`
- Slicing: `s[0..5]`, `s[..5]`, `s[5..]`
- Raw: `r"C:\path\to\file"`
- Multiline: `"""line1\nline2"""`

## Concurrency (Runtime APIs)

Use thread/channel modules from `@std`:

```lumina
import { thread, channel } from "@std";
```

See tests/examples for current supported patterns:

- `tests/runtime-stdlib-thread.test.ts`
- `tests/runtime-stdlib-channel.test.ts`
- `tests/runtime-thread-channel.test.ts`

## Project Configuration

Use `lumina.config.json` for defaults:

```json
{
  "grammarPath": "src/grammar/lumina.peg",
  "outDir": "dist",
  "target": "js",
  "module": "esm",
  "entries": ["src/main.lm"],
  "fileExtensions": [".lm", ".lumina"]
}
```

Schema: `lumina.config.schema.json`

Preferred targets are `js`, `wasm-web`, and `wasm-standalone`. Legacy aliases like `esm`, `cjs`, and `wasm` still work for compatibility.

## Recommended CI Commands

```bash
npm run lint
npm test
npm run build
```

## Reference Docs

- [Capabilities](CAPABILITIES.md)
- [Stdlib](STDLIB.md)
- [Error handling](ERROR_HANDLING.md)
- [Numeric types](NUMERIC_TYPES.md)
- [Const generics](CONST_GENERICS.md)
