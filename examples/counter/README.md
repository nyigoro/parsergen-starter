# Counter Example

This is a minimal reactive counter built in Lumina with the render runtime.

## Architecture

The example uses the three-layer model:

1. `@std/reactive`: state and updates (`createSignal`, `get`, `set`)
2. `@std/render`: abstract UI tree (`vnode`, `text`)
3. DOM target: browser mounting (`createDomRenderer`, `mount_reactive`)

## Run

```bash
npm run build
node dist/bin/lumina.js compile examples/counter/main.lm --out examples/counter/main.generated.js --target esm --ast-js
cp dist/lumina-runtime.js examples/counter/lumina-runtime.js
```

On Windows PowerShell, use:

```powershell
Copy-Item dist/lumina-runtime.js examples/counter/lumina-runtime.js -Force
```

Then serve the folder:

```bash
npx serve examples/counter
```

Open `http://localhost:3000` and click `-` / `+`.

## What to expect

- The number in the center updates reactively on each click.
- The component tree stays mounted; only affected text/props are patched.
