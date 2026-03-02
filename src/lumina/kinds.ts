export type Kind =
  | { kind: 'star' }
  | { kind: 'arrow'; from: Kind; to: Kind }
  | { kind: 'var'; id: number };

export type KindSubst = Map<number, Kind>;

const STAR_KIND: Kind = { kind: 'star' };
let nextKindVarId = 0;

export function starKind(): Kind {
  return STAR_KIND;
}

export function arrowKind(from: Kind, to: Kind): Kind {
  return { kind: 'arrow', from, to };
}

export function kindFromArity(arity: number): Kind {
  const safeArity = Math.max(0, Math.trunc(arity));
  let out: Kind = starKind();
  for (let i = 0; i < safeArity; i += 1) {
    out = arrowKind(starKind(), out);
  }
  return out;
}

export function formatKind(kind: Kind): string {
  switch (kind.kind) {
    case 'star':
      return '*';
    case 'var':
      return `k${kind.id}`;
    case 'arrow': {
      const from = kind.from.kind === 'arrow' ? `(${formatKind(kind.from)})` : formatKind(kind.from);
      return `${from} -> ${formatKind(kind.to)}`;
    }
    default:
      return '*';
  }
}

export function freshKindVar(): Kind {
  return { kind: 'var', id: nextKindVarId++ };
}

export function resetKindVarCounter(): void {
  nextKindVarId = 0;
}

export function pruneKind(kind: Kind, subst: KindSubst): Kind {
  if (kind.kind !== 'var') return kind;
  const replacement = subst.get(kind.id);
  if (!replacement) return kind;
  const pruned = pruneKind(replacement, subst);
  subst.set(kind.id, pruned);
  return pruned;
}

function occursInKind(target: Kind, value: Kind, subst: KindSubst): boolean {
  const t = pruneKind(target, subst);
  const v = pruneKind(value, subst);
  if (v.kind === 'var') return t.kind === 'var' && t.id === v.id;
  if (v.kind === 'arrow') {
    return occursInKind(t, v.from, subst) || occursInKind(t, v.to, subst);
  }
  return false;
}

export class KindUnificationError extends Error {
  constructor(
    message: string,
    readonly expected: Kind,
    readonly actual: Kind
  ) {
    super(message);
    this.name = 'KindUnificationError';
  }
}

export function unifyKinds(expected: Kind, actual: Kind, subst: KindSubst): void {
  const left = pruneKind(expected, subst);
  const right = pruneKind(actual, subst);

  if (left.kind === 'var') {
    if (right.kind === 'var' && left.id === right.id) return;
    if (occursInKind(left, right, subst)) {
      throw new KindUnificationError('Recursive kind', left, right);
    }
    subst.set(left.id, right);
    return;
  }

  if (right.kind === 'var') {
    if (occursInKind(right, left, subst)) {
      throw new KindUnificationError('Recursive kind', left, right);
    }
    subst.set(right.id, left);
    return;
  }

  if (left.kind === 'star' && right.kind === 'star') return;

  if (left.kind === 'arrow' && right.kind === 'arrow') {
    unifyKinds(left.from, right.from, subst);
    unifyKinds(left.to, right.to, subst);
    return;
  }

  throw new KindUnificationError(`Kind mismatch: expected ${formatKind(left)} but got ${formatKind(right)}`, left, right);
}

