// src/index.ts
// ============================================
// 🌐 ParserGen Main API Surface (Public Entry)
// ============================================

// 🧠 Grammar Compilation
export {
  compileGrammar,
  type CompiledGrammar,
} from './grammar/index';

// 🔤 Lexer and Tokenization
export {
  createLexer,
  type LexerConfig,
  type Token,
} from './lexer/index';

// 📥 Parsing and Input Handling
export {
  parseInput,
  parseMultiple,
  parseStream,
  parseWithTimeout,
  validateSyntax,
  parseWithAdvancedRecovery,
  createParser,
  StreamingParser,
  PerformanceParser,
  type ParseResult,
  type ParseError,
} from './parser/index';

// 🧾 Utilities and AST Helpers
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
