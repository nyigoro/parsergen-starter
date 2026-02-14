import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaFnDecl,
  type LuminaTypeExpr,
  type LuminaType,
} from './ast.js';
import { type Type, normalizeTypeName } from './types.js';

export interface HmCallSignature {
  args: Type[];
  returnType: Type;
}

export interface HmInferenceContext {
  inferredCalls: Map<number, HmCallSignature>;
}

export interface MonomorphizationContext {
  instantiations: Map<string, Map<string, HmCallSignature>>;
  mangledNames?: Map<string, Map<string, string>>;
}

const cloneAst = <T>(node: T): T => JSON.parse(JSON.stringify(node)) as T;

const sanitizeTypeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'Type';

const parseTypeName = (typeName: string): { base: string; args: string[] } | null => {
  const idx = typeName.indexOf('<');
  if (idx === -1) return { base: typeName, args: [] };
  if (!typeName.endsWith('>')) return null;
  const base = typeName.slice(0, idx);
  const inner = typeName.slice(idx + 1, -1);
  const args = splitTypeArgs(inner);
  return { base, args };
};

const splitTypeArgs = (input: string): string[] => {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') depth++;
    if (ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
};

const normalizeTypeNameExpr = (typeName: string): string => {
  const parsed = parseTypeName(typeName);
  if (!parsed) return sanitizeTypeSegment(typeName);
  if (parsed.args.length === 0) return sanitizeTypeSegment(parsed.base);
  const args = parsed.args.map(normalizeTypeNameExpr).join('_');
  return `${sanitizeTypeSegment(parsed.base)}_${args}`;
};

const isValidTypeParam = (name: string): boolean => /^[A-Z][A-Za-z0-9_]*$/.test(name);

const unifyTypes = (paramType: LuminaType, argType: LuminaType, mapping: Map<string, LuminaType>) => {
  const paramParsed = parseTypeName(paramType);
  const argParsed = parseTypeName(argType);
  if (!paramParsed || !argParsed) return;

  if (mapping.has(paramParsed.base)) return;
  if (isValidTypeParam(paramParsed.base) && paramParsed.args.length === 0) {
    mapping.set(paramParsed.base, argType);
    return;
  }
  if (paramParsed.base !== argParsed.base) return;
  for (let i = 0; i < Math.min(paramParsed.args.length, argParsed.args.length); i++) {
    unifyTypes(paramParsed.args[i], argParsed.args[i], mapping);
  }
};

const substituteTypeParams = (typeName: LuminaType, mapping: Map<string, LuminaType>): LuminaType => {
  const parsed = parseTypeName(typeName);
  if (!parsed) return typeName;
  if (mapping.has(parsed.base) && parsed.args.length === 0) {
    return mapping.get(parsed.base) as LuminaType;
  }
  if (parsed.args.length === 0) return parsed.base;
  const args = parsed.args.map((arg) => substituteTypeParams(arg, mapping));
  return `${parsed.base}<${args.join(',')}>`;
};

const typeExprToString = (expr: LuminaTypeExpr | null | undefined): LuminaType | null => {
  if (!expr) return null;
  if (typeof expr === 'string') return expr;
  if (expr.kind === 'TypeHole') return '_';
  return null;
};

const hmTypeToString = (type: Type): string => {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'adt': {
      if (!type.params.length) return type.name;
      const args = type.params.map(hmTypeToString).join(',');
      return `${type.name}<${args}>`;
    }
    case 'function': {
      const args = type.args.map(hmTypeToString).join(', ');
      const ret = hmTypeToString(type.returnType);
      return `fn(${args}) -> ${ret}`;
    }
    case 'variable':
      return `T${type.id}`;
    case 'row':
      return 'any';
    case 'hole':
      return '_';
    default:
      return 'any';
  }
};

const collectGenericFunctions = (program: LuminaProgram): Set<string> => {
  const names = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    if ((stmt.typeParams?.length ?? 0) > 0) {
      names.add(stmt.name);
    }
  }
  return names;
};

const recordInstantiation = (
  ctx: MonomorphizationContext,
  calleeName: string,
  signature: HmCallSignature
) => {
  const argKey = signature.args.map(normalizeTypeName).join('_') || 'Unit';
  const retKey = normalizeTypeName(signature.returnType);
  const key = `${argKey}__${retKey}`;
  let byFn = ctx.instantiations.get(calleeName);
  if (!byFn) {
    byFn = new Map();
    ctx.instantiations.set(calleeName, byFn);
  }
  if (!byFn.has(key)) {
    byFn.set(key, signature);
  }
};

