import { getCodeActionsForDiagnostics } from '../src/lsp/code-actions.js';

describe('LSP Code Actions (refactor)', () => {
  test('offers function-to-method rewrite for collection calls', () => {
    const source = `
fn main() {
  vec.push(v, 1);
}
`.trim() + '\n';
    const start = source.indexOf('vec.push(v, 1)');
    const end = start + 'vec.push(v, 1)'.length;
    const range = {
      start: { line: 1, character: source.split('\n')[1].indexOf('vec.push(v, 1)') },
      end: { line: 1, character: source.split('\n')[1].indexOf('vec.push(v, 1)') + 'vec.push(v, 1)'.length },
    };
    const actions = getCodeActionsForDiagnostics(source, 'file:///tmp/main.lm', [], { range });
    const rewrite = actions.find((action) => action.title === 'Convert to method call syntax');
    expect(rewrite).toBeTruthy();
    const replacement = rewrite?.edit?.changes?.['file:///tmp/main.lm']?.[0];
    expect(replacement?.newText).toBe('v.push(1)');
    expect(end).toBeGreaterThan(start);
  });

  test('offers method-to-function rewrite for collection calls', () => {
    const source = `
fn main() {
  m.insert("k", 1);
}
`.trim() + '\n';
    const line = source.split('\n')[1];
    const col = line.indexOf('m.insert("k", 1)');
    const range = {
      start: { line: 1, character: col },
      end: { line: 1, character: col + 'm.insert("k", 1)'.length },
    };
    const actions = getCodeActionsForDiagnostics(source, 'file:///tmp/main.lm', [], { range });
    const rewrite = actions.find((action) => action.title.includes('Convert to function call syntax'));
    expect(rewrite).toBeTruthy();
  });

  test('offers extract-variable action for selected expression', () => {
    const source = `
fn main() {
  let y = 1 + 2;
  return y;
}
`.trim() + '\n';
    const line = source.split('\n')[1];
    const col = line.indexOf('1 + 2');
    const range = {
      start: { line: 1, character: col },
      end: { line: 1, character: col + '1 + 2'.length },
    };
    const actions = getCodeActionsForDiagnostics(source, 'file:///tmp/main.lm', [], { range });
    const extract = actions.find((action) => action.title.startsWith('Extract to local'));
    expect(extract).toBeTruthy();
    expect(extract?.kind).toBe('refactor.extract');
  });
});

