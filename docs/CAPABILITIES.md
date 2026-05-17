# Lumina Capabilities

## Playground

- The standalone playground is a single-source, editor-first workbench for writing, checking, running, inspecting output, and sharing Lumina snippets.
- The playground editor uses a Lezer-backed Lumina language path for structured tokenization and future editor-language features.
- Compile diagnostics have an educational Explain flow with severity, code, location, plain-language context, why-it-happens notes, and fix guidance.
- The Types tab displays Hindley-Milner inference results after Check or Run.
- Type inspection includes declaration rows with name, kind, and type, plus expression rows with source preview, inferred type, and line/column position.
- Expression type rows jump the editor to the inferred expression location, keep a selected-row marker, and can be filtered by calls, literals, or value references.
- Type info can be copied as JSON for debugging, docs, or tooling experiments.
- The WASM tab presents binary size, build timing, section breakdown, copy/download actions, and a scrollable WAT viewer.
- The examples browser is organized as a curated language tour across Language Core, Type System, Reactive UI, Web Native, and Advanced examples.
- Example entries carry intentional target/tab defaults so UI examples open in Preview, type-heavy examples open in Types, and WASM examples open in WebAssembly output.
- Embed mode is available with `?embed=1` for docs, tutorials, and iframe use, with compact chrome and an Open in Playground action that preserves source, example, target, and tab state.
- The docs site now embeds selected live playground examples so readers can run core syntax, stdlib, UI, and type-system examples in context.
- Playground settings persist locally for theme, editor font size, and tab size, and apply immediately in both full and embed mode.
- UI Preview and Run now use explicit empty/loading/success/error states, isolated runtime sessions, and compact statusbar wording so compile, runtime, and preview outcomes stay distinct.
