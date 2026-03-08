import {
  LuminaCommands,
  type ChangeSignatureArgs,
  type ExtractModuleArgs,
  type MoveSymbolArgs,
  type ParamChange,
} from 'lumina-language-client';

describe('lumina-language-client protocol', () => {
  test('command ids are unique lumina-prefixed strings', () => {
    const values = Object.values(LuminaCommands);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value.startsWith('lumina.')).toBe(true);
    }
  });

  test('ParamChange kind coverage stays stable', () => {
    const kinds: ParamChange['kind'][] = ['rename', 'reorder', 'add', 'remove'];
    expect(kinds).toEqual(['rename', 'reorder', 'add', 'remove']);
  });

  test('change-signature args round-trip through JSON', () => {
    const value: ChangeSignatureArgs = {
      uri: 'file:///workspace/main.lm',
      position: { line: 1, character: 2 },
      changes: [{ kind: 'rename', index: 0, oldName: 'x', newName: 'left' }],
    };
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  test('move-symbol and extract-module args round-trip through JSON', () => {
    const move: MoveSymbolArgs = {
      uri: 'file:///workspace/source.lm',
      position: { line: 2, character: 4 },
      targetUri: 'file:///workspace/target.lm',
    };
    const extract: ExtractModuleArgs = {
      uri: 'file:///workspace/source.lm',
      range: {
        start: { line: 1, character: 0 },
        end: { line: 8, character: 0 },
      },
      targetUri: 'file:///workspace/extracted.lm',
      symbols: ['User', 'helper'],
    };
    expect(JSON.parse(JSON.stringify(move))).toEqual(move);
    expect(JSON.parse(JSON.stringify(extract))).toEqual(extract);
  });
});
