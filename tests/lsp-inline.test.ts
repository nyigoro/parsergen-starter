import { buildInlineVariableCodeAction, canInlineVariable } from '../src/lsp/refactor-inline.js';

describe('LSP inline variable refactor', () => {
  test('inlines single-use binding', () => {
    const source = [
      'fn main() {',
      '  let value = 1 + 2;',
      '  return value;',
      '}',
      '',
    ].join('\n');
    const action = buildInlineVariableCodeAction(source, 'file:///tmp/inline.lm', {
      start: { line: 2, character: 9 },
      end: { line: 2, character: 14 },
    });
    expect(action).toBeTruthy();
    const edits = action?.edit?.changes?.['file:///tmp/inline.lm'] ?? [];
    expect(edits.length).toBeGreaterThanOrEqual(2);
    expect(
      edits.some(
        (edit) =>
          edit.range.start.line === 2 &&
          edit.range.start.character === 9 &&
          edit.range.end.line === 2 &&
          edit.range.end.character === 14
      )
    ).toBe(true);
  });

  test('allows multi-use inline only for pure initializers', () => {
    const pure = [
      'fn main() {',
      '  let base = 2 + 3;',
      '  let a = base;',
      '  let b = base;',
      '  return a + b;',
      '}',
      '',
    ].join('\n');
    const impure = [
      'fn main() {',
      '  let value = do_work();',
      '  let a = value;',
      '  let b = value;',
      '  return a + b;',
      '}',
      '',
    ].join('\n');
    expect(canInlineVariable(pure, 'base').eligible).toBe(true);
    expect(canInlineVariable(impure, 'value').eligible).toBe(false);
  });

  test('rejects mutable bindings', () => {
    const source = [
      'fn main() {',
      '  let mut counter = 0;',
      '  return counter;',
      '}',
      '',
    ].join('\n');
    expect(canInlineVariable(source, 'counter').eligible).toBe(false);
  });

  test('adds parentheses for precedence-sensitive expressions', () => {
    const source = [
      'fn main() {',
      '  let value = 1 + 2;',
      '  return value * 3;',
      '}',
      '',
    ].join('\n');
    const action = buildInlineVariableCodeAction(source, 'file:///tmp/inline-precedence.lm', {
      start: { line: 2, character: 9 },
      end: { line: 2, character: 14 },
    });
    const edits = action?.edit?.changes?.['file:///tmp/inline-precedence.lm'] ?? [];
    expect(edits.some((edit) => edit.newText === '(1 + 2)')).toBe(true);
  });
});
