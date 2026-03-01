import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaFnDecl,
  type LuminaStructDecl,
  type LuminaTypeExpr,
  type LuminaType,
  type LuminaTypeParam,
  type LuminaConstExpr,
  type LuminaArrayType,
} from './ast.js';
import { type Type, normalizeTypeName, type PrimitiveName, type ConstExpr as TypeConstExpr } from './types.js';
import { ConstEvaluator } from './const-eval.js';

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
  constInstantiations: Map<string, ConstInstantiation>;
  constEvaluator: ConstEvaluator;
  explicitConstFnTypeArgs: Map<string, Set<string>>;
  explicitConstFnMangledNames?: Map<string, Map<string, string>>;
  specializedStructNames?: Map<string, string>;
}

export interface ConstInstantiation {
  declName: string;
  typeArgs: Type[];
  constArgs: TypeConstExpr[];
  specializedName: string;
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

const primitiveNames = new Set<PrimitiveName>([
  'int',
  'float',
  'string',
  'bool',
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
  'usize',
  'f32',
  'f64',
]);

const parseConstExprText = (text: string): TypeConstExpr | null => {
  const tokens = text.match(/[A-Za-z_][A-Za-z0-9_]*|\d+|[()+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;
  let index = 0;
  const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
  const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);

  const parsePrimary = (): TypeConstExpr | null => {
    const token = consume();
    if (!token) return null;
    if (/^\d+$/.test(token)) return { kind: 'const-literal', value: Number(token) };
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return { kind: 'const-param', name: token };
    if (token === '(') {
      const inner = parseAddSub();
      if (peek() !== ')') return null;
      consume();
      return inner;
    }
    return null;
  };

  const parseMulDiv = (): TypeConstExpr | null => {
    let left = parsePrimary();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '*' && op !== '/') break;
      consume();
      const right = parsePrimary();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parseAddSub = (): TypeConstExpr | null => {
    let left = parseMulDiv();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '+' && op !== '-') break;
      consume();
      const right = parseMulDiv();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parsed = parseAddSub();
  if (!parsed || index !== tokens.length) return null;
  return parsed;
};

const constExprToText = (expr: TypeConstExpr): string => {
  switch (expr.kind) {
    case 'const-literal':
      return String(expr.value);
    case 'const-param':
      return expr.name;
    case 'const-binary':
      return `${constExprToText(expr.left)}${expr.op}${constExprToText(expr.right)}`;
    default:
      return 'unknown';
  }
};

const astConstExprToText = (expr: LuminaConstExpr): string => {
  switch (expr.type) {
    case 'ConstLiteral':
      return String(expr.value);
    case 'ConstParam':
      return expr.name;
    case 'ConstBinary':
      return `${astConstExprToText(expr.left)}${expr.op}${astConstExprToText(expr.right)}`;
    default:
      return 'unknown';
  }
};

const typeArgToText = (arg: string | LuminaConstExpr): string =>
  typeof arg === 'string' ? arg : astConstExprToText(arg);

const astConstToTypeConst = (expr: LuminaConstExpr): TypeConstExpr => {
  switch (expr.type) {
    case 'ConstLiteral':
      return { kind: 'const-literal', value: expr.value };
    case 'ConstParam':
      return { kind: 'const-param', name: expr.name };
    case 'ConstBinary':
      return {
        kind: 'const-binary',
        op: expr.op,
        left: astConstToTypeConst(expr.left),
        right: astConstToTypeConst(expr.right),
      };
    default:
      return { kind: 'const-literal', value: 0 };
  }
};

const typeConstToAstConst = (expr: TypeConstExpr): LuminaConstExpr => {
  switch (expr.kind) {
    case 'const-literal':
      return { type: 'ConstLiteral', value: expr.value };
    case 'const-param':
      return { type: 'ConstParam', name: expr.name };
    case 'const-binary':
      return {
        type: 'ConstBinary',
        op: expr.op,
        left: typeConstToAstConst(expr.left),
        right: typeConstToAstConst(expr.right),
      };
    default:
      return { type: 'ConstLiteral', value: 0 };
  }
};

const typeFromTypeName = (typeName: string): Type => {
  const parsed = parseTypeName(typeName);
  if (!parsed) return { kind: 'adt', name: typeName, params: [] };
  if (parsed.args.length === 0) {
    return primitiveNames.has(parsed.base as PrimitiveName)
      ? { kind: 'primitive', name: parsed.base as PrimitiveName }
      : { kind: 'adt', name: parsed.base, params: [] };
  }
  return {
    kind: 'adt',
    name: parsed.base,
    params: parsed.args.map((arg) => typeFromTypeName(arg)),
  };
};

const formatTypeForKey = (type: Type): string => {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'adt': {
      const typeArgStr = type.params.map((param) => formatTypeForKey(param)).join(',');
      const constArgStr = type.constArgs?.map((c) => constExprToText(c)).join(',') ?? '';
      if (!typeArgStr && !constArgStr) return type.name;
      return `${type.name}<${[typeArgStr, constArgStr].filter(Boolean).join(',')}>`;
    }
    case 'array': {
      const elem = formatTypeForKey(type.element);
      const size = type.size ? constExprToText(type.size) : '';
      return size ? `[${elem};${size}]` : `[${elem}]`;
    }
    case 'function':
      return `fn(${type.args.map(formatTypeForKey).join(',')})->${formatTypeForKey(type.returnType)}`;
    case 'promise':
      return `Promise<${formatTypeForKey(type.inner)}>`;
    case 'variable':
      return `T${type.id}`;
    case 'row':
      return 'row';
    case 'hole':
      return 'hole';
    default:
      return 'unknown';
  }
};

const isValidTypeParam = (name: string): boolean => /^[A-Z][A-Za-z0-9_]*$/.test(name);

const getConstInstantiationKey = (
  name: string,
  typeArgs: Type[],
  constArgs: TypeConstExpr[],
  ctx: MonomorphizationContext
): string => {
  const typeNames = typeArgs.map((t) => formatTypeForKey(t));
  const constValues = constArgs.map((c) => {
    const value = ctx.constEvaluator.evaluate(c);
    return value !== null ? String(value) : constExprToText(c);
  });
  return `${name}<${[...typeNames, ...constValues].join(',')}>`;
};

const getConstArgsFromDecl = (
  declTypeParams: LuminaTypeParam[] | undefined,
  args: string[] | undefined
): { typeArgTexts: string[]; constArgs: TypeConstExpr[] } | null => {
  const typeParams = declTypeParams ?? [];
  if (typeParams.length === 0) return { typeArgTexts: [], constArgs: [] };
  if (!args || args.length !== typeParams.length) return null;
  const typeArgTexts: string[] = [];
  const constArgs: TypeConstExpr[] = [];
  for (let i = 0; i < typeParams.length; i += 1) {
    const param = typeParams[i];
    const arg = args[i];
    if (param.isConst) {
      const parsedConst = parseConstExprText(arg);
      if (!parsedConst) return null;
      constArgs.push(parsedConst);
    } else {
      typeArgTexts.push(arg);
    }
  }
  return { typeArgTexts, constArgs };
};

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
      if (expr.receiver) visitExpr(expr.receiver, ctx, genericFns, hm);
      for (const arg of expr.args) visitExpr(arg, ctx, genericFns, hm);
      return;
    }
    case 'ArrayLiteral':
      for (const element of expr.elements) visitExpr(element, ctx, genericFns, hm);
      return;
    case 'ArrayRepeatLiteral':
      visitExpr(expr.value, ctx, genericFns, hm);
      visitExpr(expr.count, ctx, genericFns, hm);
      return;
    case 'MacroInvoke':
      for (const arg of expr.args) visitExpr(arg, ctx, genericFns, hm);
      return;
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
      for (const arm of expr.arms) {
        if (arm.guard) visitExpr(arm.guard, ctx, genericFns, hm);
        visitExpr(arm.body, ctx, genericFns, hm);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms) {
        visitExpr(arm.value, ctx, genericFns, hm);
        visitExpr(arm.body, ctx, genericFns, hm);
      }
      return;
    case 'IsExpr':
      visitExpr(expr.value, ctx, genericFns, hm);
      return;
    case 'Try':
      visitExpr(expr.value, ctx, genericFns, hm);
      return;
    case 'Await':
      visitExpr(expr.value, ctx, genericFns, hm);
      return;
    case 'Cast':
      visitExpr(expr.expr, ctx, genericFns, hm);
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
    case 'Range':
      if (expr.start) visitExpr(expr.start, ctx, genericFns, hm);
      if (expr.end) visitExpr(expr.end, ctx, genericFns, hm);
      return;
    case 'Index':
      visitExpr(expr.object, ctx, genericFns, hm);
      visitExpr(expr.index, ctx, genericFns, hm);
      return;
    case 'TupleLiteral':
      for (const element of expr.elements) visitExpr(element, ctx, genericFns, hm);
      return;
    case 'Lambda':
      for (const inner of expr.body.body) {
        visitStatement(inner, ctx, genericFns, hm);
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
    case 'LetTuple':
      visitExpr(stmt.value, ctx, genericFns, hm);
      return;
    case 'LetElse':
      visitExpr(stmt.value, ctx, genericFns, hm);
      visitStatement(stmt.elseBlock, ctx, genericFns, hm);
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
    case 'IfLet':
      visitExpr(stmt.value, ctx, genericFns, hm);
      visitStatement(stmt.thenBlock, ctx, genericFns, hm);
      if (stmt.elseBlock) visitStatement(stmt.elseBlock, ctx, genericFns, hm);
      return;
    case 'While':
      visitExpr(stmt.condition, ctx, genericFns, hm);
      visitStatement(stmt.body, ctx, genericFns, hm);
      return;
    case 'For':
      visitExpr(stmt.iterable, ctx, genericFns, hm);
      visitStatement(stmt.body, ctx, genericFns, hm);
      return;
    case 'WhileLet':
      visitExpr(stmt.value, ctx, genericFns, hm);
      visitStatement(stmt.body, ctx, genericFns, hm);
      return;
    case 'Assign':
      visitExpr(stmt.target, ctx, genericFns, hm);
      visitExpr(stmt.value, ctx, genericFns, hm);
      return;
    case 'MatchStmt':
      visitExpr(stmt.value, ctx, genericFns, hm);
      for (const arm of stmt.arms) {
        if (arm.guard) visitExpr(arm.guard, ctx, genericFns, hm);
        visitStatement(arm.body, ctx, genericFns, hm);
      }
      return;
    case 'Block':
      for (const inner of stmt.body) visitStatement(inner, ctx, genericFns, hm);
      return;
    case 'TraitDecl':
    case 'ImplDecl':
    case 'MacroRulesDecl':
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
  const ctx: MonomorphizationContext = {
    instantiations: new Map(),
    constInstantiations: new Map(),
    constEvaluator: new ConstEvaluator(),
    explicitConstFnTypeArgs: new Map(),
  };
  for (const stmt of program.body) {
    visitStatement(stmt, ctx, genericFns, hmContext);
  }
  return ctx;
}

