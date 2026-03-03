import type { Diagnostic } from '../parser/index.js';
import type { Location } from '../utils/index.js';
import type {
  LuminaArrayType,
  LuminaBlock,
  LuminaCall,
  LuminaExpr,
  LuminaFnDecl,
  LuminaInterpolatedString,
  LuminaProgram,
  LuminaStatement,
  LuminaStructLiteralField,
  LuminaTypeExpr,
} from './ast.js';

const COMPTIME_ALLOWED_PRIMITIVE_RETURN_TYPES = new Set([
  'bool',
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
  'int',
  'float',
  'string',
  'String',
]);

export const COMPTIME_MAX_EVAL_STEPS = 10_000;
export const COMPTIME_MAX_ARRAY_SIZE = 65_536;
const COMPTIME_MAX_CALL_DEPTH = 512;

export type ComptimeValue =
  | { kind: 'int'; value: bigint }
  | { kind: 'float'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'array'; elements: ComptimeValue[] };

export interface ComptimeEnv {
  bindings: Map<string, ComptimeValue>;
  parent: ComptimeEnv | null;
  steps: { n: number };
}

export interface ComptimeError {
  kind: 'not_comptime' | 'bridge_violation' | 'runaway' | 'unsupported_node' | 'cycle';
  message: string;
  fnName: string;
  location?: Location;
}

export type ComptimeResult =
  | { ok: true; value: ComptimeValue }
  | { ok: false; error: ComptimeError };

export interface ComptimeFnEntry {
  name: string;
  params: string[];
  body: LuminaBlock;
  returnType: LuminaTypeExpr | null;
  evaluated: boolean;
  result: ComptimeValue | null;
  fn: LuminaFnDecl;
  dependencies: Set<string>;
  memo: Map<string, ComptimeValue>;
}

export interface ComptimeFnRegistry {
  fns: Map<string, ComptimeFnEntry>;
}

