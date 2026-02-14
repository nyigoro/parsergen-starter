import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('String slicing', () => {
  it('type checks string slicing with ranges', () => {
    const source = `
      fn main() -> string {
        let s = "Hello, world";
        s[0..5]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('emits range + index helpers in JS', () => {
    const source = `
      fn main() -> string {
        let s = "Hello";
        s[..=3]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('__lumina_range');
    expect(js).toContain('__lumina_slice');
  });

  it('reports invalid index types', () => {
    const source = `
      fn main() -> string {
        let s = "Hello";
        s[1]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'INVALID_INDEX', 'error')).toBe(true);
  });
});
