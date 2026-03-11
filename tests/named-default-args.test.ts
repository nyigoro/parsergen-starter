import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaCall, LuminaFnDecl, LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const findFn = (ast: LuminaProgram, name: string): LuminaFnDecl => {
  const fn = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === name);
  if (!fn || fn.type !== 'FnDecl') throw new Error(`Missing function ${name}`);
  return fn;
};

const firstCallInMain = (ast: LuminaProgram): LuminaCall => {
  const fn = findFn(ast, 'main');
  const stmt = fn.body.body[0];
  if (!stmt) throw new Error('Missing statement in main');
  const expr =
    stmt.type === 'ExprStmt'
      ? stmt.expr
      : stmt.type === 'Return'
        ? stmt.value
        : stmt.type === 'Let'
          ? stmt.value
          : null;
  if (!expr || expr.type !== 'Call') throw new Error('Expected call expression in main');
  return expr;
};

describe('named + default arguments', () => {
  it('parses default values on params', () => {
    const source = `
      fn f(x: i32 = 0) -> i32 { x }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const fn = findFn(ast, 'f');
    expect(fn.params[0]?.defaultValue).not.toBeNull();
  });

  it('parses named and mixed arguments', () => {
    const source = `
      fn f(x: i32, y: i32) -> i32 { x + y }
      fn main() -> i32 { f(1, y: 2) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const call = firstCallInMain(ast);
    expect(call.args[0]?.named).toBe(false);
    expect(call.args[1]?.named).toBe(true);
    expect(call.args[1]?.name).toBe('y');
  });

  it('allows defaults when omitted', () => {
    const source = `
      fn f(x: i32 = 10) -> i32 { x }
      fn main() -> i32 { f() }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports default value type mismatch', () => {
    const source = `
      fn f(x: i32 = "no") -> i32 { x }
      fn main() -> i32 { f() }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'DEFAULT-ARG-001')).toBe(true);
  });

  it('reorders named arguments at call sites', () => {
    const source = `
      fn f(x: i32, y: i32) -> i32 { x + y }
      fn main() -> i32 { f(y: 2, x: 1) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toMatch(/f\(1, 2\)/);
  });

  it('inlines default values into calls', () => {
    const source = `
      fn f(x: i32 = 7, y: i32 = 8) -> i32 { x + y }
      fn main() -> i32 { f() }
    `.trim() + '\n';
    const ast = parseProgram(source);
    analyzeLumina(ast);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toMatch(/f\(7, 8\)/);
  });

  it('flags unknown and duplicate named arguments', () => {
    const source = `
      fn f(x: i32, y: i32) -> i32 { x + y }
      fn main() -> i32 { f(z: 1, x: 2) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'NAMED-ARG-001')).toBe(true);
  });

  it('flags duplicate provision of the same parameter', () => {
    const source = `
      fn f(x: i32, y: i32) -> i32 { x + y }
      fn main() -> i32 { f(1, x: 2) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'NAMED-ARG-002')).toBe(true);
  });

  it('flags missing required arguments', () => {
    const source = `
      fn f(x: i32, y: i32 = 2) -> i32 { x + y }
      fn main() -> i32 { f() }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'NAMED-ARG-003')).toBe(true);
  });

  it('flags positional arguments after named', () => {
    const source = `
      fn f(x: i32, y: i32) -> i32 { x + y }
      fn main() -> i32 { f(x: 1, 2) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'NAMED-ARG-004')).toBe(true);
  });

  it('HM infers named argument calls', () => {
    const source = `
      fn f(x: i32, y: i32 = 2) -> i32 { x + y }
      fn main() -> i32 { f(y: 10, x: 3) }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const inferred = inferProgram(ast);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
