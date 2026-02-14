import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaMatchPattern } from './ast.js';
import {
  type Type,
  type TypeScheme,
  type Subst,
  type PrimitiveName,
  freshTypeVar,
  promiseType,
  prune,
  unify,
  freeTypeVars,
  generalize,
  UnificationError,
  type UnificationTraceEntry,
  isNumericPrimitiveName,
  normalizePrimitiveName,
} from './types.js';
import { normalizeTypeForDisplay, normalizeTypeNameForDisplay } from './type-utils.js';
import { type Diagnostic } from '../parser/index.js';
import { type Location } from '../utils/index.js';
import {
  createStdModuleRegistry,
  getPreludeExports,
  resolveModuleBindings,
  type ModuleExport,
  type ModuleRegistry,
} from './module-registry.js';
import { type LuminaTypeExpr, type LuminaTypeHole } from './ast.js';

export interface InferResult {
  type?: Type;
  diagnostics: Diagnostic[];
  subst: Subst;
  inferredLets: Map<string, Type>;
  inferredFnReturns: Map<string, Type>;
  inferredFnByName: Map<string, Type>;
  inferredFnParams: Map<string, Type[]>;
  inferredCalls: Map<number, { args: Type[]; returnType: Type }>;
  inferredExprs: Map<number, Type>;
}

interface EnumInfo {
  typeParams: string[];
  variants: Map<string, LuminaTypeExpr[]>;
}

interface StructInfo {
  typeParams: string[];
  fields: Map<string, LuminaTypeExpr>;
}

type HoleOwnerKind = 'let' | 'fn-param' | 'fn-return';

interface HoleInfo {
  ownerKind: HoleOwnerKind;
  ownerName: string;
  ownerLocation?: Location;
  holeLocation?: Location;
  paramName?: string;
  paramIndex?: number;
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const literalNumericSuffixes = new Set<PrimitiveName>([
  'i8', 'i16', 'i32', 'i64', 'i128',
  'u8', 'u16', 'u32', 'u64', 'u128',
  'f32', 'f64',
]);

const intBitWidths: Record<PrimitiveName, number> = {
  i8: 8,
  i16: 16,
  i32: 32,
  i64: 64,
  i128: 128,
  u8: 8,
  u16: 16,
  u32: 32,
  u64: 64,
  u128: 128,
  int: 32,
  float: 64,
  f32: 32,
  f64: 64,
  string: 0,
  bool: 0,
  void: 0,
  any: 0,
};

const isIntPrimitive = (name: PrimitiveName): boolean => name.startsWith('i') || name.startsWith('u');
const isFloatPrimitive = (name: PrimitiveName): boolean => name === 'f32' || name === 'f64';
const isUnsignedPrimitive = (name: PrimitiveName): boolean => name.startsWith('u');

function inferNumberLiteralType(expr: { suffix?: string | null; raw?: string; isFloat?: boolean }): Type {
  const suffix = expr.suffix ?? null;
  if (suffix && literalNumericSuffixes.has(suffix as PrimitiveName)) {
    return { kind: 'primitive', name: suffix as PrimitiveName };
  }
  const raw = expr.raw ?? '';
  const isFloat = expr.isFloat || raw.includes('.') || raw.includes('e') || raw.includes('E');
  return { kind: 'primitive', name: isFloat ? 'f64' : 'i32' };
}

function numericPrimitiveOf(type: Type, subst: Subst): PrimitiveName | null {
  const pruned = prune(type, subst);
  if (pruned.kind !== 'primitive') return null;
  const normalized = normalizePrimitiveName(pruned.name);
  return isNumericPrimitiveName(normalized) ? normalized : null;
}

function isLossyNumericCast(from: PrimitiveName, to: PrimitiveName): boolean {
  const fromNorm = normalizePrimitiveName(from);
  const toNorm = normalizePrimitiveName(to);
  if (isFloatPrimitive(fromNorm) && isIntPrimitive(toNorm)) return true;
  if (isFloatPrimitive(fromNorm) && isFloatPrimitive(toNorm)) {
    return fromNorm === 'f64' && toNorm === 'f32';
  }
  if (isIntPrimitive(fromNorm) && isFloatPrimitive(toNorm)) {
    if (toNorm === 'f32') return true;
    const width = intBitWidths[fromNorm] ?? 32;
    return width > 53;
  }
  if (isIntPrimitive(fromNorm) && isIntPrimitive(toNorm)) {
    const fromWidth = intBitWidths[fromNorm] ?? 32;
    const toWidth = intBitWidths[toNorm] ?? 32;
    if (fromWidth > toWidth) return true;
    if (fromWidth === toWidth && isUnsignedPrimitive(fromNorm) !== isUnsignedPrimitive(toNorm)) {
      return true;
    }
  }
  return false;
}

type LooseLocation =
  | {
      start: { line: number; column: number; offset?: number };
      end: { line: number; column: number; offset?: number };
    }
  | undefined;

const diagLocation = (location?: LooseLocation): Location => {
  if (!location) return defaultLocation;
  return {
    start: {
      line: location.start.line,
      column: location.start.column,
      offset: location.start.offset ?? 0,
    },
    end: {
      line: location.end.line,
      column: location.end.column,
      offset: location.end.offset ?? 0,
    },
  };
};
const defaultWrapperList = ['Option', 'Box', 'Ref'];
let activeWrapperSet = new Set(defaultWrapperList);
let activeInferredExprs: Map<number, Type> | null = null;
let activeStructRegistry: Map<string, StructInfo> | null = null;
let activeRowPolymorphism = false;
let activeReturnType: Type | null = null;

export function inferProgram(
  program: LuminaProgram,
  options?: {
    moduleRegistry?: ModuleRegistry;
    moduleBindings?: Map<string, ModuleExport>;
    preludeExports?: ModuleExport[];
    recursiveWrappers?: string[];
    useRowPolymorphism?: boolean;
  }
): InferResult {
  activeWrapperSet = new Set(options?.recursiveWrappers ?? defaultWrapperList);
  activeReturnType = null;
  const env = new TypeEnv();
  const subst: Subst = new Map();
  const diagnostics: Diagnostic[] = [];
  const inferredLets = new Map<string, Type>();
  const inferredFnReturns = new Map<string, Type>();
  const inferredFnByName = new Map<string, Type>();
  const inferredFnParams = new Map<string, Type[]>();
  const inferredCalls = new Map<number, { args: Type[]; returnType: Type }>();
  const inferredExprs = new Map<number, Type>();
  const holeInfoByVar = new Map<number, HoleInfo>();
  const hoistedFns = new Map<string, { paramTypes: Type[]; returnType: Type; typeParamIds: number[] }>();
  const enumRegistry = buildEnumRegistry(program);
  const structRegistry = buildStructRegistry(program);
  activeStructRegistry = structRegistry;
  activeRowPolymorphism = options?.useRowPolymorphism ?? false;
  const moduleRegistry = options?.moduleRegistry ?? createStdModuleRegistry();
  const moduleBindings = options?.moduleBindings ?? resolveModuleBindings(program, moduleRegistry);
  const preludeExports = options?.preludeExports ?? getPreludeExports(moduleRegistry);
  activeInferredExprs = inferredExprs;

  for (const stmt of program.body) {
    if (stmt.type === 'StructDecl') {
      checkStructRecursion(stmt, diagnostics, activeWrapperSet);
    }
  }

  for (const exp of preludeExports) {
    if (exp.kind !== 'function') continue;
    env.extend(exp.name, exp.hmType);
  }

  for (const [name, exp] of moduleBindings.entries()) {
    if (exp.kind === 'function') {
      env.extend(name, exp.hmType);
    }
  }

  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    const signature = buildFunctionSignature(stmt, holeInfoByVar);
    hoistedFns.set(stmt.name, signature);
    const returnType = stmt.async ? promiseType(signature.returnType) : signature.returnType;
    const fnType: Type = { kind: 'function', args: signature.paramTypes, returnType };
    env.extend(stmt.name, { kind: 'scheme', variables: signature.typeParamIds, type: fnType });
  }

