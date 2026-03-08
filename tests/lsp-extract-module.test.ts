import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import {
  applyExtractModule,
  buildExtractModuleCodeAction,
} from '../src/lsp/refactor-extract-module.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-extract-module', name)).toString();
}

function parseProgram(source: string): LuminaProgram {
  return parser.parse(source) as LuminaProgram;
}

function rangeForSelection(
  text: string,
  startNeedle: string,
  endNeedle: string
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  const startOffset = text.indexOf(startNeedle);
  const endOffset = text.indexOf(endNeedle) + endNeedle.length;
  expect(startOffset).toBeGreaterThanOrEqual(0);
  expect(endOffset).toBeGreaterThan(0);
  const pos = (offset: number) => {
    const prefix = text.slice(0, offset);
    const line = prefix.split('\n').length - 1;
    const lineStart = prefix.lastIndexOf('\n') + 1;
    return { line, character: offset - lineStart };
  };
  return { start: pos(startOffset), end: pos(endOffset) };
}

describe('LSP extract module refactor', () => {
  test('offers extract-module action only when multiple declarations are selected', () => {
    const source = [
      'pub struct User {',
      '  name: string',
      '}',
      '',
      'pub fn helper() -> int {',
      '  return 1;',
      '}',
      '',
      'fn main() -> int {',
      '  return helper();',
      '}',
      '',
    ].join('\n');
    const program = parseProgram(source);

    const multiRange = rangeForSelection(source, 'pub struct User', 'return 1;');
    const action = buildExtractModuleCodeAction(source, makeUri('source.lm'), multiRange, program);
    expect(action).toBeTruthy();
    expect(action?.title).toContain('Extract 2 declarations');

    const singleRange = rangeForSelection(source, 'pub fn helper', 'return 1;');
    expect(buildExtractModuleCodeAction(source, makeUri('source.lm'), singleRange, program)).toBeNull();
  });

  test('moves selected declarations, adds source import, and updates external imports', () => {
    const sourceUri = makeUri('source.lm');
    const targetUri = makeUri('extracted.lm');
    const mainUri = makeUri('main.lm');
    const source = [
      'pub struct User {',
      '  name: string',
      '}',
      '',
      'pub fn helper() -> int {',
      '  return 1;',
      '}',
      '',
      'fn main() -> int {',
      '  return helper();',
      '}',
      '',
    ].join('\n');
    const target = '';
    const main = [
      'import { User, helper } from "./source.lm";',
      'fn run() -> int {',
      '  let user = User { name: "A" };',
      '  return helper();',
      '}',
      '',
    ].join('\n');
    const range = rangeForSelection(source, 'pub struct User', 'return 1;');
    const result = applyExtractModule({
      text: source,
      uri: sourceUri,
      range,
      targetUri,
      allFiles: new Map([
        [sourceUri, source],
        [targetUri, target],
        [mainUri, main],
      ]),
      allPrograms: new Map<string, LuminaProgram>([
        [sourceUri, parseProgram(source)],
        [targetUri, parseProgram('\n')],
        [mainUri, parseProgram(main)],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.movedSymbols).toEqual(['User', 'helper']);
    expect(result.edit?.changes?.[targetUri]?.some((edit) => edit.newText.includes('pub struct User'))).toBe(true);
    expect(result.edit?.changes?.[targetUri]?.some((edit) => edit.newText.includes('pub fn helper()'))).toBe(true);
    expect(result.edit?.changes?.[sourceUri]?.some((edit) => edit.newText.includes('import { User, helper } from "./extracted.lm";'))).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText.includes('./extracted.lm'))).toBe(true);
  });
});
