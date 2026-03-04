import { parityTest, supportsParityWasm, type ParityTestCase } from './parity-harness.js';

const cases: ParityTestCase[] = [
  {
    name: 'integer arithmetic parity',
    source: 'fn main() -> i32 { return (20 / 4) + (9 % 4); }',
    expectedRet: 6,
  },
  {
    name: 'while loop parity',
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
    expectedRet: 6,
  },
  {
    name: 'for-range parity',
    source: `
      fn main() -> i32 {
        let mut acc = 0;
        for i in 0..=4 {
          acc = acc + i;
        }
        return acc;
      }
    `,
    expectedRet: 10,
  },
  {
    name: 'recursive fib parity',
    source: `
      fn fib(n: i32) -> i32 {
        if (n <= 1) { return n; } else { return fib(n - 1) + fib(n - 2); }
        return 0;
      }
      fn main() -> i32 { return fib(8); }
    `,
    expectedRet: 21,
  },
  {
    name: 'struct field update parity',
    source: `
      struct Counter { value: i32 }
      fn main() -> i32 {
        let mut c = Counter { value: 1 };
        c.value = c.value + 2;
        return c.value;
      }
    `,
    expectedRet: 3,
  },
  {
    name: 'enum payload match parity',
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
    expectedRet: 9,
  },
  {
    name: 'lambda capture parity',
    source: `
      fn main() -> i32 {
        let base = 3;
        let add = |x| x + base;
        return add(4);
      }
    `,
    expectedRet: 7,
  },
];

const asyncAwaitCase: ParityTestCase = {
  name: 'async await parity',
  source: `
    async fn work() -> i32 { return 3; }
    async fn main() -> i32 {
      let v = await work();
      return v + 2;
    }
  `,
  expectedRet: 5,
};

const asyncChainCase: ParityTestCase = {
  name: 'chained await parity',
  source: `
    async fn one() -> i32 { return 1; }
    async fn two(x: i32) -> i32 { return x + 2; }
    async fn main() -> i32 {
      let a = await one();
      let b = await two(a);
      return b + 3;
    }
  `,
  expectedRet: 6,
};

const asyncCallsAsyncCase: ParityTestCase = {
  name: 'async calls async parity',
  source: `
    async fn leaf() -> i32 { return 7; }
    async fn mid() -> i32 {
      let v = await leaf();
      return v * 2;
    }
    async fn main() -> i32 {
      return await mid();
    }
  `,
  expectedRet: 14,
};

describe('JS/WASM parity harness', () => {
  const available = supportsParityWasm();

  it('detects wat2wasm availability', () => {
    if (!available) {
      console.warn('Skipping parity suite: wat2wasm not found');
    }
    expect(typeof available).toBe('boolean');
  });

  it.each(cases)('$name', async (spec) => {
    if (!available) return;
    const result = await parityTest(spec);
    expect(result.match).toBe(true);
    if (!result.match) {
      throw new Error(result.diff ?? `Parity mismatch for ${spec.name}`);
    }
  });

  it('async/await parity case', async () => {
    if (!available) return;
    const result = await parityTest(asyncAwaitCase);
    expect(result.match).toBe(true);
  });

  it('chained async/await parity case', async () => {
    if (!available) return;
    const result = await parityTest(asyncChainCase);
    expect(result.match).toBe(true);
  });

  it('async-calls-async parity case', async () => {
    if (!available) return;
    const result = await parityTest(asyncCallsAsyncCase);
    expect(result.match).toBe(true);
  });
});
