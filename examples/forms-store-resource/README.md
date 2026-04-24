# Forms + Resource Example

This folder has two layers:

- [main.lm](./main.lm): the Lumina authoring example used for CLI `check` verification
- [index.html](./index.html) + [main.js](./main.js): the browser-ready live demo

## Run live

Serve the `examples` folder or the repo root:

```bash
npx serve examples
```

Then open:

- `http://localhost:3000/forms-store-resource/index.html`

## What it shows

- controlled text input
- checkbox state
- resource loading with suspense fallback
- persisted draft state after submit
