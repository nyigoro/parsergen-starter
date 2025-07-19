import { CompiledGrammar } from '../grammar/index.js';
import { type Location } from '../utils/index.js';

// Assuming these types come from the PEG.js or similar parser library
export interface ParserTracer {
  trace(event: { type: string; rule: string; result?: unknown; location: Location }): void;
}

export interface ParserOptions {
  grammarSource?: string;
  startRule?: string;
  tracer?: ParserTracer;
  enableSymbolTable?: boolean;
  enableDiagnostics?: boolean;
  enableOptimization?: boolean;
  peg$library?: boolean; // This is a common PEG.js option
  [key: string]: unknown; // Allow other arbitrary options
}

// Enhanced AST Node interfaces - Added 'id' and 'parent'
export interface ASTNode {
  type: string;
  id?: string; // Unique identifier for the node
  location?: Location;
  children?: ASTNode[];
  value?: unknown;
  metadata?: Record<string, unknown>;
  parent?: ASTNode; // Reference to the parent node for easier traversal
}

export interface ParseResult<T = ASTNode> { // Default T to ASTNode
  result: T;
  success: true;
  ast?: ASTNode;
  symbols?: SymbolTable;
  diagnostics?: Diagnostic[];
}

export interface ParseError {
  success: false;
  error: string;
  location?: Location;
  expected?: string[];
  found?: string | null; // Changed to allow null
  stack?: string;
  input?: string;
  snippet?: string;
  diagnostics?: Diagnostic[];
}

// Use ParserOptions directly for parsing functions
export type ParseOptions = ParserOptions; // Alias for clarity, but essentially the same

// Symbol Table for semantic analysis
export class SymbolTable {
  private scopes: Map<string, Map<string, Symbol>> = new Map();
  private currentScope = 'global';
  private scopeStack: string[] = ['global'];

  constructor() {
    this.scopes.set('global', new Map());
  }

  enterScope(scopeName: string): void {
    this.currentScope = scopeName;
    this.scopeStack.push(scopeName);
    if (!this.scopes.has(scopeName)) {
      this.scopes.set(scopeName, new Map());
    }
  }

  exitScope(): void {
    this.scopeStack.pop();
    this.currentScope = this.scopeStack[this.scopeStack.length - 1] || 'global';
  }

  define(symbol: Symbol): void {
    const scope = this.scopes.get(this.currentScope)!;
    scope.set(symbol.name, symbol);
  }

  lookup(name: string): Symbol | undefined {
    // Search from current scope up to global
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scopeName = this.scopeStack[i];
      const scope = this.scopes.get(scopeName);
      if (scope?.has(name)) {
        return scope.get(name);
      }
    }
    return undefined;
  }

  getAllSymbols(): Symbol[] {
    const symbols: Symbol[] = [];
    for (const scope of this.scopes.values()) {
      symbols.push(...scope.values());
    }
    return symbols;
  }

  getSymbolsInScope(scopeName: string): Symbol[] {
    return Array.from(this.scopes.get(scopeName)?.values() || []);
  }

  // New getter for currentScope to avoid 'any' type assertion
  getCurrentScope(): string {
    return this.currentScope;
  }
}

export interface Symbol {
  name: string;
  type: string;
  scope: string;
  location: Location;
  value?: unknown;
  metadata?: Record<string, unknown>;
}

// Diagnostic system for better error reporting
export class DiagnosticCollector {
  private diagnostics: Diagnostic[] = [];

  error(message: string, location: Location, code?: string): void {
    this.diagnostics.push({
      severity: 'error',
      message,
      location,
      code,
      source: 'parser'
    });
  }

  warning(message: string, location: Location, code?: string): void {
    this.diagnostics.push({
      severity: 'warning',
      message,
      location,
      code,
      source: 'parser'
    });
  }

  info(message: string, location: Location, code?: string): void {
    this.diagnostics.push({
      severity: 'info',
      message,
      location,
      code,
      source: 'parser'
    });
  }

  hint(message: string, location: Location, code?: string): void {
    this.diagnostics.push({
      severity: 'hint',
      message,
      location,
      code,
      source: 'parser'
    });
  }

  getDiagnostics(): Diagnostic[] {
    return [...this.diagnostics];
  }

  addDiagnostics(newDiagnostics: Diagnostic[]): void {
    this.diagnostics.push(...newDiagnostics);
  }

  clear(): void {
    this.diagnostics = [];
  }

  hasDiagnostics(): boolean {
    return this.diagnostics.length > 0;
  }

