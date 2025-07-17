type ASTNode =
  | { type: "NumberLiteral"; value: number }
  | {
      type: "BinaryExpression";
      operator: string;
      left: ASTNode;
      right: ASTNode;
    };

export function evaluate(node: ASTNode): number {
  switch (node.type) {
    case "NumberLiteral":
      return node.value;

    case "BinaryExpression": {
      const left = evaluate(node.left);
      const right = evaluate(node.right);

      switch (node.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        default:
          throw new Error(`Unknown operator: ${node.operator}`);
      }
    }

    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}
