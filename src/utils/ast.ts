export interface ASTNode {
  type: string;
  value?: any;
  children?: ASTNode[];
  location?: import('./types.js').Location;
}

export function createASTNode(
  type: string,
  value?: any,
  children: ASTNode[] = [],
  location?: ASTNode['location']
): ASTNode {
  return { type, value, children, location };
}

export function traverseAST(node: ASTNode, visit: (node: ASTNode) => void) {
  visit(node);
  if (node.children) {
    node.children.forEach(child => traverseAST(child, visit));
  }
}
