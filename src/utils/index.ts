// utils/index.ts
// ==========================
// 📦 Utility Exports
// ==========================

export { formatError, formatLocation, formatErrorWithColors } from './format';
export { 
  createASTNode, 
  traverseAST, 
  traversePreOrder,
  traversePostOrder,
  findNodesByType,
  findNode,
  transformAST,
  serializeAST,
  printAST,
  getASTStats
} from './ast';
export { 
  highlightSnippet, 
  highlightSnippetAdvanced,
  highlightMultipleLocations,
  createSnippet,
  getLocationFromOffset,
  getOffsetFromLocation
} from './highlight';
export type { ASTNode, ASTVisitor } from './ast';
export type { Location, Position, ErrorFormatter } from './types';