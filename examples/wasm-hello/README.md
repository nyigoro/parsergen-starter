# Lumina WASM Demo

This example demonstrates Lumina's WebAssembly backend.

## Compile

```bash
lumina compile math.lm --target wasm --out math.wat
```

This generates:
- `math.wat` - WebAssembly text format
- `math.wasm` - Compiled binary (if `wat2wasm` is available)

If `wat2wasm` is not installed, you can use:

```bash
npx -p wabt wat2wasm math.wat -o math.wasm
```

## Run

```bash
# Run main function
lumina run-wasm math.wasm main
# Expected: 240 (30 + 35 + 120 + 55)

# Call specific functions
lumina run-wasm math.wasm add 100 50
# Expected: 150

lumina run-wasm math.wasm factorial 6
# Expected: 720

lumina run-wasm math.wasm fibonacci 15
# Expected: 610
```

## Features Demonstrated

- ✅ Basic arithmetic (`+`, `*`)
- ✅ Conditionals (`if/else`)
- ✅ Recursion (factorial, fibonacci)
- ✅ Multiple exported functions
- ✅ WASM execution in Node.js
