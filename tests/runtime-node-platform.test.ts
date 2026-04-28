import fs from 'node:fs';
import path from 'node:path';
import {
  basenamePathBasic,
  dirnamePathBasic,
  extnamePathBasic,
  getNodeBuiltinModule,
  getNodePath,
  isAbsolutePathBasic,
  isNodeRuntime,
  joinPathBasic,
  normalizePathBasic,
  resolvePathBasic,
} from '../src/runtime/node-platform.js';

describe('runtime node platform helpers', () => {
  test('detects node runtime and resolves builtins', () => {
    expect(isNodeRuntime()).toBe(true);
    expect(getNodeBuiltinModule('node:fs')).toBe(fs);
    expect(getNodePath()).toBeTruthy();
  });

  test('normalizes and joins paths consistently', () => {
    const joined = joinPathBasic('alpha', 'beta');
    expect(joined).toContain('alpha');
    expect(joined).toContain('beta');
    expect(normalizePathBasic(`alpha${path.sep}.${path.sep}beta`)).toBe(joined);
  });

  test('computes dirname, basename, and extname', () => {
    const filePath = joinPathBasic(joinPathBasic('alpha', 'beta'), 'file.txt');
    expect(dirnamePathBasic(filePath)).toContain(joinPathBasic('alpha', 'beta'));
    expect(basenamePathBasic(filePath)).toBe('file.txt');
    expect(extnamePathBasic(filePath)).toBe('.txt');
  });

  test('detects absolute paths and resolves relative paths from cwd', () => {
    const resolved = resolvePathBasic('src');
    expect(isAbsolutePathBasic(resolved)).toBe(true);
    expect(resolved).toContain(path.basename(process.cwd()));
  });
});
