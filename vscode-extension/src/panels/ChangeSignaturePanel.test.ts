import {
  buildParamChanges,
  renderSignaturePreview,
  summarizeParamChanges,
  withParamIds,
} from './ChangeSignaturePanel.js';

describe('ChangeSignaturePanel helpers', () => {
  test('initial preview renders all params', () => {
    expect(renderSignaturePreview('compute', [
      { name: 'x', type: 'i32' },
      { name: 'y', type: 'String' },
    ])).toBe('fn compute(x: i32, y: String)');
  });

  test('reorder produces correct ParamChange[]', () => {
    const original = withParamIds([
      { name: 'x', type: 'i32' },
      { name: 'y', type: 'i32' },
    ]);
    const current = [original[1], original[0]];
    expect(buildParamChanges(original, current)).toEqual([
      { kind: 'reorder', fromIndex: 1, toIndex: 0 },
    ]);
  });

  test('rename produces correct ParamChange[]', () => {
    const original = withParamIds([{ name: 'x', type: 'i32' }]);
    const current = [{ ...original[0], name: 'left' }];
    expect(buildParamChanges(original, current)).toEqual([
      { kind: 'rename', index: 0, oldName: 'x', newName: 'left' },
    ]);
  });

  test('add and remove produce correct ParamChange[]', () => {
    const original = withParamIds([
      { name: 'x', type: 'i32' },
      { name: 'y', type: 'i32' },
    ]);
    const current = [
      original[0],
      { id: 'new-1', name: 'label', type: 'String' },
    ];
    expect(buildParamChanges(original, current)).toEqual([
      { kind: 'remove', index: 1 },
      { kind: 'add', index: 1, name: 'label', type: 'String' },
    ]);
  });

  test('preview summary reflects pending changes', () => {
    expect(
      summarizeParamChanges([
        { kind: 'rename', index: 0, oldName: 'x', newName: 'left' },
        { kind: 'reorder', fromIndex: 1, toIndex: 0 },
        { kind: 'add', index: 2, name: 'label', type: 'String' },
      ])
    ).toBe('1 rename, 1 reorder, 1 addition, 0 removals');
  });

  test('unchanged state yields no changes', () => {
    const original = withParamIds([{ name: 'x', type: 'i32' }]);
    expect(buildParamChanges(original, original)).toEqual([]);
  });
});
