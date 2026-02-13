# Known Issues

## Critical: SSA Scope Bug (IR Codegen)

**Status:** ✅ FIXED (February 13, 2026)

**Symptoms (previously):** ReferenceError at runtime when using mutable variables in loops or branching.

**Example:**
```lumina
fn main() -> int {
  let mut count = 0;
  while (count < 5) {
    count = count + 1;
  }
  count
}
```

**Fix Details:**
- SSA temporaries are now declared at function scope.
- Loop bodies preserve mutations as assignments (no SSA in loops).
- Constant propagation respects loop‑mutated variables.

**Note:** The `--no-optimize` flag remains available for debugging.
