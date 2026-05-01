import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { luminaLanguage } from './lumina-language';

export type EditorMountOptions = {
  elementId: string;
  initialValue: string;
};

type ChangeHandler = (value: string) => void;

const editors = new Map<string, EditorView>();
const changeHandlers = new Map<string, Set<ChangeHandler>>();

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
    fontSize: '0.95rem',
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

const mountEditor = ({ elementId, initialValue }: EditorMountOptions): void => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const existing = editors.get(elementId);
  if (existing) {
    existing.destroy();
    editors.delete(elementId);
  }

  element.innerHTML = '';
  const view = new EditorView({
    doc: initialValue,
    extensions: [
      basicSetup,
      luminaLanguage,
      oneDark,
      EditorView.lineWrapping,
      editorTheme,
      EditorView.updateListener.of(update => {
        if (update.docChanged) emitChange(elementId);
      }),
    ],
    parent: element,
  });

  editors.set(elementId, view);
  emitChange(elementId);
};

const getEditorText = (elementId: string): string => {
  const view = editors.get(elementId);
  return view ? view.state.doc.toString() : '';
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

(globalThis as Record<string, unknown>).mountEditor = mountEditor;
(globalThis as Record<string, unknown>).getEditorText = getEditorText;
(globalThis as Record<string, unknown>).setEditorText = setEditorText;
(globalThis as Record<string, unknown>).onEditorChange = onEditorChange;
