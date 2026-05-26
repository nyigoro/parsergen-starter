import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const executeFunctions = <T extends string>(source: string, names: T[]): Record<T, (...args: unknown[]) => unknown> => {
  const ast = parseProgram(source);
  const js = generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code;
  const moduleHandle = { exports: {} as Record<string, unknown> };
  return new Function('module', `${js}\nreturn { ${names.join(', ')} };`)(moduleHandle) as Record<
    T,
    (...args: unknown[]) => unknown
  >;
};

describe('nested functions', () => {
  test('analysis and HM allow using a local function before its declaration', () => {
    const source = `
      fn main() -> i32 {
        let value = add1(4);
        fn add1(x: i32) -> i32 { x + 1 }
        value
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);

    expect(analysis.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const runtime = executeFunctions(source, ['main']);
    expect(runtime.main()).toBe(5);
  });

  test('nested functions can capture outer locals like lambdas', () => {
    const source = `
      fn main() -> i32 {
        let base = 10;
        fn add1(x: i32) -> i32 { x + base }
        add1(4)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);

    expect(analysis.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const runtime = executeFunctions(source, ['main']);
    expect(runtime.main()).toBe(14);
  });

  test('nested functions are hoisted across a block for mutual recursion', () => {
    const source = `
      fn main() -> i32 {
        let ok = even(4);
        fn even(n: i32) -> bool {
          if (n == 0) { return true; }
          odd(n - 1)
        }
        fn odd(n: i32) -> bool {
          if (n == 0) { return false; }
          even(n - 1)
        }
        if (ok) { return 1; }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);

    expect(analysis.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const runtime = executeFunctions(source, ['main']);
    expect(runtime.main()).toBe(1);
  });

  test('JS codegen preserves implicit tail returns for top-level and nested functions', () => {
    const source = `
      fn add1(x: i32) -> i32 { x + 1 }
      fn main() -> i32 {
        fn double(x: i32) -> i32 { x * 2 }
        add1(double(2))
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'cjs', includeRuntime: false }).code;

    expect(js).toContain('return (x + 1);');
    expect(js).toContain('return (x * 2);');
    expect(js).toContain('return add1(double(2));');

    const runtime = executeFunctions(source, ['add1', 'main']);
    expect(runtime.add1(4)).toBe(5);
    expect(runtime.main()).toBe(5);
  });
});
