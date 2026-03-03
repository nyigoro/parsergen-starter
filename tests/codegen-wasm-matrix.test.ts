import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import type { Diagnostic } from '../src/lumina/diagnostics.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;

type CaseSpec = {
  name: string;
  source: string;
  snippets: string[];
  allowErrorCodes?: string[];
  requiredErrorCodes?: string[];
};

const compileCase = (spec: CaseSpec): { wat: string; diagnostics: Diagnostic[] } => {
  const ast = parseProgram(spec.source.trim() + '\n');
  const result = generateWATFromAst(ast, { exportMain: true });
  const allowed = new Set(spec.allowErrorCodes ?? []);
  const hardErrors = result.diagnostics.filter((d) => d.severity === 'error' && !allowed.has(d.code));
  expect(hardErrors).toHaveLength(0);
  for (const required of spec.requiredErrorCodes ?? []) {
    expect(result.diagnostics.some((d) => d.code === required)).toBe(true);
  }
  for (const snippet of spec.snippets) {
    expect(result.wat).toContain(snippet);
  }
  return result;
};

const numericCases: CaseSpec[] = [
  { name: 'add literals', source: 'fn main() -> i32 { 1 + 2 }', snippets: ['i32.add'] },
  { name: 'sub literals', source: 'fn main() -> i32 { 7 - 3 }', snippets: ['i32.sub'] },
  { name: 'mul literals', source: 'fn main() -> i32 { 4 * 5 }', snippets: ['i32.mul'] },
  { name: 'div literals', source: 'fn main() -> i32 { 9 / 3 }', snippets: ['i32.div_s'] },
  { name: 'rem literals', source: 'fn main() -> i32 { 9 % 4 }', snippets: ['i32.rem_s'] },
  { name: 'less-than', source: 'fn main() -> i32 { if 1 < 2 { return 1; } else { return 0; } }', snippets: ['(func $main'] },
  { name: 'less-equal', source: 'fn main() -> i32 { if 2 <= 2 { return 1; } else { return 0; } }', snippets: ['(func $main'] },
  { name: 'greater-than', source: 'fn main() -> i32 { if 3 > 2 { return 1; } else { return 0; } }', snippets: ['(func $main'] },
  { name: 'greater-equal', source: 'fn main() -> i32 { if 3 >= 3 { return 1; } else { return 0; } }', snippets: ['(func $main'] },
  { name: 'equal check', source: 'fn main() -> i32 { if 5 == 5 { return 1; } else { return 0; } }', snippets: ['i32.eq'] },
  { name: 'not-equal check', source: 'fn main() -> i32 { if 5 != 6 { return 1; } else { return 0; } }', snippets: ['(func $main'] },
  { name: 'nested arithmetic 1', source: 'fn main() -> i32 { (1 + 2) * 3 }', snippets: ['i32.add', 'i32.mul'] },
  { name: 'nested arithmetic 2', source: 'fn main() -> i32 { (10 - 3) / 7 }', snippets: ['i32.sub', 'i32.div_s'] },
  { name: 'nested arithmetic 3', source: 'fn main() -> i32 { (10 % 3) + (8 % 3) }', snippets: ['i32.rem_s', 'i32.add'] },
  { name: 'call expression arithmetic', source: 'fn id(x: i32) -> i32 { x } fn main() -> i32 { id(3) + id(4) }', snippets: ['call $id', 'i32.add'] },
  { name: 'unary negative', source: 'fn main() -> i32 { -5 + 7 }', snippets: ['i32.sub', 'i32.add'] },
];

