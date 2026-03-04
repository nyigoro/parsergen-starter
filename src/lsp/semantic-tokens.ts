import { SemanticTokensBuilder, type SemanticTokens, type SemanticTokensLegend } from 'vscode-languageserver/node';
import { createLuminaLexer } from '../lumina/lexer.js';
import type { SymbolInfo } from '../lumina/semantic.js';

export const semanticTokenTypes = [
  'keyword',
  'string',
  'number',
  'operator',
  'variable',
  'function',
  'class',
  'type',
  'comment',
] as const;

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: [...semanticTokenTypes],
  tokenModifiers: [],
};

const builtinTypes = new Set(['int', 'string', 'bool', 'void']);

function buildSymbolKindMap(symbols: SymbolInfo[]): Map<string, 'function' | 'class' | 'variable'> {
  const map = new Map<string, 'function' | 'class' | 'variable'>();
  for (const sym of symbols) {
    if (sym.kind === 'function') map.set(sym.name, 'function');
    else if (sym.kind === 'type') map.set(sym.name, 'class');
    else map.set(sym.name, 'variable');
  }
  return map;
}

export function buildSemanticTokensData(text: string, symbols: SymbolInfo[]): number[] {
  const symbolMap = buildSymbolKindMap(symbols);
  const builder = new SemanticTokensBuilder();
  const lexer = createLuminaLexer();
  lexer.reset(text);
  for (const token of lexer) {
    if (token.type === 'ws' || token.type === 'newline') continue;
    let tokenType: (typeof semanticTokenTypes)[number] | null = null;
    if (token.type === 'keyword') tokenType = 'keyword';
    else if (token.type === 'string') tokenType = 'string';
    else if (token.type === 'number') tokenType = 'number';
    else if (token.type === 'op') tokenType = 'operator';
    else if (token.type === 'comment') tokenType = 'comment';
    else if (token.type === 'identifier') {
      if (builtinTypes.has(token.text)) tokenType = 'type';
      else tokenType = symbolMap.get(token.text) ?? 'variable';
    }
    if (!tokenType) continue;
    const line = Math.max(0, (token.line ?? 1) - 1);
    const char = Math.max(0, (token.col ?? 1) - 1);
    builder.push(line, char, token.text.length, semanticTokenTypes.indexOf(tokenType), 0);
  }
  return builder.build().data;
}

export function buildSemanticTokens(text: string, symbols: SymbolInfo[]): SemanticTokens {
  return { data: buildSemanticTokensData(text, symbols) };
}
