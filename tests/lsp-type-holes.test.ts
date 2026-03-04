import { getCodeActionsForDiagnostics } from '../src/lsp/code-actions.js';

function positionAt(text: string, offset: number): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const upTo = text.slice(0, clamped);
  const line = upTo.split('\n').length - 1;
  const lineStart = upTo.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

function makeHoleDiagnostic(
  source: string,
  rangeStartText: string,
  rangeEndText: string,
  inferredType: string
): {
  message: string;
  code: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  relatedInformation: Array<{ message: string }>;
} {
  const startMarker = source.indexOf(rangeStartText);
  const endMarker = source.indexOf(rangeEndText, startMarker) + rangeEndText.length;
  const start = positionAt(source, startMarker);
  const end = positionAt(source, endMarker);
  return {
    message: "Cannot infer type for hole '_'",
    code: 'LUM-010',
    range: { start, end },
    relatedInformation: [{ message: `Hole type: ${inferredType}` }],
  };
}

function expectHoleReplacementAt(source: string, diagnosticRangeStart: string, diagnosticRangeEnd: string, holeNeedle: string): void {
  const uri = 'file:///tmp/type-hole.lm';
  const diagnostic = makeHoleDiagnostic(source, diagnosticRangeStart, diagnosticRangeEnd, 'i32');
  const actions = getCodeActionsForDiagnostics(source, uri, [diagnostic]);
  const replaceAction = actions.find((action) => action.title === "Replace '_' with 'i32'");
  expect(replaceAction).toBeTruthy();
  const edit = replaceAction?.edit?.changes?.[uri]?.[0];
  expect(edit).toBeTruthy();
  const holeOffset = source.indexOf(holeNeedle);
  const expectedStart = positionAt(source, holeOffset);
  const expectedEnd = positionAt(source, holeOffset + 1);
  expect(edit?.range.start).toEqual(expectedStart);
  expect(edit?.range.end).toEqual(expectedEnd);
}

describe('LSP type-hole range precision', () => {
  test('Option<_> targets underscore token exactly', () => {
    const source = 'let x: Option<_> = Option.None;\n';
    expectHoleReplacementAt(source, 'Option<_>', 'Option<_>', '_');
  });

  test('Option<Option<_>> targets inner underscore token', () => {
    const source = 'let x: Option<Option<_>> = Option.None;\n';
    expectHoleReplacementAt(source, 'Option<Option<_>>', 'Option<Option<_>>', '_');
  });

  test('Result<_, String> targets first underscore', () => {
    const source = 'let x: Result<_, String> = Result.Err("e");\n';
    expectHoleReplacementAt(source, 'Result<_, String>', 'Result<_, String>', '_');
  });

  test('Map<String, Option<_>> targets nested underscore', () => {
    const source = 'let x: Map<String, Option<_>> = map_new();\n';
    expectHoleReplacementAt(source, 'Map<String, Option<_>>', 'Map<String, Option<_>>', '_');
  });
});
