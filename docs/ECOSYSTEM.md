# Lumina Ecosystem

This document describes the current ecosystem state, contribution model, and packaging expectations.

## 1. Current State

Lumina currently provides:

- Language toolchain (`check`, `compile`, `watch`, `repl`, `run-wasm`)
- Package commands (`init`, `install`, `add`, `remove`, `list`)
- Formatter/linter/doc generator (`fmt`, `lint`, `doc`)
- Standard runtime modules (I/O, strings, math, fs, http, time, regex, crypto, collections, channel/thread/sync)
- Growing example catalog under `examples/`

What is still maturing:

- Large public package ecosystem
- Centralized package discovery/index UX
- Broader third-party integration templates

## 2. Package Management (Today)

Commands:

```bash
lumina init
lumina install
lumina add <pkg>
lumina remove <pkg>
lumina list
```

Guidance:

- Lock dependencies before release.
- Prefer semver-compatible ranges.
- Keep runtime compatibility notes in README/docs.

## 3. Recommended Package Structure

```text
your-package/
  src/
  examples/
  tests/
  docs/
  README.md
  CHANGELOG.md
```

Minimum quality bar for shared packages:

- Clear API docs
- Runnable examples
- Automated tests
- Lint/build passing

## 4. Contribution Areas

High-value contribution categories:

- New stdlib modules and hardening existing ones
- Compiler diagnostics and IDE workflows
- Real-world examples/tutorials
- Performance profiling and WASM parity work
- Packaging and ecosystem tooling

## 5. Example-Driven Ecosystem Growth

Examples should:

- Be runnable with explicit commands
- Demonstrate one clear use case
- Include expected output
- Link to relevant docs

Current examples include:

- Async patterns
- Channels/threading
- WASM demo
- Traits demo
- Const generics demo

## 6. Release and Compatibility Policy

Before release:

```bash
npm run lint
npm test
npm run build
npm run pack:check
```

Versioning:

- Patch: bug fixes, docs-only changes
- Minor: additive language/runtime features
- Major: breaking language or runtime behavior

## 7. Publishing Guidance

For npm publishing:

```bash
npm version patch
git push origin main --tags
npm publish --access public
```

If publish fails with auth/ownership errors:

```bash
npm login
npm whoami
npm access ls-packages <your-npm-username>
```

## 8. Near-Term Ecosystem Roadmap

1. Improve package discovery and curation.
2. Expand official templates/starter projects.
3. Publish migration-ready production samples.
4. Strengthen plugin integrations (editor/CI/release tooling).

## 9. How to Help Now

1. Publish focused example packages.
2. Improve docs with runnable examples.
3. Add tests around edge cases/regressions.
4. Contribute migration guides for specific domains (web API, CLI, data pipeline).
