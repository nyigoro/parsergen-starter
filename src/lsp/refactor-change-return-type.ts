import {
  CodeAction,
  CodeActionKind,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import type { LuminaBlock, LuminaCall, LuminaExpr, LuminaFnDecl, LuminaProgram, LuminaStatement } from '../lumina/ast.js';
import {
  addEdit,
  findFnDeclAtPosition,
  positionAt,
  rangeOfNode,
  rangeOfReturnType,
  textOfNode,
  typeExprToString,
  sortWorkspaceEdits,
} from './ast-utils.js';
import { isDependencyUri } from './rename.js';

export interface ChangeReturnTypeRequest {
  text: string;
  uri: string;
  position: Position;
  allFiles: Map<string, string>;
  allPrograms?: Map<string, LuminaProgram>;
}

export interface ChangeReturnTypePreview {
  callSiteCount: number;
  fileCount: number;
  warnings: string[];
}

export interface ChangeReturnTypeResult extends ChangeReturnTypePreview {
  ok: boolean;
  error?: string;
  edit?: WorkspaceEdit;
}

type CallUsage = {
  uri: string;
  text: string;
  call: LuminaCall;
  usage: 'let' | 'return' | 'expr' | 'other';
  callerReturnType: string | null;
  stmt?: LuminaStatement;
};

function getFunctionReturnType(fn: LuminaFnDecl): string {
  return typeExprToString(fn.returnType) ?? 'void';
}

function wrapperKind(typeName: string): 'result' | 'option' | null {
  const trimmed = typeName.trim();
  if (/^Result\s*</.test(trimmed)) return 'result';
  if (/^Option\s*</.test(trimmed)) return 'option';
  return null;
}

function supportsTryPropagation(typeName: string, wrapper: 'result' | 'option'): boolean {
  const current = wrapperKind(typeName);
  return current === wrapper;
}

function findFunctionInfo(
  text: string,
  position: Position,
  program?: LuminaProgram
): { fn: LuminaFnDecl; returnType: string } | null {
  const fn = program ? findFnDeclAtPosition(program, position, text) : null;
  if (!fn) return null;
  return { fn, returnType: getFunctionReturnType(fn) };
}

function declarationInsertionOffset(fn: LuminaFnDecl, text: string): number {
  const bodyStart = fn.body.location?.start.offset;
  if (typeof bodyStart === 'number') return bodyStart;
  const range = rangeOfNode(fn.body, text);
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < range.start.line; i += 1) offset += (lines[i] ?? '').length + 1;
  return offset + range.start.character;
}

function visitExpr(expr: LuminaExpr | undefined | null, visit: (expr: LuminaExpr) => void): void {
  if (!expr) return;
  visit(expr);
  switch (expr.type) {
    case 'Binary':
      visitExpr(expr.left, visit);
      visitExpr(expr.right, visit);
      return;
    case 'Lambda':
      visitBlock(expr.body, null, visit, () => {});
      return;
    case 'Member':
      visitExpr(expr.object, visit);
      return;
    case 'Await':
    case 'Try':
      visitExpr(expr.value, visit);
      return;
    case 'Cast':
      visitExpr(expr.expr, visit);
      return;
    case 'StructLiteral':
      expr.fields.forEach((field) => visitExpr(field.value, visit));
      return;
    case 'Range':
      visitExpr(expr.start, visit);
      visitExpr(expr.end, visit);
      return;
    case 'ArrayLiteral':
    case 'TupleLiteral':
      expr.elements.forEach((element) => visitExpr(element, visit));
      return;
    case 'ArrayRepeatLiteral':
      visitExpr(expr.value, visit);
      visitExpr(expr.count, visit);
      return;
    case 'MacroInvoke':
      expr.args.forEach((arg) => visitExpr(arg, visit));
      return;
    case 'Index':
      visitExpr(expr.object, visit);
      visitExpr(expr.index, visit);
      return;
    case 'IsExpr':
      visitExpr(expr.value, visit);
      return;
    case 'InterpolatedString':
      expr.parts.forEach((part) => {
        if (typeof part !== 'string') visitExpr(part, visit);
      });
      return;
    case 'SelectExpr':
      expr.arms.forEach((arm) => {
        visitExpr(arm.value, visit);
        visitExpr(arm.body, visit);
      });
      return;
    case 'MatchExpr':
      visitExpr(expr.value, visit);
      expr.arms.forEach((arm) => {
        if (arm.guard) visitExpr(arm.guard, visit);
        visitExpr(arm.body, visit);
      });
      return;
    default:
      return;
  }
}

