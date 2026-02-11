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

  test('parses numeric literals with underscores and bases', () => {
    const program = `
      fn main() {
        let a: int = 0b1010;
        let b: int = 0x1A;
        let c: int = 1_000_000;
        return a + b + c;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const fn = (result as { body: Array<{ type?: string; body?: { body?: Array<{ type?: string; value?: { value?: number } }> } }> })
      .body.find((stmt) => stmt.type === 'FnDecl');
    const lets = fn?.body?.body?.filter((stmt) => stmt.type === 'Let') ?? [];
    expect(lets[0].value.value).toBe(10);
    expect(lets[1].value.value).toBe(26);
    expect(lets[2].value.value).toBe(1000000);
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
