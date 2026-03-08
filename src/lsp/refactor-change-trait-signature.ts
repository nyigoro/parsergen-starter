import {
  CodeAction,
  CodeActionKind,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import type { LuminaCall, LuminaFnDecl, LuminaProgram, LuminaTraitMethod } from '../lumina/ast.js';
import {
  addEdit,
  collectCallExpressions,
  findTraitMethodAtPosition,
  positionAt,
  rangeOfParams,
  rangeOfReturnType,
  typeExprToString,
  sortWorkspaceEdits,
} from './ast-utils.js';
import { type ParamChange } from './refactor-change-signature.js';
import { isDependencyUri } from './rename.js';

export interface ChangeTraitSignatureRequest {
  text: string;
  uri: string;
  position: Position;
  allFiles: Map<string, string>;
  allPrograms?: Map<string, LuminaProgram>;
}

export interface ChangeTraitSignatureResult {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
  callSiteCount?: number;
  fileCount?: number;
  warnings?: string[];
}

type ParamInfo = {
  name: string;
  type: string | null;
  raw: string;
};

type MethodInfo = {
  traitName: string;
  methodName: string;
  params: ParamInfo[];
  paramsStart: number;
  paramsEnd: number;
  returnRange: Range | null;
  bodyStart?: number;
  bodyEnd?: number;
};

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

function formatParams(params: ParamInfo[]): string {
  return params
    .map((param) => {
      if (!param.type) return param.raw;
      return `${param.name}: ${param.type}`;
    })
    .join(', ');
}

function methodInfoFromAst(traitName: string, method: LuminaTraitMethod | LuminaFnDecl, text: string): MethodInfo {
  const params = method.params.map((param) => {
    const type = typeExprToString(param.typeName);
    return {
      name: param.name,
      type,
      raw: type ? `${param.name}: ${type}` : param.name,
    };
  });
  return {
    traitName,
    methodName: method.name,
    params,
    paramsStart: text.length === 0 ? 0 : text.length >= 0 ? 0 : 0, // overwritten below
    paramsEnd: 0,
    returnRange: rangeOfReturnType(method, text),
    bodyStart: 'body' in method && method.body?.location?.start.offset !== undefined ? method.body.location.start.offset : undefined,
    bodyEnd: 'body' in method && method.body?.location?.end.offset !== undefined ? method.body.location.end.offset : undefined,
  };
}

function finalizedMethodInfo(traitName: string, method: LuminaTraitMethod | LuminaFnDecl, text: string): MethodInfo {
  const info = methodInfoFromAst(traitName, method, text);
  const paramsRange = rangeOfParams(method, text);
  return {
    ...info,
    paramsStart: offsetAt(text, paramsRange.start),
    paramsEnd: offsetAt(text, paramsRange.end),
  };
}

function offsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i += 1) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
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
  bodyRange: { start: number; end: number } | null,
  renames: Array<{ oldName: string; newName: string }>
) {
  if (!bodyRange) return;
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

function findMethodInfoAtPosition(
  text: string,
  position: Position,
  program?: LuminaProgram
): MethodInfo | null {
  if (!program) return null;
  const found = findTraitMethodAtPosition(program, position);
  if (!found) return null;
  return finalizedMethodInfo(found.trait.name, found.method, text);
}

function findCallArgumentRange(text: string, call: LuminaCall): { argsStart: number; argsEnd: number } | null {
  const location = call.location;
  if (!location) return null;
  const start = location.start.offset ?? offsetAt(text, { line: location.start.line - 1, character: location.start.column - 1 });
  const end = location.end.offset ?? offsetAt(text, { line: location.end.line - 1, character: location.end.column - 1 });
  const calleeEnd = call.callee.location?.end.offset ?? start;
  let openParen = -1;
  for (let i = Math.max(start, calleeEnd); i < end && i < text.length; i += 1) {
    if (text[i] === '(') {
      openParen = i;
      break;
    }
  }
  if (openParen < 0) return null;
  let depth = 0;
  for (let i = openParen; i < end && i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    if (depth === 0) {
      return { argsStart: openParen + 1, argsEnd: i };
    }
  }
  return null;
}

function collectTraitMethodCalls(
  files: Map<string, string>,
  programs: Map<string, LuminaProgram>,
  methodName: string
): Array<{ uri: string; text: string; call: LuminaCall; argsStart: number; argsEnd: number }> {
  const calls: Array<{ uri: string; text: string; call: LuminaCall; argsStart: number; argsEnd: number }> = [];
  for (const [uri, program] of programs.entries()) {
    if (isDependencyUri(uri)) continue;
    const text = files.get(uri);
    if (!text) continue;
    for (const call of collectCallExpressions(program, (candidate) => candidate.callee.name === methodName && Boolean(candidate.receiver || candidate.enumName))) {
      const range = findCallArgumentRange(text, call);
      if (!range) continue;
      calls.push({ uri, text, call, ...range });
    }
  }
  return calls;
}

export function buildChangeTraitSignatureCodeAction(
  text: string,
  uri: string,
  range: Range,
  program?: LuminaProgram
): CodeAction | null {
  const info = findMethodInfoAtPosition(text, range.start, program);
  if (!info) return null;
  return {
    title: `Change trait method signature of '${info.methodName}'`,
    kind: CodeActionKind.RefactorRewrite,
    command: {
      title: `Change trait method signature of '${info.methodName}'`,
      command: 'lumina.changeSignature',
      arguments: [
        {
          uri,
          position: range.start,
          name: info.methodName,
          params: info.params.map((param) => ({ name: param.name, type: param.type })),
          traitName: info.traitName,
          kind: 'trait-method',
        },
      ],
    },
  };
}

export function previewChangeTraitSignature(
  request: ChangeTraitSignatureRequest,
  _changes: ParamChange[] = [],
  newReturnType?: string
): { callSiteCount: number; fileCount: number; warnings: string[] } | { error: string } {
  if (isDependencyUri(request.uri)) {
    return { error: 'Cannot change trait signatures in dependency packages.' };
  }
  const info = findMethodInfoAtPosition(request.text, request.position, request.allPrograms?.get(request.uri));
  if (!info) return { error: 'No trait method found at the requested position.' };
  const files = new Map(request.allFiles);
  if (!files.has(request.uri)) files.set(request.uri, request.text);
  const programs = request.allPrograms ?? new Map<string, LuminaProgram>();
  const calls = collectTraitMethodCalls(files, programs, info.methodName);
  const warnings: string[] = [];
  if (newReturnType) warnings.push(`Return type preview target: ${newReturnType}`);
  return {
    callSiteCount: calls.length,
    fileCount: new Set(calls.map((call) => call.uri)).size,
    warnings,
  };
}

export function applyChangeTraitSignature(
  request: ChangeTraitSignatureRequest,
  newParams: ParamChange[],
  newReturnType?: string
): ChangeTraitSignatureResult {
  if (isDependencyUri(request.uri)) {
    return { ok: false, error: 'Cannot change trait signatures in dependency packages.' };
  }
  const info = findMethodInfoAtPosition(request.text, request.position, request.allPrograms?.get(request.uri));
  if (!info) return { ok: false, error: 'No trait method found at the requested position.' };

  const edit: WorkspaceEdit = { changes: {} };
  const warnings: string[] = [];
  const renames = collectRenameChanges(newParams);
  const nextParams = applyParamChangesToParams(info.params, newParams);

  addEdit(
    edit,
    request.uri,
    {
      start: positionAt(request.text, info.paramsStart),
      end: positionAt(request.text, info.paramsEnd),
    },
    formatParams(nextParams)
  );
  if (newReturnType && info.returnRange) {
    addEdit(edit, request.uri, info.returnRange, newReturnType);
  }

  const sourceProgram = request.allPrograms?.get(request.uri);
  const sourceFound = sourceProgram ? findTraitMethodAtPosition(sourceProgram, request.position) : null;
  if (sourceFound?.method.body) {
    addBodyRenameEdits(
      edit,
      request.uri,
      request.text,
      {
        start: (sourceFound.method.body.location?.start.offset ?? 0) + 1,
        end: Math.max((sourceFound.method.body.location?.start.offset ?? 0) + 1, (sourceFound.method.body.location?.end.offset ?? request.text.length) - 1),
      },
      renames
    );
  }

  const files = new Map(request.allFiles);
  if (!files.has(request.uri)) files.set(request.uri, request.text);
  const programs = request.allPrograms ?? new Map<string, LuminaProgram>();
  const implUrisTouched = new Set<string>();

  for (const [uri, program] of programs.entries()) {
    if (uri === request.uri || isDependencyUri(uri)) continue;
    const text = files.get(uri);
    if (!text) continue;
    for (const stmt of program.body) {
      if (stmt.type !== 'ImplDecl') continue;
      const traitType = typeExprToString(stmt.traitType);
      if (traitType !== info.traitName) continue;
      const method = stmt.methods.find((candidate) => candidate.name === info.methodName);
      if (!method) {
        warnings.push(`Skipped impl in ${uri}: method '${info.methodName}' not found.`);
        continue;
      }
      implUrisTouched.add(uri);
      const paramRange = rangeOfParams(method, text);
      addEdit(edit, uri, paramRange, formatParams(nextParams));
      if (newReturnType) {
        const returnRange = rangeOfReturnType(method, text);
        if (returnRange) addEdit(edit, uri, returnRange, newReturnType);
      }
      addBodyRenameEdits(
        edit,
        uri,
        text,
        method.body?.location
          ? {
              start: (method.body.location.start.offset ?? 0) + 1,
              end: Math.max((method.body.location.start.offset ?? 0) + 1, (method.body.location.end.offset ?? text.length) - 1),
            }
          : null,
        renames
      );
    }
  }

  const calls = collectTraitMethodCalls(files, programs, info.methodName);
  for (const call of calls) {
    const argsText = call.text.slice(call.argsStart, call.argsEnd);
    const args = argsText.trim() ? splitTopLevel(argsText) : [];
    const rewritten = applyParamChangesToArgs(args, newParams).join(', ');
    addEdit(
      edit,
      call.uri,
      {
        start: positionAt(call.text, call.argsStart),
        end: positionAt(call.text, call.argsEnd),
      },
      rewritten
    );
  }

  sortWorkspaceEdits(edit);
  return {
    ok: true,
    edit,
    callSiteCount: calls.length,
    fileCount: new Set([...implUrisTouched, ...calls.map((call) => call.uri)]).size,
    warnings,
  };
}
