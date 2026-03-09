import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { analyzeLumina } from '../src/lumina/semantic.js';
import { inferProgram } from '../src/lumina/hm-infer.js';
import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { HashMap, Option, Vec, hashmap, iter, vec } from '../src/lumina-runtime.js';
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

describe('@std/iter runtime helpers', () => {
  test('filter_vec keeps matching elements and handles empty input', () => {
    const values = vec.from([1, 2, 3, 4]);
    expect(toArray(iter.filter_vec(values, (value) => value % 2 === 0))).toEqual([2, 4]);
    expect(toArray(iter.filter_vec(vec.new<number>(), () => true))).toEqual([]);
  });

  test('zip_vec truncates to the shorter vector and enumerate_vec adds indices', () => {
    const zipped = iter.zip_vec(vec.from([1, 2, 3]), vec.from(['a', 'b']));
    expect(toArray(zipped)).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(toArray(iter.enumerate_vec(vec.from(['x', 'y'])))).toEqual([
      [0, 'x'],
      [1, 'y'],
    ]);
  });

  test('flatten_vec flattens one level and flat_map_vec maps then flattens', () => {
    const nested = vec.from([vec.from([1, 2]), vec.from([3]), vec.from<number>([])]);
    expect(toArray(iter.flatten_vec(nested))).toEqual([1, 2, 3]);
    expect(
      toArray(
        iter.flat_map_vec(vec.from([1, 3]), (value) => vec.from([value, value + 1]))
      )
    ).toEqual([1, 2, 3, 4]);
  });

  test('chunk_vec and window_vec produce the expected slices', () => {
    expect(toArray(iter.chunk_vec(vec.from([1, 2, 3, 4, 5]), 2)).map(toArray)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(toArray(iter.window_vec(vec.from([1, 2, 3, 4]), 3)).map(toArray)).toEqual([
      [1, 2, 3],
      [2, 3, 4],
    ]);
    expect(toArray(iter.window_vec(vec.from([1, 2]), 3))).toEqual([]);
  });

  test('partition_vec, take_vec, and skip_vec split and slice correctly', () => {
    const [pass, fail] = iter.partition_vec(vec.from([1, 2, 3, 4]), (value) => value % 2 === 0);
    expect(toArray(pass)).toEqual([2, 4]);
    expect(toArray(fail)).toEqual([1, 3]);
    expect(toArray(iter.take_vec(vec.from([1, 2, 3]), 2))).toEqual([1, 2]);
    expect(toArray(iter.skip_vec(vec.from([1, 2, 3]), 2))).toEqual([3]);
  });

  test('any_vec and all_vec short-circuit correctly', () => {
    let anyChecks = 0;
    const anyResult = iter.any_vec(vec.from([1, 2, 3, 4]), (value) => {
      anyChecks += 1;
      return value === 2;
    });
    expect(anyResult).toBe(true);
    expect(anyChecks).toBe(2);

    let allChecks = 0;
    const allResult = iter.all_vec(vec.from([2, 4, 5, 6]), (value) => {
      allChecks += 1;
      return value % 2 === 0;
    });
    expect(allResult).toBe(false);
    expect(allChecks).toBe(3);
  });

  test('find_vec, count_vec, and sum helpers return the expected results', () => {
    expect(unwrapOption<number>(iter.find_vec(vec.from([1, 3, 6]), (value) => value % 2 === 0))).toBe(6);
    expect(iter.find_vec(vec.from([1, 3, 5]), (value) => value % 2 === 0)).toBe(Option.None);
    expect(iter.count_vec(vec.from(['a', 'b', 'c']))).toBe(3);
    expect(iter.sum_vec(vec.from([1, 2, 3, 4]))).toBe(10);
    expect(iter.sum_vec_f64(vec.from([1.5, 2.25, 0.25]))).toBeCloseTo(4);
  });

  test('unique_vec preserves order and reverse_vec does not mutate the original vector', () => {
    const values = vec.from([1, 2, 1, 3, 2]);
    const unique = iter.unique_vec(values);
    const reversed = iter.reverse_vec(values);
    expect(toArray(unique)).toEqual([1, 2, 3]);
    expect(toArray(reversed)).toEqual([2, 3, 1, 2, 1]);
    expect(toArray(values)).toEqual([1, 2, 1, 3, 2]);
  });

  test('sort_vec is stable and sort_by_vec / sort_by_desc_vec use key order', () => {
    const items = vec.from([
      { group: 1, id: 'a' },
      { group: 2, id: 'b' },
      { group: 1, id: 'c' },
    ]);
    const stable = iter.sort_vec(items, (left, right) => left.group - right.group);
    expect(toArray(stable).map((item) => item.id)).toEqual(['a', 'c', 'b']);

    const values = vec.from([
      { name: 'zeta', score: 7 },
      { name: 'alpha', score: 9 },
      { name: 'beta', score: 8 },
    ]);
    expect(toArray(iter.sort_by_vec(values, (value) => value.name)).map((item) => item.name)).toEqual([
      'alpha',
      'beta',
      'zeta',
    ]);
    expect(toArray(iter.sort_by_desc_vec(values, (value) => value.score)).map((item) => item.score)).toEqual([
      9,
      8,
      7,
    ]);
  });

  test('group_by_vec groups values and intersperse_vec inserts separators', () => {
    const grouped: HashMap<string, Vec<number>> = iter.group_by_vec(vec.from([1, 2, 3, 4]), (value) =>
      value % 2 === 0 ? 'even' : 'odd'
    );
    expect(toArray(unwrapOption<Vec<number>>(hashmap.get(grouped, 'odd')) ?? vec.new<number>())).toEqual([1, 3]);
    expect(toArray(unwrapOption<Vec<number>>(hashmap.get(grouped, 'even')) ?? vec.new<number>())).toEqual([2, 4]);
    expect(toArray(iter.intersperse_vec(vec.from(['a', 'b', 'c']), '-'))).toEqual(['a', '-', 'b', '-', 'c']);
  });
});

describe('@std/iter language integration', () => {
  test('typechecks direct @std/iter imports and emits direct helper calls', () => {
    const source = `
      import { filter_vec, enumerate_vec, group_by_vec, count_vec } from "@std/iter";
      import { vec, hashmap } from "@std";

      fn main() -> int {
        let values = vec.new();
        vec.push(values, 1);
        vec.push(values, 2);
        vec.push(values, 3);
        let filtered = filter_vec(values, |x| x > 1);
        let indexed = enumerate_vec(filtered);
        let grouped = group_by_vec(filtered, |x| x % 2);
        let _ = indexed;
        let _ = hashmap.keys(grouped);
        count_vec(filtered)
      }
    `.trim() + '\n';

    const ast = parseProgram(source);
    const sem = analyzeLumina(ast);
    expect(sem.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const hm = inferProgram(ast);
    expect(hm.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(0);

    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toContain('filter_vec(');
    expect(js).toContain('enumerate_vec(');
    expect(js).toContain('group_by_vec(');
    expect(js).toContain('count_vec(');
  });
});
