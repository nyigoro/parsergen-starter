import fs from 'node:fs';
import path from 'node:path';
import { compileGrammar } from '../src/grammar/index.js';
import { BrowserProjectContext, type BrowserTypeInfo } from '../src/project/browser-context.js';
import { createPlaygroundSignal, defaultState } from '../playground/src/state';
import {
  renderTypeInfoTables,
  renderTypesEmptyState,
  typeFilterMatches,
  typeInfoToJson,
  typeRowLocation,
} from '../playground/src/types-view';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar, { cache: true });

const expressionSource = `fn square(x: int) -> int {
  return x * x
}

fn main() -> int {
  let answer = square(12);
  return answer
}
`;

const declarationOnlySource = `type UserId = int
`;

const buildTypeInfo = (source: string): BrowserTypeInfo => {
  const project = new BrowserProjectContext(parser);
  project.addOrUpdateDocument('main.lm', source, 1);
  const diagnostics = project.getDiagnostics('main.lm').filter((diagnostic) => diagnostic.severity === 'error');
  expect(diagnostics).toEqual([]);
  const typeInfo = project.getTypeInfo('main.lm');
  expect(typeInfo).not.toBeNull();
  return typeInfo!;
};

const sampleTypeInfo: BrowserTypeInfo = {
  sourceUri: 'virtual://main.lm',
  declarations: [
    { name: 'square', kind: 'function', typeStr: 'int', startLine: 1, startCol: 1 },
    { name: 'answer', kind: 'variable', typeStr: 'int', startLine: 6, startCol: 3 },
    { name: 'UserId', kind: 'type', typeStr: 'int', startLine: 1, startCol: 1 },
  ],
  exprTypes: [
    {
      nodeId: 7,
      typeStr: 'int',
      startLine: 6,
      startCol: 16,
      endLine: 6,
      endCol: 26,
      preview: 'square(12)',
    },
  ],
};

describe('playground Types tab data', () => {
  test('getTypeInfo returns declarations for simple function source', () => {
    const typeInfo = buildTypeInfo(expressionSource);
    expect(typeInfo.sourceUri).toBe('virtual://main.lm');
    expect(typeInfo.declarations.map((declaration) => declaration.name)).toEqual(
      expect.arrayContaining(['square', 'main'])
    );
  });

  test('declaration has name, kind, and readable type string', () => {
    const typeInfo = buildTypeInfo(expressionSource);
    const square = typeInfo.declarations.find((declaration) => declaration.name === 'square');
    expect(square).toMatchObject({
      name: 'square',
      kind: 'function',
      startLine: 1,
      startCol: 4,
    });
    expect(square?.typeStr).toContain('int');
  });

  test('exprTypes are populated when expressions exist', () => {
    const typeInfo = buildTypeInfo(expressionSource);
    expect(typeInfo.exprTypes.length).toBeGreaterThan(0);
    expect(typeInfo.exprTypes.some((expr) => expr.preview.includes('square(12)') || expr.preview.includes('answer'))).toBe(true);
  });

  test('exprTypes stay empty or reduced for declaration-only source', () => {
    const typeInfo = buildTypeInfo(declarationOnlySource);
    expect(typeInfo.declarations.some((declaration) => declaration.name === 'UserId')).toBe(true);
    expect(typeInfo.exprTypes.length).toBeLessThanOrEqual(1);
  });
});

describe('playground Types tab rendering helpers', () => {
  test('functions filter hides variables', () => {
    expect(typeFilterMatches('function', 'functions')).toBe(true);
    expect(typeFilterMatches('variable', 'functions')).toBe(false);
    const rendered = renderTypeInfoTables(sampleTypeInfo, 'functions');
    expect(rendered.declarationsHtml).toContain('square');
    expect(rendered.declarationsHtml).not.toContain('answer');
  });

  test('variables filter hides functions', () => {
    expect(typeFilterMatches('variable', 'variables')).toBe(true);
    expect(typeFilterMatches('function', 'variables')).toBe(false);
    const rendered = renderTypeInfoTables(sampleTypeInfo, 'variables');
    expect(rendered.declarationsHtml).toContain('answer');
    expect(rendered.declarationsHtml).not.toContain('square');
  });

  test('expression row location supports click-to-jump wiring', () => {
    const calls: Array<{ line: number; column: number }> = [];
    const location = typeRowLocation({ typeLine: '6', typeCol: '16' });
    if (location) calls.push(location);
    expect(calls).toEqual([{ line: 6, column: 16 }]);
  });

  test('empty state prompts Check or Run when typeInfo is null', () => {
    expect(renderTypesEmptyState()).toContain('Run Check or Run to see inferred types');
  });

  test('Copy as JSON produces valid type info JSON', () => {
    const parsed = JSON.parse(typeInfoToJson(sampleTypeInfo)) as BrowserTypeInfo;
    expect(parsed.sourceUri).toBe('virtual://main.lm');
    expect(parsed.exprTypes[0].preview).toBe('square(12)');
  });

  test('typeInfo can be cleared when source changes and recompile is pending', () => {
    const store = createPlaygroundSignal({ ...defaultState, source: expressionSource, typeInfo: sampleTypeInfo });
    store.set({ source: `${expressionSource}\n`, typeInfo: null, compileStatus: 'checking' });
    expect(store.get().typeInfo).toBeNull();
    expect(store.get().compileStatus).toBe('checking');
  });
});
