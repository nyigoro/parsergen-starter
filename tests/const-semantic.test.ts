import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('Const Generic Semantic Analysis', () => {
  it('validates const param types', () => {
    const source = `
      struct Good<const N: usize> {
        data: [i32; N]
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const decl = ast.body[0];
    expect(decl?.type).toBe('StructDecl');
    if (!decl || decl.type !== 'StructDecl') return;
    if (decl.typeParams?.[0]) {
      (decl.typeParams[0] as { constType?: string }).constType = 'string';
    }
    const { diagnostics } = analyzeLumina(ast);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONST-INVALID-TYPE',
        message: expect.stringContaining('must be usize, i32, or i64'),
      })
    );
  });

  it('detects unbound const params', () => {
    const source = `
      struct Bad<T, const M: usize> {
        data: [T; N]
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONST-UNBOUND-PARAM',
        message: expect.stringContaining("Const parameter 'N'"),
        relatedInformation: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("Declared const parameter 'M'"),
          }),
        ]),
      })
    );
  });

  it('accepts valid const generics', () => {
    const source = `
      struct Vec<T, const N: usize> {
        data: [T; N]
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('validates const expressions', () => {
    const source = `
      struct Matrix<T, const ROWS: usize, const COLS: usize> {
        data: [T; ROWS * COLS]
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('validates const where clauses reference declared const params', () => {
    const source = `
      fn repeat<const N: usize>(s: string) -> string where M > 0 {
        s
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONST-UNBOUND-PARAM',
      })
    );
  });

  it('rejects const generic call when where clause is not satisfied', () => {
    const source = `
      fn fill<const N: usize>(value: i32) -> i32 where N > 0 {
        value
      }

      fn main() -> i32 {
        fill::<0>(42)
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CONST-WHERE-FAILED',
      })
    );
  });

  it('accepts const where clauses on impl declarations', () => {
    const source = `
      trait Marker {
        fn mark(self: Self) -> i32;
      }

      impl<T, const N: usize> Marker for [T; N] where N > 0 {
        fn mark(self: Self) -> i32 {
          1
        }
      }
    `.trim() + '\n';

    const { diagnostics } = analyzeLumina(parseProgram(source));
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
