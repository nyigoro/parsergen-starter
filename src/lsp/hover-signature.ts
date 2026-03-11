import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  type ModuleExport,
  type ModuleFunction,
  type ModuleOverloadedFunction,
} from '../lumina/module-registry.js';
import { type Type, type TypeScheme } from '../lumina/types.js';
import { type SymbolInfo } from '../lumina/semantic.js';
import type { LuminaFnDecl, LuminaProgram } from '../lumina/ast.js';
import { findFnDeclByName, textOfNode } from './ast-utils.js';

export type SignatureData = { label: string; parameters: string[] };
export type SignatureHelpData = {
  signatures: SignatureData[];
  signature: SignatureData;
  activeSignature: number;
  activeParam: number;
};

export type HoverSignatureContext = {
  doc: TextDocument;
  position: { line: number; character: number };
  symbols?: { get(name: string): SymbolInfo | undefined };
  moduleBindings?: Map<string, ModuleExport>;
  preludeExportMap?: Map<string, ModuleExport>;
  resolveImportedSymbol?: (name: string) => SymbolInfo | undefined;
  resolveImportedMember?: (base: string, member: string) => SymbolInfo | undefined;
  ast?: LuminaProgram;
  hmCallSignatures?: Map<number, { args: string[]; returnType: string }>;
  hmExprTypes?: Map<number, string>;
};

export function getWordAt(doc: TextDocument, line: number, character: number): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (offset < 0 || offset >= text.length) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  if (start === end) return null;
  const word = text.slice(start, end);
  if (!/^[A-Za-z_]/.test(word)) return null;
  return word;
}

export function findMemberAt(
  doc: TextDocument,
  line: number,
  character: number
): { base: string; member: string } | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (offset < 0 || offset > text.length) return null;
  let start = offset;
  let end = offset;
  while (start > 0 && isIdent(text[start - 1])) start--;
  while (end < text.length && isIdent(text[end])) end++;
  const word = text.slice(start, end);
  if (!word) return null;
  const leftDot = start - 1;
  if (leftDot >= 0 && text[leftDot] === '.') {
    let baseEnd = leftDot;
    let baseStart = baseEnd - 1;
    while (baseStart >= 0 && isIdent(text[baseStart])) baseStart--;
    baseStart++;
    const base = text.slice(baseStart, baseEnd);
    if (base) return { base, member: word };
  }
  if (text[end] === '.') {
    let memberStart = end + 1;
    let memberEnd = memberStart;
    while (memberEnd < text.length && isIdent(text[memberEnd])) memberEnd++;
    const member = text.slice(memberStart, memberEnd);
    if (member) return { base: word, member };
  }
  return null;
}

export function findCallContext(
  doc: TextDocument,
  line: number,
  character: number
): { callee: string; argIndex: number } | null {
  const text = doc.getText();
  const offset = doc.offsetAt({ line, character });
  let depth = 0;
  let openIndex = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth--;
    }
  }
  if (openIndex === -1) return null;
  let end = openIndex - 1;
  while (end >= 0 && /\s/.test(text[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_.]/.test(text[start])) start--;
  start++;
  const callee = text.slice(start, end + 1);
  if (!callee) return null;
  let argIndex = 0;
  let innerDepth = 0;
  for (let i = openIndex + 1; i < offset; i++) {
    const ch = text[i];
    if (ch === '(') innerDepth++;
    else if (ch === ')') innerDepth = Math.max(0, innerDepth - 1);
    else if (ch === ',' && innerDepth === 0) argIndex++;
  }
  return { callee, argIndex };
}

function locationContains(
  location: { start: { line: number; column: number }; end: { line: number; column: number } },
  pos: { line: number; column: number }
): boolean {
  if (pos.line < location.start.line || pos.line > location.end.line) return false;
  if (pos.line === location.start.line && pos.column < location.start.column) return false;
  if (pos.line === location.end.line && pos.column > location.end.column) return false;
  return true;
}

function isPositionAfter(
  pos: { line: number; column: number },
  limit: { line: number; column: number }
): boolean {
  if (pos.line !== limit.line) return pos.line > limit.line;
  return pos.column > limit.column;
}

type BlockLike = {
  body?: unknown[];
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
};

