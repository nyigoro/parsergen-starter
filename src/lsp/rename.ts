import type { Position, Range, WorkspaceEdit } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Location } from '../utils/index.js';
import { ProjectContext } from '../project/context.js';
import { getWordAt } from './hover-signature.js';
import { collectReferencesByName } from './references.js';

export type RenameErrorKind =
  | 'invalid_name'
  | 'builtin'
  | 'cross_package'
  | 'ambiguous'
  | 'conflict';

export interface RenameError {
  kind: RenameErrorKind;
  message: string;
}

export interface RenameRequestData {
  project: ProjectContext;
  doc: TextDocument;
  uri: string;
  position: Position;
  newName: string;
}

export interface RenameResult {
  edit: WorkspaceEdit | null;
  errors: RenameError[];
}

const builtinTypes = new Set([
  'int',
  'float',
  'bool',
  'string',
  'void',
  'any',
  'i8',
  'i16',
  'i32',
  'i64',
  'i128',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'f32',
  'f64',
  'usize',
]);

const reservedKeywords = new Set([
  'fn',
  'let',
  'mut',
  'struct',
  'enum',
  'trait',
  'impl',
  'type',
  'if',
  'else',
  'while',
  'for',
  'match',
  'return',
  'break',
  'continue',
  'async',
  'await',
  'move',
  'ref',
  'extern',
  'pub',
  'import',
  'from',
  'where',
  'const',
]);

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function locationToRange(location: Location): Range {
  return {
    start: { line: location.start.line - 1, character: location.start.column - 1 },
    end: { line: location.end.line - 1, character: location.end.column - 1 },
  };
}

function isDependencyUri(uri: string): boolean {
  return uri.includes('/.lumina/packages/') || uri.includes('\\.lumina\\packages\\');
}

function addEdit(edit: WorkspaceEdit, uri: string, range: Range, newText: string): void {
  const list = (edit.changes ??= {});
  const edits = (list[uri] ??= []);
  const key = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}:${newText}`;
  if (edits.some((existing) => `${existing.range.start.line}:${existing.range.start.character}:${existing.range.end.line}:${existing.range.end.character}:${existing.newText}` === key)) {
    return;
  }
  edits.push({ range, newText });
}

function sortWorkspaceEdits(edit: WorkspaceEdit): void {
  if (!edit.changes) return;
  for (const [uri, edits] of Object.entries(edit.changes)) {
    edits.sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) return b.range.start.line - a.range.start.line;
      if (a.range.start.character !== b.range.start.character) return b.range.start.character - a.range.start.character;
      if (a.range.end.line !== b.range.end.line) return b.range.end.line - a.range.end.line;
      return b.range.end.character - a.range.end.character;
    });
    edit.changes[uri] = edits;
  }
}

export function applyRename(request: RenameRequestData): RenameResult {
  const { project, doc, uri, position, newName } = request;
  const errors: RenameError[] = [];
  const currentName = getWordAt(doc, position.line, position.character);
  if (!currentName) {
    return {
      edit: null,
      errors: [{ kind: 'ambiguous', message: 'No symbol found at cursor position.' }],
    };
  }
  if (currentName === newName) {
    return { edit: null, errors: [] };
  }
  if (!isValidIdentifier(newName)) {
    errors.push({ kind: 'invalid_name', message: `'${newName}' is not a valid Lumina identifier.` });
  }
  if (reservedKeywords.has(newName) || builtinTypes.has(newName)) {
    errors.push({ kind: 'builtin', message: `'${newName}' is reserved or builtin.` });
  }
  if (errors.length > 0) return { edit: null, errors };

  const def = project.findSymbolLocation(currentName, uri);
  if (def && isDependencyUri(def.uri)) {
    return {
      edit: null,
      errors: [{ kind: 'cross_package', message: 'Cannot rename symbols declared in dependency packages.' }],
    };
  }

  if (def) {
    if (project.hasSymbolGlobal(newName, { uri: def.uri, location: def.location })) {
      return {
        edit: null,
        errors: [{ kind: 'conflict', message: `Rename conflict: '${newName}' already exists in project symbols.` }],
      };
    }
    if (project.hasImportNameGlobal(newName)) {
      return {
        edit: null,
        errors: [{ kind: 'conflict', message: `Rename conflict: '${newName}' is imported in the project.` }],
      };
    }
    const refs = collectReferencesByName(project, currentName, {
      includeDeclaration: true,
      declarationHintUri: uri,
    });
    const edit: WorkspaceEdit = { changes: {} };
    for (const ref of refs) {
      addEdit(edit, ref.uri, locationToRange(ref.location), newName);
    }
    sortWorkspaceEdits(edit);
    return { edit, errors: [] };
  }

  const local = project.findLocalBindingAt(uri, position);
  if (!local) {
    return {
      edit: null,
      errors: [{ kind: 'ambiguous', message: `Could not resolve rename target for '${currentName}'.` }],
    };
  }
  if (project.hasImportNameInDoc(newName, uri)) {
    return {
      edit: null,
      errors: [{ kind: 'conflict', message: `Rename conflict: '${newName}' is imported in this file.` }],
    };
  }
  if (project.hasLocalConflictInScope(newName, uri, local.scopeRange, local.location)) {
    return {
      edit: null,
      errors: [{ kind: 'conflict', message: `Rename conflict: '${newName}' already exists in this scope.` }],
    };
  }
  const refs = project.findReferencesInScope(local.name, uri, local.scopeRange);
  const edit: WorkspaceEdit = { changes: {} };
  addEdit(edit, uri, locationToRange(local.location), newName);
  for (const ref of refs) {
    addEdit(edit, ref.uri, locationToRange(ref.location), newName);
  }
  sortWorkspaceEdits(edit);
  return { edit, errors: [] };
}
