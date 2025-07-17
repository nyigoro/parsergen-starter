import * as calculator from '../src/grammar/calculator';
import { evaluate } from '../src/evaluate';

test("parses simple expression", () => {
  const input = "2 + 3 * 4";
  const ast = calculator.parse(input);
  
  // Test that the AST structure is correct
  expect(ast).toMatchObject({
    type: "BinaryExpression",
    operator: "+",
    left: { type: "NumberLiteral", value: 2 },
    right: {
      type: "BinaryExpression",
      operator: "*",
      left: { type: "NumberLiteral", value: 3 },
      right: { type: "NumberLiteral", value: 4 }
    }
  });
  
  // Test that evaluation gives correct result
  const result = evaluate(ast);
  expect(result).toBe(14);
});