const substituteConstParamsInTypeName = (
  typeName: string,
  constBindings: Map<string, number>,
  evaluator: ConstEvaluator
): string => {
  const parsed = parseTypeName(typeName);
  if (!parsed) {
    const constExpr = parseConstExprText(typeName);
    if (!constExpr) return typeName;
    for (const [name, value] of constBindings.entries()) evaluator.bind(name, value);
    const evaluated = evaluator.evaluate(constExpr);
    for (const name of constBindings.keys()) evaluator.unbind(name);
    return evaluated !== null ? String(evaluated) : typeName;
  }
  if (parsed.args.length === 0) {
    const constExpr = parseConstExprText(parsed.base);
    if (!constExpr) return parsed.base;
    for (const [name, value] of constBindings.entries()) evaluator.bind(name, value);
    const evaluated = evaluator.evaluate(constExpr);
    for (const name of constBindings.keys()) evaluator.unbind(name);
    return evaluated !== null ? String(evaluated) : parsed.base;
  }
  const args = parsed.args.map((arg) => substituteConstParamsInTypeName(arg, constBindings, evaluator));
  return `${parsed.base}<${args.join(',')}>`;
};

const substituteConstExprAst = (
  expr: LuminaConstExpr,
  constBindings: Map<string, number>,
  evaluator: ConstEvaluator
): LuminaConstExpr => {
  const asTypeExpr = astConstToTypeConst(expr);
  for (const [name, value] of constBindings.entries()) evaluator.bind(name, value);
  const evaluated = evaluator.evaluate(asTypeExpr);
  for (const name of constBindings.keys()) evaluator.unbind(name);
  if (evaluated !== null) {
    return { type: 'ConstLiteral', value: evaluated };
  }
  return typeConstToAstConst(asTypeExpr);
};

