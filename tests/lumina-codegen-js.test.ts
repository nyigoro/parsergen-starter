import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Lumina AST JS codegen', () => {
  test('emits basic function and let binding', () => {
    const program = `
      fn add(a: int, b: int) { return a + b; }
      fn main() {
        let x = add(1, 2);
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('function add');
    expect(code).toContain('const x = add(1, 2);');
  });

  test('emits match expression as IIFE', () => {
    const program = `
      enum Option<T> { Some(T), None }
      fn main() {
        let x = Option.Some(1);
        let y = match x {
          Option.Some(v) => v,
          Option.None => 0,
        };
        return y;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('(() =>');
    expect(code).toContain('$tag');
    expect(code).toContain('const v =');
    expect(code).toContain('__match_result_');
  });

  test('registers Hash/Eq trait impls and tags struct literals', () => {
    const program = `
      trait Hash { fn hash(self: Self) -> u64; }
      trait Eq { fn eq(self: Self, other: Self) -> bool; }

      struct Point { x: i32, y: i32 }

      impl Hash for Point {
        fn hash(self: Point) -> u64 { return 1u64; }
      }

      impl Eq for Point {
        fn eq(self: Point, other: Point) -> bool { return self.x == other.x && self.y == other.y; }
      }

      fn make() -> Point {
        Point { x: 1, y: 2 }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as never;
    const { code } = generateJSFromAst(ast);
    expect(code).toContain('__lumina_register_trait_impl("Hash", "Point"');
    expect(code).toContain('__lumina_register_trait_impl("Eq", "Point"');
    expect(code).toContain('__lumina_struct("Point"');
  });
});
