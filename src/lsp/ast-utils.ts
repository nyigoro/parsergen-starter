import type { Position, Range, WorkspaceEdit } from 'vscode-languageserver/node';
import type { Location } from '../utils/index.js';
import {
  type LuminaBlock,
  type LuminaCall,
  type LuminaExpr,
  type LuminaFnDecl,
  type LuminaImplDecl,
  type LuminaImport,
  type LuminaMatchExpr,
  type LuminaMatchStmt,
  type LuminaProgram,
  type LuminaStatement,
  type LuminaTraitDecl,
  type LuminaTraitMethod,
  type LuminaTypeExpr,
} from '../lumina/ast.js';
import { addEdit as addWorkspaceEdit, sortWorkspaceEdits as sortWorkspaceEdit } from './rename.js';

export function offsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i += 1) offset += (lines[i] ?? '').length + 1;
  return offset + pos.character;
}

export function positionAt(text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const prefix = text.slice(0, clamped);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, character: clamped - lineStart };
}

export function rangeFromLocation(location: Location | undefined): Range {
  return {
    start: {
      line: Math.max(0, (location?.start.line ?? 1) - 1),
      character: Math.max(0, (location?.start.column ?? 1) - 1),
    },
    end: {
      line: Math.max(0, (location?.end.line ?? location?.start.line ?? 1) - 1),
      character: Math.max(0, (location?.end.column ?? location?.start.column ?? 1) - 1),
    },
  };
}

export function locationContainsPosition(location: Location | undefined, pos: Position): boolean {
  if (!location) return false;
  const line = pos.line + 1;
  const column = pos.character + 1;
  if (line < location.start.line || line > location.end.line) return false;
  if (line === location.start.line && column < location.start.column) return false;
  if (line === location.end.line && column > location.end.column) return false;
  return true;
}

function locationSize(location: Location | undefined): number {
  if (!location) return Number.MAX_SAFE_INTEGER;
  const startOffset = location.start.offset ?? 0;
  const endOffset = location.end.offset ?? startOffset;
  if (endOffset !== startOffset) return Math.max(1, endOffset - startOffset);
  return Math.max(1, (location.end.line - location.start.line) * 1000 + (location.end.column - location.start.column));
}

export function addEdit(edit: WorkspaceEdit, uri: string, range: Range, newText: string): void {
  addWorkspaceEdit(edit, uri, range, newText);
}

export const sortWorkspaceEdits = sortWorkspaceEdit;

function lineStartOffset(text: string, offset: number): number {
  let cursor = Math.max(0, Math.min(offset, text.length));
  while (cursor > 0 && text[cursor - 1] !== '\n') cursor -= 1;
  return cursor;
}

function nodeStartOffset(node: { type?: string; location?: Location }, text: string): number {
  const startOffset = node.location?.start.offset ?? offsetAt(text, rangeFromLocation(node.location).start);
  if (node.type === 'Import') return startOffset;
  if (
    node.type === 'FnDecl' ||
    node.type === 'TraitMethod' ||
    node.type === 'StructDecl' ||
    node.type === 'EnumDecl' ||
    node.type === 'TraitDecl' ||
    node.type === 'TypeDecl'
  ) {
    return lineStartOffset(text, startOffset);
  }
  return startOffset;
}

function nodeEndOffset(node: { type?: string; location?: Location; body?: LuminaBlock | null }, text: string): number {
  const location = node.location;
  const defaultEnd = location?.end.offset ?? offsetAt(text, rangeFromLocation(location).end);
  if (node.type === 'Import') return defaultEnd;
  if ((node.type === 'FnDecl' || node.type === 'TraitMethod') && node.body?.location) {
    return node.body.location.end.offset ?? offsetAt(text, rangeFromLocation(node.body.location).end);
  }
  if (
    node.type === 'StructDecl' ||
    node.type === 'EnumDecl' ||
    node.type === 'TraitDecl' ||
    node.type === 'TypeDecl'
  ) {
    const start = location?.start.offset ?? offsetAt(text, rangeFromLocation(location).start);
    const openBrace = text.indexOf('{', start);
    if (openBrace >= 0) {
      const closeBrace = findMatchingDelimiter(text, openBrace, '{', '}');
      if (closeBrace >= openBrace) return closeBrace + 1;
    }
    const lineEnd = text.indexOf('\n', start);
    return lineEnd >= 0 ? lineEnd : text.length;
  }
  return defaultEnd;
}