  for (const stmt of program.body) {
    if (stmt.type === 'FnDecl') {
      inferFunctionBody(
        stmt,
        env,
        subst,
        diagnostics,
        inferredLets,
        inferredFnReturns,
        inferredFnByName,
        inferredFnParams,
        hoistedFns,
        enumRegistry,
        structRegistry,
        holeInfoByVar,
        moduleBindings,
        inferredCalls
      );
      continue;
    }
    inferStatement(
      stmt,
      env,
      subst,
      diagnostics,
      undefined,
      inferredLets,
      inferredFnReturns,
      inferredFnByName,
      inferredFnParams,
      enumRegistry,
      structRegistry,
      holeInfoByVar,
      moduleBindings,
      inferredCalls
    );
  }

  validateTypeHoles(
    holeInfoByVar,
    subst,
    diagnostics,
    inferredLets,
    inferredFnByName,
    inferredFnParams
  );

  const frozenExprs = new Map<number, Type>();
  for (const [id, type] of inferredExprs.entries()) {
    frozenExprs.set(id, normalizeType(type, subst));
  }

  const result = {
    diagnostics,
    subst,
    inferredLets,
    inferredFnReturns,
    inferredFnByName,
    inferredFnParams,
    inferredCalls,
    inferredExprs: frozenExprs,
  };
  activeInferredExprs = null;
  activeStructRegistry = null;
  activeRowPolymorphism = false;
  return result;
}

class TypeEnv {
  private values = new Map<string, TypeScheme>();
  constructor(private parent?: TypeEnv) {}

  extend(name: string, scheme: TypeScheme) {
    this.values.set(name, scheme);
  }

  lookup(name: string): TypeScheme | undefined {
    return this.values.get(name) ?? this.parent?.lookup(name);
  }

  child(): TypeEnv {
    return new TypeEnv(this);
  }

  freeVars(subst: Subst): Set<number> {
    const result = new Set<number>();
    for (const scheme of this.values.values()) {
      const schemeFree = freeTypeVars(scheme.type, subst);
      for (const id of schemeFree) {
        if (!scheme.variables.includes(id)) result.add(id);
      }
    }
    if (this.parent) {
      for (const id of this.parent.freeVars(subst)) result.add(id);
    }
    return result;
  }
}

function buildFunctionSignature(
  stmt: Extract<LuminaStatement, { type: 'FnDecl' }>,
  holeInfoByVar?: Map<number, HoleInfo>
): { paramTypes: Type[]; returnType: Type; typeParamIds: number[] } {
  const typeParamMap = new Map<string, Type>();
  const typeParamIds: number[] = [];
  for (const param of stmt.typeParams ?? []) {
    const v = freshTypeVar();
    typeParamMap.set(param.name, v);
    if (v.kind !== 'variable') {
      throw new Error('Expected type variable for generic parameter');
    }
    typeParamIds.push(v.id);
  }
  const paramTypes = stmt.params.map((param, idx) =>
    param.typeName
      ? parseTypeNameWithEnv(
          param.typeName,
          typeParamMap,
          holeInfoByVar,
          {
            ownerKind: 'fn-param',
            ownerName: stmt.name,
            ownerLocation: stmt.location,
            paramName: param.name,
            paramIndex: idx,
          },
          param.location ?? stmt.location
        )
      : freshTypeVar()
  );
  const returnType = stmt.returnType
    ? parseTypeNameWithEnv(
        stmt.returnType,
        typeParamMap,
        holeInfoByVar,
        {
          ownerKind: 'fn-return',
          ownerName: stmt.name,
          ownerLocation: stmt.location,
        },
        stmt.location
      )
    : freshTypeVar();
  return { paramTypes, returnType, typeParamIds };
}

