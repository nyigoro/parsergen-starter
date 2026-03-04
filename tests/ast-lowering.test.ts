import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { lowerLumina } from '../src/lumina/lower.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import type { IRFunction, IRLet, IRMatchExpr, IRNoop, IRReturn } from '../src/lumina/ir.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

describe('AST lowering', () => {
  it('lowers function declarations and let bindings into IR nodes', () => {
    const ast = parseProgram(`
      fn main() -> i32 {
        let value = 41;
        return value + 1;
      }
    `);
    const ir = lowerLumina(ast);
    expect(ir.kind).toBe('Program');
    const fn = ir.body[0] as IRFunction;
    expect(fn.kind).toBe('Function');
    expect(fn.name).toBe('main');
    expect((fn.body[0] as IRLet).kind).toBe('Let');
    expect((fn.body[1] as IRReturn).kind).toBe('Return');
  });

  it('lowers pipe operator to a call expression with left value as first argument', () => {
    const ast = parseProgram(`
      fn inc(v: i32) -> i32 { return v + 1; }
      fn main() -> i32 {
        return 5 |> inc();
      }
    `);
    const ir = lowerLumina(ast);
    const fn = ir.body.find((node) => node.kind === 'Function' && (node as IRFunction).name === 'main') as IRFunction;
    const ret = fn.body.find((node) => node.kind === 'Return') as IRReturn;
    expect(ret.value.kind).toBe('Call');
    expect((ret.value as { callee: string }).callee).toBe('inc');
    expect((ret.value as { args: unknown[] }).args).toHaveLength(1);
  });

  it('lowers enum match expressions and keeps binding/ref pattern bindings', () => {
    const ast = parseProgram(`
      enum Option {
        Some(i32),
        None
      }

      fn main() -> i32 {
        let value = Option.Some(7);
        return match value {
          Some(ref v) => v,
          None => 0
        };
      }
    `);
    const ir = lowerLumina(ast);
    const fn = ir.body.find((node) => node.kind === 'Function' && (node as IRFunction).name === 'main') as IRFunction;
    const ret = fn.body.find((node) => node.kind === 'Return') as IRReturn;
    const matchExpr = ret.value as IRMatchExpr;
    expect(matchExpr.kind).toBe('MatchExpr');
    expect(matchExpr.arms[0].variant).toBe('Some');
    expect(matchExpr.arms[0].bindings).toEqual(['v']);
    expect(matchExpr.arms[1].variant).toBe('None');
  });

  it('lowers try operator and strips type declarations as compile-time no-op', () => {
    const ast = parseProgram(`
      enum Result<T, E> { Ok(T), Err(E) }
      type Local = i32;

      fn parse() -> Result<i32, string> { return Result.Ok(2); }

      fn main() -> Result<i32, string> {
        let out = parse()?;
        return Result.Ok(out + 1);
      }
    `);
    const ir = lowerLumina(ast);
    const noop = ir.body.find((node) => node.kind === 'Noop') as IRNoop | undefined;
    expect(noop?.kind).toBe('Noop');

    const fn = ir.body.find((node) => node.kind === 'Function' && (node as IRFunction).name === 'main') as IRFunction;
    const letNode = fn.body.find((node) => node.kind === 'Let') as IRLet;
    expect(letNode.value.kind).toBe('Call');
    expect((letNode.value as { callee: string }).callee).toBe('__lumina_try');
  });
});