const substituteTypeExpr = (
  expr: LuminaTypeExpr | null | undefined,
  mapping: Map<string, LuminaType>,
  constBindings?: Map<string, number>,
  evaluator?: ConstEvaluator
): LuminaTypeExpr | null | undefined => {
  if (!expr) return expr;
  if (typeof expr === 'string') {
    const withTypeParams = substituteTypeParams(expr, mapping);
    if (constBindings && evaluator && constBindings.size > 0) {
      return substituteConstParamsInTypeName(withTypeParams, constBindings, evaluator);
    }
    return withTypeParams;
  }
  if (expr.kind === 'TypeHole') return expr;
  const arrayExpr = expr as LuminaArrayType;
  const nextElement = substituteTypeExpr(arrayExpr.element, mapping, constBindings, evaluator) ?? arrayExpr.element;
  let nextSize = arrayExpr.size;
  if (arrayExpr.size && constBindings && evaluator) {
    nextSize = substituteConstExprAst(arrayExpr.size, constBindings, evaluator);
  }
  return {
    ...arrayExpr,
    element: nextElement,
    size: nextSize,
  };
};

const substituteTypeArgs = (
  args: string[] | undefined,
  mapping: Map<string, LuminaType>,
  constBindings?: Map<string, number>,
  evaluator?: ConstEvaluator
) => {
  if (!args) return;
  for (let i = 0; i < args.length; i++) {
    const raw = args[i] as unknown as string | LuminaConstExpr;
    const withType = substituteTypeParams(typeArgToText(raw), mapping);
    args[i] = constBindings && evaluator ? substituteConstParamsInTypeName(withType, constBindings, evaluator) : withType;
  }
};

