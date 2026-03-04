import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Casting surface', () => {
  it('supports cast::<T>(x) and preserves lossy-cast warning behavior', () => {
    const source = `
      fn convert(x: f64) -> i32 {
        return cast::<i32>(x);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const hm = inferProgram(ast as never);
    expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hasDiagnostic(hm.diagnostics as Diagnostic[], 'LOSSY-CAST', 'warning')).toBe(true);
  });

  it('emits cast::<i32>(x) as numeric cast in JS and WASM', () => {
    const source = `
      fn convert(x: f64) -> i32 {
        return cast::<i32>(x);
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    const wat = generateWATFromAst(ast, { exportMain: false }).wat;
    expect(js).toContain('Math.trunc');
    expect(wat).toContain('i32.trunc_f64');
  });

  it('supports cast::<string>(x) and lowers to stringify', () => {
    const source = `
      fn show(x: i32) -> string {
        return cast::<string>(x);
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const hm = inferProgram(ast as never);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hasDiagnostic(hm.diagnostics as Diagnostic[], 'TYPE-CAST', 'error')).toBe(false);
    expect(js).toContain('__lumina_stringify');
  });

  it('validates cast::<T>(...) arity', () => {
    const source = `
      fn bad() {
        cast::<i32>(1, 2);
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    expect(hasDiagnostic(semantic.diagnostics as Diagnostic[], 'TYPE-CAST', 'error')).toBe(true);
  });
});
