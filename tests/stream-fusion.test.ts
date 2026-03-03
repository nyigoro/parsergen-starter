import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import { inlinePass } from '../src/lumina/inline.js';
import { fuseVecPipelines } from '../src/lumina/stream-fusion.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { vec } from '../src/lumina-runtime.js';
import type { LuminaExpr, LuminaFnDecl, LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const grammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(grammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const runPipelinePasses = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never, { useRowPolymorphism: true });
  const mono = monomorphize(JSON.parse(JSON.stringify(ast)) as never, { inferredCalls: hm.inferredCalls }) as LuminaProgram;
  const inlined = inlinePass(mono).ast;
  return fuseVecPipelines(inlined);
};

const getMainReturnExpr = (program: LuminaProgram): LuminaExpr | null => {
  const main = program.body.find((stmt): stmt is LuminaFnDecl => stmt.type === 'FnDecl' && stmt.name === 'main');
  if (!main) return null;
  for (const stmt of main.body.body) {
    if (stmt.type === 'Return') return stmt.value;
  }
  return null;
};

describe('stream fusion', () => {
  it('fuses vec.filter -> vec.map -> vec.fold chain', () => {
    const source = `
      import { vec } from "@std";

      fn main(v: Vec<i32>) -> i32 {
        return vec.fold(
          vec.map(
            vec.filter(v, |x| x > 0),
            |x| x * 2
          ),
          0,
          |acc, x| acc + x
        );
      }
    `;

    const fused = runPipelinePasses(source);
    const ret = getMainReturnExpr(fused);
    expect(ret?.type).toBe('Call');
    if (!ret || ret.type !== 'Call') return;
    expect(ret.enumName).toBe('vec');
    expect(ret.callee.name).toBe('fused_filter_map_fold');
    expect(ret.args).toHaveLength(5);
  });

  it('fuses method-syntax pipeline', () => {
    const source = `
      fn main(v: Vec<i32>) -> i32 {
        return v
          .filter(|x| x > 0)
          .map(|x| x * 2)
          .fold(0, |acc, x| acc + x);
      }
    `;

    const fused = runPipelinePasses(source);
    const ret = getMainReturnExpr(fused);
    expect(ret?.type).toBe('Call');
    if (!ret || ret.type !== 'Call') return;
    expect(ret.enumName).toBe('vec');
    expect(['fused_filter_map_fold', 'fused_map_fold', 'fused_filter_fold']).toContain(ret.callee.name);
  });

  it('keeps non-terminal pipelines unchanged', () => {
    const source = `
      import { vec } from "@std";
      fn main(v: Vec<i32>) -> Vec<i32> {
        return vec.map(vec.filter(v, |x| x > 0), |x| x * 2);
      }
    `;
    const fused = runPipelinePasses(source);
    const ret = getMainReturnExpr(fused);
    expect(ret?.type).toBe('Call');
    if (!ret || ret.type !== 'Call') return;
    expect(ret.callee.name).toBe('map');
  });

  it('emits fused call in generated JS', () => {
    const source = `
      import { vec } from "@std";
      fn main(v: Vec<i32>) -> i32 {
        return vec.fold(vec.map(vec.filter(v, |x| x > 0), |x| x * 2), 0, |acc, x| acc + x);
      }
    `;
    const fused = runPipelinePasses(source);
    const js = generateJSFromAst(fused as never, { target: 'cjs', includeRuntime: false }).code;
    expect(js).toContain('vec.fused_filter_map_fold(');
    expect(js).not.toContain('vec.filter(');
    expect(js).not.toContain('vec.map(');
  });

  it('runtime fused helper matches unfused behavior', () => {
    const values = vec.new();
    vec.push(values, -2);
    vec.push(values, 0);
    vec.push(values, 1);
    vec.push(values, 3);

    const baseline = vec.fold(
      vec.map(vec.filter(values, (x) => x > 0), (x) => x * 2),
      0,
      (acc, x) => acc + x
    );
    const fusedResult = vec.fused_filter_map_fold(
      values,
      (x) => x > 0,
      (x) => x * 2,
      0,
      (acc, x) => acc + x
    );

    expect(fusedResult).toBe(baseline);
  });

  it('fuses deeper pipelines to vec.fused_pipeline', () => {
    const source = `
      fn main(v: Vec<i32>) -> i32 {
        return v
          .map(|x| x + 1)
          .filter(|x| x > 0)
          .map(|x| x * 2)
          .fold(0, |acc, x| acc + x);
      }
    `;

    const fused = runPipelinePasses(source);
    const ret = getMainReturnExpr(fused);
    expect(ret?.type).toBe('Call');
    if (!ret || ret.type !== 'Call') return;
    expect(ret.enumName).toBe('vec');
    expect(ret.callee.name).toBe('fused_pipeline');
    expect(ret.args).toHaveLength(4);

    const stageArray = ret.args[1];
    expect(stageArray?.type).toBe('ArrayLiteral');
    if (!stageArray || stageArray.type !== 'ArrayLiteral') return;
    expect(stageArray.elements).toHaveLength(3);
  });

  it('runtime fused_pipeline matches unfused behavior', () => {
    const values = vec.from([-4, -1, 0, 2, 5]);

    const baseline = vec.fold(
      vec.map(
        vec.filter(
          vec.map(values, (x) => x + 1),
          (x) => x > 0
        ),
        (x) => x * 2
      ),
      0,
      (acc, x) => acc + x
    );

    const fusedResult = vec.fused_pipeline(
      values,
      [
        { kind: 'map', f: (x) => (x as number) + 1 },
        { kind: 'filter', f: (x) => (x as number) > 0 },
        { kind: 'map', f: (x) => (x as number) * 2 },
      ],
      0,
      (acc, x) => acc + (x as number)
    );

    expect(fusedResult).toBe(baseline);
  });

  it('emits vec.fused_pipeline in generated JS for deep chains', () => {
    const source = `
      fn main(v: Vec<i32>) -> i32 {
        return v
          .map(|x| x + 1)
          .filter(|x| x > 0)
          .map(|x| x * 2)
          .fold(0, |acc, x| acc + x);
      }
    `;

    const fused = runPipelinePasses(source);
    const js = generateJSFromAst(fused as never, { target: 'cjs', includeRuntime: false }).code;
    expect(js).toContain('vec.fused_pipeline(');
  });
});
