import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diagnostics: Array<{ code?: string }>, code: string) =>
  diagnostics.some((diag) => diag.code === code);

describe('member resolution regressions', () => {
  it('resolves io.print as module member without enum fallback', () => {
    const source = `
      import { io } from "@std";

      fn main() -> i32 {
        io.print("ok");
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const messages = analysis.diagnostics.map((diag) => diag.message).join('\n');
    expect(messages).not.toMatch(/Unknown enum variant/);
    expect(hasDiagnostic(analysis.diagnostics, 'UNRESOLVED_MEMBER')).toBe(false);
  });

  it('reports unresolved module members explicitly', () => {
    const source = `
      import { channel } from "@std";

      fn main() -> i32 {
        channel.make();
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    expect(hasDiagnostic(analysis.diagnostics, 'UNRESOLVED_MEMBER')).toBe(true);
    const messages = analysis.diagnostics.map((diag) => diag.message).join('\n');
    expect(messages).toMatch(/channel\.make/);
    expect(messages).not.toMatch(/Unknown enum variant/);
  });

  it('stops after first unresolved member when fail-fast mode is enabled', () => {
    const source = `
      import { channel } from "@std";

      fn main() -> i32 {
        channel.make();
        channel.make();
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast, { stopOnUnresolvedMemberError: true });
    const unresolved = analysis.diagnostics.filter((diag) => diag.code === 'UNRESOLVED_MEMBER');
    expect(unresolved).toHaveLength(1);
  });

  it('resolves import aliases and namespace aliases', () => {
    const source = `
      import { io as console_io } from "@std";
      import * as channel_ns from "@std/channel";

      fn main() -> i32 {
        console_io.print("ok");
        channel_ns.new();
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('prefers module namespace resolution before enum variant lookup', () => {
    const source = `
      import { io } from "@std";
      enum io { print }

      fn main() -> i32 {
        io.print("ok");
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const messages = analysis.diagnostics.map((diag) => diag.message).join('\n');
    expect(messages).not.toMatch(/Unknown enum variant/);
    expect(hasDiagnostic(analysis.diagnostics, 'UNRESOLVED_MEMBER')).toBe(false);
  });

  it('parses chained member/index after calls', () => {
    const source = `
      fn main() -> i32 {
        let a = obj.method()[0];
        let b = obj.method()[0..2];
        return 0;
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    expect(ast.type).toBe('Program');
  });
});