const signatureKey = (signature: HmCallSignature): string => {
  const argKey = signature.args.map(normalizeTypeName).join('_') || 'Unit';
  const retKey = normalizeTypeName(signature.returnType);
  return `${argKey}__${retKey}`;
};

const visitExpr = (
  expr: LuminaExpr,
  ctx: MonomorphizationContext,
  genericFns: Set<string>,
  hm: HmInferenceContext
) => {
  switch (expr.type) {
    case 'Call': {
      const calleeName = expr.enumName ? `${expr.enumName}.${expr.callee.name}` : expr.callee.name;
      if (expr.id != null && genericFns.has(calleeName)) {
        const signature = hm.inferredCalls.get(expr.id);
        if (signature) recordInstantiation(ctx, calleeName, signature);
      }
      for (const arg of expr.args) visitExpr(arg, ctx, genericFns, hm);
      return;
    }
    case 'Binary':
      visitExpr(expr.left, ctx, genericFns, hm);
      visitExpr(expr.right, ctx, genericFns, hm);
      return;
    case 'Member':
      visitExpr(expr.object, ctx, genericFns, hm);
      return;
    case 'StructLiteral':
      for (const field of expr.fields) visitExpr(field.value, ctx, genericFns, hm);
      return;
    case 'MatchExpr':
      visitExpr(expr.value, ctx, genericFns, hm);
      for (const arm of expr.arms) visitExpr(arm.body, ctx, genericFns, hm);
      return;
    case 'IsExpr':
      visitExpr(expr.value, ctx, genericFns, hm);
      return;
    case 'Try':
      visitExpr(expr.value, ctx, genericFns, hm);
      return;
    case 'Move':
      visitExpr(expr.target, ctx, genericFns, hm);
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        visitExpr(part, ctx, genericFns, hm);
      }
      return;
    default:
      return;
  }
};

const visitStatement = (
  stmt: LuminaStatement,
  ctx: MonomorphizationContext,
  genericFns: Set<string>,
  hm: HmInferenceContext
) => {
  switch (stmt.type) {
    case 'FnDecl':
      for (const inner of stmt.body.body) {
        visitStatement(inner, ctx, genericFns, hm);
      }
      return;
    case 'Let':
      visitExpr(stmt.value, ctx, genericFns, hm);
      return;
    case 'Return':
      visitExpr(stmt.value, ctx, genericFns, hm);
      return;
    case 'ExprStmt':
      visitExpr(stmt.expr, ctx, genericFns, hm);
      return;
    case 'If':
      visitExpr(stmt.condition, ctx, genericFns, hm);
      visitStatement(stmt.thenBlock, ctx, genericFns, hm);
      if (stmt.elseBlock) visitStatement(stmt.elseBlock, ctx, genericFns, hm);
      return;
    case 'While':
      visitExpr(stmt.condition, ctx, genericFns, hm);
      visitStatement(stmt.body, ctx, genericFns, hm);
      return;
    case 'Assign':
      visitExpr(stmt.target, ctx, genericFns, hm);
      visitExpr(stmt.value, ctx, genericFns, hm);
      return;
    case 'MatchStmt':
      visitExpr(stmt.value, ctx, genericFns, hm);
      for (const arm of stmt.arms) visitStatement(arm.body, ctx, genericFns, hm);
      return;
    case 'Block':
      for (const inner of stmt.body) visitStatement(inner, ctx, genericFns, hm);
      return;
    case 'TraitDecl':
    case 'ImplDecl':
      return;
    default:
      return;
  }
};

export function collectInstantiations(
  program: LuminaProgram,
  hmContext: HmInferenceContext
): MonomorphizationContext {
  const genericFns = collectGenericFunctions(program);
  const ctx: MonomorphizationContext = { instantiations: new Map() };
  for (const stmt of program.body) {
    visitStatement(stmt, ctx, genericFns, hmContext);
  }
  return ctx;
}

const substituteTypeExpr = (
  expr: LuminaTypeExpr | null | undefined,
  mapping: Map<string, LuminaType>
): LuminaTypeExpr | null | undefined => {
  if (!expr) return expr;
  if (typeof expr === 'string') {
    return substituteTypeParams(expr, mapping);
  }
  return expr;
};

const substituteTypeArgs = (args: string[] | undefined, mapping: Map<string, LuminaType>) => {
  if (!args) return;
  for (let i = 0; i < args.length; i++) {
    args[i] = substituteTypeParams(args[i], mapping);
  }
};

