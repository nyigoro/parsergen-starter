import { CompiledGrammar } from '../grammar/index.js';
import { type Location } from '../utils/index';

export interface ParseResult<T = any> {
  result: T;
  success: true;
}
export interface ParseError {
  success: false;
  error: string;
  location?: Location;
  expected?: string[];
  found?: string;
  stack?: string;
  input?: string;
  snippet?: string;
}

export interface ParseOptions {
  grammarSource?: string;
  startRule?: string;
  tracer?: any;
  [key: string]: any;
}

/**
 * Parse input using a compiled grammar
 */
export function parseInput<T = any>(
  grammar: CompiledGrammar,
  input: string,
  options: ParseOptions = {}
): ParseResult<T> | ParseError {
  try {
    const result = grammar.parse(input, options);
    return {
      result,
      success: true
    };
  } catch (error: any) {
    return createParseError(error, input, options);
  }
}

/**
 * Create a parser function from a compiled grammar
 */

export function createParser(grammar: { parse: (input: string, options?: any) => any }) {
  return (input: string) => {
    try {
      const result = grammar.parse(input);
      return result;
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
export function parseWithAdvancedRecovery<T = any>(
  grammar: CompiledGrammar,
  input: string,
  options: ParseOptions = {}
): { result?: T; errors: ParseError[]; recoveryStrategy?: string } {
  const errors: ParseError[] = [];
  const recoveryStrategies = [
    'original',
    'removeErrorLine',
    'removeFromError',
    'skipToNextStatement',
    'insertMissing'
  ];

  // Try original parse first
  try {
    const result = grammar.parse(input, options);
    return { result, errors, recoveryStrategy: 'original' };
  } catch (error: any) {
    const parseError = createParseError(error, input, options);
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
        
        const result = grammar.parse(recoveredInput, options);
        return { result, errors, recoveryStrategy: 'removeErrorLine' };
      } catch (recoveryError: any) {
        errors.push(createParseError(recoveryError, input, options));
      }
    }

    // Strategy 2: Remove everything from error to end
    if (errorLine > 1) {
      try {
        const recoveredInput = lines.slice(0, errorLine - 1).join('\n');
        if (recoveredInput.trim()) {
          const result = grammar.parse(recoveredInput, options);
          return { result, errors, recoveryStrategy: 'removeFromError' };
        }
      } catch (recoveryError: any) {
        errors.push(createParseError(recoveryError, input, options));
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
            
            const result = grammar.parse(recoveredInput, options);
            return { result, errors, recoveryStrategy: 'insertMissing' };
          } catch (recoveryError: any) {
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
  error: any,
  input: string,
  options: ParseOptions
): ParseError {
  const parseError: ParseError = {
    success: false,
    error: error.message || 'Parse error',
    input
  };

  if (error.location) {
    parseError.location = {
      start: {
        line: error.location.start.line,
        column: error.location.start.column,
        offset: error.location.start.offset
      },
      end: {
        line: error.location.end.line,
        column: error.location.end.column,
        offset: error.location.end.offset
      }
    };
  }

  if (error.expected) {
    parseError.expected = error.expected.map((exp: any) =>
      exp.description || exp.text || exp.toString()
    );
  }

  if (error.found !== undefined) {
    parseError.found = error.found.toString();
  }

  parseError.stack = error.stack;

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

/**
 * Batch parse multiple inputs
 */
export function parseMultiple<T = any>(
  grammar: CompiledGrammar,
  inputs: string[],
  options: ParseOptions = {}
): Array<ParseResult<T> | ParseError> {
  return inputs.map(input => parseInput<T>(grammar, input, options));
}

/**
 * Parse stream of inputs
 */
export async function parseStream<T = any>(
  grammar: CompiledGrammar,
  inputs: AsyncIterable<string>,
  options: ParseOptions = {}
): Promise<Array<ParseResult<T> | ParseError>> {
  const results: Array<ParseResult<T> | ParseError> = [];

  for await (const input of inputs) {
    const result = parseInput<T>(grammar, input, options);
    results.push(result);
  }

  return results;
}

/**
 * Parse with timeout
 */
export function parseWithTimeout<T = any>(
  grammar: CompiledGrammar,
  input: string,
  timeoutMs: number,
  options: ParseOptions = {}
): Promise<ParseResult<T> | ParseError> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Parse timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = parseInput<T>(grammar, input, options);
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Validate input syntax without generating AST
 */
export function validateSyntax(
  grammar: CompiledGrammar,
  input: string,
  options: ParseOptions = {}
): { valid: boolean; error?: ParseError } {
  try {
    grammar.parse(input, options);
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: createParseError(error, input, options)
    };
  }
}

/**
 * Parser utilities
 */
export class ParserUtils {
  static isSuccess<T>(result: ParseResult<T> | ParseError): result is ParseResult<T> {
    return result.success === true;
  }

  static isError<T>(result: ParseResult<T> | ParseError): result is ParseError {
    return result.success === false;
  }

  static unwrap<T>(result: ParseResult<T> | ParseError): T {
    if (ParserUtils.isError(result)) {
      const error = result as ParseError;
      throw new Error(
        `[ParseError]: ${error.error}\n${error.snippet ?? ''}\nExpected: ${error.expected?.join(', ') ?? 'unknown'}`
      );
    }
    return result.result;
  }
}

export interface ParseMetrics {
  duration: number;
  inputLength: number;
  memoryUsage?: number;
  cacheHits?: number;
  cacheMisses?: number;
}

export interface ParseResultWithMetrics<T = any> extends ParseResult<T> {
  metrics: ParseMetrics;
}

export interface ParseErrorWithMetrics extends ParseError {
  metrics: ParseMetrics;
}

/**
 * Performance-aware parser with metrics
 */
export class PerformanceParser<T = any> {
  private grammar: CompiledGrammar;
  private cache = new Map<string, ParseResult<T>>();
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalParseTime: 0,
    averageParseTime: 0,
    parseCount: 0
  };

  constructor(grammar: CompiledGrammar, private enableCache = true) {
    this.grammar = grammar;
  }

  parse(input: string, options: ParseOptions = {}): ParseResultWithMetrics<T> | ParseErrorWithMetrics {
    const startTime = performance.now();
    const cacheKey = this.enableCache ? this.getCacheKey(input, options) : null;

    // Check cache first
    if (cacheKey && this.cache.has(cacheKey)) {
      this.metrics.cacheHits++;
      const cached = this.cache.get(cacheKey)!;
      return {
        ...cached,
        metrics: {
          duration: performance.now() - startTime,
          inputLength: input.length,
          cacheHits: this.metrics.cacheHits,
          cacheMisses: this.metrics.cacheMisses
        }
      };
    }

    this.metrics.cacheMisses++;
    
    try {
      const result = this.grammar.parse(input, options);
      const duration = performance.now() - startTime;
      
      const parseResult: ParseResult<T> = {
        result,
        success: true
      };

      // Update cache
      if (cacheKey) {
        this.cache.set(cacheKey, parseResult);
      }

      // Update metrics
      this.updateMetrics(duration);

      return {
        ...parseResult,
        metrics: {
          duration,
          inputLength: input.length,
          cacheHits: this.metrics.cacheHits,
          cacheMisses: this.metrics.cacheMisses
        }
      };
    } catch (error: any) {
      const duration = performance.now() - startTime;
      this.updateMetrics(duration);

      const parseError = createParseError(error, input, options);
      return {
        ...parseError,
        metrics: {
          duration,
          inputLength: input.length,
          cacheHits: this.metrics.cacheHits,
          cacheMisses: this.metrics.cacheMisses
        }
      };
    }
  }

  private getCacheKey(input: string, options: ParseOptions): string {
    return `${input}:${JSON.stringify(options)}`;
  }

  private updateMetrics(duration: number): void {
    this.metrics.parseCount++;
    this.metrics.totalParseTime += duration;
    this.metrics.averageParseTime = this.metrics.totalParseTime / this.metrics.parseCount;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export interface StreamingOptions extends ParseOptions {
  chunkSize?: number;
  delimiter?: string;
  bufferSize?: number;
  onProgress?: (processed: number, total: number) => void;
  onChunk?: (result: ParseResult<any> | ParseError, chunk: string) => void;
}

export interface StreamingResult<T = any> {
  results: Array<ParseResult<T> | ParseError>;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  duration: number;
}

/**
 * Streaming parser for large inputs with chunking support
 */
export class StreamingParser<T = any> {
  private grammar: CompiledGrammar;
  private buffer = '';
  private processed = 0;
  private results: Array<ParseResult<T> | ParseError> = [];

  constructor(grammar: CompiledGrammar) {
    this.grammar = grammar;
  }

  async parseStream(
    input: ReadableStream<string> | AsyncIterable<string>,
    options: StreamingOptions = {}
  ): Promise<StreamingResult<T>> {
    const startTime = performance.now();
    const {
      chunkSize = 1024,
      delimiter = '\n',
      bufferSize = 10000,
      onProgress,
      onChunk
    } = options;

    this.reset();

    try {
      const reader = this.getReader(input);
      
      for await (const chunk of reader) {
        this.buffer += chunk;
        
        // Process complete chunks
        while (this.buffer.length > 0) {
          const delimiterIndex = this.buffer.indexOf(delimiter);
          
          if (delimiterIndex === -1) {
            // No complete chunk yet, check buffer size
            if (this.buffer.length > bufferSize) {
              // Force process the buffer to avoid memory issues
              await this.processChunk(this.buffer, options);
              this.buffer = '';
            }
            break;
          }
          
          const completeChunk = this.buffer.slice(0, delimiterIndex);
          this.buffer = this.buffer.slice(delimiterIndex + delimiter.length);
          
          await this.processChunk(completeChunk, options);
          
          if (onProgress) {
            onProgress(this.processed, this.processed + this.buffer.length);
          }
        }
      }
      
      // Process remaining buffer
      if (this.buffer.trim()) {
        await this.processChunk(this.buffer, options);
      }
      
    } catch (error) {
      console.error('Streaming parse error:', error);
    }

    const duration = performance.now() - startTime;
    const successCount = this.results.filter(r => r.success).length;
    const errorCount = this.results.length - successCount;

    return {
      results: this.results,
      totalProcessed: this.processed,
      successCount,
      errorCount,
      duration
    };
  }

  private async processChunk(chunk: string, options: StreamingOptions): Promise<void> {
    if (!chunk.trim()) return;

    const result = parseInput<T>(this.grammar, chunk, options);
    this.results.push(result);
    this.processed++;

    if (options.onChunk) {
      options.onChunk(result, chunk);
    }
  }

  private async *getReader(
    input: ReadableStream<string> | AsyncIterable<string>
  ): AsyncIterable<string> {
    if ('getReader' in input) {
      const reader = input.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      yield* input;
    }
  }

  private reset(): void {
    this.buffer = '';
    this.processed = 0;
    this.results = [];
  }

  getProgress(): { processed: number; buffered: number } {
    return {
      processed: this.processed,
      buffered: this.buffer.length
    };
  }
}

/**
 * Utility function for parsing large text files
 */
export async function parseTextFile<T = any>(
  grammar: CompiledGrammar,
  file: File,
  options: StreamingOptions = {}
): Promise<StreamingResult<T>> {
  const stream = file.stream().pipeThrough(new TextDecoderStream());
  const parser = new StreamingParser<T>(grammar);
  
  return parser.parseStream(stream, {
    ...options,
    onProgress: (processed, total) => {
      console.log(`Parsed ${processed} chunks`);
      options.onProgress?.(processed, total);
    }
  });
}

// Optional default export
export default {
  parseInput,
  parseMultiple,
  parseStream,
  parseWithTimeout,
  validateSyntax,
  parseWithAdvancedRecovery,
  createParser,
  StreamingParser,
  PerformanceParser,
  ParserUtils
};
