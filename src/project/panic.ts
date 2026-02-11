import { type CompiledGrammar, wrapGrammarWithExpectations } from '../grammar/index.js';
import { type Location } from '../utils/index.js';
import { parseInput, type ParseError, type ParseResult, type Diagnostic } from '../parser/index.js';
import { type LuminaToken } from '../lumina/lexer.js';

export interface PanicRecoveryOptions {
  syncTokenTypes?: string[];
  syncKeywordValues?: string[];
  maxErrors?: number;
  lexer?: (input: string) => Iterable<LuminaToken>;
}

function toDiagnostic(error: ParseError): Diagnostic {
  const location: Location = error.location ?? {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
  const expected = error.expected && error.expected.length > 0 ? ` Expected: ${error.expected.join(', ')}` : '';
  const found = error.found !== undefined && error.found !== null ? ` Found: "${error.found}"` : '';
  return {
    severity: 'error',
    message: `${error.error}${expected}${found}`,
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

function findSyncOffsetWithLexer(
  tokens: Iterable<LuminaToken>,
  startOffset: number,
  syncTypes: string[],
  syncKeywordValues: string[]
): number | null {
  for (const token of tokens) {
    if (token.offset < startOffset) continue;
    if (syncTypes.includes(token.type)) {
      return token.offset + token.text.length;
    }
    if (token.type === 'keyword' && syncKeywordValues.includes(token.text)) {
      return token.offset + token.text.length;
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

function collectErrorNodes(node: unknown, diagnostics: Diagnostic[], getExpected?: () => string[] | undefined) {
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if ('type' in value && (value as { type?: string }).type === 'ErrorNode') {
      const errorNode = value as { message?: string; location?: Location; expected?: string[] };
      const expectedList =
        errorNode.expected && errorNode.expected.length > 0
          ? errorNode.expected
          : getExpected?.();
      const expected = expectedList && expectedList.length > 0
        ? ` Expected: ${expectedList.join(', ')}`
        : '';
      diagnostics.push({
        severity: 'error',
        message: `${errorNode.message ?? 'Invalid syntax'}${expected}`,
        location:
          errorNode.location ?? {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 1, column: 1, offset: 0 },
          },
        code: 'PARSE_ERROR',
        source: 'parsergen',
      });
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(node);
}

export function parseWithPanicRecovery<T = unknown>(
  parser: CompiledGrammar<unknown>,
  input: string,
  options: PanicRecoveryOptions = {}
): { result?: ParseResult<T> | ParseError; diagnostics: Diagnostic[] } {
  const wrappedParser =
    typeof parser.getLastExpected === 'function' ? parser : wrapGrammarWithExpectations(parser);
  const diagnostics: Diagnostic[] = [];
  const maxErrors = options.maxErrors ?? 25;
  const syncTokenTypes = options.syncTokenTypes ?? ['semicolon', 'rbrace'];
  const syncKeywordValues = options.syncKeywordValues ?? ['fn', 'struct', 'enum', 'type', 'extern', 'import', 'pub', 'return', 'if', 'while', 'match'];
  const syncChars = [';', '}'];
  let working = input;

  for (let i = 0; i < maxErrors; i++) {
    const result = parseInput(wrappedParser, working) as ParseResult<T> | ParseError;
    if (result && typeof result === 'object' && 'success' in result && result.success === false) {
      diagnostics.push(toDiagnostic(result));
      const offset = result.location?.start.offset ?? 0;
      let nextOffset: number | null = null;
      if (options.lexer) {
        nextOffset = findSyncOffsetWithLexer(options.lexer(working), offset, syncTokenTypes, syncKeywordValues);
      }
      if (nextOffset === null) {
        nextOffset = findSyncOffsetByScan(working, offset, syncChars);
      }
      if (nextOffset === null || nextOffset <= offset) {
        return { diagnostics };
      }
      working = replaceRangePreserveNewlines(working, offset, nextOffset);
    } else {
      const payload = (result as { result?: unknown })?.result ?? result;
      collectErrorNodes(payload, diagnostics, wrappedParser.getLastExpected);
      return { result, diagnostics };
    }
  }

  return { diagnostics };
}
