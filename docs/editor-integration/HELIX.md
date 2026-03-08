# Helix Integration

Add to `languages.toml`:

```toml
[[language]]
name = "lumina"
scope = "source.lumina"
file-types = ["lm"]
roots = ["lumina.toml"]
language-servers = ["lumina-lsp"]

[language-server.lumina-lsp]
command = "lumina-lsp"
args = ["--stdio"]
```

Advanced refactors use `workspace/executeCommand`. See `docs/editor-integration/PROTOCOL.md`.
