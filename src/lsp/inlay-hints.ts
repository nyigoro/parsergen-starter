import { InlayHintKind, type InlayHint, type Range } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ModuleExport } from '../lumina/module-registry.js';
import type { SymbolInfo } from '../lumina/semantic.js';

type AstNode = {
  type?: string;
  id?: number;
  name?: string;
  typeName?: unknown;
  location?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
  body?: unknown[];
  params?: Array<{ name?: string }>;
  value?: unknown;
  expr?: unknown;
  condition?: unknown;
  thenBlock?: { body?: unknown[] };
  elseBlock?: { body?: unknown[] } | null;
  arms?: Array<{ body?: unknown } | { body?: { body?: unknown[] } }>;
  target?: unknown;
  object?: unknown;
  index?: unknown;
  left?: unknown;
  right?: unknown;
  args?: unknown[];
  callee?: { name?: string };
  enumName?: string | null;
  receiver?: unknown;
  property?: string;
};

export type InlayHintContext = {
  doc: TextDocument;
  ast?: unknown;
  range?: Range;
  symbols?: { get(name: string): SymbolInfo | undefined };
  moduleBindings?: Map<string, ModuleExport>;
  hmExprTypes?: Map<number, string>;
};

const METHOD_PARAM_NAMES: Record<string, string[]> = {
  push: ['value'],
  get: ['index'],
  len: [],
  pop: [],
  clear: [],
  insert: ['key', 'value'],
  remove: ['key'],
  contains_key: ['key'],
  keys: [],
  values: [],
  contains: ['value'],
};

function hasContentInRange(
  location: AstNode['location'] | undefined,
  range: Range | undefined
): boolean {
  if (!range || !location) return true;
  const startLine = location.start.line - 1;
  const startChar = location.start.column - 1;
  const endLine = location.end.line - 1;
  const endChar = location.end.column - 1;
  if (endLine < range.start.line || startLine > range.end.line) return false;
  if (endLine === range.start.line && endChar < range.start.character) return false;
  if (startLine === range.end.line && startChar > range.end.character) return false;
  return true;
}

function hintPositionFromName(
  doc: TextDocument,
  location: AstNode['location'] | undefined,
  name: string
): { line: number; character: number } | null {
  if (!location) return null;
  const line = location.start.line - 1;
  const startCol = Math.max(0, location.start.column - 1);
  const endCol = Math.max(startCol, location.end.column - 1);
  const text = doc.getText({
    start: { line, character: startCol },
    end: { line, character: endCol },
  });
  const match = new RegExp(`\\b${name}\\b`).exec(text);
  if (!match) return null;
  return { line, character: startCol + match.index + name.length };
}

function buildTypeHint(
  doc: TextDocument,
  node: AstNode,
  name: string,
  type: string
): InlayHint | null {
  const position = hintPositionFromName(doc, node.location, name);
  if (!position) return null;
  return {
    position,
    label: `: ${type}`,
    kind: InlayHintKind.Type,
    paddingLeft: true,
  };
}

function resolveCallParamNames(
  node: AstNode,
  symbols: InlayHintContext['symbols'],
  moduleBindings: InlayHintContext['moduleBindings']
): string[] | null {
  const calleeName = node.callee?.name;
  if (!calleeName) return null;

  if (node.receiver) {
    return METHOD_PARAM_NAMES[calleeName] ?? null;
  }

  if (node.enumName && moduleBindings) {
    const mod = moduleBindings.get(node.enumName);
    if (mod?.kind === 'module') {
      const member = mod.exports.get(calleeName);
      if (member?.kind === 'function') return member.paramNames ?? [];
    }
    return null;
  }

  const binding = moduleBindings?.get(calleeName);
  if (binding?.kind === 'function') return binding.paramNames ?? [];

  const sym = symbols?.get(calleeName);
  if (sym?.kind === 'function') return sym.paramNames ?? [];

  return null;
}

function argStartsWithName(arg: unknown, name: string): boolean {
  if (!arg || typeof arg !== 'object') return false;
  const n = arg as { type?: string; name?: string };
  return n.type === 'Identifier' && n.name === name;
}

