import { buildExtractTypeAliasCodeAction } from '../src/lsp/refactor-extract-type.js';

function positionAt(text: string, offset: number): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const upTo = text.slice(0, clamped);
  const line = upTo.split('\n').length - 1;
  const lineStart = upTo.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

describe('LSP extract type alias refactor', () => {
  test('extracts repeated type expression into alias', () => {
    const source = [
      'fn a(x: Option<Result<int, string>>) -> Option<Result<int, string>> {',
      '  return x;',
      '}',
      '',
    ].join('\n');
    const needle = 'Option<Result<int, string>>';
    const start = source.indexOf(needle);
    const end = start + needle.length;
    const action = buildExtractTypeAliasCodeAction(source, 'file:///tmp/extract.lm', {
      start: positionAt(source, start),
      end: positionAt(source, end),
    });
    expect(action).toBeTruthy();
    const edits = action?.edit?.changes?.['file:///tmp/extract.lm'] ?? [];
    expect(edits.some((edit) => edit.newText.includes('type ExtractedType = Option<Result<int, string>>;'))).toBe(true);
    expect(edits.some((edit) => edit.newText === 'ExtractedType')).toBe(true);
  });

  test('supports nested generic selections', () => {
    const source = [
      'fn main(v: Map<string, Option<Result<int, string>>>) -> Map<string, Option<Result<int, string>>> {',
      '  return v;',
      '}',
      '',
    ].join('\n');
    const needle = 'Map<string, Option<Result<int, string>>>';
    const start = source.indexOf(needle);
    const end = start + needle.length;
    const action = buildExtractTypeAliasCodeAction(source, 'file:///tmp/extract-nested.lm', {
      start: positionAt(source, start),
      end: positionAt(source, end),
    });
    expect(action).toBeTruthy();
  });

  test('rejects extraction when type contains free generic variable', () => {
    const source = 'fn main(x: Result<T, string>) -> Result<T, string> { return x; }\n';
    const needle = 'Result<T, string>';
    const start = source.indexOf(needle);
    const end = start + needle.length;
    const action = buildExtractTypeAliasCodeAction(source, 'file:///tmp/extract-free-var.lm', {
      start: positionAt(source, start),
      end: positionAt(source, end),
    });
    expect(action).toBeNull();
  });
});