function inferFunctionBody(
  stmt: Extract<LuminaStatement, { type: 'FnDecl' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  inferredLets: Map<string, Type>,
  inferredFnReturns: Map<string, Type>,
  inferredFnByName: Map<string, Type>,
  inferredFnParams: Map<string, Type[]>,
  hoistedFns: Map<string, { paramTypes: Type[]; returnType: Type; typeParamIds: number[] }>,
  enumRegistry: Map<string, EnumInfo>,
  structRegistry: Map<string, StructInfo>,
  holeInfoByVar: Map<number, HoleInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inferredCalls?: Map<number, { args: Type[]; returnType: Type }>
): Type | null {
  const signature = hoistedFns.get(stmt.name) ?? buildFunctionSignature(stmt, holeInfoByVar);
  const fnEnv = env.child();
  const isAsync = !!stmt.async;
  const prevReturn = activeReturnType;
  activeReturnType = signature.returnType;
  signature.paramTypes.forEach((t, idx) => {
    const param = stmt.params[idx];
    if (param) {
      fnEnv.extend(param.name, { kind: 'scheme', variables: [], type: t });
    }
  });
  for (const bodyStmt of stmt.body.body) {
    inferStatement(
      bodyStmt,
      fnEnv,
      subst,
      diagnostics,
      signature.returnType,
      inferredLets,
      inferredFnReturns,
      inferredFnByName,
      inferredFnParams,
      enumRegistry,
      structRegistry,
      holeInfoByVar,
      moduleBindings,
      inferredCalls,
      undefined,
      isAsync
    );
  }
  activeReturnType = prevReturn;
  const effectiveReturn = isAsync ? promiseType(signature.returnType) : signature.returnType;
  const prunedReturn = normalizeType(effectiveReturn, subst);
  if (stmt.location?.start) {
    inferredFnReturns.set(keyFromLocation(stmt.location), prunedReturn);
  }
  inferredFnByName.set(stmt.name, prunedReturn);
  inferredFnParams.set(stmt.name, signature.paramTypes.map((param) => prune(param, subst)));
  return { kind: 'function', args: signature.paramTypes, returnType: effectiveReturn };
}

function inferStatement(
  stmt: LuminaStatement,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  currentReturn?: Type,
  inferredLets?: Map<string, Type>,
  inferredFnReturns?: Map<string, Type>,
  inferredFnByName?: Map<string, Type>,
  inferredFnParams?: Map<string, Type[]>,
  enumRegistry?: Map<string, EnumInfo>,
  structRegistry?: Map<string, StructInfo>,
  holeInfoByVar?: Map<number, HoleInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inferredCalls?: Map<number, { args: Type[]; returnType: Type }>,
  expectedType?: Type,
  inAsync: boolean = false
): Type | null {
  switch (stmt.type) {
    case 'FnDecl': {
      const fnEnv = env.child();
      const isAsync = !!stmt.async;
      const signature = buildFunctionSignature(stmt, holeInfoByVar);
      const prevReturn = activeReturnType;
      activeReturnType = signature.returnType;
      signature.paramTypes.forEach((t, idx) => {
        const param = stmt.params[idx];
        if (param) {
          fnEnv.extend(param.name, { kind: 'scheme', variables: [], type: t });
        }
      });
      const { paramTypes, returnType, typeParamIds } = signature;
      for (const bodyStmt of stmt.body.body) {
        inferStatement(
          bodyStmt,
          fnEnv,
          subst,
          diagnostics,
          returnType,
          inferredLets,
          inferredFnReturns,
          inferredFnByName,
          inferredFnParams,
          enumRegistry,
          structRegistry,
          holeInfoByVar,
          moduleBindings,
          inferredCalls,
          undefined,
          isAsync
        );
      }
      const effectiveReturn = isAsync ? promiseType(returnType) : returnType;
      const fnType: Type = { kind: 'function', args: paramTypes, returnType: effectiveReturn };
      if (!env.lookup(stmt.name)) {
        env.extend(stmt.name, { kind: 'scheme', variables: typeParamIds, type: fnType });
      }
      const prunedReturn = normalizeType(effectiveReturn, subst);
      if (stmt.location?.start) {
        inferredFnReturns?.set(keyFromLocation(stmt.location), prunedReturn);
      }
      inferredFnByName?.set(stmt.name, prunedReturn);
      inferredFnParams?.set(stmt.name, paramTypes.map((param) => prune(param, subst)));
      activeReturnType = prevReturn;
      return fnType;
    }
    case 'Let': {
      const expected = stmt.typeName
        ? parseTypeName(stmt.typeName, holeInfoByVar, {
            ownerKind: 'let',
            ownerName: stmt.name,
            ownerLocation: stmt.location,
          }, stmt.location)
        : expectedType;
      const valueType = inferExpr(
        stmt.value,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        expected,
        inAsync
      );
      if (!valueType) return null;
      if (expected) {
        const annotationLabel = stmt.typeName ? formatTypeAnnotation(stmt.typeName) : null;
        const note = annotationLabel ? `Expected '${stmt.name}' to match annotation '${annotationLabel}'` : undefined;
        tryUnify(expected, valueType, subst, diagnostics, { location: stmt.location, note });
      }
      const scheme = generalize(valueType, subst, env.freeVars(subst));
      env.extend(stmt.name, scheme);
      if (stmt.location?.start) {
        inferredLets?.set(keyFromLocation(stmt.location), valueType);
      }
      return valueType;
    }
    case 'Return': {
      if (!currentReturn) return null;
      const valueType = inferExpr(
        stmt.value,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        currentReturn,
        inAsync
      );
      if (!valueType) return null;
      tryUnify(currentReturn, valueType, subst, diagnostics, {
        location: stmt.location,
        note: 'Return expression must match the function return type',
      });
      return valueType;
    }
    case 'ExprStmt': {
      return inferExpr(
        stmt.expr,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        expectedType,
        inAsync
      );
    }
    case 'If': {
      const condType = inferExpr(
        stmt.condition,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        undefined,
        inAsync
      );
      if (condType) {
        tryUnify(condType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
          location: stmt.condition.location,
          note: 'Condition must be a bool',
        });
      }
      const thenEnv = env.child();
      if (stmt.condition.type === 'IsExpr') {
        const narrowing = getIsNarrowing(
          stmt.condition,
          env,
          subst,
          diagnostics,
          enumRegistry,
          moduleBindings,
          inAsync
        );
        if (narrowing) {
          thenEnv.extend(narrowing.name, { kind: 'scheme', variables: [], type: narrowing.type });
        }
      }
      for (const bodyStmt of stmt.thenBlock.body) {
        inferStatement(
          bodyStmt,
          thenEnv,
          subst,
          diagnostics,
          currentReturn,
          inferredLets,
          inferredFnReturns,
          inferredFnByName,
          inferredFnParams,
          enumRegistry,
          structRegistry,
          holeInfoByVar,
          moduleBindings,
          inferredCalls,
          undefined,
          inAsync
        );
      }
      if (stmt.elseBlock) {
        const elseEnv = env.child();
        if (stmt.condition.type === 'IsExpr') {
          const narrowing = getIsElseNarrowing(
            stmt.condition,
            env,
            subst,
            diagnostics,
            enumRegistry,
            moduleBindings,
            inAsync
          );
          if (narrowing) {
            elseEnv.extend(narrowing.name, { kind: 'scheme', variables: [], type: narrowing.type });
          }
        }
        for (const bodyStmt of stmt.elseBlock.body) {
          inferStatement(
            bodyStmt,
            elseEnv,
            subst,
            diagnostics,
            currentReturn,
            inferredLets,
            inferredFnReturns,
            inferredFnByName,
            inferredFnParams,
            enumRegistry,
            structRegistry,
            holeInfoByVar,
            moduleBindings,
            inferredCalls,
            undefined,
            inAsync
          );
        }
      }
      return null;
    }
    case 'While': {
      const condType = inferExpr(
        stmt.condition,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        undefined,
        inAsync
      );
      if (condType) {
        tryUnify(condType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
          location: stmt.condition.location,
          note: 'Loop condition must be a bool',
        });
      }
      const loopEnv = env.child();
      for (const bodyStmt of stmt.body.body) {
        inferStatement(
          bodyStmt,
          loopEnv,
          subst,
          diagnostics,
          currentReturn,
          inferredLets,
          inferredFnReturns,
          inferredFnByName,
          inferredFnParams,
          enumRegistry,
          structRegistry,
          holeInfoByVar,
          moduleBindings,
          inferredCalls,
          undefined,
          inAsync
        );
      }
      return null;
    }
    case 'MatchStmt': {
      const scrutineeType = inferExpr(
        stmt.value,
        env,
        subst,
        diagnostics,
        enumRegistry,
        structRegistry,
        moduleBindings,
        inferredCalls,
        undefined,
        inAsync
      );
      for (const arm of stmt.arms) {
        const armEnv = env.child();
        if (scrutineeType) {
          applyMatchPattern(arm.pattern, scrutineeType, armEnv, subst, diagnostics, enumRegistry);
        }
        for (const bodyStmt of arm.body.body) {
          inferStatement(
            bodyStmt,
            armEnv,
            subst,
            diagnostics,
            currentReturn,
            inferredLets,
            inferredFnReturns,
            inferredFnByName,
            inferredFnParams,
            enumRegistry,
            structRegistry,
            holeInfoByVar,
            moduleBindings,
            inferredCalls,
            undefined,
            inAsync
          );
        }
      }
      if (scrutineeType && enumRegistry) {
        checkMatchExhaustiveness(stmt.arms, scrutineeType, subst, enumRegistry, diagnostics, stmt.location);
      }
      return null;
    }
    case 'Block': {
      const blockEnv = env.child();
      for (const bodyStmt of stmt.body) {
        inferStatement(
          bodyStmt,
          blockEnv,
          subst,
          diagnostics,
          currentReturn,
          inferredLets,
          inferredFnReturns,
          inferredFnByName,
          inferredFnParams,
          enumRegistry,
          structRegistry,
          holeInfoByVar,
          moduleBindings,
          inferredCalls,
          undefined,
          inAsync
        );
      }
      return null;
    }
    default:
      return null;
  }
}

