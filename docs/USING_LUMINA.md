# Using Lumina

This guide documents daily Lumina usage: CLI workflow, language patterns, and build targets.

## CLI Workflow

Check program types/semantics:

```bash
lumina check src/main.lm
```

Compile to JavaScript:

```bash
lumina compile src/main.lm --target esm --out dist/main.js
```

Compile to CommonJS:

```bash
lumina compile src/main.lm --target cjs --ast-js --out dist/main.cjs
```

Compile to WebAssembly (beta):

```bash
lumina compile src/main.lm --target wasm --out dist/main.wat
lumina run-wasm dist/main.wasm main
```

Format, lint, and generate docs:

```bash
lumina fmt "src/**/*.lm"
lumina lint "src/**/*.lm"
lumina doc "src/**/*.lm" --out docs/API.md
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

Index safely (`Option<T>`):

```lumina
match nums[2] {
  Some(x) => io.println(str.from_int(x)),
  None => io.println("out of bounds")
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
  "target": "esm",
  "entries": ["src/main.lm"],
  "fileExtensions": [".lm", ".lumina"]
}
```

Schema: `lumina.config.schema.json`

## Recommended CI Commands

```bash
npm run lint
npm test
npm run build
```

## Reference Docs

- `docs/CAPABILITIES.md`
- `docs/STDLIB.md`
- `docs/ERROR_HANDLING.md`
- `docs/NUMERIC_TYPES.md`
- `docs/CONST_GENERICS.md`