export interface ComptimePassResult {
  ast: LuminaProgram;
  evaluated: string[];
  failed: ComptimeError[];
  substituted: number;
  diagnostics: Diagnostic[];
}

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const splitTypeArgs = (input: string): string[] => {
  const result: string[] = [];
  let angleDepth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<') angleDepth += 1;
    if (ch === '>') angleDepth -= 1;
    if (ch === ',' && angleDepth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
};

const parseTypeName = (text: string): { base: string; args: string[] } | null => {
  const trimmed = text.trim();
  const idx = trimmed.indexOf('<');
  if (idx === -1) return { base: trimmed, args: [] };
  if (!trimmed.endsWith('>')) return null;
  return { base: trimmed.slice(0, idx), args: splitTypeArgs(trimmed.slice(idx + 1, -1)) };
};

const isPrimitiveTypeExpr = (typeExpr: LuminaTypeExpr | null): boolean => {
  if (!typeExpr) return false;
  if (typeof typeExpr !== 'string') return false;
  return COMPTIME_ALLOWED_PRIMITIVE_RETURN_TYPES.has(typeExpr);
};

const isAllowedComptimeReturnType = (typeExpr: LuminaTypeExpr | null): boolean => {
  if (!typeExpr) return false;
  if (typeof typeExpr === 'string') {
    if (COMPTIME_ALLOWED_PRIMITIVE_RETURN_TYPES.has(typeExpr)) return true;
    const parsed = parseTypeName(typeExpr);
    if (parsed?.base === 'Array' && parsed.args.length === 1) {
      return isPrimitiveTypeExpr(parsed.args[0]);
    }
    return false;
  }
  const arrayType = typeExpr as LuminaArrayType;
  if (arrayType.kind !== 'array') return false;
  return isPrimitiveTypeExpr(arrayType.element);
};

const valueMatchesReturnType = (value: ComptimeValue, typeExpr: LuminaTypeExpr | null): boolean => {
  if (!typeExpr) return false;
  if (typeof typeExpr === 'string') {
    if (typeExpr === 'bool') return value.kind === 'bool';
    if (typeExpr === 'string' || typeExpr === 'String') return value.kind === 'string';
    const parsed = parseTypeName(typeExpr);
    if (parsed?.base === 'Array' && parsed.args.length === 1) {
      return value.kind === 'array';
    }
    if (COMPTIME_ALLOWED_PRIMITIVE_RETURN_TYPES.has(typeExpr)) {
      return value.kind === 'int' || value.kind === 'float';
    }
    return false;
  }
  const arrayType = typeExpr as LuminaArrayType;
  if (arrayType.kind === 'array') return value.kind === 'array';
  return false;
};

const toDiagnostic = (error: ComptimeError): Diagnostic => ({
  severity: 'error',
  code:
    error.kind === 'bridge_violation'
      ? 'COMPTIME-BRIDGE'
      : error.kind === 'runaway'
        ? 'COMPTIME-RUNAWAY'
        : error.kind === 'cycle'
          ? 'COMPTIME-CYCLE'
          : error.kind === 'unsupported_node'
            ? 'COMPTIME-UNSUPPORTED'
            : 'COMPTIME-NOT-COMPTIME',
  message: error.message,
  location: error.location ?? defaultLocation,
  source: 'lumina',
});

const makeError = (
  kind: ComptimeError['kind'],
  fnName: string,
  message: string,
  location?: Location
): ComptimeResult => ({
  ok: false,
  error: { kind, fnName, message, location },
});

const createEnv = (parent: ComptimeEnv | null, steps: { n: number }): ComptimeEnv => ({
  bindings: new Map(),
  parent,
  steps,
});

const lookupBinding = (name: string, env: ComptimeEnv): ComptimeValue | null => {
  let cursor: ComptimeEnv | null = env;
  while (cursor) {
    if (cursor.bindings.has(name)) {
      return cursor.bindings.get(name) ?? null;
    }
    cursor = cursor.parent;
  }
  return null;
};

const assignBinding = (name: string, value: ComptimeValue, env: ComptimeEnv): boolean => {
  let cursor: ComptimeEnv | null = env;
  while (cursor) {
    if (cursor.bindings.has(name)) {
      cursor.bindings.set(name, value);
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
};

const tick = (env: ComptimeEnv, fnName: string, location?: Location): ComptimeResult | null => {
  env.steps.n += 1;
  if (env.steps.n <= COMPTIME_MAX_EVAL_STEPS) return null;
  return makeError(
    'runaway',
    fnName,
    `comptime evaluation exceeded ${COMPTIME_MAX_EVAL_STEPS} steps in '${fnName}'`,
    location
  );
};

const stringifyComptimeValue = (value: ComptimeValue): string => {
  switch (value.kind) {
    case 'int':
      return value.value.toString();
    case 'float':
      return String(value.value);
    case 'bool':
      return value.value ? 'true' : 'false';
    case 'string':
      return value.value;
    case 'array':
      return `[${value.elements.map(stringifyComptimeValue).join(',')}]`;
    default:
      return '';
  }
};

const serializeComptimeValue = (value: ComptimeValue): string => {
  switch (value.kind) {
    case 'int':
      return `i:${value.value.toString()}`;
    case 'float':
      return `f:${value.value}`;
    case 'bool':
      return `b:${value.value ? 1 : 0}`;
    case 'string':
      return `s:${JSON.stringify(value.value)}`;
    case 'array':
      return `a:[${value.elements.map(serializeComptimeValue).join(';')}]`;
    default:
      return 'u';
  }
};

const valueToExpr = (value: ComptimeValue, location?: Location): LuminaExpr => {
  switch (value.kind) {
    case 'int':
      return {
        type: 'Number',
        value: Number(value.value),
        raw: value.value.toString(),
        isFloat: false,
        location,
      };
    case 'float':
      return {
        type: 'Number',
        value: value.value,
        raw: String(value.value),
        isFloat: true,
        location,
      };
    case 'bool':
      return { type: 'Boolean', value: value.value, location };
    case 'string':
      return { type: 'String', value: value.value, location };
    case 'array':
      return {
        type: 'ArrayLiteral',
        elements: value.elements.map((element) => valueToExpr(element, location)),
        location,
      };
    default:
      return { type: 'String', value: '', location };
  }
};

const evalBinary = (
  op: string,
  left: ComptimeValue,
  right: ComptimeValue,
  fnName: string,
  location?: Location
): ComptimeResult => {
  const numeric = (value: ComptimeValue): number | null => {
    if (value.kind === 'int') return Number(value.value);
    if (value.kind === 'float') return value.value;
    return null;
  };
  const integral = (value: ComptimeValue): bigint | null => (value.kind === 'int' ? value.value : null);

  if (op === '+' && left.kind === 'string' && right.kind === 'string') {
    return { ok: true, value: { kind: 'string', value: left.value + right.value } };
  }

  if (op === '&&' || op === '||') {
    if (left.kind !== 'bool' || right.kind !== 'bool') {
      return makeError('not_comptime', fnName, `Operator '${op}' requires bool operands`, location);
    }
    return {
      ok: true,
      value: {
        kind: 'bool',
        value: op === '&&' ? left.value && right.value : left.value || right.value,
      },
    };
  }

  if (op === '==' || op === '!=') {
    const same = serializeComptimeValue(left) === serializeComptimeValue(right);
    return { ok: true, value: { kind: 'bool', value: op === '==' ? same : !same } };
  }

  const leftInt = integral(left);
  const rightInt = integral(right);
  const leftNum = numeric(left);
  const rightNum = numeric(right);
  if (leftNum == null || rightNum == null) {
    return makeError('not_comptime', fnName, `Operator '${op}' requires numeric operands`, location);
  }

  const isFloat = left.kind === 'float' || right.kind === 'float';

  switch (op) {
    case '+':
      if (!isFloat && leftInt != null && rightInt != null) return { ok: true, value: { kind: 'int', value: leftInt + rightInt } };
      return { ok: true, value: { kind: 'float', value: leftNum + rightNum } };
    case '-':
      if (!isFloat && leftInt != null && rightInt != null) return { ok: true, value: { kind: 'int', value: leftInt - rightInt } };
      return { ok: true, value: { kind: 'float', value: leftNum - rightNum } };
    case '*':
      if (!isFloat && leftInt != null && rightInt != null) return { ok: true, value: { kind: 'int', value: leftInt * rightInt } };
      return { ok: true, value: { kind: 'float', value: leftNum * rightNum } };
    case '/':
      if (rightNum === 0) return makeError('not_comptime', fnName, 'Division by zero in comptime expression', location);
      if (!isFloat && leftInt != null && rightInt != null) return { ok: true, value: { kind: 'int', value: leftInt / rightInt } };
      return { ok: true, value: { kind: 'float', value: leftNum / rightNum } };
    case '<':
      return { ok: true, value: { kind: 'bool', value: leftNum < rightNum } };
    case '<=':
      return { ok: true, value: { kind: 'bool', value: leftNum <= rightNum } };
    case '>':
      return { ok: true, value: { kind: 'bool', value: leftNum > rightNum } };
    case '>=':
      return { ok: true, value: { kind: 'bool', value: leftNum >= rightNum } };
    default:
      return makeError('unsupported_node', fnName, `Unsupported binary operator '${op}' in comptime`, location);
  }
};

type EvalState =
  | { ok: true; returned: boolean; value?: ComptimeValue }
  | { ok: false; error: ComptimeError };

interface EvalContext {
  registry: ComptimeFnRegistry;
  blocked: Set<string>;
  stack: string[];
}

const evaluateComptimeFunction = (
  entry: ComptimeFnEntry,
  args: ComptimeValue[],
  ctx: EvalContext,
  steps: { n: number },
  location?: Location
): ComptimeResult => {
  if (ctx.stack.length >= COMPTIME_MAX_CALL_DEPTH) {
    return makeError(
      'runaway',
      entry.name,
      `comptime call depth exceeded ${COMPTIME_MAX_CALL_DEPTH} while evaluating '${entry.name}'`,
      location ?? entry.fn.location
    );
  }
  if (ctx.blocked.has(entry.name)) {
    return makeError(
      'cycle',
      entry.name,
      `Cannot evaluate '${entry.name}' because it is part of a comptime cycle`,
      location ?? entry.fn.location
    );
  }
  if (entry.params.length !== args.length) {
    return makeError(
      'not_comptime',
      entry.name,
      `comptime fn '${entry.name}' expects ${entry.params.length} argument(s), got ${args.length}`,
      location ?? entry.fn.location
    );
  }

  const memoKey = `${entry.name}(${args.map(serializeComptimeValue).join(',')})`;
  if (entry.memo.has(memoKey)) {
    return { ok: true, value: entry.memo.get(memoKey) as ComptimeValue };
  }

  ctx.stack.push(entry.name);
  const env = createEnv(null, steps);
  for (let i = 0; i < entry.params.length; i += 1) {
    env.bindings.set(entry.params[i], args[i]);
  }

  const result = evalBlock(entry.body, env, ctx, entry.name);
  ctx.stack.pop();
  if (!result.ok) return result;
  if (!result.returned || !result.value) {
    return makeError(
      'not_comptime',
      entry.name,
      `comptime fn '${entry.name}' must return a value`,
      location ?? entry.fn.location
    );
  }
  if (!valueMatchesReturnType(result.value, entry.returnType)) {
    return makeError(
      'bridge_violation',
      entry.name,
      `Result of comptime fn '${entry.name}' does not match declared return type`,
      location ?? entry.fn.location
    );
  }
  entry.memo.set(memoKey, result.value);
  return { ok: true, value: result.value };
};

const evalExpr = (
  expr: LuminaExpr,
  env: ComptimeEnv,
  ctx: EvalContext,
  fnName: string
): ComptimeResult => {
  const stepError = tick(env, fnName, expr.location);
  if (stepError) return stepError;

  switch (expr.type) {
    case 'Number':
      if (expr.isFloat || expr.suffix?.startsWith('f')) {
        return { ok: true, value: { kind: 'float', value: expr.value } };
      }
      return { ok: true, value: { kind: 'int', value: BigInt(Math.trunc(expr.value)) } };
    case 'Boolean':
      return { ok: true, value: { kind: 'bool', value: expr.value } };
    case 'String':
      return { ok: true, value: { kind: 'string', value: expr.value } };
    case 'InterpolatedString': {
      let out = '';
      for (const part of (expr as LuminaInterpolatedString).parts) {
        if (typeof part === 'string') {
          out += part;
          continue;
        }
        const partResult = evalExpr(part, env, ctx, fnName);
        if (!partResult.ok) return partResult;
        out += stringifyComptimeValue(partResult.value);
      }
      return { ok: true, value: { kind: 'string', value: out } };
    }
    case 'Identifier': {
      const binding = lookupBinding(expr.name, env);
      if (binding) return { ok: true, value: binding };
      return makeError(
        'not_comptime',
        fnName,
        `Runtime binding '${expr.name}' is not available in comptime context`,
        expr.location
      );
    }
    case 'Binary': {
      const left = evalExpr(expr.left, env, ctx, fnName);
      if (!left.ok) return left;
      const right = evalExpr(expr.right, env, ctx, fnName);
      if (!right.ok) return right;
      return evalBinary(expr.op, left.value, right.value, fnName, expr.location);
    }
    case 'ArrayLiteral': {
      const values: ComptimeValue[] = [];
      for (const element of expr.elements) {
        const result = evalExpr(element, env, ctx, fnName);
        if (!result.ok) return result;
        values.push(result.value);
      }
      if (values.length > COMPTIME_MAX_ARRAY_SIZE) {
        return makeError(
          'bridge_violation',
          fnName,
          `Array size ${values.length} exceeds comptime limit ${COMPTIME_MAX_ARRAY_SIZE}`,
          expr.location
        );
      }
      return { ok: true, value: { kind: 'array', elements: values } };
    }
    case 'ArrayRepeatLiteral': {
      const valueResult = evalExpr(expr.value, env, ctx, fnName);
      if (!valueResult.ok) return valueResult;
      const countResult = evalExpr(expr.count, env, ctx, fnName);
      if (!countResult.ok) return countResult;
      if (countResult.value.kind !== 'int') {
        return makeError('not_comptime', fnName, 'Array repeat count must be an integer', expr.location);
      }
      const count = Number(countResult.value.value);
      if (!Number.isFinite(count) || count < 0) {
        return makeError('not_comptime', fnName, 'Array repeat count must be non-negative', expr.location);
      }
      if (count > COMPTIME_MAX_ARRAY_SIZE) {
        return makeError(
          'bridge_violation',
          fnName,
          `Array size ${count} exceeds comptime limit ${COMPTIME_MAX_ARRAY_SIZE}`,
          expr.location
        );
      }
      return {
        ok: true,
        value: {
          kind: 'array',
          elements: Array.from({ length: count }, () => valueResult.value),
        },
      };
    }
    case 'Index': {
      const object = evalExpr(expr.object, env, ctx, fnName);
      if (!object.ok) return object;
      if (object.value.kind !== 'array') {
        return makeError('not_comptime', fnName, 'Indexing requires an array in comptime', expr.location);
      }
      const indexResult = evalExpr(expr.index, env, ctx, fnName);
      if (!indexResult.ok) return indexResult;
      if (indexResult.value.kind !== 'int') {
        return makeError('not_comptime', fnName, 'Array index must be an integer', expr.location);
      }
      const index = Number(indexResult.value.value);
      if (!Number.isInteger(index) || index < 0 || index >= object.value.elements.length) {
        return makeError('not_comptime', fnName, `Array index ${index} out of bounds`, expr.location);
      }
      return { ok: true, value: object.value.elements[index] };
    }
    case 'Call': {
      if (expr.receiver || expr.enumName) {
        return makeError(
          'not_comptime',
          fnName,
          `Runtime call '${expr.enumName ? `${expr.enumName}.` : ''}${expr.callee.name}' is not allowed in comptime`,
          expr.location
        );
      }
      const entry = ctx.registry.fns.get(expr.callee.name);
      if (!entry) {
        return makeError(
          'not_comptime',
          fnName,
          `Call to non-comptime function '${expr.callee.name}'`,
          expr.location
        );
      }
      const argValues: ComptimeValue[] = [];
      for (const arg of expr.args ?? []) {
        const argValue = evalExpr(arg, env, ctx, fnName);
        if (!argValue.ok) return argValue;
        argValues.push(argValue.value);
      }
      return evaluateComptimeFunction(entry, argValues, ctx, env.steps, expr.location);
    }
    case 'Cast':
      return evalExpr(expr.expr, env, ctx, fnName);
    case 'Await':
      return makeError('not_comptime', fnName, `await is not allowed in comptime`, expr.location);
    case 'Try':
      return makeError('unsupported_node', fnName, `try operator is not supported in comptime v1`, expr.location);
    case 'Range':
    case 'StructLiteral':
    case 'TupleLiteral':
    case 'Member':
    case 'Move':
    case 'IsExpr':
    case 'MatchExpr':
    case 'SelectExpr':
    case 'Lambda':
    case 'MacroInvoke':
      return makeError(
        'unsupported_node',
        fnName,
        `Expression '${expr.type}' is not supported in comptime v1`,
        expr.location
      );
    default:
      return makeError('unsupported_node', fnName, `Unsupported expression '${(expr as { type?: string }).type ?? 'unknown'}'`, expr.location);
  }
};

const evalStmt = (
  stmt: LuminaStatement,
  env: ComptimeEnv,
  ctx: EvalContext,
  fnName: string
): EvalState => {
  const stepError = tick(env, fnName, stmt.location);
  if (stepError) return { ok: false, error: stepError.error };

  switch (stmt.type) {
    case 'Let': {
      const value = evalExpr(stmt.value, env, ctx, fnName);
      if (!value.ok) return { ok: false, error: value.error };
      env.bindings.set(stmt.name, value.value);
      return { ok: true, returned: false };
    }
    case 'Assign': {
      if (stmt.target.type !== 'Identifier') {
        return {
          ok: false,
          error: {
            kind: 'unsupported_node',
            fnName,
            message: `Only identifier assignment is supported in comptime`,
            location: stmt.location,
          },
        };
      }
      const value = evalExpr(stmt.value, env, ctx, fnName);
      if (!value.ok) return { ok: false, error: value.error };
      const ok = assignBinding(stmt.target.name, value.value, env);
      if (!ok) {
        return {
          ok: false,
          error: {
            kind: 'not_comptime',
            fnName,
            message: `Unknown binding '${stmt.target.name}' in comptime assignment`,
            location: stmt.location,
          },
        };
      }
      return { ok: true, returned: false };
    }
    case 'ExprStmt': {
      const result = evalExpr(stmt.expr, env, ctx, fnName);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, returned: false };
    }
    case 'Return': {
      const result = evalExpr(stmt.value, env, ctx, fnName);
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, returned: true, value: result.value };
    }
    case 'If': {
      const cond = evalExpr(stmt.condition, env, ctx, fnName);
      if (!cond.ok) return { ok: false, error: cond.error };
      if (cond.value.kind !== 'bool') {
        return {
          ok: false,
          error: {
            kind: 'not_comptime',
            fnName,
            message: `If condition must be bool in comptime`,
            location: stmt.condition.location ?? stmt.location,
          },
        };
      }
      const branch = cond.value.value ? stmt.thenBlock : stmt.elseBlock;
      if (!branch) return { ok: true, returned: false };
      return evalBlock(branch, createEnv(env, env.steps), ctx, fnName);
    }
    case 'Block':
      return evalBlock(stmt, createEnv(env, env.steps), ctx, fnName);
    default:
      return {
        ok: false,
        error: {
          kind: 'unsupported_node',
          fnName,
          message: `Statement '${stmt.type}' is not supported in comptime v1`,
          location: stmt.location,
        },
      };
  }
};

const evalBlock = (
  block: LuminaBlock,
  env: ComptimeEnv,
  ctx: EvalContext,
  fnName: string
): EvalState => {
  for (const stmt of block.body ?? []) {
    const result = evalStmt(stmt, env, ctx, fnName);
    if (!result.ok) return result;
    if (result.returned) return result;
  }
  return { ok: true, returned: false };
};

const validateComptimeFn = (entry: ComptimeFnEntry, registry: ComptimeFnRegistry): ComptimeError[] => {
  const errors: ComptimeError[] = [];
  const fn = entry.fn;
  if (fn.async) {
    errors.push({
      kind: 'not_comptime',
      fnName: entry.name,
      message: `comptime fn '${entry.name}' cannot be async`,
      location: fn.location,
    });
  }
  if (fn.extern) {
    errors.push({
      kind: 'not_comptime',
      fnName: entry.name,
      message: `comptime fn '${entry.name}' cannot be extern`,
      location: fn.location,
    });
  }
  if (!isAllowedComptimeReturnType(entry.returnType)) {
    errors.push({
      kind: 'bridge_violation',
      fnName: entry.name,
      message: `comptime fn '${entry.name}' return type violates bridge rules`,
      location: fn.returnType && typeof fn.returnType !== 'string' ? fn.returnType.location : fn.location,
    });
  }

  const validateExpr = (expr: LuminaExpr): void => {
    switch (expr.type) {
      case 'Call':
        if (expr.receiver || expr.enumName) {
          errors.push({
            kind: 'not_comptime',
            fnName: entry.name,
            message: `Runtime member call '${expr.enumName ? `${expr.enumName}.` : ''}${expr.callee.name}' is not allowed in comptime`,
            location: expr.location,
          });
        } else {
          const dep = registry.fns.get(expr.callee.name);
          if (!dep) {
            errors.push({
              kind: 'not_comptime',
              fnName: entry.name,
              message: `Call to non-comptime function '${expr.callee.name}'`,
              location: expr.location,
            });
          } else {
            entry.dependencies.add(dep.name);
          }
        }
        if (expr.receiver) validateExpr(expr.receiver);
        for (const arg of expr.args ?? []) validateExpr(arg);
        return;
      case 'Binary':
        validateExpr(expr.left);
        validateExpr(expr.right);
        return;
      case 'ArrayLiteral':
      case 'TupleLiteral':
        for (const element of expr.elements) validateExpr(element);
        return;
      case 'ArrayRepeatLiteral':
        validateExpr(expr.value);
        validateExpr(expr.count);
        return;
      case 'Index':
        validateExpr(expr.object);
        validateExpr(expr.index);
        return;
      case 'Cast':
        validateExpr(expr.expr);
        return;
      case 'InterpolatedString':
        for (const part of expr.parts) if (typeof part !== 'string') validateExpr(part);
        return;
      case 'Await':
        errors.push({
          kind: 'not_comptime',
          fnName: entry.name,
          message: `await is not allowed in comptime`,
          location: expr.location,
        });
        validateExpr(expr.value);
        return;
      case 'Try':
      case 'SelectExpr':
      case 'MatchExpr':
      case 'StructLiteral':
      case 'Range':
      case 'Member':
      case 'Move':
      case 'IsExpr':
      case 'Lambda':
      case 'MacroInvoke':
        errors.push({
          kind: 'unsupported_node',
          fnName: entry.name,
          message: `Expression '${expr.type}' is not supported in comptime v1`,
          location: expr.location,
        });
        return;
      default:
        return;
    }
  };

  const validateStmt = (stmt: LuminaStatement): void => {
    switch (stmt.type) {
      case 'Let':
        validateExpr(stmt.value);
        return;
      case 'Assign':
        validateExpr(stmt.value);
        return;
      case 'ExprStmt':
        validateExpr(stmt.expr);
        return;
      case 'Return':
        validateExpr(stmt.value);
        return;
      case 'If':
        validateExpr(stmt.condition);
        for (const inner of stmt.thenBlock.body ?? []) validateStmt(inner);
        for (const inner of stmt.elseBlock?.body ?? []) validateStmt(inner);
        return;
      case 'Block':
        for (const inner of stmt.body ?? []) validateStmt(inner);
        return;
      default:
        errors.push({
          kind: 'unsupported_node',
          fnName: entry.name,
          message: `Statement '${stmt.type}' is not supported in comptime v1`,
          location: stmt.location,
        });
    }
  };

  for (const stmt of entry.body.body ?? []) validateStmt(stmt);
  return errors;
};

const collectComptimeFns = (ast: LuminaProgram): ComptimeFnRegistry => {
  const fns = new Map<string, ComptimeFnEntry>();
  for (const stmt of ast.body) {
    if (stmt.type !== 'FnDecl' || !stmt.comptime) continue;
    fns.set(stmt.name, {
      name: stmt.name,
      params: (stmt.params ?? []).map((param) => param.name),
      body: stmt.body,
      returnType: stmt.returnType,
      evaluated: false,
      result: null,
      fn: stmt,
      dependencies: new Set<string>(),
      memo: new Map<string, ComptimeValue>(),
    });
  }
  return { fns };
};

const detectDependencyCycles = (registry: ComptimeFnRegistry): ComptimeError[] => {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const errors: ComptimeError[] = [];
  const seenCycleMembers = new Set<string>();

  const dfs = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    inStack.add(name);
    stack.push(name);
    const entry = registry.fns.get(name);
    for (const dep of entry?.dependencies ?? []) {
      if (dep === name) continue; // direct recursion is allowed (guarded by step limit).
      if (!registry.fns.has(dep)) continue;
      if (!visited.has(dep)) {
        dfs(dep);
      } else if (inStack.has(dep)) {
        const idx = stack.lastIndexOf(dep);
        if (idx >= 0) {
          const cycle = stack.slice(idx);
          if (cycle.length > 1) {
            const cycleLabel = [...cycle, dep].join(' -> ');
            for (const member of cycle) {
              if (seenCycleMembers.has(member)) continue;
              seenCycleMembers.add(member);
              const location = registry.fns.get(member)?.fn.location;
              errors.push({
                kind: 'cycle',
                fnName: member,
                message: `Comptime dependency cycle detected: ${cycleLabel}`,
                location,
              });
            }
          }
        }
      }
    }
    stack.pop();
    inStack.delete(name);
  };

  for (const name of registry.fns.keys()) dfs(name);
  return errors;
};

