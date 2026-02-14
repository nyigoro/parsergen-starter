# Package Management Phase 1 (npm piggyback)

This document defines the Phase 1 package management design for Lumina. The goal is to unlock real-world projects quickly by reusing the npm ecosystem while keeping Lumina-specific resolution deterministic.

## Goals
- Allow `import { x } from "pkg"` to resolve from `node_modules`.
- Provide a simple CLI workflow (`lumina install`, `lumina add`, `lumina remove`).
- Make resolution reproducible with a Lumina lockfile.
- Keep the compiler and LSP in sync on module resolution.

## Non-Goals (Phase 1)
- Publishing Lumina packages to a custom registry.
- JS interop or `.d.ts` consumption.
- Bundling npm dependencies into output.
- Tree-shaking or dependency pruning.

## CLI Interface

### `lumina install`
Installs dependencies from `package.json` using npm (Phase 1 default).

```
lumina install
lumina install --frozen  # uses npm ci if package-lock.json exists
```

Behavior:
- Runs `npm install` (or `npm ci` with `--frozen`).
- Generates/updates `lumina.lock.json`.

### `lumina add <pkg>`
Adds a dependency and updates lockfile.

```
lumina add lodash
lumina add lodash@4.17.21
lumina add @lumina/json --dev
lumina add @lumina/json@^0.1.0
```

Behavior:
- Runs `npm install <pkg>` (or `npm install -D` with `--dev`).
- Updates `package.json` and `lumina.lock.json`.

### `lumina remove <pkg>`
Removes a dependency and updates lockfile.

```
lumina remove lodash
```

Behavior:
- Runs `npm uninstall <pkg>`.
- Updates `package.json` and `lumina.lock.json`.

### `lumina list`
Prints Lumina-resolvable packages and their resolved entry points.

```
lumina list
```

### `lumina init`
Initializes a Lumina project.

```
lumina init
lumina init --yes
```

Creates a minimal `package.json` with a `lumina` entry:
```json
{
  "name": "my-project",
  "version": "0.1.0",
  "lumina": "./src/main.lm",
  "dependencies": {}
}
```

## Package Metadata (package.json)
Phase 1 uses npm packages and adds a `lumina` field to describe Lumina entry points.

### Simple form (single entry)
```json
{
  "name": "@lumina/json",
  "version": "0.1.0",
  "lumina": "./src/index.lm"
}
```

### Export map form (multiple entry points)
```json
{
  "name": "@lumina/json",
  "version": "0.1.0",
  "type": "module",
  "lumina": {
    ".": "./src/index.lm",
    "./parser": "./src/parser.lm",
    "./stringify": "./src/stringify.lm"
  },
  "files": ["src/**/*.lm"]
}
```

Rules:
- If `lumina` is a **string**, it is the default import target.
- If `lumina` is an **object**, it acts like a Lumina-specific export map.
- If no `lumina` field exists, the package is not Lumina-resolvable in Phase 1.

## Import Resolution Rules

Resolution order for an import specifier `S` in file `F`:

1. **Relative or absolute** (`./`, `../`, `/`):
   - Existing Lumina resolver rules apply.
2. **Stdlib** (`@std/*`):
   - Resolved via module registry.
3. **Bare specifier** (`pkg`, `@scope/pkg`, `pkg/subpath`):
   - Locate nearest `package.json` from `F` upward.
   - Resolve `node_modules/<pkg>/package.json`.
   - Use `lumina` export map for `pkg/subpath`.
   - Use `lumina` string entry or `lumina["."]` for `pkg`.
4. **Workspace packages** (monorepos):
   - If the project has a workspace root (package.json with `workspaces`),
     resolve package names to the local workspace path before `node_modules`.

Supported extensions (Phase 1):
- `.lm`
- `.lumina`

Mixed Lumina/JS packages:
- Phase 1 resolves **only** `.lm` / `.lumina` for Lumina packages.
- JS interop is explicitly out of scope (see Non-Goals).

## Lockfile Format

`lumina.lock.json` captures the resolved Lumina entry and export map for each dependency to ensure reproducible resolution.

```json
{
  "lockfileVersion": 1,
  "packages": {
    "@lumina/json": {
      "version": "0.1.0",
      "resolved": "node_modules/@lumina/json",
      "integrity": "sha512-...",
      "lumina": {
        ".": "./src/index.lm",
        "./parser": "./src/parser.lm"
      }
    }
  }
}
```

Notes:
- Version and resolved path are copied from `node_modules`.
- Integrity is copied from `package-lock.json` when available.
- `lumina` section is cached to avoid reading package.json during every compile.

## Implementation Plan (Phase 1)

### Phase 1.0: CLI + Lockfile
1. Add `lumina install/add/remove/list/init` commands.
2. Use npm as the default package manager (spawn `npm`).
3. Generate `lumina.lock.json` from installed packages.

### Phase 1.1: Compiler Resolution
1. Extend `ProjectContext.resolveImport` to handle bare specifiers.
2. Resolve workspace packages before `node_modules`.
3. Use `lumina.lock.json` when present, otherwise read package.json.
4. Cache resolution results in the project context.

### Phase 1.2: LSP Integration
1. Use the same resolver in LSP context.
2. Provide diagnostics for missing packages or invalid exports.

### Phase 1.3: Diagnostics + Cycle Detection
1. Track resolution stack to detect cycles.
2. Emit package diagnostics with stable codes:
   - `PKG-001`: Package not found in node_modules or workspace
   - `PKG-002`: Package missing `lumina` field
   - `PKG-003`: Invalid export path in `lumina`
   - `PKG-004`: Circular dependency detected

## Open Questions
- Should we allow `.lm` in `package.json` `exports` without `lumina`?
  - **Phase 1 answer:** No. Require explicit `lumina` field.
- Do we want a `lumina.json` manifest for future native packages?
  - **Phase 1 answer:** Not yet. Revisit in Phase 2+.
- Should `lumina install` respect `npm_config_registry`?
  - **Phase 1 answer:** Yes, pass through npm config.
