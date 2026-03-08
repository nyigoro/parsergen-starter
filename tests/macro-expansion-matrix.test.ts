import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileGrammar } from '../src/grammar/index.js';
import { expandMacrosInProgram } from '../src/lumina/macro-expand.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { compileLuminaTask } from '../src/bin/lumina-core.js';
import type { LuminaProgram, LuminaFnDecl, LuminaStatement } from '../src/lumina/ast.js';
import type { Diagnostic } from '../src/parser/index.js';

jest.setTimeout(20_000);

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const expand = (
  source: string,
  options?: { maxExpansionDepth?: number }
): { ast: LuminaProgram; diagnostics: Diagnostic[] } => {
  const ast = parseProgram(source);
  const result = expandMacrosInProgram(ast, options);
  return { ast, diagnostics: result.diagnostics };
};

const getMainFn = (ast: LuminaProgram): LuminaFnDecl => {
  const fn = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'main');
  expect(fn?.type).toBe('FnDecl');
  return fn as LuminaFnDecl;
};

const getLastStmt = (mainFn: LuminaFnDecl): LuminaStatement => {
  expect(mainFn.body.body.length).toBeGreaterThan(0);
  return mainFn.body.body[mainFn.body.body.length - 1] as LuminaStatement;
};

const hasDiag = (diagnostics: Diagnostic[], code: string): boolean =>
  diagnostics.some((diag) => diag.code === code);

const createTempProject = async (
  files: Record<string, string>,
  validate: (result: { ok: boolean; output: string }) => void
): Promise<void> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-macro-matrix-'));
  const outPath = path.join(root, 'out.js');
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text.trim() + '\n', 'utf-8');
    }
    const result = await compileLuminaTask({
      sourcePath: path.join(root, 'main.lm'),
      outPath,
      target: 'esm',
      grammarPath,
      useRecovery: false,
      useAstJs: true,
    });
    const output = result.ok && fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf-8') : '';
    validate({ ok: result.ok, output });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

