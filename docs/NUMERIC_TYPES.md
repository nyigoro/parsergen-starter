# Numeric Types in Lumina

Lumina provides industry-standard numeric types with explicit sizes.

## Integer Types

### Signed Integers
| Type | Size | Range | WASM Support |
|------|------|-------|--------------|
| `i8` | 8-bit | -128 to 127 | i32 |
| `i16` | 16-bit | -32,768 to 32,767 | i32 |
| `i32` | 32-bit | -2^31 to 2^31-1 | i32 |
| `i64` | 64-bit | -2^63 to 2^63-1 | Planned |
| `i128` | 128-bit | -2^127 to 2^127-1 | Planned |

### Unsigned Integers
| Type | Size | Range | WASM Support |
|------|------|-------|--------------|
| `u8` | 8-bit | 0 to 255 | i32 |
| `u16` | 16-bit | 0 to 65,535 | i32 |
| `u32` | 32-bit | 0 to 2^32-1 | i32 |
| `u64` | 64-bit | 0 to 2^64-1 | Planned |
| `u128` | 128-bit | 0 to 2^128-1 | Planned |

### Floating Point
| Type | Size | Precision | WASM Support |
|------|------|-----------|--------------|
| `f32` | 32-bit | ~7 decimal digits | f64 (lowered) |
| `f64` | 64-bit | ~15 decimal digits | f64 |

## Type Aliases

For backward compatibility:
- `int` -> `i32`
- `float` -> `f64`

## Literal Syntax

### Integer Literals
```lumina
let a = 42;           // i32 (default)
let b = 42i64;        // i64 (explicit)
let c = 255u8;        // u8 (explicit)
let d = 1_000_000;    // i32 with underscores
let e = 0xFF;         // i32 (hex)
let f = 0xFFu8;       // u8 (hex with suffix)
let g = 0b1010;       // i32 (binary)
let h = 0b1010i16;    // i16 (binary with suffix)
```

### Float Literals
```lumina
let pi = 3.14;         // f64 (default)
let e = 2.71f32;       // f32 (explicit)
let big = 1.0e10;      // f64 (scientific)
let small = 1.5e-3f32; // f32 (scientific with suffix)
let money = 1_000.50;  // f64 with underscores
```

## Type Inference

```lumina
let x = 42;           // Inferred as i32
let y = 3.14;         // Inferred as f64
let z = 42u8;         // Explicit u8
let w = x + y;        // ERROR: i32 + f64 not allowed
```

## Type Safety

Lumina enforces strict type safety for numeric operations:

```lumina
let a: i32 = 10;
let b: f64 = 3.14;

// ERROR: Cannot add i32 and f64
let c = a + b;

// OK: Explicit conversion with `as`
let c = (a as f64) + b;
```

## WASM Support

Currently supported in the WASM backend:
- `i32` -> native WASM i32
- `f64` -> native WASM f64
- `f32` -> lowered to f64 (temporary)
- Other integer sizes emit diagnostics and are treated as i32

Planned:
- `i64` support
- Proper unsigned arithmetic
- 128-bit integer emulation

## Explicit Conversions

Use the `as` operator to convert between numeric types. Lossy conversions emit a warning.

```lumina
let x: i32 = 42;
let y = x as f64;    // ok

let z: f64 = 3.14;
let w = z as i32;    // warning: lossy conversion
```

## Overflow Behavior

Overflow behavior is planned:
- Debug mode: panic on overflow
- Release mode: wrapping arithmetic

## Next Steps

- [ ] Type conversions (`as` operator)
- [ ] Numeric trait bounds
- [ ] WASM i64 support
- [ ] Saturating/checked arithmetic
