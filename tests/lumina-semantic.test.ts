import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Lumina semantic analysis', () => {
  test('reports unknown identifier and type mismatch', () => {
    const program = `
      fn main() {
        let x: int = "hello";
        return y;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Type mismatch/);
    expect(messages).toMatch(/Unknown identifier/);
  });

  test('supports if statements and boolean literals', () => {
    const program = `
      fn main() {
        if (true) {
          return 1;
        } else {
          return 2;
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('type checks comparisons and boolean ops', () => {
    const program = `
      fn main() {
        let ok: bool = (1 < 2) && true;
        let bad: bool = "a" == 1;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/requires matching operand types/);
  });

  test('supports while loops and assignment', () => {
    const program = `
      fn main() {
        let mut i: int = 0;
        while (i < 3) {
          i = i + 1;
        }
        return i;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports extern functions', () => {
    const program = `
      extern fn fetch(url: string) -> any;
      fn main() {
        return 1;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('rejects recursive structs without indirection', () => {
    const program = `
      struct Node { next: Node }
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Recursive field/);
  });

  test('supports extern symbols with module sources', () => {
    const program = `
      extern fn readFile(path: string) -> string from "node:fs";
      extern type FileHandle from "node:fs";
      fn main() {
        return readFile("hello.txt");
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports module member calls via registry', () => {
    const program = `
      import { io } from "@std";
      fn main() {
        io.println("hi");
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Unknown enum variant/);
    expect(messages).not.toMatch(/Unknown function/);
  });

  test('indexing-only mode collects top-level symbols without body diagnostics', () => {
    const program = `
      struct User { id: int }
      fn main() {
        let x: int = ;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never, { indexingOnly: true });
    expect(analysis.symbols.get('User')).toBeDefined();
    expect(analysis.symbols.get('main')).toBeDefined();
    expect(analysis.diagnostics.length).toBe(0);
  });

  test('parses numeric literals with underscores and bases', () => {
    const program = `
      fn main() {
        let a: int = 0b1010;
        let b: int = 0x1A;
        let c: int = 1_000_000;
        return a + b + c;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as unknown as {
      body?: Array<{ type?: string; body?: { body?: Array<{ type?: string; value?: { value?: number } }> } }>;
    };
    const fn = result.body?.find((stmt) => stmt.type === 'FnDecl');
    const lets = fn?.body?.body?.filter((stmt) => stmt.type === 'Let') ?? [];
    expect(lets[0]?.value?.value).toBe(10);
    expect(lets[1]?.value?.value).toBe(26);
    expect(lets[2]?.value?.value).toBe(1000000);
  });

  test('supports struct and enum declarations', () => {
    const program = `
      struct User { id: int, name: string }
      enum Result { Ok(int), Err(string) }
      fn main() { return 1; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('rejects await outside async functions', () => {
    const program = `
      fn main() {
        let x = await get_value();
        return x;
      }
      async fn get_value() { return 1; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const codes = analysis.diagnostics.map(d => d.code);
    expect(codes).toContain('AWAIT_OUTSIDE_ASYNC');
  });

  test('supports ADT type syntax sugar with generics', () => {
    const program = `
      type Option<T> = Some(T) | None;
      fn main() {
        let value = Some(1);
        match value {
          Some(v) => { return v; },
          None => { return 0; },
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports qualified enum constructors', () => {
    const program = `
      enum Status { Active, Inactive }
      enum Result { Ok(int), Err(string) }
      fn main() {
        let s = Status.Active;
        let t = Status.Active();
        let r = Result.Ok(1);
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('reports missing payloads for qualified enum variants', () => {
    const program = `
      enum Result { Ok(int), Err(string) }
      fn main() {
        let r = Result.Ok;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/expects 1 payload/);
  });

  test('supports struct literals with field checks', () => {
    const program = `
      struct Session { user_id: int, is_admin: bool }
      fn main() {
        let sess = Session { user_id: 101, is_admin: true };
        return sess.user_id;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('rejects recursive structs without indirection', () => {
    const program = `
      struct Node { next: Node }
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Recursive field 'next'/);
  });

  test('allows recursive structs with indirection', () => {
    const program = `
      type Option<T> = { value: T };
      struct Node { next: Option<Node> }
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('infers Option.None in recursive struct literal with HM enabled', () => {
    const program = `
      enum Option<T> { Some(T), None }
      struct Task { id: int, subtask: Option<Task> }
      fn main() {
        let t = Task { id: 1, subtask: Option.None };
        return t.id;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never, { useHm: true, hmSourceText: program });
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('warns on shadowed bindings', () => {
    const program = `
      fn main() {
        let x: int = 1;
        if (true) {
          let x: int = 2;
          return x;
        }
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const warning = analysis.diagnostics.find(d => d.code === 'SHADOWED_BINDING');
    expect(warning?.severity).toBe('warning');
  });

  test('supports generic struct literals and member access', () => {
    const program = `
      struct Box<T> { value: T }
      fn main() {
        let boxed = Box<int> { value: 1 };
        let inferred = Box { value: 2 };
        let value = boxed.value;
        return value;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Type mismatch/);
    expect(messages).not.toMatch(/Unknown field/);
  });

  test('checks match exhaustiveness for enums', () => {
    const program = `
      enum Option { Some(int), None }
      fn main() {
        match Some(1) {
          Some(x) => { return x; }
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Missing case/);
  });

  test('flags missing Err after Result.map when matching', () => {
    const program = `
      import { Result } from "@std";
      enum Result<T, E> { Ok(T), Err(E) }
      fn inc(x: int) -> int { return x + 1; }
      fn main() {
        let res: Result<int,string> = Result.Ok(1);
        let mapped = Result.map(inc, res);
        match mapped {
          Result.Ok(v) => { return v; }
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Missing case/);
  });

  test('reports use-after-move with related move location', () => {
    const program = `
      fn main() {
        let x = 1;
        let y = move x;
        let z = x;
        return y;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveError = analysis.diagnostics.find(d => d.code === 'USE_AFTER_MOVE');
    expect(moveError).toBeTruthy();
    expect(moveError?.message).toMatch(/Cannot use 'x'/);
    expect(moveError?.relatedInformation?.[0]?.message).toMatch(/Moved here/);
  });

  test('flags use-after-move when moved in only one branch', () => {
    const program = `
      fn main() {
        let x = 1;
        if (true) {
          let y = move x;
        } else {
          let y = 0;
        }
        let z = x;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveError = analysis.diagnostics.find(d => d.code === 'USE_AFTER_MOVE');
    expect(moveError).toBeTruthy();
  });

  test('allows use after reinit in both branches', () => {
    const program = `
      fn main() {
        let mut x: int = 1;
        let y = move x;
        if (true) {
          x = 2;
        } else {
          x = 3;
        }
        let z = x;
        return z;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveError = analysis.diagnostics.find(d => d.code === 'USE_AFTER_MOVE');
    expect(moveError).toBeFalsy();
  });

  test('flags move while borrowed in the same statement', () => {
    const program = `
      fn consume(ref x: int, y: int) -> int { return y; }
      fn main() {
        let mut x: int = 1;
        return consume(x, move x);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveError = analysis.diagnostics.find(d => d.code === 'MOVE_WHILE_BORROWED');
    expect(moveError).toBeTruthy();
  });

  test('flags use-after-move when only some match arms move', () => {
    const program = `
      enum Opt { Some(int), None }
      fn main() {
        let x = 1;
        match Some(1) {
          Some(_) => { let y = move x; },
          None => { let y = 0; },
        }
        let z = x;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveError = analysis.diagnostics.find(d => d.code === 'USE_AFTER_MOVE');
    expect(moveError).toBeTruthy();
  });

  test('rejects variable use after move in single match arm', () => {
    const program = `
      struct Box { val: int }
      enum Opt { Some(int), None }
      fn main() {
        let b = Box { val: 10 };
        let opt = Some(1);
        match opt {
          Some(_) => { let y = move b; },
          None => { },
        }
        let z = b;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'USE_AFTER_MOVE' })
    );
  });

  test('allows partial moves of struct fields', () => {
    const program = `
      struct Pair { a: int, b: int }
      fn main() {
        let p = Pair { a: 1, b: 2 };
        let moved = move p.a;
        let ok = p.b;
        let bad = p.a;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveErrors = analysis.diagnostics.filter(d => d.code === 'USE_AFTER_MOVE');
    expect(moveErrors.some(d => d.message.includes("p.a"))).toBe(true);
    expect(moveErrors.some(d => d.message.includes("p.b"))).toBe(false);
  });

  test('rejects moving whole struct after partial move', () => {
    const program = `
      struct Pair { a: int, b: int }
      fn main() {
        let p = Pair { a: 1, b: 2 };
        let moved = move p.a;
        let whole = p;
        let whole2 = move p;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const moveErrors = analysis.diagnostics.filter(d => d.code === 'USE_AFTER_MOVE');
    expect(moveErrors.some(d => d.message.includes("Cannot use 'p' because field 'a' was already moved"))).toBe(true);
    expect(moveErrors.some(d => d.message.includes("Cannot move 'p' because field 'a' was already moved"))).toBe(true);
  });

  test('supports match expressions and struct member access', () => {
    const program = `
      struct User { id: int, name: string }
      enum Option { Some(int), None }
      extern fn getUser() -> User;
      fn main() {
        let user: User = getUser();
        let value: int = match Some(1) {
          Some(x) => x,
          None => 0,
        };
        return user.id;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Match arms must return the same type/);
  });

  test('narrows match value type inside enum arms', () => {
    const program = `
      struct User { id: int }
      enum Result { Ok(User), Err(string) }
      fn main() {
        let res = Ok(User { id: 1 });
        match res {
          Ok(u) => { return res.id; },
          Err(msg) => { return 0; },
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/has no fields/);
    expect(messages).not.toMatch(/Unknown field/);
  });

  test('narrows types in if branches comparing enum variants', () => {
    const program = `
      struct User { id: int }
      enum Option { Some(User), None }
      fn main() {
        let user = User { id: 1 };
        let opt = Some(user);
        if (opt == Some(user)) {
          return opt.id;
        }
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports qualified enum patterns', () => {
    const program = `
      enum Result { Ok(int), Err(string) }
      fn main() {
        let res = Ok(1);
        match res {
          Result.Ok(value) => { return value; },
          Result.Err(msg) => { return 0; },
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('rejects mismatched qualified enum patterns', () => {
    const program = `
      enum Result { Ok(int), Err(string) }
      enum Option { Some(int), None }
      fn main() {
        let res = Ok(1);
        match res {
          Option.None => { return 0; },
          Result.Ok(value) => { return value; },
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Match value is/);
  });

  test('supports is-operator narrowing', () => {
    const program = `
      struct User { id: int }
      enum Option { Some(User), None }
      fn main() {
        let opt = Some(User { id: 1 });
        if (opt is Some) {
          return opt.id;
        }
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports qualified is-operator and negative narrowing', () => {
    const program = `
      struct User { id: int }
      enum Result { Ok(User), Err(string) }
      fn main() {
        let res = Ok(User { id: 7 });
        if (res is Result.Err) {
          return 0;
        } else {
          return res.id;
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports pipe operator lowering and type checking', () => {
    const program = `
      fn add(a: int, b: int) -> int { return a + b; }
      fn double(x: int) -> int { return x * 2; }
      fn main() {
        let base = 10 |> add(5) |> double();
        return base;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('supports ref parameters with lvalue arguments', () => {
    const program = `
      fn bump(ref x: int) -> int { return x + 1; }
      fn main() {
        let mut v: int = 1;
        return bump(v);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('flags ref parameters with non-lvalue arguments', () => {
    const program = `
      fn bump(ref x: int) -> int { return x + 1; }
      fn main() {
        return bump(1);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/expects a reference/);
  });

  test('allows pipe into ref parameters from lvalues', () => {
    const program = `
      fn inc(ref x: int) -> int { return x + 1; }
      fn main() {
        let mut v: int = 1;
        let y = v |> inc();
        return y;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('errors when passing immutable values by ref mut', () => {
    const program = `
      fn bump(ref mut x: int) -> int { return x + 1; }
      fn main() {
        let x: int = 1;
        return bump(x);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const warning = analysis.diagnostics.find(d => d.code === 'REF_MUT_REQUIRED');
    expect(warning?.severity).toBe('error');
  });

  test('supports enum payload destructuring with multiple fields', () => {
    const program = `
      enum Pair { Pair(int, string) }
      fn main() {
        match Pair(1, "a") {
          Pair(x, y) => { return x; }
        }
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('suggests similar identifiers', () => {
    const program = `
      fn print() { return 1; }
      fn main() {
        return primt();
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const diag = analysis.diagnostics.find(d => d.code === 'UNKNOWN_FUNCTION' || d.code === 'UNKNOWN_IDENTIFIER');
    expect(diag?.relatedInformation?.[0]?.message).toMatch(/Did you mean 'print'/);
  });

  test('suggests similar types', () => {
    const program = `
      type Person = { id: int };
      fn main() {
        let user: Persno = 1;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const diag = analysis.diagnostics.find(d => d.code === 'UNKNOWN_TYPE');
    expect(diag?.relatedInformation?.[0]?.message).toMatch(/Did you mean 'Person'/);
  });

  test('supports generics in types and functions', () => {
    const program = `
      pub type Box<T> = { value: T };
      fn id<T>(x: T) -> T { return x; }
      fn main() {
        return id<int>(1);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    expect(analysis.diagnostics.length).toBe(0);
  });

  test('infers generic type arguments', () => {
    const program = `
      fn id<T>(x: T) -> T { return x; }
      fn main() {
        return id(1);
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    expect(analysis.diagnostics.length).toBe(0);
  });

  test('infers generic type arguments from expected return type', () => {
    const program = `
      extern fn make<T>() -> T;
      fn main() {
        let value: int = make();
        return value;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    expect(analysis.diagnostics.length).toBe(0);
  });

  test('requires explicit type arguments for generic types', () => {
    const program = `
      type Box<T> = { value: T };
      fn main() {
        let item: Box = 1;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Missing type arguments for generic type 'Box'/);
  });

  test('enforces generic bounds', () => {
    const program = `
      fn id<T: int>(x: T) -> T { return x; }
      fn main() { return id<string>("x"); }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const boundDiag = analysis.diagnostics.find(d => d.code === 'BOUND_MISMATCH');
    expect(boundDiag?.message).toMatch(/does not satisfy bound/);
    expect(boundDiag?.relatedInformation?.[0]?.message).toMatch(/Expected: int/);
  });

  test('supports multiple bounds', () => {
    const program = `
      fn id<T: int & int>(x: T) -> T { return x; }
      fn main() { return id<int>(1); }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    expect(analysis.diagnostics.length).toBe(0);
  });

  test('flags write-only bindings', () => {
    const program = `
      fn main() {
        let mut x: int = 0;
        x = 1;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Unused binding 'x' \(assigned but never read\)/);
  });

  test('flags assignment to immutable variables', () => {
    const program = `
      fn main() {
        let x: int = 1;
        x = 2;
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Cannot assign to immutable variable 'x'/);
  });

  test('allows assignment to mutable variables', () => {
    const program = `
      fn main() {
        let mut x: int = 1;
        x = 2;
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const errors = analysis.diagnostics.filter(d => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  test('flags use before assignment in initializer', () => {
    const program = `
      fn main() {
        let x: int = x + 1;
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/used before assignment/);
  });

  test('infers local variable types from literals', () => {
    const program = `
      fn main() {
        let x = 5;
        let y = "hi";
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Could not infer type/);
    expect(messages).not.toMatch(/Unknown type/);
  });

  test('infers variable type from expressions', () => {
    const program = `
      fn main() {
        let x = 5;
        let y = x + 2;
        return y;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Could not infer type/);
    expect(messages).not.toMatch(/Type mismatch/);
  });

  test('flags mismatched assignment after inference', () => {
    const program = `
      fn main() {
        let mut x = 5;
        x = "oops";
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Type mismatch/);
  });

  test('infers function return types from return statements', () => {
    const program = `
      fn add(a: int, b: int) {
        return a + b;
      }
      fn main() {
        let x = add(1, 2);
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Inconsistent return types/);
    expect(messages).not.toMatch(/Type mismatch/);
  });

  test('infers return types even when defined after call', () => {
    const program = `
      fn main() {
        let x = add(5, 5);
        return x;
      }
      fn add(a: int, b: int) {
        return a + b;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Could not infer type/);
    expect(messages).not.toMatch(/Inconsistent return types/);
  });

  test('detects recursive inference loops', () => {
    const program = `
      fn a() { return b(); }
      fn b() { return a(); }
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Recursive inference detected/);
  });

  test('reports inconsistent function return types', () => {
    const program = `
      fn bad(flag: bool) {
        if (flag) { return 1; }
        return "no";
      }
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Inconsistent return types/);
  });

  test('infers type from member access', () => {
    const program = `
      struct User { id: int, name: string }
      extern fn getUser() -> User;
      fn main() {
        let user = getUser();
        let id = user.id;
        return id;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Could not infer type/);
    expect(messages).not.toMatch(/Unknown type/);
  });

  test('flags unused top-level bindings', () => {
    const program = `
      let top: int = 1;
      fn main() { return 0; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Unused binding 'top'/);
  });

  test('does not flag top-level bindings used in functions', () => {
    const program = `
      let top: int = 1;
      fn main() { return top; }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).not.toMatch(/Unused binding 'top'/);
  });

  test('ignores error nodes during analysis while reporting syntax diagnostics', () => {
    const program = `
      fn main() {
        let x: int = ;
        return 1;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Invalid syntax/);
  });

  test('emits CFG dot output when enabled', () => {
    const program = `
      fn main() {
        let mut x: int = 0;
        if (true) { x = 1; }
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never, { diDebug: true });
    const dot = analysis.diGraphs?.get('main') ?? '';
    expect(dot).toMatch(/digraph main_cfg/);
    expect(dot).toMatch(/If/);
  });
});
