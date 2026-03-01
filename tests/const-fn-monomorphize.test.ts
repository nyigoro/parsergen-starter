import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { monomorphize } from '../src/lumina/monomorphize.js';
import type { LuminaProgram, LuminaStatement } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

const monomorphizeSource = (source: string): LuminaProgram => {
  const ast = parseProgram(source);
  const hm = inferProgram(ast as never);
  const cloned = JSON.parse(JSON.stringify(ast)) as LuminaProgram;
  return monomorphize(cloned as never, { inferredCalls: hm.inferredCalls });
};

const collectFnNames = (program: LuminaProgram): string[] =>
  program.body.filter((stmt): stmt is LuminaStatement & { type: 'FnDecl' } => stmt.type === 'FnDecl').map((fn) => fn.name);

type CallInfo = { callee: string; enumName?: string | null };

const collectCalls = (node: unknown, acc: CallInfo[] = []): CallInfo[] => {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => collectCalls(child, acc));
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Call') {
    const callee = (obj.callee as { name?: string } | undefined)?.name ?? '';
    const enumName = obj.enumName as string | null | undefined;
    acc.push({ callee, enumName });
  }
  for (const value of Object.values(obj)) {
    collectCalls(value, acc);
  }
  return acc;
};

describe('Const Generic Function Monomorphization', () => {
  it('specializes const-generic functions from explicit type arguments', () => {
    const source = `
      fn zeros<T, const N: usize>(x: T) -> [T; N] {
        [x; N]
      }

      fn main() -> i32 {
        let a = zeros<i32, 3>(1);
        let b = zeros<i32, 5>(2);
        match a[0] {
          Some(v) => v,
          None => 0
        } + match b[0] {
          Some(v) => v,
          None => 0
        }
      }
    `.trim() + '\n';

    const mono = monomorphizeSource(source);
    const names = collectFnNames(mono);
    expect(names.some((name) => name.startsWith('zeros_i32_3'))).toBe(true);
    expect(names.some((name) => name.startsWith('zeros_i32_5'))).toBe(true);
  });

  it('rewrites explicit const-generic call sites', () => {
    const source = `
      fn zeros<T, const N: usize>(x: T) -> [T; N] {
        [x; N]
      }

      fn main() -> i32 {
        let a = zeros<i32, 3>(1);
        match a[0] {
          Some(v) => v,
          None => 0
        }
      }
    `.trim() + '\n';

    const mono = monomorphizeSource(source);
    const calls = collectCalls(mono).filter((call) => !call.enumName).map((call) => call.callee);
    expect(calls.some((name) => name.startsWith('zeros_i32_3'))).toBe(true);
    expect(calls).not.toContain('zeros');
  });
});