  hasErrors(): boolean {
    return this.diagnostics.some(d => d.severity === 'error');
  }
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  location: Location;
  code?: string;
  source?: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

// AST Visitor pattern for tree traversal
export interface ASTVisitor<T = unknown> {
  visit(node: ASTNode, _context?: unknown): T; // _context marked as unused
  visitChildren?(node: ASTNode, _context?: unknown): T | void; // Adjusted return type to T | void
}

export class ASTWalker {
  static walk<T>(node: ASTNode, visitor: ASTVisitor<T>, context?: unknown): T {
    const result = visitor.visit(node, context);

    if (node.children && visitor.visitChildren) {
      const childResults: T[] = node.children.map(child => // Explicitly type childResults as T[]
        ASTWalker.walk(child, visitor, context)
      );
      // Ensure context is an object before spreading
      const newContext = typeof context === 'object' && context !== null ? context : {};
      const childrenVisitResult = visitor.visitChildren(node, { ...newContext, childResults });
      // If visitChildren returns a value, prioritize it, otherwise fall back to result
      return (childrenVisitResult !== undefined ? childrenVisitResult : result);
    }

    return result;
  }

  static walkPostOrder<T>(node: ASTNode, visitor: ASTVisitor<T>, context?: unknown): T {
    if (node.children && visitor.visitChildren) {
      const childResults: T[] = node.children.map(child => // Explicitly type childResults as T[]
        ASTWalker.walkPostOrder(child, visitor, context)
      );
      // Ensure context is an object before spreading
      const newContext = typeof context === 'object' && context !== null ? context : {};
      visitor.visitChildren(node, { ...newContext, childResults }); // visitChildren can return void here
    }

    return visitor.visit(node, context);
  }
}

// AST Transformation utilities
export interface ASTTransform {
  transform(node: ASTNode): ASTNode;
  shouldTransform?(node: ASTNode): boolean;
}

export class ASTTransformer {
  private transforms: ASTTransform[] = [];

  addTransform(transform: ASTTransform): void {
    this.transforms.push(transform);
  }

  transform(ast: ASTNode): ASTNode {
    let result = ast;

    for (const transform of this.transforms) {
      result = this.applyTransform(result, transform);
    }

    return result;
  }

  private applyTransform(node: ASTNode, transform: ASTTransform): ASTNode {
    if (transform.shouldTransform && !transform.shouldTransform(node)) {
      return node;
    }

    const transformed = transform.transform(node);

    if (transformed.children) {
      transformed.children = transformed.children.map(child =>
        this.applyTransform(child, transform)
      );
    }

    return transformed;
  }
}

// Semantic Analysis base class
export abstract class SemanticAnalyzer {
  protected symbolTable: SymbolTable;
  protected diagnostics: DiagnosticCollector;
  protected typeChecker?: TypeChecker; // Optional TypeChecker

  constructor(symbolTable: SymbolTable, diagnostics: DiagnosticCollector, typeChecker?: TypeChecker) { // Added parameters for injection
    this.symbolTable = symbolTable;
    this.diagnostics = diagnostics;
    this.typeChecker = typeChecker;
  }

  abstract analyze(ast: ASTNode): void;

  // Method to perform type checking if a typeChecker is provided
  protected performTypeChecking(ast: ASTNode): void {
    if (this.typeChecker) {
      this.typeChecker.check(ast, this.symbolTable, this.diagnostics);
    }
  }

  getSymbolTable(): SymbolTable {
    return this.symbolTable;
  }

  getDiagnostics(): Diagnostic[] {
    return this.diagnostics.getDiagnostics();
  }

  hasErrors(): boolean {
    return this.diagnostics.hasErrors();
  }
}

// New: Type System Interfaces
export interface Type {
  name: string;
  isCompatibleWith(other: Type): boolean;
  toString(): string;
}

export interface TypeChecker {
  check(ast: ASTNode, symbolTable: SymbolTable, diagnostics: DiagnosticCollector): void;
  getType(node: ASTNode): Type | undefined;
}

// New: Code Formatter Base Class
export abstract class CodeFormatter {
  protected indentLevel = 0;
  protected indentString = '  ';

  abstract format(ast: ASTNode): string;

  protected indent(): void {
    this.indentLevel++;
  }

  protected dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  protected getIndentation(): string {
    return this.indentString.repeat(this.indentLevel);
  }
}

// New: Source Map Generator Interface
export interface SourceMapGenerator {
  generateSourceMap(originalCode: string, generatedCode: string, ast: ASTNode): string;
  addMapping(generatedLine: number, generatedColumn: number, originalLine: number, originalColumn: number, sourceFile: string): void;
}


// Code Generation base class
export abstract class CodeGenerator { // Removed <T = string> and made it explicit
  protected output: string[] = []; // Changed to string[]
  protected indentLevel = 0;
  protected indentString = '  ';

