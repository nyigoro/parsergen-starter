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
        let i: int = 0;
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
    expect(messages).toMatch(/Non-exhaustive match/);
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
        let x: int = 0;
        x = 1;
        return 0;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const analysis = analyzeLumina(result as never);
    const messages = analysis.diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Unused binding 'x' \(assigned but never read\)/);
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
});
