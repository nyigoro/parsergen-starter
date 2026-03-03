import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { inlinePass } from '../src/lumina/inline.js';
import type { LuminaBlock, LuminaExpr, LuminaFnDecl, LuminaProgram, LuminaStatement } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const grammarText = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(grammarText);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeWithRows = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never, { useRowPolymorphism: true });
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  return monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
};

const findFn = (program: LuminaProgram, name: string): LuminaFnDecl | undefined =>
  program.body.find((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl' && stmt.name === name);

const collectCallsInExpr = (expr: LuminaExpr, out: string[]): void => {
  switch (expr.type) {
    case 'Call':
      if (expr.receiver) collectCallsInExpr(expr.receiver, out);
      for (const arg of expr.args ?? []) collectCallsInExpr(arg, out);
      out.push(expr.enumName ? `${expr.enumName}.${expr.callee.name}` : expr.callee.name);
      return;
    case 'Binary':
      collectCallsInExpr(expr.left, out);
      collectCallsInExpr(expr.right, out);
      return;
    case 'Member':
      collectCallsInExpr(expr.object, out);
      return;
    case 'Index':
      collectCallsInExpr(expr.object, out);
      collectCallsInExpr(expr.index, out);
      return;
    case 'Range':
      if (expr.start) collectCallsInExpr(expr.start, out);
      if (expr.end) collectCallsInExpr(expr.end, out);
      return;
    case 'ArrayLiteral':
    case 'TupleLiteral':
      for (const item of expr.elements) collectCallsInExpr(item, out);
      return;
    case 'ArrayRepeatLiteral':
      collectCallsInExpr(expr.value, out);
      collectCallsInExpr(expr.count, out);
      return;
    case 'StructLiteral':
      for (const field of expr.fields) collectCallsInExpr(field.value, out);
      return;
    case 'MatchExpr':
      collectCallsInExpr(expr.value, out);
      for (const arm of expr.arms) {
        if (arm.guard) collectCallsInExpr(arm.guard, out);
        collectCallsInExpr(arm.body, out);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms) {
        collectCallsInExpr(arm.value, out);
        collectCallsInExpr(arm.body, out);
      }
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part !== 'string') collectCallsInExpr(part, out);
      }
      return;
    case 'Lambda':
      collectCallsInBlock(expr.body, out);
      return;
    case 'Try':
    case 'Await':
      collectCallsInExpr(expr.value, out);
      return;
    case 'Move':
      if (expr.target.type !== 'Identifier') collectCallsInExpr(expr.target.object, out);
      return;
    case 'Cast':
      collectCallsInExpr(expr.expr, out);
      return;
    case 'IsExpr':
      collectCallsInExpr(expr.value, out);
      return;
    default:
      return;
  }
};

const collectCallsInStmt = (stmt: LuminaStatement, out: string[]): void => {
  switch (stmt.type) {
    case 'Let':
    case 'LetTuple':
      collectCallsInExpr(stmt.value, out);
      return;
    case 'LetElse':
      collectCallsInExpr(stmt.value, out);
      collectCallsInBlock(stmt.elseBlock, out);
      return;
    case 'Return':
      collectCallsInExpr(stmt.value, out);
      return;
    case 'Assign':
      if (stmt.target.type !== 'Identifier') collectCallsInExpr(stmt.target.object, out);
      collectCallsInExpr(stmt.value, out);
      return;
    case 'ExprStmt':
      collectCallsInExpr(stmt.expr, out);
      return;
    case 'If':
      collectCallsInExpr(stmt.condition, out);
      collectCallsInBlock(stmt.thenBlock, out);
      if (stmt.elseBlock) collectCallsInBlock(stmt.elseBlock, out);
      return;
    case 'IfLet':
      collectCallsInExpr(stmt.value, out);
      collectCallsInBlock(stmt.thenBlock, out);
      if (stmt.elseBlock) collectCallsInBlock(stmt.elseBlock, out);
      return;
    case 'While':
      collectCallsInExpr(stmt.condition, out);
      collectCallsInBlock(stmt.body, out);
      return;
    case 'WhileLet':
      collectCallsInExpr(stmt.value, out);
      collectCallsInBlock(stmt.body, out);
      return;
    case 'For':
      collectCallsInExpr(stmt.iterable, out);
      collectCallsInBlock(stmt.body, out);
      return;
    case 'MatchStmt':
      collectCallsInExpr(stmt.value, out);
      for (const arm of stmt.arms) {
        if (arm.guard) collectCallsInExpr(arm.guard, out);
        collectCallsInBlock(arm.body, out);
      }
      return;
    case 'Block':
      collectCallsInBlock(stmt, out);
      return;
    default:
      return;
  }
};

