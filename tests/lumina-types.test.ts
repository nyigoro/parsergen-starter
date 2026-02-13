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

  test('rejects recursive types without a wrapper barrier', () => {
    resetTypeVarCounter();
    const subst = new Map<number, Type>();
    const t1 = freshTypeVar();
    const recursive: Type = { kind: 'adt', name: 'Task', params: [t1] };
    expect(() => unify(t1, recursive, subst, new Set(['Option']))).toThrow('Recursive type detected');
  });

  test('allows recursive types through wrapper barrier', () => {
    resetTypeVarCounter();
    const subst = new Map<number, Type>();
    const t1 = freshTypeVar();
    const wrapped: Type = { kind: 'adt', name: 'Option', params: [t1] };
    expect(() => unify(t1, wrapped, subst, new Set(['Option']))).not.toThrow();
  });

  test('unifies open row with extra fields on the other side', () => {
    const subst = new Map<number, Type>();
    const openTail = freshTypeVar();
    const rowOpen: Type = {
      kind: 'row',
      fields: new Map([['id', { kind: 'primitive', name: 'int' }]]),
      tail: openTail,
    };
    const rowClosed: Type = {
      kind: 'row',
      fields: new Map([
        ['id', { kind: 'primitive', name: 'int' }],
        ['name', { kind: 'primitive', name: 'string' }],
      ]),
      tail: null,
    };
    expect(() => unify(rowOpen, rowClosed, subst)).not.toThrow();
  });

  test('rejects closed row mismatch with missing fields', () => {
    const subst = new Map<number, Type>();
    const rowA: Type = {
      kind: 'row',
      fields: new Map([['id', { kind: 'primitive', name: 'int' }]]),
      tail: null,
    };
    const rowB: Type = {
      kind: 'row',
      fields: new Map([['name', { kind: 'primitive', name: 'string' }]]),
      tail: null,
    };
    expect(() => unify(rowA, rowB, subst)).toThrow('Type mismatch');
  });

  test('rejects row field type mismatch', () => {
    const subst = new Map<number, Type>();
    const rowA: Type = {
      kind: 'row',
      fields: new Map([['id', { kind: 'primitive', name: 'int' }]]),
      tail: freshTypeVar(),
    };
    const rowB: Type = {
      kind: 'row',
      fields: new Map([['id', { kind: 'primitive', name: 'string' }]]),
      tail: freshTypeVar(),
    };
    expect(() => unify(rowA, rowB, subst)).toThrow('Type mismatch');
  });
});
