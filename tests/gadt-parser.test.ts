import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('GADT parser support', () => {
  test('parses indexed enum variant result types', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>,
        If(Expr<bool>, Expr<T>, Expr<T>): Expr<T>
      }
    `;
    const ast = parseProgram(source);
    const expr = ast.body.find((stmt) => stmt.type === 'EnumDecl' && stmt.name === 'Expr');
    expect(expr?.type).toBe('EnumDecl');
    if (!expr || expr.type !== 'EnumDecl') return;

    const lit = expr.variants.find((variant) => variant.name === 'Lit');
    expect(lit?.resultType).toBe('Expr<i32>');
  });

  test('parses existential parameters and variant constraints', () => {
    const source = `
      trait Show {
        fn show(self: Self) -> string;
      }

      enum Pack<T> {
        Hidden exists <A>(A): Pack<T> where A: Show
      }
    `;
    const ast = parseProgram(source);
    const pack = ast.body.find((stmt) => stmt.type === 'EnumDecl' && stmt.name === 'Pack');
    expect(pack?.type).toBe('EnumDecl');
    if (!pack || pack.type !== 'EnumDecl') return;
    const hidden = pack.variants.find((variant) => variant.name === 'Hidden');
    expect(hidden).toBeDefined();
    expect(hidden?.existentialTypeParams?.map((param) => param.name)).toEqual(['A']);
    expect(hidden?.constraints?.[0]?.name).toBe('A');
    expect(hidden?.constraints?.[0]?.bounds).toEqual(['Show']);
  });
});

