import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { comptimePass } from '../src/lumina/comptime.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaFnDecl, LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const grammarText = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(grammarText);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeForComptime = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never, { useRowPolymorphism: true });
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  return monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
};

const findFn = (program: LuminaProgram, name: string): LuminaFnDecl | undefined =>
  program.body.find((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl' && stmt.name === name);

const firstReturnExpr = (fnDecl: LuminaFnDecl) => {
  for (const stmt of fnDecl.body.body) {
    if (stmt.type === 'Return') return stmt.value;
  }
  return null;
};

describe('comptimePass', () => {
  it('parses comptime fn modifier', () => {
    const ast = parseProgram(`
      comptime fn value() -> i32 {
        return 1;
      }
    `);
    const fnDecl = findFn(ast, 'value');
    expect(fnDecl?.comptime).toBe(true);
  });

  it('inlines recursive comptime function calls as literals', () => {
    const program = monomorphizeForComptime(`
      comptime fn fact(n: i32) -> i32 {
        if (n <= 1) {
          return 1;
        }
        return n * fact(n - 1);
      }

      fn main() -> i32 {
        return fact(5);
      }
    `);
    const result = comptimePass(program);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.substituted).toBeGreaterThan(0);
    expect(findFn(result.ast, 'fact')).toBeUndefined();

    const main = findFn(result.ast, 'main');
    expect(main).toBeDefined();
    const ret = firstReturnExpr(main as LuminaFnDecl);
    expect(ret?.type).toBe('Number');
    if (ret?.type === 'Number') {
      expect(ret.value).toBe(120);
    }
  });

  it('reports bridge rule violations for non-primitive return types', () => {
    const program = monomorphizeForComptime(`
      struct Pair { a: i32, b: i32 }

      comptime fn build() -> Pair {
        return Pair { a: 1, b: 2 };
      }

      fn main() -> i32 { return 0; }
    `);
    const result = comptimePass(program);
    expect(result.diagnostics.some((d) => d.code === 'COMPTIME-BRIDGE')).toBe(true);
  });

  it('reports runaway evaluation for non-terminating recursion', () => {
    const program = monomorphizeForComptime(`
      comptime fn loop(n: i32) -> i32 {
        return loop(n + 1);
      }

      fn main() -> i32 {
        return loop(0);
      }
    `);
    const result = comptimePass(program);
    expect(result.diagnostics.some((d) => d.code === 'COMPTIME-RUNAWAY')).toBe(true);
  });

  it('detects mutual comptime dependency cycles', () => {
    const program = monomorphizeForComptime(`
      comptime fn left() -> i32 {
        return right();
      }

      comptime fn right() -> i32 {
        return left();
      }

      fn main() -> i32 {
        return left();
      }
    `);
    const result = comptimePass(program);
    expect(result.diagnostics.some((d) => d.code === 'COMPTIME-CYCLE')).toBe(true);
  });

  it('substitutes literals and omits comptime declarations from JS/WASM output', () => {
    const program = monomorphizeForComptime(`
      comptime fn answer() -> i32 {
        return 42;
      }

      fn main() -> i32 {
        return answer();
      }
    `);
    const result = comptimePass(program);
    expect(result.diagnostics).toHaveLength(0);
    expect(findFn(result.ast, 'answer')).toBeUndefined();

    const js = generateJSFromAst(result.ast, { target: 'esm' }).code;
    expect(js).not.toContain('answer(');
    expect(js).toContain('return 42;');

    const wat = generateWATFromAst(result.ast, { exportMain: true });
    expect(wat.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(wat.wat).not.toContain('$answer');
    expect(wat.wat).toContain('i32.const 42');
  });
});

describe('comptime semantic validation', () => {
  const analyze = (source: string) => analyzeLumina(parseProgram(source) as never);

  it('rejects async + comptime combination', () => {
    const analysis = analyze(`
      comptime async fn invalid() -> i32 {
        return 1;
      }
    `);
    expect(analysis.diagnostics.some((d) => d.code === 'COMPTIME-ASYNC-MODIFIER')).toBe(true);
  });

  it('rejects comptime impl methods', () => {
    const analysis = analyze(`
      trait T { fn value(self: Self) -> i32; }
      struct S {}

      impl T for S {
        comptime fn value(self: Self) -> i32 {
          return 1;
        }
      }
    `);
    expect(analysis.diagnostics.some((d) => d.code === 'COMPTIME-IMPL-METHOD')).toBe(true);
  });

  it('rejects runtime binding capture in comptime fn', () => {
    const analysis = analyze(`
      fn runtime() -> i32 { return 1; }

      comptime fn invalid() -> i32 {
        return runtime();
      }
    `);
    expect(
      analysis.diagnostics.some(
        (d) => d.code === 'COMPTIME-NON-COMPTIME-CALL' || d.code === 'COMPTIME-NON-COMPTIME-BINDING'
      )
    ).toBe(true);
  });
});
