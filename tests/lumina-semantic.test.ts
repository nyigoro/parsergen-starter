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
    expect(analysis.diagnostics.length).toBe(0);
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
    expect(analysis.diagnostics.length).toBe(0);
  });
});