const substituteTypesInExpr = (
  expr: LuminaExpr,
  mapping: Map<string, LuminaType>,
  constBindings?: Map<string, number>,
  evaluator?: ConstEvaluator
) => {
  switch (expr.type) {
    case 'Call':
      substituteTypeArgs(expr.typeArgs, mapping, constBindings, evaluator);
      if (expr.receiver) substituteTypesInExpr(expr.receiver, mapping, constBindings, evaluator);
      expr.args.forEach((arg) => substituteTypesInExpr(arg, mapping, constBindings, evaluator));
      return;
    case 'ArrayLiteral':
      expr.elements.forEach((element) => substituteTypesInExpr(element, mapping, constBindings, evaluator));
      return;
    case 'ArrayRepeatLiteral':
      substituteTypesInExpr(expr.value, mapping, constBindings, evaluator);
      substituteTypesInExpr(expr.count, mapping, constBindings, evaluator);
      return;
    case 'MacroInvoke':
      expr.args.forEach((arg) => substituteTypesInExpr(arg, mapping, constBindings, evaluator));
      return;
    case 'Binary':
      substituteTypesInExpr(expr.left, mapping, constBindings, evaluator);
      substituteTypesInExpr(expr.right, mapping, constBindings, evaluator);
      return;
    case 'Member':
      substituteTypesInExpr(expr.object, mapping, constBindings, evaluator);
      return;
    case 'StructLiteral':
      substituteTypeArgs(expr.typeArgs, mapping, constBindings, evaluator);
      for (const field of expr.fields) {
        substituteTypesInExpr(field.value, mapping, constBindings, evaluator);
      }
      return;
    case 'MatchExpr':
      substituteTypesInExpr(expr.value, mapping, constBindings, evaluator);
      for (const arm of expr.arms) {
        if (arm.guard) substituteTypesInExpr(arm.guard, mapping, constBindings, evaluator);
        substituteTypesInExpr(arm.body, mapping, constBindings, evaluator);
      }
      return;
    case 'SelectExpr':
      for (const arm of expr.arms) {
        substituteTypesInExpr(arm.value, mapping, constBindings, evaluator);
        substituteTypesInExpr(arm.body, mapping, constBindings, evaluator);
      }
      return;
    case 'IsExpr':
      substituteTypesInExpr(expr.value, mapping, constBindings, evaluator);
      return;
    case 'Try':
      substituteTypesInExpr(expr.value, mapping, constBindings, evaluator);
      return;
    case 'Await':
      substituteTypesInExpr(expr.value, mapping, constBindings, evaluator);
      return;
    case 'Cast':
      substituteTypesInExpr(expr.expr, mapping, constBindings, evaluator);
      expr.targetType = substituteTypeExpr(expr.targetType, mapping, constBindings, evaluator) ?? expr.targetType;
      return;
    case 'Move':
      substituteTypesInExpr(expr.target, mapping, constBindings, evaluator);
      return;
    case 'InterpolatedString':
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        substituteTypesInExpr(part, mapping, constBindings, evaluator);
      }
      return;
    case 'Range':
      if (expr.start) substituteTypesInExpr(expr.start, mapping, constBindings, evaluator);
      if (expr.end) substituteTypesInExpr(expr.end, mapping, constBindings, evaluator);
      return;
    case 'Index':
      substituteTypesInExpr(expr.object, mapping, constBindings, evaluator);
      substituteTypesInExpr(expr.index, mapping, constBindings, evaluator);
      return;
    case 'TupleLiteral':
      expr.elements.forEach((element) => substituteTypesInExpr(element, mapping, constBindings, evaluator));
      return;
    case 'Lambda':
      expr.returnType = substituteTypeExpr(expr.returnType, mapping, constBindings, evaluator) ?? null;
      for (const param of expr.params) {
        param.typeName = substituteTypeExpr(param.typeName, mapping, constBindings, evaluator) ?? null;
      }
      for (const inner of expr.body.body) {
        substituteTypesInStatement(inner, mapping, constBindings, evaluator);
      }
      return;
    default:
      return;
  }
};

const substituteTypesInStatement = (
  stmt: LuminaStatement,
  mapping: Map<string, LuminaType>,
  constBindings?: Map<string, number>,
  evaluator?: ConstEvaluator
) => {
  switch (stmt.type) {
    case 'Let':
      stmt.typeName = substituteTypeExpr(stmt.typeName, mapping, constBindings, evaluator) ?? null;
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      return;
    case 'LetTuple':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      return;
    case 'LetElse':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.elseBlock, mapping, constBindings, evaluator);
      return;
    case 'Return':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      return;
    case 'ExprStmt':
      substituteTypesInExpr(stmt.expr, mapping, constBindings, evaluator);
      return;
    case 'If':
      substituteTypesInExpr(stmt.condition, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.thenBlock, mapping, constBindings, evaluator);
      if (stmt.elseBlock) substituteTypesInStatement(stmt.elseBlock, mapping, constBindings, evaluator);
      return;
    case 'IfLet':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.thenBlock, mapping, constBindings, evaluator);
      if (stmt.elseBlock) substituteTypesInStatement(stmt.elseBlock, mapping, constBindings, evaluator);
      return;
    case 'While':
      substituteTypesInExpr(stmt.condition, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.body, mapping, constBindings, evaluator);
      return;
    case 'For':
      substituteTypesInExpr(stmt.iterable, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.body, mapping, constBindings, evaluator);
      return;
    case 'WhileLet':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      substituteTypesInStatement(stmt.body, mapping, constBindings, evaluator);
      return;
    case 'Assign':
      substituteTypesInExpr(stmt.target, mapping, constBindings, evaluator);
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      return;
    case 'MatchStmt':
      substituteTypesInExpr(stmt.value, mapping, constBindings, evaluator);
      for (const arm of stmt.arms) {
        if (arm.guard) substituteTypesInExpr(arm.guard, mapping, constBindings, evaluator);
        substituteTypesInStatement(arm.body, mapping, constBindings, evaluator);
      }
      return;
    case 'Block':
      for (const inner of stmt.body) {
        substituteTypesInStatement(inner, mapping, constBindings, evaluator);
      }
      return;
    case 'TraitDecl':
    case 'ImplDecl':
    case 'MacroRulesDecl':
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

const extractConstBindings = (
  typeParams: LuminaTypeParam[] | undefined,
  mapping: Map<string, LuminaType>,
  evaluator: ConstEvaluator
): Map<string, number> => {
  const bindings = new Map<string, number>();
  for (const param of typeParams ?? []) {
    if (!param.isConst) continue;
    const mapped = mapping.get(param.name);
    if (!mapped) continue;
    const constExpr = parseConstExprText(mapped);
    if (!constExpr) continue;
    const value = evaluator.evaluate(constExpr);
    if (value !== null) bindings.set(param.name, value);
  }
  return bindings;
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
  mangledName: string,
  evaluator: ConstEvaluator = new ConstEvaluator()
): LuminaFnDecl {
  const cloned = cloneAst(fn);
  const mapping = buildTypeParamMapping(fn, signature);
  const constBindings = extractConstBindings(fn.typeParams, mapping, evaluator);

  cloned.name = mangledName;
  cloned.typeParams = undefined;
  cloned.params = cloned.params.map((param) => ({
    ...param,
    typeName: substituteTypeExpr(param.typeName, mapping, constBindings, evaluator) ?? null,
  }));
  cloned.returnType = substituteTypeExpr(cloned.returnType, mapping, constBindings, evaluator) ?? null;

  substituteTypesInStatement(cloned.body, mapping, constBindings, evaluator);
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
        specialized.push(specializeFunction(original, signature, mangledName, ctx.constEvaluator));
      }
    }
  }

  ctx.mangledNames = mangledNames;
  return specialized;
};

