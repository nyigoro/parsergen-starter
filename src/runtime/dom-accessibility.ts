export interface AccessibleDomNodeLike {
  childNodes?: ArrayLike<AccessibleDomNodeLike> | Iterable<AccessibleDomNodeLike>;
  textContent?: string | null;
  parentNode?: AccessibleDomNodeLike | null;
}

export interface AccessibleDomElementLike extends AccessibleDomNodeLike {
  tagName?: string;
  hidden?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  ownerDocument?: { activeElement?: unknown };
  focus?: () => void;
  getAttribute?: (name: string) => string | null;
  attributes?: { get?: (key: string) => unknown };
}

type KeyboardEventLike = {
  key?: unknown;
  shiftKey?: unknown;
  currentTarget?: unknown;
  target?: unknown;
  preventDefault?: () => void;
};

const elementRecord = (element: AccessibleDomElementLike): Record<string, unknown> =>
  element as unknown as Record<string, unknown>;

export const readChildNodes = <T extends AccessibleDomNodeLike>(
  node: { childNodes?: ArrayLike<T> | Iterable<T> } | null | undefined
): T[] => Array.from(node?.childNodes ?? []);

export const getDomAttribute = (element: AccessibleDomElementLike, name: string): string | null => {
  if (typeof element.getAttribute === 'function') {
    const value = element.getAttribute(name);
    return value == null ? null : String(value);
  }

  const attributes = element.attributes;
  if (attributes && typeof attributes.get === 'function') {
    const value = attributes.get(name);
    return value == null ? null : String(value);
  }

  const value = elementRecord(element)[name];
  return value == null ? null : String(value);
};

export const findDomElementById = <T extends AccessibleDomElementLike>(
  root: AccessibleDomNodeLike | null | undefined,
  id: string
): T | null => {
  if (!root) return null;
  for (const child of readChildNodes(root)) {
    const element = child as T;
    if (getDomAttribute(element, 'id') === id) {
      return element;
    }
    const nested = findDomElementById<T>(child, id);
    if (nested) return nested;
  }
  return null;
};

export const isElementHidden = (element: AccessibleDomElementLike): boolean =>
  elementRecord(element).hidden === true || getDomAttribute(element, 'hidden') !== null;

export const isElementDisabled = (element: AccessibleDomElementLike): boolean =>
  elementRecord(element).disabled === true || getDomAttribute(element, 'disabled') !== null;

export const getElementTabIndex = (element: AccessibleDomElementLike): number | null => {
  const raw = elementRecord(element).tabIndex ?? getDomAttribute(element, 'tabIndex') ?? getDomAttribute(element, 'tabindex');
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isFocusableElement = (element: AccessibleDomElementLike): boolean => {
  if (isElementHidden(element) || isElementDisabled(element)) return false;

  const tabIndex = getElementTabIndex(element);
  if (tabIndex !== null) {
    return tabIndex >= 0;
  }

  const tag = String(element.tagName ?? '').toLowerCase();
  if (tag === 'a') {
    return getDomAttribute(element, 'href') !== null;
  }

  return tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea';
};

export const collectFocusableDescendants = <T extends AccessibleDomElementLike>(root: AccessibleDomNodeLike): T[] => {
  const focusable: T[] = [];
  const visit = (node: AccessibleDomNodeLike): void => {
    for (const child of readChildNodes(node)) {
      const element = child as T;
      if (typeof element.focus === 'function' && isFocusableElement(element)) {
        focusable.push(element);
      }
      if (readChildNodes(child).length > 0) {
        visit(child);
      }
    }
  };
  visit(root);
  return focusable;
};

export const getFocusTargetFromEvent = <T extends { focus?: () => void } = { focus?: () => void }>(
  event: unknown
): T | null => {
  if (!event || typeof event !== 'object') return null;
  const target = (event as { currentTarget?: unknown; target?: unknown }).currentTarget
    ?? (event as { target?: unknown }).target;
  return target && typeof target === 'object' ? (target as T) : null;
};

export const trapDialogTabNavigation = (event: KeyboardEventLike | undefined): boolean => {
  if (String(event?.key ?? '') !== 'Tab') return false;

  const container = getFocusTargetFromEvent(event) as AccessibleDomElementLike | null;
  if (!container) return false;

  const focusable = collectFocusableDescendants(container);
  if (focusable.length === 0) {
    event?.preventDefault?.();
    container.focus?.();
    return true;
  }

  const active = container.ownerDocument?.activeElement ?? null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isShift = Boolean(event?.shiftKey);

  if (isShift) {
    if (active === container || active === first || !focusable.includes(active as AccessibleDomElementLike)) {
      event?.preventDefault?.();
      last.focus?.();
      return true;
    }
    return false;
  }

  if (active === container || active === last || !focusable.includes(active as AccessibleDomElementLike)) {
    event?.preventDefault?.();
    first.focus?.();
    return true;
  }

  return false;
};