const substituteTypesInExpr = (expr: LuminaExpr, mapping: Map<string, LuminaType>) => {
  switch (expr.type) {
    case 'Call':
      substituteTypeArgs(expr.typeArgs, mapping);
      expr.args.forEach((arg) => substituteTypesInExpr(arg, mapping));
      return;
    case 'Binary':
      substituteTypesInExpr(expr.left, mapping);
      substituteTypesInExpr(expr.right, mapping);
      return;
    case 'Member':
      substituteTypesInExpr(expr.object, mapping);
      return;
    case 'StructLiteral':
      substituteTypeArgs(expr.typeArgs, mapping);
      for (const field of expr.fields) {
        substituteTypesInExpr(field.value, mapping);
      }
      return;
    case 'MatchExpr':
      substituteTypesInExpr(expr.value, mapping);
      for (const arm of expr.arms) {
        substituteTypesInExpr(arm.body, mapping);
      }
      return;
    case 'IsExpr':
      substituteTypesInExpr(expr.value, mapping);
      return;
    case 'Try':
      substituteTypesInExpr(expr.value, mapping);
      return;
    case 'Move':
      substituteTypesInExpr(expr.target, mapping);
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        substituteTypesInExpr(part, mapping);
      }
      return;
    default:
      return;
  }
};

const substituteTypesInStatement = (stmt: LuminaStatement, mapping: Map<string, LuminaType>) => {
  switch (stmt.type) {
    case 'Let':
      stmt.typeName = substituteTypeExpr(stmt.typeName, mapping) ?? null;
      substituteTypesInExpr(stmt.value, mapping);
      return;
    case 'Return':
      substituteTypesInExpr(stmt.value, mapping);
      return;
    case 'ExprStmt':
      substituteTypesInExpr(stmt.expr, mapping);
      return;
    case 'If':
      substituteTypesInExpr(stmt.condition, mapping);
      substituteTypesInStatement(stmt.thenBlock, mapping);
      if (stmt.elseBlock) substituteTypesInStatement(stmt.elseBlock, mapping);
      return;
    case 'While':
      substituteTypesInExpr(stmt.condition, mapping);
      substituteTypesInStatement(stmt.body, mapping);
      return;
    case 'Assign':
      substituteTypesInExpr(stmt.target, mapping);
      substituteTypesInExpr(stmt.value, mapping);
      return;
    case 'MatchStmt':
      substituteTypesInExpr(stmt.value, mapping);
      for (const arm of stmt.arms) {
        substituteTypesInStatement(arm.body, mapping);
      }
      return;
    case 'Block':
      for (const inner of stmt.body) {
        substituteTypesInStatement(inner, mapping);
      }
      return;
    case 'TraitDecl':
    case 'ImplDecl':
      return;
    default:
      return;
  }
};

const buildTypeParamMapping = (fn: LuminaFnDecl, signature: HmCallSignature): Map<string, LuminaType> => {
  const mapping = new Map<string, LuminaType>();
  const actualArgs = signature.args.map(hmTypeToString);
  const actualReturn = hmTypeToString(signature.returnType);

  fn.params.forEach((param, idx) => {
    const declared = typeExprToString(param.typeName);
    if (!declared || declared === '_' || !actualArgs[idx]) return;
    unifyTypes(declared, actualArgs[idx], mapping);
  });

  if (fn.returnType) {
    const declaredReturn = typeExprToString(fn.returnType);
    if (declaredReturn && declaredReturn !== '_') {
      unifyTypes(declaredReturn, actualReturn, mapping);
    }
  }

  return mapping;
};

const buildMangledName = (
  fn: LuminaFnDecl,
  mapping: Map<string, LuminaType>,
  signature: HmCallSignature
): string => {
  const typeParams = fn.typeParams?.map((param) => param.name) ?? [];
  const mapped = typeParams
    .map((name) => mapping.get(name))
    .filter((value): value is LuminaType => !!value);

  if (mapped.length > 0) {
    const suffix = mapped.map((value) => normalizeTypeNameExpr(value)).join('_');
    return `${fn.name}_${suffix}`;
  }

  const argKey = signature.args.map(normalizeTypeName).join('_') || 'Unit';
  const retKey = normalizeTypeName(signature.returnType);
  return `${fn.name}_${argKey}_${retKey}`;
};

export function specializeFunction(
  fn: LuminaFnDecl,
  signature: HmCallSignature,
  mangledName: string
): LuminaFnDecl {
  const cloned = cloneAst(fn);
  const mapping = buildTypeParamMapping(fn, signature);

  cloned.name = mangledName;
  cloned.typeParams = undefined;
  cloned.params = cloned.params.map((param) => ({
    ...param,
    typeName: substituteTypeExpr(param.typeName, mapping) ?? null,
  }));
  cloned.returnType = substituteTypeExpr(cloned.returnType, mapping) ?? null;

  substituteTypesInStatement(cloned.body, mapping);
  return cloned;
}

