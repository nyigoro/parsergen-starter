import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { lowerLumina } from '../src/lumina/lower.js';
import { optimizeIR } from '../src/lumina/optimize.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('IR SSA conversion', () => {
  test('removes Assign nodes in linear functions', () => {
    const program = `
      fn main() {
        let x: int = 1;
        x = 2;
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;

    const hasAssign = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const n = node as { kind?: string; body?: unknown[]; value?: unknown; expr?: unknown; thenBody?: unknown[]; elseBody?: unknown[] };
      if (n.kind === 'Assign') return true;
      if (Array.isArray(n.body) && n.body.some(hasAssign)) return true;
      if (Array.isArray(n.thenBody) && n.thenBody.some(hasAssign)) return true;
      if (Array.isArray(n.elseBody) && n.elseBody.some(hasAssign)) return true;
      if (n.value && hasAssign(n.value)) return true;
      if (n.expr && hasAssign(n.expr)) return true;
      return false;
    };

    expect(hasAssign(ir)).toBe(false);
  });

  test('inserts Phi nodes for if/else joins', () => {
    const program = `
      fn main(flag: bool) {
        let x: int = 0;
        if (flag) { x = 1; } else { x = 2; }
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;

    const hasPhi = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const n = node as { kind?: string; body?: unknown[]; thenBody?: unknown[]; elseBody?: unknown[]; value?: unknown; expr?: unknown };
      if (n.kind === 'Phi') return true;
      if (Array.isArray(n.body) && n.body.some(hasPhi)) return true;
      if (Array.isArray(n.thenBody) && n.thenBody.some(hasPhi)) return true;
      if (Array.isArray(n.elseBody) && n.elseBody.some(hasPhi)) return true;
      if (n.value && hasPhi(n.value)) return true;
      if (n.expr && hasPhi(n.expr)) return true;
      return false;
    };

    expect(hasPhi(ir)).toBe(true);
  });

  test('preserves assignments inside loops to avoid SSA scoping issues', () => {
    const program = `
      fn main(flag: bool) {
        let x: int = 0;
        while (flag) {
          x = x + 1;
        }
        return x;
      }
    `.trim() + '\n';

    const ast = parser.parse(program);
    const ir = optimizeIR(lowerLumina(ast as never))!;

    const hasAssign = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const n = node as { kind?: string; body?: unknown[]; thenBody?: unknown[]; elseBody?: unknown[]; value?: unknown; expr?: unknown };
      if (n.kind === 'Assign') return true;
      if (Array.isArray(n.body) && n.body.some(hasAssign)) return true;
      if (Array.isArray(n.thenBody) && n.thenBody.some(hasAssign)) return true;
      if (Array.isArray(n.elseBody) && n.elseBody.some(hasAssign)) return true;
      if (n.value && hasAssign(n.value)) return true;
      if (n.expr && hasAssign(n.expr)) return true;
      return false;
    };

    const hasPhi = (node: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      const n = node as { kind?: string; body?: unknown[]; thenBody?: unknown[]; elseBody?: unknown[]; value?: unknown; expr?: unknown };
      if (n.kind === 'Phi') return true;
      if (Array.isArray(n.body) && n.body.some(hasPhi)) return true;
      if (Array.isArray(n.thenBody) && n.thenBody.some(hasPhi)) return true;
      if (Array.isArray(n.elseBody) && n.elseBody.some(hasPhi)) return true;
      if (n.value && hasPhi(n.value)) return true;
      if (n.expr && hasPhi(n.expr)) return true;
      return false;
    };

    expect(hasAssign(ir)).toBe(true);
    expect(hasPhi(ir)).toBe(false);
  });
});
