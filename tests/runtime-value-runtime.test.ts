import {
  __lumina_clone,
  __lumina_eq,
  __lumina_register_trait_impl,
  __lumina_stringify,
  __lumina_struct,
  compareRuntimeValues,
  formatValue,
  runtimeHashValue,
} from '../src/runtime/value-runtime.js';

describe('runtime value-runtime', () => {
  test('formatValue renders enums and objects without color noise when disabled', () => {
    const rendered = formatValue(
      {
        status: { $tag: 'Ok', $payload: ['alpha', 2] },
        ready: true,
      },
      { color: false }
    );

    expect(rendered).toContain('Ok(alpha, 2)');
    expect(rendered).toContain('ready: true');
    expect(__lumina_stringify({ $tag: 'Some', $payload: 3 })).toBe('Some(3)');
  });

  test('trait impl registration drives hash, equality, and ordering', () => {
    type Score = { value: number; label: string };
    const left = __lumina_struct('Score', { value: 1, label: 'low' }) as Score;
    const right = __lumina_struct('Score', { value: 9, label: 'high' }) as Score;
    const sameAsLeft = __lumina_struct('Score', { value: 1, label: 'other' }) as Score;

    __lumina_register_trait_impl('Hash', 'Score', (self: Score) => self.value);
    __lumina_register_trait_impl('Eq', 'Score', (self: Score, other: Score) => self.value === other.value);
    __lumina_register_trait_impl('Ord', 'Score', (self: Score, other: Score) => self.value - other.value);

    expect(runtimeHashValue(left)).toBe('Score:1');
    expect(__lumina_eq(left, sameAsLeft)).toBe(true);
    expect(compareRuntimeValues(left, right)).toBeLessThan(0);
  });

  test('clone preserves lumina type tags for plain objects', () => {
    const original = __lumina_struct('User', {
      id: 1,
      nested: { roles: ['admin'] },
    });

    const cloned = __lumina_clone(original);

    expect(cloned).not.toBe(original);
    expect(cloned).toEqual(original);
    expect((cloned as { __lumina_type?: string }).__lumina_type).toBe('User');
    expect((cloned as { nested: { roles: string[] } }).nested).not.toBe(original.nested);
  });
});