const buildConstSpecializedName = (
  baseName: string,
  typeArgs: Type[],
  constArgs: TypeConstExpr[],
  ctx: MonomorphizationContext
): string => {
  const typePart = typeArgs.map((arg) => sanitizeTypeSegment(formatTypeForKey(arg))).filter(Boolean).join('_');
  const constPart = constArgs
    .map((arg) => {
      const evaluated = ctx.constEvaluator.evaluate(arg);
      return sanitizeTypeSegment(evaluated !== null ? String(evaluated) : constExprToText(arg));
    })
    .filter(Boolean)
    .join('_');
  const suffix = [typePart, constPart].filter(Boolean).join('_');
  return suffix ? `${baseName}_${suffix}` : `${baseName}_Mono`;
};

const collectConstStructTypeRefs = (
  program: LuminaProgram,
  structDecls: Map<string, LuminaStructDecl>
): Map<string, Set<string>> => {
  const refs = new Map<string, Set<string>>();
  const addRef = (name: string, key: string) => {
    let set = refs.get(name);
    if (!set) {
      set = new Set();
      refs.set(name, set);
    }
    set.add(key);
  };

  const visitTypeExpr = (expr: LuminaTypeExpr | null | undefined) => {
    if (!expr) return;
    if (typeof expr === 'string') {
      const parsed = parseTypeName(expr);
      if (!parsed) return;
      if (structDecls.has(parsed.base)) {
        addRef(parsed.base, parsed.args.join('|'));
      }
      for (const arg of parsed.args) visitTypeExpr(arg);
      return;
    }
    if (expr.kind === 'array') {
      visitTypeExpr(expr.element);
    }
  };

  const visitExpr = (expr: LuminaExpr) => {
    switch (expr.type) {
      case 'Call':
        if (expr.typeArgs && expr.typeArgs.length > 0 && structDecls.has(expr.callee.name)) {
          addRef(expr.callee.name, expr.typeArgs.map((arg) => typeArgToText(arg as unknown as string | LuminaConstExpr)).join('|'));
        }
        if (expr.receiver) visitExpr(expr.receiver);
        for (const arg of expr.args) visitExpr(arg);
        return;
      case 'StructLiteral':
        if (expr.typeArgs && expr.typeArgs.length > 0) {
          addRef(expr.name, expr.typeArgs.map((arg) => typeArgToText(arg as unknown as string | LuminaConstExpr)).join('|'));
        }
        for (const field of expr.fields) visitExpr(field.value);
        return;
      case 'ArrayLiteral':
        for (const element of expr.elements) visitExpr(element);
        return;
      case 'ArrayRepeatLiteral':
        visitExpr(expr.value);
        visitExpr(expr.count);
        return;
      case 'Binary':
        visitExpr(expr.left);
        visitExpr(expr.right);
        return;
      case 'Member':
        visitExpr(expr.object);
        return;
      case 'MatchExpr':
        visitExpr(expr.value);
        for (const arm of expr.arms) {
          if (arm.guard) visitExpr(arm.guard);
          visitExpr(arm.body);
        }
        return;
      case 'SelectExpr':
        for (const arm of expr.arms) {
          visitExpr(arm.value);
          visitExpr(arm.body);
        }
        return;
      case 'IsExpr':
      case 'Try':
      case 'Await':
        visitExpr(expr.value);
        return;
      case 'Cast':
        visitExpr(expr.expr);
        visitTypeExpr(expr.targetType);
        return;
      case 'Move':
        visitExpr(expr.target);
        return;
      case 'InterpolatedString':
        for (const part of expr.parts) if (typeof part !== 'string') visitExpr(part);
        return;
      case 'Range':
        if (expr.start) visitExpr(expr.start);
        if (expr.end) visitExpr(expr.end);
        return;
      case 'Index':
        visitExpr(expr.object);
        visitExpr(expr.index);
        return;
      case 'TupleLiteral':
        for (const element of expr.elements) visitExpr(element);
        return;
      case 'Lambda':
        for (const inner of expr.body.body) visitStmt(inner);
        return;
      default:
        return;
    }
  };

  const visitStmt = (stmt: LuminaStatement) => {
    switch (stmt.type) {
      case 'FnDecl':
        for (const param of stmt.params) visitTypeExpr(param.typeName);
        visitTypeExpr(stmt.returnType);
        for (const inner of stmt.body.body) visitStmt(inner);
        return;
      case 'StructDecl':
        for (const field of stmt.body) visitTypeExpr(field.typeName);
        return;
      case 'EnumDecl':
        for (const variant of stmt.variants) {
          for (const param of variant.params) visitTypeExpr(param);
          if (variant.resultType) visitTypeExpr(variant.resultType);
        }
        return;
      case 'TypeDecl':
        for (const field of stmt.body) visitTypeExpr(field.typeName);
        return;
      case 'Let':
        visitTypeExpr(stmt.typeName);
        visitExpr(stmt.value);
        return;
      case 'LetTuple':
        visitExpr(stmt.value);
        return;
      case 'LetElse':
        visitExpr(stmt.value);
        visitStmt(stmt.elseBlock);
        return;
      case 'Return':
        visitExpr(stmt.value);
        return;
      case 'ExprStmt':
        visitExpr(stmt.expr);
        return;
      case 'If':
        visitExpr(stmt.condition);
        visitStmt(stmt.thenBlock);
        if (stmt.elseBlock) visitStmt(stmt.elseBlock);
        return;
      case 'IfLet':
        visitExpr(stmt.value);
        visitStmt(stmt.thenBlock);
        if (stmt.elseBlock) visitStmt(stmt.elseBlock);
        return;
      case 'While':
        visitExpr(stmt.condition);
        visitStmt(stmt.body);
        return;
      case 'For':
        visitExpr(stmt.iterable);
        visitStmt(stmt.body);
        return;
      case 'WhileLet':
        visitExpr(stmt.value);
        visitStmt(stmt.body);
        return;
      case 'Assign':
        visitExpr(stmt.target);
        visitExpr(stmt.value);
        return;
      case 'MatchStmt':
        visitExpr(stmt.value);
        for (const arm of stmt.arms) {
          if (arm.guard) visitExpr(arm.guard);
          visitStmt(arm.body);
        }
        return;
      case 'Block':
        for (const inner of stmt.body) visitStmt(inner);
        return;
      default:
        return;
    }
  };

  for (const stmt of program.body) visitStmt(stmt);
  return refs;
};

