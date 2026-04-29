import { TestingDocument, TestingElement } from '../src/testing-dom.js';
import {
  analyzeSequenceTransition,
  findStableSequenceWindow,
  getTransitionAffectedRange,
  reorderChildren,
  type KeyedListTransition,
} from '../src/runtime/dom-reconciler.js';
import { readChildNodes } from '../src/runtime/dom-accessibility.js';

const labels = (container: TestingElement): string[] =>
  readChildNodes(container).map((node) => (node as TestingElement).getAttribute?.('data-id') ?? '');

const child = (document: TestingDocument, id: string): TestingElement => {
  const element = document.createElement('div');
  element.setAttribute('data-id', id);
  return element;
};

describe('runtime dom reconciler helpers', () => {
  test('classifies same-order, adjacent-swap, single-move, and complex transitions', () => {
    expect(analyzeSequenceTransition([1, 2, 3], [1, 2, 3], (left, right) => left === right)).toEqual({
      kind: 'same_order',
    });

    expect(analyzeSequenceTransition([1, 2, 3], [2, 1, 3], (left, right) => left === right)).toEqual({
      kind: 'adjacent_swap',
      left: 0,
      right: 1,
    });

    expect(analyzeSequenceTransition([1, 2, 3, 4], [1, 3, 4, 2], (left, right) => left === right)).toEqual({
      kind: 'single_move',
      from: 1,
      to: 3,
    });

    expect(analyzeSequenceTransition([1, 2, 3, 4], [3, 1, 4, 2], (left, right) => left === right)).toEqual({
      kind: 'complex_reorder',
      start: 0,
      end: 3,
    });
  });

  test('classifies adjacent swaps and single moves with long stable tails', () => {
    expect(
      analyzeSequenceTransition(
        [1, 2, 3, 4, 5, 6],
        [1, 3, 2, 4, 5, 6],
        (left, right) => left === right
      )
    ).toEqual({
      kind: 'adjacent_swap',
      left: 1,
      right: 2,
    });

    expect(
      analyzeSequenceTransition(
        [1, 2, 3, 4, 5, 6],
        [1, 3, 4, 2, 5, 6],
        (left, right) => left === right
      )
    ).toEqual({
      kind: 'single_move',
      from: 1,
      to: 3,
    });
  });

  test('reports the affected range for move-focused transitions', () => {
    const adjacent: KeyedListTransition = { kind: 'adjacent_swap', left: 2, right: 3 };
    const singleMove: KeyedListTransition = { kind: 'single_move', from: 1, to: 4 };
    const complex = analyzeSequenceTransition(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['a', 'd', 'b', 'e', 'c', 'f'],
      (left, right) => left === right
    );

    expect(getTransitionAffectedRange({ kind: 'same_order' }, 5)).toBeNull();
    expect(getTransitionAffectedRange(adjacent, 5)).toEqual({ start: 2, end: 3 });
    expect(getTransitionAffectedRange(singleMove, 5)).toEqual({ start: 1, end: 4 });
    expect(complex).toEqual({ kind: 'complex_reorder', start: 1, end: 4 });
    expect(getTransitionAffectedRange(complex, 6)).toEqual({ start: 1, end: 4 });
    expect(getTransitionAffectedRange({ kind: 'complex_reorder' }, 3)).toEqual({ start: 0, end: 2 });
  });

  test('finds the unstable middle window for complex reorders with stable edges', () => {
    expect(findStableSequenceWindow(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'd', 'b', 'e', 'c', 'f'])).toEqual({
      currentStart: 1,
      currentEnd: 4,
      nextStart: 1,
      nextEnd: 4,
    });
    expect(findStableSequenceWindow(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeNull();
  });

  test('reorders adjacent siblings without disposing retained nodes', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const a = child(document, 'a');
    const b = child(document, 'b');
    const c = child(document, 'c');
    container.appendChild(a);
    container.appendChild(b);
    container.appendChild(c);

    const dispose = jest.fn();
    reorderChildren(container, [b, a, c], dispose, {
      transition: { kind: 'adjacent_swap', left: 0, right: 1 },
      structureChanged: false,
    });

    expect(labels(container)).toEqual(['b', 'a', 'c']);
    expect(dispose).not.toHaveBeenCalled();
  });

  test('disposes removed nodes when the child structure shrinks', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const a = child(document, 'a');
    const b = child(document, 'b');
    const c = child(document, 'c');
    container.appendChild(a);
    container.appendChild(b);
    container.appendChild(c);

    const dispose = jest.fn();
    reorderChildren(container, [a, c], dispose, {
      transition: { kind: 'single_move', from: 2, to: 1 },
      structureChanged: true,
    });

    expect(labels(container)).toEqual(['a', 'c']);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(b);
  });

  test('falls back to LIS-based reordering for complex order changes', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const a = child(document, 'a');
    const b = child(document, 'b');
    const c = child(document, 'c');
    const d = child(document, 'd');
    container.appendChild(a);
    container.appendChild(b);
    container.appendChild(c);
    container.appendChild(d);

    reorderChildren(container, [c, a, d, b], () => undefined, {
      transition: { kind: 'complex_reorder' },
      structureChanged: false,
    });

    expect(labels(container)).toEqual(['c', 'a', 'd', 'b']);
  });

  test('reorders only the unstable middle window for complex changes with stable edges', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const a = child(document, 'a');
    const b = child(document, 'b');
    const c = child(document, 'c');
    const d = child(document, 'd');
    const e = child(document, 'e');
    const f = child(document, 'f');
    container.appendChild(a);
    container.appendChild(b);
    container.appendChild(c);
    container.appendChild(d);
    container.appendChild(e);
    container.appendChild(f);

    const transition = analyzeSequenceTransition(
      [a, b, c, d, e, f],
      [a, d, b, e, c, f],
      (left, right) => left === right
    );

    reorderChildren(container, [a, d, b, e, c, f], () => undefined, {
      transition,
      structureChanged: false,
    });

    expect(labels(container)).toEqual(['a', 'd', 'b', 'e', 'c', 'f']);
    expect(container.childNodes[0]).toBe(a);
    expect(container.childNodes[5]).toBe(f);
  });
});
