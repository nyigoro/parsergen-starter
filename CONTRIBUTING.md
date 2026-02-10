# Contributing

## Development Setup

```bash
npm install
npm run build
npm run lint:check
npm test
```

## Packaging Notes

This package publishes only the `dist/` output and core docs via the `files` whitelist in `package.json`.

## Troubleshooting

- **`jest` not found**: run `npm install` to ensure dev dependencies are installed.
- **LSP not starting**: verify `lumina-lsp` is on PATH or run `npx lumina-lsp`.
- **No diagnostics**: ensure your workspace contains `.lum`/`.lumina` files and that `lumina.fileExtensions` matches.
- **Grammar not found**: set `lumina.grammarPath` or place the grammar at `src/grammar/lumina.peg`.
