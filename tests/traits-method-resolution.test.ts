import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Trait Method Resolution', () => {
  it('resolves trait method call', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void;
      }

      struct User {
        name: string
      }

      impl Printable for User {
        fn print(self: Self) -> void {
          io.println(self.name);
        }
      }

      fn main() -> void {
        let u = User { name: "Alice" };
        u.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics, traitMethodResolutions } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(traitMethodResolutions.size).toBeGreaterThan(0);
  });

  it('generates mangled function for impl method', () => {
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
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { traitMethodResolutions } = analyzeLumina(ast);
    const js = generateJSFromAst(ast, { traitMethodResolutions }).code;
    expect(js).toContain('function Printable$User$print');
  });

  it('generates correct call to trait method', () => {
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

      fn main() -> void {
        let u = User { name: "Alice" };
        u.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { traitMethodResolutions } = analyzeLumina(ast);
    const js = generateJSFromAst(ast, { traitMethodResolutions }).code;
    expect(js).toMatch(/Printable\$User\$print\([^)]*\)/);
  });

  it('passes arguments to trait method', () => {
    const source = `
      trait Formatter {
        fn format(self: Self, prefix: string) -> string;
      }

      struct User { name: string }

      impl Formatter for User {
        fn format(self: Self, prefix: string) -> string {
          str.concat(prefix, self.name)
        }
      }

      fn main() -> string {
        let u = User { name: "Alice" };
        u.format("User: ")
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { traitMethodResolutions } = analyzeLumina(ast);
    const js = generateJSFromAst(ast, { traitMethodResolutions }).code;
    expect(js).toMatch(/Formatter\$User\$format\([^,]+,\s*[^)]+\)/);
  });

  it('resolves method calls on member chains', () => {
    const source = `
      trait Printable {
        fn print(self: Self) -> void;
      }

      struct Profile { name: string }

      impl Printable for Profile {
        fn print(self: Self) -> void {
          io.println(self.name);
        }
      }

      struct User { profile: Profile }

      fn main() -> void {
        let u = User { profile: Profile { name: "Alice" } };
        u.profile.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics, traitMethodResolutions } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    const js = generateJSFromAst(ast, { traitMethodResolutions }).code;
    expect(js).toContain('Printable$Profile$print(u.profile)');
  });

  it('supports chaining after method calls', () => {
    const source = `
      trait Builder {
        fn build(self: Self) -> Config;
      }

      struct Config { value: string }

      struct User { name: string }

      impl Builder for User {
        fn build(self: Self) -> Config {
          Config { value: self.name }
        }
      }

      fn main() -> string {
        let u = User { name: "Alice" };
        u.build().value
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics, traitMethodResolutions } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    const js = generateJSFromAst(ast, { traitMethodResolutions }).code;
    expect(js).toContain('Builder$User$build(u).value');
  });

  it('reports error for missing trait method', () => {
    const source = `
      struct User { name: string }

      fn main() -> void {
        let u = User { name: "Alice" };
        u.print();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics as Diagnostic[], 'MEMBER-NOT-FOUND', 'error')).toBe(true);
  });
});
