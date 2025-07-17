import { Parser } from 'peggy';
import moo from 'moo';

interface CompiledGrammar {
    parse: Parser['parse'];
    source: string;
    options: CompileOptions;
}
interface CompileOptions {
    allowedStartRules?: string[];
    cache?: boolean;
    dependencies?: Record<string, any>;
    exportVar?: string;
    format?: 'bare' | 'commonjs' | 'es' | 'globals' | 'umd';
    grammarSource?: string;
    header?: string | string[];
    optimize?: 'speed' | 'size';
    output?: 'parser' | 'source';
    plugins?: any[];
    trace?: boolean;
}
/**
 * Compile a PEG grammar string into a parser
 */
declare function compileGrammar(grammar: string, options?: CompileOptions): CompiledGrammar;

interface Token {
    type: string;
    value: string;
    text: string;
    offset: number;
    lineBreaks: number;
    line: number;
    col: number;
}
interface LexerConfig {
    [key: string]: moo.Rules | moo.Rule | RegExp | string;
}
/**
 * Create a lexer using Moo
 */
declare function createLexer(config: LexerConfig): moo.Lexer;

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

interface ASTNode {
    type: string;
    value?: any;
    children?: ASTNode[];
    location?: Location;
    metadata?: Record<string, any>;
}
declare function createASTNode(type: string, value?: any, children?: ASTNode[], location?: ASTNode['location'], metadata?: Record<string, any>): ASTNode;
declare function traverseAST(node: ASTNode, visit: (node: ASTNode, parent?: ASTNode, path?: string[]) => void, parent?: ASTNode, path?: string[]): void;

/**
 * Highlight the source input with a caret (^) and optional colorization
 */
declare function highlightSnippet(input: string, location: Location, useColor?: boolean): string;

interface ParseResult<T = any> {
    result: T;
    success: true;
}
interface ParseError {
    success: false;
    error: string;
    location?: Location;
    expected?: string[];
    found?: string;
    stack?: string;
    input?: string;
    snippet?: string;
}
interface ParseOptions {
    grammarSource?: string;
    startRule?: string;
    tracer?: any;
    [key: string]: any;
}
/**
 * Parse input using a compiled grammar
 */
declare function parseInput<T = any>(grammar: CompiledGrammar, input: string, options?: ParseOptions): ParseResult<T> | ParseError;
/**
 * Create a parser function from a compiled grammar
 */
declare function createParser(grammar: {
    parse: (input: string, options?: any) => any;
}): (input: string) => any;
/**
 * Enhanced error recovery with multiple strategies
 */
declare function parseWithAdvancedRecovery<T = any>(grammar: CompiledGrammar, input: string, options?: ParseOptions): {
    result?: T;
    errors: ParseError[];
    recoveryStrategy?: string;
};
/**
 * Batch parse multiple inputs
 */
declare function parseMultiple<T = any>(grammar: CompiledGrammar, inputs: string[], options?: ParseOptions): Array<ParseResult<T> | ParseError>;
/**
 * Parse stream of inputs
 */
declare function parseStream<T = any>(grammar: CompiledGrammar, inputs: AsyncIterable<string>, options?: ParseOptions): Promise<Array<ParseResult<T> | ParseError>>;
/**
 * Parse with timeout
 */
declare function parseWithTimeout<T = any>(grammar: CompiledGrammar, input: string, timeoutMs: number, options?: ParseOptions): Promise<ParseResult<T> | ParseError>;
/**
 * Validate input syntax without generating AST
 */
declare function validateSyntax(grammar: CompiledGrammar, input: string, options?: ParseOptions): {
    valid: boolean;
    error?: ParseError;
};
interface ParseMetrics {
    duration: number;
    inputLength: number;
    memoryUsage?: number;
    cacheHits?: number;
    cacheMisses?: number;
}
interface ParseResultWithMetrics<T = any> extends ParseResult<T> {
    metrics: ParseMetrics;
}
interface ParseErrorWithMetrics extends ParseError {
    metrics: ParseMetrics;
}
/**
 * Performance-aware parser with metrics
 */
declare class PerformanceParser<T = any> {
    private enableCache;
    private grammar;
    private cache;
    private metrics;
    constructor(grammar: CompiledGrammar, enableCache?: boolean);
    parse(input: string, options?: ParseOptions): ParseResultWithMetrics<T> | ParseErrorWithMetrics;
    private getCacheKey;
    private updateMetrics;
    getMetrics(): {
        cacheHits: number;
        cacheMisses: number;
        totalParseTime: number;
        averageParseTime: number;
        parseCount: number;
    };
    clearCache(): void;
    getCacheSize(): number;
}
interface StreamingOptions extends ParseOptions {
    chunkSize?: number;
    delimiter?: string;
    bufferSize?: number;
    onProgress?: (processed: number, total: number) => void;
    onChunk?: (result: ParseResult<any> | ParseError, chunk: string) => void;
}
interface StreamingResult<T = any> {
    results: Array<ParseResult<T> | ParseError>;
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    duration: number;
}
/**
 * Streaming parser for large inputs with chunking support
 */
declare class StreamingParser<T = any> {
    private grammar;
    private buffer;
    private processed;
    private results;
    constructor(grammar: CompiledGrammar);
    parseStream(input: ReadableStream<string> | AsyncIterable<string>, options?: StreamingOptions): Promise<StreamingResult<T>>;
    private processChunk;
    private getReader;
    private reset;
    getProgress(): {
        processed: number;
        buffered: number;
    };
}

export { type ASTNode, type CompiledGrammar, type ErrorFormatter, type LexerConfig, type Location, type ParseError, type ParseResult, PerformanceParser, StreamingParser, type Token, compileGrammar, createASTNode, createLexer, createParser, formatError, formatLocation, highlightSnippet, parseInput, parseMultiple, parseStream, parseWithAdvancedRecovery, parseWithTimeout, traverseAST, validateSyntax };
