import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Trait Bounds', () => {
  it('allows trait-bounded type params in generic functions', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void;
      }

      struct User { name: string }

      impl Printable for User {
        fn print(self: Self) -> void {
          io.println(self.name);
        }
      }

      fn print_one<T: Printable>(item: T) -> void {
        item.print();
      }

      fn main() -> void {
        let u = User { name: "Alice" };
        print_one(u);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports bound mismatch when type does not implement trait', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void;
      }

      struct User { name: string }

      fn print_one<T: Printable>(item: T) -> void {
        item.print();
      }

      fn main() -> void {
        let u = User { name: "Alice" };
        print_one(u);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics, 'BOUND_MISMATCH', 'error')).toBe(true);
  });

  it('supports multiple trait bounds with +', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void;
      }

      trait Cloneable {
        fn clone(self: Self) -> Self;
      }

      struct User { name: string }

      impl Printable for User {
        fn print(self: Self) -> void {
          io.println(self.name);
        }
      }

      impl Cloneable for User {
        fn clone(self: Self) -> Self {
          self
        }
      }

      fn process<T: Printable + Cloneable>(value: T) -> T {
        value.print();
        value.clone()
      }

      fn main() -> void {
        let u = User { name: "Alice" };
        let _v = process(u);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