function isLocallyShadowedAtPosition(
  program: unknown,
  name: string,
  position: { line: number; character: number }
): boolean {
  if (!program || typeof program !== 'object') return false;
  const targetPos = { line: position.line + 1, column: position.character + 1 };

  const visitBlock = (block: BlockLike | null | undefined): boolean => {
    if (!block || !Array.isArray(block.body)) return false;
    for (const stmt of block.body) {
      if (!stmt || typeof stmt !== 'object') continue;
      const node = stmt as {
        type?: string;
        name?: string;
        location?: { start: { line: number; column: number }; end: { line: number; column: number } };
        params?: Array<{ name?: string }>;
        body?: BlockLike;
        thenBlock?: BlockLike;
        elseBlock?: BlockLike;
        arms?: Array<{ body?: BlockLike }>;
      };
      if (node.location && isPositionAfter(node.location.start, targetPos)) {
        break;
      }
      if (node.type === 'Let' && node.name === name) {
        return true;
      }
      if (node.type === 'FnDecl' && node.body?.location && locationContains(node.body.location, targetPos)) {
        if (node.params?.some((param) => param.name === name)) {
          return true;
        }
        return visitBlock(node.body);
      }
      if (node.type === 'Block' && node.body?.location && locationContains(node.body.location, targetPos)) {
        if (visitBlock(node.body)) return true;
      }
      if (node.type === 'If') {
        if (node.thenBlock?.location && locationContains(node.thenBlock.location, targetPos)) {
          if (visitBlock(node.thenBlock)) return true;
        }
        if (node.elseBlock?.location && locationContains(node.elseBlock.location, targetPos)) {
          if (visitBlock(node.elseBlock)) return true;
        }
      }
      if (node.type === 'While' && node.body?.location && locationContains(node.body.location, targetPos)) {
        if (visitBlock(node.body)) return true;
      }
      if (node.type === 'MatchStmt') {
        for (const arm of node.arms ?? []) {
          if (arm.body?.location && locationContains(arm.body.location, targetPos)) {
            if (visitBlock(arm.body)) return true;
          }
        }
      }
    }
    return false;
  };

  const root = program as BlockLike & { type?: string };
  if (root.type !== 'Program') return false;
  return visitBlock(root);
}

type NodeWithId = { id?: number; type?: string; location?: { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } } };

function findNodeAtPosition(program: unknown, position: { line: number; character: number }): NodeWithId | null {
  if (!program || typeof program !== 'object') return null;
  const pos = { line: position.line + 1, column: position.character + 1 };
  let best: { node: NodeWithId; size: number } | null = null;

  const nodeSize = (location: NodeWithId['location']): number => {
    if (!location) return Number.MAX_SAFE_INTEGER;
    const startOffset = location.start.offset ?? 0;
    const endOffset = location.end.offset ?? startOffset;
    if (endOffset !== startOffset) return Math.max(1, endOffset - startOffset);
    const lineSpan = location.end.line - location.start.line;
    const colSpan = location.end.column - location.start.column;
    return Math.max(1, lineSpan * 1000 + colSpan);
  };

  const consider = (node: NodeWithId) => {
    if (!node.location || typeof node.id !== 'number') return;
    if (!locationContains(node.location, pos)) return;
    const size = nodeSize(node.location);
    if (!best || size < best.size) {
      best = { node, size };
    }
  };

  const visitExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object') return;
    const node = expr as NodeWithId & {
      left?: unknown;
      right?: unknown;
      args?: unknown[];
      value?: unknown;
      object?: unknown;
      fields?: Array<{ value?: unknown }>;
      arms?: Array<{ body?: unknown }>;
      callee?: unknown;
      target?: unknown;
    };
    consider(node);
    switch (node.type) {
      case 'Binary':
        visitExpr(node.left);
        visitExpr(node.right);
        return;
      case 'Call':
        visitExpr(node.callee);
        node.args?.forEach(visitExpr);
        return;
      case 'Member':
        visitExpr(node.object);
        return;
      case 'IsExpr':
        visitExpr(node.value);
        return;
      case 'MatchExpr':
        visitExpr(node.value);
        node.arms?.forEach((arm) => visitExpr(arm.body));
        return;
      case 'StructLiteral':
        node.fields?.forEach((field) => visitExpr(field.value));
        return;
      case 'Move':
        visitExpr(node.target);
        return;
      default:
        return;
    }
  };

  const visitStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object') return;
    const node = stmt as NodeWithId & {
      body?: { body?: unknown[] };
      expr?: unknown;
      value?: unknown;
      condition?: unknown;
      thenBlock?: { body?: unknown[] };
      elseBlock?: { body?: unknown[] };
      arms?: Array<{ body?: { body?: unknown[] } }>;
      target?: unknown;
    };
    consider(node);
    switch (node.type) {
      case 'FnDecl':
        node.body?.body?.forEach(visitStmt);
        return;
      case 'Block':
        (node.body as unknown[] | undefined)?.forEach(visitStmt);
        return;
      case 'Let':
        visitExpr(node.value);
        return;
      case 'Return':
        visitExpr(node.value);
        return;
      case 'ExprStmt':
        visitExpr(node.expr);
        return;
      case 'If':
        visitExpr(node.condition);
        node.thenBlock?.body?.forEach(visitStmt);
        node.elseBlock?.body?.forEach(visitStmt);
        return;
      case 'While':
        visitExpr(node.condition);
        node.body?.body?.forEach(visitStmt);
        return;
      case 'MatchStmt':
        visitExpr(node.value);
        node.arms?.forEach((arm) => arm.body?.body?.forEach(visitStmt));
        return;
      case 'Assign':
        visitExpr(node.target);
        visitExpr(node.value);
        return;
      default:
        return;
    }
  };

  const prog = program as { type?: string; body?: unknown[] };
  if (prog.type === 'Program' && Array.isArray(prog.body)) {
    prog.body.forEach(visitStmt);
  }
  return best ? best.node : null;
}

