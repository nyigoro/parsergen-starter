import {
  CodeAction,
  CodeActionKind,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import { addEdit, isDependencyUri, sortWorkspaceEdits } from './rename.js';

type ParamInfo = {
  name: string;
  type: string | null;
  raw: string;
};

export interface ChangeSignatureRequest {
  text: string;
  uri: string;
  position: Position;
  allFiles: Map<string, string>;
}

export type ParamChange =
  | { kind: 'rename'; index: number; oldName: string; newName: string }
  | { kind: 'reorder'; fromIndex: number; toIndex: number }
  | { kind: 'add'; index: number; name: string; type: string; defaultValue?: string }
  | { kind: 'remove'; index: number };

export interface ChangeSignatureResult {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
}

type FunctionSignatureInfo = {
  name: string;
  params: ParamInfo[];
  paramsStart: number;
  paramsEnd: number;
  bodyStart: number;
  bodyEnd: number;
};

function getOffsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

function positionAt(text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depthParen = 0;
  let depthAngle = 0;
  let depthBrace = 0;
  let current = '';
  for (const ch of value) {
    if (ch === ',' && depthParen === 0 && depthAngle === 0 && depthBrace === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
    if (ch === '(') depthParen += 1;
    if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    if (ch === '<') depthAngle += 1;
    if (ch === '>') depthAngle = Math.max(0, depthAngle - 1);
    if (ch === '{') depthBrace += 1;
    if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseParams(paramText: string): ParamInfo[] {
  if (!paramText.trim()) return [];
  return splitTopLevel(paramText).map((entry) => {
    const match = /^(?:ref\s+)?(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(entry.trim());
    if (!match) {
      return { name: entry.trim(), type: null, raw: entry.trim() };
    }
    return {
      name: match[1],
      type: match[2].trim(),
      raw: entry.trim(),
    };
  });
}

function formatParams(params: ParamInfo[]): string {
  return params
    .map((param) => {
      if (!param.type) return param.raw;
      return `${param.name}: ${param.type}`;
    })
    .join(', ');
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < text.length; cursor++) {
    const ch = text[cursor];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return cursor;
  }
  return text.length;
}

function findFunctionAtPosition(text: string, position: Position): FunctionSignatureInfo | null {
  const offset = getOffsetAt(text, position);
  const re = /(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>\s*)?\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    const openParen = text.indexOf('(', match.index);
    if (openParen < 0) continue;
    let depth = 0;
    let closeParen = -1;
    for (let cursor = openParen; cursor < text.length; cursor++) {
      const ch = text[cursor];
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth === 0) {
        closeParen = cursor;
        break;
      }
    }
    if (closeParen < 0) continue;
    const bodyStart = text.indexOf('{', closeParen);
    if (bodyStart < 0) continue;
    const bodyEnd = findMatchingBrace(text, bodyStart);
    if (offset < match.index || offset > bodyEnd) continue;
    const paramText = text.slice(openParen + 1, closeParen);
    return {
      name,
      params: parseParams(paramText),
      paramsStart: openParen + 1,
      paramsEnd: closeParen,
      bodyStart,
      bodyEnd,
    };
  }
  return null;
}

function applyParamChangesToParams(params: ParamInfo[], changes: ParamChange[]): ParamInfo[] {
  const next = [...params];
  for (const change of changes) {
    switch (change.kind) {
      case 'rename':
        if (next[change.index]) next[change.index] = { ...next[change.index], name: change.newName };
        break;
      case 'reorder': {
        if (!next[change.fromIndex] || change.fromIndex === change.toIndex) break;
        const [moved] = next.splice(change.fromIndex, 1);
        next.splice(change.toIndex, 0, moved);
        break;
      }
      case 'add':
        next.splice(change.index, 0, { name: change.name, type: change.type, raw: `${change.name}: ${change.type}` });
        break;
      case 'remove':
        if (change.index >= 0 && change.index < next.length) next.splice(change.index, 1);
        break;
    }
  }
  return next;
}

function applyParamChangesToArgs(args: string[], changes: ParamChange[]): string[] {
  const next = [...args];
  for (const change of changes) {
    switch (change.kind) {
      case 'rename':
        if (next[change.index] && next[change.index].trim().startsWith(`${change.oldName}:`)) {
          next[change.index] = next[change.index].replace(
            new RegExp(`^\\s*${change.oldName}\\s*:`),
            `${change.newName}:`
          );
        }
        break;
      case 'reorder': {
        if (!next[change.fromIndex] || change.fromIndex === change.toIndex) break;
        const [moved] = next.splice(change.fromIndex, 1);
        next.splice(change.toIndex, 0, moved);
        break;
      }
      case 'add':
        next.splice(change.index, 0, change.defaultValue ?? '_');
        break;
      case 'remove':
        if (change.index >= 0 && change.index < next.length) next.splice(change.index, 1);
        break;
    }
  }
  return next;
}

function collectRenameChanges(changes: ParamChange[]): Array<{ oldName: string; newName: string }> {
  return changes
    .filter((change): change is Extract<ParamChange, { kind: 'rename' }> => change.kind === 'rename')
    .map((change) => ({ oldName: change.oldName, newName: change.newName }));
}

function addBodyRenameEdits(
  edit: WorkspaceEdit,
  uri: string,
  text: string,
  bodyRange: { start: number; end: number },
  renames: Array<{ oldName: string; newName: string }>
) {
  const body = text.slice(bodyRange.start, bodyRange.end);
  for (const rename of renames) {
    const regex = new RegExp(`\\b${rename.oldName}\\b`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(body)) !== null) {
      const absoluteStart = bodyRange.start + match.index;
      addEdit(
        edit,
        uri,
        {
          start: positionAt(text, absoluteStart),
          end: positionAt(text, absoluteStart + rename.oldName.length),
        },
        rename.newName
      );
    }
  }
}

function findCallSites(text: string, fnName: string): Array<{ argsStart: number; argsEnd: number }> {
  const sites: Array<{ argsStart: number; argsEnd: number }> = [];
  const regex = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const prefix = text.slice(Math.max(0, start - 6), start);
    const before = start > 0 ? text[start - 1] : '';
    if (prefix.includes('fn ') || before === '.' || /[A-Za-z0-9_]/.test(before)) continue;
    const openParen = text.indexOf('(', start);
    if (openParen < 0) continue;
    let depth = 0;
    for (let cursor = openParen; cursor < text.length; cursor++) {
      const ch = text[cursor];
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth === 0) {
        sites.push({ argsStart: openParen + 1, argsEnd: cursor });
        break;
      }
    }
  }
  return sites;
}

