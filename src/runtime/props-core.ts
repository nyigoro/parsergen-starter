import { Signal } from './reactive-core.js';

const isEventProp = (name: string): boolean => /^on[A-Z]/.test(name);

const mergeClassValues = (left: unknown, right: unknown): unknown => {
  const tokens = [left, right]
    .flatMap((value) => (typeof value === 'string' ? value.split(/\s+/) : []))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return right ?? left;
  return Array.from(new Set(tokens)).join(' ');
};

const mergeStyleValues = (left: unknown, right: unknown): unknown => {
  if (typeof left === 'string' && typeof right === 'string') {
    const parts = [left, right]
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return parts.join(parts.length > 1 ? ';' : '');
  }

  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    return {
      ...(left as Record<string, unknown>),
      ...(right as Record<string, unknown>),
    };
  }

  return right ?? left;
};

const preventDefaultIfNeeded = (args: unknown[]): void => {
  const event = args[0] as { preventDefault?: () => void } | undefined;
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
};

export const composeHandlers = <Args extends unknown[]>(
  left: ((...args: Args) => unknown) | null | undefined,
  right: ((...args: Args) => unknown) | null | undefined
): ((...args: Args) => unknown) | undefined => {
  if (typeof left !== 'function') return typeof right === 'function' ? right : undefined;
  if (typeof right !== 'function') return left;

  return (...args: Args) => {
    const leftResult = left(...args);
    if (leftResult === false) {
      preventDefaultIfNeeded(args);
    }

    const rightResult = right(...args);
    if (rightResult === false) {
      preventDefaultIfNeeded(args);
    }

    return rightResult === undefined ? leftResult : rightResult;
  };
};

const mergePropValue = (name: string, left: unknown, right: unknown): unknown => {
  if (right === undefined) return left;
  if (left === undefined) return right;

  if (name === 'class' || name === 'className') {
    return mergeClassValues(left, right);
  }

  if (name === 'style') {
    return mergeStyleValues(left, right);
  }

  if (isEventProp(name) && typeof left === 'function' && typeof right === 'function') {
    return composeHandlers(
      left as (...args: unknown[]) => unknown,
      right as (...args: unknown[]) => unknown
    );
  }

  return right;
};

export const mergeProps = (left: unknown, right: unknown): Record<string, unknown> => {
  const lhs = left && typeof left === 'object' ? (left as Record<string, unknown>) : {};
  const rhs = right && typeof right === 'object' ? (right as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(lhs), ...Object.keys(rhs)])) {
    const value = mergePropValue(key, lhs[key], rhs[key]);
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
};

export const normalizeAuthoringPropName = (name: string): string => {
  if (name === 'class') return 'className';
  if (name.startsWith('data_')) return `data-${name.slice(5).replace(/_/g, '-')}`;
  if (name.startsWith('aria_')) return `aria-${name.slice(5).replace(/_/g, '-')}`;
  if (name.startsWith('on_')) {
    const eventName = name
      .slice(3)
      .replace(/_([a-zA-Z0-9])/g, (_match, ch: string) => ch.toUpperCase());
    return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
  }
  return name.replace(/_([a-zA-Z0-9])/g, (_match, ch: string) => ch.toUpperCase());
};

export const propsAttr = (name: string, value: unknown): Record<string, unknown> => ({
  [normalizeAuthoringPropName(name)]: value,
});

export const propsWhen = (condition: unknown, props: unknown): Record<string, unknown> => {
  const resolved = condition instanceof Signal ? condition.get() : condition;
  return resolved ? mergeProps({}, props) : {};
};

export const propsEmpty = (): Record<string, unknown> => ({});
export const propsClass = (className: string): Record<string, unknown> => ({ className });
export const propsId = (id: string): Record<string, unknown> => ({ id });
export const propsStyle = (style: string): Record<string, unknown> => ({ style });
export const propsValue = (value: string): Record<string, unknown> => ({ value });
export const propsChecked = (checked: boolean): Record<string, unknown> => ({ checked });
export const propsType = (type: string): Record<string, unknown> => ({ type });
export const propsName = (name: string): Record<string, unknown> => ({ name });
export const propsPlaceholder = (placeholder: string): Record<string, unknown> => ({ placeholder });
export const propsHref = (href: string): Record<string, unknown> => ({ href });
export const propsDisabled = (disabled: boolean): Record<string, unknown> => ({ disabled });
export const propsKey = (key: unknown): Record<string, unknown> => {
  if (typeof key !== 'string' && typeof key !== 'number') {
    throw new Error('props_key key must be a string or number');
  }
  return { key };
};

export const propsOnClick = (handler: (() => unknown) | null | undefined): Record<string, unknown> => ({
  onClick: (event?: Event) => {
    if (typeof handler !== 'function') return undefined;
    const outcome = handler();
    if (outcome === false && event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    return outcome;
  },
});

export const propsOnClickDelta = (signal: Signal<number>, delta: number): Record<string, unknown> => ({
  onClick: () => {
    signal.set(signal.get() + delta);
  },
});

export const propsOnClickInc = (signal: Signal<number>): Record<string, unknown> => ({
  onClick: () => {
    signal.set(signal.get() + 1);
  },
});

export const propsOnClickDec = (signal: Signal<number>): Record<string, unknown> => ({
  onClick: () => {
    signal.set(signal.get() - 1);
  },
});

export const propsOnInput = (handler: (value: string) => unknown): Record<string, unknown> => ({
  onInput: (event: Event) => handler(((event.target as HTMLInputElement | null)?.value ?? '')),
});

export const propsOnChange = (handler: (value: string) => unknown): Record<string, unknown> => ({
  onChange: (event: Event) => handler(((event.target as HTMLInputElement | null)?.value ?? '')),
});

export const propsOnCheckedChange = (handler: (checked: boolean) => unknown): Record<string, unknown> => ({
  onChange: (event: Event) => handler(!!((event.target as HTMLInputElement | null)?.checked)),
});

export const propsOnSubmit = (handler: (() => unknown) | null | undefined): Record<string, unknown> => ({
  onSubmit: (event?: Event) => {
    event?.preventDefault?.();
    if (typeof handler !== 'function') return undefined;
    const outcome = handler();
    if (
      outcome &&
      (typeof outcome === 'object' || typeof outcome === 'function') &&
      typeof (outcome as { then?: unknown }).then === 'function'
    ) {
      (outcome as PromiseLike<unknown>).then(undefined, () => undefined);
    }
    return outcome;
  },
});
