import type { CompileDiagnostic, CompileResult, PlaygroundTypeInfo } from './compiler-bridge';

export type CompileTarget = 'js' | 'wasm' | 'both';
export type CompileMode = 'check' | 'run' | 'format';
export type OutputTab = 'js' | 'wasm' | 'run' | 'ui' | 'types' | 'diagnostics';
export type CompileStatus = 'idle' | 'checking' | 'running' | 'done' | 'error';
export type RuntimeStatus = 'idle' | 'running' | 'ok' | 'error';
export type PreviewStatus = 'idle' | 'rendering' | 'ok' | 'error' | 'empty';
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type PlaygroundTheme = 'dark' | 'light';

export type PlaygroundSettings = {
  theme: PlaygroundTheme;
  fontSize: number;
  tabSize: number;
};

export type PlaygroundState = {
  source: string;
  target: CompileTarget;
  mode: CompileMode;
  activeTab: OutputTab;
  embedMode: boolean;
  activeExample: string | null;
  compileResult: CompileResult | null;
  typeInfo: PlaygroundTypeInfo | null;
  compileStatus: CompileStatus;
  runtimeStatus: RuntimeStatus;
  runtimeMessage: string | null;
  previewStatus: PreviewStatus;
  previewMessage: string | null;
  previewDevice: PreviewDevice;
  lastRunAt: number | null;
  lastPreviewAt: number | null;
  lastCompiledTarget: CompileTarget | null;
  lastAction: CompileMode | null;
  checkTimeMs: number | null;
  runTimeMs: number | null;
  examplesOpen: boolean;
  settingsOpen: boolean;
  settings: PlaygroundSettings;
  autoPreview: boolean;
  cursorLine: number;
  cursorCol: number;
};

export const defaultState: PlaygroundState = {
  source: '',
  target: 'js',
  mode: 'run',
  activeTab: 'js',
  embedMode: false,
  activeExample: 'basics',
  compileResult: null,
  typeInfo: null,
  compileStatus: 'idle',
  runtimeStatus: 'idle',
  runtimeMessage: null,
  previewStatus: 'idle',
  previewMessage: null,
  previewDevice: 'desktop',
  lastRunAt: null,
  lastPreviewAt: null,
  lastCompiledTarget: null,
  lastAction: null,
  checkTimeMs: null,
  runTimeMs: null,
  examplesOpen: false,
  settingsOpen: false,
  settings: {
    theme: 'dark',
    fontSize: 15,
    tabSize: 2,
  },
  autoPreview: false,
  cursorLine: 1,
  cursorCol: 1,
};

type Listener = (state: PlaygroundState) => void;
type StatePatch = Partial<PlaygroundState> | ((state: PlaygroundState) => Partial<PlaygroundState>);

export const createPlaygroundSignal = (initial: PlaygroundState = defaultState) => {
  let state = { ...initial };
  const listeners = new Set<Listener>();

  const emit = (): void => {
    for (const listener of listeners) listener(state);
  };

  return {
    get: (): PlaygroundState => state,
    set: (patch: StatePatch): PlaygroundState => {
      const nextPatch = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...nextPatch };
      emit();
      return state;
    },
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
};

export const diagnosticsFor = (state: PlaygroundState): CompileDiagnostic[] =>
  state.compileResult?.diagnostics ?? [];

export const diagnosticCounts = (diagnostics: CompileDiagnostic[]) => ({
  errors: diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
  warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
});

export const sourceProjectInput = (source: string, action: 'check' | 'run', target: CompileTarget) => ({
  action,
  target,
  entryUri: 'main.lm',
  files: [{ uri: 'main.lm', text: source }],
});
