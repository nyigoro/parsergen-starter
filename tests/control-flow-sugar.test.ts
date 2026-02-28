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

describe('control flow + destructuring sugar', () => {
  it('parses for-range, while-let, and tuple destructuring', () => {
    const source = `
      import { channel } from "@std";
      enum Option { Some(i32), None }

      fn recv() -> Option {
        Option.None
      }

      fn main() -> i32 {
        let (tx, rx) = channel.new();
        for i in 0..10 {
          tx;
        }
        while let Some(v) = recv() {
          v;
        }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const fn = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'main');
    expect(fn?.type).toBe('FnDecl');
    if (!fn || fn.type !== 'FnDecl') return;

    expect(fn.body.body.some((stmt) => stmt.type === 'LetTuple')).toBe(true);
    expect(fn.body.body.some((stmt) => stmt.type === 'For')).toBe(true);
    expect(fn.body.body.some((stmt) => stmt.type === 'WhileLet')).toBe(true);
  });

  it('type-checks for-range loops', () => {
    const source = `
      fn process(v: i32) -> i32 { v }

      fn main() -> i32 {
        for i in 0..10 {
          process(i);
        }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('type-checks while-let pattern loops', () => {
    const source = `
      enum Option { Some(i32), None }

      fn recv() -> Option {
        Option.Some(1)
      }

      fn process(v: i32) -> i32 {
        v
      }

      fn main() -> i32 {
        while let Some(v) = recv() {
          process(v);
          return 0;
        }
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('type-checks tuple destructuring for channel.new()', () => {
    const source = `
      import { channel } from "@std";
      fn main() -> i32 {
        let (tx, rx) = channel.new();
        channel.send(tx, 1);
        channel.try_recv(rx);
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('infers types for sugar constructs in HM', () => {
    const source = `
      import { channel } from "@std";
      enum Option { Some(i32), None }
      fn recv() -> Option { Option.None }

      fn main() -> i32 {
        let (tx, rx) = channel.new();
        for i in 0..10 {
          i;
        }
        while let Some(v) = recv() {
          v;
        }
        channel.send(tx, 1);
        channel.try_recv(rx);
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const inferred = inferProgram(ast);
    const errors = inferred.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('lowers to JS constructs for new syntax', () => {
    const source = `
      import { channel } from "@std";
      enum Option { Some(i32), None }
      fn recv() -> Option { Option.None }

      fn main() -> i32 {
        let (tx, rx) = channel.new();
        for i in 0..10 {
          i;
        }
        while let Some(v) = recv() {
          v;
          return 0;
        }
        channel.send(tx, 1);
        channel.try_recv(rx);
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;

    expect(js).toContain('for (let i =');
    expect(js).toContain('while (true)');
    expect(js).toContain('const __tuple_');
    expect(js).toContain('const tx =');
    expect(js).toContain('const rx =');
  });
});
