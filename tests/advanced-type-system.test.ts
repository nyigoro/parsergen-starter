import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('advanced type system syntax (mvp)', () => {
  it('parses const generics and array repeat literals', () => {
    const source = `
      struct Fixed<T, const N: usize> {
        data: [T; N]
      }

      fn build() -> Vec<i32> {
        [0; 5]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const fixed = ast.body.find((stmt) => stmt.type === 'StructDecl' && stmt.name === 'Fixed');
    expect(fixed?.type).toBe('StructDecl');
    if (!fixed || fixed.type !== 'StructDecl') return;

    expect(fixed.typeParams?.length).toBe(2);
    expect(fixed.typeParams?.[1]?.isConst).toBe(true);
    expect(fixed.typeParams?.[1]?.constType).toBe('usize');
    expect(typeof fixed.body[0]?.typeName).toBe('object');

    const build = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'build');
    expect(build?.type).toBe('FnDecl');
    if (!build || build.type !== 'FnDecl') return;
    const exprStmt = build.body.body[0];
    expect(exprStmt?.type).toBe('ExprStmt');
    if (!exprStmt || exprStmt.type !== 'ExprStmt') return;
    expect(exprStmt.expr.type).toBe('ArrayRepeatLiteral');
  });

  it('type checks array repeat count as integer', () => {
    const source = `
      fn bad_repeat() -> Vec<i32> {
        [0; true]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(
      sem.diagnostics.some(
        (diag) => diag.severity === 'error' && String(diag.message).includes('Array repeat count must be integer')
      )
    ).toBe(true);
  });

  it('emits JS for array repeat literals', () => {
    const source = `
      fn build() -> Vec<i32> {
        [0; 5]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { includeRuntime: false }).code;
    expect(js).toContain('Array.from({ length: Math.max(0, Math.trunc(5)) }, () => 0)');
  });

  it('reports GADT declarations as unsupported in semantic analysis', () => {
    const source = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>,
        If(Expr<bool>, Expr<T>, Expr<T>): Expr<T>
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'UNSUPPORTED_GADT')).toBe(true);
  });

  it('reports higher-kinded type params as unsupported in semantic analysis', () => {
    const source = `
      trait Functor<F<_>> {
        fn map(fa: F<i32>) -> F<i32>;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'UNSUPPORTED_HKT')).toBe(true);
  });
});
