describe('Runtime stdlib io', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('print/println write to stdout', async () => {
    const { io } = await loadRuntime();
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    io.print('hello');
    io.println('world');

    expect(stdoutSpy).toHaveBeenCalled();
    const first = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
    const second = String(stdoutSpy.mock.calls[1]?.[0] ?? '');
    expect(first).toContain('hello');
    expect(first.endsWith('\n')).toBe(false);
    expect(second).toContain('world');
    expect(second.endsWith('\n')).toBe(true);

    stdoutSpy.mockRestore();
  });

  test('eprint/eprintln write to stderr', async () => {
    const { io } = await loadRuntime();
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    io.eprint('warn');
    io.eprintln('error');

    expect(stderrSpy).toHaveBeenCalled();
    const first = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    const second = String(stderrSpy.mock.calls[1]?.[0] ?? '');
    expect(first).toContain('warn');
    expect(first.endsWith('\n')).toBe(false);
    expect(second).toContain('error');
    expect(second.endsWith('\n')).toBe(true);

    stderrSpy.mockRestore();
  });

  test('readLine returns Option wrapped values', async () => {
    const { io } = await loadRuntime();
    (globalThis as { __luminaStdin?: string }).__luminaStdin = 'alpha\nbeta';

    const first = io.readLine();
    const second = io.readLine();
    const third = io.readLine();

    expect(first).toMatchObject({ $tag: 'Some', $payload: 'alpha' });
    expect(second).toMatchObject({ $tag: 'Some', $payload: 'beta' });
    expect(third).toMatchObject({ $tag: 'None' });

    delete (globalThis as { __luminaStdin?: string }).__luminaStdin;
  });
});
