import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaMatchPattern } from './ast.js';
import {
  type Type,
  type TypeScheme,
  type Subst,
  freshTypeVar,
  prune,
  unify,
  freeTypeVars,
  generalize,
} from './types.js';
import { type Diagnostic } from '../parser/index.js';
import { type Location } from '../utils/index.js';

export interface InferResult {
  type?: Type;
  diagnostics: Diagnostic[];
  subst: Subst;
  inferredLets: Map<string, Type>;
  inferredFnReturns: Map<string, Type>;
  inferredFnByName: Map<string, Type>;
  inferredFnParams: Map<string, Type[]>;
}

interface EnumInfo {
  typeParams: string[];
  variants: Map<string, string[]>;
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const diagLocation = (location?: Location): Location => location ?? defaultLocation;

export function inferProgram(program: LuminaProgram): InferResult {
  const env = new TypeEnv();
  const subst: Subst = new Map();
  const diagnostics: Diagnostic[] = [];
  const inferredLets = new Map<string, Type>();
  const inferredFnReturns = new Map<string, Type>();
  const inferredFnByName = new Map<string, Type>();
  const inferredFnParams = new Map<string, Type[]>();
  const hoistedFns = new Map<string, { paramTypes: Type[]; returnType: Type }>();
  const enumRegistry = buildEnumRegistry(program);

  for (const stmt of program.body) {
    if (stmt.type !== 'FnDecl') continue;
    const signature = buildFunctionSignature(stmt);
    hoistedFns.set(stmt.name, signature);
    const fnType: Type = { kind: 'function', args: signature.paramTypes, returnType: signature.returnType };
    env.extend(stmt.name, { kind: 'scheme', variables: [], type: fnType });
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
        enumRegistry
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
      enumRegistry
    );
  }

