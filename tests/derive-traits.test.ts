import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { compileLuminaTask } from '../src/bin/lumina-core.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('derive integration with trait system', () => {
  it('supports derive on enum and resolves trait methods', () => {
    const source = `
      #[derive(Debug, Clone, Eq)]
      enum Token {
        Eof,
        Number(i32),
        Wrapped(string)
      }

      fn main() -> bool {
        let t = Token.Number(1);
        let c = t.clone();
        let _d = c.debug();
        c.eq(t)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(sem.traitMethodResolutions.size).toBeGreaterThanOrEqual(3);
  });

  it('supports derive on unit structs', () => {
    const source = `
      #[derive(Debug, Clone, Eq)]
      struct Marker;

      fn main() -> bool {
        let m = Marker {};
        let c = m.clone();
        let _d = c.debug();
        c.eq(m)
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('supports derive on tuple structs', () => {
    const source = `
      #[derive(Clone, Eq)]
      struct Pair(i32, i32);

      fn main() -> bool {
        let p = Pair { _0: 1, _1: 2 };
        let q = p.clone();
        q.eq(p)
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const errors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('synthesizes generic bounds for struct derives', () => {
    const source = `
      #[derive(Clone)]
      struct Box<T> {
        value: T
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const cloneImpl = [...sem.traitRegistry.implsByKey.values()].find(
      (impl) => impl.traitName === 'Clone' && impl.forType.startsWith('Box<')
    );
    expect(cloneImpl).toBeDefined();
    const tParam = cloneImpl?.typeParams.find((param) => param.name === 'T');
    expect(tParam?.bound).toContain('Clone');
  });

  it('synthesizes generic bounds for enum derives', () => {
    const source = `
      #[derive(Eq)]
      enum Value<T> {
        Unit,
        One(T)
      }
    `.trim() + '\n';
    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const eqImpl = [...sem.traitRegistry.implsByKey.values()].find(
      (impl) => impl.traitName === 'Eq' && impl.forType.startsWith('Value<')
    );
    expect(eqImpl).toBeDefined();
    const tParam = eqImpl?.typeParams.find((param) => param.name === 'T');
    expect(tParam?.bound).toContain('Eq');
  });

  it('reports collision when manual impl already exists', () => {
    const source = `
      #[derive(Clone)]
      struct Point {
        x: i32
      }

      impl Clone for Point {
        fn clone(self: Self) -> Self {
          self
        }
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'DERIVE-004',
        severity: 'error',
      })
    );
  });

  it('reports unsupported derive names', () => {
    const source = `
      #[derive(Ord)]
      struct Point {
        x: i32
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'DERIVE-001',
        severity: 'error',
      })
    );
  });

  it('reports Eq derive failure for function-typed payload', () => {
    const source = `
      #[derive(Eq)]
      struct Bad {
        f: fn(i32) -> i32
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'DERIVE-003',
        severity: 'error',
      })
    );
  });

  it('removes special-case lowering and routes through trait method resolution in JS codegen', () => {
    const source = `
      #[derive(Debug, Clone, Eq)]
      struct Point {
        x: i32,
        y: i32
      }

      fn main() -> bool {
        let p = Point { x: 1, y: 2 };
        let q = p.clone();
        let _d = q.debug();
        q.eq(p)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    const js = generateJSFromAst(ast, {
      includeRuntime: false,
      traitMethodResolutions: sem.traitMethodResolutions,
    }).code;
    expect(js).toContain('function Clone$Point$clone');
    expect(js).toContain('function Debug$Point$debug');
    expect(js).toContain('function Eq$Point$eq');
    expect(js).not.toContain('__lumina_clone(p)');
    expect(js).not.toContain('__lumina_debug(q)');
    expect(js).not.toContain('__lumina_eq(q, p)');
    expect(js).toContain('Clone$Point$clone(p)');
    expect(js).toContain('Debug$Point$debug(q)');
    expect(js).toContain('Eq$Point$eq(q, p)');
  });

  it('keeps HM inference compatible for derived trait method calls', () => {
    const source = `
      #[derive(Clone)]
      struct Holder<T> {
        value: T
      }

      fn clone_holder(h: Holder<i32>) -> Holder<i32> {
        h.clone()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const hm = inferProgram(ast);
    const errors = hm.diagnostics.filter((diag) => diag.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('works across module boundaries with bundled compilation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-derive-mod-'));
    const typesPath = path.join(root, 'types.lm');
    const mainPath = path.join(root, 'main.lm');
    const outPath = path.join(root, 'out.js');

    fs.writeFileSync(
      typesPath,
      `
      #[derive(Clone)]
      struct Point {
        x: i32
      }

      fn make_point() -> Point {
        Point { x: 1 }
      }
      `.trim() + '\n',
      'utf-8'
    );

    fs.writeFileSync(
      mainPath,
      `
      import { make_point } from "./types.lm";

      fn main() -> i32 {
        let p = make_point();
        let q = p.clone();
        q.x
      }
      `.trim() + '\n',
      'utf-8'
    );

    try {
      const result = await compileLuminaTask({
        sourcePath: mainPath,
        outPath,
        target: 'esm',
        grammarPath,
        useRecovery: false,
        useAstJs: true,
      });
      expect(result.ok).toBe(true);
      const output = fs.readFileSync(outPath, 'utf-8');
      expect(output).toContain('Clone$Point$clone');
      expect(output).toContain('Clone$Point$clone(p)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
});
