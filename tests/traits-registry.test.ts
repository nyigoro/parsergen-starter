import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

type Diagnostic = { code?: string; severity?: string; message?: string };

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const hasDiagnostic = (diags: Diagnostic[], code: string, severity?: string) =>
  diags.some((d) => d.code === code && (!severity || d.severity === severity));

describe('Trait Registry', () => {
  it('accepts valid trait and impl', () => {
    const source = `
      trait Printable<T> {
        fn print(self: T) -> unit;
      }

      struct User {
        name: string
      }

      impl Printable<User> for User {
        fn print(self: User) -> unit {
          io.println(self.name);
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('detects missing trait method in impl', () => {
    const source = `
      trait Printable<T> {
        fn print(self: T) -> unit;
        fn show(self: T) -> string;
      }

      struct User {
        name: string
      }

      impl Printable<User> for User {
        fn print(self: User) -> unit {
          io.println(self.name);
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics as Diagnostic[], 'TRAIT-004', 'error')).toBe(true);
  });

  it('detects signature mismatch', () => {
    const source = `
      trait Printable<T> {
        fn print(self: T) -> unit;
      }

      struct User {
        name: string
      }

      impl Printable<User> for User {
        fn print(self: User, extra: i32) -> unit {
          io.println(self.name);
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics as Diagnostic[], 'TRAIT-006', 'error')).toBe(true);
  });

  it('supports supertraits and enforces required impls', () => {
    const source = `
      enum Ordering { Less, Equal, Greater }

      trait Eq {
        fn eq(self: Self, other: Self) -> bool;
      }

      trait Ord : Eq {
        fn cmp(self: Self, other: Self) -> Ordering;
      }

      struct Point {
        x: i32,
        y: i32
      }

      impl Ord for Point {
        fn cmp(self: Point, other: Point) -> Ordering {
          Ordering.Equal
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    expect(hasDiagnostic(diagnostics as Diagnostic[], 'TRAIT-015', 'error')).toBe(true);
  });

  it('accepts Ord impl when supertrait impl exists', () => {
    const source = `
      enum Ordering { Less, Equal, Greater }

      trait Eq {
        fn eq(self: Self, other: Self) -> bool;
      }

      trait Ord : Eq {
        fn cmp(self: Self, other: Self) -> Ordering;
      }

      struct Point {
        x: i32,
        y: i32
      }

      impl Eq for Point {
        fn eq(self: Point, other: Point) -> bool {
          self.x == other.x && self.y == other.y
        }
      }

      impl Ord for Point {
        fn cmp(self: Point, other: Point) -> Ordering {
          Ordering.Equal
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const { diagnostics } = analyzeLumina(ast);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
  });
});