  abstract generate(ast: ASTNode): string; // Changed to string

  protected indent(): void {
    this.indentLevel++;
  }

  protected dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  protected emit(code: string): void { // Changed to string
    this.output.push(code);
  }

  protected emitIndented(code: string): void {
    // No need for type assertion anymore as emit expects string
    this.emit(this.indentString.repeat(this.indentLevel) + code);
  }

  protected getOutput(): string[] { // Changed to string[]
    return [...this.output];
  }

  protected clear(): void {
    this.output = [];
    this.indentLevel = 0;
  }
}

// Interpreter base class
export abstract class Interpreter<T = unknown> {
  protected environment: Map<string, unknown> = new Map();
  protected callStack: string[] = [];

  abstract interpret(ast: ASTNode): T;

  protected getVariable(name: string): unknown {
    return this.environment.get(name);
  }

  protected setVariable(name: string, value: unknown): void {
    this.environment.set(name, value);
  }

  protected enterFunction(name: string): void {
    this.callStack.push(name);
  }

  protected exitFunction(): void {
    this.callStack.pop();
  }

  protected getCurrentFunction(): string | undefined {
    return this.callStack[this.callStack.length - 1];
  }

  getEnvironment(): Map<string, unknown> {
    return new Map(this.environment);
  }
}

// New: AST Node Factory - Updated to include id and parent
export class ASTNodeFactory {
  private static nextId = 0;

  static createNode(type: string, location?: Location, children?: ASTNode[], value?: unknown, metadata?: Record<string, unknown>): ASTNode {
    const node: ASTNode = { type, id: `node_${ASTNodeFactory.nextId++}`, location, children, value, metadata };
    if (children) {
      children.forEach(child => {
        child.parent = node; // Set parent reference
      });
    }
    return node;
  }

  static createIdentifier(name: string, location?: Location): ASTNode {
    return ASTNodeFactory.createNode('Identifier', location, undefined, name);
  }

  static createLiteral(value: unknown, type: string, location?: Location): ASTNode {
    return ASTNodeFactory.createNode('Literal', location, undefined, value, { literalType: type });
  }

  static createBinaryExpression(operator: string, left: ASTNode, right: ASTNode, location?: Location): ASTNode {
    return ASTNodeFactory.createNode('BinaryExpression', location, [left, right], operator);
  }

  static createFunctionCall(callee: ASTNode, args: ASTNode[], location?: Location): ASTNode {
    return ASTNodeFactory.createNode('FunctionCall', location, [callee, ...args]);
  }

  // Add more factory methods for common AST node types in your language
}


// Enhanced parser with compiler features
export function parseWithSemanticAnalysis<T extends ASTNode>( // T extends ASTNode
  grammar: CompiledGrammar,
  input: string,
  analyzerInstance?: SemanticAnalyzer, // Renamed to avoid conflict with class name
  options: ParserOptions = {}
): ParseResult<T> | ParseError {
  const enhancedOptions: ParserOptions = {
    ...options,
    enableSymbolTable: true, // Ensure parser attempts to build symbol table if it supports it
    enableDiagnostics: true // Ensure parser attempts to collect diagnostics if it supports it
  };

  const diagnosticsCollector = new DiagnosticCollector();
  let symbolTable: SymbolTable | undefined;

  try {
    // Attempt to parse the input. The result is expected to be the AST.
    const ast: T = grammar.parse(input, enhancedOptions) as T; // Explicitly cast to T

    // Set parent pointers after initial AST creation
    ASTWalker.walk(ast, {
      visit: (node: ASTNode, _context?: unknown) => {
        if (node.children) {
          node.children.forEach(child => {
            child.parent = node;
          });
        }
        return node;
      }
    });


    // If a semantic analyzer is provided, run it
    if (analyzerInstance) {
      // The analyzer will populate its own symbol table and diagnostics
      analyzerInstance.analyze(ast);
      symbolTable = analyzerInstance.getSymbolTable();
      diagnosticsCollector.addDiagnostics(analyzerInstance.getDiagnostics());

      if (analyzerInstance.hasErrors()) {
        return {
          success: false,
          error: 'Semantic analysis failed',
          diagnostics: diagnosticsCollector.getDiagnostics(),
          input
        };
      }
    } else {
      // If no analyzer, and options suggest symbol table/diagnostics, create them.
      // Note: Without an analyzer or parser support, these will be empty.
      if (enhancedOptions.enableSymbolTable) {
        symbolTable = new SymbolTable();
      }
      if (enhancedOptions.enableDiagnostics) {
        // Diagnostics would typically come from the parser itself if no analyzer.
        // For this simplified example, they remain empty if no analyzer.
      }
    }

    return {
      result: ast,
      success: true,
      ast: ast,
      symbols: symbolTable,
      diagnostics: diagnosticsCollector.getDiagnostics()
    };
  } catch (error: unknown) {
    const parseError = createParseError(error, input, options);
    if (parseError.diagnostics) { // If createParseError added diagnostics
      diagnosticsCollector.addDiagnostics(parseError.diagnostics);
    } else { // Or create a basic error diagnostic
      diagnosticsCollector.error(parseError.error, parseError.location || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }, 'parse-error');
    }

    return {
      success: false,
      error: parseError.error,
      location: parseError.location,
      expected: parseError.expected,
      found: parseError.found,
      stack: parseError.stack,
      input: parseError.input,
      snippet: parseError.snippet,
      diagnostics: diagnosticsCollector.getDiagnostics()
    };
  }
}

