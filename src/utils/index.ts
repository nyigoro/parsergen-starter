// utils/index.ts
// ==========================
// 📦 Utility Exports
// ==========================

export {
  formatError,
  formatLocation,
  formatErrorWithColors,
  formatMultipleErrors,
  formatCompilationError,
  formatAnyError,
  formatAnyErrors,
  wrapCompilationError,
  formatErrorWithSuggestions,
  formatSuccessMessage,
  formatWarningMessage,
  formatInfoMessage,
  getErrorSuggestions,
  getErrorContext,
  formatDebugError,
  isGrammarError,
  toParseError,
} from './format.ts';
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
} from './ast.ts';

export {
  highlightSnippet,
  highlightSnippetAdvanced,
  highlightMultipleLocations,
  createSnippet,
  getLocationFromOffset,
  getOffsetFromLocation
} from './highlight.ts';

export type { ASTNode, ASTVisitor } from './ast.ts';
export type { Location, Position, ErrorFormatter } from './types.ts';
