
import { compileGrammar, parseInput } from '../src/index';
import fs from 'node:fs';
import path from 'node:path';

const grammarPath = path.resolve(__dirname, '../examples/math.peg');
const mathGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(mathGrammar);

describe('Math PEG Parser', () => {
  test('parses simple expression', () => {
    const input = '3 + 5 * 2';
    const result = parseInput(parser, input);
    expect(result.success).toBe(true);
    if (result.success) {
      const successResult = result as { result: unknown };
      expect(successResult.result).toBeDefined();
    }
  });

  test('throws error on bad input', () => {
    const input = '3 + * 2';
    const result = parseInput(parser, input);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
    if (!result.success) {
      const errorResult = result as { error: string };
      expect(errorResult.error).toMatch(/expected/i);
    }
  });
});
