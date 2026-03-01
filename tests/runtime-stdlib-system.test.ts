import nodePath from 'node:path';

type TaggedValue = { $tag?: string; $payload?: unknown };

const getTag = (value: unknown): string => ((value as TaggedValue)?.$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as TaggedValue).$payload as T;

describe('Runtime stdlib system modules', () => {
  const loadRuntime = async () => {
    jest.resetModules();
    return await import('../src/lumina-runtime.js');
  };

  test('@std/path helpers', async () => {
    const { path: luminaPath } = await loadRuntime();

    expect(luminaPath.join('dir', 'file.txt')).toBe(nodePath.join('dir', 'file.txt'));
    expect(luminaPath.is_absolute(nodePath.resolve('file.txt'))).toBe(true);

    const extSome = luminaPath.extension('archive.tar.gz');
    expect(getTag(extSome)).toBe('Some');
    expect(getPayload<string>(extSome)).toBe('gz');

    const extNone = luminaPath.extension('README');
    expect(getTag(extNone)).toBe('None');
  });

  test('@std/env helpers', async () => {
    const { env } = await loadRuntime();
    const key = `LUMINA_TEST_${Date.now()}_${Math.trunc(Math.random() * 100000)}`;

    const initial = env.var(key);
    expect(getTag(initial)).toBe('Err');

    const setResult = env.set_var(key, 'value-123');
    expect(getTag(setResult)).toBe('Ok');

    const loaded = env.var(key);
    expect(getTag(loaded)).toBe('Ok');
    expect(getPayload<string>(loaded)).toBe('value-123');

    const args = env.args();
    expect(Array.isArray(args)).toBe(true);
    expect(args.every((item: unknown) => typeof item === 'string')).toBe(true);

    const cwd = env.cwd();
    expect(getTag(cwd)).toBe('Ok');
    expect(typeof getPayload<string>(cwd)).toBe('string');

    const removeResult = env.remove_var(key);
    expect(getTag(removeResult)).toBe('Ok');
  });

  test('@std/process spawn helper', async () => {
    const { process: luminaProcess } = await loadRuntime();
    const command = process.execPath;
    const args = ['-e', 'process.stdout.write("hello"); process.stderr.write("warn");'];

    const output = luminaProcess.spawn(command, args);
    expect(getTag(output)).toBe('Ok');

    const payload = getPayload<{ status: number; success: boolean; stdout: string; stderr: string }>(output);
    expect(payload.status).toBe(0);
    expect(payload.success).toBe(true);
    expect(payload.stdout).toContain('hello');
    expect(payload.stderr).toContain('warn');

    expect(typeof luminaProcess.cwd()).toBe('string');
    expect(Number.isInteger(luminaProcess.pid())).toBe(true);
  });

  test('@std/json helpers', async () => {
    const { json } = await loadRuntime();

    const serialized = json.to_string({ name: 'Ada', age: 42 });
    expect(getTag(serialized)).toBe('Ok');
    const text = getPayload<string>(serialized);
    expect(text).toContain('"name":"Ada"');

    const parsed = json.from_string<{ name: string; age: number }>(text);
    expect(getTag(parsed)).toBe('Ok');
    const value = getPayload<{ name: string; age: number }>(parsed);
    expect(value.name).toBe('Ada');
    expect(value.age).toBe(42);

    const invalid = json.parse('{bad json}');
    expect(getTag(invalid)).toBe('Err');
  });
});

