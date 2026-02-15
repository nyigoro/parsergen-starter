# Lumina VS Code Extension

Advanced VS Code integration for the Lumina language.

## Features

- Language Server Protocol integration (`lumina-lsp`)
- Diagnostics, quick fixes, and refactor code actions
- Inlay hints (type and parameter hints)
- Hover, go-to-definition, references, rename, signature help
- Semantic tokens
- Commands:
  - `Lumina: Restart Language Server`
  - `Lumina: Show Language Server Output`
  - `Lumina: Compile Current File`
  - `Lumina: Run Current File`
  - `Lumina: Format Current File`
  - `Lumina: Doctor`
- Syntax highlighting, snippets, and language configuration

## Settings

- `lumina.server.path`
- `lumina.server.args`
- `lumina.cli.path`
- `lumina.cli.args`
- `lumina.compile.target`
- `lumina.compile.astJs`
- `lumina.maxDiagnostics`
- `lumina.fileExtensions`
- `lumina.maxIndexFiles`
- `lumina.renameConflictMode`
- `lumina.renamePreviewMode`
- `lumina.useHmDiagnostics`

## Development

```bash
cd vscode-extension
npm install
npm run build
```

Then press `F5` in VS Code to launch an Extension Development Host.

