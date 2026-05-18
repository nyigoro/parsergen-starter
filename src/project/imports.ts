import { type CompiledGrammar } from '../grammar/index.js';
import { type LuminaProgram } from '../lumina/ast.js';
import { createLuminaLexer, luminaSyncTokenTypes, type LuminaToken } from '../lumina/lexer.js';
import { parseWithPanicRecovery } from './panic.js';

export type ImportExtractionOptions = {
  parser?: CompiledGrammar<unknown> | null;
  grammarPath?: string;
  grammarSource?: string;
};

const importLexer = createLuminaLexer();
const importSyncKeywords = [
  'import',
  'type',
  'struct',
  'enum',
  'fn',
  'component',
  'let',
  'return',
  'if',
  'else',
  'for',
  'while',
  'match',
  'extern',
  'pub',
];

function collectImportsFromProgram(program: unknown): string[] | null {
  if (!program || typeof program !== 'object') return null;
  const body = (program as { body?: unknown[] }).body;
  if (!Array.isArray(body)) return null;
  const imports: string[] = [];
  for (const stmt of body) {
    const node = stmt as { type?: string; source?: { value?: string } };
    if (node.type !== 'Import') continue;
    const source = node.source?.value;
    if (typeof source === 'string') imports.push(source);
  }
  return imports;
}

function collectImportsWithLexer(source: string): string[] {
  const tokens = Array.from(importLexer.reset(source)).filter(
    (token) => token.kind !== 'whitespace' && token.kind !== 'comment' && token.kind !== 'newline'
  );
  const imports: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind !== 'keyword' || token.keyword !== 'import') continue;

    for (let j = i + 1; j < tokens.length; j += 1) {
      const next = tokens[j];
      if (next.kind === 'keyword' && next.keyword === 'import') break;
      if (next.type === 'semicolon') break;
      if (next.kind === 'string') {
        imports.push(next.value);
        break;
      }
    }
  }

  return imports;
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function readStringLiteral(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  let value = '';
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      const next = source[index + 1];
      if (next !== undefined) value += next;
      index += 2;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
    index += 1;
  }
  return null;
}

function skipComment(source: string, start: number): number {
  if (source.startsWith('//', start)) {
    const newline = source.indexOf('\n', start + 2);
    return newline === -1 ? source.length : newline + 1;
  }
  if (source.startsWith('/*', start)) {
    const close = source.indexOf('*/', start + 2);
    return close === -1 ? source.length : close + 2;
  }
  return start;
}

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function isImportKeywordAt(source: string, index: number): boolean {
  return (
    source.startsWith('import', index) &&
    !isIdentifierChar(source[index - 1]) &&
    !isIdentifierChar(source[index + 'import'.length])
  );
}

function collectImportsWithScanner(source: string): string[] {
  const imports: string[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipString(source, index);
      continue;
    }
    if (source.startsWith('//', index) || source.startsWith('/*', index)) {
      index = skipComment(source, index);
      continue;
    }
    if (!isImportKeywordAt(source, index)) {
      index += 1;
      continue;
    }

    index += 'import'.length;
    while (index < source.length) {
      const next = source[index];
      if (next === '"' || next === "'") {
        const literal = readStringLiteral(source, index);
        if (literal) {
          imports.push(literal.value);
          index = literal.end;
        } else {
          index = source.length;
        }
        break;
      }
      if (source.startsWith('//', index) || source.startsWith('/*', index)) {
        index = skipComment(source, index);
        continue;
      }
      if (isImportKeywordAt(source, index)) break;
      index += 1;
    }
  }

  return imports;
}

export function extractImports(source: string, options: ImportExtractionOptions = {}): string[] {
  const parser = options.parser ?? null;
  if (!parser) {
    try {
      return collectImportsWithLexer(source);
    } catch {
      return collectImportsWithScanner(source);
    }
  }

  try {
    const result = parseWithPanicRecovery<LuminaProgram>(parser, source, {
      syncTokenTypes: luminaSyncTokenTypes,
      syncKeywordValues: importSyncKeywords,
      lexer: (input: string): Iterable<LuminaToken> => importLexer.reset(input),
    });
    const payload = (result.result as { result?: unknown } | undefined)?.result ?? result.result;
    const imports = collectImportsFromProgram(payload);
    if (imports) return imports;
  } catch {
    // Fall through to tolerant scanning below. Import discovery must not fail
    // just because another language feature is newer than the lightweight lexer.
  }

  try {
    return collectImportsWithLexer(source);
  } catch {
    return collectImportsWithScanner(source);
  }
}
