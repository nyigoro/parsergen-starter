import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { selectMoveTargetFiles } from '../vscode-extension/src/commands/move-symbol.js';

function makeUri(...segments: string[]): string {
  return pathToFileURL(path.join('C:/workspace/project', ...segments)).toString();
}

describe('move symbol extension UX helpers', () => {
  test('file list excludes current file', () => {
    const current = makeUri('src', 'main.lm');
    const files = [current, makeUri('src', 'utils.lm')];
    expect(selectMoveTargetFiles(current, files)).toEqual([makeUri('src', 'utils.lm')]);
  });

  test('same-directory files sort first', () => {
    const current = makeUri('src', 'main.lm');
    const files = [
      makeUri('src', 'nested', 'parser.lm'),
      makeUri('src', 'types.lm'),
      makeUri('pkg', 'shared.lm'),
    ];
    const ordered = selectMoveTargetFiles(current, files);
    expect(ordered[0]).toBe(makeUri('src', 'types.lm'));
  });

  test('non-.lm files are excluded', () => {
    const current = makeUri('src', 'main.lm');
    const files = [
      makeUri('src', 'utils.lm'),
      makeUri('src', 'types.lumina'),
      makeUri('src', 'legacy.lum'),
    ];
    expect(selectMoveTargetFiles(current, files)).toEqual([makeUri('src', 'utils.lm')]);
  });
});
