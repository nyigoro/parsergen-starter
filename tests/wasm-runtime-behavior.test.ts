import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { compileGrammar } from '../src/grammar/index.js';
import { generateWATFromAst } from '../src/lumina/codegen-wasm.js';
import { loadWASM, callWASMFunction } from '../src/wasm-runtime.js';
import type { LuminaProgram } from '../src/lumina/ast.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source) as LuminaProgram;
const tempDir = path.join(__dirname, '../.tmp-wasm');

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const compileAndRunMain = async (source: string): Promise<number> => {
  const ast = parseProgram(source.trim() + '\n');
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  const errors = diagnostics.filter((d) => d.severity === 'error');
  expect(errors).toHaveLength(0);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const watPath = path.join(tempDir, 'runtime-behavior.wat');
  const wasmPath = path.join(tempDir, 'runtime-behavior.wasm');
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  const runtime = await loadWASM(wasmPath);
  return Number(callWASMFunction(runtime, 'main'));
};

type BehaviorCase = {
  name: string;
  source: string;
  expected: number;
};

const behaviorCases: BehaviorCase[] = [
  {
    name: 'integer addition executes',
    source: 'fn main() -> i32 { return 2 + 3; }',
    expected: 5,
  },
  {
    name: 'integer division and modulo execute',
    source: 'fn main() -> i32 { return (20 / 4) + (9 % 4); }',
    expected: 6,
  },
  {
    name: 'if true branch executes',
    source: 'fn main() -> i32 { if (true) { return 7; } else { return 1; } return 0; }',
    expected: 7,
  },
  {
    name: 'if false branch executes',
    source: 'fn main() -> i32 { if (false) { return 7; } else { return 1; } return 0; }',
    expected: 1,
  },
  {
    name: 'while loop accumulates',
    source: `
      fn main() -> i32 {
        let mut i = 0;
        let mut acc = 0;
        while (i < 4) {
          acc = acc + i;
          i = i + 1;
        }
        return acc;
      }
    `,
    expected: 6,
  },
  {
    name: 'for-range loop accumulates',
    source: `
      fn main() -> i32 {
        let mut acc = 0;
        for i in 0..=4 {
          acc = acc + i;
        }
        return acc;
      }
    `,
    expected: 10,
  },
  {
    name: 'recursive call executes',
    source: `
      fn fib(n: i32) -> i32 {
        if (n <= 1) { return n; } else { return fib(n - 1) + fib(n - 2); }
        return 0;
      }
      fn main() -> i32 { return fib(8); }
    `,
    expected: 21,
  },
  {
    name: 'struct field update executes',
    source: `
      struct Counter { value: i32 }
      fn main() -> i32 {
        let mut c = Counter { value: 1 };
        c.value = c.value + 2;
        return c.value;
      }
    `,
    expected: 3,
  },
  {
    name: 'enum payload match executes',
    source: `
      enum Option {
        Some(i32),
        None
      }
      fn main() -> i32 {
        let v = Option.Some(9);
        return match v {
          Some(x) => x,
          None => 0
        };
      }
    `,
    expected: 9,
  },
  {
    name: 'lambda capture executes',
    source: `
      fn main() -> i32 {
        let base = 3;
        let add = |x| x + base;
        return add(4);
      }
    `,
    expected: 7,
  },
  {
    name: 'string concat and eq execute',
    source: `
      import { str } from "@std";
      fn main() -> i32 {
        let out = str.concat("a", "b");
        if (out == "ab") { return 1; } else { return 0; } return 0;
      }
    `,
    expected: 1,
  },
  {
    name: 'string slice executes',
    source: `
      import { str } from "@std";
      fn main() -> i32 {
        let s = "lumina";
        let cut = s[0..3];
        if (cut == "lum") { return 1; } else { return 0; } return 0;
      }
    `,
    expected: 1,
  },
  {
    name: 'vec push/get/pop/len execute',
    source: `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 10);
        vec.push(v, 20);
        vec.get(v, 1);
        vec.pop(v);
        return vec.len(v);
      }
    `,
    expected: 1,
  },
  {
    name: 'vec iterator helpers execute',
    source: `
      import { vec } from "@std";
      fn main() -> i32 {
        let v = vec.new();
        vec.push(v, 1);
        vec.push(v, 2);
        vec.push(v, 3);
        let mapped = vec.map(v, |x| x * 2);
        return vec.fold(mapped, 0, |acc, x| acc + x);
      }
    `,
    expected: 12,
  },
  {
    name: 'hashmap operations execute',
    source: `
      import { hashmap } from "@std";
      fn main() -> i32 {
        let m = hashmap.new();
        hashmap.insert(m, 1, 9);
        hashmap.get(m, 1);
        hashmap.remove(m, 1);
        return hashmap.len(m);
      }
    `,
    expected: 0,
  },
  {
    name: 'hashset operations execute',
    source: `
      import { hashset } from "@std";
      fn main() -> i32 {
        let s = hashset.new();
        let inserted = hashset.insert(s, 4);
        let has = hashset.contains(s, 4);
        let removed = hashset.remove(s, 4);
        let mut score = 0;
        if (inserted) { score = score + 1; }
        if (has) { score = score + 1; }
        if (removed) { score = score + 1; }
        return score + hashset.len(s);
      }
    `,
    expected: 3,
  },
  {
    name: 'while-let loop executes',
    source: `
      enum Option {
        Some(i32),
        None
      }
      fn next(i: i32) -> Option {
        if (i < 3) { return Option.Some(i); } else { return Option.None; }
        return Option.None;
      }
      fn main() -> i32 {
        let mut i = 0;
        let mut total = 0;
        while let Some(v) = next(i) {
          total = total + v;
          i = i + 1;
        }
        return total;
      }
    `,
    expected: 3,
  },
  {
    name: 'trait method dispatch executes',
    source: `
      trait Printable {
        fn print(self: Self) -> string;
      }
      struct User {
        name: string
      }
      impl Printable for User {
        fn print(self: Self) -> string {
          return str.concat("U:", self.name);
        }
      }
      fn main() -> i32 {
        let u = User { name: "A" };
        if (u.print() == "U:A") { return 1; } else { return 0; } return 0;
      }
    `,
    expected: 1,
  },
];

describe('WASM runtime behavior matrix', () => {
  it.each(behaviorCases)('$name', async (spec) => {
    if (!hasWabt()) return;
    const out = await compileAndRunMain(spec.source);
    expect(out).toBe(spec.expected);
  });
});
