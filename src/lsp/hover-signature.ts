import { TextDocument } from 'vscode-languageserver-textdocument';
import { type ModuleExport, type ModuleFunction } from '../lumina/module-registry.js';
import { type Type, type TypeScheme } from '../lumina/types.js';
import { type SymbolInfo } from '../lumina/semantic.js';

export type SignatureData = { label: string; parameters: string[] };
export type SignatureHelpData = { signature: SignatureData; activeParam: number };

export type HoverSignatureContext = {
  doc: TextDocument;
  position: { line: number; character: number };
  symbols?: { get(name: string): SymbolInfo | undefined };
  moduleBindings?: Map<string, ModuleExport>;
  preludeExportMap?: Map<string, ModuleExport>;
  resolveImportedSymbol?: (name: string) => SymbolInfo | undefined;
  resolveImportedMember?: (base: string, member: string) => SymbolInfo | undefined;
  ast?: unknown;
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
        node.body?.forEach(visitStmt);
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
  return best?.node ?? null;
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

function formatSignature(
  name: string,
  paramTypes: string[],
  returnType?: string,
  paramNames?: string[]
): SignatureData {
  const parameters = paramTypes.map((type, idx) => {
    const label = paramNames?.[idx];
    return label ? `${label}: ${type}` : type;
  });
  const ret = returnType ?? 'void';
  return {
    label: `${name}(${parameters.join(', ')}) -> ${ret}`,
    parameters,
  };
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

function resolveParamNamesForCall(call: CallNode, ctx: HoverSignatureContext): string[] | undefined {
  if (call.enumName && ctx.moduleBindings) {
    const mod = ctx.moduleBindings.get(call.enumName);
    if (mod?.kind === 'module') {
      const exp = mod.exports.get(call.callee?.name ?? '');
      if (exp?.kind === 'function') return exp.paramNames;
    }
  }
  const directBinding = call.callee?.name ? ctx.moduleBindings?.get(call.callee.name) : undefined;
  if (directBinding?.kind === 'function') return directBinding.paramNames;
  const sym = call.callee?.name ? ctx.symbols?.get(call.callee.name) : undefined;
  if (sym?.kind === 'function') return sym.paramNames;
  const imported = call.callee?.name ? ctx.resolveImportedSymbol?.(call.callee.name) : undefined;
  if (imported?.kind === 'function') return imported.paramNames;
  const prelude = call.callee?.name ? ctx.preludeExportMap?.get(call.callee.name) : undefined;
  if (prelude?.kind === 'function') return prelude.paramNames;
  return undefined;
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
  const signature = ctx.hmCallSignatures.get(call.id);
  if (!signature) return null;
  const paramNames = resolveParamNamesForCall(call, ctx);
  return formatSignature(call.callee.name, signature.args, signature.returnType, paramNames);
}

export function resolveHoverLabel(ctx: HoverSignatureContext): string | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  if (ctx.ast && ctx.hmExprTypes) {
    const node = findNodeAtPosition(ctx.ast, ctx.position);
    if (node && typeof node.id === 'number') {
      const exprType = ctx.hmExprTypes.get(node.id);
      if (exprType) return exprType;
    }
  }
  const callSiteSignature = resolveCallSiteSignature(ctx, 'callee');
  if (callSiteSignature) {
    return callSiteSignature.label;
  }
  const member = findMemberAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (member) {
    if (ctx.ast && ctx.hmCallSignatures) {
      const call = findCallAtPosition(ctx.ast, ctx.position, 'call');
      if (call?.id && !ctx.hmCallSignatures.has(call.id)) {
        return null;
      }
    }
    const localSym = ctx.symbols?.get(member.base);
    if (!localSym || localSym.kind === 'type') {
      const mod = moduleBindings.get(member.base);
      if (mod?.kind === 'module') {
        const exp = mod.exports.get(member.member);
        if (exp?.kind === 'function') {
          return signatureFromModule(exp).label;
        }
      }
      const importedMember = ctx.resolveImportedMember?.(member.base, member.member);
      if (importedMember?.kind === 'function') {
        return formatSignature(member.member, importedMember.paramTypes ?? [], importedMember.type, importedMember.paramNames).label;
      }
    }
  }

  const word = getWordAt(ctx.doc, ctx.position.line, ctx.position.character);
  if (!word) return null;
  const binding = moduleBindings.get(word);
  if (binding?.kind === 'function') {
    return signatureFromModule(binding).label;
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
  return null;
}

export function resolveSignatureHelp(ctx: HoverSignatureContext): SignatureHelpData | null {
  const moduleBindings = ctx.moduleBindings ?? new Map<string, ModuleExport>();
  const call = findCallContext(ctx.doc, ctx.position.line, ctx.position.character);
  if (!call) return null;

  let signature: SignatureData | null = null;
  const callSite = resolveCallSiteSignature(ctx, 'call');
  if (callSite) {
    signature = callSite;
  }
  if (!signature && call.callee.includes('.')) {
    const [base, member] = call.callee.split('.', 2);
    const localSym = ctx.symbols?.get(base);
    if (!localSym || localSym.kind === 'type') {
      const mod = moduleBindings.get(base);
      if (mod?.kind === 'module') {
        const exp = mod.exports.get(member);
        if (exp?.kind === 'function') {
          signature = signatureFromModule(exp);
        }
      }
      if (!signature) {
        const importedMember = ctx.resolveImportedMember?.(base, member);
        if (importedMember?.kind === 'function') {
          signature = formatSignature(member, importedMember.paramTypes ?? [], importedMember.type, importedMember.paramNames);
        }
      }
    }
  } else if (!signature) {
    const sym = ctx.symbols?.get(call.callee);
    if (sym?.kind === 'function') {
      signature = formatSignature(call.callee, sym.paramTypes ?? [], sym.type, sym.paramNames);
    } else {
      const binding = moduleBindings.get(call.callee);
      if (binding?.kind === 'function') {
        signature = signatureFromModule(binding);
      }
      if (!signature) {
        const imported = ctx.resolveImportedSymbol?.(call.callee);
        if (imported?.kind === 'function') {
          signature = formatSignature(call.callee, imported.paramTypes ?? [], imported.type, imported.paramNames);
        }
      }
      if (!signature) {
        const prelude = ctx.preludeExportMap?.get(call.callee);
        if (prelude?.kind === 'function') {
          signature = signatureFromModule(prelude);
        }
      }
    }
  }

  if (!signature) return null;
  const activeParam = Math.max(0, Math.min(call.argIndex, signature.parameters.length > 0 ? signature.parameters.length - 1 : 0));
  return { signature, activeParam };
}
