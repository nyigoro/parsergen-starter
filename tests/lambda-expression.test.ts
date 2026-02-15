import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('lambda expressions', () => {
  it('parses anonymous function arguments', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let nums: Vec<i32> = vec.new();
        let out = vec.map(nums, fn(x: i32) -> i32 { return x + 1; });
        return vec.len(out);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    expect(ast.type).toBe('Program');
  });

  it('type-checks lambda bodies with captured values', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let base: i32 = 2;
        let nums: Vec<i32> = vec.new();
        vec.push(nums, 1);
        let out = vec.map(nums, fn(x: i32) -> i32 { return x + base; });
        return vec.len(out);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('supports HM inference through lambda expressions', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let nums: Vec<i32> = vec.new();
        vec.push(nums, 1);
        let out = vec.map(nums, fn(x: i32) -> i32 { return x + 1; });
        return vec.len(out);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const inferred = inferProgram(ast as never);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('generates JS function expressions for lambda arguments', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let base: i32 = 2;
        let nums: Vec<i32> = vec.new();
        let out = vec.map(nums, fn(x: i32) -> i32 { return x + base; });
        return vec.len(out);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('function(x)');
    expect(js).toContain('x + base');
  });
});
