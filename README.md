# Lumina (v0.4.3)

A modern functional language with async/await, type inference, and package management.

![npm](https://img.shields.io/npm/v/lumina-lang?color=blue)
![npm downloads](https://img.shields.io/npm/dm/lumina-lang)
![MIT License](https://img.shields.io/npm/l/lumina-lang)
![GitHub release](https://img.shields.io/github/v/release/nyigoro/lumina-lang)
![Build](https://img.shields.io/github/actions/workflow/status/nyigoro/lumina-lang/ci.yml?branch=main)

## ✨ Highlights

- PEG grammar compiler with AST output
- Streaming parsing with custom delimiters
- REPL with multiline input, history, AST views, profiling, and clipboard helpers
- Lumina language pipeline (lexer, parser, semantic checks, IR, codegen)
- Project context for multi-file parsing + panic mode recovery
- Lumina LSP server with diagnostics, completion, symbols, rename, references, semantic tokens
- CLI tools for parsing and Lumina workflows
  - Industry-standard numeric types (i8-i128, u8-u128, f32, f64)
  - Ergonomic error handling with `?` operator for Result propagation
  - Structs/enums with match + member access
  - Hex/binary/underscored numeric literals
  - IR visualization via `--debug-ir`

## ⚡ Performance (WASM)

Lumina's WebAssembly backend delivers **~100x performance improvements** for compute‑intensive code:

```bash
# Compile to WASM
lumina compile examples/wasm-hello/math.lm --target wasm --out math.wat

# Run
lumina run-wasm math.wasm fibonacci 35
# WASM: 54ms

# Compare to JS
lumina compile examples/wasm-hello/math.lm --out math.cjs --target cjs --ast-js
node -e "const vm=require('node:vm'); const fs=require('node:fs'); const code=fs.readFileSync('./math.cjs','utf8'); const ctx={module:{exports:{}}}; vm.createContext(ctx); vm.runInContext(code, ctx); console.time('JS'); ctx.fibonacci(35); console.timeEnd('JS');"
# JS: 5.5s

# 🚀 ~100x faster!
```

## 📦 Installation

```bash
npm install -g lumina-lang
# or
pnpm add -D lumina-lang
```

## 🚀 Getting Started (Lumina)

Lumina is a full toolchain: parser, semantic checks, HM inference, IR optimization, JS/WASM codegen, and LSP.

Create `hello.lm`:

```lumina
import { io, str } from "@std";

fn main() -> void {
  let name = "Lumina";
  io.println("Hello {name}");
  io.println(str.concat("2 + 3 = ", str.from_int(2 + 3)));
}
```

Compile and run:

```bash
lumina check hello.lm
lumina compile hello.lm --target cjs --ast-js --out hello.cjs
node hello.cjs
```

For a full walkthrough, read `docs/GETTING_STARTED.md`.

## 🧪 Tests

```bash
npm test
```

## 📚 Documentation

- `docs/GETTING_STARTED.md` — installation and first program
- `docs/USING_LUMINA.md` — CLI + language usage guide
- `docs/LEARNING_PATH.md` — lesson-based learning track
- `docs/lessons/` — detailed hands-on tutorials
- `docs/MIGRATION_FROM_TS_JS.md` — TypeScript/JavaScript migration playbook
- `docs/ECOSYSTEM.md` — ecosystem status and contribution model
- `docs/CAPABILITIES.md` — feature/status matrix
- `docs/STDLIB.md` — standard library reference
- `docs/DOCS_MAINTENANCE.md` — how to keep docs current as features land

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
lumina compile examples/hello.lm --recovery
lumina compile --list-config
lumina watch "examples/**/*.lm"
lumina fmt "examples/**/*.lm"
lumina fmt "examples/**/*.lm" --check
lumina lint "examples/**/*.lm"
lumina doc "examples/**/*.lm" --out docs/API.md
lumina doc "examples/**/*.lm" --public-only
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
  "cacheDir": ".lumina-cache",
  "recovery": true
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
- `lumina.recovery`: enable resilient parsing for CLI `compile/check/watch` (default `false`)
- Go-to-Definition, Find References, Rename, and Semantic Tokens

Example (VS Code settings):

```json
{
  "lumina.renamePreviewMode": "log",
  "lumina.renameConflictMode": "all"
}
```

### VS Code Extension (Advanced)

A dedicated VS Code extension is available in `vscode-extension/` with:
- language registration (`.lum`, `.lumina`, `.lm`)
- LSP client integration
- inlay hints
- quick-fix and refactor code actions
- compile/run/format commands

Build locally:

```bash
cd vscode-extension
npm install
npm run build
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

### Local Type Inference

```lumina
fn main() {
  let x = 42;
  let y: int = 10;
  return x + y;
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
