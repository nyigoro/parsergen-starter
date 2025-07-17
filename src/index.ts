// src/index.ts
// ==========================
// 🌐 Main Entry - ParserGen API
// ==========================

export { compileGrammar, type CompiledGrammar } from './grammar/index';

export { createLexer, type LexerConfig, type Token } from './lexer/index';

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
} from './parser/index';

export {
  formatError,
  formatLocation,
  createASTNode,
  traverseAST,
  highlightSnippet,
  type ASTNode,
  type Location,
  type ErrorFormatter,
} from './utils/index';