describe('macro expansion matrix: delimiters and matching', () => {
  const cases: Array<{ name: string; source: string; assert: (ast: LuminaProgram, diagnostics: Diagnostic[]) => void }> = [
    {
      name: 'A01 resolves () delimiter',
      source: `
        macro_rules! id {
          ($x:expr) => ($x);
        }
        fn main() -> i32 { id!(1) }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt') {
          expect(tail.expr.type).toBe('Number');
        }
      },
    },
    {
      name: 'A02 resolves [] delimiter',
      source: `
        macro_rules! id {
          [$x:expr] => ($x);
        }
        fn main() -> i32 { id![2] }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt') {
          expect(tail.expr.type).toBe('Number');
        }
      },
    },
    {
      name: 'A03 resolves {} delimiter',
      source: `
        macro_rules! id {
          {$x:expr} => ($x);
        }
        fn main() -> i32 { id!{3} }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt') {
          expect(tail.expr.type).toBe('Number');
        }
      },
    },
    {
      name: 'A04 reports no-match for () call on [] rule',
      source: `
        macro_rules! only {
          [$x:expr] => ($x);
        }
        fn main() -> i32 { only!(1) }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'A05 reports no-match for {} call on () rule',
      source: `
        macro_rules! only {
          ($x:expr) => ($x);
        }
        fn main() -> i32 { only!{1} }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'A06 reports no-match for [] call on {} rule',
      source: `
        macro_rules! only {
          {$x:expr} => ($x);
        }
        fn main() -> i32 { only![1] }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'A07 multi-rule picks () variant',
      source: `
        macro_rules! pick {
          ($x:expr) => (10);
          [$x:expr] => (20);
          {$x:expr} => (30);
        }
        fn main() -> i32 { pick!(0) }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(10);
        }
      },
    },
    {
      name: 'A08 multi-rule picks [] variant',
      source: `
        macro_rules! pick {
          ($x:expr) => (10);
          [$x:expr] => (20);
          {$x:expr} => (30);
        }
        fn main() -> i32 { pick![0] }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(20);
        }
      },
    },
    {
      name: 'A09 multi-rule picks {} variant',
      source: `
        macro_rules! pick {
          ($x:expr) => (10);
          [$x:expr] => (20);
          {$x:expr} => (30);
        }
        fn main() -> i32 { pick!{0} }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(30);
        }
      },
    },
    {
      name: 'A10 uses first match order for same delimiter',
      source: `
        macro_rules! pick {
          ($x:expr) => (1);
          ($x:expr) => (2);
        }
        fn main() -> i32 { pick!(7) }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(1);
        }
      },
    },
    {
      name: 'A11 expands star repetition with empty list',
      source: `
        macro_rules! list {
          [$($x:expr),*] => [$($x),*];
        }
        fn main() -> i32 {
          let a = list![];
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const first = main.body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let') {
          expect(first.value.type).toBe('ArrayLiteral');
          if (first.value.type === 'ArrayLiteral') {
            expect(first.value.elements).toHaveLength(0);
          }
        }
      },
    },
    {
      name: 'A12 expands star repetition with one item',
      source: `
        macro_rules! list {
          [$($x:expr),*] => [$($x),*];
        }
        fn main() -> i32 {
          let a = list![1];
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const first = main.body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let' && first.value.type === 'ArrayLiteral') {
          expect(first.value.elements).toHaveLength(1);
        }
      },
    },
    {
      name: 'A13 expands star repetition with many items',
      source: `
        macro_rules! list {
          [$($x:expr),*] => [$($x),*];
        }
        fn main() -> i32 {
          let a = list![1, 2, 3];
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const first = main.body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let' && first.value.type === 'ArrayLiteral') {
          expect(first.value.elements).toHaveLength(3);
        }
      },
    },
    {
      name: 'A14 expands tuple transcriber',
      source: `
        macro_rules! pair {
          ($x:expr, $y:expr) => ($x, $y);
        }
        fn main() -> i32 {
          let p = pair!(1, 2);
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const first = main.body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let') {
          expect(first.value.type).toBe('TupleLiteral');
          if (first.value.type === 'TupleLiteral') {
            expect(first.value.elements).toHaveLength(2);
          }
        }
      },
    },
    {
      name: 'A15 expands scalar boolean transcriber',
      source: `
        macro_rules! truthy {
          ($x:expr) => (true);
        }
        fn main() -> bool { truthy!(123) }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const tail = getLastStmt(getMainFn(ast));
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt') {
          expect(tail.expr.type).toBe('Boolean');
        }
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const { ast, diagnostics } = expand(testCase.source);
      testCase.assert(ast, diagnostics);
    });
  }
});

describe('macro expansion matrix: scoping and hygiene boundaries', () => {
  const cases: Array<{ name: string; source: string; assert: (ast: LuminaProgram, diagnostics: Diagnostic[]) => void }> = [
    {
      name: 'B01 top-level invocation before declaration is unresolved',
      source: `
        fn main() -> i32 { late!(1) }
        macro_rules! late {
          ($x:expr) => ($x);
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'B02 top-level invocation after declaration resolves',
      source: `
        macro_rules! late {
          ($x:expr) => ($x);
        }
        fn main() -> i32 { late!(1) }
      `,
      assert: (_ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
      },
    },
    {
      name: 'B03 outer macro is visible in inner block',
      source: `
        macro_rules! id {
          ($x:expr) => ($x);
        }
        fn main() -> i32 {
          {
            let value = id!(1);
          }
          0
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
      },
    },
    {
      name: 'B04 inner block declaration shadows outer macro',
      source: `
        macro_rules! id {
          ($x:expr) => (1);
        }
        fn main() -> i32 {
          {
            macro_rules! id {
              ($x:expr) => (2);
            }
            let local = id!(99);
          }
          id!(99)
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const innerBlock = main.body.body[0];
        expect(innerBlock?.type).toBe('Block');
        if (innerBlock?.type === 'Block') {
          const local = innerBlock.body[1];
          expect(local?.type).toBe('Let');
          if (local?.type === 'Let' && local.value.type === 'Number') {
            expect(local.value.value).toBe(2);
          }
        }
        const tail = getLastStmt(main);
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(1);
        }
      },
    },
    {
      name: 'B05 outer macro remains intact after inner scope exits',
      source: `
        macro_rules! id {
          ($x:expr) => (1);
        }
        fn main() -> i32 {
          let before = id!(0);
          {
            macro_rules! id {
              ($x:expr) => (2);
            }
            let inside = id!(0);
          }
          id!(0)
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const main = getMainFn(ast);
        const before = main.body.body[0];
        expect(before?.type).toBe('Let');
        if (before?.type === 'Let' && before.value.type === 'Number') {
          expect(before.value.value).toBe(1);
        }
        const tail = getLastStmt(main);
        expect(tail.type).toBe('ExprStmt');
        if (tail.type === 'ExprStmt' && tail.expr.type === 'Number') {
          expect(tail.expr.value).toBe(1);
        }
      },
    },
    {
      name: 'B06 block-local macro does not leak outward',
      source: `
        fn main() -> i32 {
          {
            macro_rules! local {
              ($x:expr) => ($x);
            }
            let ok = local!(1);
          }
          local!(2)
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'B07 sibling blocks do not share local macro definitions',
      source: `
        fn main() -> i32 {
          {
            macro_rules! local {
              ($x:expr) => ($x);
            }
            let a = local!(1);
          }
          {
            local!(2);
          }
          0
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'B08 lambda-local macro does not leak to outer scope',
      source: `
        fn main() -> i32 {
          let make = fn() -> i32 {
            macro_rules! local {
              ($x:expr) => ($x);
            }
            local!(1)
          };
          local!(2)
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'B09 if-block macro does not leak to outer scope',
      source: `
        fn main() -> i32 {
          if true {
            macro_rules! local {
              ($x:expr) => ($x);
            }
            let ok = local!(1);
          }
          local!(2)
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'B10 while-block macro does not leak to outer scope',
      source: `
        fn main() -> i32 {
          while false {
            macro_rules! local {
              ($x:expr) => ($x);
            }
            let ok = local!(1);
          }
          local!(2)
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const { ast, diagnostics } = expand(testCase.source);
      testCase.assert(ast, diagnostics);
    });
  }
});

