describe('Runtime stdlib str', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('length returns string length', async () => {
    const { str } = await loadRuntime();
    expect(str.length('hello')).toBe(5);
  });

  test('concat joins strings', async () => {
    const { str } = await loadRuntime();
    expect(str.concat('foo', 'bar')).toBe('foobar');
  });

  test('concat handles empty strings', async () => {
    const { str } = await loadRuntime();
    expect(str.concat('', '')).toBe('');
    expect(str.concat('a', '')).toBe('a');
  });

  test('split returns list of strings', async () => {
    const { str } = await loadRuntime();
    expect(str.split('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  test('split handles edge cases', async () => {
    const { str } = await loadRuntime();
    expect(str.split('', ',')).toEqual(['']);
    expect(str.split('abc', '')).toEqual(['a', 'b', 'c']);
    expect(str.split('abc', ',')).toEqual(['abc']);
    expect(str.split('a,,b', ',')).toEqual(['a', '', 'b']);
  });

  test('trim removes surrounding whitespace', async () => {
    const { str } = await loadRuntime();
    expect(str.trim('  hi  ')).toBe('hi');
  });

  test('trim handles edge cases', async () => {
    const { str } = await loadRuntime();
    expect(str.trim('')).toBe('');
    expect(str.trim('   ')).toBe('');
    expect(str.trim('abc')).toBe('abc');
    expect(str.trim('  a b  ')).toBe('a b');
  });

  test('contains checks substring', async () => {
    const { str } = await loadRuntime();
    expect(str.contains('lumina', 'min')).toBe(true);
    expect(str.contains('lumina', 'max')).toBe(false);
  });

  test('contains handles edge cases', async () => {
    const { str } = await loadRuntime();
    expect(str.contains('abc', '')).toBe(true);
    expect(str.contains('', 'x')).toBe(false);
    expect(str.contains('', '')).toBe(true);
  });

  test('eq compares strings', async () => {
    const { str } = await loadRuntime();
    expect(str.eq('a', 'a')).toBe(true);
    expect(str.eq('a', 'b')).toBe(false);
  });

  test('char_at returns Option', async () => {
    const { str, Option } = await loadRuntime();
    expect(str.char_at('abc', 1)).toMatchObject({ $tag: 'Some', $payload: 'b' });
    expect(str.char_at('abc', 9)).toBe(Option.None);
  });

  test('is_whitespace detects whitespace chars', async () => {
    const { str } = await loadRuntime();
    expect(str.is_whitespace(' ')).toBe(true);
    expect(str.is_whitespace('\n')).toBe(true);
    expect(str.is_whitespace('a')).toBe(false);
  });

  test('is_digit detects digits', async () => {
    const { str } = await loadRuntime();
    expect(str.is_digit('0')).toBe(true);
    expect(str.is_digit('9')).toBe(true);
    expect(str.is_digit('a')).toBe(false);
  });

  test('to_int parses integers', async () => {
    const { str } = await loadRuntime();
    expect(str.to_int('42')).toMatchObject({ $tag: 'Ok', $payload: 42 });
    expect(str.to_int('nope')).toMatchObject({ $tag: 'Err' });
  });

  test('to_float parses floats', async () => {
    const { str } = await loadRuntime();
    expect(str.to_float('3.14')).toMatchObject({ $tag: 'Ok', $payload: 3.14 });
    expect(str.to_float('nope')).toMatchObject({ $tag: 'Err' });
  });

  test('from_int converts numbers to strings', async () => {
    const { str } = await loadRuntime();
    expect(str.from_int(42)).toBe('42');
    expect(str.from_int(-5)).toBe('-5');
  });

  test('from_float converts floats to strings', async () => {
    const { str } = await loadRuntime();
    expect(str.from_float(3.14)).toBe('3.14');
  });
});