export function buildChangeSignatureCodeAction(text: string, uri: string, range: Range): CodeAction | null {
  const fn = findFunctionAtPosition(text, range.start);
  if (!fn) return null;
  return {
    title: `Change signature of '${fn.name}'`,
    kind: CodeActionKind.RefactorRewrite,
    command: {
      title: `Change signature of '${fn.name}'`,
      command: 'lumina.changeSignature',
      arguments: [
        {
          uri,
          position: range.start,
          params: fn.params.map((param) => ({ name: param.name, type: param.type })),
        },
      ],
    },
  };
}

export function applyChangeSignature(
  request: ChangeSignatureRequest,
  newParams: ParamChange[]
): ChangeSignatureResult {
  if (isDependencyUri(request.uri)) {
    return { ok: false, error: 'Cannot change signatures in dependency packages.' };
  }
  const fn = findFunctionAtPosition(request.text, request.position);
  if (!fn) return { ok: false, error: 'No function declaration found at the requested position.' };
  if (fn.params.some((param) => param.raw.includes('...'))) {
    return { ok: false, error: 'Variadic signatures are not supported.' };
  }

  const updatedParams = applyParamChangesToParams(fn.params, newParams);
  const renames = collectRenameChanges(newParams);
  const edit: WorkspaceEdit = { changes: {} };

  addEdit(
    edit,
    request.uri,
    {
      start: positionAt(request.text, fn.paramsStart),
      end: positionAt(request.text, fn.paramsEnd),
    },
    formatParams(updatedParams)
  );

  if (renames.length > 0) {
    addBodyRenameEdits(
      edit,
      request.uri,
      request.text,
      { start: fn.bodyStart + 1, end: fn.bodyEnd },
      renames
    );
  }

  const files = new Map(request.allFiles);
  if (!files.has(request.uri)) files.set(request.uri, request.text);
  for (const [uri, text] of files.entries()) {
    if (isDependencyUri(uri)) continue;
    const sites = findCallSites(text, fn.name);
    for (const site of sites) {
      const argsText = text.slice(site.argsStart, site.argsEnd);
      if (argsText.includes('...')) continue;
      const args = argsText.trim() ? splitTopLevel(argsText) : [];
      const rewrittenArgs = applyParamChangesToArgs(args, newParams).join(', ');
      addEdit(
        edit,
        uri,
        {
          start: positionAt(text, site.argsStart),
          end: positionAt(text, site.argsEnd),
        },
        rewrittenArgs
      );
    }
  }

  sortWorkspaceEdits(edit);
  return { ok: true, edit };
}
