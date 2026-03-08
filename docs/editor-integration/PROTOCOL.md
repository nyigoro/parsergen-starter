# Lumina LSP Command Protocol

Lumina advanced refactors use `workspace/executeCommand`.

The shared command ids and payload types are exported by `lumina-language-client`.

## Command ids

- `lumina.changeSignature`
- `lumina.previewChangeSignature`
- `lumina.applyChangeSignature`
- `lumina.previewChangeTraitSignature`
- `lumina.applyChangeTraitSignature`
- `lumina.moveSymbol`
- `lumina.applyMoveSymbol`
- `lumina.changeReturnType`
- `lumina.previewChangeReturnType`
- `lumina.applyChangeReturnType`
- `lumina.extractModule`
- `lumina.applyExtractModule`
- `lumina.explain`

## Request / response shapes

### `lumina.previewChangeSignature`
- request: `ChangeSignatureArgs`
- response: `ChangeSignaturePreview`

### `lumina.applyChangeSignature`
- request: `ChangeSignatureArgs`
- response: `ChangeSignatureResult`

### `lumina.previewChangeTraitSignature`
- request: `ChangeSignatureArgs`
- response: `ChangeSignaturePreview`

### `lumina.applyChangeTraitSignature`
- request: `ChangeSignatureArgs`
- response: `ChangeSignatureResult`

### `lumina.applyMoveSymbol`
- request: `MoveSymbolArgs`
- response: `MoveSymbolResult`

### `lumina.previewChangeReturnType`
- request: `ChangeReturnTypeArgs`
- response: `ChangeReturnTypePreview`

### `lumina.applyChangeReturnType`
- request: `ChangeReturnTypeArgs`
- response: `ChangeReturnTypeResult`

### `lumina.applyExtractModule`
- request: `ExtractModuleArgs`
- response: `ExtractModuleResult`

## Code action argument payloads

Code actions emitted by the LSP attach one of:

- `ChangeSignatureActionArg`
- `MoveSymbolActionArg`
- `ExtractModuleActionArg`
- `ChangeReturnTypeActionArg`
