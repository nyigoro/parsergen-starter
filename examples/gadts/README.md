# GADT Examples

This folder contains small examples of indexed enums (GADTs) in Lumina.

## Files

- `ast-eval.lm`: Type-safe expression evaluator with indexed variants.
- `state-machine.lm`: State-indexed session model.
- `showbox.lm`: Existential packaging pattern.

## Run

```bash
node dist/bin/lumina.js compile examples/gadts/ast-eval.lm --out examples/gadts/ast-eval.js --target esm --ast-js
node examples/gadts/ast-eval.js
```

Use the same command for the other files by replacing the input/output path.
