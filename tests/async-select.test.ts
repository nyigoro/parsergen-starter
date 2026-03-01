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

describe('async select/join syntax', () => {
  it('parses select! expression', () => {
    const source = `
      async fn fetch(url: string) -> string {
        return url;
      }

      async fn race() -> string {
        return select! {
          result = fetch("api1.com") => result,
          _ = timeout(5.seconds()) => "timeout"
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const race = ast.body.find((stmt) => stmt.type === 'FnDecl' && stmt.name === 'race');
    expect(race?.type).toBe('FnDecl');
    if (!race || race.type !== 'FnDecl') return;
    const ret = race.body.body.find((stmt) => stmt.type === 'Return');
    expect(ret?.type).toBe('Return');
    if (!ret || ret.type !== 'Return') return;
    expect(ret.value.type).toBe('SelectExpr');
  });

  it('type-checks select! in async functions', () => {
    const source = `
      async fn fetch(url: string) -> string {
        return url;
      }

      async fn race() -> string {
        return select! {
          result = fetch("api1.com") => result,
          _ = timeout(5.seconds()) => "timeout"
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const semantic = analyzeLumina(ast);
    const semanticErrors = semantic.diagnostics.filter((d) => d.severity === 'error');
    expect(semanticErrors).toHaveLength(0);

    const hm = inferProgram(ast);
    const hmErrors = hm.diagnostics.filter((d) => d.severity === 'error');
    expect(hmErrors).toHaveLength(0);
  });

  it('lowers select! to Promise.race and supports duration helpers', () => {
    const source = `
      async fn fetch(url: string) -> string {
        return url;
      }

      async fn race() -> string {
        return select! {
          result = fetch("api1.com") => result,
          _ = timeout(5.seconds()) => "timeout"
        };
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: false }).code;
    expect(js).toContain('Promise.race');
    expect(js).toContain('* 1000');
  });
});
