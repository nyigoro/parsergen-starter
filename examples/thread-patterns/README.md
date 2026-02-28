# Thread Patterns

Examples for thread usage patterns:

- `parallel-fibonacci.lm`: parallel task handles with `join()`
- `worker-pool.lm`: fixed worker pool fan-out/fan-in
- `error-handling.lm`: handling `Result` from `spawn_worker`

## Run

```bash
lumina compile parallel-fibonacci.lm --out parallel-fibonacci.js --target esm --ast-js
node parallel-fibonacci.js
```

```bash
lumina compile worker-pool.lm --out worker-pool.js --target esm --ast-js
node worker-pool.js
```

```bash
lumina compile error-handling.lm --out error-handling.js --target esm --ast-js
node error-handling.js
```