export function rangeOfNode(node: { type?: string; location?: Location; body?: LuminaBlock | null }, text: string): Range {
  const start = nodeStartOffset(node, text);
  const end = nodeEndOffset(node, text);
  return {
    start: positionAt(text, start),
    end: positionAt(text, end),
  };
}

export function textOfNode(node: { type?: string; location?: Location; body?: LuminaBlock | null }, text: string): string {
  const range = rangeOfNode(node, text);
  return text.slice(offsetAt(text, range.start), offsetAt(text, range.end));
}

function findMatchingDelimiter(text: string, openOffset: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openOffset; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === openCh) depth += 1;
    if (ch === closeCh) depth -= 1;
    if (depth === 0) return i;
  }
  return text.length;
}

function declarationHeaderStart(fn: { name: string; location?: Location }, text: string): number {
  const startOffset = fn.location?.start.offset;
  if (typeof startOffset === 'number') return startOffset;
  return offsetAt(text, rangeFromLocation(fn.location).start);
}

export function rangeOfParams(fn: LuminaFnDecl | LuminaTraitMethod, text: string): Range {
  const headerStart = declarationHeaderStart(fn, text);
  const bodyStart =
    'body' in fn && fn.body?.location?.start.offset !== undefined
      ? fn.body.location.start.offset
      : fn.location?.end.offset ?? text.length;
  const headerSlice = text.slice(headerStart, bodyStart);
  const fnNameIndex = headerSlice.indexOf(fn.name);
  const openParen = headerSlice.indexOf('(', fnNameIndex >= 0 ? fnNameIndex + fn.name.length : 0);
  if (openParen < 0) {
    return rangeOfNode(fn, text);
  }
  const absoluteOpen = headerStart + openParen;
  const absoluteClose = findMatchingDelimiter(text, absoluteOpen, '(', ')');
  return {
    start: positionAt(text, absoluteOpen + 1),
    end: positionAt(text, absoluteClose),
  };
}

export function rangeOfReturnType(fn: LuminaFnDecl | LuminaTraitMethod, text: string): Range | null {
  const location = fn.location;
  if (!location) return null;
  const startOffset = location.start.offset ?? offsetAt(text, rangeFromLocation(location).start);
  const bodyStart =
    'body' in fn && fn.body?.location?.start.offset !== undefined
      ? fn.body.location.start.offset
      : location.end.offset ?? offsetAt(text, rangeFromLocation(location).end);
  const headerSlice = text.slice(startOffset, bodyStart);
  const closeParenRel = headerSlice.lastIndexOf(')');
  if (closeParenRel < 0) return null;
  const tail = headerSlice.slice(closeParenRel + 1);
  const arrow = tail.indexOf('->');
  if (arrow < 0) return null;
  let absStart = startOffset + closeParenRel + 1 + arrow + 2;
  while (absStart < text.length && /\s/.test(text[absStart])) absStart += 1;
  let absEnd = bodyStart;
  const tailAfterArrow = text.slice(absStart, bodyStart);
  const whereMatch = /\bwhere\b/.exec(tailAfterArrow);
  if (whereMatch) absEnd = absStart + whereMatch.index;
  while (absEnd > absStart && /\s/.test(text[absEnd - 1])) absEnd -= 1;
  return absEnd > absStart ? { start: positionAt(text, absStart), end: positionAt(text, absEnd) } : null;
}

function preferSmaller<T extends { location?: Location }>(best: T | null, next: T): T {
  if (!best) return next;
  return locationSize(next.location) < locationSize(best.location) ? next : best;
}

