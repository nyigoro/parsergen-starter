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
  - Structs/enums with match + member access
  - Hex/binary/underscored numeric literals
  - IR visualization via `--debug-ir`

## 📦 Installation

```bash
npm install -g parsergen-starter
# or
pnpm add -D parsergen-starter
```

## 🚀 Getting Started (Lumina)

Lumina is a full toolchain: multi-file parsing, semantic checks, IR optimization, and codegen.

## 🧪 Tests

```bash
npm test
```

## 🧰 CLI

The package installs two binaries:
- `lumina` for the Lumina toolchain (including grammar tooling)
- `lumina-lsp` for editor integration

### `lumina`

```bash
lumina repl
lumina compile examples/hello.lm --out dist/hello.js --target esm
lumina compile examples/hello.lm --sourcemap
lumina compile examples/hello.lm --debug-ir
lumina compile examples/hello.lm --profile-cache
lumina check examples/hello.lm
lumina watch examples
lumina compile examples/hello.lm --dry-run
lumina compile --list-config
lumina watch "examples/**/*.lm"
lumina init
lumina grammar mylang.peg --test "hello world"

Parser generator tooling now lives under `lumina grammar`.

`--profile-cache` also prints dependency graph stats.
```

### `lumina.config.json`

You can configure defaults for the Lumina CLI:

```json
{
  "grammarPath": "src/grammar/lumina.peg",
  "outDir": "dist",
  "target": "esm",
  "entries": ["examples/hello.lm"],
  "watch": ["examples/hello.lm"],
  "fileExtensions": [".lm", ".lumina"],
  "cacheDir": ".lumina-cache"
}
```

Schema: `lumina.config.schema.json`

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
- Go-to-Definition, Find References, Rename, and Semantic Tokens

Example (VS Code settings):

```json
{
  "lumina.renamePreviewMode": "log",
  "lumina.renameConflictMode": "all"
}
```

## 🧭 Lumina By Example

Create two files:

`examples/types.lm`:

```lumina
import { io } from "@std";

struct User { id: int, name: string }
enum Result { Ok(int), Err(string) }

fn main() {
  let user: User = match Ok(1) {
    Ok(value) => User,
    Err(msg) => User,
  };
  return user.id;
}
```

`examples/main.lm`:

```lumina
import { main } from "./types.lm";

fn entry() {
  return main();
}
```

Compile the project:

```bash
lumina compile examples/main.lm --out dist/main.js --target esm
```

### Dependency Graph + Resilient Parsing

Lumina maintains a dependency graph for multi-file projects and uses panic-mode recovery so a single syntax error does not stop the entire analysis pass.

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

## 📦 Packaging Check

Before publishing, run:

```bash
npm run pack:check
```

## 📜 License

MIT
