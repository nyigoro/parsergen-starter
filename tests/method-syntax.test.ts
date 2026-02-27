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

describe('method syntax', () => {
  it('supports Vec method calls', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('supports HashMap method calls', () => {
    const source = `
      import { hashmap } from "@std";

      fn main() -> i32 {
        let m: HashMap<string, i32> = hashmap.new();
        m.insert("alice", 30);
        m.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('infers receiver method call types in HM', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const inferred = inferProgram(ast);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('emits receiver call syntax in AST JS codegen', () => {
    const source = `
      fn main() -> i32 {
        let v = [1, 2, 3];
        v.push(4);
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('v.push(4);');
    expect(js).toContain('v.len();');
  });

  it('supports thread.spawn task handles and join method', () => {
    const source = `
      import { thread } from "@std";

      fn worker(id: i32) -> i32 {
        return id * 2;
      }

      fn main() -> i32 {
        let handle = thread.spawn(|| worker(42));
        let result = handle.join();
        result
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });
});
