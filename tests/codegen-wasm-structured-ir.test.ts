import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWasmTextModuleFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import type { WasmTextInstruction, WasmTextModule } from '../src/lumina/wasm-module.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const countRawInstructions = (instructions: WasmTextInstruction[]): number => {
  let count = 0;
  for (const instruction of instructions) {
    if (instruction.kind === 'raw') {
      count += 1;
      continue;
    }
    if (instruction.kind === 'if') {
      count += countRawInstructions(instruction.thenBody);
      count += countRawInstructions(instruction.elseBody ?? []);
      continue;
    }
    if (instruction.kind === 'block' || instruction.kind === 'loop') {
      count += countRawInstructions(instruction.body);
    }
  }
  return count;
};

const countModuleRawInstructions = (module: WasmTextModule): number =>
  module.functions.reduce((sum, fn) => sum + countRawInstructions(fn.body), 0);

describe('WASM structured module IR', () => {
  it('normalizes legacy text-shaped expression lowering into structured instructions', () => {
    const source = `
      enum Option {
        Some(i32),
        None
      }

      enum Result<T, E> {
        Ok(T),
        Err(E)
      }

      fn compute(x: i32) -> Result<i32, string> {
        if x > 0 {
          return Result.Ok(x);
        } else {
          return Result.Err("bad");
        }
      }

      fn calc() -> Result<i32, string> {
        let value = compute(3)?;
        let out = match Option.Some(value) {
          Some(v) if v > 2 => v,
          None => 0,
          _ => 1
        };
        return Result.Ok(out);
      }

      async fn work(label: string) -> string {
        return label;
      }

      async fn main() -> string {
        return select! {
          first = work("a") => first,
          _ = work("b") => "b"
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWasmTextModuleFromAst(ast, { exportMain: true });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(countModuleRawInstructions(result.module)).toBe(0);
  });
});
