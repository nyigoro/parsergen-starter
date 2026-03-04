import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { lowerLumina } from '../src/lumina/lower.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const parser = compileGrammar<LuminaProgram>(fs.readFileSync(grammarPath, 'utf-8'));

const parseProgram = (source: string): LuminaProgram => parser.parse(source);

describe('shader DSL grammar + lowering', () => {
  test('parses shader declarations and lowers to WGSL string constant', () => {
    const source = `
      shader compute cs_main(id: vec3<u32> @builtin(global_invocation_id)) @workgroup_size(8) {
        let i = id.x;
      }

      fn main() -> string {
        cs_main
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const shaderDecl = ast.body.find((stmt) => stmt.type === 'ShaderDecl');
    expect(shaderDecl?.type).toBe('ShaderDecl');

    const semantic = analyzeLumina(ast);
    const errors = semantic.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);

    const lowered = lowerLumina(ast);
    const shaderLet = lowered.body.find(
      (node) => node.kind === 'Let' && (node as { name?: string }).name === 'cs_main'
    ) as { value?: { kind?: string; value?: string } } | undefined;

    expect(shaderLet?.value?.kind).toBe('String');
    expect(shaderLet?.value?.value).toContain('@compute @workgroup_size(8, 1, 1)');
  });
});