type CallNode = {
  type?: string;
  id?: number;
  callee?: { name: string; location?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } } };
  enumName?: string | null;
  args?: unknown[];
  location?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } };
};

function findCallAtPosition(
  program: unknown,
  position: { line: number; character: number },
  mode: 'callee' | 'call'
): CallNode | null {
  if (!program || typeof program !== 'object') return null;
  const pos = { line: position.line + 1, column: position.character + 1 };
  let found: CallNode | null = null;

  const matchesCall = (node: CallNode): boolean => {
    if (mode === 'callee') {
      return node.callee?.location ? locationContains(node.callee.location, pos) : false;
    }
    if (node.location && locationContains(node.location, pos)) return true;
    return node.callee?.location ? locationContains(node.callee.location, pos) : false;
  };

  const visitExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object' || found) return;
    const node = expr as { type?: string };
    switch (node.type) {
      case 'Call': {
        const callNode = node as CallNode;
        if (matchesCall(callNode)) {
          found = callNode;
          return;
        }
        callNode.args?.forEach(visitExpr);
        return;
      }
      case 'Binary': {
        const bin = node as { left?: unknown; right?: unknown };
        visitExpr(bin.left);
        visitExpr(bin.right);
        return;
      }
      case 'Member': {
        const member = node as { object?: unknown };
        visitExpr(member.object);
        return;
      }
      case 'IsExpr': {
        const isExpr = node as { value?: unknown };
        visitExpr(isExpr.value);
        return;
      }
      case 'MatchExpr': {
        const matchExpr = node as { value?: unknown; arms?: Array<{ body?: unknown }> };
        visitExpr(matchExpr.value);
        matchExpr.arms?.forEach((arm) => visitExpr(arm.body));
        return;
      }
      case 'StructLiteral': {
        const literal = node as { fields?: Array<{ value?: unknown }> };
        literal.fields?.forEach((field) => visitExpr(field.value));
        return;
      }
      default:
        return;
    }
  };

  const visitStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object' || found) return;
    const node = stmt as { type?: string };
    switch (node.type) {
      case 'FnDecl': {
        const fn = node as { body?: { body?: unknown[] } };
        fn.body?.body?.forEach(visitStmt);
        return;
      }
      case 'Block': {
        const block = node as { body?: unknown[] };
        block.body?.forEach(visitStmt);
        return;
      }
      case 'Let': {
        const letStmt = node as { value?: unknown };
        visitExpr(letStmt.value);
        return;
      }
      case 'Return': {
        const ret = node as { value?: unknown };
        visitExpr(ret.value);
        return;
      }
      case 'ExprStmt': {
        const exprStmt = node as { expr?: unknown };
        visitExpr(exprStmt.expr);
        return;
      }
      case 'If': {
        const ifStmt = node as { condition?: unknown; thenBlock?: { body?: unknown[] }; elseBlock?: { body?: unknown[] } };
        visitExpr(ifStmt.condition);
        ifStmt.thenBlock?.body?.forEach(visitStmt);
        ifStmt.elseBlock?.body?.forEach(visitStmt);
        return;
      }
      case 'While': {
        const whileStmt = node as { condition?: unknown; body?: { body?: unknown[] } };
        visitExpr(whileStmt.condition);
        whileStmt.body?.body?.forEach(visitStmt);
        return;
      }
      case 'MatchStmt': {
        const matchStmt = node as { value?: unknown; arms?: Array<{ body?: { body?: unknown[] } }> };
        visitExpr(matchStmt.value);
        matchStmt.arms?.forEach((arm) => arm.body?.body?.forEach(visitStmt));
        return;
      }
      case 'Assign': {
        const assign = node as { value?: unknown };
        visitExpr(assign.value);
        return;
      }
      default:
        return;
    }
  };

  const prog = program as { type?: string; body?: unknown[] };
  if (prog.type === 'Program' && Array.isArray(prog.body)) {
    prog.body.forEach(visitStmt);
  }
  return found;
}