function inferExpr(
  expr: LuminaExpr,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>,
  structRegistry?: Map<string, StructInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inferredCalls?: Map<number, { args: Type[]; returnType: Type }>,
  expectedType?: Type,
  inAsync: boolean = false
): Type | null {
  const inferChild = (node: LuminaExpr, expected?: Type): Type | null =>
    inferExpr(
      node,
      env,
      subst,
      diagnostics,
      enumRegistry,
      structRegistry,
      moduleBindings,
      inferredCalls,
      expected,
      inAsync
    );
  switch (expr.type) {
    case 'Number':
      return recordExprType(expr, inferNumberLiteralType(expr), subst);
    case 'String':
      return recordExprType(expr, { kind: 'primitive', name: 'string' }, subst);
    case 'Boolean':
      return recordExprType(expr, { kind: 'primitive', name: 'bool' }, subst);
    case 'Await': {
      if (!inAsync) {
        diagnostics.push({
          severity: 'error',
          code: 'AWAIT_OUTSIDE_ASYNC',
          message: `'await' can only be used inside async functions`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      }
      const valueType = inferChild(expr.value);
      if (!valueType) return null;
      const innerType = freshTypeVar();
      tryUnify(valueType, promiseType(innerType), subst, diagnostics, {
        location: expr.location,
        note: `Await expects a Promise value`,
      });
      return recordExprType(expr, innerType, subst);
    }
    case 'Try': {
      const valueType = inferChild(expr.value);
      if (!valueType) return null;
      const okType = freshTypeVar();
      const errType = freshTypeVar();
      const resultType: Type = { kind: 'adt', name: 'Result', params: [okType, errType] };
      tryUnify(valueType, resultType, subst, diagnostics, {
        location: expr.location,
        note: `'?' expects a Result value`,
      });
      if (!activeReturnType) {
        diagnostics.push({
          severity: 'error',
          code: 'TRY_OUTSIDE_FUNCTION',
          message: `'?' can only be used inside functions returning Result`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      } else {
        const returnOk = freshTypeVar();
        const returnResult: Type = { kind: 'adt', name: 'Result', params: [returnOk, errType] };
        tryUnify(activeReturnType, returnResult, subst, diagnostics, {
          location: expr.location,
          note: `'?' requires the function to return Result`,
        });
      }
      return recordExprType(expr, okType, subst);
    }
    case 'Identifier': {
      const scheme = env.lookup(expr.name);
      if (!scheme) return null;
      return recordExprType(expr, instantiate(scheme), subst);
    }
    case 'Move': {
      const valueType = inferChild(expr.target, expectedType);
      if (!valueType) return null;
      return recordExprType(expr, valueType, subst);
    }
    case 'Cast': {
      const valueType = inferChild(expr.expr);
      if (!valueType) return null;
      const targetType = parseTypeName(expr.targetType, undefined, undefined, defaultLocation);
      const fromNumeric = numericPrimitiveOf(valueType, subst);
      const toNumeric = numericPrimitiveOf(targetType, subst);
      if (!fromNumeric || !toNumeric) {
        diagnostics.push({
          severity: 'error',
          code: 'TYPE-CAST',
          message: `Cannot cast ${formatType(valueType, subst)} to ${formatType(targetType, subst)}`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      } else if (isLossyNumericCast(fromNumeric, toNumeric)) {
        diagnostics.push({
          severity: 'warning',
          code: 'LOSSY-CAST',
          message: `Lossy conversion from ${formatType(valueType, subst)} to ${formatType(targetType, subst)}`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      }
      return recordExprType(expr, targetType, subst);
    }
    case 'Binary': {
      const left = inferChild(expr.left);
      const right = inferChild(expr.right);
      if (!left || !right) return null;
      if (expr.op === '==' || expr.op === '!=') {
        tryUnify(left, right, subst, diagnostics, {
          location: expr.location,
          note: `Operands of '${expr.op}' must be comparable`,
        });
        return recordExprType(expr, { kind: 'primitive', name: 'bool' }, subst);
      }
      if (['+', '-', '*', '/', '<', '>', '<=', '>='].includes(expr.op)) {
        const comparison = expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=';
        const leftResolved = prune(left, subst);
        const rightResolved = prune(right, subst);

        const fallback: Type = { kind: 'primitive', name: 'i32' };
        const unifyWith = (expected: Type) => {
          tryUnify(left, expected, subst, diagnostics, {
            location: expr.location,
            note: `Left operand of '${expr.op}' must be numeric`,
          });
          tryUnify(right, expected, subst, diagnostics, {
            location: expr.location,
            note: `Right operand of '${expr.op}' must be numeric`,
          });
        };

        if (
          leftResolved.kind === 'primitive' &&
          isNumericPrimitiveName(normalizePrimitiveName(leftResolved.name))
        ) {
          tryUnify(right, leftResolved, subst, diagnostics, {
            location: expr.location,
            note: `Right operand of '${expr.op}' must match numeric type`,
          });
        } else if (
          rightResolved.kind === 'primitive' &&
          isNumericPrimitiveName(normalizePrimitiveName(rightResolved.name))
        ) {
          tryUnify(left, rightResolved, subst, diagnostics, {
            location: expr.location,
            note: `Left operand of '${expr.op}' must match numeric type`,
          });
        } else {
          unifyWith(fallback);
        }

        const resolved = prune(left, subst);
        const resultNumeric =
          resolved.kind === 'primitive'
            ? ({ kind: 'primitive', name: normalizePrimitiveName(resolved.name) } as Type)
            : fallback;

        return recordExprType(
          expr,
          comparison ? ({ kind: 'primitive', name: 'bool' } as Type) : resultNumeric,
          subst
        );
      }
      return null;
    }
    case 'Call': {
      const enumName = expr.enumName;
      const isShadowed = enumName ? env.lookup(enumName) : undefined;
      if (enumName && !isShadowed && moduleBindings) {
        const moduleExport = moduleBindings.get(enumName);
        if (moduleExport?.kind === 'module') {
          const member = moduleExport.exports.get(expr.callee.name);
          if (!member || member.kind !== 'function') {
            diagnostics.push({
              severity: 'error',
              code: 'HM_MODULE_MEMBER',
              message: `Unknown module member '${expr.enumName}.${expr.callee.name}'`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          const calleeType = instantiate(member.hmType);
          const argTypes = expr.args.map((arg) => inferChild(arg) ?? freshTypeVar());
          const resultType = freshTypeVar();
          const fnType: Type = { kind: 'function', args: argTypes, returnType: resultType };
          tryUnify(calleeType, fnType, subst, diagnostics, {
            location: expr.location,
            note: `In call to '${expr.enumName}.${expr.callee.name}'`,
          });
          if (expectedType) {
            tryUnify(resultType, expectedType, subst, diagnostics, {
              location: expr.location,
              note: `Call result of '${expr.enumName}.${expr.callee.name}' must match expected type`,
            });
          }
          recordCallSignature(expr, argTypes, resultType, subst, inferredCalls);
          return recordExprType(expr, resultType, subst);
        }
      }
      if (enumName && !isShadowed && enumRegistry) {
        const constructorType = inferEnumConstructor(
          expr,
          env,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          expectedType,
          inAsync
        );
        if (constructorType) return recordExprType(expr, constructorType, subst);
      }
      const calleeScheme = env.lookup(expr.callee.name);
      if (!calleeScheme) return null;
      const calleeType = instantiate(calleeScheme);
      const argTypes = expr.args.map((arg) => inferChild(arg) ?? freshTypeVar());
      const resultType = freshTypeVar();
      const fnType: Type = { kind: 'function', args: argTypes, returnType: resultType };
      tryUnify(calleeType, fnType, subst, diagnostics, {
        location: expr.location,
        note: `In call to '${expr.callee.name}'`,
      });
      if (expectedType) {
        tryUnify(resultType, expectedType, subst, diagnostics, {
          location: expr.location,
          note: `Call result of '${expr.callee.name}' must match expected type`,
        });
      }
      recordCallSignature(expr, argTypes, resultType, subst, inferredCalls);
      return recordExprType(expr, resultType, subst);
    }
    case 'Member': {
      const objectName = expr.object.type === 'Identifier' ? expr.object.name : null;
      const isValueObject = objectName ? !!env.lookup(objectName) : false;
      if (objectName && moduleBindings) {
        const moduleExport = moduleBindings.get(objectName);
        if (moduleExport?.kind === 'module') {
          const member = moduleExport.exports.get(expr.property);
          if (member?.kind === 'function' || member?.kind === 'value') {
            return recordExprType(expr, instantiate(member.hmType), subst);
          }
          diagnostics.push({
            severity: 'error',
            code: 'HM_MODULE_MEMBER',
            message: `Unknown module member '${objectName}.${expr.property}'`,
            source: 'lumina',
            location: diagLocation(expr.location),
          });
          return null;
        }
      }
      if (!isValueObject && enumRegistry && objectName) {
        const info = enumRegistry.get(objectName);
        if (info) {
          const variantParams = info.variants.get(expr.property);
          if (!variantParams) {
            diagnostics.push({
              severity: 'error',
              code: 'HM_ENUM_VARIANT',
              message: `Unknown enum variant '${objectName}.${expr.property}'`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          if (variantParams.length > 0) {
            diagnostics.push({
              severity: 'error',
              code: 'HM_ENUM_VARIANT',
              message: `Enum variant '${objectName}.${expr.property}' requires ${variantParams.length} arguments`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          const paramTypes = info.typeParams.map(() => freshTypeVar());
          const enumType: Type = { kind: 'adt', name: objectName, params: paramTypes };
          if (expectedType) {
            tryUnify(enumType, expectedType, subst, diagnostics);
          }
          return recordExprType(expr, enumType, subst);
        }
      }
      const objectType = inferChild(expr.object);
      if (!objectType) return null;
      if (structRegistry) {
        const fieldType = resolveStructFieldType(objectType, expr.property, structRegistry, subst);
        if (fieldType) {
          if (expectedType) {
            tryUnify(fieldType, expectedType, subst, diagnostics, {
              location: expr.location,
              note: `Field '${expr.property}' must match expected type`,
            });
          }
          return recordExprType(expr, fieldType, subst);
        }
      }
      if (activeRowPolymorphism) {
        const fieldType = freshTypeVar();
        const tailVar = freshTypeVar();
        const expectedRow: Type = {
          kind: 'row',
          fields: new Map([[expr.property, fieldType]]),
          tail: tailVar,
        };
        tryUnify(objectType, expectedRow, subst, diagnostics, {
          location: expr.location,
          note: `Field '${expr.property}' access`,
        });
        return recordExprType(expr, fieldType, subst);
      }
      return null;
    }
    case 'IsExpr': {
      const isType = inferIsExpr(expr, env, subst, diagnostics, enumRegistry, moduleBindings, inAsync);
      return isType ? recordExprType(expr, isType, subst) : null;
    }
    case 'MatchExpr': {
      const scrutineeType = inferChild(expr.value);
      if (!scrutineeType) return null;
      let resultType: Type | null = null;
      for (const arm of expr.arms) {
        const armEnv = env.child();
        applyMatchPattern(arm.pattern, scrutineeType, armEnv, subst, diagnostics, enumRegistry);
        const armType = inferExpr(
          arm.body,
          armEnv,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          expectedType ?? undefined,
          inAsync
        );
        if (!armType) continue;
        if (!resultType) {
          resultType = armType;
        } else {
          tryUnify(resultType, armType, subst, diagnostics, {
            location: arm.location,
            note: 'Match arms must return the same type',
          });
        }
      }
      if (enumRegistry) {
        checkMatchExhaustiveness(expr.arms, scrutineeType, subst, enumRegistry, diagnostics, expr.location);
      }
      const finalType = resultType ?? freshTypeVar();
      return recordExprType(expr, finalType, subst);
    }
    case 'StructLiteral': {
      if (!structRegistry) return null;
      const info = structRegistry.get(expr.name);
      if (!info) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_STRUCT',
          message: `Unknown struct '${expr.name}'`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
        return null;
      }
      const typeParamMap = new Map<string, Type>();
      if (expr.typeArgs && expr.typeArgs.length > 0) {
        info.typeParams.forEach((name, idx) => {
          const arg = expr.typeArgs?.[idx];
          if (arg) typeParamMap.set(name, parseTypeName(arg));
        });
      } else if (expectedType && expectedType.kind === 'adt' && expectedType.name === expr.name) {
        info.typeParams.forEach((name, idx) => {
          const arg = expectedType.params[idx];
          if (arg) typeParamMap.set(name, arg);
        });
      }
      const paramTypes = info.typeParams.map((name) => typeParamMap.get(name) ?? freshTypeVar());
      info.typeParams.forEach((name, idx) => {
        if (!typeParamMap.has(name)) {
          typeParamMap.set(name, paramTypes[idx]);
        }
      });
      const structType: Type = { kind: 'adt', name: expr.name, params: paramTypes };
      if (expectedType) {
        tryUnify(structType, expectedType, subst, diagnostics);
      }
      for (const field of expr.fields) {
        const fieldTypeName = info.fields.get(field.name);
        if (!fieldTypeName) continue;
        const expectedFieldType = parseTypeNameWithEnv(fieldTypeName, typeParamMap);
        const actualFieldType = inferChild(field.value, expectedFieldType);
        if (actualFieldType) {
          tryUnify(expectedFieldType, actualFieldType, subst, diagnostics, {
            location: field.location ?? expr.location,
            note: `Field '${field.name}' must match expected type for struct '${expr.name}'`,
          });
          recordExprType(field.value, actualFieldType, subst);
        }
      }
      return recordExprType(expr, structType, subst);
    }
    default:
      return null;
  }
}

function instantiate(scheme: TypeScheme): Type {
  const mapping = new Map<number, Type>();
  for (const id of scheme.variables) {
    mapping.set(id, freshTypeVar());
  }
  return substituteVars(scheme.type, mapping);
}

function substituteVars(type: Type, mapping: Map<number, Type>): Type {
  if (type.kind === 'variable') {
    return mapping.get(type.id) ?? type;
  }
  if (type.kind === 'function') {
    return {
      kind: 'function',
      args: type.args.map(arg => substituteVars(arg, mapping)),
      returnType: substituteVars(type.returnType, mapping),
    };
  }
  if (type.kind === 'promise') {
    return { kind: 'promise', inner: substituteVars(type.inner, mapping) };
  }
  if (type.kind === 'adt') {
    return { kind: 'adt', name: type.name, params: type.params.map(p => substituteVars(p, mapping)) };
  }
  if (type.kind === 'row') {
    const fields = new Map<string, Type>();
    for (const [name, value] of type.fields) {
      fields.set(name, substituteVars(value, mapping));
    }
    return { kind: 'row', fields, tail: type.tail ? substituteVars(type.tail, mapping) : null };
  }
  return type;
}

function isTypeHoleExpr(typeName: LuminaTypeExpr): typeName is LuminaTypeHole {
  return typeof typeName === 'object' && !!typeName && (typeName as LuminaTypeHole).kind === 'TypeHole';
}

function parseTypeName(
  typeName: LuminaTypeExpr,
  holeInfoByVar?: Map<number, HoleInfo>,
  holeInfo?: HoleInfo,
  defaultLocation?: Location
): Type {
  if (isTypeHoleExpr(typeName) || typeName === '_') {
    const variable = freshTypeVar();
    if (variable.kind === 'variable' && holeInfoByVar && holeInfo) {
      const holeLocation = isTypeHoleExpr(typeName) ? typeName.location : defaultLocation;
      holeInfoByVar.set(variable.id, { ...holeInfo, holeLocation });
    }
    return variable;
  }
  if (typeof typeName !== 'string') {
    return { kind: 'primitive', name: 'any' };
  }
  if (
    typeName === 'int' ||
    typeName === 'float' ||
    typeName === 'string' ||
    typeName === 'bool' ||
    typeName === 'void' ||
    typeName === 'any' ||
    typeName === 'i8' ||
    typeName === 'i16' ||
    typeName === 'i32' ||
    typeName === 'i64' ||
    typeName === 'i128' ||
    typeName === 'u8' ||
    typeName === 'u16' ||
    typeName === 'u32' ||
    typeName === 'u64' ||
    typeName === 'u128' ||
    typeName === 'f32' ||
    typeName === 'f64'
  ) {
    return { kind: 'primitive', name: typeName as PrimitiveName };
  }
  const idx = typeName.indexOf('<');
  if (idx === -1) {
    return { kind: 'adt', name: typeName, params: [] };
  }
  const base = typeName.slice(0, idx);
  const inner = typeName.slice(idx + 1, -1);
  const args = splitTypeArgs(inner).map((arg) => parseTypeName(arg, holeInfoByVar, holeInfo, defaultLocation));
  if (base === 'Promise' && args.length === 1) {
    return promiseType(args[0]);
  }
  return { kind: 'adt', name: base, params: args };
}

function formatTypeAnnotation(typeName: LuminaTypeExpr): string {
  if (isTypeHoleExpr(typeName) || typeName === '_') return '_';
  return typeof typeName === 'string' ? normalizeTypeForDisplay(typeName) : 'any';
}

function holeOwnerMessage(info: HoleInfo): string {
  switch (info.ownerKind) {
    case 'fn-param':
      return `Hole in parameter '${info.paramName ?? 'unknown'}' of '${info.ownerName}'`;
    case 'fn-return':
      return `Hole in return type of '${info.ownerName}'`;
    case 'let':
    default:
      return `Hole in annotation for '${info.ownerName}'`;
  }
}

function getHoleConstraintType(
  info: HoleInfo,
  inferredLets: Map<string, Type>,
  inferredFnByName: Map<string, Type>,
  inferredFnParams: Map<string, Type[]>
): Type | null {
  if (info.ownerKind === 'let') {
    if (!info.ownerLocation?.start) return null;
    const key = keyFromLocation(diagLocation(info.ownerLocation));
    return inferredLets.get(key) ?? null;
  }
  if (info.ownerKind === 'fn-param') {
    if (info.paramIndex == null) return null;
    return inferredFnParams.get(info.ownerName)?.[info.paramIndex] ?? null;
  }
  if (info.ownerKind === 'fn-return') {
    return inferredFnByName.get(info.ownerName) ?? null;
  }
  return null;
}

function validateTypeHoles(
  holeInfoByVar: Map<number, HoleInfo>,
  subst: Subst,
  diagnostics: Diagnostic[],
  inferredLets: Map<string, Type>,
  inferredFnByName: Map<string, Type>,
  inferredFnParams: Map<string, Type[]>
) {
  for (const [varId, info] of holeInfoByVar.entries()) {
    const resolved = prune({ kind: 'variable', id: varId }, subst);
    if (resolved.kind !== 'variable') continue;
    const location = info.holeLocation ?? info.ownerLocation ?? defaultLocation;
    const related: Array<{ location: Location; message: string }> = [];
    related.push({
      location: diagLocation(location),
      message: `Hole type: ${formatType({ kind: 'variable', id: varId }, subst)}`,
    });
    if (info.ownerLocation) {
      related.push({
        location: diagLocation(info.ownerLocation),
        message: holeOwnerMessage(info),
      });
    }
    const constraint = getHoleConstraintType(info, inferredLets, inferredFnByName, inferredFnParams);
    if (constraint) {
      related.push({
        location: diagLocation(info.ownerLocation ?? location),
        message: `Inferred type: ${formatType(constraint, subst)}`,
      });
    }
    diagnostics.push({
      severity: 'error',
      message: `Cannot infer type for hole '_'`,
      code: 'LUM-010',
      source: 'lumina',
      location: diagLocation(location),
      relatedInformation: related.length > 0 ? related : undefined,
    });
  }
}

function splitTypeArgs(input: string): string[] {
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
}

function tryUnify(
  t1: Type,
  t2: Type,
  subst: Subst,
  diagnostics: Diagnostic[],
  context?: { location?: Location; note?: string }
) {
  try {
    let left = t1;
    let right = t2;
    if (activeRowPolymorphism && activeStructRegistry) {
      const leftPruned = prune(left, subst);
      const rightPruned = prune(right, subst);
      if (leftPruned.kind === 'row' || rightPruned.kind === 'row') {
        left = structTypeToRow(leftPruned, activeStructRegistry, subst) ?? left;
        right = structTypeToRow(rightPruned, activeStructRegistry, subst) ?? right;
      }
    }
    const trace: UnificationTraceEntry[] = context
      ? [
          {
            expected: left,
            found: right,
            note: context.note,
            location: context.location,
          },
        ]
      : [];
    const structRegistry = activeStructRegistry;
    const rowResolver =
      activeRowPolymorphism && structRegistry
        ? (type: Type) => structTypeToRow(type, structRegistry, subst)
        : undefined;
    unify(left, right, subst, activeWrapperSet, trace, rowResolver);
  } catch (err) {
    const isUnify = err instanceof UnificationError;
    const rawMessage = err instanceof Error ? err.message : 'Type mismatch';
    const reason = isUnify ? err.reason : rawMessage.includes('Function arity mismatch') ? 'arity' : 'mismatch';
    const code = reason === 'arity' ? 'LUM-002' : 'LUM-001';
    const expected = isUnify ? err.expected : t1;
    const found = isUnify ? err.found : t2;
    const formatted = `Type mismatch. Expected '${formatType(expected, subst)}' but found '${formatType(found, subst)}'`;
    const note = context?.note ? ` ${context.note}` : '';
    const message = code === 'LUM-002' ? rawMessage : `${formatted}${note}`.trim();
    const relatedInformation = isUnify
      ? err.trace
          .filter((entry) => entry.note || entry.location)
          .map((entry) => ({
            location: diagLocation(entry.location),
            message: entry.note ?? 'Type constraint',
          }))
      : context?.note
        ? [
            {
              location: diagLocation(context.location),
              message: context.note,
            },
          ]
        : undefined;
    diagnostics.push({
      severity: 'error',
      message,
      code,
      source: 'lumina',
      location: diagLocation(context?.location),
      relatedInformation,
    });
  }
}

function recordCallSignature(
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  argTypes: Type[],
  resultType: Type,
  subst: Subst,
  inferredCalls?: Map<number, { args: Type[]; returnType: Type }>
) {
  if (!inferredCalls || typeof expr.id !== 'number') return;
  const args = argTypes.map((arg) => normalizeType(arg, subst));
  const ret = normalizeType(resultType, subst);
  inferredCalls.set(expr.id, { args, returnType: ret });
}

function normalizeType(type: Type, subst: Subst): Type {
  const pruned = prune(type, subst);
  if (pruned.kind === 'function') {
    return {
      kind: 'function',
      args: pruned.args.map(arg => normalizeType(arg, subst)),
      returnType: normalizeType(pruned.returnType, subst),
    };
  }
  if (pruned.kind === 'adt') {
    return { kind: 'adt', name: pruned.name, params: pruned.params.map(param => normalizeType(param, subst)) };
  }
  if (pruned.kind === 'promise') {
    return { kind: 'promise', inner: normalizeType(pruned.inner, subst) };
  }
  if (pruned.kind === 'row') {
    const fields = new Map<string, Type>();
    for (const [name, value] of pruned.fields) {
      fields.set(name, normalizeType(value, subst));
    }
    return { kind: 'row', fields, tail: pruned.tail ? normalizeType(pruned.tail, subst) : null };
  }
  return pruned;
}

function recordExprType(expr: { id?: number }, type: Type, subst: Subst): Type {
  const normalized = normalizeType(type, subst);
  if (activeInferredExprs && typeof expr.id === 'number') {
    activeInferredExprs.set(expr.id, normalized);
  }
  return normalized;
}

function keyFromLocation(location: { start: { line: number; column: number; offset: number } }): string {
  return `${location.start.line}:${location.start.column}:${location.start.offset}`;
}

function buildEnumRegistry(program: LuminaProgram): Map<string, EnumInfo> {
  const registry = new Map<string, EnumInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'EnumDecl') continue;
    const typeParams = (stmt.typeParams ?? []).map(param => param.name);
    const variants = new Map<string, LuminaTypeExpr[]>();
    for (const variant of stmt.variants) {
      variants.set(variant.name, variant.params ?? []);
    }
    registry.set(stmt.name, { typeParams, variants });
  }
  return registry;
}

function buildStructRegistry(program: LuminaProgram): Map<string, StructInfo> {
  const registry = new Map<string, StructInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'StructDecl') continue;
    const typeParams = (stmt.typeParams ?? []).map(param => param.name);
    const fields = new Map<string, LuminaTypeExpr>();
    for (const field of stmt.body) {
      fields.set(field.name, field.typeName);
    }
    registry.set(stmt.name, { typeParams, fields });
  }
  return registry;
}

function inferEnumConstructor(
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry: Map<string, EnumInfo>,
  structRegistry?: Map<string, StructInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inferredCalls?: Map<number, { args: Type[]; returnType: Type }>,
  expectedType?: Type,
  inAsync: boolean = false
): Type | null {
  if (!expr.enumName) return null;
  const info = enumRegistry.get(expr.enumName);
  if (!info) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM',
      message: `Unknown enum '${expr.enumName}'`,
      source: 'lumina',
      location: diagLocation(expr.location),
    });
    return null;
  }
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const enumParamMap = new Map<string, Type>();
  info.typeParams.forEach((name, idx) => enumParamMap.set(name, paramTypes[idx]));
  const variantParams = info.variants.get(expr.callee.name);
  if (!variantParams) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM_VARIANT',
      message: `Unknown enum variant '${expr.enumName}.${expr.callee.name}'`,
      source: 'lumina',
      location: diagLocation(expr.location),
    });
    return null;
  }
  const argTypes = expr.args.map((arg) =>
    inferExpr(
      arg,
      env,
      subst,
      diagnostics,
      enumRegistry,
      structRegistry,
      moduleBindings,
      inferredCalls,
      undefined,
      inAsync
    ) ?? freshTypeVar()
  );
  for (let i = 0; i < argTypes.length && i < variantParams.length; i++) {
    const expected = parseTypeNameWithEnv(variantParams[i], enumParamMap);
    tryUnify(argTypes[i], expected, subst, diagnostics);
  }
  const enumType: Type = { kind: 'adt', name: expr.enumName, params: paramTypes };
  if (expectedType) {
    tryUnify(enumType, expectedType, subst, diagnostics);
  }
  return prune(enumType, subst);
}

function applyMatchPattern(
  pattern: LuminaMatchPattern,
  scrutineeType: Type,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>
) {
  if (pattern.type === 'WildcardPattern') return;
  const enumName = pattern.enumName ?? (scrutineeType.kind === 'adt' ? scrutineeType.name : null);
  if (!enumName || !enumRegistry) return;
  const info = enumRegistry.get(enumName);
  if (!info) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM',
      message: `Unknown enum '${enumName}'`,
      source: 'lumina',
      location: diagLocation(pattern.location),
    });
    return;
  }
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const enumParamMap = new Map<string, Type>();
  info.typeParams.forEach((name, idx) => enumParamMap.set(name, paramTypes[idx]));
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  tryUnify(scrutineeType, expectedEnumType, subst, diagnostics);
  const variantParams = info.variants.get(pattern.variant);
  if (!variantParams) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM_VARIANT',
      message: `Unknown enum variant '${enumName}.${pattern.variant}'`,
      source: 'lumina',
      location: diagLocation(pattern.location),
    });
    return;
  }
  for (let i = 0; i < pattern.bindings.length && i < variantParams.length; i++) {
    const binding = pattern.bindings[i];
    if (binding === '_') continue;
    const expected = parseTypeNameWithEnv(variantParams[i], enumParamMap);
    env.extend(binding, { kind: 'scheme', variables: [], type: expected });
  }
}

