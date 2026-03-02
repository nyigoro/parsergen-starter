import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic AST', () => {
  it('parses const parameter metadata on type params', () => {
    const ast = parseProgram(
      `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    expect(decl.typeParams?.[1]?.isConst).toBe(true);
    expect(decl.typeParams?.[1]?.constType).toBe('usize');
  });

  it('parses fixed-size array with const size expression node', () => {
    const ast = parseProgram(
      `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    const fieldType = decl.body[0]?.typeName;
    expect(typeof fieldType).toBe('object');
    if (!fieldType || typeof fieldType !== 'object' || (fieldType as { kind?: string }).kind !== 'array') return;
    const arrayType = fieldType as { size?: { type?: string } };
    expect(arrayType.size?.type).toBe('ConstParam');
  });

  it('captures extended const expression nodes in array size', () => {
    const ast = parseProgram(
      `
      struct Vec<const N: usize, const M: usize> {
        data: [i32; if N < M { max(N, 1) } else { min(M, 2) }]
      }
      `.trim() + '\n'
    );
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    const fieldType = decl.body[0]?.typeName as { kind?: string; size?: { type?: string; thenExpr?: { type?: string } } } | undefined;
    expect(fieldType?.kind).toBe('array');
    expect(fieldType?.size?.type).toBe('ConstIf');
    expect(fieldType?.size?.thenExpr?.type).toBe('ConstCall');
  });
});