// Language Server Protocol support
export interface LSPCapabilities {
  textDocument?: {
    completion?: boolean;
    hover?: boolean;
    signatureHelp?: boolean;
    definition?: boolean;
    references?: boolean;
    documentHighlight?: boolean;
    documentSymbol?: boolean;
    codeAction?: boolean;
    codeLens?: boolean;
    formatting?: boolean;
    rangeFormatting?: boolean;
    onTypeFormatting?: boolean;
    rename?: boolean;
    publishDiagnostics?: boolean;
    foldingRange?: boolean;
    selectionRange?: boolean;
    semanticTokens?: boolean;
  };
}

export interface CompletionItem {
  label: string;
  kind: 'Text' | 'Method' | 'Function' | 'Constructor' | 'Field' | 'Variable' | 'Class' | 'Interface' | 'Module' | 'Property' | 'Unit' | 'Value' | 'Enum' | 'Keyword' | 'Snippet' | 'Color' | 'File' | 'Reference';
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export class LanguageServer {
  private grammar: CompiledGrammar;
  private symbolTable: SymbolTable;
  private diagnosticCollector: DiagnosticCollector; // Renamed to avoid conflict
  private capabilities: LSPCapabilities;

  constructor(grammar: CompiledGrammar, capabilities: LSPCapabilities = {}) {
    this.grammar = grammar;
    this.symbolTable = new SymbolTable();
    this.diagnosticCollector = new DiagnosticCollector(); // Initialize
    this.capabilities = capabilities;
  }

  async completion(_input: string, _position: { line: number; column: number }): Promise<CompletionItem[]> {
    const symbols = this.symbolTable.getAllSymbols();
    const completions: CompletionItem[] = [];

    // Add symbol-based completions
    for (const symbol of symbols) {
      completions.push({
        label: symbol.name,
        kind: this.getCompletionKind(symbol.type),
        detail: symbol.type,
        documentation: symbol.metadata?.description as string
      });
    }

    // Add keyword completions (would be language-specific)
    const keywords = ['if', 'else', 'while', 'for', 'function', 'return', 'var', 'let', 'const'];
    for (const keyword of keywords) {
      completions.push({
        label: keyword,
        kind: 'Keyword',
        insertText: keyword
      });
    }

    return completions;
  }

  async hover(input: string, position: { line: number; column: number }): Promise<string | null> {
    // Find symbol at position and return hover information
    const wordAtPosition = this.getWordAtPosition(input, position);
    if (!wordAtPosition) return null;

    const symbol = this.symbolTable.lookup(wordAtPosition);
    if (!symbol) return null;

    return `**${symbol.name}**: ${symbol.type}\n\n${symbol.metadata?.description || ''}`;
  }

  async getDiagnosticsForInput(input: string): Promise<Diagnostic[]> { // Renamed method
    this.diagnosticCollector.clear(); // Clear diagnostics for a fresh run
    this.symbolTable = new SymbolTable(); // Clear/reset symbol table for a fresh run

    try {
      // Define local classes to improve type inference clarity
      class TempSemanticAnalyzer extends SemanticAnalyzer {
        constructor(symbolTable: SymbolTable, diagnostics: DiagnosticCollector) {
          super(symbolTable, diagnostics);
        }
        analyze(ast: ASTNode): void {
          class TempASTVisitor implements ASTVisitor<void> {
            constructor(private _symbolTableRef: SymbolTable, private _diagnosticsRef: DiagnosticCollector) {}
            visit(node: ASTNode, _context?: unknown): void { // _context marked as unused
              if (node.type === 'Identifier' && typeof node.value === 'string') {
                const symbolName = node.value;
                if (!this._symbolTableRef.lookup(symbolName)) {
                  this._diagnosticsRef.warning(`Undefined identifier: '${symbolName}'`, node.location || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }, 'undefined-var');
                }
              }
              // Example: define variables when encountered
              if (node.type === 'VariableDeclaration' && node.children && node.children[0]?.type === 'Identifier') {
                const varName = node.children[0].value as string;
                this._symbolTableRef.define({
                  name: varName,
                  type: 'variable',
                  // Accessing currentScope via the new public getter
                  scope: this._symbolTableRef.getCurrentScope(),
                  location: node.children[0].location || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
                  metadata: { description: `Declared variable '${varName}'` }
                });
              }
            }
            visitChildren(_node: ASTNode, _context?: unknown): void { // _node and _context marked as unused, return type void
                // No specific action needed for children in this simple example
                // Return type is void as per ASTVisitor interface for this use case.
            }
          }
          const visitor = new TempASTVisitor(this.symbolTable, this.diagnostics); // Pass TempSemanticAnalyzer's instances
          ASTWalker.walk(ast, visitor);
        }
      }

      const tempAnalyzer = new TempSemanticAnalyzer(this.symbolTable, this.diagnosticCollector); // Pass LanguageServer's instances

      const parseResult = parseWithSemanticAnalysis(this.grammar, input, tempAnalyzer, {
        enableDiagnostics: true,
        enableSymbolTable: true,
      });

      // Update the LanguageServer's symbol table and diagnostics from the parse result
      if (parseResult.success) {
        if (parseResult.symbols) {
          this.symbolTable = parseResult.symbols; // Replace with the analyzer's populated symbol table
        }
        this.diagnosticCollector.addDiagnostics(parseResult.diagnostics || []);
      } else {
        // If it's a parse error, add its diagnostics
        this.diagnosticCollector.addDiagnostics(parseResult.diagnostics || []);
        // If there are no specific diagnostics, add a generic error
        if (!parseResult.diagnostics || parseResult.diagnostics.length === 0) {
           const errorLocation = parseResult.location || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
           this.diagnosticCollector.error(parseResult.error, errorLocation, 'parse-error');
        }
      }
      return this.diagnosticCollector.getDiagnostics();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorLocation = (error as { location?: Location }).location;

      this.diagnosticCollector.error(errorMessage, errorLocation || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }, 'internal-error');
      return this.diagnosticCollector.getDiagnostics();
    }
  }

  // New: Go-to-Definition stub
  async goToDefinition(_input: string, _position: { line: number; column: number }): Promise<Location | null> {
    // This method would typically parse the input, find the AST node at the given position,
    // resolve the symbol, and return the location of its definition from the symbol table.
    // For now, it's a stub.
    // Removed console.log to address ESLint warning
    return null;
  }

  private getCompletionKind(type: string): CompletionItem['kind'] {
    switch (type.toLowerCase()) {
      case 'function': return 'Function';
      case 'variable': return 'Variable';
      case 'class': return 'Class';
      case 'interface': return 'Interface';
      case 'module': return 'Module';
      case 'property': return 'Property';
      case 'method': return 'Method';
      default: return 'Text';
    }
  }

  private getWordAtPosition(input: string, position: { line: number; column: number }): string | null {
    const lines = input.split('\n');
    if (position.line >= lines.length) return null;

    const line = lines[position.line];
    if (position.column >= line.length) return null;

    const wordRegex = /\b\w+\b/g;
    let match;
    while ((match = wordRegex.exec(line)) !== null) {
      if (match.index <= position.column && position.column < match.index + match[0].length) {
        return match[0];
      }
    }

    return null;
  }
}