function locationSize(
  location?: { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } }
): number {
  if (!location) return Number.MAX_SAFE_INTEGER;
  const startOffset = location.start.offset ?? 0;
  const endOffset = location.end.offset ?? startOffset;
  if (endOffset !== startOffset) return Math.max(1, endOffset - startOffset);
  const lineSpan = location.end.line - location.start.line;
  const colSpan = location.end.column - location.start.column;
  return Math.max(1, lineSpan * 1000 + colSpan);
}

function collectCallsContainingPosition(
  program: unknown,
  position: { line: number; character: number }
): CallNode[] {
  if (!program || typeof program !== 'object') return [];
  const pos = { line: position.line + 1, column: position.character + 1 };
  const calls: CallNode[] = [];

  const visitExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object') return;
    const node = expr as { type?: string };
    if (node.type === 'Call') {
      const callNode = node as CallNode;
      if (callNode.location && locationContains(callNode.location, pos)) {
        calls.push(callNode);
      }
      callNode.args?.forEach(visitExpr);
      const receiver = callNode as { receiver?: unknown };
      visitExpr(receiver.receiver);
      visitExpr(callNode.callee);
      return;
    }
    const rich = node as {
      left?: unknown;
      right?: unknown;
      value?: unknown;
      object?: unknown;
      expr?: unknown;
      target?: unknown;
      condition?: unknown;
      thenExpr?: unknown;
      elseExpr?: unknown;
      elements?: unknown[];
      fields?: Array<{ value?: unknown }>;
      arms?: Array<{ body?: unknown; guard?: unknown }>;
      args?: unknown[];
      receiver?: unknown;
    };
    visitExpr(rich.left);
    visitExpr(rich.right);
    visitExpr(rich.value);
    visitExpr(rich.object);
    visitExpr(rich.expr);
    visitExpr(rich.target);
    visitExpr(rich.condition);
    visitExpr(rich.thenExpr);
    visitExpr(rich.elseExpr);
    rich.elements?.forEach(visitExpr);
    rich.fields?.forEach((field) => visitExpr(field.value));
    rich.args?.forEach(visitExpr);
    visitExpr(rich.receiver);
    rich.arms?.forEach((arm) => {
      visitExpr(arm.guard);
      visitExpr(arm.body);
    });
  };

  const visitStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object') return;
    const node = stmt as { type?: string };
    const rich = node as {
      body?: unknown[] | { body?: unknown[] };
      value?: unknown;
      expr?: unknown;
      condition?: unknown;
      target?: unknown;
      thenBlock?: { body?: unknown[] };
      elseBlock?: { body?: unknown[] };
      arms?: Array<{ body?: unknown | { body?: unknown[] }; guard?: unknown; pattern?: unknown }>;
      iterable?: unknown;
      pattern?: unknown;
    };
    switch (node.type) {
      case 'FnDecl':
        if (rich.body && typeof rich.body === 'object' && Array.isArray((rich.body as { body?: unknown[] }).body)) {
          (rich.body as { body?: unknown[] }).body?.forEach(visitStmt);
        }
        return;
      case 'Block':
        if (Array.isArray(rich.body)) rich.body.forEach(visitStmt);
        return;
      default:
        visitExpr(rich.value);
        visitExpr(rich.expr);
        visitExpr(rich.condition);
        visitExpr(rich.target);
        visitExpr(rich.iterable);
        if (rich.thenBlock?.body) rich.thenBlock.body.forEach(visitStmt);
        if (rich.elseBlock?.body) rich.elseBlock.body.forEach(visitStmt);
        rich.arms?.forEach((arm) => {
          visitExpr(arm.guard);
          const armBody = arm.body as { body?: unknown[] } | undefined;
          if (armBody && Array.isArray(armBody.body)) {
            armBody.body.forEach(visitStmt);
          } else {
            visitExpr(arm.body);
          }
        });
        return;
    }
  };

  const prog = program as { type?: string; body?: unknown[] };
  if (prog.type === 'Program' && Array.isArray(prog.body)) {
    prog.body.forEach(visitStmt);
  }
  calls.sort((a, b) => locationSize(a.location) - locationSize(b.location));
  return calls;
}

function findOpenParenOffsetForCall(text: string, call: CallNode): number {
  const callStart = call.location?.start.offset ?? 0;
  const callEnd = call.location?.end.offset ?? callStart;
  const calleeEnd = call.callee?.location?.end.offset ?? callStart;
  const searchStart = Math.min(Math.max(calleeEnd, 0), Math.max(callEnd, 0));
  for (let i = searchStart; i < callEnd && i < text.length; i += 1) {
    if (text[i] === '(') return i;
  }
  for (let i = callStart; i < callEnd && i < text.length; i += 1) {
    if (text[i] === '(') return i;
  }
  return -1;
}

