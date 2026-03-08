import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyMoveSymbol, buildMoveSymbolCodeAction } from '../src/lsp/refactor-move-symbol.js';

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-move-symbol', name)).toString();
}

function positionAt(text: string, needle: string): { line: number; character: number } {
  const offset = text.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const prefix = text.slice(0, offset);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: offset - lineStart + 1 };
}

describe('LSP move symbol refactor', () => {
  test('offers move-symbol action for top-level declarations', () => {
    const source = 'pub fn helper() -> int {\n  return 1;\n}\n';
    const pos = positionAt(source, 'helper');
    const action = buildMoveSymbolCodeAction(source, makeUri('utils.lm'), { start: pos, end: pos });
    expect(action).toBeTruthy();
    expect(action?.title).toContain("Move symbol 'helper'");
    expect(action?.kind).toBe('refactor.move');
  });

  test('moves a symbol to another file and updates named imports', () => {
    const sourceUri = makeUri('utils.lm');
    const targetUri = makeUri('math.lm');
    const mainUri = makeUri('main.lm');
    const source = 'pub fn helper() -> int {\n  return 1;\n}\n';
    const target = 'pub fn existing() -> int { return 0; }\n';
    const main = 'import { helper } from "./utils.lm";\nfn main() { return helper(); }\n';

    const result = applyMoveSymbol({
      text: source,
      uri: sourceUri,
      position: positionAt(source, 'helper'),
      targetUri,
      allFiles: new Map([
        [sourceUri, source],
        [targetUri, target],
        [mainUri, main],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.edit?.changes?.[sourceUri]?.length).toBeGreaterThan(0);
    expect(result.edit?.changes?.[targetUri]?.some((edit) => edit.newText.includes('pub fn helper()'))).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText.includes('./math.lm'))).toBe(true);
  });

  test('rejects target collisions, cycles, and cross-package moves', () => {
    const sourceUri = makeUri('cycle-source.lm');
    const targetUri = makeUri('cycle-target.lm');
    const source = 'import { dep } from "./cycle-target.lm";\npub fn helper() -> int { return dep(); }\n';
    const target = 'pub fn helper() -> int { return 0; }\n';

    const collision = applyMoveSymbol({
      text: 'pub fn helper() -> int { return 1; }\n',
      uri: sourceUri,
      position: { line: 0, character: 8 },
      targetUri,
      allFiles: new Map([
        [sourceUri, 'pub fn helper() -> int { return 1; }\n'],
        [targetUri, target],
      ]),
    });
    expect(collision.ok).toBe(false);
    expect(collision.error).toContain('already defines');

    const cycle = applyMoveSymbol({
      text: source,
      uri: sourceUri,
      position: positionAt(source, 'helper'),
      targetUri,
      allFiles: new Map([
        [sourceUri, source],
        [targetUri, 'pub fn dep() -> int { return 1; }\n'],
      ]),
    });
    expect(cycle.ok).toBe(false);
    expect(cycle.error).toContain('MODULE-CYCLE-001');

    const depMove = applyMoveSymbol({
      text: 'pub fn helper() -> int { return 1; }\n',
      uri: 'file:///C:/workspace/.lumina/packages/pkg/src/lib.lm',
      position: { line: 0, character: 8 },
      targetUri,
      allFiles: new Map([
        ['file:///C:/workspace/.lumina/packages/pkg/src/lib.lm', 'pub fn helper() -> int { return 1; }\n'],
        [targetUri, ''],
      ]),
    });
    expect(depMove.ok).toBe(false);
    expect(depMove.error).toContain('package boundaries');
  });

  test('can move with a new symbol name when the target collides', () => {
    const sourceUri = makeUri('rename-source.lm');
    const targetUri = makeUri('rename-target.lm');
    const mainUri = makeUri('rename-main.lm');
    const source = 'pub fn helper() -> int { return 1; }\n';
    const target = 'pub fn helper2() -> int { return 0; }\n';
    const main = 'import { helper } from "./rename-source.lm";\nfn main() { return helper(); }\n';

    const result = applyMoveSymbol({
      text: source,
      uri: sourceUri,
      position: positionAt(source, 'helper'),
      targetUri,
      newName: 'helper3',
      allFiles: new Map([
        [sourceUri, source],
        [targetUri, target],
        [mainUri, main],
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.newName).toBe('helper3');
    expect(result.edit?.changes?.[targetUri]?.some((edit) => edit.newText.includes('pub fn helper3()'))).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText.includes('{ helper3 as helper }'))).toBe(true);
  });

  test('does not offer move for non-top-level symbols', () => {
    const source = 'fn main() {\n  let helper = 1;\n  return helper;\n}\n';
    const pos = positionAt(source, 'helper =');
    expect(buildMoveSymbolCodeAction(source, makeUri('local.lm'), { start: pos, end: pos })).toBeNull();
  });
});
