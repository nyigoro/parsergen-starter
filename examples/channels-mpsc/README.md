# MPSC Channels Demo

Demonstrates multiple producers and one consumer with `@std/channel`.

- `tx.clone()` creates additional producer handles.
- Each producer sends values and closes its sender.
- Consumer reads using `await rx.recv()` until expected items arrive.

## Run

```bash
cd examples/channels-mpsc
lumina compile main.lm --out demo.js --target esm --ast-js
node demo.js
```