  return { diagnostics, subst, inferredLets, inferredFnReturns, inferredFnByName, inferredFnParams };
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

function buildFunctionSignature(stmt: Extract<LuminaStatement, { type: 'FnDecl' }>): { paramTypes: Type[]; returnType: Type } {
  const paramTypes = stmt.params.map((param) =>
    param.typeName ? parseTypeName(param.typeName) : freshTypeVar()
  );
  const returnType = stmt.returnType ? parseTypeName(stmt.returnType) : freshTypeVar();
  return { paramTypes, returnType };
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
  hoistedFns: Map<string, { paramTypes: Type[]; returnType: Type }>,
  enumRegistry: Map<string, EnumInfo>
): Type | null {
  const signature = hoistedFns.get(stmt.name) ?? buildFunctionSignature(stmt);
  const fnEnv = env.child();
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
      enumRegistry
    );
  }
  if (stmt.location?.start) {
    inferredFnReturns.set(keyFromLocation(stmt.location), signature.returnType);
  }
  inferredFnByName.set(stmt.name, signature.returnType);
  inferredFnParams.set(stmt.name, signature.paramTypes.map((param) => prune(param, subst)));
  return { kind: 'function', args: signature.paramTypes, returnType: signature.returnType };
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
  enumRegistry?: Map<string, EnumInfo>
): Type | null {
  switch (stmt.type) {
    case 'FnDecl': {
      const fnEnv = env.child();
      const signature = buildFunctionSignature(stmt);
      signature.paramTypes.forEach((t, idx) => {
        const param = stmt.params[idx];
        if (param) {
          fnEnv.extend(param.name, { kind: 'scheme', variables: [], type: t });
        }
      });
      const { paramTypes, returnType } = signature;
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
          enumRegistry
        );
      }
      const fnType: Type = { kind: 'function', args: paramTypes, returnType };
      if (!env.lookup(stmt.name)) {
        env.extend(stmt.name, { kind: 'scheme', variables: [], type: fnType });
      }
      if (stmt.location?.start) {
        inferredFnReturns?.set(keyFromLocation(stmt.location), returnType);
      }
      inferredFnByName?.set(stmt.name, returnType);
      inferredFnParams?.set(stmt.name, paramTypes.map((param) => prune(param, subst)));
      return fnType;
    }
    case 'Let': {
      const valueType = inferExpr(stmt.value, env, subst, diagnostics, enumRegistry);
      if (!valueType) return null;
      const scheme = generalize(valueType, subst, env.freeVars(subst));
      env.extend(stmt.name, scheme);
      if (stmt.location?.start) {
        inferredLets?.set(keyFromLocation(stmt.location), valueType);
      }
      return valueType;
    }
    case 'Return': {
      if (!currentReturn) return null;
      const valueType = inferExpr(stmt.value, env, subst, diagnostics, enumRegistry);
      if (!valueType) return null;
      tryUnify(currentReturn, valueType, subst, diagnostics);
      return valueType;
    }
    case 'ExprStmt': {
      return inferExpr(stmt.expr, env, subst, diagnostics, enumRegistry);
    }
    case 'If': {
      const condType = inferExpr(stmt.condition, env, subst, diagnostics, enumRegistry);
      if (condType) {
        tryUnify(condType, { kind: 'primitive', name: 'bool' }, subst, diagnostics);
      }
      const thenEnv = env.child();
      if (stmt.condition.type === 'IsExpr') {
        const narrowing = getIsNarrowing(stmt.condition, env, subst, diagnostics, enumRegistry);
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
          enumRegistry
        );
      }
      if (stmt.elseBlock) {
        const elseEnv = env.child();
        if (stmt.condition.type === 'IsExpr') {
          const narrowing = getIsElseNarrowing(stmt.condition, env, subst, diagnostics, enumRegistry);
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
            enumRegistry
          );
        }
      }
      return null;
    }
    case 'While': {
      const condType = inferExpr(stmt.condition, env, subst, diagnostics, enumRegistry);
      if (condType) {
        tryUnify(condType, { kind: 'primitive', name: 'bool' }, subst, diagnostics);
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
          enumRegistry
        );
      }
      return null;
    }
    case 'MatchStmt': {
      const scrutineeType = inferExpr(stmt.value, env, subst, diagnostics, enumRegistry);
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
            enumRegistry
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
          enumRegistry
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
  enumRegistry?: Map<string, EnumInfo>
): Type | null {
  switch (expr.type) {
    case 'Number':
      return { kind: 'primitive', name: 'int' };
    case 'String':
      return { kind: 'primitive', name: 'string' };
    case 'Boolean':
      return { kind: 'primitive', name: 'bool' };
    case 'Identifier': {
      const scheme = env.lookup(expr.name);
      if (!scheme) return null;
      return instantiate(scheme);
    }
    case 'Binary': {
      const left = inferExpr(expr.left, env, subst, diagnostics, enumRegistry);
      const right = inferExpr(expr.right, env, subst, diagnostics, enumRegistry);
      if (!left || !right) return null;
      if (expr.op === '==' || expr.op === '!=') {
        tryUnify(left, right, subst, diagnostics);
        return { kind: 'primitive', name: 'bool' };
      }
      if (['+', '-', '*', '/', '<', '>', '<=', '>='].includes(expr.op)) {
        tryUnify(left, { kind: 'primitive', name: 'int' }, subst, diagnostics);
        tryUnify(right, { kind: 'primitive', name: 'int' }, subst, diagnostics);
        return expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>='
          ? { kind: 'primitive', name: 'bool' }
          : { kind: 'primitive', name: 'int' };
      }
      return null;
    }
    case 'Call': {
      if (expr.enumName && enumRegistry) {
        const constructorType = inferEnumConstructor(expr, env, subst, diagnostics, enumRegistry);
        if (constructorType) return constructorType;
      }
      const calleeScheme = env.lookup(expr.callee.name);
      if (!calleeScheme) return null;
      const calleeType = instantiate(calleeScheme);
      const argTypes = expr.args.map(arg => inferExpr(arg, env, subst, diagnostics, enumRegistry) ?? freshTypeVar());
      const resultType = freshTypeVar();
      const fnType: Type = { kind: 'function', args: argTypes, returnType: resultType };
      tryUnify(calleeType, fnType, subst, diagnostics);
      return prune(resultType, subst);
    }
    case 'Member': {
      if (!enumRegistry) return null;
      if (expr.object.type !== 'Identifier') return null;
      const enumName = expr.object.name;
      const info = enumRegistry.get(enumName);
      if (!info) return null;
      const variantParams = info.variants.get(expr.property);
      if (!variantParams) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_ENUM_VARIANT',
          message: `Unknown enum variant '${enumName}.${expr.property}'`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
        return null;
      }
      if (variantParams.length > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'HM_ENUM_VARIANT',
          message: `Enum variant '${enumName}.${expr.property}' requires ${variantParams.length} arguments`,
          source: 'lumina',
          location: diagLocation(expr.location),
        });
        return null;
      }
      const paramTypes = info.typeParams.map(() => freshTypeVar());
      return { kind: 'adt', name: enumName, params: paramTypes.map(p => prune(p, subst)) };
    }
    case 'IsExpr': {
      return inferIsExpr(expr, env, subst, diagnostics, enumRegistry);
    }
    case 'MatchExpr': {
      const scrutineeType = inferExpr(expr.value, env, subst, diagnostics, enumRegistry);
      if (!scrutineeType) return null;
      let resultType: Type | null = null;
      for (const arm of expr.arms) {
        const armEnv = env.child();
        applyMatchPattern(arm.pattern, scrutineeType, armEnv, subst, diagnostics, enumRegistry);
        const armType = inferExpr(arm.body, armEnv, subst, diagnostics, enumRegistry);
        if (!armType) continue;
        if (!resultType) {
          resultType = armType;
        } else {
          tryUnify(resultType, armType, subst, diagnostics);
        }
      }
      if (enumRegistry) {
        checkMatchExhaustiveness(expr.arms, scrutineeType, subst, enumRegistry, diagnostics, expr.location);
      }
      return resultType ?? freshTypeVar();
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
  if (type.kind === 'adt') {
    return { kind: 'adt', name: type.name, params: type.params.map(p => substituteVars(p, mapping)) };
  }
  return type;
}

