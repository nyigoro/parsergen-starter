import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWasmTextModuleFromAst } from '../src/lumina/codegen-wasm.js';
import { emitWasmBinary } from '../src/lumina/wasm-emit-binary.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import { createEmptyWasmTextModule, wasmOp, wasmTextFunction } from '../src/lumina/wasm-module.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('WASM binary emitter', () => {
  it('validates and runs a simple direct binary module', async () => {
    const module = createEmptyWasmTextModule();
    module.functions.push(wasmTextFunction('main', [], [wasmOp('i32.const', 3)], { results: ['i32'] }));
    module.exports.push('  (export "main" (func $main))');

    const binary = emitWasmBinary(module);
    expect(WebAssembly.validate(binary)).toBe(true);

    const { instance } = await WebAssembly.instantiate(binary);
    expect((instance.exports.main as () => number)()).toBe(3);
  });

  it('encodes a name section for real Lumina-generated modules', () => {
    const source = `
      fn add(a: int, b: int) -> int {
        return a + b;
      }

      fn main() -> int {
        return add(1, 2);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const result = generateWasmTextModuleFromAst(ast, { exportMain: true });
    const hardErrors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    expect(hardErrors).toHaveLength(0);

    const binary = emitWasmBinary(result.module, { includeNameSection: true });
    expect(WebAssembly.validate(binary)).toBe(true);
    expect(Buffer.from(binary).includes(Buffer.from('name'))).toBe(true);
  });

  it('encodes lumina debug and extra custom sections', () => {
    const module = createEmptyWasmTextModule();
    module.functions.push(wasmTextFunction('main', [], [wasmOp('i32.const', 1)], { results: ['i32'] }));
    module.exports.push('  (export "main" (func $main))');
    module.debugMetadata = {
      version: 1,
      targetProfile: 'wasm-standalone',
      sourceFile: 'fixtures/main.lm',
      functionNames: ['main'],
      exportNames: ['main'],
      importNames: [],
    };
    module.customSections.push({ name: 'lumina.extra', data: 'phase-5' });

    const binary = emitWasmBinary(module);
    const buffer = Buffer.from(binary);
    expect(WebAssembly.validate(binary)).toBe(true);
    expect(buffer.includes(Buffer.from('lumina.debug'))).toBe(true);
    expect(buffer.includes(Buffer.from('fixtures/main.lm'))).toBe(true);
    expect(buffer.includes(Buffer.from('lumina.extra'))).toBe(true);
  });
});
