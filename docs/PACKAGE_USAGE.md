# Package Management Guide

## Quick Start

### Create a new project
```bash
lumina init
```

### Add dependencies
```bash
lumina add my-package
lumina add @lumina/json-parser
```

### Install dependencies
```bash
lumina install
```

### List installed Lumina packages
```bash
lumina list
```

## Import Packages

```lumina
import { parse } from "@lumina/json-parser";
import { helper } from "my-package/utils";
```

## Publishing Packages

Create a `package.json` with a `lumina` field:

```json
{
  "name": "@you/my-package",
  "version": "0.1.0",
  "lumina": {
    ".": "./src/index.lm",
    "./utils": "./src/utils.lm"
  }
}
```

Publish to npm:
```bash
npm publish
```

## Lockfile Format

See `docs/PACKAGE_MANAGEMENT_PHASE1.md` for the full technical details.