describe('macro expansion matrix: diagnostics and spans', () => {
  const cases: Array<{ name: string; source: string; options?: { maxExpansionDepth?: number }; assert: (diagnostics: Diagnostic[]) => void }> = [
    {
      name: 'C01 reports MACRO_UNKNOWN for unresolved call',
      source: `
        fn main() -> i32 { missing!(1) }
      `,
      assert: (diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_UNKNOWN')).toBe(true);
      },
    },
    {
      name: 'C02 unresolved call points to invocation line',
      source: `
        fn main() -> i32 {
          missing!(1)
        }
      `,
      assert: (diagnostics) => {
        const diag = diagnostics.find((d) => d.code === 'MACRO_UNKNOWN');
        expect(diag).toBeDefined();
        expect(diag?.location.start.line).toBe(3);
      },
    },
    {
      name: 'C03 reports MACRO_NO_MATCH when no rule matches',
      source: `
        macro_rules! id {
          ($x:expr) => ($x);
        }
        fn main() -> i32 { id!(1, 2) }
      `,
      assert: (diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'C04 no-match diagnostic includes macro definition related info',
      source: `
        macro_rules! id {
          ($x:expr) => ($x);
        }
        fn main() -> i32 { id!(1, 2) }
      `,
      assert: (diagnostics) => {
        const diag = diagnostics.find((d) => d.code === 'MACRO_NO_MATCH');
        expect(diag?.relatedInformation?.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'C05 depth-2 nested repetitions expand successfully',
      source: `
        macro_rules! nested {
          ($($($x:expr),*),*) => ($x);
        }
        fn main() -> i32 { nested!(1, 2) }
      `,
      assert: (diagnostics) => {
        expect(diagnostics).toHaveLength(0);
      },
    },
    {
      name: 'C06 depth-2 nested repetitions remain deterministic',
      source: `
        macro_rules! nested {
          ($($($x:expr),*),*) => ($x);
        }
        fn main() -> i32 { nested!(1, 2) }
      `,
      assert: (diagnostics) => {
        expect(diagnostics).toHaveLength(0);
      },
    },
    {
      name: 'C07 malformed macro rule reports MACRO-001',
      source: `
        macro_rules! bad {
          ($x:expr) ($x);
        }
        fn main() -> i32 { bad!(1) }
      `,
      assert: (diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO-001')).toBe(true);
      },
    },
    {
      name: 'C08 expansion depth limit emits MACRO_RECURSION_LIMIT',
      source: `
        macro_rules! a {
          ($x:expr) => (a!($x));
        }
        fn main() -> i32 { a!(1) }
      `,
      options: { maxExpansionDepth: 1 },
      assert: (diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_RECURSION_LIMIT')).toBe(true);
      },
    },
    {
      name: 'C09 cycle detection emits MACRO_CYCLE',
      source: `
        macro_rules! a {
          ($x:expr) => (b!($x));
        }
        macro_rules! b {
          ($x:expr) => (a!($x));
        }
        fn main() -> i32 { a!(1) }
      `,
      assert: (diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_CYCLE')).toBe(true);
      },
    },
    {
      name: 'C10 semantic and HM receive expansion diagnostics without HM_MACRO fallback',
      source: `
        fn main() -> i32 { missing!(1) }
      `,
      assert: (_diagnostics) => {
        const ast = parseProgram(`
          fn main() -> i32 { missing!(1) }
        `);
        const sem = analyzeLumina(ast);
        const hm = inferProgram(ast);
        expect(sem.diagnostics.some((d) => d.code === 'MACRO_UNKNOWN')).toBe(true);
        expect(hm.diagnostics.some((d) => d.code === 'MACRO_UNKNOWN')).toBe(true);
        expect(hm.diagnostics.some((d) => d.code === 'HM_MACRO')).toBe(false);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const { diagnostics } = expand(testCase.source, testCase.options);
      testCase.assert(diagnostics);
    });
  }
});

describe('macro expansion matrix: module visibility and order', () => {
  it('D01 imported module macro is visible to entry module', async () => {
    await createTempProject(
      {
        'macros.lm': `
          macro_rules! one {
            ($x:expr) => ($x);
          }
          fn marker() -> i32 { 0 }
        `,
        'main.lm': `
          import { marker } from "./macros.lm";
          fn main() -> i32 { one!(41) + 1 }
        `,
      },
      ({ ok, output }) => {
        expect(ok).toBe(true);
        expect(output).toContain('(41 + 1)');
      }
    );
  });

  it('D02 macro from non-imported file is not visible', async () => {
    await createTempProject(
      {
        'macros.lm': `
          macro_rules! one {
            ($x:expr) => ($x);
          }
          fn marker() -> i32 { 0 }
        `,
        'main.lm': `
          fn main() -> i32 { one!(41) + 1 }
        `,
      },
      ({ ok }) => {
        expect(ok).toBe(false);
      }
    );
  });

  it('D03 alias import still makes module macros visible', async () => {
    await createTempProject(
      {
        'macros.lm': `
          macro_rules! one {
            ($x:expr) => ($x);
          }
          fn marker() -> i32 { 0 }
        `,
        'main.lm': `
          import { marker as m } from "./macros.lm";
          fn main() -> i32 { one!(7) }
        `,
      },
      ({ ok, output }) => {
        expect(ok).toBe(true);
        expect(output).toMatch(/\n\s*7;\s*\n/);
      }
    );
  });

  it('D04 transitive import currently exposes dependency macros', async () => {
    await createTempProject(
      {
        'b.lm': `
          macro_rules! two {
            ($x:expr) => ($x);
          }
          fn b_marker() -> i32 { 0 }
        `,
        'a.lm': `
          import { b_marker } from "./b.lm";
          fn a_marker() -> i32 { b_marker() }
        `,
        'main.lm': `
          import { a_marker } from "./a.lm";
          fn main() -> i32 { two!(5) }
        `,
      },
      ({ ok, output }) => {
        expect(ok).toBe(true);
        expect(output).toMatch(/\n\s*5;\s*\n/);
      }
    );
  });

  it('D05 module merge order is deterministic for same macro name', async () => {
    await createTempProject(
      {
        'a.lm': `
          macro_rules! pick {
            ($x:expr) => (1);
          }
          fn a_marker() -> i32 { 0 }
        `,
        'b.lm': `
          macro_rules! pick {
            ($x:expr) => (2);
          }
          fn b_marker() -> i32 { 0 }
        `,
        'main.lm': `
          import { a_marker } from "./a.lm";
          import { b_marker } from "./b.lm";
          fn main() -> i32 { pick!(0) }
        `,
      },
      ({ ok, output }) => {
        expect(ok).toBe(true);
        expect(output).toMatch(/\n\s*2;\s*\n/);
      }
    );
  });
});

describe('macro expansion matrix: repetition and edge tokens', () => {
  const cases: Array<{ name: string; source: string; assert: (ast: LuminaProgram, diagnostics: Diagnostic[]) => void }> = [
    {
      name: 'E01 plus repetition requires at least one argument',
      source: `
        macro_rules! plusy {
          [$($x:expr),+] => [$($x),+];
        }
        fn main() -> i32 {
          let a = plusy![];
          0
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'E02 plus repetition accepts one argument',
      source: `
        macro_rules! plusy {
          [$($x:expr),+] => [$($x),+];
        }
        fn main() -> i32 {
          let a = plusy![1];
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const first = getMainFn(ast).body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let' && first.value.type === 'ArrayLiteral') {
          expect(first.value.elements).toHaveLength(1);
        }
      },
    },
    {
      name: 'E03 optional repetition accepts zero arguments',
      source: `
        macro_rules! maybe {
          [$($x:expr)?] => [$($x)?];
        }
        fn main() -> i32 {
          let a = maybe![];
          0
        }
      `,
      assert: (ast, diagnostics) => {
        expect(diagnostics).toHaveLength(0);
        const first = getMainFn(ast).body.body[0];
        expect(first?.type).toBe('Let');
        if (first?.type === 'Let' && first.value.type === 'ArrayLiteral') {
          expect(first.value.elements).toHaveLength(0);
        }
      },
    },
    {
      name: 'E04 optional repetition rejects more than one argument',
      source: `
        macro_rules! maybe {
          [$($x:expr)?] => [$($x)?];
        }
        fn main() -> i32 {
          let a = maybe![1, 2];
          0
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO_NO_MATCH')).toBe(true);
      },
    },
    {
      name: 'E05 literal-only matcher position emits MACRO-004',
      source: `
        macro_rules! literaly {
          [foo] => [1];
        }
        fn main() -> i32 {
          let a = literaly![];
          0
        }
      `,
      assert: (_ast, diagnostics) => {
        expect(hasDiag(diagnostics, 'MACRO-004')).toBe(true);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const { ast, diagnostics } = expand(testCase.source);
      testCase.assert(ast, diagnostics);
    });
  }
});
