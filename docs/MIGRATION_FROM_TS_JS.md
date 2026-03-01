# Migrating from TypeScript/JavaScript to Lumina

This guide is for teams moving existing TS/JS code to Lumina incrementally.

## 1. Migration Strategy

Recommended order:

1. Start with leaf modules (utility logic, pure functions).
2. Keep app entrypoints in JS/TS while Lumina compiles to JS.
3. Move error-prone code paths to `Result` + `?`.
4. Move data-heavy code to `Vec`/`HashMap`/`HashSet`.
5. Migrate async and concurrency modules last.

Do not start with framework glue code. Start with domain logic first.

## 2. Concept Mapping (TS/JS -> Lumina)

| TypeScript / JavaScript | Lumina |
|---|---|
| `number` | `i32`, `f64`, or explicit numeric type |
| `Array<T>` | `Vec<T>` and array literals `[a, b, c]` |
| `Map<K, V>` | `HashMap<K, V>` |
| `Set<T>` | `HashSet<T>` |
| `undefined` / `null` checks | `Option<T>` |
| `throw` / `try-catch` flow | `Result<T, E>` + `?` |
| Interfaces | Traits |
| Generic constraints (`T extends X`) | Trait bounds (`T: X`) |
| `async/await` | `async/await` |

## 3. Key Syntax Translations

## Arrays and Maps

TypeScript:

```ts
const nums = [1, 2, 3];
const m = new Map<string, number>();
m.set("alice", 30);
const age = m.get("alice");
```

Lumina:

```lumina
let nums = [1, 2, 3];
let m: HashMap<string, i32> = hashmap.new();
m.insert("alice", 30);
let age = m.get("alice"); // Option<i32>
```

## Optional values

TypeScript:

```ts
const age = map.get("alice");
if (age !== undefined) {
  console.log(age);
}
```

Lumina:

```lumina
match map.get("alice") {
  Some(age) => io.println(str.from_int(age)),
  None => io.println("not found")
}
```

## Error propagation

TypeScript:

```ts
async function load(path: string): Promise<string> {
  const content = await fs.readFile(path, "utf8");
  return content;
}
```

Lumina:

```lumina
fn load(path: string) -> Result<string, string> {
  let content = fs.read_file(path)?;
  Ok(content)
}
```

## Interfaces -> Traits

TypeScript:

```ts
interface Printable {
  print(): void;
}
```

Lumina:

```lumina
trait Printable {
  fn print(self: Self) -> void;
}
```

## 4. Interop Pattern (Incremental Adoption)

Typical rollout:

1. Keep TS/JS app shell.
2. Write Lumina modules for business logic.
3. Compile Lumina to JS (`--target esm` or `--target cjs`).
4. Import compiled modules in existing TS/JS runtime.

Example compile:

```bash
lumina compile src/core.lm --target esm --out dist/core.js
```

## 5. Common Pitfalls During Migration

- Numeric strictness:
  - Lumina does not silently coerce across numeric types.
  - Use explicit casts with `as`.
- Option/Result discipline:
  - Avoid “nullable” thinking; handle `Some/None` and `Ok/Err`.
- Collection indexing:
  - Treat index results as safe/checked flows (`Option` patterns).
- Trait method resolution:
  - Ensure trait impl exists for method-style calls.

## 6. Recommended Team Workflow

Use this per migration PR:

```bash
lumina fmt "src/**/*.lm"
lumina lint "src/**/*.lm"
lumina check src/main.lm
npm run lint
npm test
npm run build
```

## 7. Suggested Migration Milestones

1. Milestone A:
  - 10-20% of core domain logic in Lumina.
2. Milestone B:
  - Error handling moved to `Result` model.
3. Milestone C:
  - Data structures moved to Lumina collections.
4. Milestone D:
  - Performance-sensitive modules moved to WASM target.

## 8. Current Limits to Plan Around

- WASM backend is beta and not feature-parity with JS path.
- Ecosystem package discovery is still early-stage.
- Some advanced type-system features are MVP/beta scoped.

Use `docs/CAPABILITIES.md` as source of truth before migration decisions.
