import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const exprPrelude = `
  enum Expr<T> {
    Lit(i32): Expr<i32>,
    Bool(bool): Expr<bool>,
    If(Expr<bool>, Expr<T>, Expr<T>): Expr<T>
  }
`;

function findErrorNode(node: unknown): { message?: string } | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (record.type === 'ErrorNode') {
    return { message: typeof record.message === 'string' ? record.message : undefined };
  }
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findErrorNode(item);
        if (nested) return nested;
      }
      continue;
    }
    const nested = findErrorNode(value);
    if (nested) return nested;
  }
  return null;
}

const infer = (source: string) => {
  const ast = parser.parse(source.trim() + '\n') as Record<string, unknown>;
  const errorNode = findErrorNode(ast);
  if (errorNode) {
    throw new Error(`Fixture parsed with ErrorNode: ${errorNode.message ?? 'unknown parser error'}`);
  }
  return inferProgram(ast as never);
};
const errorCodes = (source: string) =>
  infer(source).diagnostics.filter((diag) => diag.severity === 'error').map((diag) => String(diag.code));
const warningCodes = (source: string) =>
  infer(source).diagnostics.filter((diag) => diag.severity === 'warning').map((diag) => String(diag.code));
const countCode = (source: string, code: string) =>
  infer(source).diagnostics.filter((diag) => String(diag.code) === code).length;

