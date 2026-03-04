import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Function overloading', () => {
  it('resolves stdlib overloads by argument type (namespace call)', () => {
    const source = `
      import * as math from "@std/math";

      fn int_abs() -> i32 {
        return math.abs(0 - 3);
      }

      fn float_abs() -> f64 {
        return math.abs(0.0 - 3.5);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const hm = inferProgram(ast as never);
    expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('resolves stdlib overloads for direct imports', () => {
    const source = `
      import { abs } from "@std/math";

      fn float_abs() -> f64 {
        return abs(0.0 - 2.25);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const hm = inferProgram(ast as never);
    expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('reports OVERLOAD_AMBIGUOUS when multiple variants match unresolved type', () => {
    const source = `
      import * as math from "@std/math";

      fn pick<T>(x: T) {
        math.abs(x);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    expect(hasDiagnostic(semantic.diagnostics as Diagnostic[], 'OVERLOAD_AMBIGUOUS', 'error')).toBe(true);
  });

  it('reports OVERLOAD_NO_MATCH when no candidate matches', () => {
    const source = `
      import * as math from "@std/math";

      fn bad() -> i32 {
        return math.abs("nope");
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    expect(hasDiagnostic(semantic.diagnostics as Diagnostic[], 'OVERLOAD_NO_MATCH', 'error')).toBe(true);
  });

  it('keeps deprecated aliases working with warning', () => {
    const source = `
      import * as math from "@std/math";

      fn old_api() -> f64 {
        return math.absf(0.0 - 2.5);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const hm = inferProgram(ast as never);
    expect(semantic.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(hasDiagnostic(semantic.diagnostics as Diagnostic[], 'DEPRECATED', 'warning')).toBe(true);
  });
});