function getIsNarrowing(
  expr: Extract<LuminaExpr, { type: 'IsExpr' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inAsync: boolean = false
): { name: string; type: Type } | null {
  if (!enumRegistry) return null;
  if (expr.value.type !== 'Identifier') return null;
  const enumName = resolveEnumName(expr.enumName, expr.variant, enumRegistry);
  if (!enumName) return null;
  const info = enumRegistry.get(enumName);
  if (!info) return null;
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  const current = inferExpr(
    expr.value,
    env,
    subst,
    diagnostics,
    enumRegistry,
    undefined,
    moduleBindings,
    undefined,
    undefined,
    inAsync
  );
  if (current) {
    tryUnify(current, expectedEnumType, subst, diagnostics);
  }
  return { name: expr.value.name, type: prune(expectedEnumType, subst) };
}

function getIsElseNarrowing(
  expr: Extract<LuminaExpr, { type: 'IsExpr' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inAsync: boolean = false
): { name: string; type: Type } | null {
  if (!enumRegistry) return null;
  if (expr.value.type !== 'Identifier') return null;
  const enumName = resolveEnumName(expr.enumName, expr.variant, enumRegistry);
  if (!enumName) return null;
  const info = enumRegistry.get(enumName);
  if (!info || info.variants.size !== 2) return null;
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  const current = inferExpr(
    expr.value,
    env,
    subst,
    diagnostics,
    enumRegistry,
    undefined,
    moduleBindings,
    undefined,
    undefined,
    inAsync
  );
  if (current) {
    tryUnify(current, expectedEnumType, subst, diagnostics);
  }
  return { name: expr.value.name, type: prune(expectedEnumType, subst) };
}

function inferIsExpr(
  expr: Extract<LuminaExpr, { type: 'IsExpr' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>,
  moduleBindings?: Map<string, ModuleExport>,
  inAsync: boolean = false
): Type | null {
  const condType = inferExpr(
    expr.value,
    env,
    subst,
    diagnostics,
    enumRegistry,
    undefined,
    moduleBindings,
    undefined,
    undefined,
    inAsync
  );
  if (!enumRegistry) return { kind: 'primitive', name: 'bool' };
  const enumName = resolveEnumName(expr.enumName, expr.variant, enumRegistry);
  if (!enumName) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM_VARIANT',
      message: `Unknown enum variant '${expr.variant}'`,
      source: 'lumina',
      location: diagLocation(expr.location),
    });
    return { kind: 'primitive', name: 'bool' };
  }
  const info = enumRegistry.get(enumName);
  if (!info) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM',
      message: `Unknown enum '${enumName}'`,
      source: 'lumina',
      location: diagLocation(expr.location),
    });
    return { kind: 'primitive', name: 'bool' };
  }
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  if (condType) {
    tryUnify(condType, expectedEnumType, subst, diagnostics);
  }
  return { kind: 'primitive', name: 'bool' };
}