function parseTypeName(typeName: string): Type {
  if (typeName === 'int' || typeName === 'string' || typeName === 'bool' || typeName === 'void' || typeName === 'any') {
    return { kind: 'primitive', name: typeName };
  }
  const idx = typeName.indexOf('<');
  if (idx === -1) {
    return { kind: 'adt', name: typeName, params: [] };
  }
  const base = typeName.slice(0, idx);
  const inner = typeName.slice(idx + 1, -1);
  const args = splitTypeArgs(inner).map(parseTypeName);
  return { kind: 'adt', name: base, params: args };
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

function tryUnify(t1: Type, t2: Type, subst: Subst, diagnostics: Diagnostic[]) {
  try {
    unify(t1, t2, subst);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Type mismatch';
    const code = rawMessage.includes('Function arity mismatch') ? 'LUM-002' : 'LUM-001';
    const formatted = `Type mismatch. Expected '${formatType(t1, subst)}' but found '${formatType(t2, subst)}'`;
    const message = code === 'LUM-002' ? rawMessage : formatted;
    diagnostics.push({
      severity: 'error',
      message,
      code,
      source: 'lumina',
      location: diagLocation(),
    });
  }
}

function keyFromLocation(location: { start: { line: number; column: number; offset: number } }): string {
  return `${location.start.line}:${location.start.column}:${location.start.offset}`;
}

function buildEnumRegistry(program: LuminaProgram): Map<string, EnumInfo> {
  const registry = new Map<string, EnumInfo>();
  for (const stmt of program.body) {
    if (stmt.type !== 'EnumDecl') continue;
    const typeParams = (stmt.typeParams ?? []).map(param => param.name);
    const variants = new Map<string, string[]>();
    for (const variant of stmt.variants) {
      variants.set(variant.name, variant.params ?? []);
    }
    registry.set(stmt.name, { typeParams, variants });
  }
  return registry;
}

function inferEnumConstructor(
  expr: Extract<LuminaExpr, { type: 'Call' }>,
  env: TypeEnv,
  subst: Subst,
  diagnostics: Diagnostic[],
  enumRegistry: Map<string, EnumInfo>
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
  const argTypes = expr.args.map(arg => inferExpr(arg, env, subst, diagnostics, enumRegistry) ?? freshTypeVar());
  for (let i = 0; i < argTypes.length && i < variantParams.length; i++) {
    const expected = parseTypeNameWithEnv(variantParams[i], enumParamMap);
    tryUnify(argTypes[i], expected, subst, diagnostics);
  }
  return { kind: 'adt', name: expr.enumName, params: paramTypes.map(p => prune(p, subst)) };
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
  enumRegistry?: Map<string, EnumInfo>
): { name: string; type: Type } | null {
  if (!enumRegistry) return null;
  if (expr.value.type !== 'Identifier') return null;
  const enumName = resolveEnumName(expr.enumName, expr.variant, enumRegistry);
  if (!enumName) return null;
  const info = enumRegistry.get(enumName);
  if (!info) return null;
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  const current = inferExpr(expr.value, env, subst, diagnostics, enumRegistry);
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
  enumRegistry?: Map<string, EnumInfo>
): { name: string; type: Type } | null {
  if (!enumRegistry) return null;
  if (expr.value.type !== 'Identifier') return null;
  const enumName = resolveEnumName(expr.enumName, expr.variant, enumRegistry);
  if (!enumName) return null;
  const info = enumRegistry.get(enumName);
  if (!info || info.variants.size !== 2) return null;
  const paramTypes = info.typeParams.map(() => freshTypeVar());
  const expectedEnumType: Type = { kind: 'adt', name: enumName, params: paramTypes };
  const current = inferExpr(expr.value, env, subst, diagnostics, enumRegistry);
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
  enumRegistry?: Map<string, EnumInfo>
): Type | null {
  const condType = inferExpr(expr.value, env, subst, diagnostics, enumRegistry);
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

function parseTypeNameWithEnv(typeName: string, typeParams: Map<string, Type>): Type {
  const baseIdx = typeName.indexOf('<');
  const base = baseIdx === -1 ? typeName : typeName.slice(0, baseIdx);
  const direct = typeParams.get(base);
  if (direct) return direct;
  if (baseIdx === -1) {
    return parseTypeName(typeName);
  }
  const inner = typeName.slice(baseIdx + 1, -1);
  const args = splitTypeArgs(inner).map(arg => parseTypeNameWithEnv(arg, typeParams));
  return { kind: 'adt', name: base, params: args };
}

function formatType(type: Type, subst: Subst): string {
  const pruned = prune(type, subst);
  switch (pruned.kind) {
    case 'primitive':
      return pruned.name;
    case 'variable':
      return `unknown(t${pruned.id})`;
    case 'function': {
      const args = pruned.args.map((arg) => formatType(arg, subst)).join(', ');
      return `(${args}) -> ${formatType(pruned.returnType, subst)}`;
    }
    case 'adt':
      if (pruned.params.length === 0) return pruned.name;
      return `${pruned.name}<${pruned.params.map((param) => formatType(param, subst)).join(', ')}>`;
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
