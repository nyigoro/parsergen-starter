import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('Async/Await codegen (AST)', () => {
  const compile = (program: string): string => {
    const ast = parser.parse(program.trim() + '\n') as never;
    return generateJSFromAst(ast).code;
  };

  test('emits async functions', () => {
    const program = `
      async fn fetchData() -> string {
        "data"
      }
    `;
    const code = compile(program);
    expect(code).toContain('async function fetchData()');
  });

  test('emits await expressions', () => {
    const program = `
      async fn process() -> string {
        let result = await getData();
        return result;
      }
    `;
    const code = compile(program);
    expect(code).toContain('await getData()');
  });

  test('does not add async to sync functions', () => {
    const program = `
      fn syncFunc() -> int {
        return 42;
      }
    `;
    const code = compile(program);
    expect(code).toContain('function syncFunc()');
    expect(code).not.toContain('async function syncFunc()');
  });
});
