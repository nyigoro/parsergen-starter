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

describe('Web-native std modules', () => {
  it('typechecks @std/opfs, @std/sab_channel, and @std/webgpu usage', () => {
    const source = `
      import { opfs, sab_channel, webgpu } from "@std";

      fn main() -> bool {
        let _ = opfs.is_available();
        let ch = sab_channel.bounded_i32(4);
        sab_channel.close_i32(ch);
        let _gpu = webgpu.is_available();
        true
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const semanticErrors = semantic.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const inferred = inferProgram(ast);
    const hmErrors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('emits web-native runtime module calls in JS codegen', () => {
    const source = `
      import { opfs, sab_channel, webgpu } from "@std";

      fn main() -> void {
        let available = opfs.is_available();
        let _ = available;
        let ch = sab_channel.bounded_i32(2);
        sab_channel.close_i32(ch);
        let _gpu = webgpu.is_available();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('opfs.is_available');
    expect(js).toContain('sab_channel.bounded_i32');
    expect(js).toContain('webgpu.is_available');
  });
});
