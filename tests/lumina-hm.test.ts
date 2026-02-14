import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const findOptionNone = (node: unknown): { id?: number } | null => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOptionNone(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (
    obj.type === 'Member' &&
    (obj.object as { type?: string; name?: string } | undefined)?.type === 'Identifier' &&
    (obj.object as { type?: string; name?: string } | undefined)?.name === 'Option' &&
    obj.property === 'None'
  ) {
    return obj as { id?: number };
  }
  for (const value of Object.values(obj)) {
    const found = findOptionNone(value);
    if (found) return found;
  }
  return null;
};

const findMember = (
  node: unknown,
  property: string,
  objectName?: string
): { id?: number } | null => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMember(child, property, objectName);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Member' && obj.property === property) {
    if (objectName) {
      const target = obj.object as { type?: string; name?: string } | undefined;
      if (target?.type === 'Identifier' && target.name === objectName) {
        return obj as { id?: number };
      }
    } else {
      return obj as { id?: number };
    }
  }
  for (const value of Object.values(obj)) {
    const found = findMember(value, property, objectName);
    if (found) return found;
  }
  return null;
};

describe('Lumina HM shadow inference', () => {
  test('infers simple function usage without diagnostics', () => {
    const program = `
      fn add(a: int, b: int) {
        return a + b;
      }
      fn main() {
        let x = add(1, 2);
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers unannotated parameters via HM', () => {
    const program = `
      fn add(x, y) {
        return x + y;
      }
      fn main() {
        return add(1, 2);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('reports arity mismatch with LUM-002', () => {
    const program = `
      fn add(a: int, b: int) { return a + b; }
      fn main() { return add(1); }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('LUM-002');
  });

  test('accepts sized integer literals with annotations', () => {
    const program = `
      fn main() {
        let x: i64 = 42i64;
        let y: u8 = 255u8;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers float literals as f64', () => {
    const program = `
      fn main() {
        let x = 3.1415;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('handles mutually recursive functions without annotations', () => {
    const program = `
      fn is_even(n) {
        return is_odd(n);
      }
      fn is_odd(n) {
        return is_even(n);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers match expression with enum patterns', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x = Option.Some(1);
        let y = match x {
          Option.Some(v) => v,
          Option.None => 0
        };
        return y;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('reports non-bool if condition in HM inference', () => {
    const program = `
      fn main() {
        if (1) { return 0; } else { return 1; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('LUM-001');
  });

  test('reports non-exhaustive match with LUM-003', () => {
    const program = `
      enum Status { Active, Inactive, Pending }
      fn main() {
        let s = Status.Active;
        match s {
          Status.Active => { return 1; },
          Status.Inactive => { return 0; },
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('LUM-003');
  });

  test('skips exhaustiveness when wildcard is present', () => {
    const program = `
      enum Status { Active, Inactive, Pending }
      fn main() {
        let s = Status.Active;
        match s {
          Status.Active => { return 1; },
          _ => { return 0; },
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).not.toContain('LUM-003');
  });

  test('infers async functions as Promise return types', () => {
    const program = `
      async fn fetch_data() {
        return 1;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const fnReturn = result.inferredFnByName.get('fetch_data') as { kind?: string; inner?: { kind?: string; name?: string } } | undefined;
    expect(fnReturn?.kind).toBe('promise');
    expect(fnReturn?.inner?.kind).toBe('primitive');
    expect(fnReturn?.inner?.name).toBe('i32');
  });

  test('allows await inside async functions', () => {
    const program = `
      async fn get_value() { return 1; }
      async fn main() {
        let x = await get_value();
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).not.toContain('AWAIT_OUTSIDE_ASYNC');
  });

  test('reports await outside async functions', () => {
    const program = `
      fn main() {
        let x = await get_value();
        return x;
      }
      async fn get_value() { return 1; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('AWAIT_OUTSIDE_ASYNC');
  });

  test('narrows with is in if condition', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x = Option.Some(1);
        if (x is Option.Some) { return 1; } else { return 0; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('smart else narrowing for two-variant enums', () => {
    const program = `
      enum Result<T, E> { Ok(T), Err(E) }
      fn main() {
        let r = Result.Ok(1);
        if (r is Result.Ok) { return 1; } else { return 0; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('allows recursive types through Option wrapper', () => {
    const program = `
      enum Option<T> { Some(T), None }
      struct Task {
        id: int,
        subtask: Option<Task>
      }
      fn main() {
        let t = Task { id: 1, subtask: Option.Some(Task { id: 2, subtask: Option.None }) };
        return t.id;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers Option.None in recursive struct literal using expected type', () => {
    const program = `
      enum Option<T> { Some(T), None }
      struct Task {
        id: int,
        subtask: Option<Task>
      }
      fn main() {
        let t = Task { id: 1, subtask: Option.None };
        return t.id;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('records inferred Option.None type in expression map', () => {
    const program = `
      enum Option<T> { Some(T), None }
      struct Task {
        id: int,
        subtask: Option<Task>
      }
      fn main() {
        let t = Task { id: 1, subtask: Option.None };
        return t.id;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);

    const noneNode = findOptionNone(ast);
    expect(typeof noneNode?.id).toBe('number');
    if (typeof noneNode?.id !== 'number') {
      throw new Error('Option.None id not found');
    }
    const inferred = result.inferredExprs.get(noneNode.id);
    expect(inferred).toBeDefined();
    expect(inferred).toMatchObject({ kind: 'adt', name: 'Option' });
    expect(inferred && 'params' in inferred ? inferred.params[0] : null).toMatchObject({ kind: 'adt', name: 'Task' });
  });

  test('infers row-polymorphic field access for struct arguments', () => {
    const program = `
      struct User { id: int, name: string }
      fn get_id(obj) { return obj.id; }
      fn main() {
        let u = User { id: 1, name: "Ada" };
        return get_id(u);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never, { useRowPolymorphism: true });
    expect(result.diagnostics.length).toBe(0);
    const member = findMember(ast, 'id', 'obj');
    expect(member?.id).toBeDefined();
    const inferred = member?.id != null ? result.inferredExprs.get(member.id) : null;
    expect(inferred?.kind).toBe('primitive');
    if (inferred?.kind === 'primitive') {
      expect(inferred.name).toBe('int');
    }
  });

  test('rejects recursive structs without wrapper in HM', () => {
    const program = `
      struct Node {
        next: Node
      }
      fn main() { return 0; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('RECURSIVE_TYPE_ERROR');
  });
});
