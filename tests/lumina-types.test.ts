import { unify, freshTypeVar, resetTypeVarCounter, type Type } from '../src/lumina/types';

describe('Lumina HM types', () => {
  test('unifies primitive types', () => {
    const subst = new Map<number, Type>();
    unify({ kind: 'primitive', name: 'int' }, { kind: 'primitive', name: 'int' }, subst);
    expect(subst.size).toBe(0);
  });

  test('unifies type variables', () => {
    resetTypeVarCounter();
    const subst = new Map<number, Type>();
    const t1 = freshTypeVar();
    const t2 = { kind: 'primitive', name: 'string' } as Type;
    unify(t1, t2, subst);
    expect(subst.size).toBe(1);
  });

  test('unifies function types', () => {
    const subst = new Map<number, Type>();
    const fn1: Type = {
      kind: 'function',
      args: [{ kind: 'primitive', name: 'int' }],
      returnType: { kind: 'primitive', name: 'int' },
    };
    const fn2: Type = {
      kind: 'function',
      args: [{ kind: 'primitive', name: 'int' }],
      returnType: { kind: 'primitive', name: 'int' },
    };
    unify(fn1, fn2, subst);
    expect(subst.size).toBe(0);
  });
});
