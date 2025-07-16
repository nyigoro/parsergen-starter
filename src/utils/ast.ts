import type { Location } from './types.js';

export interface ASTNode {
  type: string;
  value?: any;
  children?: ASTNode[];
  location?: Location;
  // Optional metadata for debugging/tooling
  metadata?: Record<string, any>;
}

// Enhanced type for more flexible traversal
export type ASTVisitor<T = void> = (node: ASTNode, parent?: ASTNode, path?: string[]) => T;

export function createASTNode(
  type: string,
  value?: any,
  children: ASTNode[] = [],
  location?: ASTNode['location'],
  metadata?: Record<string, any>
): ASTNode {
  const node: ASTNode = { type, value, children, location };
  if (metadata) node.metadata = metadata;
  return node;
}

// Enhanced traversal with more control
export function traverseAST(
  node: ASTNode, 
  visit: (node: ASTNode, parent?: ASTNode, path?: string[]) => void,
  parent?: ASTNode,
  path: string[] = []
): void {
  visit(node, parent, path);
  if (node.children) {
    node.children.forEach((child, index) => 
      traverseAST(child, visit, node, [...path, `children[${index}]`])
    );
  }
}

// Pre-order traversal (visits node before children)
export function traversePreOrder<T>(
  node: ASTNode,
  visit: (node: ASTNode, parent?: ASTNode, path?: string[]) => T,
  parent?: ASTNode,
  path: string[] = []
): T[] {
  const results: T[] = [];
  const result = visit(node, parent, path);
  results.push(result);
  
  if (node.children) {
    node.children.forEach((child, index) => {
      const childResults = traversePreOrder(child, visit, node, [...path, `children[${index}]`]);
      results.push(...childResults);
    });
  }
  
  return results;
}

// Post-order traversal (visits children before node)
export function traversePostOrder<T>(
  node: ASTNode,
  visit: (node: ASTNode, parent?: ASTNode, path?: string[]) => T,
  parent?: ASTNode,
  path: string[] = []
): T[] {
  const results: T[] = [];
  
  if (node.children) {
    node.children.forEach((child, index) => {
      const childResults = traversePostOrder(child, visit, node, [...path, `children[${index}]`]);
      results.push(...childResults);
    });
  }
  
  const result = visit(node, parent, path);
  results.push(result);
  
  return results;
}

// Find nodes by type
export function findNodesByType(node: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = [];
  traverseAST(node, (current) => {
    if (current.type === type) {
      results.push(current);
    }
  });
  return results;
}

// Find first node by predicate
export function findNode(node: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode | null {
  if (predicate(node)) return node;
  
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  
  return null;
}

// Transform AST (immutable)
export function transformAST(
  node: ASTNode,
  transformer: (node: ASTNode, parent?: ASTNode) => ASTNode,
  parent?: ASTNode
): ASTNode {
  const transformedChildren = node.children?.map(child => 
    transformAST(child, transformer, node)
  );
  
  const transformedNode: ASTNode = {
    ...node,
    children: transformedChildren
  };
  
  return transformer(transformedNode, parent);
}

// Serialize AST to JSON with optional filtering
export function serializeAST(
  node: ASTNode,
  filter?: (node: ASTNode) => boolean,
  depth: number = 0,
  maxDepth: number = Infinity
): any {
  if (depth > maxDepth) return null;
  if (filter && !filter(node)) return null;
  
  const serialized: any = {
    type: node.type,
    ...(node.value !== undefined && { value: node.value }),
    ...(node.location && { location: node.location }),
    ...(node.metadata && { metadata: node.metadata })
  };
  
  if (node.children && node.children.length > 0) {
    serialized.children = node.children
      .map(child => serializeAST(child, filter, depth + 1, maxDepth))
      .filter(child => child !== null);
  }
  
  return serialized;
}

// Pretty print AST for debugging
export function printAST(node: ASTNode, indent: string = '', isLast: boolean = true): string {
  const lines: string[] = [];
  const prefix = indent + (isLast ? '└── ' : '├── ');
  
  let nodeStr = `${prefix}${node.type}`;
  if (node.value !== undefined) {
    nodeStr += `: ${JSON.stringify(node.value)}`;
  }
  if (node.location) {
    nodeStr += ` (${node.location.start.line}:${node.location.start.column})`;
  }
  
  lines.push(nodeStr);
  
  if (node.children) {
    const newIndent = indent + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children!.length - 1;
      lines.push(printAST(child, newIndent, childIsLast));
    });
  }
  
  return lines.join('\n');
}

// Calculate AST statistics
export function getASTStats(node: ASTNode): {
  totalNodes: number;
  maxDepth: number;
  nodeTypes: Record<string, number>;
  leafNodes: number;
} {
  const stats = {
    totalNodes: 0,
    maxDepth: 0,
    nodeTypes: {} as Record<string, number>,
    leafNodes: 0
  };
  
  function collect(current: ASTNode, depth: number = 0) {
    stats.totalNodes++;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    stats.nodeTypes[current.type] = (stats.nodeTypes[current.type] || 0) + 1;
    
    if (!current.children || current.children.length === 0) {
      stats.leafNodes++;
    } else {
      current.children.forEach(child => collect(child, depth + 1));
    }
  }
  
  collect(node);
  return stats;
}