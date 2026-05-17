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
      runtimeStatus: 'idle',
      runtimeMessage: null,
      previewStatus: 'idle',
      previewMessage: null,
      previewDevice: 'desktop',
      lastCompiledTarget: null,
      lastAction: null,
      checkTimeMs: null,
      runTimeMs: null,
      examplesOpen: false,
      settingsOpen: false,
      embedMode: false,
      settings: {
        theme: 'dark',
        fontSize: 15,
        tabSize: 2,
      },
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
    expect(sourceProjectInput('fn main() -> int { 1 }', 'check', 'js')).toEqual({
      action: 'check',
      target: 'js',
      entryUri: 'main.lm',
      files: [{ uri: 'main.lm', text: 'fn main() -> int { 1 }' }],
    });
  });

  test('allows run output to be selected independently from compile target tabs', () => {
    const store = createPlaygroundSignal(defaultState);
    store.set({ target: 'wasm', activeTab: 'run' });
    expect(store.get()).toMatchObject({ target: 'wasm', activeTab: 'run' });
  });

  test('counts diagnostics for status and diagnostics tab summary', () => {
    expect(
      diagnosticCounts([
        { severity: 'warning', message: 'warn' },
        { severity: 'error', message: 'err' },
        { severity: 'info', message: 'note' },
      ])
    ).toEqual({ errors: 1, warnings: 1 });
  });
});
