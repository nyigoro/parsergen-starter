---

````md
# parsergen-starter

A modern starter toolkit for building custom parsers using PEG-style grammars, written in TypeScript. Ideal for building compilers, interpreters, or DSLs with highlighting, AST inspection, and REPL support.

(https://img.shields.io/npm/v/parsergen-starter?color=blue)
(https://img.shields.io/npm/l/parsergen-starter)
(https://img.shields.io/github/actions/workflow/status/nyigoro/parsergen-starter/ci.yml?branch=main)

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
````

## 🚀 Usage

### CLI

```bash
parsergen input.peg
```

You can also launch the REPL:

```bash
parsergen --repl
```

### Programmatic

```ts
import { parse } from 'parsergen-starter';

const ast = parse('2 + 3 * (4 - 1)');
console.log(ast);
```

### Demo (React)

See the demo under the `demo/` folder for a simple browser-based visualizer using React.

## 📁 Example Grammar

```pegjs
Expression
  = head:Term tail:(_ ("+" / "-") _ Term)* {
      return { type: "Expression", head, tail };
    }

Term
  = head:Factor tail:(_ ("*" / "/") _ Factor)* {
      return { type: "Term", head, tail };
    }

Factor
  = "(" _ expr:Expression _ ")" { return expr; }
  / number:[0-9]+ { return { type: "Number", value: parseInt(number.join(""), 10) }; }

_ = [ \t\n\r]*
```

## 🧪 Testing

```bash
npm test
```

Tests live under `tests/`.

## 🛠️ Dev Setup

```bash
pnpm install
pnpm dev
```

Or to build the parser library:

```bash
pnpm build
```

## 📂 Project Structure

```
.
├── src/            → Source code
│   ├── grammar/    → Grammar parser & transformer
│   ├── lexer/      → Tokenizer / Lexer
│   ├── parser/     → PEG parser implementation
│   ├── bin/cli.ts  → CLI entry point
│   └── utils/      → AST, highlighting, formatters
├── demo/           → React demo
├── examples/       → Sample grammar files
├── tests/          → Unit tests
└── dist/           → Built output
```

## 📄 License

MIT © [nyigoro](https://github.com/nyigoro)


