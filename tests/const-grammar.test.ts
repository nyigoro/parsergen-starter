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
});

