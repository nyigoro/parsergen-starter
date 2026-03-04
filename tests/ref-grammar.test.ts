import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const analyzeCodes = (source: string): string[] => {
  const ast = parseProgram(source);
  return analyzeLumina(ast).diagnostics.map((diag) => diag.code);
};

describe('ref pattern grammar + semantic checks', () => {
  test('parses let ref binding', () => {
    const ast = parseProgram(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        let ref x = val;
        return x;
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    const letStmt = fnDecl.body.body[1];
    expect(letStmt?.type).toBe('Let');
    if (!letStmt || letStmt.type !== 'Let') return;
    expect(letStmt.ref).toBe(true);
    expect(letStmt.refMut).toBe(false);
  });

  test('parses let ref mut binding', () => {
    const ast = parseProgram(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        let ref mut x = val;
        x = 2;
        return val;
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    const letStmt = fnDecl.body.body[1];
    expect(letStmt?.type).toBe('Let');
    if (!letStmt || letStmt.type !== 'Let') return;
    expect(letStmt.ref).toBe(true);
    expect(letStmt.refMut).toBe(true);
  });

  test('parses match arm ref binding pattern', () => {
    const ast = parseProgram(
      `
      enum OptionI32 { Some(i32), None }
      fn main() -> i32 {
        let v = OptionI32.Some(1);
        match v {
          Some(ref x) => { return x; },
          None => { return 0; }
        }
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    const matchStmt = fnDecl.body.body[1];
    expect(matchStmt?.type).toBe('MatchStmt');
    if (!matchStmt || matchStmt.type !== 'MatchStmt') return;
    const arm = matchStmt.arms[0];
    expect(arm.pattern.type).toBe('EnumPattern');
    if (arm.pattern.type !== 'EnumPattern') return;
    expect(arm.pattern.patterns?.[0]?.type).toBe('RefBindingPattern');
    if (!arm.pattern.patterns || arm.pattern.patterns[0].type !== 'RefBindingPattern') return;
    expect(arm.pattern.patterns[0].name).toBe('x');
    expect(arm.pattern.patterns[0].mutable).toBe(false);
  });

  test('parses match arm ref mut binding pattern', () => {
    const ast = parseProgram(
      `
      enum OptionI32 { Some(i32), None }
      fn main() -> i32 {
        let mut v = OptionI32.Some(1);
        match v {
          Some(ref mut x) => { return x; },
          None => { return 0; }
        }
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    const matchStmt = fnDecl.body.body[1];
    expect(matchStmt?.type).toBe('MatchStmt');
    if (!matchStmt || matchStmt.type !== 'MatchStmt') return;
    const arm = matchStmt.arms[0];
    expect(arm.pattern.type).toBe('EnumPattern');
    if (arm.pattern.type !== 'EnumPattern') return;
    expect(arm.pattern.patterns?.[0]?.type).toBe('RefBindingPattern');
    if (!arm.pattern.patterns || arm.pattern.patterns[0].type !== 'RefBindingPattern') return;
    expect(arm.pattern.patterns[0].mutable).toBe(true);
  });

  test('rejects ref as identifier name', () => {
    const ast = parseProgram(
      `
      fn main() -> i32 {
        let ref = 1;
        return ref;
      }
      `.trim() + '\n'
    );
    const fnDecl = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fnDecl?.type).toBe('FnDecl');
    if (!fnDecl || fnDecl.type !== 'FnDecl') return;
    expect(fnDecl.body.body.some((stmt) => stmt.type === 'ErrorNode')).toBe(true);
  });

  test('accepts let ref from lvalue', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        let ref x = val;
        return x;
      }
      `.trim() + '\n'
    );
    expect(codes.includes('REF_LVALUE_REQUIRED')).toBe(false);
    expect(codes.includes('REF_MUT_REQUIRED')).toBe(false);
  });

  test('emits REF_LVALUE_REQUIRED for let ref from rvalue', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let ref x = 42;
        return x;
      }
      `.trim() + '\n'
    );
    expect(codes).toContain('REF_LVALUE_REQUIRED');
  });

  test('emits REF_MUT_REQUIRED for let ref mut from immutable source', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let val: i32 = 1;
        let ref mut x = val;
        return x;
      }
      `.trim() + '\n'
    );
    expect(codes).toContain('REF_MUT_REQUIRED');
  });

  test('accepts let ref mut from mutable source', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        let ref mut x = val;
        x = 2;
        return val;
      }
      `.trim() + '\n'
    );
    expect(codes.includes('REF_MUT_REQUIRED')).toBe(false);
  });

  test('emits REF_MUT_REQUIRED for immutable match scrutinee with ref mut pattern', () => {
    const codes = analyzeCodes(
      `
      enum OptionI32 { Some(i32), None }
      fn main() -> i32 {
        let v = OptionI32.Some(1);
        match v {
          Some(ref mut x) => { return x; },
          None => { return 0; }
        }
      }
      `.trim() + '\n'
    );
    expect(codes).toContain('REF_MUT_REQUIRED');
  });

  test('keeps move checks active for let ref borrows', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        let ref x = val;
        let moved = move val;
        return moved;
      }
      `.trim() + '\n'
    );
    expect(codes).toContain('MOVE_WHILE_BORROWED');
  });

  test('releases borrow when ref binding scope exits', () => {
    const codes = analyzeCodes(
      `
      fn main() -> i32 {
        let mut val: i32 = 1;
        {
          let ref x = val;
          let y: i32 = x;
        }
        let moved = move val;
        return moved;
      }
      `.trim() + '\n'
    );
    expect(codes.includes('MOVE_WHILE_BORROWED')).toBe(false);
  });
});
