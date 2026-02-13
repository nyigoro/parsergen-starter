describe('Runtime stdlib math', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('integer operations', async () => {
    const { math } = await loadRuntime();
    expect(math.abs(-5)).toBe(5);
    expect(math.abs(0)).toBe(0);
    expect(math.min(3, 1)).toBe(1);
    expect(math.max(3, 1)).toBe(3);
  });

  test('float operations', async () => {
    const { math } = await loadRuntime();
    expect(math.absf(-2.5)).toBe(2.5);
    expect(math.minf(1.5, 2.5)).toBe(1.5);
    expect(math.maxf(1.5, 2.5)).toBe(2.5);
    expect(math.sqrt(9)).toBe(3);
    expect(math.pow(2, 3)).toBe(8);
  });

  test('rounding helpers', async () => {
    const { math } = await loadRuntime();
    expect(math.floor(2.9)).toBe(2);
    expect(math.ceil(2.1)).toBe(3);
    expect(math.round(2.6)).toBe(3);
    expect(math.round(2.4)).toBe(2);
  });

  test('constants', async () => {
    const { math } = await loadRuntime();
    expect(math.pi).toBeCloseTo(Math.PI, 10);
    expect(math.e).toBeCloseTo(Math.E, 10);
  });
});
