import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import type { LuminaFnDecl, LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../src/grammar/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

const errorCodes = (source: string, target: Parameters<typeof analyzeLumina>[1]['target']) =>
  analyzeLumina(parseProgram(source), { target }).diagnostics
    .filter((diag) => diag.severity === 'error')
    .map((diag) => String(diag.code));

describe('capability targets', () => {
  test('parser attaches capability attributes to declarations', () => {
    const ast = parseProgram(`
      #[capability(web, web.dom)]
      pub fn mount() {
        1;
      }
    `);

    const fnDecl = ast.body[0] as LuminaFnDecl;
    expect(fnDecl.type).toBe('FnDecl');
    expect(fnDecl.attributes).toEqual([
      expect.objectContaining({
        name: 'capability',
        args: ['web', 'web.dom'],
      }),
    ]);
  });

  test('reports CAP-ATTR-001 for unknown capability attributes', () => {
    const ast = parseProgram(`
      #[capability(space)]
      fn main() {
        1;
      }
    `);

    const diagnostics = analyzeLumina(ast, { target: 'js' }).diagnostics;
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CAP-ATTR-001',
        severity: 'error',
      })
    );
  });

  test('reports CAP-001 when standalone code uses web DOM capability', () => {
    const codes = errorCodes(
      `
        import * as dom from "@std/dom";

        fn main() {
          dom.create_element("div");
        }
      `,
      'wasm-standalone'
    );

    expect(codes).toContain('CAP-001');
  });

  test('reports CAP-002 when wasm-web code uses unsupported host capability', () => {
    const codes = errorCodes(
      `
        import * as webgpu from "@std/webgpu";

        fn main() {
          webgpu.is_available();
        }
      `,
      'wasm-web'
    );

    expect(codes).toContain('CAP-002');
  });

  test('reports CAP-003 for public functions leaking undeclared capabilities', () => {
    const diagnostics = analyzeLumina(
      parseProgram(`
        import * as dom from "@std/dom";

        #[capability(web, web.dom)]
        fn use_dom() {
          dom.create_element("div");
        }

        pub fn leak() {
          use_dom();
        }
      `),
      { target: 'js' }
    ).diagnostics;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CAP-003',
        severity: 'error',
      })
    );
  });

  test('allows js target to use web capabilities without CAP diagnostics', () => {
    const diagnostics = analyzeLumina(
      parseProgram(`
        import * as dom from "@std/dom";

        fn main() {
          dom.create_element("div");
        }
      `),
      { target: 'js' }
    ).diagnostics;

    expect(diagnostics.filter((diag) => String(diag.code).startsWith('CAP-'))).toHaveLength(0);
  });
});
