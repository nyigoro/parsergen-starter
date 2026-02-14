import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
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

describe('Error handling (? operator)', () => {
  it('infers Result ok type for ?', () => {
    const source = `
      enum Result<T, E> { Ok(T), Err(E) }

      fn parse() -> Result<i32, string> {
        return Result.Ok(5);
      }

      fn main() -> Result<i32, string> {
        let x = parse()?;
        return Result.Ok(x + 1);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = inferProgram(ast as never);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBe(0);
  });

  it('reports when ? used in non-Result function', () => {
    const source = `
      enum Result<T, E> { Ok(T), Err(E) }

      fn main() -> i32 {
        let x = Result.Ok(1)?;
        return x;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'TRY_RETURN_MISMATCH', 'error')).toBe(true);
  });

  it('reports when ? operand is not Result', () => {
    const source = `
      enum Result<T, E> { Ok(T), Err(E) }

      fn main() -> Result<i32, string> {
        let x = 1?;
        return Result.Ok(x);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = analyzeLumina(ast);
    expect(hasDiagnostic(result.diagnostics as Diagnostic[], 'TRY_NOT_RESULT', 'error')).toBe(true);
  });

  it('emits try helper and catch for ? in JS codegen', () => {
    const source = `
      enum Result<T, E> { Ok(T), Err(E) }

      fn parse() -> Result<i32, string> {
        return Result.Ok(7);
      }

      fn main() -> Result<i32, string> {
        let x = parse()?;
        return Result.Ok(x);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('function __lumina_try');
    expect(js).toContain('catch (err)');
  });
});
