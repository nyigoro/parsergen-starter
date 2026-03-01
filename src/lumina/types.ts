export type PrimitiveName =
  | 'int'
  | 'float'
  | 'string'
  | 'bool'
  | 'void'
  | 'any'
  | 'i8'
  | 'i16'
  | 'i32'
  | 'i64'
  | 'i128'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'usize'
  | 'f32'
  | 'f64';

const integerPrimList: PrimitiveName[] = [
  'int',
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
];

const floatPrimList: PrimitiveName[] = ['float', 'f32', 'f64'];

export const integerPrimitives = new Set<PrimitiveName>(integerPrimList);
export const floatPrimitives = new Set<PrimitiveName>(floatPrimList);
export const numericPrimitives = new Set<PrimitiveName>([...integerPrimList, ...floatPrimList]);

export function normalizePrimitiveName(name: PrimitiveName): PrimitiveName {
  if (name === 'int') return 'i32';
  if (name === 'float') return 'f64';
  if (name === 'usize') return 'u32';
  return name;
}

export function isNumericPrimitiveName(name: PrimitiveName): boolean {
  return numericPrimitives.has(name);
}

export function isIntegerPrimitiveName(name: PrimitiveName): boolean {
  return integerPrimitives.has(name);
}

export function isFloatPrimitiveName(name: PrimitiveName): boolean {
  return floatPrimitives.has(name);
}

import { type Location } from '../utils/index.js';

export type Type =
  | { kind: 'primitive'; name: PrimitiveName }
  | { kind: 'function'; args: Type[]; returnType: Type }
  | { kind: 'variable'; id: number }
  | { kind: 'adt'; name: string; params: Type[] }
  | { kind: 'row'; fields: Map<string, Type>; tail: Type | null }
  | { kind: 'hole'; location?: Location }
  | { kind: 'promise'; inner: Type };

export interface TypeScheme {
  kind: 'scheme';
  variables: number[];
  type: Type;
}

export type Subst = Map<number, Type>;

export type UnificationReason = 'mismatch' | 'arity' | 'recursive';

export interface UnificationTraceEntry {
  expected: Type;
  found: Type;
  note?: string;
  location?: { start: { line: number; column: number; offset?: number }; end: { line: number; column: number; offset?: number } };
}

export interface SourceMapping {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
  source: string;
  name?: string;
}

export class UnificationError extends Error {
  expected: Type;
  found: Type;
  reason: UnificationReason;
  trace: UnificationTraceEntry[];

  constructor(reason: UnificationReason, expected: Type, found: Type, trace: UnificationTraceEntry[] = []) {
    const message =
      reason === 'arity'
        ? 'Function arity mismatch'
        : reason === 'recursive'
          ? 'Recursive type detected'
          : 'Type mismatch';
    super(message);
    this.reason = reason;
    this.expected = expected;
    this.found = found;
    this.trace = trace;
  }
}

let nextTypeVarId = 0;

export function freshTypeVar(): Type {
  return { kind: 'variable', id: nextTypeVarId++ };
}

export function resetTypeVarCounter() {
  nextTypeVarId = 0;
}

export function promiseType(inner: Type): Type {
  return { kind: 'promise', inner };
}

export function isPromiseType(type: Type): type is { kind: 'promise'; inner: Type } {
  return type.kind === 'promise';
}

export function prune(type: Type, subst: Subst): Type {
  if (type.kind !== 'variable') return type;
  const replacement = subst.get(type.id);
  if (!replacement) return type;
  const pruned = prune(replacement, subst);
  subst.set(type.id, pruned);
  return pruned;
}

export function occursIn(target: Type, type: Type, subst: Subst): boolean {
  if (target.kind !== 'variable') return false;
  const t = prune(type, subst);
  if (t.kind === 'variable') {
    return t.id === target.id;
  }
  if (t.kind === 'function') {
    return t.args.some(arg => occursIn(target, arg, subst)) || occursIn(target, t.returnType, subst);
  }
  if (t.kind === 'promise') {
    return occursIn(target, t.inner, subst);
  }
  if (t.kind === 'adt') {
    return t.params.some(param => occursIn(target, param, subst));
  }
  if (t.kind === 'row') {
    for (const field of t.fields.values()) {
      if (occursIn(target, field, subst)) return true;
    }
    return t.tail ? occursIn(target, t.tail, subst) : false;
  }
  return false;
}

const sanitizeTypeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

export function normalizeTypeName(type: Type): string {
  switch (type.kind) {
    case 'primitive':
      return sanitizeTypeSegment(normalizePrimitiveName(type.name));
    case 'adt': {
      const base = sanitizeTypeSegment(type.name);
      if (type.params.length === 0) return base;
      const params = type.params.map(normalizeTypeName).join('_');
      return `${base}_${params}`;
    }
    case 'function': {
      const args = type.args.map(normalizeTypeName).join('_') || 'Unit';
      const ret = normalizeTypeName(type.returnType);
      return `Fn_${args}_${ret}`;
    }
    case 'promise':
      return `Promise_${normalizeTypeName(type.inner)}`;
    case 'variable':
      return `T${type.id}`;
    case 'row': {
      const fields = Array.from(type.fields.entries())
        .map(([name, value]) => `${sanitizeTypeSegment(name)}_${normalizeTypeName(value)}`)
        .join('_');
      const tail = type.tail ? normalizeTypeName(type.tail) : 'Closed';
      return `Row_${fields}_${tail}`;
    }
    case 'hole':
      return 'Hole';
    default:
      return 'Unknown';
  }
}

function occursInWithBarrier(
  target: Type,
  type: Type,
  subst: Subst,
  passedBarrier: boolean,
  wrapperSet: Set<string>
): boolean {
  if (target.kind !== 'variable') return false;
  const t = prune(type, subst);
  if (t.kind === 'variable') {
    return t.id === target.id ? !passedBarrier : false;
  }
  if (t.kind === 'function') {
    return (
      t.args.some(arg => occursInWithBarrier(target, arg, subst, passedBarrier, wrapperSet)) ||
      occursInWithBarrier(target, t.returnType, subst, passedBarrier, wrapperSet)
    );
  }
  if (t.kind === 'promise') {
    return occursInWithBarrier(target, t.inner, subst, passedBarrier, wrapperSet);
  }
  if (t.kind === 'adt') {
    const nextBarrier = passedBarrier || wrapperSet.has(t.name);
    return t.params.some(param => occursInWithBarrier(target, param, subst, nextBarrier, wrapperSet));
  }
  if (t.kind === 'row') {
    for (const field of t.fields.values()) {
      if (occursInWithBarrier(target, field, subst, passedBarrier, wrapperSet)) return true;
    }
    return t.tail ? occursInWithBarrier(target, t.tail, subst, passedBarrier, wrapperSet) : false;
  }
  return false;
}

