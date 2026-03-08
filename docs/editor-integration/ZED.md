# Zed Integration

Zed supports LSP natively. Point it at `lumina-lsp`:

```json
{
  "lsp": {
    "lumina-lsp": {
      "binary": {
        "path": "lumina-lsp",
        "arguments": ["--stdio"]
      }
    }
  }
}
```

Advanced refactors use Lumina's `workspace/executeCommand` protocol.