function countCallArgumentIndex(text: string, openParenOffset: number, cursorOffset: number): number {
  if (openParenOffset < 0) return 0;
  const end = Math.max(openParenOffset, Math.min(cursorOffset, text.length));
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let argIndex = 0;
  let quote: '"' | "'" | null = null;
  for (let i = openParenOffset + 1; i < end; i += 1) {
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
    if (ch === '(') {
      parenDepth += 1;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth -= 1;
      continue;
    }
    if (ch === '[') {
      bracketDepth += 1;
      continue;
    }
    if (ch === ']') {
      if (bracketDepth > 0) bracketDepth -= 1;
      continue;
    }
    if (ch === '{') {
      braceDepth += 1;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) braceDepth -= 1;
      continue;
    }
    if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      argIndex += 1;
    }
  }
  return Math.max(0, argIndex);
}

function findActiveCallFromAst(ctx: HoverSignatureContext): { call: CallNode; argIndex: number } | null {
  if (!ctx.ast) return null;
  const calls = collectCallsContainingPosition(ctx.ast, ctx.position);
  if (calls.length === 0) return null;
  const active = calls[0];
  const openParen = findOpenParenOffsetForCall(ctx.doc.getText(), active);
  if (openParen < 0) return null;
  const cursorOffset = ctx.doc.offsetAt(ctx.position);
  const argIndex = countCallArgumentIndex(ctx.doc.getText(), openParen, cursorOffset);
  return { call: active, argIndex };
}

function formatSignature(
  name: string,
  paramTypes: string[],
  returnType?: string,
  paramNames?: string[]
): SignatureData {
  const parameters = paramTypes.map((type, idx) => {
    const label = paramNames?.[idx];
    if (!label) return type;
    const eqIndex = label.indexOf('=');
    if (eqIndex === -1) return `${label}: ${type}`;
    const namePart = label.slice(0, eqIndex).trim();
    const defaultPart = label.slice(eqIndex + 1).trim();
    if (!defaultPart) return `${namePart}: ${type}`;
    return `${namePart}: ${type} = ${defaultPart}`;
  });
  const ret = returnType ?? 'void';
  return {
    label: `${name}(${parameters.join(', ')}) -> ${ret}`,
    parameters,
  };
}

function buildParamLabelsWithDefaults(fn: LuminaFnDecl, text: string): string[] {
  return fn.params.map((param) => {
    if (!param.defaultValue) return param.name;
    const defaultText = textOfNode(param.defaultValue, text);
    if (!defaultText) return param.name;
    return `${param.name}=${defaultText}`;
  });
}

function formatTypeFromScheme(type: Type, typeVars: Map<number, string>): string {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'variable':
      return typeVars.get(type.id) ?? `T${type.id}`;
    case 'function': {
      const args = type.args.map((arg) => formatTypeFromScheme(arg, typeVars)).join(', ');
      const ret = formatTypeFromScheme(type.returnType, typeVars);
      return `(${args}) -> ${ret}`;
    }
    case 'adt': {
      if (type.params.length === 0) return type.name;
      const params = type.params.map((param) => formatTypeFromScheme(param, typeVars)).join(', ');
      return `${type.name}<${params}>`;
    }
    default:
      return 'unknown';
  }
}

function makeTypeVarMap(scheme: TypeScheme): Map<number, string> {
  const names = ['T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const map = new Map<number, string>();
  scheme.variables.forEach((id, idx) => {
    const base = names[idx] ?? 'T';
    map.set(id, idx < names.length ? base : `${base}${idx}`);
  });
  return map;
}

function formatSignatureFromScheme(
  name: string,
  scheme: TypeScheme,
  paramNames?: string[]
): SignatureData | null {
  if (scheme.type.kind !== 'function') return null;
  const typeVars = makeTypeVarMap(scheme);
  const params = scheme.type.args.map((arg) => formatTypeFromScheme(arg, typeVars));
  const returnType = formatTypeFromScheme(scheme.type.returnType, typeVars);
  return formatSignature(name, params, returnType, paramNames);
}

function signatureFromModule(fn: ModuleFunction): SignatureData {
  return formatSignatureFromScheme(fn.name, fn.hmType, fn.paramNames) ?? formatSignature(fn.name, fn.paramTypes, fn.returnType, fn.paramNames);
}

function pickOverloadVariant(
  overloaded: ModuleOverloadedFunction,
  argCount?: number
): ModuleFunction {
  if (typeof argCount === 'number') {
    const exact = overloaded.variants.find((variant) => variant.paramTypes.length === argCount);
    if (exact) return exact;
  }
  return overloaded.variants[0];
}

function normalizeSigTypeName(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === 'int') return 'i32';
  if (lower === 'float') return 'f64';
  if (lower === 'boolean') return 'bool';
  return value.trim();
}

function hmArgToText(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'name' in (arg as Record<string, unknown>)) {
    return String((arg as { name: unknown }).name);
  }
  return String(arg ?? '');
}