export function findTopLevelDeclAtPosition(program: LuminaProgram, pos: Position): LuminaStatement | null {
  let best: LuminaStatement | null = null;
  for (const stmt of program.body) {
    if (!locationContainsPosition(stmt.location, pos)) continue;
    best = preferSmaller(best, stmt);
  }
  return best;
}

export function findFnDeclAtPosition(program: LuminaProgram, pos: Position, _text?: string): LuminaFnDecl | null {
  let best: LuminaFnDecl | null = null;
  for (const stmt of program.body) {
    if (
      stmt.type === 'FnDecl' &&
      (locationContainsPosition(stmt.location, pos) || locationContainsPosition(stmt.body?.location, pos))
    ) {
      best = preferSmaller(best, stmt);
    }
    if (stmt.type === 'ImplDecl' && locationContainsPosition(stmt.location, pos)) {
      for (const method of stmt.methods) {
        if (!locationContainsPosition(method.location, pos) && !locationContainsPosition(method.body?.location, pos)) continue;
        best = preferSmaller(best, method);
      }
    }
  }
  return best;
}

export function findFnDeclByName(program: LuminaProgram, name: string): LuminaFnDecl | null {
  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl' && stmt.name === name) return stmt;
    if (stmt.type === 'ImplDecl') {
      const method = stmt.methods.find((item) => item.name === name);
      if (method) return method;
    }
  }
  return null;
}

export function findImplDeclAtPosition(program: LuminaProgram, pos: Position): LuminaImplDecl | null {
  let best: LuminaImplDecl | null = null;
  for (const stmt of program.body) {
    if (stmt.type !== 'ImplDecl') continue;
    if (!locationContainsPosition(stmt.location, pos)) continue;
    best = preferSmaller(best, stmt);
  }
  return best;
}

export function findTraitDecl(program: LuminaProgram, traitName: string): LuminaTraitDecl | null {
  for (const stmt of program.body) {
    if (stmt.type === 'TraitDecl' && stmt.name === traitName) return stmt;
  }
  return null;
}

export function findTraitMethodAtPosition(program: LuminaProgram, pos: Position): { trait: LuminaTraitDecl; method: LuminaTraitMethod } | null {
  let best: { trait: LuminaTraitDecl; method: LuminaTraitMethod } | null = null;
  for (const stmt of program.body) {
    if (stmt.type !== 'TraitDecl') continue;
    for (const method of stmt.methods) {
      if (!locationContainsPosition(method.location, pos) && !locationContainsPosition(method.body?.location, pos)) continue;
      if (!best || locationSize(method.location) < locationSize(best.method.location)) {
        best = { trait: stmt, method };
      }
    }
  }
  return best;
}

export function typeExprToString(typeExpr: LuminaTypeExpr | null | undefined): string | null {
  if (typeExpr == null) return null;
  if (typeof typeExpr === 'string') return typeExpr;
  if ('kind' in typeExpr && typeExpr.kind === 'TypeHole') return '_';
  if ('kind' in typeExpr && typeExpr.kind === 'array') {
    const element = typeExprToString(typeExpr.element) ?? '_';
    if (typeExpr.size) return `[${element}; const]`;
    return `[${element}]`;
  }
  return String(typeExpr);
}

export function findImportDeclarations(program: LuminaProgram): LuminaImport[] {
  return program.body.filter((stmt): stmt is LuminaImport => stmt.type === 'Import');
}

