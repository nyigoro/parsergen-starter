import { formatValue, Option, Result, LuminaPanic, io } from '../src/lumina-runtime.js';

describe('Lumina runtime', () => {
  test('pretty-prints nested ADTs', () => {
    const value = Option.Some(Result.Ok([1, 2, 3]));
    const rendered = formatValue(value);
    expect(rendered).toContain('Some');
    expect(rendered).toContain('Ok');
    expect(rendered).toContain('1');
    expect(rendered).toContain('2');
    expect(rendered).toContain('3');
  });

  test('cycle-safe formatting', () => {
    const obj: { self?: unknown } = {};
    obj.self = obj;
    const rendered = formatValue(obj);
    expect(rendered).toContain('[Circular]');
  });

  test('Option helpers', () => {
    const some = Option.Some(5);
    const mapped = Option.map(some, (x: unknown) => (x as number) * 2);
    expect(formatValue(mapped)).toContain('Some(10)');

    const none = Option.None;
    const mappedNone = Option.map(none, (x: unknown) => x);
    expect(formatValue(mappedNone)).toContain('None');

    const chained = Option.and_then(some, (x: unknown) => Option.Some((x as number) + 1));
    expect(formatValue(chained)).toContain('Some(6)');
  });

  test('Result.unwrap_or', () => {
    const ok = Result.Ok(42);
    const err = Result.Err('nope');
    expect(Result.unwrap_or(ok, 0)).toBe(42);
    expect(Result.unwrap_or(err, 0)).toBe(0);
  });

  test('Result helpers', () => {
    const ok = Result.Ok(5);
    const mapped = Result.map(ok, (x: unknown) => (x as number) * 2);
    expect(formatValue(mapped)).toContain('Ok(10)');

    const chained = Result.and_then(ok, (x: unknown) => Result.Ok((x as number) + 1));
    expect(formatValue(chained)).toContain('Ok(6)');

    const err = Result.Err('bad');
    const errMapped = Result.map(err, (x: unknown) => x);
    expect(formatValue(errMapped)).toContain('Err');
  });

  test('Option.unwrap throws LuminaPanic on None', () => {
    expect(() => Option.unwrap(Option.None)).toThrow(LuminaPanic);
    try {
      Option.unwrap(Option.None);
    } catch (err) {
      const panic = err as LuminaPanic;
      expect(panic.name).toBe('LuminaPanic');
      expect(panic.message).toContain('None');
      expect(panic.value).toBe(Option.None);
    }
  });

  test('io.printJson emits JSON string', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    io.printJson(Option.Some(3));
    expect(spy).toHaveBeenCalled();
    const output = String(spy.mock.calls[0]?.[0] ?? '');
    expect(output).toContain('"$tag": "Some"');
    expect(output).toContain('"$payload": 3');
    spy.mockRestore();
  });
});
