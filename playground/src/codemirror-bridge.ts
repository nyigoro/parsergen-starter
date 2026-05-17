import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { luminaLanguage } from './lumina-language';
import { defaultSettings, sanitizeFontSize, sanitizeTabSize, sanitizeTheme } from './settings';
import type { PlaygroundSettings } from './state';

export type EditorMountOptions = {
  elementId: string;
  initialValue: string;
};

type ChangeHandler = (value: string) => void;
type EditorCursor = {
  line: number;
  column: number;
};

const editors = new Map<string, EditorView>();
const changeHandlers = new Map<string, Set<ChangeHandler>>();
const settingsCompartments = new Map<string, Compartment>();
let activeSettings: PlaygroundSettings = { ...defaultSettings };

const emitChange = (elementId: string): void => {
  const nextValue = getEditorText(elementId);
  for (const handler of changeHandlers.get(elementId) ?? []) {
    handler(nextValue);
  }
};

const editorTheme = EditorView.theme({
  '&': {
    minHeight: '32rem',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  '.cm-scroller': {
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    fontSize: 'var(--playground-code-font-size, 15px)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '1rem 0',
  },
  '.cm-gutters': {
    backgroundColor: '#0f1318',
    color: '#7b8492',
    border: 'none',
  },
});

const lightEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#f8fafc',
      color: '#101827',
    },
    '.cm-content': {
      caretColor: '#0f766e',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#0f766e',
    },
    '.cm-activeLine': {
      backgroundColor: '#e8eef7',
    },
    '.cm-gutters': {
      backgroundColor: '#eef3f9',
      color: '#64748b',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#e2e8f0',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: '#bfdbfe',
    },
  },
  { dark: false }
);

const settingsExtension = (settings: PlaygroundSettings) => [
  sanitizeTheme(settings.theme) === 'dark' ? oneDark : lightEditorTheme,
  EditorState.tabSize.of(sanitizeTabSize(settings.tabSize)),
];

const mountEditor = ({ elementId, initialValue }: EditorMountOptions): void => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const existing = editors.get(elementId);
  if (existing) {
    existing.destroy();
    editors.delete(elementId);
    settingsCompartments.delete(elementId);
  }

  element.innerHTML = '';
  const settingsCompartment = new Compartment();
  const view = new EditorView({
    doc: initialValue,
    extensions: [
      basicSetup,
      luminaLanguage,
      settingsCompartment.of(settingsExtension(activeSettings)),
      EditorView.lineWrapping,
      editorTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) emitChange(elementId);
      }),
    ],
    parent: element,
  });

  editors.set(elementId, view);
  settingsCompartments.set(elementId, settingsCompartment);
  emitChange(elementId);
};

const getEditorText = (elementId: string): string => {
  const view = editors.get(elementId);
  return view ? view.state.doc.toString() : '';
};

const resolvePosition = (view: EditorView, line: number, column: number): number => {
  const totalLines = view.state.doc.lines;
  const targetLine = Math.max(1, Math.min(totalLines, line));
  const lineInfo = view.state.doc.line(targetLine);
  const clampedColumn = Math.max(1, column);
  return Math.min(lineInfo.to, lineInfo.from + clampedColumn - 1);
};

const setEditorText = (elementId: string, value: string): void => {
  const view = editors.get(elementId);
  if (!view) return;

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: value,
    },
  });
};

const focusEditorLocation = (elementId: string, line: number, column: number = 1): void => {
  const view = editors.get(elementId);
  if (!view) return;

  const position = resolvePosition(view, line, column);
  view.focus();
  view.dispatch({
    selection: EditorSelection.cursor(position),
    effects: EditorView.scrollIntoView(position, {
      y: 'center',
    }),
  });
};

const getEditorCursor = (elementId: string): EditorCursor | null => {
  const view = editors.get(elementId);
  if (!view) return null;

  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return {
    line: line.number,
    column: head - line.from + 1,
  };
};

const onEditorChange = (elementId: string, handler: ChangeHandler): (() => void) => {
  const nextHandlers = changeHandlers.get(elementId) ?? new Set<ChangeHandler>();
  nextHandlers.add(handler);
  changeHandlers.set(elementId, nextHandlers);

  return () => {
    const existing = changeHandlers.get(elementId);
    if (!existing) return;
    existing.delete(handler);
    if (existing.size === 0) changeHandlers.delete(elementId);
  };
};

const applyEditorSettings = (settings: Partial<PlaygroundSettings>): void => {
  activeSettings = {
    theme: sanitizeTheme(settings.theme ?? activeSettings.theme),
    fontSize: sanitizeFontSize(settings.fontSize ?? activeSettings.fontSize),
    tabSize: sanitizeTabSize(settings.tabSize ?? activeSettings.tabSize),
  };

  document.documentElement.style.setProperty('--playground-code-font-size', `${activeSettings.fontSize}px`);
  document.documentElement.style.setProperty('--playground-tab-size', String(activeSettings.tabSize));

  for (const [elementId, view] of editors) {
    const compartment = settingsCompartments.get(elementId);
    if (!compartment) continue;
    view.dispatch({
      effects: compartment.reconfigure(settingsExtension(activeSettings)),
    });
  }
};

(globalThis as Record<string, unknown>).mountEditor = mountEditor;
(globalThis as Record<string, unknown>).getEditorText = getEditorText;
(globalThis as Record<string, unknown>).setEditorText = setEditorText;
(globalThis as Record<string, unknown>).focusEditorLocation = focusEditorLocation;
(globalThis as Record<string, unknown>).getEditorCursor = getEditorCursor;
(globalThis as Record<string, unknown>).onEditorChange = onEditorChange;
(globalThis as Record<string, unknown>).applyEditorSettings = applyEditorSettings;
