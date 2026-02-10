import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { lowerLumina } from '../src/lumina/lower.js';
import { optimizeIR } from '../src/lumina/optimize.js';
import { irToDot } from '../src/lumina/ir-dot.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('IR Graphviz export', () => {
  test('generates dot output', () => {
    const program = `
      fn main() {
        let x: int = 1 + 2;
        return x;
      }
    `.trim() + '\n';

    const result = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(result as never))!;
    const dot = irToDot(ir);
    expect(dot).toContain('digraph LuminaIR');
    expect(dot).toContain('Function main');
  });
});