const specializeConstGenericStructDecl = (
  structDecl: LuminaStructDecl,
  typeArgTexts: string[],
  constArgs: TypeConstExpr[],
  ctx: MonomorphizationContext
): LuminaStructDecl => {
  const typeArgs = typeArgTexts.map((arg) => typeFromTypeName(arg));
  const key = getConstInstantiationKey(structDecl.name, typeArgs, constArgs, ctx);
  const existing = ctx.constInstantiations.get(key);
  if (existing) {
    return { ...structDecl, name: existing.specializedName };
  }

  const specializedName = buildConstSpecializedName(structDecl.name, typeArgs, constArgs, ctx);
  const cloned = cloneAst(structDecl);
  const nonConstParams = (structDecl.typeParams ?? []).filter((param) => !param.isConst);
  const constParams = (structDecl.typeParams ?? []).filter((param) => !!param.isConst);

  const typeBindings = new Map<string, LuminaType>();
  nonConstParams.forEach((param, idx) => {
    if (typeArgTexts[idx]) typeBindings.set(param.name, typeArgTexts[idx]);
  });

  const constBindings = new Map<string, number>();
  constParams.forEach((param, idx) => {
    const constArg = constArgs[idx];
    if (!constArg) return;
    const value = ctx.constEvaluator.evaluate(constArg);
    if (value !== null) constBindings.set(param.name, value);
  });

  cloned.name = specializedName;
  cloned.typeParams = undefined;
  cloned.body = cloned.body.map((field) => ({
    ...field,
    typeName:
      substituteTypeExpr(field.typeName, typeBindings, constBindings, ctx.constEvaluator) ?? field.typeName,
  }));

  ctx.constInstantiations.set(key, {
    declName: structDecl.name,
    typeArgs,
    constArgs,
    specializedName,
  });

  return cloned;
};

const generateConstStructSpecializations = (
  program: LuminaProgram,
  ctx: MonomorphizationContext
): LuminaStructDecl[] => {
  const constStructDecls = new Map<string, LuminaStructDecl>();
  for (const stmt of program.body) {
    if (stmt.type !== 'StructDecl') continue;
    if ((stmt.typeParams ?? []).some((param) => !!param.isConst)) {
      constStructDecls.set(stmt.name, stmt);
    }
  }
  if (constStructDecls.size === 0) return [];

  const refs = collectConstStructTypeRefs(program, constStructDecls);
  const specialized: LuminaStructDecl[] = [];
  const specializedNames = new Map<string, string>();

  for (const [structName, keys] of refs.entries()) {
    const decl = constStructDecls.get(structName);
    if (!decl) continue;
    for (const key of keys.values()) {
      const argTexts = key.length > 0 ? key.split('|') : [];
      const split = getConstArgsFromDecl(decl.typeParams, argTexts);
      if (!split) continue;
      const spec = specializeConstGenericStructDecl(decl, split.typeArgTexts, split.constArgs, ctx);
      const dedupeKey = `${structName}|${key}`;
      if (!specializedNames.has(dedupeKey)) {
        specializedNames.set(dedupeKey, spec.name);
        specialized.push(spec);
      }
    }
  }

  ctx.specializedStructNames = specializedNames;
  return specialized;
};

