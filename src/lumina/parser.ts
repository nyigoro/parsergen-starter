import { type ParserOptions, parseInput, type ParseError } from '../parser/index.js';
import { type CompiledGrammar } from '../grammar/index.js';
import { type LuminaProgram } from './ast.js';
import { type Location } from '../utils/index.js';

export interface LuminaParseOptions extends ParserOptions {
  grammarSource?: string;
  startRule?: string;
}

export class LuminaSyntaxError extends Error {
  location?: Location;
  expected?: string[];
  found?: string | null;
  input?: string;

  constructor(message: string, details: ParseError) {
    super(message);
    this.name = 'LuminaSyntaxError';
    this.location = details.location;
    this.expected = details.expected;
    this.found = details.found ?? null;
    this.input = details.input;
  }
}

export function parseLumina(
  grammar: CompiledGrammar<LuminaProgram>,
  input: string,
  options: LuminaParseOptions = {}
): LuminaProgram {
  return parseLuminaTyped<LuminaProgram>(grammar, input, options);
}

export function parseLuminaTyped<T>(
  grammar: CompiledGrammar<T>,
  input: string,
  options: LuminaParseOptions = {}
): T {
  const result = parseInput<T>(grammar as CompiledGrammar, input, options);
  if (result && typeof result === 'object' && 'success' in result && result.success) {
    return result.result;
  }
  const error = result as ParseError;
  const loc = error.location?.start;
  const source = options.grammarSource ?? 'input';
  const suffix = loc ? ` at ${source}:${loc.line}:${loc.column}` : ` at ${source}`;
  throw new LuminaSyntaxError(`[Lumina Syntax Error] ${error.error}${suffix}`, error);
}
