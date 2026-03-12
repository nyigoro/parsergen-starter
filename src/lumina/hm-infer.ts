import {
  type LuminaProgram,
  type LuminaStatement,
  type LuminaExpr,
  type LuminaMatchPattern,
  type LuminaTypeParam,
  type LuminaConstExpr,
} from './ast.js';
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
  HKT_APPLY_TYPE_NAME,
} from './types.js';
import { normalizeTypeForDisplay, normalizeTypeNameForDisplay } from './type-utils.js';
import { type Diagnostic, type DiagnosticRelatedInformation } from '../parser/index.js';
import { type Location } from '../utils/index.js';
import {
  createStdModuleRegistry,
  getPreludeExports,
  resolveModuleBindings,
  resolveModuleFunctionCandidates,
  type ModuleExport,
  type ModuleFunction,
  type ModuleRegistry,
} from './module-registry.js';
import { expandMacrosInProgram } from './macro-expand.js';
import { expandDerivesInProgram } from './derive-expand.js';
import { type LuminaTypeExpr, type LuminaTypeHole } from './ast.js';
import { ConstEvaluator } from './const-eval.js';
import type { ConstExpr as TypeConstExpr } from './types.js';

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
  variants: Map<string, EnumVariantInfo>;
}

interface EnumVariantInfo {
  name: string;
  params: LuminaTypeExpr[];
  resultType?: LuminaTypeExpr | null;
  existentialTypeParams?: string[];
  location?: Location;
}

interface VariantMatchCandidate {
  variantName: string;
  variantInfo: EnumVariantInfo;
  resultType: Type;
  paramTypes: Type[];
}

interface ExistentialWitness {
  id: number;
  name: string;
  enumName: string;
  variantName: string;
  scopeId?: number;
  location?: Location;
}

interface PatternRefinementContext {
  existentialWitnesses: ExistentialWitness[];
  scopeId: number;
  depthLimitReported?: boolean;
  refinementStack?: Set<string>;
}

interface PatternConstraintSolveResult {
  reachable: boolean;
  diagnostics: Diagnostic[];
}

interface StructInfo {
  typeParams: string[];
  fields: Map<string, LuminaTypeExpr>;
  derives: string[];
}

interface TypeAliasInfo {
  typeParams: string[];
  target: LuminaTypeExpr;
}

interface ConstFnConstraintInfo {
  typeParams: LuminaTypeParam[];
  whereClauses: TypeConstExpr[];
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

const MAX_GADT_REFINEMENT_DEPTH = 32;

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
  usize: 32,
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

function parseConstExprText(text: string): TypeConstExpr | null {
  const tokens = text.match(/<=|>=|==|!=|\|\||&&|[(){}!,+\-*/<>]|[A-Za-z_][A-Za-z0-9_]*|\d+/g);
  if (!tokens || tokens.length === 0) return null;
  let index = 0;
  const peek = (): string | null => (index < tokens.length ? tokens[index] : null);
  const consume = (): string | null => (index < tokens.length ? tokens[index++] : null);
  const match = (token: string): boolean => {
    if (peek() !== token) return false;
    consume();
    return true;
  };

  const parsePrimary = (): TypeConstExpr | null => {
    const token = consume();
    if (!token) return null;
    if (/^\d+$/.test(token)) return { kind: 'const-literal', value: Number(token) };
    if (token === 'true') return { kind: 'const-literal', value: true };
    if (token === 'false') return { kind: 'const-literal', value: false };
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      if (peek() === '(') {
        consume();
        const args: TypeConstExpr[] = [];
        if (peek() !== ')') {
          while (true) {
            const arg = parseConstExpr();
            if (!arg) return null;
            args.push(arg);
            if (!match(',')) break;
          }
        }
        if (!match(')')) return null;
        return { kind: 'const-call', name: token, args };
      }
      return { kind: 'const-param', name: token };
    }
    if (token === '(') {
      const inner = parseConstExpr();
      if (peek() !== ')') return null;
      consume();
      return inner;
    }
    return null;
  };

  const parseUnary = (): TypeConstExpr | null => {
    const token = peek();
    if (token === '-' || token === '!') {
      consume();
      const expr = parseUnary();
      if (!expr) return null;
      return { kind: 'const-unary', op: token, expr };
    }
    return parsePrimary();
  };

  const parseMulDiv = (): TypeConstExpr | null => {
    let left = parseUnary();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '*' && op !== '/') break;
      consume();
      const right = parseUnary();
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

  const parseCompare = (): TypeConstExpr | null => {
    let left = parseAddSub();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '<' && op !== '<=' && op !== '>' && op !== '>=') break;
      consume();
      const right = parseAddSub();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parseEquality = (): TypeConstExpr | null => {
    let left = parseCompare();
    if (!left) return null;
    while (true) {
      const op = peek();
      if (op !== '==' && op !== '!=') break;
      consume();
      const right = parseCompare();
      if (!right) return null;
      left = { kind: 'const-binary', op, left, right };
    }
    return left;
  };

  const parseAnd = (): TypeConstExpr | null => {
    let left = parseEquality();
    if (!left) return null;
    while (match('&&')) {
      const right = parseEquality();
      if (!right) return null;
      left = { kind: 'const-binary', op: '&&', left, right };
    }
    return left;
  };

  const parseOr = (): TypeConstExpr | null => {
    let left = parseAnd();
    if (!left) return null;
    while (match('||')) {
      const right = parseAnd();
      if (!right) return null;
      left = { kind: 'const-binary', op: '||', left, right };
    }
    return left;
  };

  const parseIf = (): TypeConstExpr | null => {
    if (peek() !== 'if') return parseOr();
    consume();
    const condition = parseConstExpr();
    if (!condition) return null;
    if (!match('{')) return null;
    const thenExpr = parseConstExpr();
    if (!thenExpr || !match('}')) return null;
    if (!match('else')) return null;
    if (!match('{')) return null;
    const elseExpr = parseConstExpr();
    if (!elseExpr || !match('}')) return null;
    return { kind: 'const-if', condition, thenExpr, elseExpr };
  };

  const parseConstExpr = (): TypeConstExpr | null => parseIf();

  const parsed = parseConstExpr();
  if (!parsed || index !== tokens.length) return null;
  return parsed;
}

function evaluateConstExprText(text: string): number | null {
  const expr = parseConstExprText(text);
  if (!expr) return null;
  const evaluator = new ConstEvaluator();
  return evaluator.evaluate(expr);
}

function constExprToText(expr: TypeConstExpr): string {
  switch (expr.kind) {
    case 'const-literal':
      return String(expr.value);
    case 'const-param':
      return expr.name;
    case 'const-unary':
      return `${expr.op}${constExprToText(expr.expr)}`;
    case 'const-binary':
      return `${constExprToText(expr.left)}${expr.op}${constExprToText(expr.right)}`;
    case 'const-call':
      return `${expr.name}(${(expr.args ?? []).map((arg) => constExprToText(arg)).join(',')})`;
    case 'const-if':
      return `if ${constExprToText(expr.condition)} { ${constExprToText(expr.thenExpr)} } else { ${constExprToText(expr.elseExpr)} }`;
    default:
      return '_';
  }
}

function evaluateConstExprAnyText(text: string): number | boolean | null {
  const expr = parseConstExprText(text);
  if (!expr) return null;
  const evaluator = new ConstEvaluator();
  return evaluator.evaluateAny(expr);
}

function callTypeArgToText(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (!arg || typeof arg !== 'object') return '_';
  if ('type' in (arg as Record<string, unknown>)) {
    return renderConstExpr(arg as LuminaConstExpr);
  }
  return '_';
}

function buildConstFnConstraintRegistry(program: LuminaProgram): Map<string, ConstFnConstraintInfo> {
  const registry = new Map<string, ConstFnConstraintInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    const typeParams = (stmt.typeParams ?? []).filter((param) => !!param.isConst);
    if (typeParams.length === 0) continue;
    const whereClauses = (stmt.whereClauses ?? [])
      .map((clause) => parseConstExprText(renderConstExpr(clause)))
      .filter((clause): clause is TypeConstExpr => clause != null);
    if (whereClauses.length === 0) continue;
    registry.set(stmt.name, {
      typeParams: stmt.typeParams ?? [],
      whereClauses,
    });
  }
  return registry;
}

function validateConstFnWhereClausesAtCall(
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  diagnostics: Diagnostic[]
): void {
  if (!activeConstFnConstraints) return;
  const meta = activeConstFnConstraints.get(expr.callee.name);
  if (!meta) return;
  const constParams = meta.typeParams.filter((param) => !!param.isConst);
  if (constParams.length === 0) return;
  if (!expr.typeArgs || expr.typeArgs.length !== meta.typeParams.length) return;

  const bindings = new Map<string, number>();
  for (let idx = 0; idx < meta.typeParams.length; idx += 1) {
    const param = meta.typeParams[idx];
    if (!param.isConst) continue;
    const text = callTypeArgToText(expr.typeArgs[idx] as unknown);
    const value = evaluateConstExprText(text);
    if (value !== null) bindings.set(param.name, value);
  }
  const missing = constParams.map((param) => param.name).filter((name) => !bindings.has(name));
  if (missing.length > 0) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_CONST_WHERE',
      message: `Cannot evaluate const where clause for '${expr.callee.name}' because const arguments are unresolved: ${missing.join(', ')}`,
      source: 'lumina',
      location: diagLocation(expr.location),
    });
    return;
  }

  for (const clause of meta.whereClauses) {
    const clauseText = constExprToText(clause);
    const substituted = clauseText.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) =>
      bindings.has(name) ? String(bindings.get(name)) : name
    );
    const result = evaluateConstExprAnyText(substituted);
    if (typeof result !== 'boolean') {
      diagnostics.push({
        severity: 'error',
        code: 'HM_CONST_WHERE',
        message: `Const where clause '${clauseText}' for '${expr.callee.name}' must evaluate to bool`,
        source: 'lumina',
        location: diagLocation(expr.location),
      });
      continue;
    }
    if (!result) {
      diagnostics.push({
        severity: 'error',
        code: 'HM_CONST_WHERE',
        message: `Const where clause '${clauseText}' is not satisfied for '${expr.callee.name}'`,
        source: 'lumina',
        location: diagLocation(expr.location),
      });
    }
  }
}

