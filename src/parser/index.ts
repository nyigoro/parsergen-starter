import { CompiledGrammar } from '../grammar/index.js';
import { formatError, formatLocation, type Location } from '../utils/index';

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
export function createParser<T = any>(
  grammar: CompiledGrammar,
  defaultOptions: ParseOptions = {}
) {
  return (input: string, options: ParseOptions = {}) => {
    return parseInput<T>(grammar, input, { ...defaultOptions, ...options });
  };
}

/**
 * Parse with automatic error recovery
 */
export function parseWithRecovery<T = any>(
  grammar: CompiledGrammar,
  input: string,
  options: ParseOptions = {}
): { result?: T; errors: ParseError[] } {
  const errors: ParseError[] = [];

  try {
    const result = grammar.parse(input, options);
    return { result, errors };
  } catch (error: any) {
    const parseError = createParseError(error, input, options);
    errors.push(parseError);

    // Try to recover by removing problematic lines before error
    const lines = input.split('\n');
    if (parseError.location && parseError.location.start.line > 1) {
      const recoveredInput = lines.slice(0, parseError.location.start.line - 1).join('\n');
      if (recoveredInput.trim()) {
        try {
          const result = grammar.parse(recoveredInput, options);
          return { result, errors };
        } catch (recoveryError: any) {
          errors.push(createParseError(recoveryError, recoveredInput, options));
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

// Optional default export
export default {
  parseInput,
  parseMultiple,
  parseStream,
  parseWithTimeout,
  validateSyntax,
  parseWithRecovery,
  createParser,
  ParserUtils
};