function visitBlock(
  block: LuminaBlock | null | undefined,
  callerReturnType: string | null,
  visitExpression: (expr: LuminaExpr, usage: CallUsage['usage'], stmt?: LuminaStatement, callerReturnType?: string | null) => void,
  visitStatement: (stmt: LuminaStatement, callerReturnType: string | null) => void
): void {
  if (!block) return;
  for (const stmt of block.body) {
    visitStatement(stmt, callerReturnType);
    switch (stmt.type) {
      case 'Let':
        visitExpression(stmt.value, stmt.value.type === 'Call' ? 'let' : 'other', stmt, callerReturnType);
        break;
      case 'LetTuple':
        visitExpression(stmt.value, stmt.value.type === 'Call' ? 'let' : 'other', stmt, callerReturnType);
        break;
      case 'LetElse':
        visitExpression(stmt.value, stmt.value.type === 'Call' ? 'let' : 'other', stmt, callerReturnType);
        visitBlock(stmt.elseBlock, callerReturnType, visitExpression, visitStatement);
        break;
      case 'Return':
        visitExpression(stmt.value, stmt.value.type === 'Call' ? 'return' : 'other', stmt, callerReturnType);
        break;
      case 'ExprStmt':
        visitExpression(stmt.expr, stmt.expr.type === 'Call' ? 'expr' : 'other', stmt, callerReturnType);
        break;
      case 'Assign':
        visitExpression(stmt.value, stmt.value.type === 'Call' ? 'other' : 'other', stmt, callerReturnType);
        break;
      case 'If':
        visitExpression(stmt.condition, 'other', stmt, callerReturnType);
        visitBlock(stmt.thenBlock, callerReturnType, visitExpression, visitStatement);
        visitBlock(stmt.elseBlock ?? undefined, callerReturnType, visitExpression, visitStatement);
        break;
      case 'IfLet':
        visitExpression(stmt.value, 'other', stmt, callerReturnType);
        visitBlock(stmt.thenBlock, callerReturnType, visitExpression, visitStatement);
        visitBlock(stmt.elseBlock ?? undefined, callerReturnType, visitExpression, visitStatement);
        break;
      case 'While':
        visitExpression(stmt.condition, 'other', stmt, callerReturnType);
        visitBlock(stmt.body, callerReturnType, visitExpression, visitStatement);
        break;
      case 'WhileLet':
        visitExpression(stmt.value, 'other', stmt, callerReturnType);
        visitBlock(stmt.body, callerReturnType, visitExpression, visitStatement);
        break;
      case 'For':
        visitExpression(stmt.iterable, 'other', stmt, callerReturnType);
        visitBlock(stmt.body, callerReturnType, visitExpression, visitStatement);
        break;
      case 'MatchStmt':
        visitExpression(stmt.value, 'other', stmt, callerReturnType);
        stmt.arms.forEach((arm) => visitBlock(arm.body, callerReturnType, visitExpression, visitStatement));
        break;
      case 'Block':
        visitBlock(stmt, callerReturnType, visitExpression, visitStatement);
        break;
      default:
        break;
    }
  }
}

function collectCallUsages(
  files: Map<string, string>,
  programs: Map<string, LuminaProgram>,
  fnName: string
): CallUsage[] {
  const usages: CallUsage[] = [];
  for (const [uri, program] of programs.entries()) {
    if (isDependencyUri(uri)) continue;
    const text = files.get(uri);
    if (!text) continue;
    const visitExpression = (
      expr: LuminaExpr,
      usage: CallUsage['usage'],
      stmt?: LuminaStatement,
      callerReturnType?: string | null
    ) => {
      visitExpr(expr, (candidate) => {
        if (candidate.type !== 'Call') return;
        if (candidate.receiver || candidate.enumName) return;
        if (candidate.callee.name !== fnName) return;
        usages.push({
          uri,
          text,
          call: candidate,
          usage,
          callerReturnType: callerReturnType ?? null,
          stmt,
        });
      });
    };

    const visitStatement = (stmt: LuminaStatement, _currentReturnType: string | null) => {
      if (stmt.type === 'FnDecl') {
        visitBlock(stmt.body, getFunctionReturnType(stmt), visitExpression, visitStatement);
      }
      if (stmt.type === 'ImplDecl') {
        stmt.methods.forEach((method) => visitBlock(method.body, getFunctionReturnType(method), visitExpression, visitStatement));
      }
    };

    program.body.forEach((stmt) => visitStatement(stmt, null));
  }
  return usages;
}

export function buildChangeReturnTypeCodeAction(
  text: string,
  uri: string,
  range: Range,
  program?: LuminaProgram
): CodeAction | null {
  const info = findFunctionInfo(text, range.start, program);
  if (!info) return null;
  return {
    title: `Change return type of '${info.fn.name}'`,
    kind: CodeActionKind.RefactorRewrite,
    command: {
      title: `Change return type of '${info.fn.name}'`,
      command: 'lumina.changeReturnType',
      arguments: [
        {
          uri,
          position: range.start,
          name: info.fn.name,
          currentReturnType: info.returnType,
          kind: 'function-return',
        },
      ],
    },
  };
}

