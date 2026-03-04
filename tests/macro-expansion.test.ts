import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compileGrammar } from '../src/grammar/index.js';
import { expandMacrosInProgram } from '../src/lumina/macro-expand.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { compileLuminaTask } from '../src/bin/lumina-core.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('macro expansion phase', () => {
  it('supports ![], !(), and !{} call-site delimiters', () => {
    const source = `
      macro_rules! id {
        ($x:expr) => ($x);
        [$x:expr] => ($x);
        {$x:expr} => ($x);
      }

      fn main() -> i32 {
        let a = id!(1);
        let b = id![2];
        let c = id!{3};
        a + b + c
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);

    const fn = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fn?.type).toBe('FnDecl');
    if (!fn || fn.type !== 'FnDecl') return;
    const lets = fn.body.body.filter((stmt) => stmt.type === 'Let');
    expect(lets).toHaveLength(3);
    for (const stmt of lets) {
      if (stmt.type !== 'Let') continue;
      expect(stmt.value.type).toBe('Number');
    }

    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);

    const hm = inferProgram(ast);
    expect(hm.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('uses deterministic first-match rule order', () => {
    const source = `
      macro_rules! pick {
        ($x:expr) => (1);
        ($x:expr) => (2);
      }

      fn main() -> i32 {
        pick!(7)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);

    const fn = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(fn?.type).toBe('FnDecl');
    if (!fn || fn.type !== 'FnDecl') return;
    const tail = fn.body.body[0];
    expect(tail?.type).toBe('ExprStmt');
    if (!tail || tail.type !== 'ExprStmt') return;
    expect(tail.expr.type).toBe('Number');
    if (tail.expr.type === 'Number') {
      expect(tail.expr.value).toBe(1);
    }
  });

  it('detects macro expansion cycles', () => {
    const source = `
      macro_rules! a {
        ($x:expr) => (b!($x));
      }
      macro_rules! b {
        ($x:expr) => (a!($x));
      }

      fn main() -> i32 {
        a!(1)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics.some((d) => d.code === 'MACRO_CYCLE')).toBe(true);
  });

  it('enforces configurable recursion depth limits', () => {
    const source = `
      macro_rules! a {
        ($x:expr) => (b!($x));
      }
      macro_rules! b {
        ($x:expr) => ($x);
      }

      fn main() -> i32 {
        a!(1)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast, { maxExpansionDepth: 1 });
    expect(expanded.diagnostics.some((d) => d.code === 'MACRO_RECURSION_LIMIT')).toBe(true);
  });

  it('supports depth-2 nested repetitions', () => {
    const source = `
      macro_rules! nested {
        ($($($x:expr),*),*) => ($x);
      }

      fn main() -> i32 {
        nested!(1, 2)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics).toHaveLength(0);
  });

  it('applies lexical scoping: invocation before declaration is unresolved', () => {
    const source = `
      fn main() -> i32 {
        late!(1)
      }

      macro_rules! late {
        ($x:expr) => ($x);
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const expanded = expandMacrosInProgram(ast);
    expect(expanded.diagnostics.some((d) => d.code === 'MACRO_UNKNOWN')).toBe(true);
  });

  it('resolves macro declarations across bundled module boundaries', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-macro-mod-'));
    const macrosPath = path.join(root, 'macros.lm');
    const mainPath = path.join(root, 'main.lm');
    const outPath = path.join(root, 'out.js');
    const grammar = path.resolve(__dirname, '../examples/lumina.peg');

    fs.writeFileSync(
      macrosPath,
      `
      macro_rules! one {
        ($x:expr) => ($x);
      }

      fn marker() -> i32 {
        0
      }
      `.trim() + '\n',
      'utf-8'
    );

    fs.writeFileSync(
      mainPath,
      `
      import { marker } from "./macros.lm";

      fn main() -> i32 {
        one!(41) + 1
      }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      const result = await compileLuminaTask({
        sourcePath: mainPath,
        outPath,
        target: 'esm',
        grammarPath: grammar,
        useRecovery: false,
        useAstJs: true,
      });
      expect(result.ok).toBe(true);
      const output = fs.readFileSync(outPath, 'utf-8');
      expect(output).toContain('(41 + 1)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
