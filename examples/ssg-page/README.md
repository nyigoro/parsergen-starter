# SSG Page Example

This folder contains:

- [main.lm](./main.lm): the Lumina SSG authoring example
- [index.html](./index.html): generated static HTML output

## Regenerate

```bash
node --no-experimental-webstorage ./dist/bin/lumina.js ssg examples/ssg-page/main.lm --out examples/ssg-page/index.html --title "Lumina SSG Example"
```

## Open live

Serve the `examples` folder or the repo root and open:

- `http://localhost:3000/ssg-page/index.html`