// REPL (Read-Eval-Print Loop) implementation
export class REPL {
  private grammar: CompiledGrammar;
  private interpreter?: Interpreter;
  private history: string[] = [];
  private variables: Map<string, unknown> = new Map();

  constructor(grammar: CompiledGrammar, interpreter?: Interpreter) {
    this.grammar = grammar;
    this.interpreter = interpreter;
  }

  async evaluate(input: string): Promise<{ result: unknown; output: string; error?: string }> {
    this.history.push(input);

    try {
      // Pass options to parseWithSemanticAnalysis.
      // The REPL's interpreter will then work on the AST.
      const parseResult = parseWithSemanticAnalysis(this.grammar, input, undefined, {
        enableSymbolTable: true,
        enableDiagnostics: true,
      });

      if (!parseResult.success) {
        return {
          result: null,
          output: '',
          error: ParserUtils.formatError(parseResult) // Use ParserUtils to format error
        };
      }

      if (this.interpreter) {
        // Ensure parseResult.result is ASTNode for interpreter
        const result = this.interpreter.interpret(parseResult.result as ASTNode);
        return {
          result,
          output: this.formatOutput(result),
        };
      } else {
        return {
          result: parseResult.result,
          output: this.formatAST(parseResult.result as ASTNode),
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        result: null,
        output: '',
        error: errorMessage
      };
    }
  }

  getHistory(): string[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  private formatOutput(value: unknown): string {
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  private formatAST(ast: ASTNode): string {
    return JSON.stringify(ast, null, 2);
  }
}

// Export enhanced parsing utilities
export function parseInput<T = ASTNode>( // Default T to ASTNode
  grammar: CompiledGrammar,
  input: string,
  options: ParserOptions = {}
): ParseResult<T> | ParseError {
  try {
    const result: T = grammar.parse(input, options) as T; // Explicitly cast to T
    return {
      result,
      success: true,
      ast: result as ASTNode, // result is the AST
      symbols: options.enableSymbolTable ? new SymbolTable() : undefined, // SymbolTable is created here, but needs to be populated by an analyzer
      diagnostics: options.enableDiagnostics ? [] : undefined // Diagnostics are empty here, would be populated by analyzer or parser if it supports it
    };
  }
  catch (error: unknown) {
    return createParseError(error, input, options);
  }
}

/**
 * Create a parser function from a compiled grammar
 */
export function createParser(grammar: { parse: (input: string, options?: ParserOptions) => ASTNode }) { // Changed options type and return type
  return (input: string) => {
    try {
      const result: ASTNode = grammar.parse(input) as ASTNode; // Explicitly cast to ASTNode
      return result; // Return the AST directly
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        input,
        stack: err instanceof Error ? err.stack : undefined,
      };
    }
  };
}

/**
 * Enhanced error recovery with multiple strategies
 */
export function parseWithAdvancedRecovery<T = ASTNode>( // Default T to ASTNode
  grammar: CompiledGrammar,
  input: string,
  _options: ParserOptions = {} // _options marked as unused
): { result?: T; errors: ParseError[]; recoveryStrategy?: string } {
  const errors: ParseError[] = [];

  // Try original parse first
  try {
    const result: T = grammar.parse(input, _options) as T; // Explicitly cast to T
    return { result, errors, recoveryStrategy: 'original' };
  } catch (error: unknown) {
    const parseError = createParseError(error, input, _options);
    errors.push(parseError);

    const lines = input.split('\n');
    if (!parseError.location) {
      return { errors };
    }

    const errorLine = parseError.location.start.line;

    // Strategy 1: Remove the error line
    if (errorLine > 0 && errorLine <= lines.length) {
      try {
        const recoveredInput = [
          ...lines.slice(0, errorLine - 1),
          ...lines.slice(errorLine)
        ].join('\n');

        const result: T = grammar.parse(recoveredInput, _options) as T; // Explicitly cast to T
        return { result, errors, recoveryStrategy: 'removeErrorLine' };
      } catch (_recoveryError: unknown) { // _recoveryError marked as unused
        errors.push(createParseError(_recoveryError, input, _options));
      }
    }

    // Strategy 2: Remove everything from error to end
    if (errorLine > 1) {
      try {
        const recoveredInput = lines.slice(0, errorLine - 1).join('\n');
        if (recoveredInput.trim()) {
          const result: T = grammar.parse(recoveredInput, _options) as T; // Explicitly cast to T
          return { result, errors, recoveryStrategy: 'removeFromError' };
        }
      } catch (_recoveryError: unknown) { // _recoveryError marked as unused
        errors.push(createParseError(_recoveryError, input, _options));
      }
    }

    // Strategy 3: Insert common missing tokens
    if (parseError.expected) {
      const commonTokens = [';', '}', ')', ']', '"', "'"];
      for (const token of commonTokens) {
        if (parseError.expected.includes(token)) {
          try {
            const errorPos = parseError.location.start.offset;
            const recoveredInput =
              input.slice(0, errorPos) + token + input.slice(errorPos);

            const result: T = grammar.parse(recoveredInput, _options) as T; // Explicitly cast to T
            return { result, errors, recoveryStrategy: 'insertMissing' };
          } catch (_recoveryError: unknown) { // _recoveryError marked as unused
            // Continue to next token
          }
        }
      }
    }

    return { errors };
  }
}

/**
 * Create a detailed parse error
 */
function createParseError(
  error: unknown,
  input: string,
  _options: ParserOptions // _options marked as unused
): ParseError {
  const errorObj = error as {
    message?: string;
    location?: Location;
    expected?: Array<{ description?: string; text?: string; toString(): string }>;
    found?: unknown;
    stack?: string;
  };

  const parseError: ParseError = {
    success: false,
    error: errorObj.message || 'Parse error',
    input
  };

  if (errorObj.location) {
    parseError.location = {
      start: {
        line: errorObj.location.start.line,
        column: errorObj.location.start.column,
        offset: errorObj.location.start.offset
      },
      end: {
        line: errorObj.location.end.line,
        column: errorObj.location.end.column,
        offset: errorObj.location.end.offset
      }
    };
  }

  if (errorObj.expected) {
    parseError.expected = errorObj.expected.map((exp) =>
      exp.description || exp.text || exp.toString()
    );
  }

  if (errorObj.found !== undefined && errorObj.found !== null) { // Added null check
    parseError.found = errorObj.found.toString();
  } else {
    parseError.found = null; // Explicitly set to null if undefined or null
  }

  parseError.stack = errorObj.stack;

  if (parseError.location) {
    parseError.snippet = generateErrorSnippet(input, parseError.location);
  }

  return parseError;
}

/**
 * Generate a code snippet showing the error location
 */
function generateErrorSnippet(input: string, location: Location): string {
  const lines = input.split('\n');
  const lineNum = location.start.line;
  const colNum = location.start.column;

  if (lineNum > lines.length) {
    return '';
  }

  const line = lines[lineNum - 1];

  const contextLines: string[] = [];

  if (lineNum > 1) {
    contextLines.push(`${lineNum - 1}: ${lines[lineNum - 2]}`);
  }

  contextLines.push(`${lineNum}: ${line}`);
  contextLines.push(`${' '.repeat(lineNum.toString().length)}: ${' '.repeat(colNum - 1)}^`);

  if (lineNum < lines.length) {
    contextLines.push(`${lineNum + 1}: ${lines[lineNum]}`);
  }

  return contextLines.join('\n');
}

// Stub implementations for the missing functions from original-parser
// These would need to be implemented based on your actual requirements
export function parseMultiple<T = ASTNode>( // Default T to ASTNode
  grammar: CompiledGrammar,
  inputs: string[],
  options: ParserOptions = {}
): Array<ParseResult<T> | ParseError> {
  return inputs.map(input => parseInput<T>(grammar, input, options));
}

export function parseStream<T = ASTNode>( // Default T to ASTNode
  grammar: CompiledGrammar,
  stream: ReadableStream<string>,
  options: ParserOptions = {}
): AsyncGenerator<ParseResult<T> | ParseError> {
  // This would need to be implemented based on your streaming requirements
  throw new Error('parseStream not implemented - requires actual stream processing logic');
}

export function parseWithTimeout<T = ASTNode>( // Default T to ASTNode
  grammar: CompiledGrammar,
  input: string,
  timeoutMs: number,
  options: ParserOptions = {}
): Promise<ParseResult<T> | ParseError> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Parse timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = parseInput<T>(grammar, input, options);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

export function validateSyntax(
  grammar: CompiledGrammar,
  input: string,
  options: ParserOptions = {}
): { valid: boolean; errors: string[] } {
  const result = parseInput(grammar, input, options);
  if (result.success) {
    return { valid: true, errors: [] };
  } else {
    // Collect errors from diagnostics if available, otherwise use the main error
    const errors = result.diagnostics?.map(d => d.message) || [result.error];
    return { valid: false, errors: errors };
  }
}

export class StreamingParser {
  private grammar: CompiledGrammar;
  private buffer = '';
  private options: ParserOptions;

  constructor(grammar: CompiledGrammar, options: ParserOptions = {}) {
    this.grammar = grammar;
    this.options = options;
  }

  addChunk(chunk: string): Array<ParseResult | ParseError> {
    this.buffer += chunk;
    const results: Array<ParseResult | ParseError> = [];

    // Simple line-based parsing - would need more sophisticated logic
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        results.push(parseInput(this.grammar, line, this.options));
      }
    }

    return results;
  }

