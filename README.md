# parsergen-starter

A modern TypeScript starter for building parsers, REPLs, and language tooling. It ships a PEG-based parser generator, a Lumina reference language pipeline (lexer → parser → semantic analysis → IR → codegen), and an LSP server with diagnostics and editor features.

![npm](https://img.shields.io/npm/v/parsergen-starter?color=blue)
![npm downloads](https://img.shields.io/npm/dm/parsergen-starter)
![MIT License](https://img.shields.io/npm/l/parsergen-starter)
![GitHub release](https://img.shields.io/github/v/release/nyigoro/parsergen-starter)
![Build](https://img.shields.io/github/actions/workflow/status/nyigoro/parsergen-starter/ci.yml?branch=main)

## ✨ Highlights

- PEG grammar compiler with AST output
- Streaming parsing with custom delimiters
- REPL with multiline input, history, AST views, profiling, and clipboard helpers
- Lumina language pipeline (lexer, parser, semantic checks, IR, codegen)
- Project context for multi-file parsing + panic mode recovery
- Lumina LSP server with diagnostics, completion, symbols, rename, references, semantic tokens
- CLI tools for parsing and Lumina workflows

## 📦 Installation

```bash
npm install -g parsergen-starter
# or
pnpm add -D parsergen-starter
```

## ✅ Library Usage

```ts
import { compileGrammar, parseInput } from 'parsergen-starter';

const grammar = `
Start = "hello" _ "world" { return { type: "Greeting", value: "hello world" }; }
_ = [ \\t]+
`;

const parser = compileGrammar(grammar);
const result = parseInput(parser, 'hello world');
console.log(result);
```

## 🌊 Streaming Parse

`parseStream` processes a `ReadableStream<string | Uint8Array>` and yields results per record.

Options:
- `streamDelimiter` (string): record delimiter (default `\n`)
- `streamEncoding` (string): text encoding (default `utf-8`)
- `streamMaxRecordBytes` (number): max bytes per record
- `streamSkipEmpty` (boolean): skip empty records (default `true`)
- `streamTrim` (boolean): trim records before parsing (default `false`)
- `streamTimeoutMs` (number): timeout for entire stream
- `streamAbortSignal` (AbortSignal): external cancellation
- `streamFilter` (function): filter records before parsing

```ts
import { parseStream } from 'parsergen-starter';

const options = { streamDelimiter: '\n\n', streamEncoding: 'utf-8' };
for await (const result of parseStream(parser, stream, options)) {
  console.log(result);
}
```

## 🧪 Tests

```bash
npm test
```

## 🧰 CLI

The package installs three binaries:
- `parsergen` for generic parsing utilities
- `lumina` for the Lumina toolchain
- `lumina-lsp` for editor integration

### `parsergen`

```bash
parsergen --init
parsergen --lumina-build src/main.lm --lumina-out dist/main.js --lumina-target cjs
```

### `lumina`

```bash
lumina repl
lumina compile examples/hello.lm --out dist/hello.js --target esm
lumina check examples/hello.lm
lumina watch examples
```

### REPL

```bash
npm run repl
```

Key commands:
- `.grammar [inline|@file]`
- `.test [inline]`
- `.paste [--no-parse]`
- `.ast on|off|json|tree`
- `.stats`
- `.profile [n]`
- `.watch <file>`
- `.session save|load <file>`

## 🧭 Lumina LSP

Run the server:

```bash
npx lumina-lsp
```

If built locally:

```bash
node dist/bin/lumina-lsp.js
```

### LSP Settings

- `lumina.grammarPath`: path to the grammar (default `src/grammar/lumina.peg`)
- `lumina.maxDiagnostics`: max diagnostics per file (default `200`)
- `lumina.fileExtensions`: file extensions to watch (default `[".lum", ".lumina"]`)
- `lumina.maxIndexFiles`: max files indexed per workspace (default `2000`)
- `lumina.renameConflictMode`: conflict checks (`"all"` or `"exports"`, default `"all"`)
- `lumina.renamePreviewMode`: rename preview output (`"popup"`, `"log"`, `"off"`, default `"popup"`)

Example (VS Code settings):

```json
{
  "lumina.renamePreviewMode": "log",
  "lumina.renameConflictMode": "all"
}
```

## 🚀 Lumina In 3 Minutes

1. Create a file `examples/hello.lm`:

```lumina
fn main() {
  let x: int = 5 + 2;
  return x;
}
```

2. Compile it:

```bash
lumina compile examples/hello.lm --out dist/hello.js --target esm
```

3. Run the output:

```bash
node dist/hello.js
```

## 📦 Imports and Types Example

Create `examples/types.lm`:

```lumina
import { io } from "@std";

type User = { id: int, name: string };

fn main() {
  let name: string = "Ada";
  return name;
}
```

Compile:

```bash
lumina compile examples/types.lm --out dist/types.js --target esm
```

## 🧪 REPL With Custom Grammar

You can start the REPL and load a grammar file directly:

```bash
npm run repl
```

Inside the REPL:

```text
.grammar @examples/lumina.peg
.test
fn main() { return 1; }
.end
```

## 🛟 Troubleshooting

- **`jest` not found**: run `npm install` to ensure dev dependencies are installed.
- **LSP not starting**: verify `lumina-lsp` is on PATH or run `npx lumina-lsp`.
- **No diagnostics**: ensure your workspace contains `.lum`/`.lumina` files and that `lumina.fileExtensions` matches.
- **Grammar not found**: set `lumina.grammarPath` or place the grammar at `src/grammar/lumina.peg`.

## 🤝 Contributing / Development

```bash
npm install
npm run build
npm run lint:check
npm test
```

## 📁 Project Layout

- `src/grammar`: grammar compiler and bundled grammars
- `src/parser`: parser utilities, streaming parse, diagnostics
- `src/repl.ts`: REPL implementation
- `src/lumina`: Lumina lexer, AST, semantic analysis, IR, codegen
- `src/project`: multi-file project context + panic recovery
- `src/lsp`: Lumina language server
- `examples`: sample grammars and Lumina templates
- `tests`: Jest test suite

## 🛠️ Build

```bash
npm run build
```

## 📜 License

MIT
