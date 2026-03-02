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

  test('allows existential payloads to use trait-bounded methods in match arms', () => {
    const source = `
      trait Show {
        fn show(self: Self) -> string;
      }

      enum ShowBox {
        Box exists <T>(T): ShowBox where T: Show
      }

      fn render(box: ShowBox) -> string {
        match box {
          ShowBox.Box(value) => value.show()
        }
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('does not require impossible variants for indexed exhaustiveness', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn eval(e: Expr<i32>) -> i32 {
        match e {
          Expr.Lit(n) => n
        }
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'MATCH_NOT_EXHAUSTIVE')).toBe(false);
  });

  test('reports unreachable indexed variant arms', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn eval(e: Expr<i32>) -> i32 {
        match e {
          Expr.Bool(b) => 0,
          Expr.Lit(n) => n
        }
      }
    `;
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const unreachable = sem.diagnostics.find((diag) => diag.code === 'LUM-004');
    expect(unreachable).toBeDefined();
    expect(unreachable?.message).toContain('type index mismatch');
  });
});
