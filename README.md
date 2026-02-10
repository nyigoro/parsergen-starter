# parsergen-starter

A modern starter toolkit for building custom parsers using PEG-style grammars, written in TypeScript. Ideal for building compilers, interpreters, or DSLs with highlighting, AST inspection, and REPL support.

![npm](https://img.shields.io/npm/v/parsergen-starter?color=blue)
![MIT License](https://img.shields.io/npm/l/parsergen-starter)
![Build](https://img.shields.io/github/actions/workflow/status/nyigoro/parsergen-starter/ci.yml?branch=main)

## ✨ Features

- ⚡ PEG-style grammar parser with AST output
- 🎨 Syntax highlighting (terminal + browser)
- 🧪 Unit test support (Jest)
- 🧑‍💻 REPL mode for quick testing
- 🔧 CLI for parsing and inspecting grammar files
- 📦 Exportable library (CJS + ESM)
- 📁 Example grammar + test files included

## 📦 Installation

```bash
npm install -g parsergen-starter
# or
pnpm add -D parsergen-starter
```

## ✅ Usage

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
The record delimiter is configurable with `streamDelimiter` (default: `\n`).
You can also set `streamEncoding` (default: `utf-8`) when decoding `Uint8Array` chunks.

Streaming options:
- `streamDelimiter` (string): record delimiter (default `\n`)
- `streamEncoding` (string): text encoding (default `utf-8`)
- `streamMaxRecordBytes` (number): max bytes per record
- `streamSkipEmpty` (boolean): skip empty records (default `true`)
- `streamTrim` (boolean): trim records before parsing (default `false`)
- `streamTimeoutMs` (number): timeout for entire stream
- `streamAbortSignal` (AbortSignal): external cancellation

```ts
import { parseStream } from 'parsergen-starter';

const options = { streamDelimiter: '\n\n', streamEncoding: 'utf-8' };
for await (const result of parseStream(parser, stream, options)) {
  console.log(result);
}
```