const collectConstGenericFnTypeArgs = (
  program: LuminaProgram
): Map<string, Set<string>> => {
  const constFnDecls = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    if ((stmt.typeParams ?? []).some((param) => !!param.isConst)) {
      constFnDecls.add(stmt.name);
    }
  }

  const refs = new Map<string, Set<string>>();
  const addRef = (name: string, typeArgs: string[]) => {
    let set = refs.get(name);
    if (!set) {
      set = new Set();
      refs.set(name, set);
    }
    set.add(typeArgs.join('|'));
  };

  const visitExpr = (expr: LuminaExpr) => {
    switch (expr.type) {
      case 'Call':
        if (!expr.enumName && constFnDecls.has(expr.callee.name) && expr.typeArgs && expr.typeArgs.length > 0) {
          addRef(
            expr.callee.name,
            expr.typeArgs.map((arg) => typeArgToText(arg as unknown as string | LuminaConstExpr))
          );
        }
        if (expr.receiver) visitExpr(expr.receiver);
        for (const arg of expr.args) visitExpr(arg);
        return;
      case 'ArrayLiteral':
        for (const element of expr.elements) visitExpr(element);
        return;
      case 'ArrayRepeatLiteral':
        visitExpr(expr.value);
        visitExpr(expr.count);
        return;
      case 'MacroInvoke':
        for (const arg of expr.args) visitExpr(arg);
        return;
      case 'Binary':
        visitExpr(expr.left);
        visitExpr(expr.right);
        return;
      case 'Member':
        visitExpr(expr.object);
        return;
      case 'StructLiteral':
        for (const field of expr.fields) visitExpr(field.value);
        return;
      case 'MatchExpr':
        visitExpr(expr.value);
        for (const arm of expr.arms) {
          if (arm.guard) visitExpr(arm.guard);
          visitExpr(arm.body);
        }
        return;
      case 'SelectExpr':
        for (const arm of expr.arms) {
          visitExpr(arm.value);
          visitExpr(arm.body);
        }
        return;
      case 'IsExpr':
      case 'Try':
      case 'Await':
        visitExpr(expr.value);
        return;
      case 'Cast':
        visitExpr(expr.expr);
        return;
      case 'Move':
        visitExpr(expr.target);
        return;
      case 'InterpolatedString':
        for (const part of expr.parts) if (typeof part !== 'string') visitExpr(part);
        return;
      case 'Range':
        if (expr.start) visitExpr(expr.start);
        if (expr.end) visitExpr(expr.end);
        return;
      case 'Index':
        visitExpr(expr.object);
        visitExpr(expr.index);
        return;
      case 'TupleLiteral':
        for (const element of expr.elements) visitExpr(element);
        return;
      case 'Lambda':
        for (const inner of expr.body.body) visitStmt(inner);
        return;
      default:
        return;
    }
  };

  const visitStmt = (stmt: LuminaStatement) => {
    switch (stmt.type) {
      case 'FnDecl':
        for (const inner of stmt.body.body) visitStmt(inner);
        return;
      case 'Let':
        visitExpr(stmt.value);
        return;
      case 'LetTuple':
        visitExpr(stmt.value);
        return;
      case 'LetElse':
        visitExpr(stmt.value);
        visitStmt(stmt.elseBlock);
        return;
      case 'Return':
        visitExpr(stmt.value);
        return;
      case 'ExprStmt':
        visitExpr(stmt.expr);
        return;
      case 'If':
        visitExpr(stmt.condition);
        visitStmt(stmt.thenBlock);
        if (stmt.elseBlock) visitStmt(stmt.elseBlock);
        return;
      case 'IfLet':
        visitExpr(stmt.value);
        visitStmt(stmt.thenBlock);
        if (stmt.elseBlock) visitStmt(stmt.elseBlock);
        return;
      case 'While':
        visitExpr(stmt.condition);
        visitStmt(stmt.body);
        return;
      case 'For':
        visitExpr(stmt.iterable);
        visitStmt(stmt.body);
        return;
      case 'WhileLet':
        visitExpr(stmt.value);
        visitStmt(stmt.body);
        return;
      case 'Assign':
        visitExpr(stmt.target);
        visitExpr(stmt.value);
        return;
      case 'MatchStmt':
        visitExpr(stmt.value);
        for (const arm of stmt.arms) {
          if (arm.guard) visitExpr(arm.guard);
          visitStmt(arm.body);
        }
        return;
      case 'Block':
        for (const inner of stmt.body) visitStmt(inner);
        return;
      default:
        return;
    }
  };

  for (const stmt of program.body) visitStmt(stmt);
  return refs;
};

