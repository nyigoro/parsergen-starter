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
declare function createParser<T = any>(grammar: CompiledGrammar, defaultOptions?: ParseOptions): (input: string, options?: ParseOptions) => ParseError | ParseResult<T>;
/**
 * Parse with automatic error recovery
 */
declare function parseWithRecovery<T = any>(grammar: CompiledGrammar, input: string, options?: ParseOptions): {
    result?: T;
    errors: ParseError[];
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

export { type ASTNode, type CompiledGrammar, type ErrorFormatter, type LexerConfig, type Location, type ParseError, type ParseResult, type Token, compileGrammar, createASTNode, createLexer, createParser, formatError, formatLocation, highlightSnippet, parseInput, parseMultiple, parseStream, parseWithRecovery, parseWithTimeout, traverseAST, validateSyntax };