export function unify(
  t1: Type,
  t2: Type,
  subst: Subst,
  wrapperSet?: Set<string>,
  trace: UnificationTraceEntry[] = [],
  rowResolver?: (type: Type) => Type | null
): void {
  let left = prune(t1, subst);
  let right = prune(t2, subst);
  const wrappers = wrapperSet;

  if (left.kind === 'variable') {
    if (right.kind === 'variable' && left.id === right.id) return;
    if (wrappers) {
      if (occursInWithBarrier(left, right, subst, false, wrappers)) {
        throw new UnificationError('recursive', left, right, trace);
      }
    } else if (occursIn(left, right, subst)) {
      throw new UnificationError('recursive', left, right, trace);
    }
    subst.set(left.id, right);
    return;
  }

  if (right.kind === 'variable') {
    unify(right, left, subst, wrappers, trace, rowResolver);
    return;
  }

  if (rowResolver && (left.kind === 'row' || right.kind === 'row')) {
    if (left.kind === 'adt') {
      left = rowResolver(left) ?? left;
    }
    if (right.kind === 'adt') {
      right = rowResolver(right) ?? right;
    }
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    const leftName = normalizePrimitiveName(left.name);
    const rightName = normalizePrimitiveName(right.name);
    if (leftName !== rightName) {
      throw new UnificationError('mismatch', left, right, trace);
    }
    return;
  }

  if (left.kind === 'function' && right.kind === 'function') {
    if (left.args.length !== right.args.length) {
      throw new UnificationError('arity', left, right, trace);
    }
    for (let i = 0; i < left.args.length; i++) {
      unify(left.args[i], right.args[i], subst, wrappers, trace, rowResolver);
    }
    unify(left.returnType, right.returnType, subst, wrappers, trace, rowResolver);
    return;
  }

  if (left.kind === 'promise' && right.kind === 'promise') {
    unify(left.inner, right.inner, subst, wrappers, trace, rowResolver);
    return;
  }

  if (left.kind === 'adt' && right.kind === 'adt') {
    if (left.name !== right.name || left.params.length !== right.params.length) {
      throw new UnificationError('mismatch', left, right, trace);
    }
    for (let i = 0; i < left.params.length; i++) {
      unify(left.params[i], right.params[i], subst, wrappers, trace, rowResolver);
    }
    return;
  }

  if (left.kind === 'row' && right.kind === 'row') {
    const leftFields = left.fields;
    const rightFields = right.fields;
    for (const [name, type] of leftFields) {
      const other = rightFields.get(name);
      if (other) {
        unify(type, other, subst, wrappers, trace, rowResolver);
      }
    }
    const leftExtra = new Map<string, Type>();
    for (const [name, type] of leftFields) {
      if (!rightFields.has(name)) leftExtra.set(name, type);
    }
    const rightExtra = new Map<string, Type>();
    for (const [name, type] of rightFields) {
      if (!leftFields.has(name)) rightExtra.set(name, type);
    }
    if (leftExtra.size > 0) {
      if (!right.tail) {
        throw new UnificationError('mismatch', left, right, trace);
      }
      const freshTail = freshTypeVar();
      unify(right.tail, { kind: 'row', fields: leftExtra, tail: freshTail }, subst, wrappers, trace, rowResolver);
    }
    if (rightExtra.size > 0) {
      if (!left.tail) {
        throw new UnificationError('mismatch', left, right, trace);
      }
      const freshTail = freshTypeVar();
      unify(left.tail, { kind: 'row', fields: rightExtra, tail: freshTail }, subst, wrappers, trace, rowResolver);
    }
    if (left.tail && right.tail) {
      unify(left.tail, right.tail, subst, wrappers, trace, rowResolver);
    } else if (leftExtra.size === 0 && rightExtra.size === 0) {
      if (left.tail && !right.tail) {
        unify(left.tail, { kind: 'row', fields: new Map(), tail: null }, subst, wrappers, trace, rowResolver);
      } else if (!left.tail && right.tail) {
        unify(right.tail, { kind: 'row', fields: new Map(), tail: null }, subst, wrappers, trace, rowResolver);
      }
    }
    return;
  }

  throw new UnificationError('mismatch', left, right, trace);
}

export function freeTypeVars(type: Type, subst: Subst, acc = new Set<number>()): Set<number> {
  const t = prune(type, subst);
  if (t.kind === 'variable') {
    acc.add(t.id);
    return acc;
  }
  if (t.kind === 'function') {
    t.args.forEach(arg => freeTypeVars(arg, subst, acc));
    freeTypeVars(t.returnType, subst, acc);
    return acc;
  }
  if (t.kind === 'promise') {
    freeTypeVars(t.inner, subst, acc);
    return acc;
  }
  if (t.kind === 'adt') {
    t.params.forEach(param => freeTypeVars(param, subst, acc));
    return acc;
  }
  if (t.kind === 'row') {
    for (const field of t.fields.values()) {
      freeTypeVars(field, subst, acc);
    }
    if (t.tail) {
      freeTypeVars(t.tail, subst, acc);
    }
  }
  return acc;
}

export function generalize(type: Type, subst: Subst, bound: Set<number>): TypeScheme {
  const free = freeTypeVars(type, subst);
  const vars = Array.from(free).filter(id => !bound.has(id));
  return { kind: 'scheme', variables: vars, type: prune(type, subst) };
}
