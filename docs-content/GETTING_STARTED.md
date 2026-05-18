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

Try the same core loop in the playground when you are ready to run it.

<div class="docs-playground-card" data-playground-doc-preview="basics" data-preview-size="compact">
  <div class="docs-playground-card-header">
    <p class="docs-playground-card-kicker">Playground preview</p>
    <h3 class="docs-playground-card-title">Functions, bindings, and Run output</h3>
  </div>
  <div class="docs-playground-card-grid">
    <p><strong>What this shows:</strong> a single-source Lumina program with a helper function, local bindings, string output, and the Run tab as the execution surface.</p>
    <p><strong>Try this:</strong> change the `add` function or the printed message, press Run, then open Types to inspect what HM inference learned.</p>
  </div>
  <div class="docs-playground-card-footer">
    <div class="docs-playground-shot" role="img" aria-label="Static preview of the Functions example in the Run tab.">
      <span>Run tab</span>
      <strong>Functions</strong>
      <code>fn add(a: i32, b: i32) -> i32</code>
    </div>
    <a class="docs-playground-open" href="../playground/?example=basics&amp;tab=run" data-playground-link data-playground-example="basics" data-playground-tab="run">Open in Playground</a>
  </div>
</div>

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

## Where to Go Next

<div class="docs-next-grid">
  <a class="docs-next-card" href="USING_LUMINA.md">
    <span>Use Lumina</span>
    <strong>Usage guide</strong>
    <small>Project setup, commands, and daily workflow.</small>
  </a>
  <a class="docs-next-card" href="WHY_LUMINA.md">
    <span>Orientation</span>
    <strong>Why Lumina?</strong>
    <small>The design goals and where Lumina fits.</small>
  </a>
  <a class="docs-next-card" href="WHEN_TO_USE_JS_VS_WASM.md">
    <span>Targets</span>
    <strong>JS vs WASM</strong>
    <small>Choose the right output target for the job.</small>
  </a>
  <a class="docs-next-card" href="CAPABILITIES.md">
    <span>Status</span>
    <strong>Capabilities</strong>
    <small>Current language, runtime, and playground coverage.</small>
  </a>
  <a class="docs-next-card" href="STDLIB.md">
    <span>Reference</span>
    <strong>Stdlib</strong>
    <small>Core modules and browser/runtime helpers.</small>
  </a>
  <a class="docs-next-card" href="ERROR_HANDLING.md">
    <span>Language</span>
    <strong>Error handling</strong>
    <small>Option and Result style flows with `?`.</small>
  </a>
  <a class="docs-next-card" href="NUMERIC_TYPES.md">
    <span>Language</span>
    <strong>Numeric system</strong>
    <small>Integers, floats, and target-aware numeric behavior.</small>
  </a>
</div>
