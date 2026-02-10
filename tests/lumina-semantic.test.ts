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
});
