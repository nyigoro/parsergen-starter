import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('GADT semantic validation', () => {
  test('accepts valid GADT style variant result type', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Wrap(T): Expr<T>
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const gadtErrors = sem.diagnostics.filter((diag) => String(diag.code).startsWith('GADT-'));
    expect(gadtErrors).toHaveLength(0);
    expect(sem.diagnostics.some((diag) => diag.code === 'UNSUPPORTED_GADT')).toBe(false);
  });

  test('reports variant result type that does not return its enum', () => {
    const source = `
      enum Expr<T> {
        Bad(i32): Result<i32, string>
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'GADT-001')).toBe(true);
  });

  test('reports undeclared type variable usage in GADT variant', () => {
    const source = `
      enum Expr<T> {
        Bad(U): Expr<T>
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'GADT-002')).toBe(true);
  });
});