function resolveEnumName(
  enumName: string | null | undefined,
  variant: string,
  enumRegistry: Map<string, EnumInfo>
): string | null {
  if (enumName) return enumName;
  let found: string | null = null;
  for (const [name, info] of enumRegistry.entries()) {
    if (!info.variants.has(variant)) continue;
    if (found && found !== name) return null;
    found = name;
  }
  return found;
}

function parseTypeNameWithEnv(
  typeName: LuminaTypeExpr,
  typeParams: Map<string, Type>,
  holeInfoByVar?: Map<number, HoleInfo>,
  holeInfo?: HoleInfo,
  defaultLocation?: Location
): Type {
  if (isTypeHoleExpr(typeName) || typeName === '_') {
    const variable = freshTypeVar();
    if (variable.kind === 'variable' && holeInfoByVar && holeInfo) {
      const holeLocation = isTypeHoleExpr(typeName) ? typeName.location : defaultLocation;
      holeInfoByVar.set(variable.id, { ...holeInfo, holeLocation });
    }
    return variable;
  }
  if (typeof typeName !== 'string') {
    return { kind: 'primitive', name: 'any' };
  }
  const baseIdx = typeName.indexOf('<');
  const base = baseIdx === -1 ? typeName : typeName.slice(0, baseIdx);
  const direct = typeParams.get(base);
  if (direct) return direct;
  if (baseIdx === -1) {
    return parseTypeName(typeName, holeInfoByVar, holeInfo, defaultLocation);
  }
  const inner = typeName.slice(baseIdx + 1, -1);
  const args = splitTypeArgs(inner).map(arg => parseTypeNameWithEnv(arg, typeParams, holeInfoByVar, holeInfo, defaultLocation));
  if (base === 'Promise' && args.length === 1) {
    return promiseType(args[0]);
  }
  return { kind: 'adt', name: base, params: args };
}