export function buildInlayHints(ctx: InlayHintContext): InlayHint[] {
  const hints: InlayHint[] = [];
  const program = ctx.ast as { type?: string; body?: unknown[] } | undefined;
  if (!program || program.type !== 'Program' || !Array.isArray(program.body)) return hints;

  const visitExpr = (expr: unknown) => {
    if (!expr || typeof expr !== 'object') return;
    const node = expr as AstNode;
    if (!hasContentInRange(node.location, ctx.range)) return;

    if (node.type === 'Call') {
      const paramNames = resolveCallParamNames(node, ctx.symbols, ctx.moduleBindings);
      if (paramNames && Array.isArray(node.args)) {
        node.args.forEach((arg, idx) => {
          const paramName = paramNames[idx];
          if (!paramName) return;
          if (argStartsWithName(arg, paramName)) return;
          const argNode = arg as AstNode;
          const loc = argNode.location;
          if (!loc) return;
          hints.push({
            position: { line: loc.start.line - 1, character: loc.start.column - 1 },
            label: `${paramName}:`,
            kind: InlayHintKind.Parameter,
            paddingRight: true,
          });
        });
      }
      visitExpr(node.receiver);
      visitExpr(node.callee);
      node.args?.forEach(visitExpr);
      return;
    }

    if (node.type === 'Binary') {
      visitExpr(node.left);
      visitExpr(node.right);
      return;
    }
    if (node.type === 'Member') {
      visitExpr(node.object);
      return;
    }
    if (node.type === 'Index') {
      visitExpr(node.object);
      visitExpr(node.index);
      return;
    }
    if (node.type === 'MatchExpr') {
      visitExpr(node.value);
      (node.arms ?? []).forEach((arm) => visitExpr((arm as { body?: unknown }).body));
      return;
    }
    if (node.type === 'StructLiteral') {
      const fields = (node as { fields?: Array<{ value?: unknown }> }).fields ?? [];
      fields.forEach((field) => visitExpr(field.value));
      return;
    }
  };

  const visitStmt = (stmt: unknown) => {
    if (!stmt || typeof stmt !== 'object') return;
    const node = stmt as AstNode;
    if (!hasContentInRange(node.location, ctx.range)) return;

    if (node.type === 'FnDecl') {
      const body = (node as { body?: { body?: unknown[] } }).body?.body ?? [];
      body.forEach(visitStmt);
      return;
    }
    if (node.type === 'Let') {
      if (!node.typeName && node.name) {
        const inferred =
          (typeof node.value === 'object' && node.value && typeof (node.value as AstNode).id === 'number'
            ? ctx.hmExprTypes?.get((node.value as AstNode).id as number)
            : undefined) ??
          ctx.symbols?.get(node.name)?.type;
        if (inferred && inferred !== 'any' && !/^unknown/i.test(inferred)) {
          const hint = buildTypeHint(ctx.doc, node, node.name, inferred);
          if (hint) hints.push(hint);
        }
      }
      visitExpr(node.value);
      return;
    }
    if (node.type === 'ExprStmt') {
      visitExpr(node.expr);
      return;
    }
    if (node.type === 'Return') {
      visitExpr(node.value);
      return;
    }
    if (node.type === 'Assign') {
      visitExpr(node.target);
      visitExpr(node.value);
      return;
    }
    if (node.type === 'If') {
      visitExpr(node.condition);
      (node.thenBlock?.body ?? []).forEach(visitStmt);
      (node.elseBlock?.body ?? []).forEach(visitStmt);
      return;
    }
    if (node.type === 'While') {
      visitExpr(node.condition);
      ((node as { body?: { body?: unknown[] } }).body?.body ?? []).forEach(visitStmt);
      return;
    }
    if (node.type === 'Block') {
      (node.body ?? []).forEach(visitStmt);
      return;
    }
    if (node.type === 'MatchStmt') {
      visitExpr(node.value);
      (node.arms ?? []).forEach((arm) => {
        const body = (arm as { body?: { body?: unknown[] } }).body?.body ?? [];
        body.forEach(visitStmt);
      });
      return;
    }
  };

  program.body.forEach(visitStmt);
  return hints;
}
