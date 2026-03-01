# Documentation Maintenance Policy

This file defines the minimum documentation updates required for every new Lumina feature.

## Rule

No feature is considered complete until docs are updated in the same PR/commit set.

## Required Updates Per Feature

For each user-facing feature, update:

1. `docs/CAPABILITIES.md`
- Set status (`Stable`, `Beta`, `Planned`)
- Add one-line notes on scope/limits

2. A focused guide
- Create or update topic doc (example: `docs/ERROR_HANDLING.md`, `docs/CONST_GENERICS.md`)
- Include syntax, examples, and current limitations

3. `docs/STDLIB.md` if runtime or stdlib API changed
- Add signatures
- Add behavior/return semantics
- Add minimal usage example

4. `README.md`
- Update highlights if feature is major
- Ensure docs links remain accurate

5. Examples
- Add or update under `examples/`
- Keep runnable by CLI commands shown in docs

## Release Checklist

Before release:

1. Verify docs match shipped behavior
- Run sample commands in docs
- Remove stale roadmap claims from user-facing docs

2. Validate quality gates

```bash
npm run lint
npm test
npm run build
```

3. Tag release notes
- Add brief section listing docs added/changed

## Doc Style

- Prefer executable examples over theory.
- Keep syntax examples small and runnable.
- Mark incomplete areas with explicit "Limitations" section.
- Avoid claiming support that is only parsed but not semantically/codegen supported.

## Ownership

- Feature author updates docs.
- Reviewer verifies docs during code review.
- Release owner checks docs consistency before publish.
