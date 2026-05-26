import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { emitWasmBinary } from '../src/lumina/wasm-emit-binary.js';
import { generateWasmTextModuleFromAst, generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

const decodeStandaloneString = async (binary: Uint8Array, exportName: string = 'main'): Promise<string> => {
  const { instance } = await WebAssembly.instantiate(binary);
  const result = (instance.exports[exportName] as () => number)();
  const memory = instance.exports.memory as WebAssembly.Memory;
  const view = new DataView(memory.buffer);
  const len = view.getInt32(result, true);
  return new TextDecoder().decode(new Uint8Array(memory.buffer, result + 4, len));
};

describe('WASM standalone hardening', () => {
  it('prunes unused host imports for pure arithmetic modules', async () => {
    const ast = parseProgram(`
      fn main() -> int {
        return (4 + 5) * 2;
      }
    `);

    const result = generateWasmTextModuleFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-web',
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);
    expect(result.module.imports).toHaveLength(0);

    const binary = emitWasmBinary(result.module);
    expect(WebAssembly.validate(binary)).toBe(true);
    const { instance } = await WebAssembly.instantiate(binary);
    expect((instance.exports.main as () => number)()).toBe(18);
  });

  it('keeps import-pruned modules import-free in emitted WAT', () => {
    const ast = parseProgram(`
      fn main() -> int {
        return 42;
      }
    `);

    const result = generateWATFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-web',
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);
    expect(result.wat).not.toContain('(import "env"');
  });

  it('runs standalone string helpers without host imports', async () => {
    const ast = parseProgram(`
      import { str } from "@std";
      fn main() -> i32 {
        let s = str.concat("he", "llo");
        let mid = s[1..4];
        if (mid == "ell") {
          return str.length(s);
        } else {
          return 0;
        }
        return 0;
      }
    `);

    const result = generateWasmTextModuleFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-standalone',
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);
    expect(result.module.imports).toHaveLength(0);

    const binary = emitWasmBinary(result.module);
    expect(WebAssembly.validate(binary)).toBe(true);
    const { instance } = await WebAssembly.instantiate(binary);
    expect((instance.exports.main as () => number)()).toBe(5);
  });

  it('returns strings in standalone binaries without host imports', async () => {
    const ast = parseProgram(`
      fn main() -> string {
        return "hello";
      }
    `);

    const result = generateWasmTextModuleFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-standalone',
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);
    expect(result.module.imports).toHaveLength(0);
    const binary = emitWasmBinary(result.module);
    expect(WebAssembly.validate(binary)).toBe(true);
    await expect(decodeStandaloneString(binary)).resolves.toBe('hello');
  });

  it('rejects unsupported host-runtime dependencies on wasm-standalone', () => {
    const ast = parseProgram(`
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        return vec.len(v);
      }
    `);

    const result = generateWasmTextModuleFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-standalone',
    });

    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain('WASM-STANDALONE-001');
  });

  it('emits lumina debug metadata when requested', () => {
    const ast = parseProgram(`
      fn main() -> int {
        return 9;
      }
    `);

    const result = generateWasmTextModuleFromAst(ast, {
      exportMain: true,
      targetProfile: 'wasm-standalone',
      sourceFile: 'fixtures/standalone-main.lm',
      emitDebugMetadata: true,
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(0);
    const binary = emitWasmBinary(result.module);
    const buffer = Buffer.from(binary);
    expect(buffer.includes(Buffer.from('lumina.debug'))).toBe(true);
    expect(buffer.includes(Buffer.from('fixtures/standalone-main.lm'))).toBe(true);
  });
});
