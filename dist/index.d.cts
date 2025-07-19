import { LocationRange, ParserBuildOptions } from 'peggy';

interface Plugin {
    use: (config: {
        rules: unknown[];
    }, options: Record<string, unknown>) => void;
    [key: string]: unknown;
}
interface AnalysisResult {
    errors: string[];
    warnings: string[];
}
interface CompiledGrammar<ASTNode = unknown> {
    parse: (input: string, options?: ParserBuildOptions) => ASTNode;
    source: string;
    options: CompileOptions;
    analyze?: (ast: ASTNode) => AnalysisResult;
}
interface CompileOptions {
    allowedStartRules?: string[];
    cache?: boolean;
    dependencies?: Record<string, unknown>;
    exportVar?: string;
    format?: 'bare' | 'commonjs' | 'es' | 'globals' | 'umd';
    grammarSource?: string | LocationRange;
    header?: string | string[];
    optimize?: 'speed' | 'size';
    output?: 'parser' | 'source';
    plugins?: Plugin[];
    trace?: boolean;
}
declare function compileGrammar<ASTNode = unknown>(grammar: string, options?: CompileOptions, analyzer?: (ast: ASTNode) => AnalysisResult): CompiledGrammar<ASTNode>;

interface Token {
    type: string;
    value: string;
    text: string;
    offset: number;
    lineBreaks: number;
    line: number;
    col: number;
    endOffset: number;
    endLine: number;
    endCol: number;
    sourceFile?: string;
    metadata?: Record<string, unknown>;
}
interface LexerRule {
    pattern: string | RegExp;
    keywords?: Record<string, string[]>;
    lineBreaks?: boolean;
    push?: string;
    pop?: number;
    value?: (text: string) => string;
    transform?: (token: Token) => Token;
}
interface LexerConfig {
    [tokenType: string]: LexerRule | string | RegExp;
}
interface LexerState {
    [stateName: string]: LexerConfig;
}
interface Preprocessor {
    name: string;
    process(input: string, context: PreprocessorContext): string;
}
interface PreprocessorContext {
    sourceFile?: string;
    includePaths?: string[];
    defines?: Map<string, string>;
}
interface LanguageSpec {
    name: string;
    version?: string;
    states?: LexerState;
    config?: LexerConfig;
    caseSensitive?: boolean;
    ignoreTokens?: string[];
    tokenPrecedence?: string[];
    contextRules?: ContextRule[];
    plugins?: LexerPlugin[];
    preprocessors?: Preprocessor[];
    errorRecovery?: ErrorRecoveryConfig;
}
interface ContextRule {
    condition: (tokens: Token[], currentIndex: number) => boolean;
    action: 'transform' | 'filter' | 'merge';
    transform?: (token: Token) => Token;
    mergeWith?: 'next' | 'previous';
}
interface LexerPlugin {
    name: string;
    version: string;
    beforeTokenize?: (input: string) => string;
    afterTokenize?: (tokens: Token[]) => Token[];
    transformToken?: (token: Token, context: TokenContext) => Token;
    validateSpec?: (spec: LanguageSpec) => boolean;
}
interface TokenContext {
    previousTokens: Token[];
    nextTokens: Token[];
    currentIndex: number;
    sourceFile?: string;
}
interface ErrorRecoveryConfig {
    strategy: 'skip' | 'insert' | 'replace' | 'none';
    maxAttempts: number;
    syncTokens: string[];
}
interface SourceLocation {
    line: number;
    col: number;
    offset: number;
    endLine: number;
    endCol: number;
    endOffset: number;
    sourceFile?: string;
}
declare class LexerError extends Error {
    line: number;
    col: number;
    offset: number;
    sourceFile?: string;
    contextLine?: string;
    suggestion?: string;
    constructor(message: string, loc: SourceLocation, contextLine?: string, suggestion?: string);
    toString(): string;
}
declare class ErrorRecoveryStrategy {
    static skipToNext(tokenStream: TokenStream, expectedTypes: string[]): Token | null;
    static insertMissing(tokenType: string, position: SourceLocation): Token;
}
declare class LexerProfiler {
    private startTime;
    private tokenCount;
    private errorCount;
    startProfiling(): void;
    recordToken(): void;
    recordError(): void;
    getReport(): ProfileReport;
}
interface ProfileReport {
    duration: number;
    tokenCount: number;
    tokensPerSecond: number;
    errorCount: number;
    errorRate: number;
}
interface TokenPattern {
    name: string;
    rules: PatternRule[];
}
interface PatternRule {
    type: 'exact' | 'optional' | 'oneOrMore' | 'zeroOrMore' | 'choice';
    tokenType: string;
    choices?: PatternRule[];
}
interface PatternMatch {
    tokens: Token[];
    startPosition: number;
    endPosition: number;
}
declare class TokenStream {
    private tokens;
    private position;
    private sourceFile?;
    private ignoredTypes;
    private bookmarks;
    private profiler?;
    constructor(tokens: Token[], sourceFile?: string, ignoredTypes?: string[], profiler?: LexerProfiler);
    peek(offset?: number): Token | null;
    next(): Token | null;
    previous(): Token | null;
    hasNext(): boolean;
    bookmark(name: string): void;
    restoreBookmark(name: string): boolean;
    clearBookmark(name: string): void;
    matchPattern(pattern: TokenPattern): PatternMatch | null;
    private matchRule;
    matchTypes(...types: string[]): boolean;
    consumeType(type: string): Token | null;
    expectType(type: string): Token;
    recover(expectedTypes: string[]): Token | null;
    getAllTokens(): Token[];
    getVisibleTokens(): Token[];
    reset(): void;
    getPosition(): number;
    setPosition(pos: number): void;
    slice(start: number, end?: number): Token[];
    toJSON(): string;
    static fromJSON(jsonString: string): TokenStream;
}
declare class LanguageDetector {
}
declare class TokenTree {
    token: Token;
    children: TokenTree[];
    parent?: TokenTree;
    constructor(token: Token, parent?: TokenTree);
    addChild(child: TokenTree): void;
    findByType(type: string): TokenTree[];
    getDepth(): number;
    toJSON(): object;
}
declare class UniversalLexer {
    private lexer;
    private spec;
    private sourceFile?;
    private profiler;
    private plugins;
    private preprocessors;
    constructor(spec: LanguageSpec, sourceFile?: string);
    private convertConfig;
    private convertStates;
    tokenize(input: string): TokenStream;
    tokenizeAsync(stream: AsyncIterable<string>): Promise<TokenStream>;
    private performTokenization;
    private isLexerRule;
    private findRule;
    private enhanceToken;
    private applyContextRules;
    private mergeTokens;
    private applyTokenPrecedence;
    getProfileReport(): ProfileReport;
}
declare class LanguageSpecBuilder {
}
declare class LanguageRegistry {
}
declare class TokenAnalyzer {
    static buildTokenTree(_tokens: Token[], _openTypes?: string[], _closeTypes?: string[]): TokenTree | null;
}
declare class IndentationPlugin implements LexerPlugin {
    name: string;
    version: string;
    afterTokenize(tokens: Token[]): Token[];
}

