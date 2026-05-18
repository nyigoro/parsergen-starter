# Why Lumina?

Lumina exists for teams that want stronger language guarantees on the web without giving up the JavaScript ecosystem or the option to ship WebAssembly.

## The Short Version

- Lumina is for web software that wants stronger modeling than TypeScript.
- It keeps one language across browser UI, worker code, and WASM workloads.
- It is most compelling when you want algebraic data types, traits, pattern matching, and browser-native runtime APIs in the same toolchain.

## How to Learn It

Use the docs as the map and the playground as the lab. Docs pages explain the concept, then selected preview cards open a curated single-source example in the standalone playground.

- Start with [Getting Started](GETTING_STARTED.md) and the [Learning Path](LEARNING_PATH.md).
- Use Run-oriented examples for normal runtime output.
- Use UI-oriented examples in the UI Preview tab because they mount into a browser document.
- Use the Types and Diagnostics tabs when you want to understand inference or compiler feedback.

## Lumina vs TypeScript

Choose Lumina over TypeScript when:

- your domain model benefits from enums, exhaustiveness checks, and match-heavy control flow
- you want one language for both JS output and WASM output
- you want stronger compile-time guarantees than structural typing and `any`-escape hatches usually provide

Stay with TypeScript when:

- you are primarily optimizing for ecosystem breadth and shortest onboarding time
- your app is mostly ordinary DOM or React code and TypeScript already feels sufficient
- you do not need a second backend target or a stronger type model

## Lumina vs AssemblyScript

Choose Lumina over AssemblyScript when:

- you care about language design, not only WASM output
- you want HM inference, traits, algebraic data types, and pattern matching as first-class tools
- you want the same language to stay pleasant in UI/runtime code, not only compute code

AssemblyScript is still a good fit when:

- TypeScript-shaped syntax is the main requirement
- the primary goal is a straightforward WASM-oriented subset with familiar JavaScript ergonomics

## Lumina vs Grain / Gleam

Choose Lumina over Grain or Gleam when:

- your center of gravity is the browser runtime rather than only the compiler target
- you want reactive UI, WebGPU, workers, storage, and JS interop to feel like part of the platform story
- you want ML-inspired modeling with a web-native systems direction

Those languages remain strong references for language ergonomics, functional design, and WASM-oriented thinking. Lumina is not trying to dismiss them; it is choosing a different emphasis.

## What Lumina Is Best At Today

- browser-native apps that need stronger modeling than TypeScript
- reactive UI plus browser runtime APIs in one language
- worker or WebGPU oriented workloads that may want a WASM path
- experiments and tools where one language across app and runtime layers matters

## What Lumina Is Not Yet Best At

- teams that mainly want the largest existing ecosystem today
- projects that already fit cleanly into plain TypeScript or Rust without friction
- workloads where a mature, battle-tested production framework matters more than language coherence

## Read Next

- [Getting Started](GETTING_STARTED.md)
- [Learning Path](LEARNING_PATH.md)
- [When to use JS vs WASM](WHEN_TO_USE_JS_VS_WASM.md)
- [Capabilities](CAPABILITIES.md)
- [Web-Native Roadmap](WEB_NATIVE_ROADMAP.md)
