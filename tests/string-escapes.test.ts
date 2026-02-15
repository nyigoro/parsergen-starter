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

const findLetValue = (ast: LuminaProgram, name: string): LuminaExpr | null => {
  const fn = ast.body.find((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl');
  if (!fn) return null;
  for (const stmt of fn.body.body as LuminaStatement[]) {
    if (stmt.type === 'Let' && stmt.name === name) return stmt.value;
  }
  return null;
};

describe('String escape sequences', () => {
  it('parses common and extended escapes', () => {
    const source = `
      fn main() -> string {
        let a = "A\\nB";
        let b = "Tab\\tEnd";
        let c = "Hex\\x41";
        let d = "Uni\\u263A";
        let e = "Emoji\\u{1F600}";
        let f = "Back\\bspace";
        let g = "Form\\fFeed";
        let h = "Vert\\vTab";
        let i = "Esc\\e";
        let j = "\\{\\}";
        a
      }
    `.trim() + '\n';

    const ast = parseProgram(source);

    const a = expectStringExpr(findLetValue(ast, 'a'));
    expect(a.value).toBe(`A\nB`);

    const b = expectStringExpr(findLetValue(ast, 'b'));
    expect(b.value).toBe(`Tab\tEnd`);

    const c = expectStringExpr(findLetValue(ast, 'c'));
    expect(c.value).toBe('HexA');

    const d = expectStringExpr(findLetValue(ast, 'd'));
    expect(d.value).toBe(`Uni${String.fromCharCode(0x263A)}`);

    const e = expectStringExpr(findLetValue(ast, 'e'));
    expect(e.value).toBe(`Emoji${String.fromCodePoint(0x1f600)}`);

    const f = expectStringExpr(findLetValue(ast, 'f'));
    expect(f.value).toBe(`Back\bspace`);

    const g = expectStringExpr(findLetValue(ast, 'g'));
    expect(g.value).toBe(`Form\fFeed`);

    const h = expectStringExpr(findLetValue(ast, 'h'));
    expect(h.value).toBe(`Vert\vTab`);

    const i = expectStringExpr(findLetValue(ast, 'i'));
    expect(i.value).toBe(`Esc${String.fromCharCode(0x1b)}`);

    const j = expectStringExpr(findLetValue(ast, 'j'));
    expect(j.value).toBe('{}');
  });

  it('throws on invalid unicode escape', () => {
    const source = `
      fn main() -> string {
        let bad = "\\u{110000}";
        bad
      }
    `.trim() + '\n';

    expect(() => parseProgram(source)).toThrow();
  });
});
