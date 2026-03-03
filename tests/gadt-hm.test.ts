import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('GADT HM inference', () => {
  test('reports constructor index mismatch', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let bad: Expr<bool> = Expr.Lit(1);
        match bad {
          Expr.Bool(v) => { return v; },
          _ => { return false; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(true);
  });

  test('marks index-incompatible variant arms as unreachable', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let e: Expr<i32> = Expr.Lit(1);
        match e {
          Expr.Bool(b) => {
            if (b) { return 1; } else { return 0; }
          },
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-004')).toBe(true);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(false);
  });

  test('treats indexed matches as exhaustive when impossible variants are excluded', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let e: Expr<i32> = Expr.Lit(1);
        match e {
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const codes = result.diagnostics.map((diag) => diag.code);
    expect(codes).not.toContain('LUM-003');
  });

  test('reports unreachable GADT pattern when index cannot match', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }
      fn main() {
        let e: Expr<i32> = Expr.Lit(1);
        match e {
          Expr.Bool(b) => {
            if (b) { return 1; } else { return 0; }
          },
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const unreachable = result.diagnostics.find((diag) => diag.code === 'LUM-004');
    expect(unreachable).toBeDefined();
    expect(unreachable?.message).toContain('type index mismatch');
    const related = (unreachable?.relatedInformation ?? []).map((item) => item.message).join(' ');
    expect(related).toContain('Scrutinee is constrained');
  });

  test('reports escaped existential values from a match arm', () => {
    const program = `
      trait Show {
        fn show(self: Self) -> string;
      }

      enum ShowBox {
        Box exists <T>(T): ShowBox where T: Show
      }

      fn leak(box: ShowBox) {
        let value = match box {
          ShowBox.Box(v) => v
        };
        value;
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'GADT-006')).toBe(true);
    const escape = result.diagnostics.find((diag) => diag.code === 'GADT-006');
    const related = escape?.relatedInformation?.map((item) => item.message).join(' ') ?? '';
    expect(related).toContain('arm scope #');
  });

  test('rejects coercing existential payload to a concrete type', () => {
    const program = `
      trait Show {
        fn show(self: Self) -> string;
      }

      enum ShowBox {
        Box exists <T>(T): ShowBox where T: Show
      }

      fn force_i32(box: ShowBox) -> i32 {
        let n: i32 = match box {
          ShowBox.Box(v) => v
        };
        n
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'GADT-007')).toBe(true);
  });

  test('rejects unifying distinct existential payloads in tuple matches', () => {
    const program = `
      trait Show {
        fn show(self: Self) -> string;
      }

      enum ShowBox {
        Box exists <T>(T): ShowBox where T: Show
      }

      fn compare(a: ShowBox, b: ShowBox) -> bool {
        match (a, b) {
          (ShowBox.Box(x), ShowBox.Box(y)) => x == y,
          _ => false
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'GADT-007')).toBe(true);
  });

  test('supports tuple multi-pattern refinement for matching indices', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn process(a: Expr<i32>, b: Expr<i32>) -> i32 {
        match (a, b) {
          (Expr.Lit(x), Expr.Lit(y)) => x + y,
          _ => 0
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(false);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-003')).toBe(false);
  });

  test('supports branch-local refinement for generic indexed matches', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn process<T>(e1: Expr<T>, e2: Expr<T>) -> T {
        match (e1, e2) {
          (Expr.Lit(n), Expr.Lit(m)) => n + m,
          (Expr.Bool(b), Expr.Bool(c)) => b && c
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(false);
  });

  test('supports nested indexed patterns', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>,
        If(Expr<bool>, Expr<T>, Expr<T>): Expr<T>
      }

      fn choose(e: Expr<i32>) -> i32 {
        match e {
          Expr.If(Expr.Bool(true), Expr.Lit(n), _) => n,
          Expr.Lit(n) => n,
          Expr.If(Expr.Bool(false), _, Expr.Lit(m)) => m
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    expect(result.diagnostics.some((diag) => diag.code === 'LUM-001')).toBe(false);
  });

  test('reports indexed missing-pattern suggestions with constrained types', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn main(e: Expr<i32>) -> i32 {
        match e {
          Expr.Bool(b) => { return 0; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const exhaustiveness = result.diagnostics.find((diag) => diag.code === 'LUM-003');
    expect(exhaustiveness).toBeDefined();
    expect(exhaustiveness?.message).toContain('Expr.Lit');
    expect(exhaustiveness?.message).not.toContain('Expr.Bool');
    const related = (exhaustiveness?.relatedInformation ?? []).map((item) => item.message).join(' ');
    expect(related).toContain('Scrutinee constrained type');
    expect(related).toContain('Suggested missing pattern');
  });

  test('flags unreachable arms after wildcard coverage', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn main(e: Expr<i32>) -> i32 {
        match e {
          _ => { return 0; },
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const unreachable = result.diagnostics.find((diag) => diag.code === 'LUM-004');
    expect(unreachable).toBeDefined();
    expect(unreachable?.message).toContain('previous patterns already cover all remaining cases');
  });

  test('uses index constraints when describing unreachable constructor arms', () => {
    const program = `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn main(e: Expr<i32>) -> i32 {
        match e {
          Expr.Bool(b) => { return 0; },
          Expr.Lit(n) => { return n; }
        }
      }
    `.trim() + '\n';

    const ast = parser.parse(program) as { type: string };
    const result = inferProgram(ast as never);
    const unreachable = result.diagnostics.find((diag) => diag.code === 'LUM-004');
    expect(unreachable).toBeDefined();
    expect(unreachable?.message).toContain('type index');
    const related = (unreachable?.relatedInformation ?? []).map((item) => item.message).join(' ');
    expect(related).toContain('Scrutinee is constrained');
  });
});
