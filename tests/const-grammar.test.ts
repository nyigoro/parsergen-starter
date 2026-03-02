import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic Grammar', () => {
  it('parses const type parameter', () => {
    const ast = parseProgram(
      `
      struct A<T, const N: usize> {
        data: [T; N]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    expect(decl.typeParams).toHaveLength(2);
    expect(decl.typeParams?.[1]).toMatchObject({
      name: 'N',
      isConst: true,
      constType: 'usize',
    });
  });

  it('parses const binary expressions in array sizes', () => {
    const ast = parseProgram(
      `
      struct A<T, const N: usize> {
        data: [T; N * 2]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    const fieldType = decl.body[0]?.typeName as { kind?: string; size?: { type?: string; op?: string } } | undefined;
    expect(fieldType?.kind).toBe('array');
    expect(fieldType?.size?.type).toBe('ConstBinary');
    expect(fieldType?.size?.op).toBe('*');
  });

  it('parses comparison and boolean operators in const expressions', () => {
    const ast = parseProgram(
      `
      struct A<const N: usize, const M: usize> {
        data: [i32; if N > 0 && M > 0 { N } else { 1 }]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    const fieldType = decl.body[0]?.typeName as { kind?: string; size?: { type?: string; condition?: { type?: string; op?: string } } } | undefined;
    expect(fieldType?.kind).toBe('array');
    expect(fieldType?.size?.type).toBe('ConstIf');
    expect(fieldType?.size?.condition?.type).toBe('ConstBinary');
    expect(fieldType?.size?.condition?.op).toBe('&&');
  });

  it('parses min/max const calls', () => {
    const ast = parseProgram(
      `
      struct A<const N: usize, const M: usize> {
        data: [i32; max(N, min(M, 4))]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    const fieldType = decl.body[0]?.typeName as { kind?: string; size?: { type?: string; name?: string } } | undefined;
    expect(fieldType?.kind).toBe('array');
    expect(fieldType?.size?.type).toBe('ConstCall');
    expect(fieldType?.size?.name).toBe('max');
  });

  it('parses const where clauses on functions and impls', () => {
    const ast = parseProgram(
      `
      trait SizedMark {
        fn mark(self: Self) -> i32;
      }

      fn repeat<const N: usize>(s: string) -> string where N > 0 {
        s
      }

      impl<T, const N: usize> SizedMark for [T; N] where N > 0 {
        fn mark(self: Self) -> i32 {
          1
        }
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl).toBeDefined();
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    expect(fnDecl.whereClauses).toHaveLength(1);
    expect(fnDecl.whereClauses?.[0]?.type).toBe('ConstBinary');

    const implDecl = ast.body.find((stmt) => stmt.type === 'ImplDecl');
    expect(implDecl).toBeDefined();
    if (!implDecl || implDecl.type !== 'ImplDecl') return;
    expect(implDecl.whereClauses).toHaveLength(1);
    expect(implDecl.whereClauses?.[0]?.type).toBe('ConstBinary');
  });

  it('parses turbofish const generic calls', () => {
    const ast = parseProgram(
      `
      fn fill<const N: usize>(value: i32) -> i32 where N > 0 {
        value
      }

      fn main() -> i32 {
        fill::<3>(1)
      }
      `.trim() + '\n'
    );
    const main = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'main');
    expect(main).toBeDefined();
    if (!main || main.type !== 'FnDecl') return;
    const exprStmt = main.body.body[0];
    expect(exprStmt?.type).toBe('ExprStmt');
    if (!exprStmt || exprStmt.type !== 'ExprStmt') return;
    expect(exprStmt.expr.type).toBe('Call');
    if (exprStmt.expr.type !== 'Call') return;
    expect(exprStmt.expr.typeArgs).toHaveLength(1);
  });
});
