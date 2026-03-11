import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram =>
  parser.parse(source.trim() + '\n') as LuminaProgram;

const expectParses = (source: string): void => {
  const ast = parseProgram(source);
  expect(ast.type).toBe('Program');
};

describe('whitespace + semicolon optionality', () => {
  test('let statements parse with or without semicolons', () => {
    [
      `
      fn main() -> i32 {
        let x = 1
        x
      }
      `,
      `
      fn main() -> i32 {
        let x = 1;
        x
      }
      `,
      `
      fn main() -> i32 {
        let x = 1 + 2
        x
      }
      `,
      `
      fn main() -> i32 {
        let mut x = 1
        x
      }
      `,
    ].forEach(expectParses);
  });

  test('type aliases parse with or without semicolons', () => {
    [
      `
      type Foo = Bar
      fn main() -> i32 { 0 }
      `,
      `
      type Foo = Bar;
      fn main() -> i32 { 0 }
      `,
      `
      type Foo = string
      fn main() -> i32 { 0 }
      `,
      `
      type Foo = Vec<int>
      fn main() -> i32 { 0 }
      `,
    ].forEach(expectParses);
  });

  test('ADT form is not confused with simple aliases', () => {
    const adtProgram = `
      type Option<T> = Some(T) | None
      fn main() -> i32 { 0 }
    `;
    const adtAst = parseProgram(adtProgram);
    expect(adtAst.body[0]?.type).toBe('EnumDecl');

    const unionProgram = `
      type Foo = Bar | Baz
      fn main() -> i32 { 0 }
    `;
    const unionAst = parseProgram(unionProgram);
    expect(unionAst.body[0]?.type).toBe('EnumDecl');

    const aliasProgram = `
      type Foo = Bar
      fn main() -> i32 { 0 }
    `;
    const aliasAst = parseProgram(aliasProgram);
    expect(aliasAst.body[0]?.type).toBe('TypeDecl');
  });

  test('regression: optional semicolons remain consistent', () => {
    [
      `
      fn main() -> i32 {
        let (a, b) = (1, 2)
        let (c, d) = (3, 4);
        return a + b + c + d
      }
      `,
      `
      fn main() -> i32 {
        let mut x = 0
        x = 1
        if (x == 1) { x = 2 }
        while (x < 4) { x = x + 1 }
        match x { _ => x }
      }
      `,
      `
      fn main() -> i32 {
        let mut i = 0
        while (i < 3) {
          i = i + 1
          if (i == 2) { continue }
        }
        0
      }
      `,
      `
      fn main() -> i32 {
        let mut i = 0
        while (i < 3) {
          i = i + 1
          if (i == 2) { break }
        }
        0
      }
      `,
    ].forEach(expectParses);
  });
});
