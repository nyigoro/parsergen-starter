import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { lowerLumina } from '../src/lumina/lower.js';
import { optimizeIR } from '../src/lumina/optimize.js';
import { generateJS } from '../src/lumina/codegen.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Lumina DCE', () => {
  test('removes unused functions from output', () => {
    const program = `
      fn helper() { return 1; }
      fn used() { return helper(); }
      fn unused() { return 2; }
      fn main() { return used(); }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('function main');
    expect(out).toContain('function used');
    expect(out).toContain('function helper');
    expect(out).not.toContain('function unused');
  });

  test('keeps cross-function call chain from main', () => {
    const program = `
      fn leaf() { return 1; }
      fn mid() { return leaf(); }
      fn top() { return mid(); }
      fn main() { return top(); }
      fn unused() { return 0; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('function main');
    expect(out).toContain('function top');
    expect(out).toContain('function mid');
    expect(out).toContain('function leaf');
    expect(out).not.toContain('function unused');
  });

  test('drops unreferenced helpers even when other helpers exist', () => {
    const program = `
      fn helperA() { return 1; }
      fn helperB() { return 2; }
      fn main() { return helperA(); }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('function helperA');
    expect(out).not.toContain('function helperB');
  });

  test('preserves top-level statements', () => {
    const program = `
      let top: int = 1;
      fn main() { return top; }
      fn unused() { return 0; }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('let top');
    expect(out).toContain('function main');
    expect(out).not.toContain('function unused');
  });

  test('keeps functions referenced from match branches', () => {
    const program = `
      enum Option { Some(int), None }
      fn onSome() { return 1; }
      fn onNone() { return 0; }
      fn main() {
        let value: int = match Some(1) {
          Some(_) => onSome(),
          None => onNone(),
        };
        return value;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('function onSome');
    expect(out).toContain('function onNone');
  });

  test('drops functions referenced only in dead branches', () => {
    const program = `
      fn unusedBranch() { return 2; }
      fn main() {
        if (false) {
          return unusedBranch();
        } else {
          return 1;
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('function main');
    expect(out).not.toContain('function unusedBranch');
  });

  test('removes unreachable statements after return', () => {
    const program = `
      fn main() {
        return 1;
        let y: int = 2;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const ir = optimizeIR(lowerLumina(ast as never))!;
    const out = generateJS(ir, { target: 'esm' }).code;

    expect(out).toContain('return 1');
    expect(out).not.toContain('let y');
  });
});
