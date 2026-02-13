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
  type LexerRule,
  type LexerState,
  type Preprocessor,
  type PreprocessorContext,
  type LanguageSpec,
  type ContextRule,
  type LexerPlugin,
  type TokenContext,
  type ErrorRecoveryConfig,
  type SourceLocation,
  LexerError,
  type ProfileReport,
  type TokenPattern,
  type PatternRule,
  type PatternMatch,
  type LexerConfig,
  type Token,
  TokenStream,
  LanguageDetector,
  TokenTree,
  UniversalLexer,
  LanguageSpecBuilder,
  LanguageRegistry,
  TokenAnalyzer,
  IndentationPlugin,
  ErrorRecoveryStrategy,
  LexerProfiler,
} from './lexer/index';

// 📥 Parsing and Input Handling
export {
  parseInput,
  parseWithSemanticAnalysis,
  parseMultiple,
  parseStream,
  parseWithTimeout,
  validateSyntax,
  parseWithAdvancedRecovery,
  createParser,
  ASTWalker,
  ASTTransformer,
  SymbolTable,
  DiagnosticCollector,
  LanguageServer,
  REPL,
  StreamingParser,
  ParserUtils,
  PerformanceParser,
  ASTNodeFactory,
  type ParseError,
  type ParseResult,
  type SourceMapGenerator
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

// Project / Lumina tooling
export {
  ProjectContext,
  DependencyGraph,
  type SourceDocument,
} from './project/context';
export { extractImports } from './project/imports';
export { parseWithPanicRecovery, type PanicRecoveryOptions } from './project/panic';
export { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from './lumina/lexer';
export { analyzeLumina, SymbolTable as LuminaSymbolTable } from './lumina/semantic';
export { lowerLumina } from './lumina/lower';
export { generateJS } from './lumina/codegen';
export { generateJSFromAst } from './lumina/codegen-js';
export type { IRNode } from './lumina/ir';
export { optimizeIR } from './lumina/optimize';
export { irToDot } from './lumina/ir-dot';
export { parseLumina, parseLuminaTyped, LuminaSyntaxError, type LuminaParseOptions } from './lumina/parser';
export { normalizeDiagnostic, type DiagnosticNormalized } from './lumina/diagnostics-util';
export {
  type Type,
  type TypeScheme,
  type PrimitiveName,
  freshTypeVar,
  resetTypeVarCounter,
  prune,
  occursIn,
  unify,
  freeTypeVars,
  generalize
} from './lumina/types';
export { inferProgram } from './lumina/hm-infer';
export { monomorphize, collectInstantiations, specializeFunction, rewriteCallSites } from './lumina/monomorphize';
