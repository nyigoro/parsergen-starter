import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildChangeSignatureCodeAction, applyChangeSignature, type ParamChange } from '../src/lsp/refactor-change-signature.js';

function makeUri(name: string): string {
  return pathToFileURL(path.join(__dirname, 'fixtures', 'lsp-change-signature', name)).toString();
}

function positionAt(text: string, needle: string): { line: number; character: number } {
  const offset = text.indexOf(needle);
  expect(offset).toBeGreaterThanOrEqual(0);
  const prefix = text.slice(0, offset);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: offset - lineStart + 1 };
}

describe('LSP change signature refactor', () => {
  test('builds a change-signature code action for a function declaration', () => {
    const source = 'pub fn compute(x: int, y: int) -> int { return x + y; }\n';
    const pos = positionAt(source, 'compute');
    const action = buildChangeSignatureCodeAction(source, makeUri('utils.lm'), { start: pos, end: pos });
    expect(action).toBeTruthy();
    expect(action?.title).toContain("Change signature of 'compute'");
    expect(action?.kind).toBe('refactor.rewrite');
  });

  test('renames a parameter in declaration, body, and named call sites across files', () => {
    const utilsUri = makeUri('utils.lm');
    const mainUri = makeUri('main.lm');
    const utils = 'pub fn compute(x: int, y: int) -> int { return x + y; }\n';
    const main = 'import { compute } from "./utils.lm";\nfn main() { return compute(x: 1, y: 2); }\n';
    const changes: ParamChange[] = [{ kind: 'rename', index: 0, oldName: 'x', newName: 'left' }];
    const result = applyChangeSignature({
      text: utils,
      uri: utilsUri,
      position: positionAt(utils, 'compute'),
      allFiles: new Map([
        [utilsUri, utils],
        [mainUri, main],
      ]),
    }, changes);

    expect(result.ok).toBe(true);
    expect(result.edit?.changes?.[utilsUri]?.some((edit) => edit.newText.includes('left: int, y: int'))).toBe(true);
    expect(result.edit?.changes?.[utilsUri]?.some((edit) => edit.newText === 'left')).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText.includes('left: 1'))).toBe(true);
  });

  test('reorders positional arguments across files', () => {
    const utilsUri = makeUri('utils-reorder.lm');
    const mainUri = makeUri('main-reorder.lm');
    const utils = 'pub fn compute(left: int, right: int) -> int { return left - right; }\n';
    const main = 'import { compute } from "./utils-reorder.lm";\nfn main() { return compute(1, 2); }\n';
    const changes: ParamChange[] = [{ kind: 'reorder', fromIndex: 0, toIndex: 1 }];
    const result = applyChangeSignature({
      text: utils,
      uri: utilsUri,
      position: positionAt(utils, 'compute'),
      allFiles: new Map([
        [utilsUri, utils],
        [mainUri, main],
      ]),
    }, changes);

    expect(result.ok).toBe(true);
    expect(result.edit?.changes?.[utilsUri]?.some((edit) => edit.newText.includes('right: int, left: int'))).toBe(true);
    expect(result.edit?.changes?.[mainUri]?.some((edit) => edit.newText === '2, 1')).toBe(true);
  });

  test('adds a parameter with default and removes parameters at call sites', () => {
    const utilsUri = makeUri('utils-add-remove.lm');
    const mainUri = makeUri('main-add-remove.lm');
    const utils = 'pub fn compute(x: int, y: int) -> int { return x + y; }\n';
    const main = 'import { compute } from "./utils-add-remove.lm";\nfn main() { return compute(1, 2); }\n';

    const addResult = applyChangeSignature({
      text: utils,
      uri: utilsUri,
      position: positionAt(utils, 'compute'),
      allFiles: new Map([
        [utilsUri, utils],
        [mainUri, main],
      ]),
    }, [{ kind: 'add', index: 1, name: 'label', type: 'String', defaultValue: '"ok"' }]);
    expect(addResult.ok).toBe(true);
    expect(addResult.edit?.changes?.[utilsUri]?.some((edit) => edit.newText.includes('x: int, label: String, y: int'))).toBe(true);
    expect(addResult.edit?.changes?.[mainUri]?.some((edit) => edit.newText === '1, "ok", 2')).toBe(true);

    const removeResult = applyChangeSignature({
      text: utils,
      uri: utilsUri,
      position: positionAt(utils, 'compute'),
      allFiles: new Map([
        [utilsUri, utils],
        [mainUri, main],
      ]),
    }, [{ kind: 'remove', index: 1 }]);
    expect(removeResult.ok).toBe(true);
    expect(removeResult.edit?.changes?.[utilsUri]?.some((edit) => edit.newText.includes('x: int'))).toBe(true);
    expect(removeResult.edit?.changes?.[mainUri]?.some((edit) => edit.newText === '1')).toBe(true);
  });

  test('rejects dependency-package and variadic signatures', () => {
    const depUri = 'file:///C:/workspace/.lumina/packages/pkg/src/lib.lm';
    const variadic = 'pub fn compute(items: ...int) -> int { return 1; }\n';
    const depResult = applyChangeSignature({
      text: 'pub fn compute(x: int) -> int { return x; }\n',
      uri: depUri,
      position: { line: 0, character: 8 },
      allFiles: new Map([[depUri, 'pub fn compute(x: int) -> int { return x; }\n']]),
    }, [{ kind: 'rename', index: 0, oldName: 'x', newName: 'value' }]);
    expect(depResult.ok).toBe(false);
    expect(depResult.error).toContain('dependency');

    const variadicUri = makeUri('variadic.lm');
    const variadicResult = applyChangeSignature({
      text: variadic,
      uri: variadicUri,
      position: positionAt(variadic, 'compute'),
      allFiles: new Map([[variadicUri, variadic]]),
    }, [{ kind: 'remove', index: 0 }]);
    expect(variadicResult.ok).toBe(false);
    expect(variadicResult.error).toContain('Variadic');
  });
});