const collectCallsInBlock = (block: LuminaBlock, out: string[]): void => {
  for (const stmt of block.body) collectCallsInStmt(stmt, out);
};

describe('inlinePass', () => {
  it('inlines distinct row-shape specializations separately', () => {
    const source = `
      fn id<T>(x: T) -> T { return x; }
      fn main() -> i32 {
        let by_name = id(|u| u.name);
        let by_title = id(|p| p.title);
        return 0;
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono);
    const main = findFn(result.ast, 'main');
    expect(main).toBeDefined();
    const calls: string[] = [];
    collectCallsInBlock(main!.body, calls);
    expect(calls.some((name) => name.startsWith('id_'))).toBe(false);

    const inlineDecisions = result.decisions.filter((d) => d.callee.startsWith('id_') && d.eligible);
    const uniqueCallees = new Set(inlineDecisions.map((d) => d.callee));
    expect(uniqueCallees.size).toBe(2);
  });

  it('skips recursive callees', () => {
    const source = `
      fn fact(n: i32) -> i32 { return fact(n); }
      fn main() -> i32 {
        return fact(5);
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono);
    const recursiveDecisions = result.decisions.filter((d) => d.callee === 'fact');
    expect(recursiveDecisions.length).toBeGreaterThan(0);
    expect(recursiveDecisions.every((d) => !d.eligible)).toBe(true);
    expect(recursiveDecisions.some((d) => d.reason.includes('recursive'))).toBe(true);
  });

  it('treats thread.spawn_worker as a hard boundary', () => {
    const source = `
      import { thread } from "@std";

      fn worker() -> i32 { return 1; }

      fn main() -> i32 {
        thread.spawn_worker("worker.js");
        return worker();
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono);
    const boundaryDecision = result.decisions.find((d) => d.callee === 'thread.spawn_worker');
    expect(boundaryDecision).toBeDefined();
    expect(boundaryDecision?.eligible).toBe(false);
    expect(boundaryDecision?.reason).toBe('thread-hard-boundary');
  });

  it('uses hot threshold for frequently-called functions', () => {
    const source = `
      fn big(x: i32) -> i32 {
        let a = x + 1;
        return a + 2;
      }

      fn main() -> i32 {
        let a = big(1);
        let b = big(2);
        let c = big(3);
        return a + b + c;
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono, { threshold: 2, hotThreshold: 100, hotCallCount: 3 });
    const hotDecision = result.decisions.find((d) => d.callee === 'big');
    expect(hotDecision).toBeDefined();
    expect(hotDecision?.eligible).toBe(true);
    const main = findFn(result.ast, 'main');
    const calls: string[] = [];
    collectCallsInBlock(main!.body, calls);
    expect(calls.includes('big')).toBe(false);
  });

  it('respects caller node cap', () => {
    const source = `
      fn inc(x: i32) -> i32 { return x + 1; }
      fn main() -> i32 {
        let a = 1;
        let b = inc(a);
        let c = inc(b);
        return c;
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono, { maxCallerNodes: 3, threshold: 100, hotThreshold: 100, hotCallCount: 1 });
    expect(result.decisions.some((d) => d.reason === 'caller-node-cap')).toBe(true);
  });

  it('avoids variable collisions under nested inlines', () => {
    const source = `
      fn inner(v: i32) -> i32 {
        let tmp = v + 1;
        return tmp;
      }

      fn outer(v: i32) -> i32 {
        let tmp = inner(v);
        return tmp;
      }

      fn main() -> i32 {
        let tmp = 10;
        return outer(tmp);
      }
    `;
    const mono = monomorphizeWithRows(source);
    const result = inlinePass(mono);
    const main = findFn(result.ast, 'main');
    expect(main).toBeDefined();
    const calls: string[] = [];
    collectCallsInBlock(main!.body, calls);
    expect(calls.includes('inner')).toBe(false);
    expect(calls.includes('outer')).toBe(false);

    const firstStmt = main!.body.body[0];
    expect(firstStmt?.type).toBe('Let');
    if (firstStmt?.type === 'Let') {
      expect(firstStmt.name).toBe('tmp');
    }
  });
});
