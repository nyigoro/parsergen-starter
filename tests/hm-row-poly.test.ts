import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('HM row polymorphism (targeted)', () => {
  test('simple access infers open row constraint', () => {
    const program = `
      fn get_id(obj) { return obj.id; }
      fn main() { return 0; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never, { useRowPolymorphism: true });
    expect(result.diagnostics.length).toBe(0);
  });

  test('nominal struct is compatible with row constraint', () => {
    const program = `
      struct User { id: int, name: string }
      fn get_id(obj) { return obj.id; }
      fn main() {
        let u = User { id: 1, name: "alice" };
        return get_id(u);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never, { useRowPolymorphism: true });
    expect(result.diagnostics.length).toBe(0);
  });

  test('reports missing field when struct lacks required property', () => {
    const program = `
      struct NameOnly { name: string }
      fn get_id(obj) { return obj.id; }
      fn main() {
        let x = NameOnly { name: "no id" };
        return get_id(x);
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never, { useRowPolymorphism: true });
    const codes = result.diagnostics.map(d => d.code);
    expect(codes).toContain('LUM-001');
  });
});