  flush(): ParseResult | ParseError | null {
    if (this.buffer.trim()) {
      const result = parseInput(this.grammar, this.buffer, this.options);
      this.buffer = '';
      return result;
    }
    return null;
  }
}

export class ParserUtils {
  static formatError(error: ParseError): string {
    let formatted = `Parse Error: ${error.error}`;

    if (error.location) {
      formatted += ` at line ${error.location.start.line}, column ${error.location.start.column}`;
    }

    if (error.expected && error.expected.length > 0) {
      formatted += `\nExpected: ${error.expected.join(', ')}`;
    }

    if (error.found !== null && error.found !== undefined) { // Check for null explicitly
      formatted += `\nFound: ${error.found}`;
    }

    if (error.snippet) {
      formatted += `\n\n${error.snippet}`;
    }

    return formatted;
  }

  static isParseError(result: ParseResult | ParseError): result is ParseError {
    return !result.success;
  }

  static extractValue<T>(result: ParseResult<T> | ParseError): T | null {
    return result.success ? result.result : null;
  }
}

// Performance monitoring wrapper
export class PerformanceParser {
  private grammar: CompiledGrammar;
  private metrics: Map<string, number[]> = new Map();

  constructor(grammar: CompiledGrammar) {
    this.grammar = grammar;
  }

