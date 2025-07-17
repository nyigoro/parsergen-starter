// tests/compile-grammar.test.ts
import { compileGrammar } from '../src/index';
import { formatCompilationError } from '../src/utils/format';

describe('compileGrammar', () => {
  it('should compile valid grammar and return a parser', () => {
    const grammar = `
      Expression
        = head:Term tail:(_ ("+" / "-") _ Term)* {
            return tail.reduce(
              (result, element) => {
                if (element[1] === "+") return result + element[3];
                return result - element[3];
              },
              head
            );
          }

      Term
        = head:Factor tail:(_ ("*" / "/") _ Factor)* {
            return tail.reduce(
              (result, element) => {
                if (element[1] === "*") return result * element[3];
                return result / element[3];
              },
              head
            );
          }

      Factor
        = "(" _ expr:Expression _ ")" { return expr; }
        / number:Number

      Number
        = digits:[0-9]+ {
            return parseInt(digits.join(""), 10);
          }

      _ "whitespace"
        = [ \\t\\n\\r]*
    `;

    const parser = compileGrammar(grammar);
    expect(parser).toBeDefined();
    const result = parser.parse('2 + 3 * 4');
    expect(result).toBe(14);
  });

  it('should throw and format syntax error for invalid grammar', () => {
    const badGrammar = `
      Expression
        = Term "+" Term
        // Missing definition for Term
    `;

    try {
      compileGrammar(badGrammar);
      throw new Error('Expected compileGrammar to throw');
    } catch (err: any) {
      const formatted = formatCompilationError(err.message, err.location);
      expect(formatted).toMatch(/Rule\s+"Term"\s+is\s+not\s+defined/);
    }
  });
});
