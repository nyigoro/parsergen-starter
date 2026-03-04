import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';
import { buildSemanticTokensData, semanticTokenTypes } from '../src/lsp/semantic-tokens.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

type DecodedToken = { line: number; character: number; length: number; type: string; text: string };

function offsetAt(text: string, line: number, character: number): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + character;
}

function decodeTokens(source: string, data: number[]): DecodedToken[] {
  const out: DecodedToken[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    character = data[i] === 0 ? character + data[i + 1] : data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];
    const start = offsetAt(source, line, character);
    const text = source.slice(start, start + length);
    out.push({
      line,
      character,
      length,
      type: semanticTokenTypes[typeIndex] ?? 'unknown',
      text,
    });
  }
  return out;
}

describe('LSP semantic tokens', () => {
  test('classifies keywords and numeric/string literals', () => {
    const source = [
      'fn main() {',
      '  let x = 1;',
      '  let y = "hi";',
      '  return x;',
      '}',
      '',
    ].join('\n');
    const data = buildSemanticTokensData(source, []);
    const tokens = decodeTokens(source, data);
    expect(tokens.some((token) => token.text === 'fn' && token.type === 'keyword')).toBe(true);
    expect(tokens.some((token) => token.text === '1' && token.type === 'number')).toBe(true);
    expect(tokens.some((token) => token.text === '"hi"' && token.type === 'string')).toBe(true);
  });

  test('distinguishes type names from value names using symbol index', () => {
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-semantic', 'types.lm')).toString();
    const source = [
      'struct User { id: int }',
      'fn main() {',
      '  let user = User { id: 1 };',
      '  return user;',
      '}',
      '',
    ].join('\n');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, source, 1);
    const symbols = project.getSymbols(uri)?.list() ?? [];
    const tokens = decodeTokens(source, buildSemanticTokensData(source, symbols));
    expect(tokens.some((token) => token.text === 'User' && token.type === 'class')).toBe(true);
    expect(tokens.some((token) => token.text === 'user' && token.type === 'variable')).toBe(true);
  });

  test('token stream remains stable across whitespace-only edits', () => {
    const uri = pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-semantic', 'stable.lm')).toString();
    const sourceA = [
      'fn main() {',
      '  let x = 1;',
      '  return x;',
      '}',
      '',
    ].join('\n');
    const sourceB = [
      'fn main() {',
      '  let x = 1;    ',
      '  return x;',
      '}',
      '',
    ].join('\n');
    const project = new ProjectContext(parser);
    project.addOrUpdateDocument(uri, sourceA, 1);
    const symbolsA = project.getSymbols(uri)?.list() ?? [];
    const tokensA = decodeTokens(sourceA, buildSemanticTokensData(sourceA, symbolsA))
      .map((token) => `${token.text}:${token.type}`);

    project.addOrUpdateDocument(uri, sourceB, 2);
    const symbolsB = project.getSymbols(uri)?.list() ?? [];
    const tokensB = decodeTokens(sourceB, buildSemanticTokensData(sourceB, symbolsB))
      .map((token) => `${token.text}:${token.type}`);

    expect(tokensB).toEqual(tokensA);
  });
});
