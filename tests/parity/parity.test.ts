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
  {
    name: 'nested function call parity',
    source: `
      fn inc(x: i32) -> i32 { return x + 1; }
      fn dbl(x: i32) -> i32 { return x * 2; }
      fn main() -> i32 { return dbl(inc(8)); }
    `,
    expectedRet: 18,
  },
  {
    name: 'result propagation parity',
    source: `
      enum Result<T, E> { Ok(T), Err(E) }

      fn parse(v: i32) -> Result<i32, string> {
        if (v > 0) { return Result.Ok(v + 1); }
        return Result.Err("bad");
      }

      fn lift(v: i32) -> Result<i32, string> {
        let n = parse(v)?;
        return Result.Ok(n * 2);
      }

      fn main() -> i32 {
        let out = lift(3);
        return match out {
          Ok(v) => v,
          Err(_) => 0
        };
      }
    `,
    expectedRet: 8,
  },
  {
    name: 'string interpolation output parity',
    source: `
      fn main() -> i32 {
        let who = "Lumina";
        let message = "Hello {who}";
        if (message == "Hello {who}") { return 1; }
        return 0;
      }
    `,
  },
  {
    name: 'collection pipeline parity',
    source: `
      fn main() -> i32 {
        let mut i = 1;
        let mut acc = 0;
        while (i <= 5) {
          let mapped = i * 2;
          if (mapped > 5) {
            acc = acc + mapped;
          }
          i = i + 1;
        }
        return acc;
      }
    `,
    expectedRet: 24,
  },
  {
    name: 'gadt typed expression parity',
    source: `
      enum Expr<T> {
        Lit(i32): Expr<i32>,
        Bool(bool): Expr<bool>
      }

      fn main() -> i32 {
        let expr = Expr.Lit(7);
        return match expr {
          Lit(v) => v,
          _ => 0
        };
      }
    `,
    expectedRet: 7,
  },
  {
    name: 'hkt-style constructor chain parity',
    source: `
      enum Wrap<T> {
        Val(T)
      }

      fn add_two(v: Wrap<i32>) -> Wrap<i32> {
        return match v {
          Val(x) => Wrap.Val(x + 2)
        };
      }

      fn triple(v: Wrap<i32>) -> Wrap<i32> {
        return match v {
          Val(x) => Wrap.Val(x * 3)
        };
      }

      fn main() -> i32 {
        let value = triple(add_two(Wrap.Val(3)));
        return match value {
          Val(x) => x
        };
      }
    `,
    expectedRet: 15,
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

const asyncWhileLoopCase: ParityTestCase = {
  name: 'await in while loop parity',
  source: `
    async fn step(v: i32) -> i32 { return v + 1; }
    async fn main() -> i32 {
      let mut i = 0;
      let mut acc = 0;
      while (i < 4) {
        let next = await step(i);
        acc = acc + next;
        i = i + 1;
      }
      return acc;
    }
  `,
  expectedRet: 10,
};

const asyncForLoopCase: ParityTestCase = {
  name: 'await in for loop parity',
  source: `
    async fn val(v: i32) -> i32 { return v * 2; }
    async fn main() -> i32 {
      let mut total = 0;
      for i in 1..0 {
        total = total + await val(i);
      }
      return total;
    }
  `,
  expectedRet: 0,
};

const asyncTripleNestedCase: ParityTestCase = {
  name: 'three-level async nesting parity',
  source: `
    async fn leaf(v: i32) -> i32 { return v + 1; }
    async fn mid(v: i32) -> i32 { return await leaf(v) * 2; }
    async fn top(v: i32) -> i32 { return await mid(v) + 3; }
    async fn main() -> i32 { return await top(4); }
  `,
  expectedRet: 13,
};

const asyncMixedSyncCase: ParityTestCase = {
  name: 'mixed sync and async parity',
  source: `
    fn seed() -> i32 { return 5; }
    async fn plus(v: i32) -> i32 { return v + 2; }
    async fn main() -> i32 {
      let base = seed();
      return await plus(base);
    }
  `,
  expectedRet: 7,
};

const asyncResultChainCase: ParityTestCase = {
  name: 'async result propagation parity',
  source: `
    enum Result<T, E> { Ok(T), Err(E) }

    async fn step(v: i32) -> Result<i32, string> {
      return Result.Ok(v + 1);
    }

    async fn chain(v: i32) -> Result<i32, string> {
      let first = await step(v)?;
      let second = await step(first)?;
      return Result.Ok(second);
    }

    async fn main() -> i32 {
      let out = await chain(3);
      return match out {
        Ok(v) => v,
        Err(_) => 0
      };
    }
  `,
  expectedRet: 5,
};

describe('JS/WASM parity harness', () => {
  const available = supportsParityWasm();
  const parityIt = available ? it : it.skip;
  const parityEach = available ? it.each : it.skip.each;

  it('detects wat2wasm availability', () => {
    if (!available) {
      console.warn('Skipping JS/WASM parity tests: wat2wasm not available in PATH');
    }
    expect(typeof available).toBe('boolean');
  });

  parityEach(cases)('$name', async (spec) => {
    const result = await parityTest(spec);
    expect(result.match).toBe(true);
    if (!result.match) {
      throw new Error(result.diff ?? `Parity mismatch for ${spec.name}`);
    }
  });

  parityIt('async/await parity case', async () => {
    const result = await parityTest(asyncAwaitCase);
    expect(result.match).toBe(true);
  });

  parityIt('chained async/await parity case', async () => {
    const result = await parityTest(asyncChainCase);
    expect(result.match).toBe(true);
  });

  parityIt('async-calls-async parity case', async () => {
    const result = await parityTest(asyncCallsAsyncCase);
    expect(result.match).toBe(true);
  });

  parityIt('await in while loop parity case', async () => {
    const result = await parityTest(asyncWhileLoopCase);
    expect(result.match).toBe(true);
  });

  parityIt('await in for loop parity case', async () => {
    const result = await parityTest(asyncForLoopCase);
    expect(result.match).toBe(true);
  });

  parityIt('three-level async nesting parity case', async () => {
    const result = await parityTest(asyncTripleNestedCase);
    expect(result.match).toBe(true);
  });

  parityIt('mixed sync/async parity case', async () => {
    const result = await parityTest(asyncMixedSyncCase);
    expect(result.match).toBe(true);
  });

  parityIt('async Result + ? propagation parity case', async () => {
    const result = await parityTest(asyncResultChainCase);
    expect(result.match).toBe(true);
  });
});
