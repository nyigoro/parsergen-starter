import { __lumina_slice } from '../src/lumina-runtime';

describe('String slice runtime', () => {
  it('slices within bounds', () => {
    expect(__lumina_slice('Hello', 1, 3, false)).toBe('el');
    expect(__lumina_slice('Hello', 1, 3, true)).toBe('ell');
  });

  it('throws on out-of-bounds start', () => {
    expect(() => __lumina_slice('Hi', -1, 1, false)).toThrow();
    expect(() => __lumina_slice('Hi', 3, 3, false)).toThrow();
  });

  it('throws on out-of-bounds end', () => {
    expect(() => __lumina_slice('Hi', 0, 5, false)).toThrow();
    expect(() => __lumina_slice('Hi', 0, 2, true)).toThrow();
  });
});

describe('__lumina_index Vec bounds', () => {
  it('throws on out-of-bounds Vec access', () => {
    const vecModule = require('../src/lumina-runtime');
    const v = vecModule.vec.new();
    vecModule.vec.push(v, 1);
    expect(() => vecModule.__lumina_index(v, 5)).toThrow();
  });
});
