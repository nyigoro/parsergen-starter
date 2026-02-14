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

describe('String interpolation', () => {
  it('type checks interpolated strings', () => {
    const source = `
      fn main() -> string {
        let name = "Alice";
        let msg = "Hello {name}!";
        msg
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('emits stringify calls for interpolations', () => {
    const source = `
      fn main() -> string {
        let value = 42;
        "Value: {value}"
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('__lumina_stringify');
    expect(js).toContain('Value: ');
  });

  it('reports void interpolation', () => {
    const source = `
      fn log(value: i32) -> void {
        return;
      }

      fn main() -> string {
        "Bad {log(1)}"
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'STRING_INTERP_VOID', 'error')).toBe(true);
  });
});