function resolveStructFieldType(
  objectType: Type,
  field: string,
  structRegistry: Map<string, StructInfo>,
  subst: Subst
): Type | null {
  const pruned = prune(objectType, subst);
  if (pruned.kind !== 'adt') return null;
  const info = structRegistry.get(pruned.name);
  if (!info) return null;
  const typeParamMap = new Map<string, Type>();
  info.typeParams.forEach((name, idx) => {
    typeParamMap.set(name, pruned.params[idx] ?? freshTypeVar());
  });
  const fieldTypeName = info.fields.get(field);
  if (!fieldTypeName) return null;
  return parseTypeNameWithEnv(fieldTypeName, typeParamMap);
}

function structTypeToRow(
  objectType: Type,
  structRegistry: Map<string, StructInfo>,
  subst: Subst
): Type | null {
  const pruned = prune(objectType, subst);
  if (pruned.kind !== 'adt') return null;
  const info = structRegistry.get(pruned.name);
  if (!info) return null;
  const typeParamMap = new Map<string, Type>();
  info.typeParams.forEach((name, idx) => {
    typeParamMap.set(name, pruned.params[idx] ?? freshTypeVar());
  });
  const fields = new Map<string, Type>();
  for (const [fieldName, fieldTypeName] of info.fields) {
    fields.set(fieldName, parseTypeNameWithEnv(fieldTypeName, typeParamMap));
  }
  return { kind: 'row', fields, tail: null };
}

