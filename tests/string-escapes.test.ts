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

    const a = findLetValue(ast, 'a') as any;
    expect(a.type).toBe('String');
    expect(a.value).toBe(`A\nB`);

    const b = findLetValue(ast, 'b') as any;
    expect(b.value).toBe(`Tab\tEnd`);

    const c = findLetValue(ast, 'c') as any;
    expect(c.value).toBe('HexA');

    const d = findLetValue(ast, 'd') as any;
    expect(d.value).toBe(`Uni${String.fromCharCode(0x263A)}`);

    const e = findLetValue(ast, 'e') as any;
    expect(e.value).toBe(`Emoji${String.fromCodePoint(0x1f600)}`);

    const f = findLetValue(ast, 'f') as any;
    expect(f.value).toBe(`Back\bspace`);

    const g = findLetValue(ast, 'g') as any;
    expect(g.value).toBe(`Form\fFeed`);

    const h = findLetValue(ast, 'h') as any;
    expect(h.value).toBe(`Vert\vTab`);

    const i = findLetValue(ast, 'i') as any;
    expect(i.value).toBe(`Esc${String.fromCharCode(0x1b)}`);

    const j = findLetValue(ast, 'j') as any;
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
