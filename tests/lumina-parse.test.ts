import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { parseLumina, LuminaSyntaxError } from '../src/lumina/parser.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Lumina parse wrapper', () => {
  test('parses lumina program with typed wrapper', () => {
    const program = `
      fn main() {
        return 1;
      }
    `.trim() + '\n';

    const ast = parseLumina(parser, program);
    expect(ast.type).toBe('Program');
  });

  test('throws LuminaSyntaxError with formatted message', () => {
    const program = `
      fn main() {
        return 1;
      }
    `.trim() + '\n';

    try {
      parseLumina(parser, program, { grammarSource: 'example.lm', startRule: 'MissingRule' });
      throw new Error('Expected parseLumina to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(LuminaSyntaxError);
      const error = err as LuminaSyntaxError;
      expect(error.message).toMatch(/Lumina Syntax Error/);
      expect(error.message).toMatch(/example\.lm/);
    }
  });

  test('parses chained method calls and member access', () => {
    const program = `
      fn main() {
        let x = obj.child.method();
        let y = obj.method().field;
        let w = obj.method()[0];
        let r = obj.method()[0..2];
        let z = obj.method().child.method();
        return 0;
      }
    `.trim() + '\n';

    const ast = parseLumina(parser, program);
    expect(ast.type).toBe('Program');
  });

  test('parses if-let, let-else, tuple patterns, and guarded match arms', () => {
    const program = `
      struct User { age: i32 }

      fn main() -> i32 {
        let pair = (1, 2);
        let (a, b) = pair else { return 0; };

        if let (x, y) = pair {
          x + y
        } else {
          a + b
        }

        let user = User { age: 10 };
        match user {
          User { age: n } if n > 5 => n,
          _ => 0
        }
      }
    `.trim() + '\n';

    const ast = parseLumina(parser, program);
    expect(ast.type).toBe('Program');
  });
});