function formatType(type: Type, subst: Subst): string {
  const pruned = prune(type, subst);
  switch (pruned.kind) {
    case 'primitive':
      return normalizeTypeNameForDisplay(pruned.name);
    case 'hole':
      return '_';
    case 'variable':
      return `unknown(t${pruned.id})`;
    case 'function': {
      const args = pruned.args.map((arg) => formatType(arg, subst)).join(', ');
      return `(${args}) -> ${formatType(pruned.returnType, subst)}`;
    }
    case 'adt':
      if (pruned.params.length === 0) return pruned.name;
      return `${pruned.name}<${pruned.params.map((param) => formatType(param, subst)).join(', ')}>`;
    case 'promise':
      return `Promise<${formatType(pruned.inner, subst)}>`;
    case 'row': {
      const fields = Array.from(pruned.fields.entries()).map(
        ([name, value]) => `${name}: ${formatType(value, subst)}`
      );
      const tail = pruned.tail ? formatType(pruned.tail, subst) : null;
      if (tail) {
        return `{ ${fields.join(', ')} | ${tail} }`;
      }
      return `{ ${fields.join(', ')} }`;
    }
    default:
      return 'unknown';
  }
}

function checkMatchExhaustiveness(
  arms: Array<{ pattern: LuminaMatchPattern }>,
  scrutineeType: Type,
  subst: Subst,
  enumRegistry: Map<string, EnumInfo>,
  diagnostics: Diagnostic[],
  location?: Location
) {
  const resolved = prune(scrutineeType, subst);
  let enumName: string | null = resolved.kind === 'adt' ? resolved.name : null;
  if (!enumName) {
    for (const arm of arms) {
      if (arm.pattern.type === 'EnumPattern' && arm.pattern.enumName) {
        enumName = arm.pattern.enumName;
        break;
      }
    }
  }
  if (!enumName) return;
  const info = enumRegistry.get(enumName);
  if (!info) return;
  const defined = new Set(info.variants.keys());
  const covered = new Set<string>();
  let hasWildcard = false;
  for (const arm of arms) {
    const pattern = arm.pattern;
    if (pattern.type === 'WildcardPattern') {
      hasWildcard = true;
      break;
    }
    if (pattern.type === 'EnumPattern') {
      if (pattern.enumName && pattern.enumName !== enumName) continue;
      covered.add(pattern.variant);
    }
  }
  if (hasWildcard) return;
  const missing = Array.from(defined).filter(name => !covered.has(name));
  if (missing.length === 0) return;
  diagnostics.push({
    severity: 'error',
    code: 'LUM-003',
    message: `Non-exhaustive match. Missing cases: ${missing.join(', ')}`,
    source: 'lumina',
    location: diagLocation(location),
  });
}

function checkStructRecursion(
  stmt: Extract<LuminaStatement, { type: 'StructDecl' }>,
  diagnostics: Diagnostic[],
  wrapperSet: Set<string>
) {
  const structName = stmt.name;
  for (const field of stmt.body) {
    const parsed = parseTypeName(field.typeName);
    if (hasIllegalRecursion(parsed, structName, wrapperSet, false)) {
      diagnostics.push({
        severity: 'error',
        code: 'RECURSIVE_TYPE_ERROR',
        message: `Recursive type detected: field '${field.name}' directly references '${structName}' without a wrapper`,
        source: 'lumina',
        location: diagLocation(field.location),
      });
    }
  }
}

function hasIllegalRecursion(
  type: Type,
  target: string,
  wrapperSet: Set<string>,
  passedBarrier: boolean
): boolean {
  if (type.kind !== 'adt') return false;
  if (type.name === target) {
    return !passedBarrier;
  }
  const nextBarrier = passedBarrier || wrapperSet.has(type.name);
  return type.params.some((param) => hasIllegalRecursion(param, target, wrapperSet, nextBarrier));
}
