import {
  toParseError,
  formatErrorWithColors,
  formatErrorWithSuggestions,
  formatDebugError,
  isGrammarError
} from '../src/utils/format';

describe('Error Formatting Utilities', () => {
  const samplePeggyError = {
    name: 'SyntaxError',
    message: 'Expected "let" but "ltt" found.',
    location: {
      start: { offset: 4, line: 1, column: 5 },
      end: { offset: 7, line: 1, column: 8 }
    },
    expected: ['let'],
    found: 'ltt',
    input: 'var x = ltt;'
  };

  const malformedError = {
    message: undefined,
    location: undefined,
    expected: undefined,
    found: undefined,
    input: undefined
  };

  it('should convert Peggy-style error to ParseError', () => {
    const parsed = toParseError(samplePeggyError);
    expect(parsed.error).toBe('Expected "let" but "ltt" found.');
    expect(parsed.expected).toEqual(['let']);
    expect(parsed.found).toBe('ltt');
    expect(parsed.input).toBe('var x = ltt;');
  });

  it('should format error with ANSI colors', () => {
    const parsed = toParseError(samplePeggyError);
    const output = formatErrorWithColors(parsed, true);
    expect(output).toContain('Parse Error:');
    // eslint-disable-next-line no-control-regex
    expect(output).toMatch(/\x1b\[\d+m/); // Checks for ANSI color codes
  });

  it('should normalize Peggy expected objects when formatting errors', () => {
    const parsed = toParseError({
      ...samplePeggyError,
      expected: [
        { type: 'literal', text: '+' },
        { type: 'class', description: '[0-9]' },
      ],
    });
    const output = formatErrorWithColors(parsed, false);

    expect(output).toContain('Expected: +, [0-9]');
    expect(output).not.toContain('[object Object]');
  });

  it('should omit opaque expected placeholders from formatted errors', () => {
    const output = formatErrorWithColors(
      {
        success: false,
        error: 'Expected [0-9] but end of input found.',
        expected: ['[object Object]', '[object Object]'],
        found: null,
      },
      false
    );

    expect(output).toContain('Parse Error: Expected [0-9] but end of input found.');
    expect(output).not.toContain('[object Object]');
  });

  it('should include suggestions for grammar errors', () => {
    const parsed = toParseError(samplePeggyError);
    const formatted = formatErrorWithSuggestions(parsed, false);
    expect(formatted).toContain('💡 Suggestions:');
    expect(formatted).toMatch(/Check for (missing|incorrect)/i);
  });

  it('should provide debug output for error objects', () => {
    const debug = formatDebugError(samplePeggyError);
    expect(debug).toContain('🐛 Debug Error Information:');
    expect(debug).toContain('Expected: let');
    expect(debug).toContain('Found: ltt');
  });

  it('should detect grammar-like errors', () => {
    expect(isGrammarError(samplePeggyError)).toBe(true);
    expect(isGrammarError(new Error('Expected "if" but "iff" found'))).toBe(true);
    expect(isGrammarError({})).toBe(false);
  });

  it('should handle malformed error input gracefully', () => {
    const parsed = toParseError(malformedError as unknown);
    const output = formatErrorWithSuggestions(parsed, true);
    expect(output).toContain('❌ Parse Error:');
    expect(output).toContain('Unknown error');
  });
});
