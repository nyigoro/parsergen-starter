import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const findMember = (
  node: unknown,
  property: string,
  objectName?: string
): { id?: number } | null => {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMember(child, property, objectName);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Member' && obj.property === property) {
    if (objectName) {
      const target = obj.object as { type?: string; name?: string } | undefined;
      if (target?.type === 'Identifier' && target.name === objectName) {
        return obj as { id?: number };
      }
    } else {
      return obj as { id?: number };
    }
  }
  for (const value of Object.values(obj)) {
    const found = findMember(value, property, objectName);
    if (found) return found;
  }
  return null;
};

describe('namespace and scope behavior', () => {
  test('warns when local binding shadows imported namespace', () => {
    const program = `
      import * as math from "@std/math";
      fn main() {
        let math = 1;
        return math;
      }
    `.trim() + '\n';

    const ast = parseProgram(program);
    const analysis = analyzeLumina(ast);
    const warning = analysis.diagnostics.find((diag) => diag.code === 'SHADOWED_IMPORT');
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toMatch(/shadows namespace 'math'/);
  });

  test('keeps namespace available outside inner shadowed scope', () => {
    const program = `
      import * as math from "@std/math";
      fn main() -> int {
        if (true) {
          let math = 1;
          let x = math;
        }
        return math.min(1, 2);
      }
    `.trim() + '\n';

    const ast = parseProgram(program);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('HM does not resolve module members when namespace is shadowed', () => {
    const program = `
      import * as math from "@std/math";
      fn main() {
        let math = 1;
        let p = math.pi;
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(program);
    const result = inferProgram(ast as never);
    const member = findMember(ast, 'pi', 'math');
    expect(member?.id).toBeDefined();
    if (member?.id != null) {
      expect(result.inferredExprs.has(member.id)).toBe(false);
    }
  });
});
