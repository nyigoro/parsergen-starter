# Getting Started with Lumina

This guide gets you from install to running your first Lumina program.

## 1. Prerequisites

- Node.js 18+ (20+ recommended)
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
lumina compile hello.lm --target cjs --ast-js --out hello.cjs
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
lumina doc "src/**/*.lm" --out docs/API.md
```

## 6. Optional: WASM Quick Run

```bash
lumina compile examples/wasm-hello/math.lm --target wasm --out math.wat
lumina run-wasm math.wasm main
```

Notes:
- `wat2wasm` (from WABT) is required for `.wat` -> `.wasm`.
- WASM backend is currently beta.

## 7. VS Code

The extension lives in `vscode-extension/`.

```bash
cd vscode-extension
npm install
npm run build
```

Then launch extension development host from VS Code.

## 8. Where to Go Next

- Usage guide: `docs/USING_LUMINA.md`
- Capabilities/status: `docs/CAPABILITIES.md`
- Stdlib reference: `docs/STDLIB.md`
- Error handling (`?`): `docs/ERROR_HANDLING.md`
- Numeric system: `docs/NUMERIC_TYPES.md`
