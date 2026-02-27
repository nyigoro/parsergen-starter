import path from 'node:path';

import { validateOutputPath } from '../src/bin/lumina-core.js';

describe('Output path security validation', () => {
  const cwd = process.cwd();

  test('allows relative outputs within cwd', () => {
    expect(() => validateOutputPath('dist/out.js')).not.toThrow();
    expect(() => validateOutputPath('./build/output.js')).not.toThrow();
  });

  test('returns absolute normalized path', () => {
    const resolved = validateOutputPath('./dist//bundle.js');
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toContain(path.join('dist', 'bundle.js'));
  });

  test('blocks traversal outside cwd', () => {
    expect(() => validateOutputPath('../../../etc/passwd')).toThrow('Path traversal detected');
  });

  test('blocks absolute path outside cwd by default', () => {
    const outside = path.resolve(cwd, '..', 'outside-output.js');
    expect(() => validateOutputPath(outside)).toThrow('must be within current directory');
  });

  test('allows absolute path outside cwd only when explicitly enabled', () => {
    const outside = path.resolve(cwd, '..', 'outside-output.js');
    expect(() => validateOutputPath(outside, { allowAbsoluteOutsideCwd: true })).not.toThrow();
  });

  test('blocks null-byte paths', () => {
    expect(() => validateOutputPath('dist/out.js\0evil')).toThrow('invalid null byte');
  });

  test('blocks system directories', () => {
    if (process.platform === 'win32') {
      expect(() =>
        validateOutputPath('C:\\Windows\\System32\\drivers\\etc\\hosts', { allowAbsoluteOutsideCwd: true })
      ).toThrow('Cannot write to system directory');
      expect(() =>
        validateOutputPath('C:\\Program Files\\Lumina\\out.js', { allowAbsoluteOutsideCwd: true })
      ).toThrow('Cannot write to system directory');
      return;
    }

    expect(() => validateOutputPath('/etc/lumina.conf', { allowAbsoluteOutsideCwd: true })).toThrow(
      'Cannot write to system directory'
    );
    expect(() => validateOutputPath('/usr/local/bin/lumina', { allowAbsoluteOutsideCwd: true })).toThrow(
      'Cannot write to system directory'
    );
  });
});

