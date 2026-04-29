import { readChildNodes, type AccessibleDomNodeLike } from './dom-accessibility.js';

export type KeyedListTransition =
  | { kind: 'same_order' }
  | { kind: 'adjacent_swap'; left: number; right: number }
  | { kind: 'single_move'; from: number; to: number }
  | { kind: 'complex_reorder'; start?: number; end?: number };

export interface ReorderableDomNodeLike extends AccessibleDomNodeLike {
  textContent: string | null;
  childNodes: ArrayLike<ReorderableDomNodeLike> & Iterable<ReorderableDomNodeLike>;
  parentNode: ReorderableDomNodeLike | null;
  appendChild(node: ReorderableDomNodeLike): ReorderableDomNodeLike;
  insertBefore?(node: ReorderableDomNodeLike, referenceNode: ReorderableDomNodeLike | null): ReorderableDomNodeLike;
  removeChild(node: ReorderableDomNodeLike): ReorderableDomNodeLike;
}

const setChildren = <TNode extends ReorderableDomNodeLike>(container: TNode, children: TNode[]): void => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child as TNode);
  }
  for (const child of children) {
    container.appendChild(child);
  }
};

export const findStableSequenceWindow = <TNode>(
  currentChildren: TNode[],
  nextChildren: TNode[],
  equals: (left: TNode, right: TNode) => boolean = (left, right) => left === right
): { currentStart: number; currentEnd: number; nextStart: number; nextEnd: number } | null => {
  let currentStart = 0;
  let nextStart = 0;

  while (
    currentStart < currentChildren.length
    && nextStart < nextChildren.length
    && equals(currentChildren[currentStart] as TNode, nextChildren[nextStart] as TNode)
  ) {
    currentStart += 1;
    nextStart += 1;
  }

  let currentEnd = currentChildren.length - 1;
  let nextEnd = nextChildren.length - 1;
  while (
    currentEnd >= currentStart
    && nextEnd >= nextStart
    && equals(currentChildren[currentEnd] as TNode, nextChildren[nextEnd] as TNode)
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  if (currentStart > currentEnd && nextStart > nextEnd) {
    return null;
  }

  return { currentStart, currentEnd, nextStart, nextEnd };
};

export const getTransitionAffectedRange = (
  transition: KeyedListTransition,
  length: number
): { start: number; end: number } | null => {
  switch (transition.kind) {
    case 'same_order':
      return null;
    case 'adjacent_swap':
      return { start: transition.left, end: transition.right };
    case 'single_move':
      return {
        start: Math.min(transition.from, transition.to),
        end: Math.max(transition.from, transition.to),
      };
    case 'complex_reorder':
      if (typeof transition.start === 'number' && typeof transition.end === 'number') {
        return { start: transition.start, end: transition.end };
      }
      return length > 0 ? { start: 0, end: length - 1 } : null;
  }
};

const findSingleMove = <T>(
  previous: T[],
  next: T[],
  equals: (left: T, right: T) => boolean,
  first: number,
  last: number
): { from: number; to: number } | null => {
  if (previous.length !== next.length || previous.length < 2 || last <= first) {
    return null;
  }

  for (let from = first + 1; from <= last; from += 1) {
    if (!equals(previous[from], next[first])) continue;
    let matches = true;
    for (let index = first; index < from; index += 1) {
      if (!equals(previous[index], next[index + 1])) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    for (let index = from + 1; index <= last; index += 1) {
      if (!equals(previous[index], next[index])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { from, to: first };
    }
  }

  for (let to = first + 1; to <= last; to += 1) {
    if (!equals(previous[first], next[to])) continue;
    let matches = true;
    for (let index = first + 1; index <= to; index += 1) {
      if (!equals(previous[index], next[index - 1])) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    for (let index = to + 1; index <= last; index += 1) {
      if (!equals(previous[index], next[index])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { from: first, to };
    }
  }

  return null;
};

export const analyzeSequenceTransition = <T>(
  previous: T[],
  next: T[],
  equals: (left: T, right: T) => boolean
): KeyedListTransition => {
  if (previous.length !== next.length) {
    return { kind: 'complex_reorder' };
  }

  let firstMismatch = -1;
  for (let index = 0; index < previous.length; index += 1) {
    if (!equals(previous[index], next[index])) {
      firstMismatch = index;
      break;
    }
  }
  if (firstMismatch < 0) {
    return { kind: 'same_order' };
  }

  let lastMismatch = previous.length - 1;
  while (lastMismatch > firstMismatch && equals(previous[lastMismatch], next[lastMismatch])) {
    lastMismatch -= 1;
  }

  if (previous.length >= 2) {
    const left = firstMismatch;
    const right = left + 1;
    if (
      right <= lastMismatch
      && equals(previous[left], next[right])
      && equals(previous[right], next[left])
    ) {
      let restMatches = true;
      for (let index = right + 1; index <= lastMismatch; index += 1) {
        if (!equals(previous[index], next[index])) {
          restMatches = false;
          break;
        }
      }
      if (restMatches) {
        return { kind: 'adjacent_swap', left, right };
      }
    }
  }

  const singleMove = findSingleMove(previous, next, equals, firstMismatch, lastMismatch);
  if (singleMove) {
    return { kind: 'single_move', from: singleMove.from, to: singleMove.to };
  }

  return { kind: 'complex_reorder', start: firstMismatch, end: lastMismatch };
};

export const analyzeDomChildTransition = <TNode>(
  currentChildren: TNode[],
  nextChildren: TNode[]
): KeyedListTransition => analyzeSequenceTransition(currentChildren, nextChildren, (left, right) => left === right);

const longestIncreasingSubsequenceIndices = (values: number[]): number[] => {
  const predecessors = new Array<number>(values.length).fill(-1);
  const tails: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value < 0) continue;

    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (values[tails[mid]] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    if (low > 0) {
      predecessors[index] = tails[low - 1];
    }

    if (low === tails.length) {
      tails.push(index);
    } else {
      tails[low] = index;
    }
  }

  if (tails.length === 0) return [];

  const result = new Array<number>(tails.length);
  let cursor = tails[tails.length - 1];
  for (let index = tails.length - 1; index >= 0; index -= 1) {
    result[index] = cursor;
    cursor = predecessors[cursor];
  }
  return result;
};

const resolveComplexTransitionWindow = (
  transition: KeyedListTransition,
  currentLength: number,
  nextLength: number
): { currentStart: number; currentEnd: number; nextStart: number; nextEnd: number } | null => {
  if (
    transition.kind !== 'complex_reorder'
    || typeof transition.start !== 'number'
    || typeof transition.end !== 'number'
    || currentLength !== nextLength
    || transition.start < 0
    || transition.end < transition.start
    || transition.end >= currentLength
  ) {
    return null;
  }

  return {
    currentStart: transition.start,
    currentEnd: transition.end,
    nextStart: transition.start,
    nextEnd: transition.end,
  };
};

export const reorderChildren = <TNode extends ReorderableDomNodeLike>(
  container: TNode,
  children: TNode[],
  disposeChild: (node: TNode) => void,
  options?: { transition?: KeyedListTransition | null; structureChanged?: boolean }
): void => {
  if (typeof container.insertBefore !== 'function') {
    setChildren(container, children);
    return;
  }

  const structureChanged = options?.structureChanged ?? true;
  let currentChildren = readChildNodes(container) as TNode[];
  if (structureChanged) {
    const desired = new Set(children);
    currentChildren = currentChildren.filter((child) => {
      if (desired.has(child as TNode)) {
        return true;
      }
      disposeChild(child as TNode);
      container.removeChild(child as TNode);
      return false;
    });
  }

  const transition = options?.transition ?? analyzeDomChildTransition(currentChildren, children);
  if (transition.kind === 'same_order') {
    return;
  }
  if (transition.kind === 'adjacent_swap') {
    container.insertBefore(children[transition.left], children[transition.right]);
    return;
  }
  if (transition.kind === 'single_move') {
    const moving = currentChildren[transition.from];
    if (!moving) return;
    const reference =
      transition.from < transition.to
        ? (currentChildren[transition.to + 1] ?? null)
        : (currentChildren[transition.to] ?? null);
    container.insertBefore(moving, reference);
    return;
  }

  const window =
    resolveComplexTransitionWindow(transition, currentChildren.length, children.length)
    ?? findStableSequenceWindow(currentChildren, children);
  if (!window) {
    return;
  }

  const {
    currentStart,
    currentEnd,
    nextStart,
    nextEnd,
  } = window;

  const currentWindow = currentChildren.slice(currentStart, currentEnd + 1);
  const nextWindow = children.slice(nextStart, nextEnd + 1);
  const currentOrder = new Map<TNode, number>();
  currentWindow.forEach((child, index) => {
    currentOrder.set(child, index);
  });

  const sequence = nextWindow.map((child) => currentOrder.get(child) ?? -1);
  const keepIndices = longestIncreasingSubsequenceIndices(sequence);
  const keepMarks = new Array<boolean>(nextWindow.length).fill(false);
  for (const index of keepIndices) {
    keepMarks[index] = true;
  }

  let anchor = (children[nextEnd + 1] as TNode | undefined) ?? null;
  for (let localIndex = nextWindow.length - 1; localIndex >= 0; localIndex -= 1) {
    const nextChild = nextWindow[localIndex];
    const currentIndex = sequence[localIndex];
    if (currentIndex >= 0 && keepMarks[localIndex]) {
      anchor = nextChild;
      continue;
    }
    container.insertBefore(nextChild, anchor);
    anchor = nextChild;
  }
};
