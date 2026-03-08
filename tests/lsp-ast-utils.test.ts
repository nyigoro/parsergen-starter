import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import type { LuminaProgram } from '../src/lumina/ast.js';
import {
  collectCallExpressions,
  findFnDeclAtPosition,
  findTraitMethodAtPosition,
  offsetAt,
  rangeOfParams,
  rangeOfReturnType,
  textOfNode,
} from '../src/lsp/ast-utils.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

function parseProgram(source: string): LuminaProgram {
  return parser.parse(`${source.trim()}\n`) as LuminaProgram;
}

function positionAtNeedle(text: string, needle: string): { line: number; character: number } {
  const offset = text.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const prefix = text.slice(0, offset);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: offset - lineStart };
}

describe('LSP AST utils', () => {
  test('finds function declarations and precise parameter/return ranges', () => {
    const text = [
      'pub fn add(left: int, right: int) -> int {',
      '  return left + right;',
      '}',
      '',
    ].join('\n');
    const program = parseProgram(text);
    const fn = findFnDeclAtPosition(program, positionAtNeedle(text, 'add'));
    expect(fn?.name).toBe('add');
    if (!fn) return;

    const paramsRange = rangeOfParams(fn, text);
    expect(text.slice(offsetAt(text, paramsRange.start), offsetAt(text, paramsRange.end))).toBe('left: int, right: int');

    const returnRange = rangeOfReturnType(fn, text);
    expect(returnRange).toBeTruthy();
    if (!returnRange) return;
    expect(text.slice(offsetAt(text, returnRange.start), offsetAt(text, returnRange.end))).toBe('int');
  });

  test('finds trait methods and collects direct and nested call expressions', () => {
    const text = [
      'trait Shape {',
      '  fn area(scale: int) -> int {',
      '    return scale;',
      '  }',
      '}',
      '',
      'fn wrap(value: int) -> int {',
      '  return area(value);',
      '}',
      '',
      'fn main() -> int {',
      '  return wrap(area(2));',
      '}',
      '',
    ].join('\n');
    const program = parseProgram(text);

    const found = findTraitMethodAtPosition(program, positionAtNeedle(text, 'area(scale'));
    expect(found?.trait.name).toBe('Shape');
    expect(found?.method.name).toBe('area');

    const calls = collectCallExpressions(program, (call) => call.callee.name === 'area');
    expect(calls).toHaveLength(2);
    expect(textOfNode(calls[0], text)).toContain('area(');
    expect(textOfNode(calls[1], text)).toContain('area(');
  });
});
