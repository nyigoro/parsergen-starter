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

  it('supports comparison and boolean operators', () => {
    evaluator.bind('N', 8);
    evaluator.bind('M', 3);
    const expr: ConstExpr = {
      kind: 'const-if',
      condition: {
        kind: 'const-binary',
        op: '&&',
        left: {
          kind: 'const-binary',
          op: '>',
          left: { kind: 'const-param', name: 'N' },
          right: { kind: 'const-literal', value: 0 },
        },
        right: {
          kind: 'const-binary',
          op: '>',
          left: { kind: 'const-param', name: 'M' },
          right: { kind: 'const-literal', value: 0 },
        },
      },
      thenExpr: { kind: 'const-param', name: 'N' },
      elseExpr: { kind: 'const-literal', value: 0 },
    };
    expect(evaluator.evaluate(expr)).toBe(8);
  });

  it('supports min/max calls', () => {
    const expr: ConstExpr = {
      kind: 'const-call',
      name: 'max',
      args: [
        { kind: 'const-literal', value: 4 },
        {
          kind: 'const-call',
          name: 'min',
          args: [
            { kind: 'const-literal', value: 10 },
            { kind: 'const-literal', value: 7 },
          ],
        },
      ],
    };
    expect(evaluator.evaluate(expr)).toBe(7);
  });

  it('supports unary operators in const expressions', () => {
    const expr: ConstExpr = {
      kind: 'const-if',
      condition: {
        kind: 'const-unary',
        op: '!',
        expr: {
          kind: 'const-binary',
          op: '==',
          left: { kind: 'const-literal', value: 1 },
          right: { kind: 'const-literal', value: 2 },
        },
      },
      thenExpr: {
        kind: 'const-unary',
        op: '-',
        expr: { kind: 'const-literal', value: 5 },
      },
      elseExpr: { kind: 'const-literal', value: 0 },
    };
    expect(evaluator.evaluate(expr)).toBe(-5);
  });
});