const topoSortComptimeFns = (registry: ComptimeFnRegistry): string[] => {
  const indegree = new Map<string, number>();
  for (const name of registry.fns.keys()) indegree.set(name, 0);
  for (const [name, entry] of registry.fns.entries()) {
    for (const dep of entry.dependencies) {
      if (dep === name) continue;
      if (!indegree.has(dep)) continue;
      indegree.set(dep, (indegree.get(dep) ?? 0) + 1);
    }
  }

  const queue: string[] = Array.from(indegree.entries())
    .filter(([, deg]) => deg === 0)
    .map(([name]) => name);
  const order: string[] = [];

  while (queue.length > 0) {
    const name = queue.shift() as string;
    order.push(name);
    const entry = registry.fns.get(name);
    for (const dep of entry?.dependencies ?? []) {
      if (dep === name || !indegree.has(dep)) continue;
      const next = (indegree.get(dep) ?? 0) - 1;
      indegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }
  return order;
};

const substituteComptimeCalls = (
  ast: LuminaProgram,
  registry: ComptimeFnRegistry,
  blocked: Set<string>,
  failures: ComptimeError[]
): { ast: LuminaProgram; substituted: number } => {
  const failureKeys = new Set<string>();
  const recordFailure = (error: ComptimeError) => {
    const key = `${error.kind}|${error.fnName}|${error.message}|${error.location?.start.line ?? 0}:${error.location?.start.column ?? 0}`;
    if (failureKeys.has(key)) return;
    failureKeys.add(key);
    failures.push(error);
  };

  const evalCallExpr = (call: LuminaCall): ComptimeResult => {
    const steps = { n: 0 };
    const env = createEnv(null, steps);
    const ctx: EvalContext = {
      registry,
      blocked,
      stack: [],
    };
    return evalExpr(call as LuminaExpr, env, ctx, call.callee.name);
  };

  const substituted = { n: 0 };

  const transformExpr = (expr: LuminaExpr): LuminaExpr => {
    const transformed: LuminaExpr = (() => {
      switch (expr.type) {
        case 'Binary':
          return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) };
        case 'Call':
          return {
            ...expr,
            receiver: expr.receiver ? transformExpr(expr.receiver) : expr.receiver,
            args: (expr.args ?? []).map((arg) => transformExpr(arg)),
          };
        case 'Member':
          return { ...expr, object: transformExpr(expr.object) };
        case 'Index':
          return { ...expr, object: transformExpr(expr.object), index: transformExpr(expr.index) };
        case 'Range':
          return {
            ...expr,
            start: expr.start ? transformExpr(expr.start) : expr.start,
            end: expr.end ? transformExpr(expr.end) : expr.end,
          };
        case 'ArrayLiteral':
        case 'TupleLiteral':
          return { ...expr, elements: expr.elements.map((item) => transformExpr(item)) };
        case 'ArrayRepeatLiteral':
          return { ...expr, value: transformExpr(expr.value), count: transformExpr(expr.count) };
        case 'StructLiteral':
          return {
            ...expr,
            fields: expr.fields.map((field: LuminaStructLiteralField) => ({ ...field, value: transformExpr(field.value) })),
          };
        case 'MatchExpr':
          return {
            ...expr,
            value: transformExpr(expr.value),
            arms: expr.arms.map((arm) => ({
              ...arm,
              guard: arm.guard ? transformExpr(arm.guard) : arm.guard,
              body: transformExpr(arm.body),
            })),
          };
        case 'SelectExpr':
          return {
            ...expr,
            arms: expr.arms.map((arm) => ({
              ...arm,
              value: transformExpr(arm.value),
              body: transformExpr(arm.body),
            })),
          };
        case 'InterpolatedString':
          return {
            ...expr,
            parts: (expr as LuminaInterpolatedString).parts.map((part) =>
              typeof part === 'string' ? part : transformExpr(part)
            ),
          };
        case 'Lambda':
          return { ...expr, body: transformBlock(expr.body) };
        case 'Try':
        case 'Await':
          return { ...expr, value: transformExpr(expr.value) };
        case 'Move':
          return {
            ...expr,
            target:
              expr.target.type === 'Identifier'
                ? expr.target
                : {
                    ...expr.target,
                    object: transformExpr(expr.target.object),
                  },
          };
        case 'Cast':
          return { ...expr, expr: transformExpr(expr.expr) };
        case 'IsExpr':
          return { ...expr, value: transformExpr(expr.value) };
        default:
          return expr;
      }
    })();

    if (transformed.type !== 'Call') return transformed;
    if (transformed.receiver || transformed.enumName) return transformed;
    if (!registry.fns.has(transformed.callee.name)) return transformed;

    const result = evalCallExpr(transformed);
    if (!result.ok) {
      recordFailure(result.error);
      return transformed;
    }
    substituted.n += 1;
    return valueToExpr(result.value, transformed.location);
  };

  const transformStmt = (stmt: LuminaStatement): LuminaStatement => {
    switch (stmt.type) {
      case 'Let':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'LetTuple':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'LetElse':
        return { ...stmt, value: transformExpr(stmt.value), elseBlock: transformBlock(stmt.elseBlock) };
      case 'Assign':
        return {
          ...stmt,
          target:
            stmt.target.type === 'Identifier'
              ? stmt.target
              : { ...stmt.target, object: transformExpr(stmt.target.object) },
          value: transformExpr(stmt.value),
        };
      case 'ExprStmt':
        return { ...stmt, expr: transformExpr(stmt.expr) };
      case 'Return':
        return { ...stmt, value: transformExpr(stmt.value) };
      case 'If':
        return {
          ...stmt,
          condition: transformExpr(stmt.condition),
          thenBlock: transformBlock(stmt.thenBlock),
          elseBlock: stmt.elseBlock ? transformBlock(stmt.elseBlock) : stmt.elseBlock,
        };
      case 'IfLet':
        return {
          ...stmt,
          value: transformExpr(stmt.value),
          thenBlock: transformBlock(stmt.thenBlock),
          elseBlock: stmt.elseBlock ? transformBlock(stmt.elseBlock) : stmt.elseBlock,
        };
      case 'While':
        return { ...stmt, condition: transformExpr(stmt.condition), body: transformBlock(stmt.body) };
      case 'WhileLet':
        return { ...stmt, value: transformExpr(stmt.value), body: transformBlock(stmt.body) };
      case 'For':
        return { ...stmt, iterable: transformExpr(stmt.iterable), body: transformBlock(stmt.body) };
      case 'MatchStmt':
        return {
          ...stmt,
          value: transformExpr(stmt.value),
          arms: stmt.arms.map((arm) => ({
            ...arm,
            guard: arm.guard ? transformExpr(arm.guard) : arm.guard,
            body: transformBlock(arm.body),
          })),
        };
      case 'Block':
        return transformBlock(stmt);
      case 'FnDecl':
        if (stmt.comptime) return stmt;
        return { ...stmt, body: transformBlock(stmt.body) };
      default:
        return stmt;
    }
  };

  const transformBlock = (block: LuminaBlock): LuminaBlock => ({
    ...block,
    body: (block.body ?? []).map((stmt) => transformStmt(stmt)),
  });

  const transformedAst: LuminaProgram = {
    ...ast,
    body: ast.body.map((stmt) => transformStmt(stmt)),
  };
  return { ast: transformedAst, substituted: substituted.n };
};

