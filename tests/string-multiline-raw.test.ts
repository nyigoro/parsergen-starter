import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram, LuminaStatement, LuminaExpr, LuminaFnDecl } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const expectStringExpr = (expr: LuminaExpr | null) => {
  expect(expr).not.toBeNull();
  expect(expr?.type).toBe('String');
  return expr as Extract<LuminaExpr, { type: 'String' }>;
};

const expectInterpolatedStringExpr = (expr: LuminaExpr | null) => {
  expect(expr).not.toBeNull();
  expect(expr?.type).toBe('InterpolatedString');
  return expr as Extract<LuminaExpr, { type: 'InterpolatedString' }>;
};

const findLetValue = (ast: LuminaProgram, name: string): LuminaExpr | null => {
  const fn = ast.body.find((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl');
  if (!fn) return null;
  for (const stmt of fn.body.body as LuminaStatement[]) {
    if (stmt.type === 'Let' && stmt.name === name) return stmt.value;
  }
  return null;
};

describe('Raw and multi-line strings', () => {
  it('parses raw strings without escapes', () => {
    const source = `
      fn main() -> string {
        let p = r"C:\\path\\to\\file";
        p
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const value = expectStringExpr(findLetValue(ast, 'p'));
    expect(value.value).toBe('C:\\path\\to\\file');
  });

  it('parses triple-quoted multi-line strings', () => {
    const source = `
      fn main() -> string {
        let m = """Hello
World""";
        m
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const value = expectStringExpr(findLetValue(ast, 'm'));
    expect(value.value).toBe('Hello\nWorld');
  });

  it('supports interpolation in triple-quoted strings', () => {
    const source = `
      fn main() -> string {
        let name = "Ada";
        let m = """Hello {name}""";
        m
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    expectInterpolatedStringExpr(findLetValue(ast, 'm'));
  });
});