function extractExpectedArrayInfo(expectedType: Type | undefined, subst: Subst): { elem: Type; sizeText: string } | null {
  if (!expectedType) return null;
  const pruned = prune(expectedType, subst);
  if (pruned.kind !== 'adt' || pruned.name !== 'Array' || pruned.params.length < 2) return null;
  const elem = pruned.params[0];
  const sizeType = prune(pruned.params[1], subst);
  if (sizeType.kind === 'adt' && sizeType.params.length === 0) {
    return { elem, sizeText: sizeType.name };
  }
  if (sizeType.kind === 'primitive') {
    return { elem, sizeText: sizeType.name };
  }
  return { elem, sizeText: 'unknown' };
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
let activeConstFnConstraints: Map<string, ConstFnConstraintInfo> | null = null;
let activeRowPolymorphism = false;
let activeTypeAliasRegistry: Map<string, TypeAliasInfo> | null = null;
let activeReturnType: Type | null = null;
let activeInferLoopDepth = 0;
let activeExistentialScopeSeed = 0;
let activeRigidExistentials: Map<number, ExistentialWitness> | null = null;
let activeFnParamInfo: Map<string, { names: string[]; defaults: Array<LuminaExpr | null> }> | null = null;

export function inferProgram(
  program: LuminaProgram,
  options?: {
    moduleRegistry?: ModuleRegistry;
    moduleBindings?: Map<string, ModuleExport>;
    preludeExports?: ModuleExport[];
    recursiveWrappers?: string[];
    useRowPolymorphism?: boolean;
    skipMacroExpansion?: boolean;
    skipDeriveExpansion?: boolean;
  }
): InferResult {
  activeWrapperSet = new Set(options?.recursiveWrappers ?? defaultWrapperList);
  activeReturnType = null;
  activeInferLoopDepth = 0;
  activeExistentialScopeSeed = 0;
  activeRigidExistentials = null;
  const env = new TypeEnv();
  const subst: Subst = new Map();
  const diagnostics: Diagnostic[] = [];
  if (!options?.skipDeriveExpansion) {
    const deriveExpansion = expandDerivesInProgram(program);
    diagnostics.push(...deriveExpansion.diagnostics);
  }
  if (!options?.skipMacroExpansion) {
    const macroExpansion = expandMacrosInProgram(program);
    diagnostics.push(...macroExpansion.diagnostics);
  }
  const fnParamInfo = new Map<string, { names: string[]; defaults: Array<LuminaExpr | null> }>();
  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    fnParamInfo.set(stmt.name, {
      names: stmt.params.map((param) => param.name),
      defaults: stmt.params.map((param) => param.defaultValue ?? null),
    });
  }
  activeFnParamInfo = fnParamInfo;
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
  const typeAliasRegistry = buildTypeAliasRegistry(program);
  activeConstFnConstraints = buildConstFnConstraintRegistry(program);
  activeStructRegistry = structRegistry;
  activeTypeAliasRegistry = typeAliasRegistry;
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
  activeConstFnConstraints = null;
  activeTypeAliasRegistry = null;
  activeFnParamInfo = null;
  activeRowPolymorphism = false;
  activeExistentialScopeSeed = 0;
  activeRigidExistentials = null;
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
  for (let index = 0; index < stmt.body.body.length; index += 1) {
    const bodyStmt = stmt.body.body[index];
    const isTailExpr = index === stmt.body.body.length - 1 && bodyStmt.type === 'ExprStmt';
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
      isTailExpr ? signature.returnType : undefined,
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
      for (let index = 0; index < stmt.body.body.length; index += 1) {
        const bodyStmt = stmt.body.body[index];
        const isTailExpr = index === stmt.body.body.length - 1 && bodyStmt.type === 'ExprStmt';
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
          isTailExpr ? returnType : undefined,
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
    case 'LetTuple': {
      const valueType = inferExpr(
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
      if (!valueType) return null;

      const pruned = prune(valueType, subst);
      let tupleItems: Type[] | null = null;
      if (pruned.kind === 'adt' && pruned.name === 'Channel' && pruned.params.length >= 1) {
        const itemType = pruned.params[0];
        tupleItems = [
          { kind: 'adt', name: 'Sender', params: [itemType] },
          { kind: 'adt', name: 'Receiver', params: [itemType] },
        ];
      }

      if (!tupleItems) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_TUPLE_DESTRUCTURE',
          message: `Cannot destructure value of type '${formatType(pruned, subst)}'`,
          source: 'lumina',
          location: diagLocation(stmt.location),
        });
        return null;
      }
      if (tupleItems.length !== stmt.names.length) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_TUPLE_ARITY',
          message: `Tuple destructuring expected ${tupleItems.length} binding(s), found ${stmt.names.length}`,
          source: 'lumina',
          location: diagLocation(stmt.location),
        });
        return null;
      }

      stmt.names.forEach((name, idx) => {
        const item = tupleItems?.[idx] ?? freshTypeVar();
        const scheme = generalize(item, subst, env.freeVars(subst));
        env.extend(name, scheme);
      });
      return valueType;
    }
    case 'LetElse': {
      const valueType = inferExpr(
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
      if (!valueType) return null;
      const thenEnv = env.child();
      applyMatchPattern(stmt.pattern, valueType, thenEnv, subst, diagnostics, enumRegistry);
      const elseEnv = env.child();
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
    case 'Break': {
      if (activeInferLoopDepth <= 0) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_BREAK_OUTSIDE_LOOP',
          message: `'break' is only allowed inside loops`,
          source: 'lumina',
          location: diagLocation(stmt.location),
        });
      }
      return null;
    }
    case 'Continue': {
      if (activeInferLoopDepth <= 0) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_CONTINUE_OUTSIDE_LOOP',
          message: `'continue' is only allowed inside loops`,
          source: 'lumina',
          location: diagLocation(stmt.location),
        });
      }
      return null;
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
    case 'IfLet': {
      const valueType = inferExpr(
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
      if (!valueType) return null;
      const thenEnv = env.child();
      applyMatchPattern(stmt.pattern, valueType, thenEnv, subst, diagnostics, enumRegistry);
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
      activeInferLoopDepth += 1;
      try {
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
      } finally {
        activeInferLoopDepth -= 1;
      }
      return null;
    }
    case 'For': {
      const iterableType = inferExpr(
        stmt.iterable,
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
      if (iterableType) {
        tryUnify(iterableType, { kind: 'adt', name: 'Range', params: [] }, subst, diagnostics, {
          location: stmt.iterable.location,
          note: 'for loops currently require a Range iterable',
        });
      }
      const loopEnv = env.child();
      loopEnv.extend(stmt.iterator, { kind: 'scheme', variables: [], type: { kind: 'primitive', name: 'i32' } });
      activeInferLoopDepth += 1;
      try {
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
      } finally {
        activeInferLoopDepth -= 1;
      }
      return null;
    }
    case 'WhileLet': {
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
      const loopEnv = env.child();
      if (scrutineeType) {
        applyMatchPattern(stmt.pattern, scrutineeType, loopEnv, subst, diagnostics, enumRegistry);
      }
      activeInferLoopDepth += 1;
      try {
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
      } finally {
        activeInferLoopDepth -= 1;
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
      const matchEntrySubst = new Map<number, Type>(subst);
      for (const arm of stmt.arms) {
        const armEnv = env.child();
        const armSubst = new Map<number, Type>(matchEntrySubst);
        const armPatternContext: PatternRefinementContext = {
          existentialWitnesses: [],
          scopeId: ++activeExistentialScopeSeed,
          refinementStack: new Set<string>(),
        };
        const patternDiagnostics: Diagnostic[] = [];
        if (scrutineeType) {
          applyMatchPattern(
            arm.pattern,
            scrutineeType,
            armEnv,
            armSubst,
            patternDiagnostics,
            enumRegistry,
            armPatternContext
          );
        }
        const patternResult = solvePatternRefinementDiagnostics(
          arm.pattern,
          patternDiagnostics,
          arm.location ?? stmt.location
        );
        diagnostics.push(...patternResult.diagnostics);
        if (!patternResult.reachable) {
          continue;
        }
        withExistentialScope(armPatternContext.existentialWitnesses, () => {
          if (arm.guard) {
            const guardType = inferExpr(
              arm.guard,
              armEnv,
              armSubst,
              diagnostics,
              enumRegistry,
              structRegistry,
              moduleBindings,
              inferredCalls,
              undefined,
              inAsync
            );
            if (guardType) {
              tryUnify(guardType, { kind: 'primitive', name: 'bool' }, armSubst, diagnostics, {
                location: arm.guard.location,
                note: 'Match guard must be a bool',
              });
            }
          }
          for (const bodyStmt of arm.body.body) {
            inferStatement(
              bodyStmt,
              armEnv,
              armSubst,
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
        });
      }
      if (scrutineeType && enumRegistry) {
        checkMatchExhaustiveness(stmt.arms, scrutineeType, subst, enumRegistry, diagnostics, stmt.location);
      }
      return null;
    }
    case 'TraitDecl':
    case 'ImplDecl':
      return null;
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
    case 'ArrayLiteral': {
      const expectedPruned = expectedType ? prune(expectedType, subst) : null;
      const expectedVecElem =
        expectedPruned && expectedPruned.kind === 'adt' && expectedPruned.name === 'Vec' && expectedPruned.params.length === 1
          ? expectedPruned.params[0]
          : null;
      const expectedArrayInfo = extractExpectedArrayInfo(expectedType, subst);
      const expectedElem = expectedArrayInfo?.elem ?? expectedVecElem;
      let elemType: Type | null = expectedElem;
      for (const element of expr.elements) {
        const inferredElement = inferChild(element, elemType ?? undefined);
        if (!inferredElement) continue;
        if (!elemType) {
          elemType = inferredElement;
          continue;
        }
        tryUnify(inferredElement, elemType, subst, diagnostics, {
          location: element.location,
          note: 'Array elements must share a common type',
        });
      }
      const finalElemType = elemType ?? freshTypeVar();
      if (expectedArrayInfo) {
        const expectedSize = evaluateConstExprText(expectedArrayInfo.sizeText);
        const actualSize = expr.elements.length;
        if (expectedSize !== null && expectedSize !== actualSize) {
          diagnostics.push({
            severity: 'error',
            code: 'CONST-SIZE-MISMATCH',
            message: `Array size mismatch: expected ${expectedSize} (from '${expectedArrayInfo.sizeText}'), got ${actualSize}`,
            source: 'lumina',
            location: diagLocation(expr.location),
            relatedInformation: [
              {
                location: diagLocation(expr.location),
                message: `Help: literal must have ${expectedSize} elements to satisfy [T; ${expectedArrayInfo.sizeText}]`,
              },
            ],
          });
        }
        const sizeName = expectedArrayInfo.sizeText;
        const arrayType: Type = {
          kind: 'adt',
          name: 'Array',
          params: [finalElemType, { kind: 'adt', name: sizeName, params: [] }],
        };
        if (expectedType) {
          tryUnify(arrayType, expectedType, subst, diagnostics, {
            location: expr.location,
            note: 'Array literal must match expected array type',
          });
        }
        return recordExprType(expr, arrayType, subst);
      }

      const vecType: Type = { kind: 'adt', name: 'Vec', params: [finalElemType] };
      if (expectedType) {
        tryUnify(vecType, expectedType, subst, diagnostics, {
          location: expr.location,
          note: 'Array literal must match expected type',
        });
      }
      return recordExprType(expr, vecType, subst);
    }
    case 'ArrayRepeatLiteral': {
      const expectedPruned = expectedType ? prune(expectedType, subst) : null;
      const expectedVecElem =
        expectedPruned && expectedPruned.kind === 'adt' && expectedPruned.name === 'Vec' && expectedPruned.params.length === 1
          ? expectedPruned.params[0]
          : null;
      const expectedArrayInfo = extractExpectedArrayInfo(expectedType, subst);
      const expectedElem = expectedArrayInfo?.elem ?? expectedVecElem;
      const valueType = inferChild(expr.value, expectedElem ?? undefined) ?? expectedElem ?? freshTypeVar();
      const countType = inferChild(expr.count, { kind: 'primitive', name: 'i32' }) ?? freshTypeVar();
      tryUnify(countType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
        location: expr.count.location,
        note: 'Array repeat count must be i32',
      });
      if (expectedArrayInfo && expr.count.type === 'Number') {
        const expectedSize = evaluateConstExprText(expectedArrayInfo.sizeText);
        const actualSize = Math.trunc(expr.count.value);
        if (expectedSize !== null && expectedSize !== actualSize) {
          diagnostics.push({
            severity: 'error',
            code: 'CONST-SIZE-MISMATCH',
            message: `Array size mismatch: expected ${expectedSize} (from '${expectedArrayInfo.sizeText}'), got ${actualSize}`,
            source: 'lumina',
            location: diagLocation(expr.location),
            relatedInformation: [
              {
                location: diagLocation(expr.location),
                message: `Help: repeat count must evaluate to ${expectedSize} to satisfy [T; ${expectedArrayInfo.sizeText}]`,
              },
            ],
          });
        }
      }
      if (expectedArrayInfo) {
        const countName = expectedArrayInfo.sizeText;
        const arrayType: Type = {
          kind: 'adt',
          name: 'Array',
          params: [valueType, { kind: 'adt', name: countName, params: [] }],
        };
        if (expectedType) {
          tryUnify(arrayType, expectedType, subst, diagnostics, {
            location: expr.location,
            note: 'Array repeat literal must match expected array type',
          });
        }
        return recordExprType(expr, arrayType, subst);
      }
      const vecType: Type = { kind: 'adt', name: 'Vec', params: [valueType] };
      if (expectedType) {
        tryUnify(vecType, expectedType, subst, diagnostics, {
          location: expr.location,
          note: 'Array repeat literal must match expected type',
        });
      }
      return recordExprType(expr, vecType, subst);
    }
    case 'ListComprehension': {
      const comp = expr as Extract<LuminaExpr, { type: 'ListComprehension' }>;
      const elemType = freshTypeVar();
      const expectedSource: Type = { kind: 'adt', name: 'Vec', params: [elemType] };
      const sourceType = inferChild(comp.source, expectedSource) ?? expectedSource;
      tryUnify(sourceType, expectedSource, subst, diagnostics, {
        location: comp.source.location,
        note: 'Comprehension source must be a Vec',
      });

      const env1 = env.child();
      env1.extend(comp.binding, { kind: 'scheme', variables: [], type: elemType });

      let envForBody = env1;
      if (comp.source2 && comp.binding2) {
        const elemType2 = freshTypeVar();
        const expectedSource2: Type = { kind: 'adt', name: 'Vec', params: [elemType2] };
        const source2Type = inferExpr(
          comp.source2,
          env1,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          expectedSource2,
          inAsync
        );
        if (source2Type) {
          tryUnify(source2Type, expectedSource2, subst, diagnostics, {
            location: comp.source2.location,
            note: 'Comprehension source must be a Vec',
          });
        }
        const env2 = env1.child();
        env2.extend(comp.binding2, { kind: 'scheme', variables: [], type: elemType2 });
        envForBody = env2;
      }

      if (comp.filter) {
        const filterType = inferExpr(
          comp.filter,
          envForBody,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          { kind: 'primitive', name: 'bool' },
          inAsync
        );
        if (filterType) {
          tryUnify(filterType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
            location: comp.filter.location,
            note: 'Comprehension filter must return bool',
          });
        }
      }

      const bodyType =
        inferExpr(
          comp.body,
          envForBody,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          undefined,
          inAsync
        ) ?? freshTypeVar();

      const vecType: Type = { kind: 'adt', name: 'Vec', params: [bodyType] };
      if (expectedType) {
        tryUnify(vecType, expectedType, subst, diagnostics, {
          location: comp.location,
          note: 'Comprehension result must match expected type',
        });
      }
      return recordExprType(expr, vecType, subst);
    }
    case 'MacroInvoke': {
      if (expr.expansionError) {
        for (const arg of expr.args) {
          inferChild(arg);
        }
        return recordExprType(expr, freshTypeVar(), subst);
      }
      for (const arg of expr.args) {
        inferChild(arg);
      }
      diagnostics.push({
        severity: 'error',
        code: 'HM_MACRO',
        message: `Unknown macro '${expr.name}!'`,
        source: 'lumina',
        location: diagLocation(expr.location),
      });
      return recordExprType(expr, freshTypeVar(), subst);
    }
    case 'TupleLiteral': {
      const items: Type[] = [];
      for (const element of expr.elements) {
        items.push(
          inferChild(element, undefined) ?? freshTypeVar()
        );
      }
      const tupleType: Type = { kind: 'adt', name: 'Tuple', params: items };
      if (expectedType) {
        tryUnify(tupleType, expectedType, subst, diagnostics, {
          location: expr.location,
          note: 'Tuple literal must match expected type',
        });
      }
      return recordExprType(expr, tupleType, subst);
    }
    case 'String':
      return recordExprType(expr, { kind: 'primitive', name: 'string' }, subst);
    case 'InterpolatedString': {
      for (const part of expr.parts) {
        if (typeof part === 'string') continue;
        inferChild(part);
      }
      return recordExprType(expr, { kind: 'primitive', name: 'string' }, subst);
    }
    case 'Range': {
      const isIntegerPrimitive = (name: PrimitiveName): boolean => {
        const normalized = normalizePrimitiveName(name);
        return normalized.startsWith('i') || normalized.startsWith('u');
      };
      const checkPart = (part: LuminaExpr | null, label: string) => {
        if (!part) return;
        const partType = inferChild(part);
        if (partType && partType.kind === 'primitive' && !isIntegerPrimitive(partType.name)) {
          diagnostics.push({
            severity: 'error',
            code: 'RANGE_TYPE',
            message: `Range ${label} must be an integer`,
            source: 'lumina',
            location: diagLocation(part.location),
          });
        }
      };
      checkPart(expr.start, 'start');
      checkPart(expr.end, 'end');
      return recordExprType(expr, { kind: 'adt', name: 'Range', params: [] }, subst);
    }
    case 'Index': {
      const objectType = inferChild(expr.object);
      const indexType = inferChild(expr.index);
      if (indexType && indexType.kind === 'adt' && indexType.name === 'Range') {
        if (objectType) {
          const prunedObject = prune(objectType, subst);
          if (prunedObject.kind === 'primitive' && normalizePrimitiveName(prunedObject.name) === 'string') {
            return recordExprType(expr, { kind: 'primitive', name: 'string' }, subst);
          }
          if (prunedObject.kind === 'adt' && (prunedObject.name === 'Vec' || prunedObject.name === 'Array')) {
            return recordExprType(expr, objectType, subst);
          }
          tryUnify(objectType, { kind: 'primitive', name: 'string' }, subst, diagnostics, {
            location: expr.location,
            note: `Range indexing expects a string or Vec/Array value`,
          });
        }
        return recordExprType(expr, { kind: 'primitive', name: 'string' }, subst);
      }
      if (objectType && objectType.kind === 'adt' && objectType.name === 'Vec' && objectType.params.length === 1) {
        if (indexType) {
          tryUnify(indexType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
            location: expr.location,
            note: 'Vec index must be an integer',
          });
        }
        return recordExprType(expr, objectType.params[0], subst);
      }
      if (objectType && objectType.kind === 'adt' && objectType.name === 'HashMap' && objectType.params.length === 2) {
        if (indexType) {
          tryUnify(indexType, objectType.params[0], subst, diagnostics, {
            location: expr.location,
            note: 'HashMap index must match key type',
          });
        }
        return recordExprType(expr, objectType.params[1], subst);
      }
      if (objectType && objectType.kind === 'variable') {
        const elemType = freshTypeVar();
        const vecType: Type = { kind: 'adt', name: 'Vec', params: [elemType] };
        tryUnify(objectType, vecType, subst, diagnostics, {
          location: expr.location,
          note: `Indexing expects a Vec`,
        });
        if (indexType) {
          tryUnify(indexType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
            location: expr.location,
            note: 'Vec index must be an integer',
          });
        }
        return recordExprType(expr, elemType, subst);
      }
      return recordExprType(expr, freshTypeVar(), subst);
    }
    case 'Boolean':
      return recordExprType(expr, { kind: 'primitive', name: 'bool' }, subst);
    case 'Lambda': {
      const lambdaEnv = env.child();
      const typeParamMap = new Map<string, Type>();
      for (const typeParam of expr.typeParams ?? []) {
        const typeVar = freshTypeVar();
        typeParamMap.set(typeParam.name, typeVar);
      }

      const paramTypes = expr.params.map((param) =>
        param.typeName
          ? parseTypeNameWithEnv(param.typeName, typeParamMap)
          : freshTypeVar()
      );
      paramTypes.forEach((paramType, index) => {
        const param = expr.params[index];
        if (param) {
          lambdaEnv.extend(param.name, { kind: 'scheme', variables: [], type: paramType });
        }
      });

      const declaredReturn = expr.returnType
        ? parseTypeNameWithEnv(expr.returnType, typeParamMap)
        : freshTypeVar();
      const prevReturn = activeReturnType;
      activeReturnType = declaredReturn;
      try {
        for (const bodyStmt of expr.body.body) {
          inferStatement(
            bodyStmt,
            lambdaEnv,
            subst,
            diagnostics,
            declaredReturn,
            undefined,
            undefined,
            undefined,
            undefined,
            enumRegistry,
            structRegistry,
            undefined,
            moduleBindings,
            inferredCalls,
            undefined,
            inAsync || !!expr.async
          );
        }
      } finally {
        activeReturnType = prevReturn;
      }

      const returnType = expr.async ? promiseType(declaredReturn) : declaredReturn;
      const lambdaType: Type = { kind: 'function', args: paramTypes, returnType };
      if (expectedType) {
        tryUnify(lambdaType, expectedType, subst, diagnostics, {
          location: expr.location,
          note: 'Lambda expression must match expected function type',
        });
      }
      return recordExprType(expr, lambdaType, subst);
    }
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
      const targetPruned = prune(targetType, subst);
      if (targetPruned.kind === 'primitive' && normalizePrimitiveName(targetPruned.name) === 'string') {
        return recordExprType(expr, targetType, subst);
      }
      if (targetPruned.kind === 'primitive' && normalizePrimitiveName(targetPruned.name) === 'bool') {
        const fromNumeric = numericPrimitiveOf(valueType, subst);
        const fromPruned = prune(valueType, subst);
        const fromBool = fromPruned.kind === 'primitive' && normalizePrimitiveName(fromPruned.name) === 'bool';
        if (!fromNumeric && !fromBool) {
          diagnostics.push({
            severity: 'error',
            code: 'TYPE-CAST',
            message: `Cannot cast ${formatType(valueType, subst)} to ${formatType(targetType, subst)}`,
            source: 'lumina',
            location: diagLocation(expr.location),
          });
        }
        return recordExprType(expr, targetType, subst);
      }
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
      const formatOverloadSignatures = (candidates: ModuleFunction[]): string =>
        candidates
          .map((candidate) => {
            const args = candidate.paramTypes.join(', ');
            return `${candidate.name}(${args}) -> ${candidate.returnType}`;
          })
          .join('; ');

      const selectModuleOverloadCandidate = (
        callName: string,
        candidates: ModuleFunction[],
        argTypes: Type[],
        callLocation: Location | undefined
      ): ModuleFunction | null => {
        if (candidates.length === 0) return null;
        const byArity = candidates.filter((candidate) => candidate.paramTypes.length === argTypes.length);
        if (byArity.length === 0) {
          if (candidates.length === 1) {
            diagnostics.push({
              severity: 'error',
              code: 'LUM-002',
              message: `Argument count mismatch for '${callName}'`,
              source: 'lumina',
              location: diagLocation(callLocation),
            });
            return null;
          }
          diagnostics.push({
            severity: 'error',
            code: 'OVERLOAD_NO_MATCH',
            message: `No overload for '${callName}' matches ${argTypes.length} argument(s). Available signatures: ${formatOverloadSignatures(
              candidates
            )}`,
            source: 'lumina',
            location: diagLocation(callLocation),
          });
          return null;
        }
        if (byArity.length === 1) return byArity[0];

        const viable: ModuleFunction[] = [];
        for (const candidate of byArity) {
          const trial = cloneSubst(subst);
          const candidateType = instantiate(candidate.hmType);
          const trialResult = freshTypeVar();
          const trialFn: Type = { kind: 'function', args: argTypes, returnType: trialResult };
          try {
            unify(candidateType, trialFn, trial, activeWrapperSet);
            viable.push(candidate);
          } catch {
            // candidate does not match argument shapes
          }
        }

        if (viable.length === 1) return viable[0];
        if (viable.length === 0) {
          diagnostics.push({
            severity: 'error',
            code: 'OVERLOAD_NO_MATCH',
            message: `No overload for '${callName}' matches inferred argument types (${argTypes
              .map((arg) => formatType(arg, subst))
              .join(', ')}). Available signatures: ${formatOverloadSignatures(byArity)}`,
            source: 'lumina',
            location: diagLocation(callLocation),
          });
          return null;
        }

        const withExact = viable.map((candidate) => {
          const parsedParams = candidate.paramTypes.map((param) => parseTypeName(param));
          let exact = 0;
          for (let i = 0; i < argTypes.length; i += 1) {
            const expected = parsedParams[i];
            if (!expected) continue;
            const actualNorm = normalizeType(argTypes[i], subst);
            const expectedNorm = normalizeType(expected, subst);
            if (formatType(actualNorm, subst) === formatType(expectedNorm, subst)) {
              exact += 1;
            }
          }
          return { candidate, exact };
        });
        const bestExact = Math.max(...withExact.map((entry) => entry.exact));
        const best = withExact.filter((entry) => entry.exact === bestExact).map((entry) => entry.candidate);
        if (best.length === 1) return best[0];

        diagnostics.push({
          severity: 'error',
          code: 'OVERLOAD_AMBIGUOUS',
          message: `Ambiguous overload for '${callName}'. Matching signatures: ${formatOverloadSignatures(best)}`,
          source: 'lumina',
          location: diagLocation(callLocation),
        });
        return null;
      };

      const rawArgs = expr.args ?? [];
      const rawArgValues = rawArgs.map((arg) => arg.value);

      const resolveArgsForHm = (
        paramNames: string[] | undefined,
        paramDefaults: Array<LuminaExpr | null> | undefined
      ): { args: Array<LuminaExpr | null>; missingRequired: boolean; tooMany: boolean } => {
        const hasNamed = rawArgs.some((arg) => arg.named);
        let seenNamed = false;
        let positionalAfterNamed = false;
        for (const arg of rawArgs) {
          if (arg.named) {
            seenNamed = true;
          } else if (seenNamed) {
            positionalAfterNamed = true;
          }
        }
        if (positionalAfterNamed) {
          diagnostics.push({
            severity: 'error',
            code: 'NAMED-ARG-004',
            message: 'Positional arguments cannot follow named arguments',
            source: 'lumina',
            location: diagLocation(expr.location),
          });
        }
        if (!paramNames || paramNames.length === 0) {
          if (hasNamed) {
            for (const arg of rawArgs) {
              if (!arg.named) continue;
              diagnostics.push({
                severity: 'error',
                code: 'NAMED-ARG-001',
                message: `Unknown parameter name '${arg.name ?? 'unknown'}'`,
                source: 'lumina',
                location: diagLocation(arg.location ?? expr.location),
              });
            }
          }
          return { args: rawArgValues, missingRequired: false, tooMany: false };
        }
        const resolved: Array<LuminaExpr | null> = Array(paramNames.length).fill(null);
        let positionalIndex = 0;
        let tooMany = false;
        for (const arg of rawArgs) {
          if (arg.named) continue;
          if (positionalIndex >= paramNames.length) {
            tooMany = true;
            continue;
          }
          resolved[positionalIndex] = arg.value;
          positionalIndex += 1;
        }
        for (const arg of rawArgs) {
          if (!arg.named) continue;
          const idx = paramNames.indexOf(arg.name ?? '');
          if (idx < 0) {
            diagnostics.push({
              severity: 'error',
              code: 'NAMED-ARG-001',
              message: `Unknown parameter name '${arg.name ?? 'unknown'}'`,
              source: 'lumina',
              location: diagLocation(arg.location ?? expr.location),
            });
            continue;
          }
          if (resolved[idx] != null) {
            diagnostics.push({
              severity: 'error',
              code: 'NAMED-ARG-002',
              message: `Parameter '${arg.name}' is already provided`,
              source: 'lumina',
              location: diagLocation(arg.location ?? expr.location),
            });
            continue;
          }
          resolved[idx] = arg.value;
        }
        let missingRequired = false;
        let reportedArityMismatch = false;
        for (let i = 0; i < paramNames.length; i += 1) {
          if (resolved[i] != null) continue;
          const fallback = paramDefaults?.[i] ?? null;
          if (fallback) {
            resolved[i] = fallback;
          } else {
            missingRequired = true;
            if (!hasNamed) {
              if (!reportedArityMismatch) {
                diagnostics.push({
                  severity: 'error',
                  code: 'LUM-002',
                  message: `Argument count mismatch for '${expr.callee.name}'`,
                  source: 'lumina',
                  location: diagLocation(expr.location),
                });
                reportedArityMismatch = true;
              }
            } else {
              diagnostics.push({
                severity: 'error',
                code: 'NAMED-ARG-003',
                message: `Missing argument for parameter '${paramNames[i]}'`,
                source: 'lumina',
                location: diagLocation(expr.location),
              });
            }
          }
        }
        return { args: resolved, missingRequired, tooMany };
      };

      if (!expr.receiver && !expr.enumName && expr.callee.name === 'cast') {
        if ((expr.typeArgs?.length ?? 0) !== 1 || rawArgValues.length !== 1) {
          diagnostics.push({
            severity: 'error',
            code: 'TYPE-CAST',
            message: `cast requires exactly one type argument and one value argument (for example: cast::<i32>(value))`,
            source: 'lumina',
            location: diagLocation(expr.location),
          });
          return null;
        }
        const targetArg = expr.typeArgs?.[0];
        const targetType = typeof targetArg === 'string' ? targetArg : '_';
        const syntheticCast: LuminaExpr = {
          type: 'Cast',
          expr: rawArgValues[0],
          targetType,
          location: expr.location,
        };
        return inferChild(syntheticCast, expectedType);
      }

      const inferReceiverCall = (receiverExpr: LuminaExpr): Type => {
        const receiverType = inferChild(receiverExpr);
        const argTypes = rawArgValues.map((arg) => inferChild(arg) ?? freshTypeVar());
        const resultType = freshTypeVar();
        let resolvedReceiverMethod = false;
        const receiverResolved = receiverType ? prune(receiverType, subst) : null;
        if (receiverResolved && receiverResolved.kind === 'primitive') {
          const receiverPrim = normalizePrimitiveName(receiverResolved.name);
          if (isIntPrimitive(receiverPrim) || isFloatPrimitive(receiverPrim)) {
            switch (expr.callee.name) {
              case 'millis':
              case 'milliseconds':
              case 'seconds':
              case 'minutes':
              case 'hours':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Numeric duration helper returns i32 milliseconds`,
                });
                break;
              default:
                break;
            }
          }
        }
        if (receiverResolved && receiverResolved.kind === 'adt') {
          if (receiverResolved.name === 'Vec' && receiverResolved.params.length === 1) {
            const elemType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'push':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], elemType, subst, diagnostics, {
                    location: expr.location,
                    note: `Vec.push expects element type`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.push returns void`,
                });
                break;
              case 'get':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                    location: expr.location,
                    note: `Vec.get index must be an integer`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.get returns Option<T>`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.len returns i32`,
                });
                break;
              case 'pop':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.pop returns Option<T>`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.clear returns void`,
                });
                break;
              case 'map': {
                resolvedReceiverMethod = true;
                const mappedType = freshTypeVar();
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: mappedType },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.map expects fn(T) -> U`,
                    }
                  );
                }
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [mappedType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.map returns Vec<U>`,
                });
                break;
              }
              case 'filter':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: { kind: 'primitive', name: 'bool' } },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.filter expects fn(T) -> bool`,
                    }
                  );
                }
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.filter returns Vec<T>`,
                });
                break;
              case 'fold': {
                resolvedReceiverMethod = true;
                const accType = argTypes[0] ?? freshTypeVar();
                if (argTypes[1]) {
                  tryUnify(
                    argTypes[1],
                    { kind: 'function', args: [accType, elemType], returnType: accType },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.fold expects fn(U, T) -> U`,
                    }
                  );
                }
                tryUnify(resultType, accType, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.fold returns accumulator type`,
                });
                break;
              }
              case 'for_each':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: { kind: 'primitive', name: 'void' } },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.for_each expects fn(T) -> void`,
                    }
                  );
                }
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.for_each returns void`,
                });
                break;
              case 'any':
              case 'all':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: { kind: 'primitive', name: 'bool' } },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.${expr.callee.name} expects fn(T) -> bool`,
                    }
                  );
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.${expr.callee.name} returns bool`,
                });
                break;
              case 'find':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: { kind: 'primitive', name: 'bool' } },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.find expects fn(T) -> bool`,
                    }
                  );
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.find returns Option<T>`,
                });
                break;
              case 'position':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(
                    argTypes[0],
                    { kind: 'function', args: [elemType], returnType: { kind: 'primitive', name: 'bool' } },
                    subst,
                    diagnostics,
                    {
                      location: expr.location,
                      note: `Vec.position expects fn(T) -> bool`,
                    }
                  );
                }
                tryUnify(
                  resultType,
                  { kind: 'adt', name: 'Option', params: [{ kind: 'primitive', name: 'i32' }] },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Vec.position returns Option<i32>`,
                  }
                );
                break;
              case 'take':
              case 'skip':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                    location: expr.location,
                    note: `Vec.${expr.callee.name} count must be i32`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Vec.${expr.callee.name} returns Vec<T>`,
                });
                break;
              case 'zip': {
                resolvedReceiverMethod = true;
                const otherElem = freshTypeVar();
                if (argTypes[0]) {
                  tryUnify(argTypes[0], { kind: 'adt', name: 'Vec', params: [otherElem] }, subst, diagnostics, {
                    location: expr.location,
                    note: `Vec.zip expects Vec<U>`,
                  });
                }
                tryUnify(
                  resultType,
                  {
                    kind: 'adt',
                    name: 'Vec',
                    params: [{ kind: 'adt', name: 'Tuple', params: [elemType, otherElem] }],
                  },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Vec.zip returns Vec<Tuple<T,U>>`,
                  }
                );
                break;
              }
              case 'enumerate':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  {
                    kind: 'adt',
                    name: 'Vec',
                    params: [{ kind: 'adt', name: 'Tuple', params: [{ kind: 'primitive', name: 'i32' }, elemType] }],
                  },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Vec.enumerate returns Vec<Tuple<i32,T>>`,
                  }
                );
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'HashMap' && receiverResolved.params.length === 2) {
            const [keyType, valueType] = receiverResolved.params;
            switch (expr.callee.name) {
              case 'insert':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `HashMap.insert key must match K`,
                  });
                }
                if (argTypes[1]) {
                  tryUnify(argTypes[1], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `HashMap.insert value must match V`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.insert returns Option<V>`,
                });
                break;
              case 'get':
              case 'remove':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `HashMap key argument must match K`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap lookup returns Option<V>`,
                });
                break;
              case 'contains_key':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `HashMap key argument must match K`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.contains_key returns bool`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.clear returns void`,
                });
                break;
              case 'keys':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [keyType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.keys returns Vec<K>`,
                });
                break;
              case 'values':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashMap.values returns Vec<V>`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'HashSet' && receiverResolved.params.length === 1) {
            const elemType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'insert':
              case 'contains':
              case 'remove':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], elemType, subst, diagnostics, {
                    location: expr.location,
                    note: `HashSet value argument must match T`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashSet method returns bool`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashSet.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashSet.clear returns void`,
                });
                break;
              case 'values':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `HashSet.values returns Vec<T>`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'Deque' && receiverResolved.params.length === 1) {
            const elemType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'push_front':
              case 'push_back':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], elemType, subst, diagnostics, {
                    location: expr.location,
                    note: `Deque.${expr.callee.name} expects element type`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Deque.${expr.callee.name} returns void`,
                });
                break;
              case 'pop_front':
              case 'pop_back':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Deque.${expr.callee.name} returns Option<T>`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Deque.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Deque.clear returns void`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'BTreeMap' && receiverResolved.params.length === 2) {
            const [keyType, valueType] = receiverResolved.params;
            switch (expr.callee.name) {
              case 'insert':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `BTreeMap.insert key must match K`,
                  });
                }
                if (argTypes[1]) {
                  tryUnify(argTypes[1], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `BTreeMap.insert value must match V`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.insert returns Option<V>`,
                });
                break;
              case 'get':
              case 'remove':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `BTreeMap key argument must match K`,
                  });
                }
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap lookup returns Option<V>`,
                });
                break;
              case 'contains_key':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], keyType, subst, diagnostics, {
                    location: expr.location,
                    note: `BTreeMap key argument must match K`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.contains_key returns bool`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.clear returns void`,
                });
                break;
              case 'keys':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [keyType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.keys returns Vec<K>`,
                });
                break;
              case 'values':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeMap.values returns Vec<V>`,
                });
                break;
              case 'entries':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  { kind: 'adt', name: 'Vec', params: [{ kind: 'adt', name: 'Tuple', params: [keyType, valueType] }] },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `BTreeMap.entries returns Vec<Tuple<K,V>>`,
                  }
                );
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'BTreeSet' && receiverResolved.params.length === 1) {
            const elemType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'insert':
              case 'contains':
              case 'remove':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], elemType, subst, diagnostics, {
                    location: expr.location,
                    note: `BTreeSet value argument must match T`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeSet method returns bool`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeSet.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeSet.clear returns void`,
                });
                break;
              case 'values':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Vec', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `BTreeSet.values returns Vec<T>`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'PriorityQueue' && receiverResolved.params.length === 1) {
            const elemType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'push':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], elemType, subst, diagnostics, {
                    location: expr.location,
                    note: `PriorityQueue.push expects element type`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `PriorityQueue.push returns void`,
                });
                break;
              case 'pop':
              case 'peek':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [elemType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `PriorityQueue.${expr.callee.name} returns Option<T>`,
                });
                break;
              case 'len':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'i32' }, subst, diagnostics, {
                  location: expr.location,
                  note: `PriorityQueue.len returns i32`,
                });
                break;
              case 'clear':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `PriorityQueue.clear returns void`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'ThreadHandle' && receiverResolved.params.length === 1) {
            const valueType = receiverResolved.params[0];
            if (expr.callee.name === 'join') {
              resolvedReceiverMethod = true;
              tryUnify(
                resultType,
                promiseType({
                  kind: 'adt',
                  name: 'Result',
                  params: [valueType, { kind: 'primitive', name: 'string' }],
                }),
                subst,
                diagnostics,
                {
                  location: expr.location,
                  note: `ThreadHandle.join returns Promise<Result<T,string>>`,
                }
              );
            }
          } else if (receiverResolved.name === 'Thread') {
            switch (expr.callee.name) {
              case 'post':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Thread.post returns bool`,
                });
                break;
              case 'recv':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  promiseType({ kind: 'adt', name: 'Option', params: [freshTypeVar()] }),
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Thread.recv returns Promise<Option<T>>`,
                  }
                );
                break;
              case 'try_recv':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [freshTypeVar()] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Thread.try_recv returns Option<T>`,
                });
                break;
              case 'terminate':
                resolvedReceiverMethod = true;
                tryUnify(resultType, promiseType({ kind: 'primitive', name: 'void' }), subst, diagnostics, {
                  location: expr.location,
                  note: `Thread.terminate returns Promise<void>`,
                });
                break;
              case 'join':
              case 'join_worker':
                resolvedReceiverMethod = true;
                tryUnify(resultType, promiseType({ kind: 'primitive', name: 'int' }), subst, diagnostics, {
                  location: expr.location,
                  note: `Thread.join returns Promise<int>`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'Sender' && receiverResolved.params.length === 1) {
            const valueType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'send':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `Sender.send expects T`,
                  });
                }
                tryUnify(resultType, promiseType({ kind: 'primitive', name: 'bool' }), subst, diagnostics, {
                  location: expr.location,
                  note: `Sender.send returns Promise<bool>`,
                });
                break;
              case 'try_send':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `Sender.try_send expects T`,
                  });
                }
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Sender.try_send returns bool`,
                });
                break;
              case 'send_result':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `Sender.send_result expects T`,
                  });
                }
                tryUnify(
                  resultType,
                  { kind: 'adt', name: 'Result', params: [{ kind: 'primitive', name: 'void' }, { kind: 'primitive', name: 'string' }] },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Sender.send_result returns Result<void,string>`,
                  }
                );
                break;
              case 'send_async_result':
                resolvedReceiverMethod = true;
                if (argTypes[0]) {
                  tryUnify(argTypes[0], valueType, subst, diagnostics, {
                    location: expr.location,
                    note: `Sender.send_async_result expects T`,
                  });
                }
                tryUnify(
                  resultType,
                  promiseType({
                    kind: 'adt',
                    name: 'Result',
                    params: [{ kind: 'primitive', name: 'void' }, { kind: 'primitive', name: 'string' }],
                  }),
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Sender.send_async_result returns Promise<Result<void,string>>`,
                  }
                );
                break;
              case 'clone':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Sender', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Sender.clone returns Sender<T>`,
                });
                break;
              case 'is_closed':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Sender.is_closed returns bool`,
                });
                break;
              case 'drop':
              case 'close':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Sender.${expr.callee.name} returns void`,
                });
                break;
              default:
                break;
            }
          } else if (receiverResolved.name === 'Receiver' && receiverResolved.params.length === 1) {
            const valueType = receiverResolved.params[0];
            switch (expr.callee.name) {
              case 'recv':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  promiseType({ kind: 'adt', name: 'Option', params: [valueType] }),
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Receiver.recv returns Promise<Option<T>>`,
                  }
                );
                break;
              case 'try_recv':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'adt', name: 'Option', params: [valueType] }, subst, diagnostics, {
                  location: expr.location,
                  note: `Receiver.try_recv returns Option<T>`,
                });
                break;
              case 'recv_result':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  promiseType({
                    kind: 'adt',
                    name: 'Result',
                    params: [{ kind: 'adt', name: 'Option', params: [valueType] }, { kind: 'primitive', name: 'string' }],
                  }),
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Receiver.recv_result returns Promise<Result<Option<T>,string>>`,
                  }
                );
                break;
              case 'try_recv_result':
                resolvedReceiverMethod = true;
                tryUnify(
                  resultType,
                  { kind: 'adt', name: 'Result', params: [{ kind: 'adt', name: 'Option', params: [valueType] }, { kind: 'primitive', name: 'string' }] },
                  subst,
                  diagnostics,
                  {
                    location: expr.location,
                    note: `Receiver.try_recv_result returns Result<Option<T>,string>`,
                  }
                );
                break;
              case 'is_closed':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'bool' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Receiver.is_closed returns bool`,
                });
                break;
              case 'drop':
              case 'close':
                resolvedReceiverMethod = true;
                tryUnify(resultType, { kind: 'primitive', name: 'void' }, subst, diagnostics, {
                  location: expr.location,
                  note: `Receiver.${expr.callee.name} returns void`,
                });
                break;
              default:
                break;
            }
          }
        }
        if (expectedType) {
          tryUnify(resultType, expectedType, subst, diagnostics, {
            location: expr.location,
            note: `Call result must match expected type`,
          });
        }
        if (resolvedReceiverMethod) {
          recordCallSignature(expr, receiverType ? [receiverType, ...argTypes] : argTypes, resultType, subst, inferredCalls);
        }
        return recordExprType(expr, resultType, subst);
      };

      if (expr.receiver) {
        return inferReceiverCall(expr.receiver);
      }
      const enumName = expr.enumName;
      const isShadowed = enumName ? env.lookup(enumName) : undefined;
      if (enumName && isShadowed) {
        return inferReceiverCall({ type: 'Identifier', name: enumName, location: expr.location });
      }
      if (enumName && !isShadowed && moduleBindings) {
        const moduleExport = moduleBindings.get(enumName);
        if (moduleExport?.kind === 'module') {
          const candidates = resolveModuleFunctionCandidates(moduleExport, expr.callee.name);
          if (candidates.length === 0) {
            diagnostics.push({
              severity: 'error',
              code: 'HM_MODULE_MEMBER',
              message: `Unknown module member '${expr.enumName}.${expr.callee.name}'`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          const argTypes = rawArgValues.map((arg) => inferChild(arg) ?? freshTypeVar());
          const selected = selectModuleOverloadCandidate(
            `${expr.enumName}.${expr.callee.name}`,
            candidates,
            argTypes,
            expr.location
          );
          if (!selected) return null;
          if (selected.deprecatedMessage) {
            diagnostics.push({
              severity: 'warning',
              code: 'DEPRECATED',
              message: selected.deprecatedMessage,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
          }
          const calleeType = instantiate(selected.hmType);
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

      if (moduleBindings) {
        const directBinding = moduleBindings.get(expr.callee.name);
        const directCandidates =
          directBinding ? resolveModuleFunctionCandidates(directBinding, undefined) : [];
        if (directCandidates.length > 0) {
          const argTypes = rawArgValues.map((arg) => inferChild(arg) ?? freshTypeVar());
          const selected = selectModuleOverloadCandidate(expr.callee.name, directCandidates, argTypes, expr.location);
          if (!selected) return null;
          if (selected.deprecatedMessage) {
            diagnostics.push({
              severity: 'warning',
              code: 'DEPRECATED',
              message: selected.deprecatedMessage,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
          }
          const calleeType = instantiate(selected.hmType);
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
      }

      const calleeScheme = env.lookup(expr.callee.name);
      if (!calleeScheme) return null;
      const calleeType = instantiate(calleeScheme);
      const paramInfo = activeFnParamInfo?.get(expr.callee.name);
      const resolved = paramInfo ? resolveArgsForHm(paramInfo.names, paramInfo.defaults) : null;
      if (resolved?.tooMany) {
        diagnostics.push({
          severity: 'error',
          code: 'LUM-002',
          message: `Argument count mismatch for '${expr.callee.name}'`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      }
      const resolvedArgs = resolved ? resolved.args : rawArgValues;
      const argTypes = resolvedArgs.map((arg) => (arg ? inferChild(arg) ?? freshTypeVar() : freshTypeVar()));
      const resultType = freshTypeVar();
      const fnType: Type = { kind: 'function', args: argTypes, returnType: resultType };
      tryUnify(calleeType, fnType, subst, diagnostics, {
        location: expr.location,
        note: `In call to '${expr.callee.name}'`,
      });
      validateConstFnWhereClausesAtCall(expr, diagnostics);
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
      if (objectName && moduleBindings && !isValueObject) {
        const moduleExport = moduleBindings.get(objectName);
        if (moduleExport?.kind === 'module') {
          const member = moduleExport.exports.get(expr.property);
          if (member?.kind === 'function' || member?.kind === 'value') {
            return recordExprType(expr, instantiate(member.hmType), subst);
          }
          if (member?.kind === 'overloaded-function') {
            diagnostics.push({
              severity: 'error',
              code: 'OVERLOAD_AMBIGUOUS',
              message: `Cannot use overloaded member '${objectName}.${expr.property}' as a value without a call context`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return recordExprType(expr, freshTypeVar(), subst);
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
          const variantInfo = info.variants.get(expr.property);
          if (!variantInfo) {
            diagnostics.push({
              severity: 'error',
              code: 'HM_ENUM_VARIANT',
              message: `Unknown enum variant '${objectName}.${expr.property}'`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          if (variantInfo.params.length > 0) {
            diagnostics.push({
              severity: 'error',
              code: 'HM_ENUM_VARIANT',
              message: `Enum variant '${objectName}.${expr.property}' requires ${variantInfo.params.length} arguments`,
              source: 'lumina',
              location: diagLocation(expr.location),
            });
            return null;
          }
          const instantiated = instantiateEnumVariantTypes(objectName, info, variantInfo);
          if (expectedType) {
            tryUnify(instantiated.resultType, expectedType, subst, diagnostics);
          }
          return recordExprType(expr, instantiated.resultType, subst);
        }
      }
      const objectType = inferChild(expr.object);
      if (!objectType) return null;
      const objectResolved = prune(objectType, subst);
      if (objectResolved.kind === 'adt' && objectResolved.name === 'Channel' && objectResolved.params.length === 1) {
        const valueType = objectResolved.params[0];
        if (expr.property === 'sender') {
          const senderType: Type = { kind: 'adt', name: 'Sender', params: [valueType] };
          if (expectedType) {
            tryUnify(senderType, expectedType, subst, diagnostics, {
              location: expr.location,
              note: `Field '${expr.property}' must match expected type`,
            });
          }
          return recordExprType(expr, senderType, subst);
        }
        if (expr.property === 'receiver') {
          const receiverType: Type = { kind: 'adt', name: 'Receiver', params: [valueType] };
          if (expectedType) {
            tryUnify(receiverType, expectedType, subst, diagnostics, {
              location: expr.location,
              note: `Field '${expr.property}' must match expected type`,
            });
          }
          return recordExprType(expr, receiverType, subst);
        }
      }
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
      const matchEntrySubst = new Map<number, Type>(subst);
      for (const arm of expr.arms) {
        const armEnv = env.child();
        const armSubst = new Map<number, Type>(matchEntrySubst);
        const armPatternContext: PatternRefinementContext = {
          existentialWitnesses: [],
          scopeId: ++activeExistentialScopeSeed,
          refinementStack: new Set<string>(),
        };
        const patternDiagnostics: Diagnostic[] = [];
        applyMatchPattern(
          arm.pattern,
          scrutineeType,
          armEnv,
          armSubst,
          patternDiagnostics,
          enumRegistry,
          armPatternContext
        );
        const patternResult = solvePatternRefinementDiagnostics(
          arm.pattern,
          patternDiagnostics,
          arm.location ?? expr.location
        );
        diagnostics.push(...patternResult.diagnostics);
        if (!patternResult.reachable) {
          continue;
        }
        const resolvedArmType = withExistentialScope(armPatternContext.existentialWitnesses, () => {
          if (arm.guard) {
            const guardType = inferExpr(
              arm.guard,
              armEnv,
              armSubst,
              diagnostics,
              enumRegistry,
              structRegistry,
              moduleBindings,
              inferredCalls,
              undefined,
              inAsync
            );
            if (guardType) {
              tryUnify(guardType, { kind: 'primitive', name: 'bool' }, armSubst, diagnostics, {
                location: arm.guard.location,
                note: 'Match guard must be a bool',
              });
            }
          }
          const armType = inferExpr(
            arm.body,
            armEnv,
            armSubst,
            diagnostics,
            enumRegistry,
            structRegistry,
            moduleBindings,
            inferredCalls,
            expectedType ?? undefined,
            inAsync
          );
          if (!armType) return null;
          reportEscapedExistentials(
            armType,
            armPatternContext.existentialWitnesses,
            armSubst,
            diagnostics,
            arm.body.location ?? arm.location ?? expr.location
          );
          const normalized = normalizeType(armType, armSubst);
          if (expectedType) {
            // Under branch-local GADT refinements, each arm must satisfy the expected type.
            tryUnify(normalized, expectedType, armSubst, diagnostics, {
              location: arm.location,
              note: 'Match arm must satisfy expected type under pattern refinement',
            });
            return expectedType;
          }
          return normalized;
        });
        if (!resolvedArmType) continue;
        if (!resultType) {
          resultType = resolvedArmType;
        } else {
          tryUnify(resultType, resolvedArmType, subst, diagnostics, {
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
    case 'SelectExpr': {
      if (!inAsync) {
        diagnostics.push({
          severity: 'error',
          code: 'SELECT_OUTSIDE_ASYNC',
          message: `'select!' can only be used inside async functions`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
      }
      if (!expr.arms || expr.arms.length === 0) {
        diagnostics.push({
          severity: 'error',
          code: 'SELECT_EMPTY',
          message: 'select! requires at least one arm',
          source: 'lumina',
          location: diagLocation(expr.location),
        });
        return recordExprType(expr, expectedType ?? freshTypeVar(), subst);
      }
      const mergedType = expectedType ?? freshTypeVar();
      for (const arm of expr.arms) {
        const armPromiseType = inferExpr(
          arm.value,
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
        const armValueType = freshTypeVar();
        if (armPromiseType) {
          tryUnify(armPromiseType, promiseType(armValueType), subst, diagnostics, {
            location: arm.value.location ?? arm.location ?? expr.location,
            note: `select! arm value must be Promise<T>`,
          });
        }
        const armEnv = env.child();
        if (arm.binding && arm.binding !== '_') {
          armEnv.extend(arm.binding, { kind: 'scheme', variables: [], type: armValueType });
        }
        const armResultType = inferExpr(
          arm.body,
          armEnv,
          subst,
          diagnostics,
          enumRegistry,
          structRegistry,
          moduleBindings,
          inferredCalls,
          mergedType,
          inAsync
        );
        if (armResultType) {
          tryUnify(armResultType, mergedType, subst, diagnostics, {
            location: arm.body.location ?? arm.location ?? expr.location,
            note: 'All select! arms must return the same type',
          });
        }
      }
      return recordExprType(expr, mergedType, subst);
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

function renderConstExpr(expr: import('./ast.js').LuminaConstExpr | undefined): string {
  if (!expr) return '_';
  switch (expr.type) {
    case 'ConstLiteral':
      return String(expr.value);
    case 'ConstParam':
      return expr.name;
    case 'ConstUnary':
      return `${expr.op}${renderConstExpr(expr.expr)}`;
    case 'ConstBinary':
      return `${renderConstExpr(expr.left)}${expr.op}${renderConstExpr(expr.right)}`;
    case 'ConstCall':
      return `${expr.name}(${(expr.args ?? []).map((arg) => renderConstExpr(arg)).join(',')})`;
    case 'ConstIf':
      return `if ${renderConstExpr(expr.condition)} { ${renderConstExpr(expr.thenExpr)} } else { ${renderConstExpr(expr.elseExpr)} }`;
    default:
      return '_';
  }
}

function constTypeToText(type: Type): string | null {
  const t = prune(type, new Map());
  if (t.kind === 'adt' && t.params.length === 0) return t.name;
  if (t.kind === 'primitive') return t.name;
  return null;
}

function renderConstExprWithTypeParams(
  expr: import('./ast.js').LuminaConstExpr | undefined,
  typeParams: Map<string, Type>
): string {
  if (!expr) return '_';
  switch (expr.type) {
    case 'ConstLiteral':
      return String(expr.value);
    case 'ConstParam': {
      const bound = typeParams.get(expr.name);
      if (!bound) return expr.name;
      const text = constTypeToText(bound);
      return text ?? expr.name;
    }
    case 'ConstUnary':
      return `${expr.op}${renderConstExprWithTypeParams(expr.expr, typeParams)}`;
    case 'ConstBinary':
      return `${renderConstExprWithTypeParams(expr.left, typeParams)}${expr.op}${renderConstExprWithTypeParams(expr.right, typeParams)}`;
    case 'ConstCall':
      return `${expr.name}(${(expr.args ?? []).map((arg) => renderConstExprWithTypeParams(arg, typeParams)).join(',')})`;
    case 'ConstIf':
      return `if ${renderConstExprWithTypeParams(expr.condition, typeParams)} { ${renderConstExprWithTypeParams(expr.thenExpr, typeParams)} } else { ${renderConstExprWithTypeParams(expr.elseExpr, typeParams)} }`;
    default:
      return '_';
  }
}

function resolveTypeAliasInfo(typeName: string): TypeAliasInfo | null {
  if (!activeTypeAliasRegistry) return null;
  const direct = activeTypeAliasRegistry.get(typeName);
  if (direct) return direct;
  if (typeName.includes('::')) {
    const short = typeName.split('::').pop() ?? typeName;
    return activeTypeAliasRegistry.get(short) ?? null;
  }
  return null;
}

function expandTypeAliasWithEnv(
  base: string,
  args: Type[],
  typeParams: Map<string, Type>,
  holeInfoByVar?: Map<number, HoleInfo>,
  holeInfo?: HoleInfo,
  defaultLocation?: Location,
  aliasStack?: Set<string>
): Type | null {
  const alias = resolveTypeAliasInfo(base);
  if (!alias) return null;
  if (args.length !== alias.typeParams.length) return null;
  const stack = aliasStack ?? new Set<string>();
  const cycleKey = base.includes('::') ? (base.split('::').pop() ?? base) : base;
  if (stack.has(cycleKey)) return null;
  const nextStack = new Set(stack);
  nextStack.add(cycleKey);
  const aliasEnv = new Map<string, Type>(typeParams);
  alias.typeParams.forEach((name, idx) => {
    aliasEnv.set(name, args[idx] ?? freshTypeVar());
  });
  return parseTypeNameWithEnv(
    alias.target,
    aliasEnv,
    holeInfoByVar,
    holeInfo,
    defaultLocation,
    nextStack
  );
}

function parseTypeName(
  typeName: LuminaTypeExpr,
  holeInfoByVar?: Map<number, HoleInfo>,
  holeInfo?: HoleInfo,
  defaultLocation?: Location,
  aliasStack?: Set<string>
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
    if ((typeName as { kind?: string }).kind === 'array') {
      const arr = typeName as import('./ast.js').LuminaArrayType;
      const elemType = parseTypeName(arr.element, holeInfoByVar, holeInfo, defaultLocation, aliasStack);
      const sizeText = renderConstExpr(arr.size);
      return { kind: 'adt', name: 'Array', params: [elemType, { kind: 'adt', name: sizeText, params: [] }] };
    }
    return { kind: 'primitive', name: 'any' };
  }
  if (typeName === 'unit') {
    typeName = 'void';
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
    typeName === 'usize' ||
    typeName === 'f32' ||
    typeName === 'f64'
  ) {
    return { kind: 'primitive', name: typeName as PrimitiveName };
  }
  const idx = typeName.indexOf('<');
  if (idx === -1) {
    const aliasExpanded = expandTypeAliasWithEnv(
      typeName,
      [],
      new Map<string, Type>(),
      holeInfoByVar,
      holeInfo,
      defaultLocation,
      aliasStack
    );
    if (aliasExpanded) return aliasExpanded;
    return { kind: 'adt', name: typeName, params: [] };
  }
  const base = typeName.slice(0, idx);
  const inner = typeName.slice(idx + 1, -1);
  const args = splitTypeArgs(inner).map((arg) => parseTypeName(arg, holeInfoByVar, holeInfo, defaultLocation, aliasStack));
  const aliasExpanded = expandTypeAliasWithEnv(
    base,
    args,
    new Map<string, Type>(),
    holeInfoByVar,
    holeInfo,
    defaultLocation,
    aliasStack
  );
  if (aliasExpanded) return aliasExpanded;
  if (base === 'Fn' && args.length >= 1) {
    return {
      kind: 'function',
      args: args.slice(0, -1),
      returnType: args[args.length - 1],
    };
  }
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
  let angleDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') angleDepth++;
    if (ch === '>') angleDepth--;
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (ch === '{') braceDepth++;
    if (ch === '}') braceDepth--;
    if (ch === ',' && angleDepth === 0 && parenDepth === 0 && braceDepth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function withExistentialScope<T>(witnesses: ExistentialWitness[], fn: () => T): T {
  if (witnesses.length === 0) return fn();
  const previous = activeRigidExistentials;
  const scoped = previous ? new Map(previous) : new Map<number, ExistentialWitness>();
  for (const witness of witnesses) {
    scoped.set(witness.id, witness);
  }
  activeRigidExistentials = scoped;
  try {
    return fn();
  } finally {
    activeRigidExistentials = previous;
  }
}

function cloneSubst(subst: Subst): Subst {
  return new Map<number, Type>(subst);
}

function restoreSubst(target: Subst, snapshot: Subst): void {
  target.clear();
  for (const [key, value] of snapshot.entries()) {
    target.set(key, value);
  }
}

function tryUnify(
  t1: Type,
  t2: Type,
  subst: Subst,
  diagnostics: Diagnostic[],
  context?: { location?: Location; note?: string }
) {
  const rigidSnapshot = activeRigidExistentials ? cloneSubst(subst) : null;
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
    if (activeRigidExistentials && activeRigidExistentials.size > 0) {
      for (const [id, witness] of activeRigidExistentials.entries()) {
        const resolved = prune({ kind: 'variable', id }, subst);
        if (resolved.kind === 'variable' && resolved.id === id) continue;
        const resolvedText = formatType(resolved, subst);
        if (rigidSnapshot) {
          restoreSubst(subst, rigidSnapshot);
        }
        diagnostics.push({
          severity: 'error',
          code: 'GADT-007',
          message: `Existential type '${witness.name}' from '${witness.enumName}.${witness.variantName}' cannot unify with '${resolvedText}'`,
          source: 'lumina',
          location: diagLocation(context?.location ?? witness.location),
          relatedInformation: witness.location
            ? [
                {
                  location: diagLocation(witness.location),
                  message: `Existential '${witness.name}' is introduced here`,
                },
              ]
            : undefined,
        });
        return;
      }
    }
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
    const variants = new Map<string, EnumVariantInfo>();
    for (const variant of stmt.variants) {
      variants.set(variant.name, {
        name: variant.name,
        params: variant.params ?? [],
        resultType: variant.resultType ?? null,
        existentialTypeParams: (variant.existentialTypeParams ?? []).map((param) => param.name),
        location: variant.location,
      });
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
    registry.set(stmt.name, { typeParams, fields, derives: stmt.derives ?? [] });
  }
  return registry;
}

function buildTypeAliasRegistry(program: LuminaProgram): Map<string, TypeAliasInfo> {
  const registry = new Map<string, TypeAliasInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'TypeDecl') continue;
    if (stmt.extern) continue;
    if (!stmt.aliasType) continue;
    const typeParams = (stmt.typeParams ?? [])
      .filter((param) => !param.isConst)
      .map((param) => param.name);
    registry.set(stmt.name, {
      typeParams,
      target: stmt.aliasType,
    });
  }
  return registry;
}

function instantiateEnumVariantTypes(
  enumName: string,
  info: EnumInfo,
  variant: EnumVariantInfo
): {
  enumType: Type;
  resultType: Type;
  paramTypes: Type[];
  variantParamTypes: Type[];
  existentialWitnesses: ExistentialWitness[];
} {
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const typeParamMap = new Map<string, Type>();
  info.typeParams.forEach((name, idx) => typeParamMap.set(name, paramTypes[idx]));
  const existentialWitnesses: ExistentialWitness[] = [];

  for (const name of variant.existentialTypeParams ?? []) {
    const variable = freshTypeVar();
    typeParamMap.set(name, variable);
    if (variable.kind === 'variable') {
      existentialWitnesses.push({
        id: variable.id,
        name,
        enumName,
        variantName: variant.name,
        location: variant.location,
      });
    }
  }

  const enumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  const resultType = variant.resultType
    ? parseTypeNameWithEnv(variant.resultType, typeParamMap)
    : enumType;
  const variantParamTypes = (variant.params ?? []).map((param) => parseTypeNameWithEnv(param, typeParamMap));

  return { enumType, resultType, paramTypes, variantParamTypes, existentialWitnesses };
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
  const variantInfo = info.variants.get(expr.callee.name);
  if (!variantInfo) {
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
      arg.value,
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
  const instantiated = instantiateEnumVariantTypes(expr.enumName, info, variantInfo);
  for (let i = 0; i < argTypes.length && i < instantiated.variantParamTypes.length; i++) {
    const expected = instantiated.variantParamTypes[i];
    tryUnify(argTypes[i], expected, subst, diagnostics);
  }
  if (expectedType) {
    tryUnify(instantiated.resultType, expectedType, subst, diagnostics);
  }
  return prune(instantiated.resultType, subst);
}

function normalizeScrutineeForEnum(scrutineeType: Type, enumName: string, subst: Subst): Type {
  const pruned = prune(scrutineeType, subst);
  if (pruned.kind !== 'adt' || pruned.name !== HKT_APPLY_TYPE_NAME || pruned.params.length < 2) {
    return scrutineeType;
  }
  const ctor = prune(pruned.params[0], subst);
  if (ctor.kind !== 'adt' || ctor.params.length !== 0 || ctor.name !== enumName) {
    return scrutineeType;
  }
  return { kind: 'adt', name: enumName, params: pruned.params.slice(1) };
}

function resolveEnumNameFromPatternScrutinee(
  pattern: Extract<LuminaMatchPattern, { type: 'EnumPattern' }>,
  scrutineeType: Type,
  subst: Subst,
  enumRegistry?: Map<string, EnumInfo>
): string | null {
  if (pattern.enumName) return pattern.enumName;
  const pruned = prune(scrutineeType, subst);
  if (pruned.kind === 'adt' && pruned.name !== HKT_APPLY_TYPE_NAME) {
    return pruned.name;
  }
  if (pruned.kind === 'adt' && pruned.name === HKT_APPLY_TYPE_NAME && pruned.params.length >= 2) {
    const ctor = prune(pruned.params[0], subst);
    if (ctor.kind !== 'adt' || ctor.params.length !== 0) return null;
    if (!enumRegistry) return ctor.name;
    const candidate = enumRegistry.get(ctor.name);
    if (candidate?.variants.has(pattern.variant)) return ctor.name;
  }
  return null;
}

function applyMatchPattern(
  pattern: LuminaMatchPattern,
  scrutineeType: Type,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry?: Map<string, EnumInfo>,
  context?: PatternRefinementContext,
  depth: number = 0
) {
  if (depth > MAX_GADT_REFINEMENT_DEPTH) {
    if (context && !context.depthLimitReported) {
      diagnostics.push({
        severity: 'warning',
        code: 'GADT-008',
        message: `Reached GADT refinement depth limit (${MAX_GADT_REFINEMENT_DEPTH}); skipping deeper recursive refinements`,
        source: 'lumina',
        location: diagLocation(pattern.location),
      });
      context.depthLimitReported = true;
    }
    return;
  }
  if (pattern.type === 'WildcardPattern') return;
  if (pattern.type === 'BindingPattern' || pattern.type === 'RefBindingPattern') {
    env.extend(pattern.name, { kind: 'scheme', variables: [], type: scrutineeType });
    return;
  }
  if (pattern.type === 'LiteralPattern') {
    const literalType: Type =
      typeof pattern.value === 'number'
        ? { kind: 'primitive', name: Number.isInteger(pattern.value) ? 'i32' : 'f64' }
        : typeof pattern.value === 'boolean'
          ? { kind: 'primitive', name: 'bool' }
          : { kind: 'primitive', name: 'string' };
    tryUnify(scrutineeType, literalType, subst, diagnostics, { location: pattern.location, note: 'Literal pattern type' });
    return;
  }
  if (pattern.type === 'TuplePattern') {
    const elementTypes = pattern.elements.map(() => freshTypeVar());
    const tupleType: Type = { kind: 'adt', name: 'Tuple', params: elementTypes };
    tryUnify(scrutineeType, tupleType, subst, diagnostics, { location: pattern.location, note: 'Tuple pattern type' });
    pattern.elements.forEach((element, idx) => {
      applyMatchPattern(element, elementTypes[idx], env, subst, diagnostics, enumRegistry, context, depth + 1);
    });
    return;
  }
  if (pattern.type === 'StructPattern') {
    if (activeStructRegistry) {
      const info = activeStructRegistry.get(pattern.name);
      if (!info) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_STRUCT_PATTERN',
          message: `Unknown struct '${pattern.name}'`,
          source: 'lumina',
          location: diagLocation(pattern.location),
        });
        return;
      }
      const params = info.typeParams.map(() => freshTypeVar());
      const structType: Type = { kind: 'adt', name: pattern.name, params };
      tryUnify(scrutineeType, structType, subst, diagnostics, { location: pattern.location, note: 'Struct pattern type' });
      const mapping = new Map<string, Type>();
      info.typeParams.forEach((name, idx) => mapping.set(name, params[idx]));
      for (const field of pattern.fields) {
        const fieldTypeName = info.fields.get(field.name);
        if (!fieldTypeName) continue;
        const fieldType = parseTypeNameWithEnv(fieldTypeName, mapping);
        applyMatchPattern(field.pattern, fieldType, env, subst, diagnostics, enumRegistry, context, depth + 1);
      }
      return;
    }
  }
  if (pattern.type !== 'EnumPattern') {
    return;
  }
  const enumName = resolveEnumNameFromPatternScrutinee(pattern, scrutineeType, subst, enumRegistry);
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
  const variantInfo = info.variants.get(pattern.variant);
  if (!variantInfo) {
    diagnostics.push({
      severity: 'error',
      code: 'HM_ENUM_VARIANT',
      message: `Unknown enum variant '${enumName}.${pattern.variant}'`,
      source: 'lumina',
      location: diagLocation(pattern.location),
    });
    return;
  }
  const normalizedScrutinee = normalizeScrutineeForEnum(scrutineeType, enumName, subst);
  const refinementKey = `${enumName}.${pattern.variant}|${formatType(normalizedScrutinee, subst)}`;
  if (context?.refinementStack?.has(refinementKey)) {
    if (!context.depthLimitReported) {
      diagnostics.push({
        severity: 'warning',
        code: 'GADT-008',
        message: `Detected recursive GADT refinement cycle at '${enumName}.${pattern.variant}'; skipping deeper recursive refinement`,
        source: 'lumina',
        location: diagLocation(pattern.location),
      });
      context.depthLimitReported = true;
    }
    return;
  }
  if (!variantCanMatchScrutinee(enumName, info, variantInfo, normalizedScrutinee, subst)) {
    const variantConstructs = variantInfo.resultType ? formatTypeAnnotation(variantInfo.resultType) : null;
    const scrutineeText = formatType(normalizedScrutinee, subst);
    const related: DiagnosticRelatedInformation[] = [];
    related.push({
      location: diagLocation(pattern.location),
      message: `Scrutinee is constrained to '${scrutineeText}' in this branch`,
    });
    if (variantConstructs) {
      related.push({
        location: diagLocation(variantInfo.location ?? pattern.location),
        message: `Pattern '${enumName}.${pattern.variant}' constructs '${variantConstructs}'`,
      });
      related.push({
        location: diagLocation(pattern.location),
        message: `Type index mismatch: '${scrutineeText}' cannot match '${variantConstructs}'`,
      });
    }
    diagnostics.push({
      severity: 'warning',
      code: 'LUM-004',
      message: `Unreachable pattern '${enumName}.${pattern.variant}': type index mismatch with scrutinee '${scrutineeText}'`,
      source: 'lumina',
      location: diagLocation(pattern.location),
      relatedInformation: related,
    });
    return;
  }
  if (context?.refinementStack) {
    context.refinementStack.add(refinementKey);
  }
  try {
    const instantiated = instantiateEnumVariantTypes(enumName, info, variantInfo);
    if (context) {
      context.existentialWitnesses.push(
        ...instantiated.existentialWitnesses.map((witness) => ({ ...witness, scopeId: context.scopeId }))
      );
    }
    tryUnify(normalizedScrutinee, instantiated.resultType, subst, diagnostics, {
      location: pattern.location,
      note: `Pattern '${enumName}.${pattern.variant}' refines the scrutinee type`,
    });
    const nestedPatterns = pattern.patterns ?? [];
    if (nestedPatterns.length > 0) {
      for (let i = 0; i < nestedPatterns.length && i < instantiated.variantParamTypes.length; i++) {
        const expected = instantiated.variantParamTypes[i];
        applyMatchPattern(nestedPatterns[i], expected, env, subst, diagnostics, enumRegistry, context, depth + 1);
      }
      return;
    }
    for (let i = 0; i < pattern.bindings.length && i < instantiated.variantParamTypes.length; i++) {
      const binding = pattern.bindings[i];
      if (binding === '_') continue;
      const expected = instantiated.variantParamTypes[i];
      env.extend(binding, { kind: 'scheme', variables: [], type: expected });
    }
  } finally {
    if (context?.refinementStack) {
      context.refinementStack.delete(refinementKey);
    }
  }
}

function formatPatternForDiagnostic(pattern: LuminaMatchPattern): string {
  switch (pattern.type) {
    case 'WildcardPattern':
      return '_';
    case 'BindingPattern':
      return pattern.name;
    case 'RefBindingPattern':
      return `${pattern.mutable ? 'ref mut' : 'ref'} ${pattern.name}`;
    case 'LiteralPattern':
      return typeof pattern.value === 'string' ? JSON.stringify(pattern.value) : String(pattern.value);
    case 'TuplePattern':
      return `(${pattern.elements.map((element) => formatPatternForDiagnostic(element)).join(', ')})`;
    case 'StructPattern':
      return `${pattern.name}{${pattern.fields
        .map((field) => `${field.name}: ${formatPatternForDiagnostic(field.pattern)}`)
        .join(', ')}}`;
    case 'EnumPattern': {
      const prefix = pattern.enumName ? `${pattern.enumName}.` : '';
      const payload =
        pattern.patterns && pattern.patterns.length > 0
          ? pattern.patterns.map((nested) => formatPatternForDiagnostic(nested)).join(', ')
          : pattern.bindings.join(', ');
      return payload ? `${prefix}${pattern.variant}(${payload})` : `${prefix}${pattern.variant}`;
    }
    default:
      return 'pattern';
  }
}

function isPatternConstraintError(diag: Diagnostic): boolean {
  if (diag.severity !== 'error') return false;
  return diag.code === 'LUM-001' || diag.code === 'LUM-002';
}

function solvePatternRefinementDiagnostics(
  pattern: LuminaMatchPattern,
  patternDiagnostics: Diagnostic[],
  location?: Location
): PatternConstraintSolveResult {
  const mismatch = patternDiagnostics.find((diag) => isPatternConstraintError(diag));
  if (mismatch) {
    const related: DiagnosticRelatedInformation[] = [...(mismatch.relatedInformation ?? [])];
    related.push({
      location: diagLocation(pattern.location ?? location),
      message: 'Pattern constraints are unsatisfiable under branch-local type refinement',
    });
    const unreachable: Diagnostic = {
      severity: 'warning',
      code: 'LUM-004',
      message: `Unreachable pattern '${formatPatternForDiagnostic(pattern)}': refinement constraints are unsatisfiable`,
      source: 'lumina',
      location: diagLocation(pattern.location ?? location),
      relatedInformation: related,
    };
    const passThrough = patternDiagnostics.filter((diag) => !isPatternConstraintError(diag));
    return {
      reachable: false,
      diagnostics: [unreachable, ...passThrough],
    };
  }
  const hasHardError = patternDiagnostics.some((diag) => diag.severity === 'error');
  if (hasHardError) {
    return { reachable: false, diagnostics: patternDiagnostics };
  }
  const hasUnreachableWarning = patternDiagnostics.some(
    (diag) => diag.severity === 'warning' && diag.code === 'LUM-004'
  );
  return {
    reachable: !hasUnreachableWarning,
    diagnostics: patternDiagnostics,
  };
}

function reportEscapedExistentials(
  type: Type,
  witnesses: ExistentialWitness[],
  subst: Subst,
  diagnostics: Diagnostic[],
  location?: Location
): void {
  if (witnesses.length === 0) return;
  const free = freeTypeVars(type, subst);
  for (const witness of witnesses) {
    if (!free.has(witness.id)) continue;
    diagnostics.push({
      severity: 'error',
      code: 'GADT-006',
      message: `Existential type '${witness.name}' from pattern '${witness.enumName}.${witness.variantName}' escapes its match arm`,
      source: 'lumina',
      location: diagLocation(location ?? witness.location),
      relatedInformation: witness.location
        ? [
            {
              location: diagLocation(witness.location),
              message:
                witness.scopeId != null
                  ? `Existential '${witness.name}' is introduced here (arm scope #${witness.scopeId})`
                  : `Existential '${witness.name}' is introduced here`,
            },
          ]
        : undefined,
    });
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
  defaultLocation?: Location,
  aliasStack?: Set<string>
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
    if ((typeName as { kind?: string }).kind === 'array') {
      const arr = typeName as import('./ast.js').LuminaArrayType;
      const elemType = parseTypeNameWithEnv(arr.element, typeParams, holeInfoByVar, holeInfo, defaultLocation, aliasStack);
      const sizeText = renderConstExprWithTypeParams(arr.size, typeParams);
      return { kind: 'adt', name: 'Array', params: [elemType, { kind: 'adt', name: sizeText, params: [] }] };
    }
    return { kind: 'primitive', name: 'any' };
  }
  const baseIdx = typeName.indexOf('<');
  const base = baseIdx === -1 ? typeName : typeName.slice(0, baseIdx);
  const direct = typeParams.get(base);
  if (direct && baseIdx === -1) return direct;
  if (direct && baseIdx !== -1) {
    const inner = typeName.slice(baseIdx + 1, -1);
    const args = splitTypeArgs(inner).map(arg => parseTypeNameWithEnv(arg, typeParams, holeInfoByVar, holeInfo, defaultLocation, aliasStack));
    return { kind: 'adt', name: HKT_APPLY_TYPE_NAME, params: [direct, ...args] };
  }
  if (baseIdx === -1) {
    const aliasExpanded = expandTypeAliasWithEnv(
      typeName,
      [],
      typeParams,
      holeInfoByVar,
      holeInfo,
      defaultLocation,
      aliasStack
    );
    if (aliasExpanded) return aliasExpanded;
    return parseTypeName(typeName, holeInfoByVar, holeInfo, defaultLocation, aliasStack);
  }
  const inner = typeName.slice(baseIdx + 1, -1);
  const args = splitTypeArgs(inner).map(arg => parseTypeNameWithEnv(arg, typeParams, holeInfoByVar, holeInfo, defaultLocation, aliasStack));
  const aliasExpanded = expandTypeAliasWithEnv(
    base,
    args,
    typeParams,
    holeInfoByVar,
    holeInfo,
    defaultLocation,
    aliasStack
  );
  if (aliasExpanded) return aliasExpanded;
  if (base === 'Fn' && args.length >= 1) {
    return {
      kind: 'function',
      args: args.slice(0, -1),
      returnType: args[args.length - 1],
    };
  }
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
      if (pruned.name === HKT_APPLY_TYPE_NAME && pruned.params.length >= 2) {
        const [ctor, ...args] = pruned.params;
        const ctorText = formatType(ctor, subst);
        return `${ctorText}<${args.map((arg) => formatType(arg, subst)).join(', ')}>`;
      }
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
  arms: Array<{ pattern: LuminaMatchPattern; guard?: LuminaExpr | null }>,
  scrutineeType: Type,
  subst: Subst,
  enumRegistry: Map<string, EnumInfo>,
  diagnostics: Diagnostic[],
  location?: Location
) {
  const resolved = prune(scrutineeType, subst);
  let enumName: string | null = null;
  if (resolved.kind === 'adt') {
    if (resolved.name === HKT_APPLY_TYPE_NAME && resolved.params.length >= 2) {
      const ctor = prune(resolved.params[0], subst);
      if (ctor.kind === 'adt' && ctor.params.length === 0) {
        enumName = ctor.name;
      }
    } else {
      enumName = resolved.name;
    }
  }
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
  const reachableByVariant = new Map<string, VariantMatchCandidate>();
  for (const [variantName, variantInfo] of info.variants.entries()) {
    const candidate = instantiateVariantForScrutinee(enumName, info, variantName, variantInfo, scrutineeType, subst);
    if (candidate) {
      reachableByVariant.set(variantName, candidate);
    }
  }
  if (reachableByVariant.size === 0) {
    for (const [variantName, variantInfo] of info.variants.entries()) {
      const fallback = instantiateEnumVariantTypes(enumName, info, variantInfo);
      reachableByVariant.set(variantName, {
        variantName,
        variantInfo,
        resultType: fallback.resultType,
        paramTypes: fallback.variantParamTypes,
      });
    }
  }
  const reachable = new Set<string>(reachableByVariant.keys());
  const covered = new Set<string>();
  let fullyCovered = false;
  for (const arm of arms) {
    const pattern = arm.pattern;
    const armLoc = pattern.location ?? location;
    const guardless = !arm.guard;
    if (fullyCovered) {
      diagnostics.push({
        severity: 'warning',
        code: 'LUM-004',
        message: 'Unreachable match arm: previous patterns already cover all remaining cases',
        source: 'lumina',
        location: diagLocation(armLoc),
      });
      continue;
    }
    if (pattern.type === 'WildcardPattern' || pattern.type === 'BindingPattern' || pattern.type === 'RefBindingPattern') {
      if (guardless) {
        fullyCovered = true;
      }
      continue;
    }
    if (pattern.type === 'EnumPattern') {
      if (pattern.enumName && pattern.enumName !== enumName) continue;
      if (!reachable.has(pattern.variant)) {
        const variantInfo = info.variants.get(pattern.variant);
        const related: DiagnosticRelatedInformation[] = [
          {
            location: diagLocation(pattern.location ?? armLoc),
            message: `Scrutinee type is constrained to '${formatType(scrutineeType, subst)}'`,
          },
        ];
        if (variantInfo?.resultType) {
          related.push({
            location: diagLocation(variantInfo.location ?? pattern.location ?? armLoc),
            message: `Variant '${enumName}.${pattern.variant}' constructs '${formatType(parseTypeName(variantInfo.resultType), subst)}'`,
          });
        }
        diagnostics.push({
          severity: 'warning',
          code: 'LUM-004',
          message: `Unreachable pattern '${enumName}.${pattern.variant}': excluded by type-index constraints`,
          source: 'lumina',
          location: diagLocation(armLoc),
          relatedInformation: related,
        });
        continue;
      }
      if (guardless && covered.has(pattern.variant)) {
        diagnostics.push({
          severity: 'warning',
          code: 'LUM-004',
          message: `Unreachable pattern '${enumName}.${pattern.variant}': this variant is already fully matched by an earlier arm`,
          source: 'lumina',
          location: diagLocation(armLoc),
        });
        continue;
      }
      if (guardless) {
        covered.add(pattern.variant);
      }
    }
  }
  if (fullyCovered) return;
  const missing = Array.from(reachable).filter(name => !covered.has(name));
  if (missing.length === 0) return;
  const suggestions = missing.map((name) => {
    const candidate = reachableByVariant.get(name);
    return candidate ? renderVariantPatternSuggestion(enumName, candidate, subst) : `${enumName}.${name}`;
  });
  const related: DiagnosticRelatedInformation[] = [
    {
      location: diagLocation(location),
      message: `Scrutinee constrained type: ${formatType(scrutineeType, subst)}`,
    },
    {
      location: diagLocation(location),
      message: `Covered variants: ${Array.from(covered).join(', ') || 'none'}`,
    },
    {
      location: diagLocation(location),
      message: `Suggested missing pattern${suggestions.length === 1 ? '' : 's'}: ${suggestions.join(', ')}`,
    },
  ];
  for (const missingName of missing) {
    const candidate = reachableByVariant.get(missingName);
    if (!candidate) continue;
    related.push({
      location: diagLocation(candidate.variantInfo.location ?? location),
      message: `${enumName}.${missingName} constructs '${formatType(candidate.resultType, subst)}'`,
    });
  }
  diagnostics.push({
    severity: 'error',
    code: 'LUM-003',
    message: `Non-exhaustive match for '${formatType(scrutineeType, subst)}'. Missing pattern${missing.length === 1 ? '' : 's'}: ${suggestions.join(', ')}`,
    source: 'lumina',
    location: diagLocation(location),
    relatedInformation: related,
  });
}

