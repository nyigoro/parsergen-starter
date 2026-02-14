import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram, LuminaStatement, LuminaExpr } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const findLetValue = (ast: LuminaProgram, name: string): LuminaExpr | null => {
  const fn = ast.body.find((stmt) => stmt.type === 'FnDecl') as any;
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
    const value = findLetValue(ast, 'p') as any;
    expect(value.type).toBe('String');
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
    const value = findLetValue(ast, 'm') as any;
    expect(value.type).toBe('String');
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
    const value = findLetValue(ast, 'm') as any;
    expect(value.type).toBe('InterpolatedString');
  });
});