describe('GADT type refinement', () => {
  test('01 tuple multi-pattern refines Lit/Lit branch', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let pair = (Expr.Lit(1), Expr.Lit(2));
        return match pair {
          (Expr.Lit(a), Expr.Lit(b)) => a + b,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('02 tuple multi-pattern refines Bool/Bool branch', () => {
    const source = `
      ${exprPrelude}
      fn main() -> bool {
        let pair = (Expr.Bool(true), Expr.Bool(false));
        return match pair {
          (Expr.Bool(a), Expr.Bool(b)) => a && b,
          _ => false
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('03 tuple mixed indices become unreachable warnings', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let pair = (Expr.Lit(1), Expr.Lit(2));
        return match pair {
          (Expr.Lit(a), Expr.Bool(b)) => a,
          _ => 0
        };
      }
    `;
    const warnings = warningCodes(source);
    const errors = errorCodes(source);
    expect(warnings).toContain('LUM-004');
    expect(errors).not.toContain('LUM-001');
  });

  test('04 generic tuple branches keep branch-local refinement', () => {
    const source = `
      ${exprPrelude}
      fn process<T>(a: Expr<T>, b: Expr<T>) -> T {
        return match (a, b) {
          (Expr.Lit(x), Expr.Lit(y)) => x + y,
          (Expr.Bool(p), Expr.Bool(q)) => p && q
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('05 tuple branch guard sees refined bool bindings', () => {
    const source = `
      ${exprPrelude}
      fn main() -> bool {
        let left: Expr<bool> = Expr.Bool(true);
        let right: Expr<bool> = Expr.Bool(false);
        return match (left, right) {
          (Expr.Bool(a), Expr.Bool(b)) if a && b => true,
          _ => false
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('06 tuple branch guard sees refined integer bindings', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let left: Expr<i32> = Expr.Lit(4);
        let right: Expr<i32> = Expr.Lit(5);
        return match (left, right) {
          (Expr.Lit(a), Expr.Lit(b)) if a < b => a + b,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('07 tuple mismatch still reports unreachable with wildcard fallback', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let a: Expr<i32> = Expr.Lit(1);
        let b: Expr<i32> = Expr.Lit(2);
        return match (a, b) {
          (Expr.Bool(x), Expr.Lit(y)) => y,
          _ => 0
        };
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('08 tuple refinement keeps non-matching branch from constraining reachable branch', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let a: Expr<i32> = Expr.Lit(1);
        let b: Expr<i32> = Expr.Lit(3);
        return match (a, b) {
          (Expr.Lit(x), Expr.Lit(y)) => x + y,
          (Expr.Bool(p), Expr.Bool(q)) => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('09 nested GADT pattern matches If(true, Lit(_), _)', () => {
    const source = `
      ${exprPrelude}
      fn main(e: Expr<i32>) -> i32 {
        return match e {
          Expr.If(Expr.Bool(true), Expr.Lit(n), _) => n,
          Expr.Lit(n) => n,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('10 nested GADT pattern matches If(false, _, Lit(_))', () => {
    const source = `
      ${exprPrelude}
      fn main(e: Expr<i32>) -> i32 {
        return match e {
          Expr.If(Expr.Bool(false), _, Expr.Lit(n)) => n,
          Expr.Lit(n) => n,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('11 nested impossible condition pattern is unreachable', () => {
    const source = `
      ${exprPrelude}
      fn main(e: Expr<i32>) -> i32 {
        return match e {
          Expr.If(Expr.Lit(n), _, _) => n,
          Expr.Lit(n) => n,
          _ => 0
        };
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('12 nested tuple + nested If patterns infer correctly', () => {
    const source = `
      ${exprPrelude}
      fn main(a: Expr<i32>, b: Expr<i32>) -> i32 {
        return match (a, b) {
          (Expr.If(Expr.Bool(true), Expr.Lit(x), _), Expr.Lit(y)) => x + y,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('13 deeply nested If pattern remains type-safe', () => {
    const source = `
      ${exprPrelude}
      fn main(e: Expr<i32>) -> i32 {
        return match e {
          Expr.If(Expr.Bool(true), Expr.If(Expr.Bool(true), Expr.Lit(n), _), _) => n,
          Expr.Lit(n) => n,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('14 nested mismatch arm does not emit hard type mismatch errors', () => {
    const source = `
      ${exprPrelude}
      fn main(e: Expr<i32>) -> i32 {
        return match e {
          Expr.If(Expr.Lit(n), Expr.Lit(m), _) => n + m,
          Expr.Lit(n) => n,
          _ => 0
        };
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('15 equality propagation keeps tuple indices synchronized per branch', () => {
    const source = `
      ${exprPrelude}
      fn eval<T>(left: Expr<T>, right: Expr<T>) -> T {
        return match (left, right) {
          (Expr.Lit(a), Expr.Lit(b)) => a + b,
          (Expr.Bool(x), Expr.Bool(y)) => x && y
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('16 conflicting tuple constraints are solved as unreachable, not hard mismatch', () => {
    const source = `
      ${exprPrelude}
      fn eval(left: Expr<i32>, right: Expr<i32>) -> i32 {
        return match (left, right) {
          (Expr.Lit(a), Expr.Bool(b)) => a,
          _ => 0
        };
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('17 wildcard fallback keeps tuple match exhaustive under refinement', () => {
    const source = `
      ${exprPrelude}
      fn main(a: Expr<i32>, b: Expr<i32>) -> i32 {
        return match (a, b) {
          (Expr.Lit(x), Expr.Lit(y)) => x + y,
          _ => 0
        };
      }
    `;
    expect(errorCodes(source)).not.toContain('LUM-003');
  });

  test('18 match statements skip unreachable arm bodies during refinement', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let a: Expr<i32> = Expr.Lit(1);
        let b: Expr<i32> = Expr.Lit(2);
        match (a, b) {
          (Expr.Lit(x), Expr.Bool(flag)) => { let bad: i32 = true; },
          (Expr.Lit(x), Expr.Lit(y)) => { return x + y; }
        }
        return 0;
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('19 match expressions skip unreachable arm bodies during refinement', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let a: Expr<i32> = Expr.Lit(1);
        let b: Expr<i32> = Expr.Lit(2);
        return match (a, b) {
          (Expr.Lit(x), Expr.Bool(flag)) => x + flag,
          (Expr.Lit(x), Expr.Lit(y)) => x + y
        };
      }
    `;
    expect(warningCodes(source)).toContain('LUM-004');
    expect(errorCodes(source)).not.toContain('LUM-001');
  });

  test('20 multiple unsatisfiable tuple arms each report unreachable warnings', () => {
    const source = `
      ${exprPrelude}
      fn main() -> i32 {
        let a: Expr<i32> = Expr.Lit(1);
        let b: Expr<i32> = Expr.Lit(2);
        return match (a, b) {
          (Expr.Bool(x), Expr.Lit(y)) => y,
          (Expr.Lit(x), Expr.Bool(y)) => x,
          _ => 0
        };
      }
    `;
    expect(countCode(source, 'LUM-004')).toBeGreaterThanOrEqual(2);
    expect(errorCodes(source)).not.toContain('LUM-001');
  });
});