  parse<T = ASTNode>(input: string, options: ParserOptions = {}): ParseResult<T> | ParseError {
    const start = performance.now();
    const result = parseInput<T>(this.grammar, input, options);
    const end = performance.now();

    const duration = end - start;
    const inputSize = input.length;
    const key = `${inputSize}`;

    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    this.metrics.get(key)!.push(duration);

    return result;
  }

  getMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};

    for (const [key, times] of this.metrics) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      result[key] = { avg, min, max, count: times.length };
    }

    return result;
  }
}

// New: Compiler Class
export class Compiler {
  private grammar: CompiledGrammar;
  private semanticAnalyzer: SemanticAnalyzer;
  private codeGenerator: CodeGenerator;
  private typeChecker?: TypeChecker; // Optional type checker

  constructor(
    grammar: CompiledGrammar,
    // semanticAnalyzer: SemanticAnalyzer, // Original parameter
    // codeGenerator: CodeGenerator, // Original parameter
    // typeChecker?: TypeChecker // Original parameter
    // Accept instances for initialization
    initialSymbolTable: SymbolTable,
    initialDiagnosticCollector: DiagnosticCollector,
    initialCodeGenerator: CodeGenerator,
    initialTypeChecker?: TypeChecker
  ) {
    this.grammar = grammar;
    this.typeChecker = initialTypeChecker;
    // Instantiate SemanticAnalyzer with provided instances
    this.semanticAnalyzer = new (SemanticAnalyzer as new (s: SymbolTable, d: DiagnosticCollector, t?: TypeChecker) => SemanticAnalyzer)(
      initialSymbolTable,
      initialDiagnosticCollector,
      initialTypeChecker
    );
    this.codeGenerator = initialCodeGenerator;
  }

