import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { inferProgram } from '../src/lumina/hm-infer.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

type MatrixCase = {
  name: string;
  source: string;
  expectErrorCode?: string;
};

const CASES: MatrixCase[] = [
  {
    name: 'numeric cast happy-path',
    source: `
      fn main() -> i32 {
        let x: i32 = 42;
        let y = x as i32;
        y
      }
    `,
  },
  {
    name: 'trait method dispatch still type-checks',
    source: `
      trait Printable { fn debug(self: Self) -> string; }
      struct User { name: string }
      impl Printable for User {
        fn debug(self: Self) -> string { self.name }
      }
      fn main() -> string {
        let u = User { name: "Ada" };
        u.debug()
      }
    `,
  },
  {
    name: 'await outside async is diagnosed',
    source: `
      fn main() -> i32 {
        let x = await get_value();
        x
      }
      async fn get_value() -> i32 { 1 }
    `,
    expectErrorCode: 'AWAIT_OUTSIDE_ASYNC',
  },
  {
    name: 'mixed numeric operation rejects implicit promotion',
    source: `
      fn main() -> i32 {
        let a = 1;
        let b = 1.5;
        a + b
      }
    `,
    expectErrorCode: 'LUM-001',
  },
  {
    name: 'const generic array literal mismatch is diagnosed',
    source: `
      struct V<const N: usize> { data: [i32; N] }
      fn main() -> V<3> {
        V { data: [1, 2] }
      }
    `,
    expectErrorCode: 'CONST-SIZE-MISMATCH',
  },
];

describe('type system edge matrix', () => {
  test.each(CASES)('$name', ({ source, expectErrorCode }) => {
    const ast = parser.parse(source) as { type: string };
    const inferred = inferProgram(ast as never);
    const codes = inferred.diagnostics.map((d) => d.code).filter(Boolean) as string[];

    if (!expectErrorCode) {
      expect(inferred.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
      return;
    }
    expect(codes).toContain(expectErrorCode);
  });
});
