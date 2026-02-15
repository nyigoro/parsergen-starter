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

describe('array literal + index syntax', () => {
  it('parses array literals and index expressions', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, 2, 3];
        v[1]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const fn = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fn?.type).toBe('FnDecl');
    if (!fn || fn.type !== 'FnDecl') return;

    const letStmt = fn.body.body[0];
    expect(letStmt?.type).toBe('Let');
    if (!letStmt || letStmt.type !== 'Let') return;
    expect(letStmt.value.type).toBe('ArrayLiteral');
  });

  it('type checks homogeneous arrays and element indexing', () => {
    const source = `
      fn main() -> i32 {
        let v = [10, 20, 30];
        v[1]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports array type mismatch for heterogeneous literals', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, "two", 3];
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(analysis.diagnostics.some((diag) => diag.code === 'ARRAY-TYPE-MISMATCH')).toBe(true);
  });

  it('HM infers array element type from literals', () => {
    const source = `
      fn main() -> i32 {
        let nums = [1, 2, 3];
        nums[0]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const inferred = inferProgram(ast);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('lowers to vec.from and __lumina_index in AST JS codegen', () => {
    const source = `
      fn main() -> i32 {
        let nums = [1, 2, 3];
        nums[0]
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('vec.from([1, 2, 3])');
    expect(js).toContain('__lumina_index(nums, 0)');
  });
});