const generateSpecializations = (
  program: LuminaProgram,
  ctx: MonomorphizationContext
): LuminaFnDecl[] => {
  const byName = new Map<string, LuminaFnDecl>();
  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl') byName.set(stmt.name, stmt);
  }

  const mangledNames = new Map<string, Map<string, string>>();
  const specialized: LuminaFnDecl[] = [];

  for (const [fnName, instantiations] of ctx.instantiations) {
    const original = byName.get(fnName);
    if (!original || original.extern) continue;
    for (const [key, signature] of instantiations.entries()) {
      const mapping = buildTypeParamMapping(original, signature);
      const mangledName = buildMangledName(original, mapping, signature);
      let perFn = mangledNames.get(fnName);
      if (!perFn) {
        perFn = new Map();
        mangledNames.set(fnName, perFn);
      }
      if (!perFn.has(key)) {
        perFn.set(key, mangledName);
        specialized.push(specializeFunction(original, signature, mangledName));
      }
    }
  }

  ctx.mangledNames = mangledNames;
  return specialized;
};

export function rewriteCallSites(
  program: LuminaProgram,
  ctx: MonomorphizationContext,
  hmContext: HmInferenceContext
) {
  const mangledNames = ctx.mangledNames ?? new Map<string, Map<string, string>>();

  const visitExprForRewrite = (expr: LuminaExpr) => {
    switch (expr.type) {
      case 'Call': {
        const calleeName = expr.enumName ? `${expr.enumName}.${expr.callee.name}` : expr.callee.name;
        if (expr.id != null) {
          const signature = hmContext.inferredCalls.get(expr.id);
          if (signature) {
            const key = signatureKey(signature);
            const perFn = mangledNames.get(calleeName);
            const target = perFn?.get(key);
            if (target && !expr.enumName) {
              expr.callee.name = target;
            }
          }
        }
        expr.args.forEach(visitExprForRewrite);
        return;
      }
      case 'Binary':
        visitExprForRewrite(expr.left);
        visitExprForRewrite(expr.right);
        return;
      case 'Member':
        visitExprForRewrite(expr.object);
        return;
      case 'StructLiteral':
        for (const field of expr.fields) visitExprForRewrite(field.value);
        return;
      case 'MatchExpr':
        visitExprForRewrite(expr.value);
        for (const arm of expr.arms) visitExprForRewrite(arm.body);
        return;
      case 'IsExpr':
        visitExprForRewrite(expr.value);
        return;
      case 'Try':
        visitExprForRewrite(expr.value);
        return;
      case 'Move':
        visitExprForRewrite(expr.target);
        return;
      default:
        return;
    }
  };

  const visitStmtForRewrite = (stmt: LuminaStatement) => {
    switch (stmt.type) {
      case 'FnDecl':
        for (const inner of stmt.body.body) visitStmtForRewrite(inner);
        return;
      case 'Let':
        visitExprForRewrite(stmt.value);
        return;
      case 'Return':
        visitExprForRewrite(stmt.value);
        return;
      case 'ExprStmt':
        visitExprForRewrite(stmt.expr);
        return;
      case 'If':
        visitExprForRewrite(stmt.condition);
        visitStmtForRewrite(stmt.thenBlock);
        if (stmt.elseBlock) visitStmtForRewrite(stmt.elseBlock);
        return;
      case 'While':
        visitExprForRewrite(stmt.condition);
        visitStmtForRewrite(stmt.body);
        return;
      case 'Assign':
        visitExprForRewrite(stmt.target);
        visitExprForRewrite(stmt.value);
        return;
      case 'MatchStmt':
        visitExprForRewrite(stmt.value);
        for (const arm of stmt.arms) visitStmtForRewrite(arm.body);
        return;
      case 'Block':
        for (const inner of stmt.body) visitStmtForRewrite(inner);
        return;
      case 'TraitDecl':
      case 'ImplDecl':
        return;
      default:
        return;
    }
  };

  for (const stmt of program.body) visitStmtForRewrite(stmt);
}

export function monomorphize(program: LuminaProgram, hmContext: HmInferenceContext): LuminaProgram {
  const ctx = collectInstantiations(program, hmContext);
  if (ctx.instantiations.size === 0) return program;
  const specialized = generateSpecializations(program, ctx);
  rewriteCallSites(program, ctx, hmContext);
  if (specialized.length > 0) {
    program.body.push(...specialized);
  }
  return program;
}