export function previewChangeReturnType(
  request: ChangeReturnTypeRequest,
  newReturnType: string
): ChangeReturnTypePreview | { error: string } {
  if (isDependencyUri(request.uri)) {
    return { error: 'Cannot change return types in dependency packages.' };
  }
  const info = findFunctionInfo(request.text, request.position, request.allPrograms?.get(request.uri));
  if (!info) return { error: 'No function declaration found at the requested position.' };
  const files = new Map(request.allFiles);
  if (!files.has(request.uri)) files.set(request.uri, request.text);
  const programs = request.allPrograms ?? new Map<string, LuminaProgram>();
  const usages = collectCallUsages(files, programs, info.fn.name);
  const warnings: string[] = [];
  const wrapper = wrapperKind(newReturnType);
  if (wrapper && !supportsTryPropagation(info.returnType, wrapper)) {
    warnings.push(`Only callers already returning ${wrapper === 'result' ? 'Result' : 'Option'} will be auto-updated.`);
  }
  return {
    callSiteCount: usages.length,
    fileCount: new Set(usages.map((usage) => usage.uri)).size,
    warnings,
  };
}

function maybeWrapWithTry(
  usage: CallUsage,
  callText: string,
  oldReturnType: string,
  newReturnType: string
): { replacement: string | null; warning?: string } {
  const wrapper = wrapperKind(newReturnType);
  if (!wrapper || wrapperKind(oldReturnType) === wrapper) return { replacement: null };
  if (!supportsTryPropagation(usage.callerReturnType ?? '', wrapper)) {
    return {
      replacement: null,
      warning: `Caller in ${usage.uri} needs manual handling for ${newReturnType}.`,
    };
  }
  return { replacement: `${callText}?` };
}

export function applyChangeReturnType(
  request: ChangeReturnTypeRequest,
  newReturnType: string
): ChangeReturnTypeResult {
  if (isDependencyUri(request.uri)) {
    return { ok: false, error: 'Cannot change return types in dependency packages.', callSiteCount: 0, fileCount: 0, warnings: [] };
  }
  const info = findFunctionInfo(request.text, request.position, request.allPrograms?.get(request.uri));
  if (!info) {
    return { ok: false, error: 'No function declaration found at the requested position.', callSiteCount: 0, fileCount: 0, warnings: [] };
  }
  const edit: WorkspaceEdit = { changes: {} };
  const warnings: string[] = [];
  const files = new Map(request.allFiles);
  if (!files.has(request.uri)) files.set(request.uri, request.text);
  const programs = request.allPrograms ?? new Map<string, LuminaProgram>();

  const currentReturnRange = rangeOfReturnType(info.fn, request.text);
  if (currentReturnRange) {
    addEdit(edit, request.uri, currentReturnRange, newReturnType);
  } else {
    const insertOffset = declarationInsertionOffset(info.fn, request.text);
    addEdit(
      edit,
      request.uri,
      { start: positionAt(request.text, insertOffset), end: positionAt(request.text, insertOffset) },
      ` -> ${newReturnType} `
    );
  }

  const usages = collectCallUsages(files, programs, info.fn.name);
  for (const usage of usages) {
    const callText = textOfNode(usage.call, usage.text);
    if (!usage.call.location) continue;

    if (newReturnType.trim() === 'void' && info.returnType.trim() !== 'void') {
      if (usage.usage === 'let' || usage.usage === 'return') {
        if (!usage.stmt) continue;
        addEdit(edit, usage.uri, rangeOfNode(usage.stmt, usage.text), `${callText};`);
      } else if (usage.usage === 'other') {
        warnings.push(`Caller in ${usage.uri} uses '${info.fn.name}' in an expression; update it manually for void return.`);
      }
      continue;
    }

    if (info.returnType.trim() === 'void' && newReturnType.trim() !== 'void') {
      if (usage.usage === 'expr' && usage.stmt) {
        addEdit(edit, usage.uri, rangeOfNode(usage.stmt, usage.text), `let _ = ${callText};`);
      } else if (usage.usage === 'other') {
        warnings.push(`Caller in ${usage.uri} now receives a value from '${info.fn.name}'; inspect manually.`);
      }
      continue;
    }

    const tryRewrite = maybeWrapWithTry(usage, callText, info.returnType, newReturnType);
    if (tryRewrite.replacement && usage.call.location) {
      addEdit(edit, usage.uri, rangeOfNode(usage.call, usage.text), tryRewrite.replacement);
    } else if (tryRewrite.warning) {
      warnings.push(tryRewrite.warning);
    }
  }

  sortWorkspaceEdits(edit);
  return {
    ok: true,
    edit,
    callSiteCount: usages.length,
    fileCount: new Set(usages.map((usage) => usage.uri)).size,
    warnings,
  };
}
