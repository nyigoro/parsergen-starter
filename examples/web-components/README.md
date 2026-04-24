# Web Components Example

This folder has two layers:

- [main.lm](./main.lm): the Lumina authoring example used for CLI `check` verification
- [index.html](./index.html) + [main.js](./main.js): the browser-ready live demo

## Run live

Serve the `examples` folder or the repo root:

```bash
npx serve examples
```

Then open:

- `http://localhost:3000/web-components/index.html`

## What it shows

- custom elements defined through Lumina runtime interop
- shadow-root rendering
- live attribute updates from ordinary DOM buttons
