import {
  createPlaygroundSignal,
  defaultState,
  diagnosticCounts,
  sourceProjectInput,
  type PlaygroundState,
} from '../playground/src/state';

describe('playground single-source state helpers', () => {
  test('starts from the Phase 1 default model', () => {
    expect(defaultState).toMatchObject({
      source: '',
      target: 'js',
      mode: 'run',
      activeTab: 'js',
      activeExample: 'basics',
      compileResult: null,
      compileStatus: 'idle',
      diagnosticsOpen: false,
      settingsOpen: false,
      autoPreview: false,
      cursorLine: 1,
      cursorCol: 1,
    } satisfies PlaygroundState);
  });

  test('emits updates without recreating workspace or file state', () => {
    const store = createPlaygroundSignal(defaultState);
    const seen: string[] = [];
    store.subscribe((state) => seen.push(`${state.mode}:${state.target}:${state.cursorLine}`));

    store.set({ mode: 'check', target: 'both' });
    store.set((state) => ({ cursorLine: state.cursorLine + 4, cursorCol: 2 }));

    expect(seen).toEqual(['run:js:1', 'check:both:1', 'check:both:5']);
    expect(store.get()).not.toHaveProperty('project');
    expect(store.get()).not.toHaveProperty('routePreview');
    expect(store.get()).not.toHaveProperty('files');
  });

  test('adapts source to the compiler bridge single-file input', () => {
    expect(sourceProjectInput('fn main() -> int { 1 }')).toEqual({
      entryUri: 'main.lm',
      files: [{ uri: 'main.lm', text: 'fn main() -> int { 1 }' }],
    });
  });

  test('counts diagnostics for status and collapsed diagnostics bar', () => {
    expect(
      diagnosticCounts([
        { severity: 'warning', message: 'warn' },
        { severity: 'error', message: 'err' },
        { severity: 'info', message: 'note' },
      ])
    ).toEqual({ errors: 1, warnings: 1 });
  });
});
