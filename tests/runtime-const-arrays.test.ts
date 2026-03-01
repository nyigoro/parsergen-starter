import {
  __lumina_fixed_array,
  __lumina_array_bounds_check,
  __lumina_array_literal,
  __lumina_index,
} from '../src/lumina-runtime.js';

describe('Const Array Runtime Helpers', () => {
  describe('__lumina_fixed_array', () => {
    it('creates array of specified size', () => {
      const arr = __lumina_fixed_array(5);
      expect(arr).toHaveLength(5);
    });

    it('initializes elements with function', () => {
      const arr = __lumina_fixed_array(3, (i) => i * 2);
      expect(arr).toEqual([0, 2, 4]);
    });
  });

  describe('__lumina_array_bounds_check', () => {
    it('validates array size', () => {
      const arr = [1, 2, 3];
      expect(() => __lumina_array_bounds_check(arr, 0, 5)).toThrow('Array size mismatch: expected 5, got 3');
    });

    it('validates index bounds', () => {
      const arr = [1, 2, 3];
      expect(() => __lumina_array_bounds_check(arr, 5)).toThrow('Array index out of bounds: 5');
    });

    it('allows valid access', () => {
      const arr = [1, 2, 3];
      expect(() => __lumina_array_bounds_check(arr, 1, 3)).not.toThrow();
    });
  });

  describe('__lumina_array_literal', () => {
    it('creates array from elements', () => {
      const arr = __lumina_array_literal([1, 2, 3]);
      expect(arr).toEqual([1, 2, 3]);
    });

    it('validates expected size', () => {
      expect(() => __lumina_array_literal([1, 2], 3)).toThrow('Array literal has wrong size: expected 3, got 2');
    });
  });

  describe('__lumina_index array bounds', () => {
    it('checks bounds for plain arrays', () => {
      expect(() => __lumina_index([1, 2, 3], 10)).toThrow('Array index out of bounds: 10');
      expect(__lumina_index([1, 2, 3], 1)).toBe(2);
    });
  });
});