export function collectCallExpressions(program: LuminaProgram, predicate?: (call: LuminaCall) => boolean): LuminaCall[] {
  const calls: LuminaCall[] = [];

  const visitExpr = (expr: LuminaExpr | null | undefined) => {
    if (!expr) return;
    switch (expr.type) {
      case 'Call':
        if (!predicate || predicate(expr)) calls.push(expr);
        if (expr.receiver) visitExpr(expr.receiver);
        for (const arg of expr.args) visitExpr(arg);
        return;
      case 'Binary':
        visitExpr(expr.left);
        visitExpr(expr.right);
        return;
      case 'Lambda':
        visitBlock(expr.body);
        return;
      case 'Member':
        visitExpr(expr.object);
        return;
      case 'Move':
        visitExpr(expr.target);
        return;
      case 'Await':
      case 'Try':
        visitExpr(expr.value);
        return;
      case 'Cast':
        visitExpr(expr.expr);
        return;
      case 'StructLiteral':
        for (const field of expr.fields) visitExpr(field.value);
        return;
      case 'Range':
        visitExpr(expr.start);
        visitExpr(expr.end);
        return;
      case 'ArrayLiteral':
      case 'TupleLiteral':
        for (const element of expr.elements) visitExpr(element);
        return;
      case 'ArrayRepeatLiteral':
        visitExpr(expr.value);
        visitExpr(expr.count);
        return;
      case 'MacroInvoke':
        for (const arg of expr.args) visitExpr(arg);
        return;
      case 'Index':
        visitExpr(expr.object);
        visitExpr(expr.index);
        return;
      case 'IsExpr':
        visitExpr(expr.value);
        return;
      case 'InterpolatedString':
        for (const part of expr.parts) {
          if (typeof part !== 'string') visitExpr(part);
        }
        return;
      case 'SelectExpr':
        for (const arm of expr.arms) {
          visitExpr(arm.value);
          visitExpr(arm.body);
        }
        return;
      case 'MatchExpr':
        visitMatchExpr(expr);
        return;
      default:
        return;
    }
  };

  const visitMatchExpr = (expr: LuminaMatchExpr) => {
    visitExpr(expr.value);
    for (const arm of expr.arms) {
      if (arm.guard) visitExpr(arm.guard);
      visitExpr(arm.body);
    }
  };

  const visitBlock = (block: LuminaBlock | null | undefined) => {
    if (!block) return;
    for (const stmt of block.body) visitStmt(stmt);
  };

  const visitMatchStmt = (stmt: LuminaMatchStmt) => {
    visitExpr(stmt.value);
    for (const arm of stmt.arms) {
      if (arm.guard) visitExpr(arm.guard);
      visitBlock(arm.body);
    }
  };

  const visitStmt = (stmt: LuminaStatement) => {
    switch (stmt.type) {
      case 'FnDecl':
        visitBlock(stmt.body);
        return;
      case 'ImplDecl':
        for (const method of stmt.methods) visitBlock(method.body);
        return;
      case 'TraitDecl':
        for (const method of stmt.methods) {
          if (method.body) visitBlock(method.body);
        }
        return;
      case 'Let':
      case 'LetTuple':
        visitExpr(stmt.value);
        return;
      case 'LetElse':
        visitExpr(stmt.value);
        visitBlock(stmt.elseBlock);
        return;
      case 'Return':
        visitExpr(stmt.value);
        return;
      case 'If':
        visitExpr(stmt.condition);
        visitBlock(stmt.thenBlock);
        visitBlock(stmt.elseBlock ?? undefined);
        return;
      case 'IfLet':
        visitExpr(stmt.value);
        visitBlock(stmt.thenBlock);
        visitBlock(stmt.elseBlock ?? undefined);
        return;
      case 'While':
        visitExpr(stmt.condition);
        visitBlock(stmt.body);
        return;
      case 'WhileLet':
        visitExpr(stmt.value);
        visitBlock(stmt.body);
        return;
      case 'For':
        visitExpr(stmt.iterable);
        visitBlock(stmt.body);
        return;
      case 'Assign':
        visitExpr(stmt.target);
        visitExpr(stmt.value);
        return;
      case 'MatchStmt':
        visitMatchStmt(stmt);
        return;
      case 'ExprStmt':
        visitExpr(stmt.expr);
        return;
      case 'Block':
        visitBlock(stmt);
        return;
      default:
        return;
    }
  };

  for (const stmt of program.body) visitStmt(stmt);
  return calls;
}
