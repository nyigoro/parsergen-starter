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

export function extractImports(source: string, options: ImportExtractionOptions = {}): string[] {
  const parser = options.parser ?? null;
  if (!parser) return collectImportsWithLexer(source);

  const result = parseWithPanicRecovery<LuminaProgram>(parser, source, {
    syncTokenTypes: luminaSyncTokenTypes,
    syncKeywordValues: importSyncKeywords,
    lexer: (input: string): Iterable<LuminaToken> => importLexer.reset(input),
  });
  const payload = (result.result as { result?: unknown } | undefined)?.result ?? result.result;
  const imports = collectImportsFromProgram(payload);
  if (imports) return imports;

  return collectImportsWithLexer(source);
}
