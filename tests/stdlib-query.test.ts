import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { generateJS } from '../src/lumina/codegen.js';
import { lowerLumina } from '../src/lumina/lower.js';
import { optimizeIR } from '../src/lumina/optimize.js';
import { HashMap, Option, Vec, hashmap, query, where_q, select_q, order_by_q, order_by_desc_q, limit_q, offset_q, group_by_q, count_q, first_q, to_vec_q, join_q, vec } from '../src/lumina-runtime.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;
const toArray = <T>(values: Vec<T>): T[] => Array.from(values);
const unwrapOption = <T>(value: unknown): T | undefined => {
  const tagged = value as { $tag?: string; $payload?: unknown };
  return tagged.$tag === 'Some' ? (tagged.$payload as T) : undefined;
};

describe('@std/query runtime helpers', () => {
  test('query wraps a vector and to_vec_q unwraps it', () => {
    const values = vec.from([1, 2, 3]);
    const wrapped = query(values);
    expect(wrapped.items).toBe(values);
    expect(toArray(to_vec_q(wrapped))).toEqual([1, 2, 3]);
  });

  test('where_q, select_q, and order_by_q compose correctly', () => {
    const users = vec.from([
      { id: 1, name: 'sam', age: 17 },
      { id: 2, name: 'lee', age: 22 },
      { id: 3, name: 'ava', age: 19 },
    ]);
    const result = to_vec_q(
      order_by_q(
        select_q(where_q(query(users), (user) => user.age >= 18), (user) => ({ id: user.id, name: user.name })),
        (user) => user.name
      )
    );
    expect(toArray(result)).toEqual([
      { id: 3, name: 'ava' },
      { id: 2, name: 'lee' },
    ]);
  });

  test('order_by_desc_q, limit_q, and offset_q shape result sets correctly', () => {
    const values = query(
      vec.from([
        { label: 'a', score: 1 },
        { label: 'b', score: 4 },
        { label: 'c', score: 2 },
        { label: 'd', score: 3 },
      ])
    );
    const result = to_vec_q(offset_q(limit_q(order_by_desc_q(values, (value) => value.score), 3), 1));
    expect(toArray(result).map((item) => item.label)).toEqual(['d', 'c']);
  });

  test('group_by_q, count_q, and first_q return expected values', () => {
    const grouped: HashMap<string, Vec<number>> = group_by_q(query(vec.from([1, 2, 3, 4])), (value) =>
      value % 2 === 0 ? 'even' : 'odd'
    );
    expect(count_q(query(vec.from(['x', 'y', 'z'])))).toBe(3);
    expect(unwrapOption<number>(first_q(query(vec.from([9, 8, 7]))))).toBe(9);
    expect(first_q(query(vec.new<number>()))).toBe(Option.None);
    expect(toArray(unwrapOption<Vec<number>>(hashmap.get(grouped, 'odd')) ?? vec.new<number>())).toEqual([1, 3]);
    expect(toArray(unwrapOption<Vec<number>>(hashmap.get(grouped, 'even')) ?? vec.new<number>())).toEqual([2, 4]);
  });

  test('join_q matches rows on key and returns tuples', () => {
    const left = query(vec.from([{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace' }]));
    const right = query(vec.from([{ userId: 2, role: 'admin' }, { userId: 1, role: 'editor' }, { userId: 3, role: 'guest' }]));
    const joined = to_vec_q(join_q(left, right, (user) => user.id, (role) => role.userId));
    expect(toArray(joined)).toEqual([
      [{ id: 1, name: 'Ada' }, { userId: 1, role: 'editor' }],
      [{ id: 2, name: 'Grace' }, { userId: 2, role: 'admin' }],
    ]);
  });

  test('empty queries stay empty through chained operations', () => {
    const result = to_vec_q(limit_q(select_q(where_q(query(vec.new<number>()), () => true), (value) => value + 1), 5));
    expect(toArray(result)).toEqual([]);
  });
});

describe('@std/query language integration', () => {
  test('typechecks direct @std/query imports and emits query helper calls', () => {
    const source = `
      import { query, where_q, select_q, order_by_q, to_vec_q } from "@std/query";
      import { vec } from "@std";

      fn main() -> int {
        let values = vec.new();
        vec.push(values, 3);
        vec.push(values, 1);
        vec.push(values, 2);
        let filtered = where_q(query(values), |x| x >= 2);
        let selected = select_q(filtered, |x| x + 10);
        let ordered = order_by_q(selected, |x| x);
        let out = to_vec_q(ordered);
        vec.len(out)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const hm = inferProgram(ast);
    expect(hm.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('query(');
    expect(js).toContain('where_q(');
    expect(js).toContain('select_q(');
    expect(js).toContain('order_by_q(');
    expect(js).toContain('to_vec_q(');
  });

  test('pipe chains lower through query helpers for non-lambda stages', () => {
    const source = `
      import { vec } from "@std";

      fn main() -> int {
        let values = vec.new();
        vec.push(values, 1);
        vec.push(values, 2);
        vec.push(values, 3);
        vec.push(values, 4);
        return query(values) |> limit_q(3) |> offset_q(1) |> count_q();
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const ir = optimizeIR(lowerLumina(ast as never));
    expect(ir).not.toBeNull();

    const js = generateJS(ir!, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('count_q(offset_q(limit_q(query(values), 3), 1))');
    expect(js).not.toContain('|>');
  });
});
