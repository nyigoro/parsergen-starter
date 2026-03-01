import { ConstEvaluator } from '../src/lumina/const-eval.js';
import type { ConstExpr } from '../src/lumina/types.js';

describe('Const Evaluator', () => {
  let evaluator: ConstEvaluator;

  beforeEach(() => {
    evaluator = new ConstEvaluator();
  });

  it('evaluates literals', () => {
    const expr: ConstExpr = { kind: 'const-literal', value: 42 };
    expect(evaluator.evaluate(expr)).toBe(42);
  });

  it('evaluates bound parameters', () => {
    evaluator.bind('N', 10);
    const expr: ConstExpr = { kind: 'const-param', name: 'N' };
    expect(evaluator.evaluate(expr)).toBe(10);
  });

  it('evaluates binary expressions', () => {
    evaluator.bind('N', 5);
    const expr: ConstExpr = {
      kind: 'const-binary',
      op: '*',
      left: { kind: 'const-param', name: 'N' },
      right: { kind: 'const-literal', value: 2 },
    };
    expect(evaluator.evaluate(expr)).toBe(10);
  });

  it('detects division by zero', () => {
    const expr: ConstExpr = {
      kind: 'const-binary',
      op: '/',
      left: { kind: 'const-literal', value: 10 },
      right: { kind: 'const-literal', value: 0 },
    };
    expect(evaluator.evaluate(expr)).toBeNull();
    expect(evaluator.getDiagnostics()).toContainEqual(
      expect.objectContaining({ code: 'CONST-DIV-ZERO' })
    );
  });
});