interface Position {
    line: number;
    column: number;
    offset: number;
}
interface Location {
    start: Position;
    end: Position;
}
interface ErrorFormatter {
    (message: string, location?: Location): string;
}

declare function formatLocation(location: Location): string;
declare function formatError(error: ParseError): string;

interface ASTNode$1 {
    type: string;
    value?: unknown;
    children?: ASTNode$1[];
    location?: Location;
    metadata?: Record<string, unknown>;
}
declare function createASTNode(type: string, value?: unknown, children?: ASTNode$1[], location?: ASTNode$1['location'], metadata?: Record<string, unknown>): ASTNode$1;
declare function traverseAST(node: ASTNode$1, visit: (node: ASTNode$1, parent?: ASTNode$1, path?: string[]) => void, parent?: ASTNode$1, path?: string[]): void;

/**
 * Highlight the source input with a caret (^) and optional colorization
 */
declare function highlightSnippet(input: string, location: Location, useColor?: boolean): string;

interface ParserTracer {
    trace(event: {
        type: string;
        rule: string;
        result?: unknown;
        location: Location;
    }): void;
}
interface ParserOptions {
    grammarSource?: string;
    startRule?: string;
    tracer?: ParserTracer;
    enableSymbolTable?: boolean;
    enableDiagnostics?: boolean;
    enableOptimization?: boolean;
    peg$library?: boolean;
    [key: string]: unknown;
}
interface ASTNode {
    type: string;
    id?: string;
    location?: Location;
    children?: ASTNode[];
    value?: unknown;
    metadata?: Record<string, unknown>;
    parent?: ASTNode;
}
interface ParseResult<T = ASTNode> {
    result: T;
    success: true;
    ast?: ASTNode;
    symbols?: SymbolTable;
    diagnostics?: Diagnostic[];
}
interface ParseError {
    success: false;
    error: string;
    location?: Location;
    expected?: string[];
    found?: string | null;
    stack?: string;
    input?: string;
    snippet?: string;
    diagnostics?: Diagnostic[];
}
declare class SymbolTable {
    private scopes;
    private currentScope;
    private scopeStack;
    constructor();
    enterScope(scopeName: string): void;
    exitScope(): void;
    define(symbol: Symbol): void;
    lookup(name: string): Symbol | undefined;
    getAllSymbols(): Symbol[];
    getSymbolsInScope(scopeName: string): Symbol[];
    getCurrentScope(): string;
}
interface Symbol {
    name: string;
    type: string;
    scope: string;
    location: Location;
    value?: unknown;
    metadata?: Record<string, unknown>;
}
declare class DiagnosticCollector {
    private diagnostics;
    error(message: string, location: Location, code?: string): void;
    warning(message: string, location: Location, code?: string): void;
    info(message: string, location: Location, code?: string): void;
    hint(message: string, location: Location, code?: string): void;
    getDiagnostics(): Diagnostic[];
    addDiagnostics(newDiagnostics: Diagnostic[]): void;
    clear(): void;
    hasDiagnostics(): boolean;
    hasErrors(): boolean;
}
interface Diagnostic {
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    location: Location;
    code?: string;
    source?: string;
    relatedInformation?: DiagnosticRelatedInformation[];
}
interface DiagnosticRelatedInformation {
    location: Location;
    message: string;
}
interface ASTVisitor<T = unknown> {
    visit(node: ASTNode, _context?: unknown): T;
    visitChildren?(node: ASTNode, _context?: unknown): T | void;
}
declare class ASTWalker {
    static walk<T>(node: ASTNode, visitor: ASTVisitor<T>, context?: unknown): T;
    static walkPostOrder<T>(node: ASTNode, visitor: ASTVisitor<T>, context?: unknown): T;
}
interface ASTTransform {
    transform(node: ASTNode): ASTNode;
    shouldTransform?(node: ASTNode): boolean;
}
declare class ASTTransformer {
    private transforms;
    addTransform(transform: ASTTransform): void;
    transform(ast: ASTNode): ASTNode;
    private applyTransform;
}
declare abstract class SemanticAnalyzer {
    protected symbolTable: SymbolTable;
    protected diagnostics: DiagnosticCollector;
    protected typeChecker?: TypeChecker;
    constructor(symbolTable: SymbolTable, diagnostics: DiagnosticCollector, typeChecker?: TypeChecker);
    abstract analyze(ast: ASTNode): void;
    protected performTypeChecking(ast: ASTNode): void;
    getSymbolTable(): SymbolTable;
    getDiagnostics(): DiagnosticCollector;
    hasErrors(): boolean;
}
interface Type {
    name: string;
    isCompatibleWith(other: Type): boolean;
    toString(): string;
}
interface TypeChecker {
    check(ast: ASTNode, symbolTable: SymbolTable, diagnostics: DiagnosticCollector): void;
    getType(node: ASTNode): Type | undefined;
}
interface SourceMapGenerator {
    generateSourceMap(originalCode: string, generatedCode: string, ast: ASTNode): string;
    addMapping(generatedLine: number, generatedColumn: number, originalLine: number, originalColumn: number, sourceFile: string): void;
    clearMappings(): void;
}
declare abstract class Interpreter<T = unknown> {
    protected environment: Map<string, unknown>;
    protected callStack: string[];
    abstract interpret(ast: ASTNode): T;
    protected getVariable(name: string): unknown;
    protected setVariable(name: string, value: unknown): void;
    protected enterFunction(name: string): void;
    protected exitFunction(): void;
    protected getCurrentFunction(): string | undefined;
    getEnvironment(): Map<string, unknown>;
}
declare class ASTNodeFactory {
    private static nextId;
    static createNode(type: string, location?: Location, children?: ASTNode[], value?: unknown, metadata?: Record<string, unknown>): ASTNode;
    static createIdentifier(name: string, location?: Location): ASTNode;
    static createLiteral(value: unknown, type: string, location?: Location): ASTNode;
    static createBinaryExpression(operator: string, left: ASTNode, right: ASTNode, location?: Location): ASTNode;
    static createFunctionCall(callee: ASTNode, args: ASTNode[], location?: Location): ASTNode;
}
declare function parseWithSemanticAnalysis<T extends ASTNode>(// T extends ASTNode
grammar: CompiledGrammar, input: string, analyzerInstance?: SemanticAnalyzer, // Renamed to avoid conflict with class name
options?: ParserOptions): ParseResult<T> | ParseError;
interface LSPCapabilities {
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
interface CompletionItem {
    label: string;
    kind: 'Text' | 'Method' | 'Function' | 'Constructor' | 'Field' | 'Variable' | 'Class' | 'Interface' | 'Module' | 'Property' | 'Unit' | 'Value' | 'Enum' | 'Keyword' | 'Snippet' | 'Color' | 'File' | 'Reference';
    detail?: string;
    documentation?: string;
    insertText?: string;
    sortText?: string;
    filterText?: string;
}
declare class LanguageServer {
    private grammar;
    private symbolTable;
    private diagnosticCollector;
    private capabilities;
    constructor(grammar: CompiledGrammar, capabilities?: LSPCapabilities);
    completion(_input: string, _position: {
        line: number;
        column: number;
    }): Promise<CompletionItem[]>;
    hover(input: string, position: {
        line: number;
        column: number;
    }): Promise<string | null>;
    getDiagnosticsForInput(input: string): Promise<Diagnostic[]>;
    goToDefinition(_input: string, _position: {
        line: number;
        column: number;
    }): Promise<Location | null>;
    private getCompletionKind;
    private getWordAtPosition;
}
declare class REPL {
    private grammar;
    private interpreter?;
    private history;
    private variables;
    constructor(grammar: CompiledGrammar, interpreter?: Interpreter);
    evaluate(input: string): Promise<{
        result: unknown;
        output: string;
        error?: string;
    }>;
    getHistory(): string[];
    clearHistory(): void;
    private formatOutput;
    private formatAST;
}
declare function parseInput<T = ASTNode>(// Default T to ASTNode
grammar: CompiledGrammar, input: string, options?: ParserOptions): ParseResult<T> | ParseError;
/**
 * Create a parser function from a compiled grammar
 */
declare function createParser(grammar: {
    parse: (input: string, options?: ParserOptions) => ASTNode;
}): (input: string) => ASTNode | {
    success: boolean;
    error: string;
    input: string;
    stack: string | undefined;
};
/**
 * Enhanced error recovery with multiple strategies
 */
declare function parseWithAdvancedRecovery<T = ASTNode>(// Default T to ASTNode
grammar: CompiledGrammar, input: string, _options?: ParserOptions): {
    result?: T;
    errors: ParseError[];
    recoveryStrategy?: string;
};
declare function parseMultiple<T = ASTNode>(// Default T to ASTNode
grammar: CompiledGrammar, inputs: string[], options?: ParserOptions): Array<ParseResult<T> | ParseError>;
declare function parseStream<T = ASTNode>(// Default T to ASTNode
grammar: CompiledGrammar, stream: ReadableStream<string>, options?: ParserOptions): AsyncGenerator<ParseResult<T> | ParseError>;
declare function parseWithTimeout<T = ASTNode>(// Default T to ASTNode
grammar: CompiledGrammar, input: string, timeoutMs: number, options?: ParserOptions): Promise<ParseResult<T> | ParseError>;
declare function validateSyntax(grammar: CompiledGrammar, input: string, options?: ParserOptions): {
    valid: boolean;
    errors: string[];
};
declare class StreamingParser {
    private grammar;
    private buffer;
    private options;
    constructor(grammar: CompiledGrammar, options?: ParserOptions);
    addChunk(chunk: string): Array<ParseResult | ParseError>;
    flush(): ParseResult | ParseError | null;
}
declare class ParserUtils {
    static formatError(error: ParseError): string;
    static isParseError(result: ParseResult | ParseError): result is ParseError;
    static extractValue<T>(result: ParseResult<T> | ParseError): T | null;
}
declare class PerformanceParser {
    private grammar;
    private metrics;
    constructor(grammar: CompiledGrammar);
    parse<T = ASTNode>(input: string, options?: ParserOptions): ParseResult<T> | ParseError;
    getMetrics(): Record<string, {
        avg: number;
        min: number;
        max: number;
        count: number;
    }>;
}

export { type ASTNode$1 as ASTNode, ASTNodeFactory, ASTTransformer, ASTWalker, type CompiledGrammar, type ContextRule, DiagnosticCollector, type ErrorFormatter, type ErrorRecoveryConfig, ErrorRecoveryStrategy, IndentationPlugin, LanguageDetector, LanguageRegistry, LanguageServer, type LanguageSpec, LanguageSpecBuilder, type LexerConfig, LexerError, type LexerPlugin, LexerProfiler, type LexerRule, type LexerState, type Location, type ParseError, type ParseResult, ParserUtils, type PatternMatch, type PatternRule, PerformanceParser, type Preprocessor, type PreprocessorContext, type ProfileReport, REPL, type SourceLocation, type SourceMapGenerator, StreamingParser, SymbolTable, type Token, TokenAnalyzer, type TokenContext, type TokenPattern, TokenStream, TokenTree, UniversalLexer, compileGrammar, createASTNode, createParser, formatError, formatLocation, highlightSnippet, parseInput, parseMultiple, parseStream, parseWithAdvancedRecovery, parseWithSemanticAnalysis, parseWithTimeout, traverseAST, validateSyntax };
