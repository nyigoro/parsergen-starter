import fs from 'node:fs';
import path from 'node:path';

import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const analyzeProgram = (source: string) => analyzeLumina(parser.parse(source) as LuminaProgram);
const codesFor = (source: string) => analyzeProgram(source).diagnostics.map((diag) => diag.code);

describe('borrow safety coverage', () => {
  test('reports USE_AFTER_MOVE after moving a variable and using it again', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let x = 1;
        let y = move x;
        let z = x;
        return y;
      }
    `.trim() + '\n');

    expect(codes).toContain('USE_AFTER_MOVE');
  });

  test('reports USE_AFTER_MOVE when assigning through a moved value path', () => {
    const codes = codesFor(`
      struct Pair { a: i32, b: i32 }
      fn main() -> i32 {
        let mut p = Pair { a: 1, b: 2 };
        let moved = move p;
        p.a = 2;
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('USE_AFTER_MOVE');
  });

  test('tracks partial moves conservatively for whole values but not sibling fields', () => {
    const analysis = analyzeProgram(`
      struct Pair { a: i32, b: i32 }
      fn main() -> i32 {
        let p = Pair { a: 1, b: 2 };
        let moved = move p.a;
        let ok = p.b;
        let whole = p;
        return ok;
      }
    `.trim() + '\n');

    const moveErrors = analysis.diagnostics.filter((diag) => diag.code === 'USE_AFTER_MOVE');
    expect(moveErrors.some((diag) => diag.message.includes("Cannot use 'p' because field 'a' was already moved"))).toBe(true);
    expect(moveErrors.some((diag) => diag.message.includes("Cannot use 'p.b'"))).toBe(false);
  });

  test('reports USE_AFTER_MOVE after branch merges when move happened in one branch', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let x = 1;
        if (true) {
          let y = move x;
        } else {
          let z = 0;
        }
        let w = x;
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('USE_AFTER_MOVE');
  });

  test('reports USE_AFTER_MOVE after branch merges when move happened in both branches', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let x = 1;
        if (true) {
          let y = move x;
        } else {
          let z = move x;
        }
        let w = x;
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('USE_AFTER_MOVE');
  });

  test('reports MOVE_WHILE_BORROWED for persistent ref bindings', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        let ref held = x;
        let moved = move x;
        return moved;
      }
    `.trim() + '\n');

    expect(codes).toContain('MOVE_WHILE_BORROWED');
  });

  test('allows moves after temporary ref-param borrows expire', () => {
    const codes = codesFor(`
      fn borrow(ref x: i32) -> i32 { return x; }
      fn main() -> i32 {
        let mut x: i32 = 1;
        let held = borrow(x);
        let moved = move x;
        return moved;
      }
    `.trim() + '\n');

    expect(codes.includes('MOVE_WHILE_BORROWED')).toBe(false);
  });

  test('reports MOVE_WHILE_BORROWED when a move closure captures a persistently borrowed variable', () => {
    const codes = codesFor(`
      import { thread } from "@std";
      async fn main() -> i32 {
        let x = 1;
        let ref held = x;
        let h = thread.spawn(move || x + 1);
        let joined = await h.join();
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('MOVE_WHILE_BORROWED');
  });

  test('allows move closure capture after a temporary borrow expires', () => {
    const codes = codesFor(`
      import { thread } from "@std";
      fn borrow(ref x: i32) -> i32 { return x; }
      async fn main() -> i32 {
        let x = 1;
        let held = borrow(x);
        let h = thread.spawn(move || x + 1);
        let joined = await h.join();
        return 0;
      }
    `.trim() + '\n');

    expect(codes.includes('MOVE_WHILE_BORROWED')).toBe(false);
  });

  test('allows two shared borrows of the same value', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        let ref a = x;
        let ref b = x;
        return a + b;
      }
    `.trim() + '\n');

    expect(codes.includes('BORROW_CONFLICT')).toBe(false);
  });

  test('rejects shared then mutable borrow overlap', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        let ref a = x;
        let ref mut b = x;
        return a;
      }
    `.trim() + '\n');

    expect(codes).toContain('BORROW_CONFLICT');
  });

  test('rejects mutable then shared borrow overlap', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        let ref mut a = x;
        let ref b = x;
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('BORROW_CONFLICT');
  });

  test('allows a new mutable borrow after the first mutable borrow scope exits', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        {
          let ref mut a = x;
          a = 2;
        }
        let ref mut b = x;
        b = 3;
        return x;
      }
    `.trim() + '\n');

    expect(codes.includes('BORROW_CONFLICT')).toBe(false);
  });

  test('allows disjoint field borrows but rejects overlapping field borrows', () => {
    const okCodes = codesFor(`
      struct Pair { x: i32, y: i32 }
      fn main() -> i32 {
        let mut p = Pair { x: 1, y: 2 };
        let ref mut left = p.x;
        let ref mut right = p.y;
        left = 3;
        right = 4;
        return p.x + p.y;
      }
    `.trim() + '\n');
    const conflictCodes = codesFor(`
      struct Pair { x: i32, y: i32 }
      fn main() -> i32 {
        let mut p = Pair { x: 1, y: 2 };
        let ref mut left = p.x;
        let ref mut left_again = p.x;
        return 0;
      }
    `.trim() + '\n');

    expect(okCodes.includes('BORROW_CONFLICT')).toBe(false);
    expect(conflictCodes).toContain('BORROW_CONFLICT');
  });

  test('treats whole-value and field borrows as conflicting prefixes', () => {
    const codes = codesFor(`
      struct Pair { x: i32, y: i32 }
      fn main() -> i32 {
        let mut p = Pair { x: 1, y: 2 };
        let ref mut whole = p;
        let ref field = p.x;
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('BORROW_CONFLICT');
  });

  test('releases branch-local temporary borrows before use after merge', () => {
    const codes = codesFor(`
      fn borrow(ref x: i32) -> i32 { return x; }
      fn main() -> i32 {
        let mut x: i32 = 1;
        if (true) {
          let held = borrow(x);
        } else {
          let other = 0;
        }
        let moved = move x;
        return moved;
      }
    `.trim() + '\n');

    expect(codes.includes('MOVE_WHILE_BORROWED')).toBe(false);
  });

  test('allows scoped mutable borrows in both branches without leaking after merge', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut x: i32 = 1;
        if (true) {
          let ref mut a = x;
          a = 2;
        } else {
          let ref mut b = x;
          b = 3;
        }
        let moved = move x;
        return moved;
      }
    `.trim() + '\n');

    expect(codes.includes('BORROW_CONFLICT')).toBe(false);
    expect(codes.includes('MOVE_WHILE_BORROWED')).toBe(false);
  });

  test('reports USE_AFTER_MOVE for moves that would repeat on the next loop iteration', () => {
    const codes = codesFor(`
      fn main() -> i32 {
        let mut i: i32 = 0;
        let mut x: i32 = 1;
        while (i < 2) {
          let moved = move x;
          i = i + 1;
        }
        return 0;
      }
    `.trim() + '\n');

    expect(codes).toContain('USE_AFTER_MOVE');
  });
});