const controlFlowCases: CaseSpec[] = [
  {
    name: 'if else',
    source: 'fn main() -> i32 { if true { return 1; } else { return 0; } }',
    snippets: ['(func $main'],
  },
  {
    name: 'while loop',
    source: 'fn main() -> i32 { let mut i = 0; while (i < 3) { i = i + 1; } i }',
    snippets: ['(loop $while_loop_', 'br_if $while_exit_'],
  },
  {
    name: 'for range exclusive',
    source: 'fn main() -> i32 { let mut t = 0; for i in 0..3 { t = t + i; } t }',
    snippets: ['(loop $for_loop_', 'local.set $i'],
  },
  {
    name: 'for range inclusive',
    source: 'fn main() -> i32 { let mut t = 0; for i in 0..=3 { t = t + i; } t }',
    snippets: ['(loop $for_loop_', 'local.set $__for_end_'],
  },
  {
    name: 'while-let',
    source: `
      enum Option {
        Some(i32),
        None
      }
      fn recv() -> Option { Option.None }
      fn main() -> i32 {
        while let Some(v) = recv() {
          return v;
        }
        0
      }
    `,
    snippets: ['(loop $whilelet_loop_', 'local.set $__whilelet_'],
  },
  {
    name: 'match expression',
    source: `
      enum Option {
        Some(i32),
        None
      }
      fn main() -> i32 {
        let v = Option.Some(2);
        match v {
          Some(x) => x,
          None => 0
        }
      }
    `,
    snippets: ['(block $match_expr_end_', '(if (result i32)'],
  },
  {
    name: 'nested return in loop',
    source: 'fn main() -> i32 { while (true) { return 9; } 0 }',
    snippets: ['(loop $while_loop_', 'return'],
  },
  {
    name: 'logical and',
    source: 'fn main() -> i32 { if true && false { return 1; } else { return 0; } }',
    snippets: ['i32.and'],
  },
  {
    name: 'logical or',
    source: 'fn main() -> i32 { if true || false { return 1; } else { return 0; } }',
    snippets: ['(func $main'],
  },
  {
    name: 'async await lowered via promise imports',
    source: 'async fn main() -> i32 { let x = await work(); x } async fn work() -> i32 { 1 }',
    snippets: ['(import "env" "promise_await_i32"', '(import "env" "promise_resolve_i32"'],
  },
];

const stringAndTypeCases: CaseSpec[] = [
  {
    name: 'string literal data segment',
    source: 'fn main() -> string { "hello" }',
    snippets: ['(data (i32.const'],
  },
  {
    name: 'string concat call',
    source: 'import { str } from "@std"; fn main() -> string { str.concat("a", "b") }',
    snippets: ['call $str_concat'],
  },
  {
    name: 'string slice helper',
    source: 'fn main() -> string { let s = "abcd"; s[1..3] }',
    snippets: ['call $str_slice'],
  },
  {
    name: 'string interpolation',
    source: 'fn main() -> string { let n = "lumina"; "hello {n}" }',
    snippets: ['call $str_concat'],
  },
  {
    name: 'struct constructor',
    source: 'struct User { age: i32 } fn main() -> i32 { let u = User { age: 4 }; u.age }',
    snippets: ['(func $User_new', 'i32.load'],
  },
  {
    name: 'enum zero payload tag compare',
    source: 'enum Flag { On, Off } fn main() -> i32 { let f = Flag.On; match f { Flag.On => 1, Flag.Off => 0 } }',
    snippets: ['i32.eq'],
  },
  {
    name: 'enum single payload constructor',
    source: 'enum Boxed { Num(i32) } fn main() -> i32 { let b = Boxed.Num(3); match b { Boxed.Num(x) => x } }',
    snippets: ['call $alloc', 'i32.store', 'i32.load'],
  },
  {
    name: 'trait static dispatch',
    source: `
      trait Show {
        fn show(self: Self) -> string;
      }
      struct User { name: string }
      impl Show for User {
        fn show(self: Self) -> string { self.name }
      }
      fn main() -> string {
        let u = User { name: "a" };
        u.show()
      }
    `,
    snippets: ['(func $Show_User_show', 'call $Show_User_show'],
  },
  {
    name: 'try operator lowering',
    source: `
      enum Result<T, E> {
        Ok(T),
        Err(E)
      }
      fn compute(v: i32) -> Result<i32, string> {
        if v > 0 { Result.Ok(v) } else { Result.Err("bad") }
      }
      fn main() -> Result<i32, string> {
        let x = compute(2)?;
        Result.Ok(x + 1)
      }
    `,
    snippets: ['(if (result i32)', 'return'],
  },
  {
    name: 'lambda lowering',
    source: 'fn main() -> i32 { let base = 1; let inc = |x| x + base; inc(2) }',
    snippets: ['(func $__lambda_', 'call $__lambda_'],
  },
  {
    name: 'array bounds check',
    source: 'fn main() -> i32 { let a = [1, 2, 3]; 0 }',
    snippets: [],
    allowErrorCodes: ['WASM-001'],
    requiredErrorCodes: ['WASM-001'],
  },
];

