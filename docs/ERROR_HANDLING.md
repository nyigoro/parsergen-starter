# Error Handling in Lumina

Lumina provides industry-standard error handling with the `?` operator for ergonomic error propagation.

## The Problem

Without `?`, error handling requires nested match expressions:

```lumina
fn process_file(path: string) -> Result<i32, string> {
  match read_file(path) {
    Ok(content) => {
      match parse_int(content) {
        Ok(value) => {
          match validate(value) {
            Ok(validated) => Ok(validated),
            Err(e) => Err(e)
          }
        },
        Err(e) => Err(e)
      }
    },
    Err(e) => Err(e)
  }
}
```

This is verbose, repetitive, and error-prone.

## The Solution: `?` Operator

The `?` operator automatically propagates errors:

```lumina
fn process_file(path: string) -> Result<i32, string> {
  let content = read_file(path)?;
  let value = parse_int(content)?;
  let validated = validate(value)?;
  Ok(validated)
}
```

How it works:
1. If the Result is `Ok(value)`, unwraps and continues
2. If the Result is `Err(e)`, returns `Err(e)` immediately
3. Automatically propagates the error type through the call stack

## Requirements

The `?` operator can only be used:
- Inside functions that return `Result<T, E>`
- On expressions that evaluate to `Result<T, E>`

Error types must match:

```lumina
fn example() -> Result<i32, string> {
  let x = operation1()?;
  let y = operation2()?;
  Ok(x + y)
}
```

## Type Safety

The type system ensures correct usage:

```lumina
// Error: ? used in non-Result function
fn bad1() -> i32 {
  let x = operation()?;
  x
}

// Error: ? used on non-Result type
fn bad2() -> Result<i32, string> {
  let x = 42?;
  Ok(x)
}

// Error: Incompatible error types
fn bad3() -> Result<i32, string> {
  let x = returns_int_error()?;
  Ok(x)
}
```

## Chaining Operations

The `?` operator enables clean chaining:

```lumina
fn fetch_and_process(url: string) -> Result<Data, string> {
  let response = http.get(url)?;
  let json = parse_json(response.body)?;
  let data = validate_schema(json)?;
  let processed = transform(data)?;
  Ok(processed)
}
```

## Converting Error Types

When error types don't match, use explicit conversion:

```lumina
fn convert_error() -> Result<i32, string> {
  match operation_with_int_error() {
    Ok(value) => Ok(value),
    Err(code) => Err(str.from_int(code))
  }
}

// Or use a helper function to convert errors
fn with_conversion() -> Result<i32, string> {
  match operation() {
    Ok(value) => Ok(value),
    Err(code) => Err(str.from_int(code))
  }
}
```

## Best Practices

### 1. Use ? for Happy Path

```lumina
fn good_example() -> Result<i32, string> {
  let a = step1()?;
  let b = step2(a)?;
  let c = step3(b)?;
  Ok(c)
}
```

### 2. Handle Specific Errors Explicitly

```lumina
fn handle_specific() -> Result<i32, string> {
  match critical_operation() {
    Ok(value) => Ok(value),
    Err(e) => {
      log_error(e);
      Err("Critical operation failed")
    }
  }
}
```

### 3. Chain Related Operations

```lumina
fn chain_operations(id: i32) -> Result<User, string> {
  let user = db.get_user(id)?;
  let profile = db.get_profile(user.profile_id)?;
  let settings = db.get_settings(user.id)?;

  Ok(User { ...user, profile, settings })
}
```

## Examples

### File Processing

```lumina
fn process_config(path: string) -> Result<Config, string> {
  let content = fs.read_file(path)?;
  let json = parse_json(content)?;
  let config = Config.from_json(json)?;
  config.validate()?;
  Ok(config)
}
```

### HTTP API Call

```lumina
async fn fetch_user(id: i32) -> Result<User, string> {
  let url = str.concat("https://api.example.com/users/", str.from_int(id));
  let response = await http.get(url)?;
  let json = parse_json(response.body)?;
  User.from_json(json)
}
```

### Database Query

```lumina
fn get_user_with_posts(id: i32) -> Result<UserWithPosts, string> {
  let user = db.query_one("SELECT * FROM users WHERE id = ?", [id])?;
  let posts = db.query("SELECT * FROM posts WHERE user_id = ?", [id])?;
  Ok(UserWithPosts { user, posts })
}
```

## Comparison with Other Languages

### Rust
```rust
fn example() -> Result<i32, String> {
    let x = operation()?;
    Ok(x)
}
```

### Lumina
```lumina
fn example() -> Result<i32, string> {
  let x = operation()?;
  Ok(x)
}
```

Identical semantics.

## Future: Option Support

Planned support for `?` with `Option<T>`:

```lumina
fn find_value(items: Vec<i32>, target: i32) -> Option<i32> {
  let first = vec.find(items, |x| x > 0)?;
  let second = vec.find(items, |x| x == target)?;
  Some(first + second)
}
```

## See Also

- [Result Type Documentation](./STDLIB.md#result)
- [Option Type Documentation](./STDLIB.md#option)
- [Async Error Handling](./ASYNC.md#error-handling)
