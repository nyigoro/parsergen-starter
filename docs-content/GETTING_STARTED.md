# Getting Started with Lumina

This guide gets you from install to running your first Lumina program.

## 1. Prerequisites

- Node.js 22.17.0+
- npm, pnpm, or yarn

## 2. Install

Global install:

```bash
npm install -g lumina-lang
```

Project-local install:

```bash
npm install -D lumina-lang
```

If installed locally, run commands with `npx lumina ...`.

## 3. Create Your First Program

Create `hello.lm`:

```lumina
import { io, str } from "@std";

fn main() -> void {
  let lang = "Lumina";
  io.println("Hello {lang}");
  io.println(str.concat("5 * 6 = ", str.from_int(5 * 6)));
}
```

## 4. Validate, Compile, Run

```bash
lumina check hello.lm
lumina compile hello.lm --target js --module cjs --out hello.cjs
node hello.cjs
```

Expected output:

```text
Hello Lumina
5 * 6 = 30
```

## 5. Useful Next Commands

```bash
lumina fmt "src/**/*.lm"
lumina lint "src/**/*.lm"
lumina doc "src/**/*.lm" --out API.md
```

## 6. Optional: WASM Quick Run

```bash
lumina compile examples/wasm-hello/math.lm --target wasm-web --out math.wasm
lumina run-wasm math.wasm main
```

Notes:
- Lumina now emits `.wasm` directly.
- Add `--emit-wat` when you want a debug `.wat` sidecar.
- Use `--target wasm-standalone` for strict import-light modules that stay inside the standalone-supported runtime surface.

## 7. VS Code

The extension lives in [vscode-extension/](https://github.com/nyigoro/lumina-lang/tree/main/vscode-extension).

```bash
cd vscode-extension
npm install
npm run build
```

Then launch extension development host from VS Code.

## 8. Where to Go Next

- [Usage guide](USING_LUMINA.md)
- [Why Lumina?](WHY_LUMINA.md)
- [When to use JS vs WASM](WHEN_TO_USE_JS_VS_WASM.md)
- [Capabilities/status](CAPABILITIES.md)
- [Stdlib reference](STDLIB.md)
- [Error handling (`?`)](ERROR_HANDLING.md)
- [Numeric system](NUMERIC_TYPES.md)
