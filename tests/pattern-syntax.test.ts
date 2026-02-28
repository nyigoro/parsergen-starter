import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('pattern syntax expansion', () => {
  it('parses and type-checks if-let and let-else with tuple pattern', () => {
    const source = `
      fn main() -> i32 {
        let pair = (1, 2);
        let (a, b) = pair else {
          return 0;
        };

        if let (x, y) = pair {
          y;
          return x;
        } else {
          b;
          return a;
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);

    expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('supports literal, guard, and struct patterns in match', () => {
    const source = `
      struct User {
        age: i32
      }

      fn score(n: i32) -> i32 {
        let result = match n {
          0 => 0,
          1 if n > 0 => n,
          _ => 0 - 1
        };
        result
      }

      fn extract_age(u: User) -> i32 {
        let result = match u {
          User { age: 10 } => 10,
          _ => 0
        };
        result
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);

    expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('supports pipe lambda shorthand |x| x + 1', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let nums = [1, 2, 3];
        let out = vec.map(nums, |x| x);
        vec.len(out)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const inferred = inferProgram(ast as never);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;

    expect(analysis.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(inferred.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(js).toContain('function(x)');
  });

  it('lowers match patterns to generic pattern checks in AST JS', () => {
    const source = `
      fn main() -> i32 {
        let value = (1, 2);
        match value {
          (a, b) if a < b => a + b,
          _ => 0
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;

    expect(js).toContain('Array.isArray(');
    expect(js).toContain('__match_done_');
    expect(js).toContain('if (!__match_done_');
  });
});
