# Thread + Channel Producer/Consumer

This example integrates local thread handles with MPSC channels.

## What it demonstrates

- Two producers running via `thread.spawn(...)`
- Shared channel with cloned senders (`tx.clone()`)
- Non-blocking send in producers (`tx.try_send(...)`)
- Consumer loop with `await rx.recv()`
- Graceful shutdown by closing producer handles

## Run

```bash
cd examples/thread-channel-producer-consumer
lumina compile main.lm --out demo.js --target esm --ast-js
node demo.js
```
