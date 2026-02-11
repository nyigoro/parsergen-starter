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
    const result = generateJS(ir, { target: 'cjs', sourceMap: true });
    const out = result.code;

    expect(out).toMatch(/function main/);
    expect(out).toMatch(/return 3/);
    expect(out).toMatch(/module.exports/);
    expect(result.map?.mappings.length).toBeGreaterThan(0);
  });

  test('generates calls and if statements', () => {
    const program = `
      fn add(a: int, b: int) -> int {
        return a + b;
      }

      fn main() {
        let x: int = add(1, 2);
        if (true) { return x; } else { return 0; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/function add/);
    expect(out).toMatch(/add\(1, 2\)/);
    expect(out).toMatch(/return x/);
  });

  test('generates comparisons and boolean ops', () => {
    const program = `
      fn main() {
        let ok: bool = (1 < 2) && (2 <= 3);
        if (1 == 1 || false) { return 1; } else { return 0; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/return 1/);
  });

  test('generates while loops and assignment', () => {
    const program = `
      fn main() {
        let i: int = 0;
        while (i < 3) {
          i = i + 1;
        }
        return i;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/while \(true\)/);
    expect(out).toMatch(/i_\d+ = 1/);
  });

  test('folds constant if branches', () => {
    const program = `
      fn main() {
        if (true) { return 1; } else { return 2; }
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/return 1/);
    expect(out).not.toMatch(/return 2/);
    expect(out).not.toMatch(/if \(/);
  });

  test('simplifies algebraic identities', () => {
    const program = `
      fn main() {
        let x: int = 1;
        let a: int = x + 0;
        let b: int = 0 + x;
        let c: int = x * 1;
        let d: int = 1 * x;
        let e: int = x - 0;
        let f: int = x / 1;
        let g: int = x * 0;
        return a + b + c + d + e + f + g;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/return 6/);
  });

  test('propagates constants', () => {
    const program = `
      fn main() {
        let x: int = 2;
        let y: int = x + 3;
        return y;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toMatch(/return 5/);
  });

  test('removes dead stores', () => {
    const program = `
      fn main() {
        let x: int = 1;
        let y: int = 2;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).not.toMatch(/let y = 2/);
  });

  test('validates IR structure', () => {
    const program = `
      fn main() {
        let x: int = 1;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never));
    expect(ir).not.toBeNull();
  });
});
