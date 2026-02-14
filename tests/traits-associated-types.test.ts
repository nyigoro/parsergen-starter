import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

type Diagnostic = { code?: string; severity?: string };

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Trait Associated Types', () => {
  it('accepts associated types in trait and impl', () => {
    const source = `
      enum Option<T> { Some(T), None }

      trait Iterator {
        type Item;
        fn next(self: Self) -> Option<Self::Item>;
      }

      struct Counter { value: i32 }

      impl Iterator for Counter {
        type Item = i32;
        fn next(self: Self) -> Option<Self::Item> {
          Option.None
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports missing associated type in impl', () => {
    const source = `
      enum Option<T> { Some(T), None }

      trait Iterator {
        type Item;
        fn next(self: Self) -> Option<Self::Item>;
      }

      struct Counter { value: i32 }

      impl Iterator for Counter {
        fn next(self: Self) -> Option<Self::Item> {
          Option.None
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics, 'TRAIT-012', 'error')).toBe(true);
  });
});

describe('Trait Default Methods', () => {
  it('uses default method when impl omits it', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void {
          io.println(self.debug());
        }
        fn debug(self: Self) -> string;
      }

      struct User { name: string }

      impl Printable for User {
        fn debug(self: Self) -> string {
          self.name
        }
      }

      fn main() -> void {
        let u = User { name: "Alice" };
        u.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const analysis = analyzeLumina(ast);
    const errors = analysis.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);

    const js = generateJSFromAst(ast, { traitMethodResolutions: analysis.traitMethodResolutions }).code;
    expect(js).toContain('function Printable$User$print');
    expect(js).toContain('Printable$User$debug');
  });
});
