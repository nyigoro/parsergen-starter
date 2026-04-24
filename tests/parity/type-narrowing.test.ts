import { analyzeForTarget, parityTest, runJS, supportsParityWasm } from './parity-harness.js';

const hardErrors = (diagnostics: Array<{ severity: string }>) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

const source = `
  enum Shape {
    Circle(i32),
    Square(i32)
  }

  fn main() -> i32 {
    let shape = Shape.Circle(5);
    if (shape is Shape.Circle) {
      return 1;
    }
    return 0;
  }
`;

describe('parity gap baseline: type narrowing', () => {
  test('JS target accepts boolean is checks and executes them', async () => {
    const diagnostics = analyzeForTarget(source, 'esm');
    expect(hardErrors(diagnostics)).toHaveLength(0);

    const result = await runJS(source);
    expect(result.ret).toBe(1);
  });

  test('WASM target now accepts boolean is checks', () => {
    const diagnostics = analyzeForTarget(source, 'wasm');
    expect(hardErrors(diagnostics)).toHaveLength(0);
  });

  const available = supportsParityWasm();
  const parityIt = available ? it : it.skip;

  parityIt('JS and WASM agree on type-narrowing runtime behavior', async () => {
    const result = await parityTest({ name: 'type narrowing parity', source, expectedRet: 1 });
    expect(result.match).toBe(true);
  }, 15000);
});