function chooseBestOverloadIndex(
  overloaded: ModuleOverloadedFunction,
  hmArgs?: unknown[],
  argIndex?: number
): number {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const targetArgCount = hmArgs?.length ?? (typeof argIndex === 'number' ? argIndex + 1 : undefined);
  for (let i = 0; i < overloaded.variants.length; i += 1) {
    const variant = overloaded.variants[i];
    let score = 0;
    if (typeof targetArgCount === 'number') {
      if (variant.paramTypes.length === targetArgCount) score += 100;
      else score -= Math.abs(variant.paramTypes.length - targetArgCount) * 10;
    }
    if (hmArgs && hmArgs.length > 0) {
      const shared = Math.min(hmArgs.length, variant.paramTypes.length);
      for (let j = 0; j < shared; j += 1) {
        if (normalizeSigTypeName(hmArgToText(hmArgs[j])) === normalizeSigTypeName(variant.paramTypes[j])) {
          score += 5;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function overloadSignatures(
  overloaded: ModuleOverloadedFunction
): SignatureData[] {
  return overloaded.variants.map((variant) => signatureFromModule(variant));
}

function signatureFromCallNode(
  call: CallNode,
  ctx: HoverSignatureContext,
  argIndex?: number
): { signatures: SignatureData[]; activeSignature: number } | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const hmSig = typeof call.id === 'number' ? ctx.hmCallSignatures?.get(call.id) : undefined;
  const calleeName = call.callee?.name;
  const hmSignature = (paramNames?: string[]): SignatureData | null => {
    if (!hmSig || !calleeName) return null;
    return formatSignature(calleeName, hmSig.args, hmSig.returnType, paramNames);
  };
  if (call.enumName) {
    const mod = moduleBindings.get(call.enumName);
    if (mod?.kind !== 'module') return null;
    const exp = mod.exports.get(call.callee?.name ?? '');
    if (!exp) return null;
    const paramNames =
      exp.kind === 'function'
        ? exp.paramNames
        : exp.kind === 'overloaded-function'
          ? pickOverloadVariant(exp, call.args?.length).paramNames
          : undefined;
    const hmResolved = hmSignature(paramNames);
    if (hmResolved && exp.kind === 'function') {
      return { signatures: [hmResolved], activeSignature: 0 };
    }
    if (exp.kind === 'function') {
      return { signatures: [signatureFromModule(exp)], activeSignature: 0 };
    }
    if (exp.kind === 'overloaded-function') {
      const signatures = overloadSignatures(exp);
      const activeSignature = chooseBestOverloadIndex(exp, hmSig?.args as unknown[] | undefined, argIndex);
      return { signatures, activeSignature };
    }
    return null;
  }

  if (!calleeName) return null;

  const directBinding = moduleBindings.get(calleeName);
  const directParamNames = directBinding?.kind === 'function' ? directBinding.paramNames : undefined;
  const hmResolvedDirect = hmSignature(directParamNames);
  if (hmResolvedDirect && directBinding?.kind === 'function') {
    return { signatures: [hmResolvedDirect], activeSignature: 0 };
  }
  if (directBinding?.kind === 'function') {
    return { signatures: [signatureFromModule(directBinding)], activeSignature: 0 };
  }
  if (directBinding?.kind === 'overloaded-function') {
    const signatures = overloadSignatures(directBinding);
    const activeSignature = chooseBestOverloadIndex(directBinding, hmSig?.args as unknown[] | undefined, argIndex);
    return { signatures, activeSignature };
  }

  const sym = ctx.symbols?.get(calleeName);
  const hmResolvedSymbol = hmSignature(sym?.kind === 'function' ? sym.paramNames : undefined);
  if (hmResolvedSymbol && sym?.kind === 'function') {
    return { signatures: [hmResolvedSymbol], activeSignature: 0 };
  }
  if (sym?.kind === 'function') {
    return {
      signatures: [formatSignature(calleeName, sym.paramTypes ?? [], sym.type, sym.paramNames)],
      activeSignature: 0,
    };
  }

  const imported = ctx.resolveImportedSymbol?.(calleeName);
  const hmResolvedImported = hmSignature(imported?.kind === 'function' ? imported.paramNames : undefined);
  if (hmResolvedImported && imported?.kind === 'function') {
    return { signatures: [hmResolvedImported], activeSignature: 0 };
  }
  if (imported?.kind === 'function') {
    return {
      signatures: [formatSignature(calleeName, imported.paramTypes ?? [], imported.type, imported.paramNames)],
      activeSignature: 0,
    };
  }

  const prelude = ctx.preludeExportMap?.get(calleeName);
  const hmResolvedPrelude = hmSignature(prelude?.kind === 'function' ? prelude.paramNames : undefined);
  if (hmResolvedPrelude && prelude?.kind === 'function') {
    return { signatures: [hmResolvedPrelude], activeSignature: 0 };
  }
  if (prelude?.kind === 'function') {
    return { signatures: [signatureFromModule(prelude)], activeSignature: 0 };
  }
  if (prelude?.kind === 'overloaded-function') {
    const signatures = overloadSignatures(prelude);
    const activeSignature = chooseBestOverloadIndex(prelude, hmSig?.args as unknown[] | undefined, argIndex);
    return { signatures, activeSignature };
  }

  return null;
}

function resolveParamNamesForCall(call: CallNode, ctx: HoverSignatureContext): string[] | undefined {
  if (call.enumName && ctx.moduleBindings) {
    const mod = ctx.moduleBindings.get(call.enumName);
    if (mod?.kind === 'module') {
      const exp = mod.exports.get(call.callee?.name ?? '');
      if (exp?.kind === 'function') return exp.paramNames;
      if (exp?.kind === 'overloaded-function') {
        return pickOverloadVariant(exp, call.args?.length).paramNames;
      }
    }
  }
  const directBinding = call.callee?.name ? ctx.moduleBindings?.get(call.callee.name) : undefined;
  if (directBinding?.kind === 'function') return directBinding.paramNames;
  if (directBinding?.kind === 'overloaded-function') {
    return pickOverloadVariant(directBinding, call.args?.length).paramNames;
  }
  const sym = call.callee?.name ? ctx.symbols?.get(call.callee.name) : undefined;
  if (sym?.kind === 'function') return sym.paramNames;
  const imported = call.callee?.name ? ctx.resolveImportedSymbol?.(call.callee.name) : undefined;
  if (imported?.kind === 'function') return imported.paramNames;
  const prelude = call.callee?.name ? ctx.preludeExportMap?.get(call.callee.name) : undefined;
  if (prelude?.kind === 'function') return prelude.paramNames;
  return undefined;
}

function resolveParamLabelsForCall(call: CallNode, ctx: HoverSignatureContext): string[] | undefined {
  if (!ctx.ast) return undefined;
  if (call.enumName || call.receiver) return undefined;
  if (!call.callee?.name) return undefined;
  const fn = findFnDeclByName(ctx.ast, call.callee.name);
  if (!fn) return undefined;
  return buildParamLabelsWithDefaults(fn, ctx.doc.getText());
}

function resolveCallSiteSignature(
  ctx: HoverSignatureContext,
  mode: 'callee' | 'call'
): SignatureData | null {
  if (!ctx.ast || !ctx.hmCallSignatures) return null;
  let call = findCallAtPosition(ctx.ast, ctx.position, mode);
  if (!call && mode === 'callee') {
    call = findCallAtPosition(ctx.ast, ctx.position, 'call');
  }
  if (!call || !call.callee?.name || typeof call.id !== 'number') return null;
  // Preserve namespace/member hover semantics: module-qualified calls are resolved
  // through symbol/module lookup (including shadowing), not HM call-site signatures.
  if (call.enumName) return null;
  const signature = ctx.hmCallSignatures.get(call.id);
  if (!signature) return null;
  const paramNames = resolveParamLabelsForCall(call, ctx) ?? resolveParamNamesForCall(call, ctx);
  return formatSignature(call.callee.name, signature.args, signature.returnType, paramNames);
}

export function resolveHoverLabel(ctx: HoverSignatureContext): string | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const callSiteSignature = resolveCallSiteSignature(ctx, 'callee');
  if (callSiteSignature) {
    return callSiteSignature.label;
  }
  const member = findMemberAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (member) {
    if (isLocallyShadowedAtPosition(ctx.ast, member.base, ctx.position)) {
      return null;
    }
    const localSym = ctx.symbols?.get(member.base);
    if (localSym && localSym.kind !== 'type') {
      return null;
    }
    const importedMember = ctx.resolveImportedMember?.(member.base, member.member);
    if (importedMember?.kind === 'function') {
      return formatSignature(
        member.member,
        importedMember.paramTypes ?? [],
        importedMember.type,
        importedMember.paramNames
      ).label;
    }
    const mod = moduleBindings.get(member.base);
    if (mod?.kind === 'module') {
      const exp = mod.exports.get(member.member);
      if (exp?.kind === 'function') {
        return signatureFromModule(exp).label;
      }
      if (exp?.kind === 'overloaded-function') {
        return signatureFromModule(pickOverloadVariant(exp)).label;
      }
    }
  }

  const word = getWordAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (!word) return null;
  const binding = moduleBindings.get(word);
  if (binding?.kind === 'function') {
    return signatureFromModule(binding).label;
  }
  if (binding?.kind === 'overloaded-function') {
    return signatureFromModule(pickOverloadVariant(binding)).label;
  }
  const sym = ctx.symbols?.get(word);
  if (sym?.kind === 'function') {
    return formatSignature(word, sym.paramTypes ?? [], sym.type, sym.paramNames).label;
  }
  const imported = ctx.resolveImportedSymbol?.(word);
  if (imported?.kind === 'function') {
    return formatSignature(word, imported.paramTypes ?? [], imported.type, imported.paramNames).label;
  }
  const prelude = ctx.preludeExportMap?.get(word);
  if (prelude?.kind === 'function') {
    return signatureFromModule(prelude).label;
  }
  if (prelude?.kind === 'overloaded-function') {
    return signatureFromModule(pickOverloadVariant(prelude)).label;
  }
  if (ctx.ast && ctx.hmExprTypes) {
    const node = findNodeAtPosition(ctx.ast, ctx.position);
    if (node && typeof node.id === 'number') {
      const exprType = ctx.hmExprTypes.get(node.id);
      if (exprType) return exprType;
    }
  }
  return null;
}

export function resolveSignatureHelp(ctx: HoverSignatureContext): SignatureHelpData | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const astCall = findActiveCallFromAst(ctx);
  if (astCall) {
    const resolved = signatureFromCallNode(astCall.call, ctx, astCall.argIndex);
    if (resolved && resolved.signatures.length > 0) {
      const activeSignature = Math.max(
        0,
        Math.min(resolved.activeSignature, resolved.signatures.length - 1)
      );
      const activeSig = resolved.signatures[activeSignature];
      const activeParam = Math.max(
        0,
        Math.min(astCall.argIndex, activeSig.parameters.length > 0 ? activeSig.parameters.length - 1 : 0)
      );
      return {
        signatures: resolved.signatures,
        signature: activeSig,
        activeSignature,
        activeParam,
      };
    }
  }

  const call = findCallContext(ctx.doc, ctx.position.line, ctx.position.character);
  if (!call) return null;

  let signatures: SignatureData[] = [];
  let activeSignature = 0;
  const callSite = resolveCallSiteSignature(ctx, 'call');
  if (callSite) {
    signatures = [callSite];
  }
  if (signatures.length === 0 && call.callee.includes('.')) {
    const [base, member] = call.callee.split('.', 2);
    const localSym = ctx.symbols?.get(base);
    if (!localSym || localSym.kind === 'type') {
      const mod = moduleBindings.get(base);
      if (mod?.kind === 'module') {
        const exp = mod.exports.get(member);
        if (exp?.kind === 'function') {
          signatures = [signatureFromModule(exp)];
        }
        if (signatures.length === 0 && exp?.kind === 'overloaded-function') {
          signatures = overloadSignatures(exp);
          activeSignature = chooseBestOverloadIndex(exp, undefined, call.argIndex);
        }
      }
      if (signatures.length === 0) {
        const importedMember = ctx.resolveImportedMember?.(base, member);
        if (importedMember?.kind === 'function') {
          signatures = [
            formatSignature(member, importedMember.paramTypes ?? [], importedMember.type, importedMember.paramNames),
          ];
        }
      }
    }
  } else if (signatures.length === 0) {
    const sym = ctx.symbols?.get(call.callee);
    if (sym?.kind === 'function') {
      signatures = [formatSignature(call.callee, sym.paramTypes ?? [], sym.type, sym.paramNames)];
    } else {
      const binding = moduleBindings.get(call.callee);
      if (binding?.kind === 'function') {
        signatures = [signatureFromModule(binding)];
      }
      if (signatures.length === 0 && binding?.kind === 'overloaded-function') {
        signatures = overloadSignatures(binding);
        activeSignature = chooseBestOverloadIndex(binding, undefined, call.argIndex);
      }
      if (signatures.length === 0) {
        const imported = ctx.resolveImportedSymbol?.(call.callee);
        if (imported?.kind === 'function') {
          signatures = [formatSignature(call.callee, imported.paramTypes ?? [], imported.type, imported.paramNames)];
        }
      }
      if (signatures.length === 0) {
        const prelude = ctx.preludeExportMap?.get(call.callee);
        if (prelude?.kind === 'function') {
          signatures = [signatureFromModule(prelude)];
        }
        if (signatures.length === 0 && prelude?.kind === 'overloaded-function') {
          signatures = overloadSignatures(prelude);
          activeSignature = chooseBestOverloadIndex(prelude, undefined, call.argIndex);
        }
      }
    }
  }

  if (signatures.length === 0) return null;
  activeSignature = Math.max(0, Math.min(activeSignature, signatures.length - 1));
  const signature = signatures[activeSignature];
  const activeParam = Math.max(
    0,
    Math.min(call.argIndex, signature.parameters.length > 0 ? signature.parameters.length - 1 : 0)
  );
  return { signatures, signature, activeSignature, activeParam };
}
