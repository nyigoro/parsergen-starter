import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('HM type holes', () => {
  test('infers element type for List<_>', () => {
    const program = `
      struct List<T> { value: T }
      fn main() {
        let x: List<_> = List { value: 1 };
        return 0;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers param type from usage', () => {
    const program = `
      fn foo(x: _) -> int { return x + 1; }
      fn main() { return foo(1); }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('infers return type from body', () => {
    const program = `
      fn foo(x: int) -> _ { return x * 2; }
      fn main() { return foo(2); }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });

  test('rejects unresolvable hole', () => {
    const program = `
      fn foo(x: _) { return x; }
      fn main() { return 0; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('LUM-010');
  });

  test('allows holes in generic instantiation', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x: Option<_> = Option.Some(1);
        return 0;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.length).toBe(0);
  });
});