function variantCanMatchScrutinee(
  enumName: string,
  info: EnumInfo,
  variant: EnumVariantInfo,
  scrutineeType: Type,
  subst: Subst
): boolean {
  return instantiateVariantForScrutinee(enumName, info, variant.name, variant, scrutineeType, subst) !== null;
}

function instantiateVariantForScrutinee(
  enumName: string,
  info: EnumInfo,
  variantName: string,
  variant: EnumVariantInfo,
  scrutineeType: Type,
  subst: Subst
): VariantMatchCandidate | null {
  const instantiated = instantiateEnumVariantTypes(enumName, info, variant);
  const normalizedScrutinee = normalizeScrutineeForEnum(scrutineeType, enumName, subst);
  const trialSubst = new Map<number, Type>(subst);
  try {
    unify(instantiated.resultType, normalizedScrutinee, trialSubst, activeWrapperSet);
    const resultType = normalizeType(instantiated.resultType, trialSubst);
    const paramTypes = instantiated.variantParamTypes.map((param) => normalizeType(param, trialSubst));
    return {
      variantName,
      variantInfo: variant,
      resultType,
      paramTypes,
    };
  } catch {
    return null;
  }
}

function renderVariantPatternSuggestion(enumName: string, candidate: VariantMatchCandidate, subst: Subst): string {
  if (candidate.paramTypes.length === 0) {
    return `${enumName}.${candidate.variantName}`;
  }
  const placeholders = candidate.paramTypes
    .map((param, index) => `_${index + 1}/*${formatType(param, subst)}*/`)
    .join(', ');
  return `${enumName}.${candidate.variantName}(${placeholders})`;
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
