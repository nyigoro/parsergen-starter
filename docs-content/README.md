# Lumina Documentation Index

`docs-content/` is the markdown source tree for the Lumina docs portal.
Edit files here, then rebuild the docs bundle and publish output:

```bash
npm run docs:build-data
npm run web:build
```

Related directories:

- `docs-site/` - docs portal shell and renderer
- `docs/` - generated static output for GitHub Pages

- [Getting Started](GETTING_STARTED.md) - install, first program, compile/run
- [Why Lumina?](WHY_LUMINA.md) - what Lumina is for and how it compares
- [When to use JS vs WASM](WHEN_TO_USE_JS_VS_WASM.md) - choosing the right target for the job
- [Using Lumina](USING_LUMINA.md) - CLI workflow and language usage patterns
- [Learning Path](LEARNING_PATH.md) - structured lessons from beginner to advanced
- [Lessons](lessons/) - hands-on tutorial lessons with exercises
- [Contact and Community](CONTACT.md) - maintainer contact and community links
- [Discord Rules](DISCORD_RULES.md) - community rules for the Lumina Discord
- [Discord Server Setup Guide](DISCORD_SERVER_SETUP.md) - recommended Discord structure and moderation setup
- [Migration from TS/JS](MIGRATION_FROM_TS_JS.md) - practical migration strategy from TS/JS
- [Ecosystem](ECOSYSTEM.md) - ecosystem status, package guidance, and contribution model
- [Capabilities](CAPABILITIES.md) - feature matrix and status
- [Web-Native Roadmap](WEB_NATIVE_ROADMAP.md) - web-native execution strategy and release gates
- [Stdlib](STDLIB.md) - standard library APIs
- [Render](RENDER.md) - reactivity, VNode model, and renderer contract
- [Numeric Types](NUMERIC_TYPES.md) - numeric type system
- [Error Handling](ERROR_HANDLING.md) - `Result` and `?` operator
- [Const Generics](CONST_GENERICS.md) - const generics and fixed-size arrays
- [HKTs](HKTS.md) - higher-kinded types and kind checking
- [Functor](FUNCTOR.md) - functor trait semantics + std usage patterns
- [Applicative](APPLICATIVE.md) - applicative trait semantics + std usage patterns
- [Monad](MONAD.md) - monad trait semantics + std usage patterns
- [Docs Maintenance](DOCS_MAINTENANCE.md) - policy for keeping docs current
