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
});
