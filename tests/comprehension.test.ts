import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram, LuminaStatement, LuminaExpr } from '../src/lumina/ast.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { desugarListComprehensions } from '../src/lumina/comprehension.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const findMain = (program: LuminaProgram) =>
  program.body.find((stmt): stmt is Extract<LuminaStatement, { type: 'FnDecl' }> => stmt.type === 'FnDecl' && stmt.name === 'main');

const findLetValue = (fn: Extract<LuminaStatement, { type: 'FnDecl' }>, name: string): LuminaExpr => {
  const stmt = fn.body.body.find(
    (s): s is Extract<LuminaStatement, { type: 'Let' }> => s.type === 'Let' && s.name === name
  );
  if (!stmt) throw new Error(`Missing let ${name}`);
  return stmt.value;
};

const walkExpr = (expr: LuminaExpr, visit: (expr: LuminaExpr) => void) => {
  visit(expr);
  switch (expr.type) {
    case 'Binary':
      walkExpr(expr.left, visit);
      walkExpr(expr.right, visit);
      return;
    case 'Call':
      if (expr.receiver) walkExpr(expr.receiver, visit);
      for (const arg of expr.args ?? []) walkExpr(arg, visit);
      return;
    case 'Member':
      walkExpr(expr.object, visit);
      return;
    case 'Index':
      walkExpr(expr.object, visit);
      walkExpr(expr.index, visit);
      return;
    case 'Range':
      if (expr.start) walkExpr(expr.start, visit);
      if (expr.end) walkExpr(expr.end, visit);
      return;
    case 'ArrayLiteral':
    case 'TupleLiteral':
      for (const element of expr.elements) walkExpr(element, visit);
      return;
    case 'ArrayRepeatLiteral':
      walkExpr(expr.value, visit);
      walkExpr(expr.count, visit);
      return;
    case 'StructLiteral':
      for (const field of expr.fields) walkExpr(field.value, visit);
      return;
    case 'MatchExpr':
      walkExpr(expr.value, visit);
      for (const arm of expr.arms) {
        if (arm.guard) walkExpr(arm.guard, visit);
        walkExpr(arm.body, visit);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms ?? []) {
        walkExpr(arm.value, visit);
        walkExpr(arm.body, visit);
      }
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        walkExpr(part, visit);
      }
      return;
    case 'Lambda':
      for (const stmt of expr.body.body ?? []) {
        if (stmt.type === 'Let') walkExpr(stmt.value, visit);
        if (stmt.type === 'ExprStmt') walkExpr(stmt.expr, visit);
        if (stmt.type === 'Return') walkExpr(stmt.value, visit);
      }
      return;
    case 'Try':
    case 'Await':
      walkExpr(expr.value, visit);
      return;
    case 'Move':
      walkExpr(expr.target as unknown as LuminaExpr, visit);
      return;
    case 'Cast':
      walkExpr(expr.expr, visit);
      return;
    case 'IsExpr':
      walkExpr(expr.value, visit);
      return;
    case 'MacroInvoke':
      for (const arg of expr.args) walkExpr(arg, visit);
      return;
    case 'ListComprehension': {
      const comp = expr as unknown as {
        body: LuminaExpr;
        source: LuminaExpr;
        source2?: LuminaExpr;
        filter: LuminaExpr | null;
      };
      walkExpr(comp.source, visit);
      if (comp.source2) walkExpr(comp.source2, visit);
      if (comp.filter) walkExpr(comp.filter, visit);
      walkExpr(comp.body, visit);
      return;
    }
    default:
      return;
  }
};

describe('List comprehensions', () => {
  test('parses basic comprehension', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x * 2 for x in xs];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const main = findMain(ast);
    expect(main).toBeTruthy();
    const ys = findLetValue(main!, 'ys');
    expect(ys.type).toBe('ListComprehension');
    const comp = ys as unknown as { binding: string; filter: unknown };
    expect(comp.binding).toBe('x');
    expect(comp.filter).toBe(null);
  });

  test('parses comprehension with filter', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x for x in xs if x > 0];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const main = findMain(ast)!;
    const ys = findLetValue(main, 'ys');
    expect(ys.type).toBe('ListComprehension');
    const comp = ys as unknown as { filter: unknown };
    expect(comp.filter).not.toBe(null);
  });

  test('parses nested comprehension (two generators)', () => {
    const source = `
      fn main() {
        let xs = [1, 2];
        let ys = [10, 20];
        let pairs = [x + y for x in xs for y in ys];
        return pairs;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const main = findMain(ast)!;
    const pairs = findLetValue(main, 'pairs');
    expect(pairs.type).toBe('ListComprehension');
    const comp = pairs as unknown as { binding2?: string; source2?: unknown };
    expect(comp.binding2).toBe('y');
    expect(comp.source2).toBeTruthy();
  });

  test('does not regress array literals', () => {
    const source = `
      fn main() {
        let a = [1, 2, 3];
        let b = [1; 10];
        return a;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const main = findMain(ast)!;
    expect(findLetValue(main, 'a').type).toBe('ArrayLiteral');
    expect(findLetValue(main, 'b').type).toBe('ArrayRepeatLiteral');
  });

  test('typechecks valid comprehension', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x * 2 for x in xs if x > 1];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  test('reports COMP-001 when source is not Vec', () => {
    const source = `
      fn main() {
        let n = 1;
        let ys = [x for x in n];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((d) => d.code === 'COMP-001')).toBe(true);
  });

  test('reports COMP-002 when filter is not bool', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x for x in xs if 123];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((d) => d.code === 'COMP-002')).toBe(true);
  });

  test('binding is scoped to comprehension', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x for x in xs];
        let z = x;
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((d) => d.code === 'UNKNOWN_IDENTIFIER' && d.message.includes("'x'"))).toBe(true);
  });

  test('desugars comprehensions to vec.fold', () => {
    const source = `
      fn main() {
        let xs = [1, 2, 3];
        let ys = [x * 2 for x in xs if x > 0];
        return ys;
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const desugared = desugarListComprehensions(ast);
    const main = findMain(desugared)!;
    const ys = findLetValue(main, 'ys');

    let hasComprehension = false;
    let hasVecFold = false;
    walkExpr(ys, (node) => {
      if (node.type === 'ListComprehension') hasComprehension = true;
      if (node.type === 'Call' && node.enumName === 'vec' && node.callee.name === 'fold') hasVecFold = true;
    });

    expect(hasComprehension).toBe(false);
    expect(hasVecFold).toBe(true);
  });
});
