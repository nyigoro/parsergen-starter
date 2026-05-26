# Package Management Guide

## Quick Start

### Create a new project
```bash
lumina init
```

### Add dependencies
```bash
lumina add my-package
lumina add lumina-json-parser
lumina add --dev lumina-test-helper
```

### Install dependencies
```bash
lumina install
```

### List installed Lumina packages
```bash
lumina list
```

`lumina add --dev` records packages in `[dev-dependencies]`. A package belongs
to one dependency class at a time: adding it normally moves it to
`[dependencies]`, and adding it with `--dev` moves it to `[dev-dependencies]`.
`lumina install --frozen` checks both groups against `lumina.lock`.

## Import Packages

```lumina
import { parse } from "lumina-json-parser";
import { helper } from "my-package/utils";
```

## Browser Import Maps

For browser/CDN workflows, generate an import map from locked package metadata:

```bash
lumina importmap --write-browser-lock --out dist/import-map.json
```

When `lumina.browser.lock` is missing, this command derives it from
`lumina.lock`, writes the browser lock, and emits an import map. Bare package
imports are emitted only when a package name has a single locked version;
versioned aliases such as `pkg@1.2.3` are always emitted for deterministic
multi-version browser locks.

## Publishing Packages

`lumina init` creates the native Lumina manifest, `lumina.toml`. Package
metadata, runtime dependencies, dev dependencies, peer dependencies, and
registry settings live there.

```toml
[package]
name = "@you/my-package"
version = "0.1.0"
entry = "src/index.lm"
description = "Useful Lumina helpers"
license = "MIT"

[dependencies]
lumina-json-parser = "^0.2.0"

[peer-dependencies]
host-runtime = "^2.0.0"
```

Publish the current package:

```bash
lumina publish
```

`lumina publish` validates `lumina.toml`, runs the package preflight checks, and
packs the Lumina sources plus the manifest. Use `--cdn` when publishing browser
or WASM artifacts for CDN-oriented workflows.

## Private Registries

Projects can point Lumina package commands at an internal registry:

```toml
[registry]
url = "https://registry.example.internal"
token = "${LUMINA_REGISTRY_TOKEN}"
```

Environment variables can override manifest registry settings:

```bash
LUMINA_REGISTRY_URL=https://registry.example.internal
LUMINA_REGISTRY_TOKEN=...
lumina add internal-package
```

`LUMINA_TOKEN` remains supported for compatibility, but
`LUMINA_REGISTRY_TOKEN` is preferred for registry auth. Registry request errors
redact configured bearer tokens before printing.

## Version Solving and Peers

`lumina.lock` keeps exact selected transitive package versions. Package metadata
can also declare peer requirements:

```toml
[peer-dependencies]
host-runtime = "^2.0.0"
```

Published package metadata includes these peer dependencies, and Lumina validates
them during `lumina add` and `lumina install` instead of silently installing an
incompatible graph. If no version satisfies a requested range, the diagnostic
includes the available versions reported by the registry.

## Lockfile Format

`lumina.lock` is the current project lockfile. It records exact selected package
versions, integrity, package entry points, exact transitive edges, peer metadata,
and registry URLs for reproducible compiler, editor, and bundler resolution.

`lumina.lock.json` was an early compatibility format. Current commands write
`lumina.lock`; old lockfiles are migration input only.