const collectionCases: CaseSpec[] = [
  {
    name: 'vec new/push/len',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); vec.len(v) }',
    snippets: ['(import "env" "vec_new"', 'call $vec_push', 'call $vec_len'],
  },
  {
    name: 'vec get',
    source: `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 3);
        vec.get(v, 0);
        0
      }
    `,
    snippets: ['(import "env" "vec_get_has"', '(import "env" "vec_get"'],
  },
  {
    name: 'vec pop',
    source: `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 3);
        vec.pop(v);
        0
      }
    `,
    snippets: ['(import "env" "vec_pop_has"', '(import "env" "vec_pop"'],
  },
  {
    name: 'vec clear',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); vec.clear(v); vec.len(v) }',
    snippets: ['call $vec_clear'],
  },
  {
    name: 'vec map',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); let m = vec.map(v, |x| x + 1); vec.len(m) }',
    snippets: ['call $vec_map_closure', '(export "__lambda_'],
  },
  {
    name: 'vec filter',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); let f = vec.filter(v, |x| x > 0); vec.len(f) }',
    snippets: ['call $vec_filter_closure'],
  },
  {
    name: 'vec fold',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); vec.fold(v, 0, |acc, x| acc + x) }',
    snippets: ['call $vec_fold_closure'],
  },
  {
    name: 'vec any',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); if vec.any(v, |x| x > 0) { return 1; } else { return 0; } }',
    snippets: ['(import "env" "vec_any_closure"'],
  },
  {
    name: 'vec all',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); if vec.all(v, |x| x > 0) { return 1; } else { return 0; } }',
    snippets: ['(import "env" "vec_all_closure"'],
  },
  {
    name: 'vec find/position',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 2); vec.find(v, |x| x == 2); vec.position(v, |x| x == 2); 0 }',
    snippets: ['call $vec_find_has', 'call $vec_position'],
  },
  {
    name: 'vec take/skip',
    source: 'import { vec } from "@std"; fn main() -> i32 { let v = vec.new(); vec.push(v, 1); vec.push(v, 2); let t = vec.take(v, 1); let s = vec.skip(v, 1); vec.len(t) + vec.len(s) }',
    snippets: ['call $vec_take', 'call $vec_skip'],
  },
  {
    name: 'hashmap operations',
    source: `
      import { hashmap } from "@std";
      fn main() -> i32 {
        let m = hashmap.new();
        hashmap.insert(m, 1, 3);
        hashmap.get(m, 1);
        hashmap.remove(m, 1);
        hashmap.len(m)
      }
    `,
    snippets: ['(import "env" "hashmap_new"', 'call $hashmap_insert_has', 'call $hashmap_len'],
  },
  {
    name: 'hashset operations',
    source: 'import { hashset } from "@std"; fn main() -> i32 { let s = hashset.new(); let _ok = hashset.insert(s, 1); let _has = hashset.contains(s, 1); hashset.len(s) }',
    snippets: ['(import "env" "hashset_new"', 'call $hashset_insert', 'call $hashset_contains'],
  },
  {
    name: 'memory hooks emitted with std usage',
    source: 'import { str } from "@std"; fn main() -> i32 { let s = str.concat("a", "b"); if s == "ab" { 1 } else { 0 } }',
    snippets: ['(import "env" "mem_retain"', '(import "env" "mem_release"', '(import "env" "mem_stats_live"'],
  },
];

describe('WASM codegen matrix coverage', () => {
  it.each(numericCases)('numeric: $name', (spec) => {
    compileCase(spec);
  });

  it.each(controlFlowCases)('control flow: $name', (spec) => {
    compileCase(spec);
  });

  it.each(stringAndTypeCases)('strings/types: $name', (spec) => {
    compileCase(spec);
  });

  it.each(collectionCases)('collections: $name', (spec) => {
    compileCase(spec);
  });

  it('contains 50+ wasm codegen matrix scenarios', () => {
    const total = numericCases.length + controlFlowCases.length + stringAndTypeCases.length + collectionCases.length;
    expect(total).toBeGreaterThanOrEqual(50);
  });
});