export function comptimePass(ast: LuminaProgram): ComptimePassResult {
  const registry = collectComptimeFns(ast);
  const failed: ComptimeError[] = [];
  const evaluated: string[] = [];
  const invalidFns = new Set<string>();

  for (const entry of registry.fns.values()) {
    const errors = validateComptimeFn(entry, registry);
    for (const error of errors) {
      failed.push(error);
      invalidFns.add(entry.name);
    }
  }

  const cycles = detectDependencyCycles(registry);
  for (const cycleError of cycles) {
    failed.push(cycleError);
    invalidFns.add(cycleError.fnName);
  }

  const order = topoSortComptimeFns(registry);
  for (const name of order) {
    if (invalidFns.has(name)) continue;
    const entry = registry.fns.get(name);
    if (!entry || entry.params.length > 0) continue;
    const ctx: EvalContext = {
      registry,
      blocked: invalidFns,
      stack: [],
    };
    const result = evaluateComptimeFunction(entry, [], ctx, { n: 0 }, entry.fn.location);
    if (!result.ok) {
      failed.push(result.error);
      invalidFns.add(name);
      continue;
    }
    entry.evaluated = true;
    entry.result = result.value;
    evaluated.push(name);
  }

  const substitution = substituteComptimeCalls(ast, registry, invalidFns, failed);
  const strippedBody = substitution.ast.body.filter(
    (stmt) => !(stmt.type === 'FnDecl' && stmt.comptime)
  );
  const transformed: LuminaProgram = {
    ...substitution.ast,
    body: strippedBody,
  };

  const diagnostics: Diagnostic[] = [];
  const diagKeys = new Set<string>();
  for (const error of failed) {
    const diag = toDiagnostic(error);
    const key = `${diag.code ?? 'COMPTIME'}|${diag.message}|${diag.location.start.line}:${diag.location.start.column}`;
    if (diagKeys.has(key)) continue;
    diagKeys.add(key);
    diagnostics.push(diag);
  }

  return {
    ast: transformed,
    evaluated,
    failed,
    substituted: substitution.substituted,
    diagnostics,
  };
}
