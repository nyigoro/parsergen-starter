import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

describe('macro system MVP', () => {
  it('parses macro_rules declarations and lowers vec! to ArrayLiteral', () => {
    const source = `
      macro_rules! vec {
        [$($x:expr),*] => {{
          let v = Vec.new();
          $(v.push($x);)*
          v
        }}
      }

      fn main() -> i32 {
        let v = vec![1, 2, 3];
        v.len()
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    expect(ast.body[0]?.type).toBe('MacroRulesDecl');
    if (ast.body[0]?.type === 'MacroRulesDecl') {
      expect(ast.body[0].name).toBe('vec');
      expect(ast.body[0].body).toContain('$($x:expr)');
    }

    const mainFn = ast.body.find((stmt) => stmt.type === 'FnDecl');
    expect(mainFn?.type).toBe('FnDecl');
    if (!mainFn || mainFn.type !== 'FnDecl') return;
    const letStmt = mainFn.body.body[0];
    expect(letStmt?.type).toBe('Let');
    if (!letStmt || letStmt.type !== 'Let') return;
    expect(letStmt.value.type).toBe('ArrayLiteral');
  });

  it('type checks derived Clone/Debug/Eq methods', () => {
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
    const semErrors = sem.diagnostics.filter((diag) => diag.severity === 'error');
    expect(semErrors).toHaveLength(0);

    const hm = inferProgram(ast);
    const hmErrors = hm.diagnostics.filter((diag) => diag.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('lowers derived methods to runtime helpers in JS codegen', () => {
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
    const js = generateJSFromAst(ast, { includeRuntime: false }).code;
    expect(js).toContain('__lumina_clone(p)');
    expect(js).toContain('__lumina_debug(q)');
    expect(js).toContain('__lumina_eq(q, p)');
  });

  it('reports unresolved non-builtin macro invocations', () => {
    const source = `
      fn main() -> i32 {
        let _v = foo![1, 2, 3];
        0
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.some((diag) => diag.code === 'UNRESOLVED_MACRO')).toBe(true);

    const hm = inferProgram(ast);
    expect(hm.diagnostics.some((diag) => diag.code === 'HM_MACRO')).toBe(true);

    const js = generateJSFromAst(ast, { includeRuntime: false }).code;
    expect(js).toContain("Unsupported macro invocation 'foo!'");
  });
});