  compile(input: string, options: ParserOptions = {}): { compiledCode?: string; diagnostics: Diagnostic[]; errors: string[] } {
    // Clear analyzer's diagnostics and symbol table for a fresh compilation run
    this.semanticAnalyzer.getDiagnostics().length = 0; // Clear existing diagnostics
    // Re-initialize symbol table if needed, or pass a new one to analyzer's constructor
    // For simplicity, we'll assume the analyzer manages its own state or gets a fresh one.
    // If the analyzer needs to be completely reset, it might need a reset method or be re-instantiated.

    const parseResult = parseWithSemanticAnalysis(this.grammar, input, this.semanticAnalyzer, options);
    const diagnostics: Diagnostic[] = [];
    const errors: string[] = [];

    if (!parseResult.success) {
      errors.push(parseResult.error);
      if (parseResult.diagnostics) {
        diagnostics.push(...parseResult.diagnostics);
      }
      return { diagnostics, errors };
    }

    const ast = parseResult.result;

    // Perform semantic analysis (including type checking if configured)
    this.semanticAnalyzer.analyze(ast);
    diagnostics.push(...this.semanticAnalyzer.getDiagnostics());

    if (this.semanticAnalyzer.hasErrors()) {
      errors.push('Semantic analysis failed.');
      return { diagnostics, errors };
    }

    // Generate code
    try {
      const compiledCode = this.codeGenerator.generate(ast);
      return { compiledCode, diagnostics, errors };
    } catch (codeGenError: unknown) {
      const errorMessage = codeGenError instanceof Error ? codeGenError.message : 'Unknown code generation error';
      errors.push(`Code generation failed: ${errorMessage}`);
      return { diagnostics, errors };
    }
  }
}


export async function parseTextFile(
  grammar: CompiledGrammar,
  filePath: string,
  _options: ParserOptions = {} // Marked as unused
): Promise<ParseResult | ParseError> {
  // This would need actual file system access
  throw new Error('parseTextFile not implemented - requires file system access');
}

// Optional default export with all utilities
export default {
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
  ASTNodeFactory, // Export the new factory
  CodeFormatter, // Export the new base class
  SourceMapGenerator, // Export the new interface (as a type, not value)
  Compiler // Export the new Compiler class
};
