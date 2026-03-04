import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { expandMacrosInProgram } from '../src/lumina/macro-expand.js';
import { formatDiagnosticExplanation } from '../src/lumina/diagnostic-explain.js';
import type { Diagnostic } from '../src/parser/index.js';
import type { LuminaExpr, LuminaFnDecl, LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;
const hasDiag = (diagnostics: Diagnostic[], code: string): boolean => diagnostics.some((d) => d.code === code);

const getMainFn = (program: LuminaProgram): LuminaFnDecl => {
  const fn = program.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'main');
  if (!fn || fn.type !== 'FnDecl') {
    throw new Error('main function not found');
  }
  return fn;
};

const expectArray = (expr: LuminaExpr, expectedValues: number[]) => {
  expect(expr.type).toBe('ArrayLiteral');
  if (expr.type !== 'ArrayLiteral') return;
  expect(expr.elements).toHaveLength(expectedValues.length);
  const values = expr.elements.map((item) => (item.type === 'Number' ? item.value : NaN));
  expect(values).toEqual(expectedValues);
};

describe('macro stabilization', () => {
  it('matches literal separator => in matcher', () => {
    const source = `
      macro_rules! when {
        ($cond:expr => $body:expr) => ($body);
      }
      fn main() -> i32 { when!(true => 7) }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);
    const main = getMainFn(ast);
    const first = main.body.body[0];
    expect(first?.type).toBe('ExprStmt');
    if (first?.type === 'ExprStmt') {
      expect(first.expr.type).toBe('Number');
      if (first.expr.type === 'Number') expect(first.expr.value).toBe(7);
    }
  });

  it('supports semicolon repetition separator in matcher/transcriber', () => {
    const source = `
      macro_rules! list {
        ($($x:expr);*) => [$($x);*];
      }
      fn main() -> i32 {
        let a = list!(1; 2; 3);
        0
      }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);
    const first = getMainFn(ast).body.body[0];
    expect(first?.type).toBe('Let');
    if (first?.type === 'Let') expectArray(first.value, [1, 2, 3]);
  });

  it('supports multi-var repetition captures', () => {
    const source = `
      macro_rules! keys {
        ($($k:expr => $v:expr),*) => [$($k),*];
      }
      fn main() -> i32 {
        let a = keys!(1 => 10, 2 => 20, 3 => 30);
        0
      }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);
    const first = getMainFn(ast).body.body[0];
    expect(first?.type).toBe('Let');
    if (first?.type === 'Let') expectArray(first.value, [1, 2, 3]);
  });

  it('supports one-level nested repetitions (depth <= 2)', () => {
    const source = `
      macro_rules! flatten {
        ($( $($x:expr),* );*) => [$($($x),*),*];
      }
      fn main() -> i32 {
        let a = flatten!(1, 2; 3, 4; 5);
        0
      }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);
    const first = getMainFn(ast).body.body[0];
    expect(first?.type).toBe('Let');
    if (first?.type === 'Let') expectArray(first.value, [1, 2, 3, 4, 5]);
  });

  it('emits MACRO-005 for nested repetition depth > 2', () => {
    const source = `
      macro_rules! deep {
        ($($($($x:expr),*),*),*) => ($x);
      }
      fn main() -> i32 { deep!(1, 2) }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(hasDiag(expanded.diagnostics, 'MACRO-005')).toBe(true);
  });

  it('emits MACRO-001 for malformed macro rule', () => {
    const source = `
      macro_rules! bad {
        ($x:expr) ($x);
      }
      fn main() -> i32 { bad!(1) }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(hasDiag(expanded.diagnostics, 'MACRO-001')).toBe(true);
  });

  it('emits MACRO-002 for unsupported transcriber form', () => {
    const source = `
      macro_rules! bad {
        ($x:expr) => ($y);
      }
      fn main() -> i32 { bad!(1) }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(hasDiag(expanded.diagnostics, 'MACRO-002')).toBe(true);
  });

  it('emits MACRO-003 for unsupported repetition separator token', () => {
    const source = `
      macro_rules! bars {
        ($($x:expr)|*) => [$($x)|*];
      }
      fn main() -> i32 { bars!(1, 2) }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(hasDiag(expanded.diagnostics, 'MACRO-003')).toBe(true);
  });

  it('emits MACRO-004 when matcher capture position is not a metavariable', () => {
    const source = `
      macro_rules! bad {
        [foo] => (1);
      }
      fn main() -> i32 { bad![] }
    `;
    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(hasDiag(expanded.diagnostics, 'MACRO-004')).toBe(true);
  });

  it('has diagnostic explanations for MACRO-001..MACRO-005', () => {
    for (const code of ['MACRO-001', 'MACRO-002', 'MACRO-003', 'MACRO-004', 'MACRO-005']) {
      const formatted = formatDiagnosticExplanation(code);
      expect(formatted).not.toContain('No dedicated explanation');
      expect(formatted).toContain(code);
    }
  });
});
