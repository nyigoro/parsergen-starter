# Lumina Editor Integration

Lumina ships a standard LSP server. Any editor with LSP support gets:

- diagnostics
- hover
- completion
- go-to-definition
- references
- rename
- inlay hints
- semantic tokens

Advanced refactors use `workspace/executeCommand` over standard LSP.
Command names and payload types live in the `lumina-language-client` package.

## Start the LSP server

```bash
npx lumina-lsp --stdio
```

## Protocol package

```bash
npm install lumina-language-client
```

See `docs/editor-integration/PROTOCOL.md` for command ids and payload shapes.
