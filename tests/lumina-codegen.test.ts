import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { lowerLumina } from '../src/lumina/lower.js';
import { generateJS } from '../src/lumina/codegen.js';
import { optimizeIR } from '../src/lumina/optimize.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Lumina codegen', () => {
  test('generates JS from AST', () => {
    const program = `
      fn main() {
        let x: int = 1 + 2;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'cjs', sourceMap: true }).code;

    expect(out).toMatch(/function main/);
    expect(out).toMatch(/let x =/);
    expect(out).toMatch(/return x/);
    expect(out).toMatch(/module.exports/);
  });
});
