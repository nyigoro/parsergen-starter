import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM semantic gates', () => {
  it('accepts is narrowing when semantic target is wasm', () => {
    const source = `
      enum Option<T> {
        Some(T),
        None
      }

      fn main(opt: Option<i32>) -> i32 {
        if (opt is Option.Some) {
          return 1;
        }
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const wasmAnalysis = analyzeLumina(ast, { target: 'wasm' });
    const jsAnalysis = analyzeLumina(ast, { target: 'esm' });
    expect(wasmAnalysis.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(jsAnalysis.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});