const generateExplicitConstFnSpecializations = (
  program: LuminaProgram,
  ctx: MonomorphizationContext,
  existingMangledNames: Map<string, Map<string, string>>
): LuminaFnDecl[] => {
  const byName = new Map<string, LuminaFnDecl>();
  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl') byName.set(stmt.name, stmt);
  }

  const refs = collectConstGenericFnTypeArgs(program);
  ctx.explicitConstFnTypeArgs = refs;
  const extra = new Map<string, Map<string, string>>();
  const specializedFns: LuminaFnDecl[] = [];

  for (const [fnName, argsSet] of refs.entries()) {
    const fnDecl = byName.get(fnName);
    if (!fnDecl || fnDecl.extern) continue;
    for (const argsKey of argsSet.values()) {
      const argTexts = argsKey.length > 0 ? argsKey.split('|') : [];
      const split = getConstArgsFromDecl(fnDecl.typeParams, argTexts);
      if (!split) continue;
      const typeArgs = split.typeArgTexts.map((arg) => typeFromTypeName(arg));
      const key = getConstInstantiationKey(fnName, typeArgs, split.constArgs, ctx);
      const existing = ctx.constInstantiations.get(key);
      const mangledName = existing?.specializedName ?? buildConstSpecializedName(fnName, typeArgs, split.constArgs, ctx);

      let perFn = extra.get(fnName);
      if (!perFn) {
        perFn = new Map();
        extra.set(fnName, perFn);
      }
      if (perFn.has(argsKey)) continue;

      const alreadyByHm = existingMangledNames.get(fnName);
      let alreadyGenerated = false;
      if (alreadyByHm) {
        for (const hmMangled of alreadyByHm.values()) {
          if (hmMangled === mangledName) {
            perFn.set(argsKey, mangledName);
            alreadyGenerated = true;
            break;
          }
        }
      }
      if (alreadyGenerated) continue;

      const typeBindings = new Map<string, LuminaType>();
      const nonConstParams = (fnDecl.typeParams ?? []).filter((param) => !param.isConst);
      nonConstParams.forEach((param, idx) => {
        if (split.typeArgTexts[idx]) typeBindings.set(param.name, split.typeArgTexts[idx]);
      });
      const constBindings = new Map<string, number>();
      const constParams = (fnDecl.typeParams ?? []).filter((param) => !!param.isConst);
      constParams.forEach((param, idx) => {
        const arg = split.constArgs[idx];
        if (!arg) return;
        const value = ctx.constEvaluator.evaluate(arg);
        if (value !== null) constBindings.set(param.name, value);
      });

      const cloned = cloneAst(fnDecl);
      cloned.name = mangledName;
      cloned.typeParams = undefined;
      cloned.params = cloned.params.map((param) => ({
        ...param,
        typeName: substituteTypeExpr(param.typeName, typeBindings, constBindings, ctx.constEvaluator) ?? null,
      }));
      cloned.returnType =
        substituteTypeExpr(cloned.returnType, typeBindings, constBindings, ctx.constEvaluator) ?? null;
      substituteTypesInStatement(cloned.body, typeBindings, constBindings, ctx.constEvaluator);

      perFn.set(argsKey, mangledName);
      specializedFns.push(cloned);
      ctx.constInstantiations.set(key, {
        declName: fnName,
        typeArgs,
        constArgs: split.constArgs,
        specializedName: mangledName,
      });
    }
  }

  ctx.explicitConstFnMangledNames = extra;
  return specializedFns;
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
        let rewrittenByExplicit = false;
        if (!expr.enumName && expr.typeArgs && expr.typeArgs.length > 0) {
          const typeArgKey = expr.typeArgs
            .map((arg) => typeArgToText(arg as unknown as string | LuminaConstExpr))
            .join('|');
          const explicit = ctx.explicitConstFnMangledNames?.get(calleeName)?.get(typeArgKey);
          if (explicit) {
            expr.callee.name = explicit;
            expr.typeArgs = [];
            rewrittenByExplicit = true;
          }
        }
        if (!rewrittenByExplicit && expr.id != null) {
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
        if (expr.receiver) visitExprForRewrite(expr.receiver);
        expr.args.forEach(visitExprForRewrite);
        return;
      }
      case 'ArrayLiteral':
        expr.elements.forEach(visitExprForRewrite);
        return;
      case 'TupleLiteral':
        expr.elements.forEach(visitExprForRewrite);
        return;
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
        for (const arm of expr.arms) {
          if (arm.guard) visitExprForRewrite(arm.guard);
          visitExprForRewrite(arm.body);
        }
        return;
      case 'SelectExpr':
        for (const arm of expr.arms) {
          visitExprForRewrite(arm.value);
          visitExprForRewrite(arm.body);
        }
        return;
      case 'IsExpr':
        visitExprForRewrite(expr.value);
        return;
      case 'Try':
      case 'Await':
        visitExprForRewrite(expr.value);
        return;
      case 'Cast':
        visitExprForRewrite(expr.expr);
        return;
      case 'Move':
        visitExprForRewrite(expr.target);
        return;
      case 'InterpolatedString':
        for (const part of expr.parts) {
          if (typeof part === 'string') continue;
          visitExprForRewrite(part);
        }
        return;
      case 'Range':
        if (expr.start) visitExprForRewrite(expr.start);
        if (expr.end) visitExprForRewrite(expr.end);
        return;
      case 'Index':
        visitExprForRewrite(expr.object);
        visitExprForRewrite(expr.index);
        return;
      case 'Lambda':
        for (const inner of expr.body.body) visitStmtForRewrite(inner);
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
      case 'LetTuple':
        visitExprForRewrite(stmt.value);
        return;
      case 'LetElse':
        visitExprForRewrite(stmt.value);
        visitStmtForRewrite(stmt.elseBlock);
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
      case 'IfLet':
        visitExprForRewrite(stmt.value);
        visitStmtForRewrite(stmt.thenBlock);
        if (stmt.elseBlock) visitStmtForRewrite(stmt.elseBlock);
        return;
      case 'While':
        visitExprForRewrite(stmt.condition);
        visitStmtForRewrite(stmt.body);
        return;
      case 'For':
        visitExprForRewrite(stmt.iterable);
        visitStmtForRewrite(stmt.body);
        return;
      case 'WhileLet':
        visitExprForRewrite(stmt.value);
        visitStmtForRewrite(stmt.body);
        return;
      case 'Assign':
        visitExprForRewrite(stmt.target);
        visitExprForRewrite(stmt.value);
        return;
      case 'MatchStmt':
        visitExprForRewrite(stmt.value);
        for (const arm of stmt.arms) {
          if (arm.guard) visitExprForRewrite(arm.guard);
          visitStmtForRewrite(arm.body);
        }
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
  const specializedStructs = generateConstStructSpecializations(program, ctx);
  const specialized = generateSpecializations(program, ctx);
  const explicitConstFns = generateExplicitConstFnSpecializations(program, ctx, ctx.mangledNames ?? new Map());
  if (ctx.instantiations.size === 0 && specializedStructs.length === 0 && explicitConstFns.length === 0) return program;
  rewriteCallSites(program, ctx, hmContext);
  if (specializedStructs.length > 0) {
    program.body.push(...specializedStructs);
  }
  if (specialized.length > 0 || explicitConstFns.length > 0) {
    program.body.push(...specialized, ...explicitConstFns);
  }
  return program;
}
