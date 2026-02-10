import { type CompiledGrammar } from '../grammar/index.js';
import { type Location } from '../utils/index.js';
import { parseInput, type ParseError, type ParseResult, type Diagnostic } from '../parser/index.js';
import { type LuminaToken } from '../lumina/lexer.js';

export interface PanicRecoveryOptions {
  syncTokenTypes?: string[];
  maxErrors?: number;
  lexer?: (input: string) => Iterable<LuminaToken>;
}

function toDiagnostic(error: ParseError): Diagnostic {
  const location: Location = error.location ?? {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
  return {
    severity: 'error',
    message: error.error,
    location,
    code: 'PARSE_ERROR',
    source: 'parsergen',
  };
}

function replaceRangePreserveNewlines(input: string, start: number, end: number): string {
  const slice = input.slice(start, end);
  const replacement = slice.replace(/[^\r\n]/g, ' ');
  return input.slice(0, start) + replacement + input.slice(end);
}

function findSyncOffsetWithLexer(tokens: Iterable<LuminaToken>, startOffset: number, syncTypes: string[]): number | null {
  for (const token of tokens) {
    if (token.offset >= startOffset && syncTypes.includes(token.type)) {
      return token.offset + token.value.length;
    }
  }
  return null;
}

function findSyncOffsetByScan(input: string, startOffset: number, syncChars: string[]): number | null {
  for (let i = startOffset; i < input.length; i++) {
    if (syncChars.includes(input[i])) {
      return i + 1;
    }
  }
  return null;
}

export function parseWithPanicRecovery<T = unknown>(
  parser: CompiledGrammar<unknown>,
  input: string,
  options: PanicRecoveryOptions = {}
): { result?: ParseResult<T> | ParseError; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const maxErrors = options.maxErrors ?? 25;
  const syncTokenTypes = options.syncTokenTypes ?? ['semicolon', 'rbrace'];
  const syncChars = [';', '}'];
  let working = input;

  for (let i = 0; i < maxErrors; i++) {
    const result = parseInput(parser, working) as ParseResult<T> | ParseError;
    if (result && typeof result === 'object' && 'success' in result && result.success === false) {
      diagnostics.push(toDiagnostic(result));
      const offset = result.location?.start.offset ?? 0;
      let nextOffset: number | null = null;
      if (options.lexer) {
        nextOffset = findSyncOffsetWithLexer(options.lexer(working), offset, syncTokenTypes);
      }
      if (nextOffset === null) {
        nextOffset = findSyncOffsetByScan(working, offset, syncChars);
      }
      if (nextOffset === null || nextOffset <= offset) {
        return { diagnostics };
      }
      working = replaceRangePreserveNewlines(working, offset, nextOffset);
    } else {
      return { result, diagnostics };
    }
  }

  return { diagnostics };
}
