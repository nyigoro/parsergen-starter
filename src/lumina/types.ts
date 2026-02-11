export type PrimitiveName = 'int' | 'float' | 'string' | 'bool' | 'void' | 'any';

export type Type =
  | { kind: 'primitive'; name: PrimitiveName }
  | { kind: 'function'; args: Type[]; returnType: Type }
  | { kind: 'variable'; id: number }
  | { kind: 'adt'; name: string; params: Type[] };

export interface TypeScheme {
  kind: 'scheme';
  variables: number[];
  type: Type;
}

export type Subst = Map<number, Type>;

let nextTypeVarId = 0;

export function freshTypeVar(): Type {
  return { kind: 'variable', id: nextTypeVarId++ };
}

export function resetTypeVarCounter() {
  nextTypeVarId = 0;
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
  if (t.kind === 'adt') {
    return t.params.some(param => occursIn(target, param, subst));
  }
  return false;
}

export function unify(t1: Type, t2: Type, subst: Subst): void {
  const left = prune(t1, subst);
  const right = prune(t2, subst);

  if (left.kind === 'variable') {
    if (right.kind === 'variable' && left.id === right.id) return;
    if (occursIn(left, right, subst)) {
      throw new Error('Recursive type detected');
    }
    subst.set(left.id, right);
    return;
  }

  if (right.kind === 'variable') {
    unify(right, left, subst);
    return;
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    if (left.name !== right.name) {
      throw new Error(`Type mismatch: ${left.name} vs ${right.name}`);
    }
    return;
  }

  if (left.kind === 'function' && right.kind === 'function') {
    if (left.args.length !== right.args.length) {
      throw new Error('Function arity mismatch');
    }
    for (let i = 0; i < left.args.length; i++) {
      unify(left.args[i], right.args[i], subst);
    }
    unify(left.returnType, right.returnType, subst);
    return;
  }

  if (left.kind === 'adt' && right.kind === 'adt') {
    if (left.name !== right.name || left.params.length !== right.params.length) {
      throw new Error(`Type mismatch: ${left.name} vs ${right.name}`);
    }
    for (let i = 0; i < left.params.length; i++) {
      unify(left.params[i], right.params[i], subst);
    }
    return;
  }

  throw new Error(`Type mismatch: ${left.kind} vs ${right.kind}`);
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
  if (t.kind === 'adt') {
    t.params.forEach(param => freeTypeVars(param, subst, acc));
  }
  return acc;
}

export function generalize(type: Type, subst: Subst, bound: Set<number>): TypeScheme {
  const free = freeTypeVars(type, subst);
  const vars = Array.from(free).filter(id => !bound.has(id));
  return { kind: 'scheme', variables: vars, type: prune(type, subst) };
}
