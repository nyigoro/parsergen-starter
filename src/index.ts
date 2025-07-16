// src/index.ts

export { compileGrammar, type CompiledGrammar } from './grammar/index.js';
export { createLexer, type LexerConfig, type Token } from './lexer/index.js';
export {
  parseInput,
  createParser,
  parseMultiple,
  parseStream,
  parseWithTimeout,
  parseWithRecovery,
  validateSyntax,
  type ParseResult,
  type ParseError,
} from './parser/index.js';

export {
  formatError,
  formatLocation,
  createASTNode,
  traverseAST,
  highlightSnippet,
  type ASTNode,
  type Location,
  type ErrorFormatter,
} from './utils/index.js';
