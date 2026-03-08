import { getCodeActionsForDiagnostics } from '../src/lsp/code-actions.js';
import { buildConvertToAsyncCodeAction } from '../src/lsp/refactor-async-convert.js';
import { buildExtractFunctionCodeAction } from '../src/lsp/refactor-extract-function.js';
import { buildExtractVariableCodeAction } from '../src/lsp/refactor-extract-variable.js';
import { buildFlipIfElseCodeAction } from '../src/lsp/refactor-flip-if.js';
import { buildIfLetToMatchCodeAction, buildMatchToIfLetCodeAction } from '../src/lsp/refactor-if-let-match.js';
import { buildPromoteToRefCodeAction } from '../src/lsp/refactor-promote-ref.js';
import { buildSplitVariableCodeAction } from '../src/lsp/refactor-split-variable.js';
import { buildTraitStubsCodeAction } from '../src/lsp/refactor-trait-stubs.js';
import { buildWrapReturnResultCodeAction } from '../src/lsp/refactor-wrap-result.js';

function positionAt(text: string, offset: number): { line: number; character: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

function rangeFor(text: string, snippet: string, fromIndex = 0) {
  const start = text.indexOf(snippet, fromIndex);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = start + snippet.length;
  return {
    start: positionAt(text, start),
    end: positionAt(text, end),
  };
}

describe('LSP advanced refactors', () => {
  test('extract variable wraps expression in let binding', () => {
    const source = ['fn main() {', '  let value = 1 + 2;', '}', ''].join('\n');
    const action = buildExtractVariableCodeAction(source, 'file:///tmp/main.lm', rangeFor(source, '1 + 2'));
    expect(action).toBeTruthy();
    expect(action?.kind).toBe('refactor.extract');
    const edits = action?.edit?.changes?.['file:///tmp/main.lm'] ?? [];
    expect(edits.some((edit) => edit.newText.includes('let extracted = 1 + 2;'))).toBe(true);
    expect(edits.some((edit) => edit.newText === 'extracted')).toBe(true);
  });

  test('extract variable generates a unique name and rejects single identifiers', () => {
    const source = ['fn main() {', '  let extracted = 0;', '  let value = 1 + 2;', '}', ''].join('\n');
    const action = buildExtractVariableCodeAction(source, 'file:///tmp/main.lm', rangeFor(source, '1 + 2'));
    expect(action?.title).toContain('extracted1');
    expect(buildExtractVariableCodeAction(source, 'file:///tmp/main.lm', rangeFor(source, 'value'))).toBeNull();
  });

  test('promote to ref rewrites let bindings and offers REF_LVALUE_REQUIRED quick-fix', () => {
    const source = ['fn main() {', '  let alias = value;', '}', ''].join('\n');
    const range = rangeFor(source, 'let alias = value;');
    const action = buildPromoteToRefCodeAction(source, 'file:///tmp/ref.lm', range);
    expect(action?.edit?.changes?.['file:///tmp/ref.lm']?.[0]?.newText).toBe('  let ref alias = value;');

    const quickFixes = getCodeActionsForDiagnostics(source, 'file:///tmp/ref.lm', [
      {
        message: 'Expected lvalue for ref binding',
        code: 'REF_LVALUE_REQUIRED',
        range,
      },
    ]);
    expect(quickFixes.some((candidate) => candidate.title.includes('Promote'))).toBe(true);
    expect(buildPromoteToRefCodeAction('fn main() {\n  let alias = 1;\n}\n', 'file:///tmp/ref.lm', {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 16 },
    })).toBeNull();
  });

  test('split variable renames the second shadow binding and rejects unsafe reassignment', () => {
    const source = ['fn main() {', '  let value = 1;', '  let keep = value;', '  let value = 2;', '  return value;', '}', ''].join(
      '\n'
    );
    const action = buildSplitVariableCodeAction(source, 'file:///tmp/split.lm', rangeFor(source, 'value = 1'));
    expect(action).toBeTruthy();
    const edits = action?.edit?.changes?.['file:///tmp/split.lm'] ?? [];
    expect(edits.some((edit) => edit.newText === 'value2')).toBe(true);

    const unsafe = ['fn main() {', '  let mut value = 1;', '  value = 2;', '  return value;', '}', ''].join('\n');
    expect(buildSplitVariableCodeAction(unsafe, 'file:///tmp/split-unsafe.lm', rangeFor(unsafe, 'value = 1'))).toBeNull();
  });

  test('trait stubs generate todo bodies for missing methods and return null when complete', () => {
    const source = [
      'trait Display {',
      '  fn show(self) -> String;',
      '  fn render(self) -> String;',
      '}',
      '',
      'impl Display for Widget {',
      '  fn show(self) -> String {',
      '    todo!()',
      '  }',
      '}',
      '',
    ].join('\n');
    const action = buildTraitStubsCodeAction(source, 'file:///tmp/trait.lm', rangeFor(source, 'impl Display for Widget'));
    expect(action).toBeTruthy();
    const insert = action?.edit?.changes?.['file:///tmp/trait.lm']?.[0]?.newText ?? '';
    expect(insert).toContain('fn render(self) -> String');
    expect(insert).toContain('todo!()');

    const complete = [
      'trait Display {',
      '  fn show(self) -> String;',
      '  fn render(self) -> String;',
      '}',
      '',
      'impl Display for Widget {',
      '  fn show(self) -> String {',
      '    todo!()',
      '  }',
      '  fn render(self) -> String {',
      '    todo!()',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(buildTraitStubsCodeAction(complete, 'file:///tmp/trait-complete.lm', rangeFor(complete, 'impl Display for Widget'))).toBeNull();
  });

  test('extract function lifts statements into a new function with type holes', () => {
    const source = [
      'fn main(a: int, b: int) {',
      '  let prefix = 1;',
      '  let sum = a + b;',
      '  let doubled = sum * 2;',
      '  return doubled + prefix;',
      '}',
      '',
    ].join('\n');
    const selection = '  let sum = a + b;\n  let doubled = sum * 2;';
    const action = buildExtractFunctionCodeAction(source, 'file:///tmp/extract-fn.lm', rangeFor(source, selection));
    expect(action).toBeTruthy();
    const edits = action?.edit?.changes?.['file:///tmp/extract-fn.lm'] ?? [];
    expect(edits.some((edit) => edit.newText.includes('fn extracted(a: _, b: _) -> _'))).toBe(true);
    expect(edits.some((edit) => edit.newText.includes('let doubled = extracted(a, b);'))).toBe(true);
  });

  test('convert to async adds async and wraps return type in Promise', () => {
    const source = ['fn fetch_value() -> int {', '  return 1;', '}', ''].join('\n');
    const action = buildConvertToAsyncCodeAction(source, 'file:///tmp/async.lm', rangeFor(source, 'fetch_value'));
    expect(action?.edit?.changes?.['file:///tmp/async.lm']?.[0]?.newText).toContain('async fn fetch_value() -> Promise<int>');

    const alreadyAsync = ['async fn fetch_value() -> Promise<int> {', '  return 1;', '}', ''].join('\n');
    expect(buildConvertToAsyncCodeAction(alreadyAsync, 'file:///tmp/async2.lm', rangeFor(alreadyAsync, 'fetch_value'))).toBeNull();
  });

  test('flip if/else negates condition, swaps branches, and rejects missing else', () => {
    const source = 'if flag { do_then(); } else { do_else(); }';
    const action = buildFlipIfElseCodeAction(source, 'file:///tmp/flip.lm', rangeFor(source, source));
    const replacement = action?.edit?.changes?.['file:///tmp/flip.lm']?.[0]?.newText;
    expect(replacement).toBe('if !flag { do_else(); } else { do_then(); }');

    const noElse = 'if flag { do_then(); }';
    expect(buildFlipIfElseCodeAction(noElse, 'file:///tmp/flip2.lm', rangeFor(noElse, noElse))).toBeNull();
  });

  test('if let and match rewrites convert both directions and reject multi-arm matches', () => {
    const ifLetSource = 'if let Some(value) = input { use(value); } else { fallback(); }';
    const ifLetAction = buildIfLetToMatchCodeAction(ifLetSource, 'file:///tmp/iflet.lm', rangeFor(ifLetSource, ifLetSource));
    expect(ifLetAction?.edit?.changes?.['file:///tmp/iflet.lm']?.[0]?.newText).toContain('match input');
    expect(ifLetAction?.edit?.changes?.['file:///tmp/iflet.lm']?.[0]?.newText).toContain('_ => { fallback(); }');

    const matchSource = 'match input { Some(value) => { use(value); }, _ => { fallback(); } }';
    const matchAction = buildMatchToIfLetCodeAction(matchSource, 'file:///tmp/match.lm', rangeFor(matchSource, matchSource));
    expect(matchAction?.edit?.changes?.['file:///tmp/match.lm']?.[0]?.newText).toBe(
      'if let Some(value) = input { use(value); } else { fallback(); }'
    );

    const multiArm = 'match input { Some(value) => { use(value); }, None => { fallback(); }, _ => { noop(); } }';
    expect(buildMatchToIfLetCodeAction(multiArm, 'file:///tmp/match2.lm', rangeFor(multiArm, multiArm))).toBeNull();
  });

  test('wrap result rewrites return type and return expressions, but skips existing Result signatures', () => {
    const source = ['fn compute() -> int {', '  return 1;', '}', ''].join('\n');
    const action = buildWrapReturnResultCodeAction(source, 'file:///tmp/result.lm', rangeFor(source, 'compute'));
    expect(action).toBeTruthy();
    const edits = action?.edit?.changes?.['file:///tmp/result.lm'] ?? [];
    expect(edits.some((edit) => edit.newText.includes('-> Result<int, String>'))).toBe(true);
    expect(edits.some((edit) => edit.newText.includes('return Ok(1);'))).toBe(true);

    const alreadyWrapped = ['fn compute() -> Result<int, String> {', '  return Ok(1);', '}', ''].join('\n');
    expect(buildWrapReturnResultCodeAction(alreadyWrapped, 'file:///tmp/result2.lm', rangeFor(alreadyWrapped, 'compute'))).toBeNull();
  });
});
