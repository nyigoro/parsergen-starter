import { createContextToken } from '../frame-manager.js';
import {
  findDomElementById,
  type AccessibleDomElementLike,
  type AccessibleDomNodeLike,
} from './dom-accessibility.js';
import { Signal } from './reactive-core.js';

export interface TabsContextValue {
  value: Signal<string>;
  baseId: string;
  order: string[];
}

export interface DialogContextValue {
  open: Signal<boolean>;
  baseId: string;
  hasTitle: boolean;
  hasDescription: boolean;
}

export interface PopoverContextValue {
  open: Signal<boolean>;
  baseId: string;
}

export interface TooltipContextValue {
  open: Signal<boolean>;
  baseId: string;
}

export interface ToastContextValue {
  open: Signal<boolean>;
  baseId: string;
  hasTitle: boolean;
  hasDescription: boolean;
}

export interface MenuContextValue {
  open: Signal<boolean>;
  baseId: string;
  order: string[];
}

export interface CheckboxContextValue {
  checked: Signal<boolean>;
  baseId: string;
}

export interface RadioGroupContextValue {
  value: Signal<string>;
  baseId: string;
  order: string[];
}

export interface RadioItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

export interface SelectContextValue {
  open: Signal<boolean>;
  value: Signal<string>;
  baseId: string;
  order: string[];
}

export interface SelectItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

export interface ComboboxContextValue {
  open: Signal<boolean>;
  value: Signal<string>;
  query: Signal<string>;
  baseId: string;
  order: string[];
}

export interface ComboboxItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
  active: boolean;
}

export interface MultiselectContextValue {
  open: Signal<boolean>;
  values: Signal<string[]>;
  baseId: string;
  order: string[];
}

export interface MultiselectItemContextValue {
  value: string;
  itemId: string;
  selected: boolean;
}

export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
export type PopoverAlign = 'start' | 'center' | 'end';

type FocusTargetLike = { focus?: () => void };
type LookupDocumentLike = { getElementById?: (id: string) => AccessibleDomElementLike | null };
type AnchorRectLike = Partial<AnchorRect> | null | undefined;
type AnchorElementLike = AccessibleDomElementLike & { getBoundingClientRect?: () => AnchorRectLike };
type TypeaheadState = { buffer: string; resetHandle: unknown };
type TypeaheadLabels = Map<string, string>;

const createSignalBaseIdResolver = <T>(prefix: string) => {
  const ids = new WeakMap<object, string>();
  let nextId = 1;

  return (signal: Signal<T>): string => {
    const key = signal as object;
    const existing = ids.get(key);
    if (existing) return existing;
    const next = `${prefix}-${nextId++}`;
    ids.set(key, next);
    return next;
  };
};

const registerOrderedValue = (order: string[], value: string): void => {
  if (!order.includes(value)) {
    order.push(value);
  }
};

const getTypeaheadLabels = (labelsMap: WeakMap<object, TypeaheadLabels>, keyObject: object): TypeaheadLabels => {
  const existing = labelsMap.get(keyObject);
  if (existing) return existing;
  const created = new Map<string, string>();
  labelsMap.set(keyObject, created);
  return created;
};

const registerTypeaheadLabel = (
  labelsMap: WeakMap<object, TypeaheadLabels>,
  keyObject: object,
  value: string,
  label: string | null | undefined
): void => {
  const normalized = String(label ?? '').trim();
  if (!normalized) return;
  getTypeaheadLabels(labelsMap, keyObject).set(value, normalized);
};

const getWrappedNavigationTarget = (
  order: string[],
  current: string,
  key: string,
  forwardKeys: readonly string[],
  backwardKeys: readonly string[]
): string | null => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));

  if (key === 'Home') {
    return order[0] ?? null;
  }
  if (key === 'End') {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key)) {
    return order[(currentIndex + 1) % order.length] ?? null;
  }
  if (backwardKeys.includes(key)) {
    return order[(currentIndex - 1 + order.length) % order.length] ?? null;
  }
  return null;
};

const getClampedNavigationTarget = (
  order: string[],
  current: string,
  key: string,
  forwardKeys: readonly string[],
  backwardKeys: readonly string[]
): string | null => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));

  if (key === 'Home') {
    return order[0] ?? null;
  }
  if (key === 'End') {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key)) {
    return order[Math.min(currentIndex + 1, order.length - 1)] ?? null;
  }
  if (backwardKeys.includes(key)) {
    return order[Math.max(currentIndex - 1, 0)] ?? null;
  }
  return null;
};

const restoreFocusFromMap = <TContext extends { open: Signal<boolean> }>(
  ctx: TContext,
  targets: WeakMap<object, FocusTargetLike>
): void => {
  const key = ctx.open as object;
  const target = targets.get(key);
  if (!target || typeof target.focus !== 'function') return;
  targets.delete(key);
  target.focus();
};

const setMapTarget = <TContext extends { open: Signal<boolean> }, TValue>(
  ctx: TContext,
  map: WeakMap<object, TValue>,
  value: TValue | null | undefined
): void => {
  const key = ctx.open as object;
  if (value == null) {
    map.delete(key);
    return;
  }
  map.set(key, value);
};

const focusElementById = (
  documentLike: LookupDocumentLike | null | undefined,
  targetId: string,
  fallbackRoot?: AccessibleDomNodeLike | null
): boolean => {
  const target = (documentLike && typeof documentLike.getElementById === 'function'
    ? documentLike.getElementById(targetId)
    : null) ?? findDomElementById<AccessibleDomElementLike>(fallbackRoot, targetId);
  if (!target || typeof target.focus !== 'function') return false;
  target.focus();
  return true;
};

const readNumericRectValue = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const readAnchorRect = <TContext extends { open: Signal<boolean> }>(
  ctx: TContext,
  anchors: WeakMap<object, AnchorElementLike>
): AnchorRect | null => {
  const anchor = anchors.get(ctx.open as object);
  if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};

const clearTimerHandle = (handle: unknown): void => {
  if (handle !== undefined && typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(handle as Parameters<typeof globalThis.clearTimeout>[0]);
  }
};

const TYPEAHEAD_RESET_MS = 700;

const isPrintableTypeaheadKey = (key: string): boolean => key.length === 1 && key.trim().length > 0;

const updateTypeaheadBuffer = (state: TypeaheadState | undefined, key: string): TypeaheadState => {
  const normalizedKey = key.toLowerCase();
  const previous = state?.buffer ?? '';
  const nextRaw = `${previous}${normalizedKey}`;
  const repeated = new Set(nextRaw).size === 1 ? normalizedKey : nextRaw;
  clearTimerHandle(state?.resetHandle);
  const nextState: TypeaheadState = {
    buffer: repeated,
    resetHandle: undefined,
  };
  nextState.resetHandle =
    typeof globalThis.setTimeout === 'function'
      ? globalThis.setTimeout(() => {
          nextState.buffer = '';
          nextState.resetHandle = undefined;
        }, TYPEAHEAD_RESET_MS)
      : undefined;
  return nextState;
};

const getTypeaheadTarget = (
  stateMap: WeakMap<object, TypeaheadState>,
  keyObject: object,
  order: string[],
  labels: TypeaheadLabels | undefined,
  current: string,
  key: string
): string | null => {
  if (!isPrintableTypeaheadKey(key) || order.length === 0) return null;
  const nextState = updateTypeaheadBuffer(stateMap.get(keyObject), key);
  stateMap.set(keyObject, nextState);
  const needle = nextState.buffer;
  const currentIndex = order.indexOf(current);
  const startOffset = currentIndex >= 0 ? 1 : 0;
  for (let offset = startOffset; offset < order.length + startOffset; offset += 1) {
    const index = currentIndex >= 0 ? (currentIndex + offset) % order.length : offset % order.length;
    const candidate = order[index];
    const label = (labels?.get(candidate) ?? candidate ?? '').trim().toLowerCase();
    if (label.startsWith(needle)) {
      return candidate;
    }
  }
  return null;
};

export const createHeadlessUiRuntime = () => {
  const tabsContext = createContextToken<TabsContextValue>();
  const checkboxContext = createContextToken<CheckboxContextValue>();
  const radioGroupContext = createContextToken<RadioGroupContextValue>();
  const radioItemContext = createContextToken<RadioItemContextValue>();
  const dialogContext = createContextToken<DialogContextValue>();
  const popoverContext = createContextToken<PopoverContextValue>();
  const tooltipContext = createContextToken<TooltipContextValue>();
  const toastContext = createContextToken<ToastContextValue>();
  const menuContext = createContextToken<MenuContextValue>();
  const selectContext = createContextToken<SelectContextValue>();
  const selectItemContext = createContextToken<SelectItemContextValue>();
  const comboboxContext = createContextToken<ComboboxContextValue>();
  const comboboxItemContext = createContextToken<ComboboxItemContextValue>();
  const multiselectContext = createContextToken<MultiselectContextValue>();
  const multiselectItemContext = createContextToken<MultiselectItemContextValue>();

  const dialogRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const popoverAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const popoverRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const tooltipAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const toastTimers = new WeakMap<object, unknown>();
  const menuAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const menuRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const menuActiveValues = new WeakMap<object, Signal<string>>();
  const menuTypeaheadStates = new WeakMap<object, TypeaheadState>();
  const menuTypeaheadLabels = new WeakMap<object, TypeaheadLabels>();
  const selectAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const selectRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const selectActiveValues = new WeakMap<object, Signal<string>>();
  const selectTypeaheadStates = new WeakMap<object, TypeaheadState>();
  const selectTypeaheadLabels = new WeakMap<object, TypeaheadLabels>();
  const comboboxAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const comboboxRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const comboboxActiveValues = new WeakMap<object, Signal<string>>();
  const multiselectAnchorTargets = new WeakMap<object, AnchorElementLike>();
  const multiselectRestoreTargets = new WeakMap<object, FocusTargetLike>();
  const multiselectActiveValues = new WeakMap<object, Signal<string>>();
  const multiselectTypeaheadStates = new WeakMap<object, TypeaheadState>();
  const multiselectTypeaheadLabels = new WeakMap<object, TypeaheadLabels>();

  const getTabsBaseId = createSignalBaseIdResolver<string>('lumina-tabs');
  const getCheckboxBaseId = createSignalBaseIdResolver<boolean>('lumina-checkbox');
  const getRadioBaseId = createSignalBaseIdResolver<string>('lumina-radio');
  const getDialogBaseId = createSignalBaseIdResolver<boolean>('lumina-dialog');
  const getPopoverBaseId = createSignalBaseIdResolver<boolean>('lumina-popover');
  const getTooltipBaseId = createSignalBaseIdResolver<boolean>('lumina-tooltip');
  const getToastBaseId = createSignalBaseIdResolver<boolean>('lumina-toast');
  const getMenuBaseId = createSignalBaseIdResolver<boolean>('lumina-menu');
  const getSelectBaseId = createSignalBaseIdResolver<boolean>('lumina-select');
  const getComboboxBaseId = createSignalBaseIdResolver<boolean>('lumina-combobox');
  const getMultiselectBaseId = createSignalBaseIdResolver<boolean>('lumina-multiselect');

  const normalizeTabsPart = (value: string): string => {
    const normalized = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized.length > 0 ? normalized : 'tab';
  };

  const getTabsIds = (ctx: TabsContextValue, value: string): { triggerId: string; panelId: string } => {
    const part = normalizeTabsPart(value);
    return {
      triggerId: `${ctx.baseId}-trigger-${part}`,
      panelId: `${ctx.baseId}-panel-${part}`,
    };
  };

  const registerTabsValue = (ctx: TabsContextValue, value: string): void => {
    registerOrderedValue(ctx.order, value);
  };

  const getTabsNavigationTarget = (ctx: TabsContextValue, current: string, key: string): string | null =>
    getWrappedNavigationTarget(ctx.order, current, key, ['ArrowRight', 'ArrowDown'], ['ArrowLeft', 'ArrowUp']);

  const getDialogIds = (
    ctx: DialogContextValue
  ): { triggerId: string; contentId: string; titleId: string; descriptionId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`,
  });

  const getPopoverIds = (ctx: PopoverContextValue): { triggerId: string; contentId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
  });

  const getTooltipIds = (ctx: TooltipContextValue): { triggerId: string; contentId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
  });

  const getToastIds = (
    ctx: ToastContextValue
  ): { contentId: string; titleId: string; descriptionId: string } => ({
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`,
  });

  const getMenuIds = (ctx: MenuContextValue): { triggerId: string; contentId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
  });

  const getSelectIds = (ctx: SelectContextValue): { triggerId: string; contentId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
  });

  const getComboboxIds = (ctx: ComboboxContextValue): { inputId: string; contentId: string } => ({
    inputId: `${ctx.baseId}-input`,
    contentId: `${ctx.baseId}-content`,
  });

  const getMultiselectIds = (ctx: MultiselectContextValue): { triggerId: string; contentId: string } => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
  });

  const getCheckboxIds = (ctx: CheckboxContextValue): { rootId: string; indicatorId: string } => ({
    rootId: `${ctx.baseId}-root`,
    indicatorId: `${ctx.baseId}-indicator`,
  });

  const getMenuItemId = (ctx: MenuContextValue, value: string): string =>
    `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getRadioItemId = (ctx: RadioGroupContextValue, value: string): string =>
    `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getSelectItemId = (ctx: SelectContextValue, value: string): string =>
    `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getComboboxItemId = (ctx: ComboboxContextValue, value: string): string =>
    `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getMultiselectItemId = (ctx: MultiselectContextValue, value: string): string =>
    `${ctx.baseId}-item-${normalizeTabsPart(value)}`;

  const getRadioIndicatorId = (itemId: string): string => `${itemId}-indicator`;
  const getSelectIndicatorId = (itemId: string): string => `${itemId}-indicator`;
  const getComboboxIndicatorId = (itemId: string): string => `${itemId}-indicator`;
  const getMultiselectIndicatorId = (itemId: string): string => `${itemId}-indicator`;

  const setDialogRestoreTarget = (ctx: DialogContextValue, target: FocusTargetLike | null | undefined): void => {
    setMapTarget(ctx, dialogRestoreTargets, target);
  };

  const restoreDialogFocus = (ctx: DialogContextValue): void => {
    restoreFocusFromMap(ctx, dialogRestoreTargets);
  };

  const setPopoverAnchorTarget = (ctx: PopoverContextValue, target: AnchorElementLike | null | undefined): void => {
    setMapTarget(ctx, popoverAnchorTargets, target);
  };

  const setPopoverRestoreTarget = (ctx: PopoverContextValue, target: FocusTargetLike | null | undefined): void => {
    setMapTarget(ctx, popoverRestoreTargets, target);
  };

  const restorePopoverFocus = (ctx: PopoverContextValue): void => {
    restoreFocusFromMap(ctx, popoverRestoreTargets);
  };

  const clearToastTimer = (signal: Signal<boolean>): void => {
    const key = signal as object;
    clearTimerHandle(toastTimers.get(key));
    toastTimers.delete(key);
  };

  const scheduleToastTimer = (ctx: ToastContextValue, duration: number): void => {
    if (!Number.isFinite(duration) || duration <= 0) {
      clearToastTimer(ctx.open);
      return;
    }
    if (typeof globalThis.setTimeout !== 'function') return;
    const key = ctx.open as object;
    const existing = toastTimers.get(key);
    if (existing !== undefined) return;
    const handle = globalThis.setTimeout(() => {
      toastTimers.delete(key);
      ctx.open.set(false);
    }, duration);
    toastTimers.set(key, handle);
  };

  const setMenuAnchorTarget = (ctx: MenuContextValue, target: AnchorElementLike | null | undefined): void => {
    setMapTarget(ctx, menuAnchorTargets, target);
  };

  const setMenuRestoreTarget = (ctx: MenuContextValue, target: FocusTargetLike | null | undefined): void => {
    setMapTarget(ctx, menuRestoreTargets, target);
  };

  const restoreMenuFocus = (ctx: MenuContextValue): void => {
    restoreFocusFromMap(ctx, menuRestoreTargets);
  };

  const setSelectAnchorTarget = (ctx: SelectContextValue, target: AnchorElementLike | null | undefined): void => {
    setMapTarget(ctx, selectAnchorTargets, target);
  };

  const setSelectRestoreTarget = (ctx: SelectContextValue, target: FocusTargetLike | null | undefined): void => {
    setMapTarget(ctx, selectRestoreTargets, target);
  };

  const restoreSelectFocus = (ctx: SelectContextValue): void => {
    restoreFocusFromMap(ctx, selectRestoreTargets);
  };

  const setComboboxAnchorTarget = (
    ctx: ComboboxContextValue,
    target: AnchorElementLike | null | undefined
  ): void => {
    setMapTarget(ctx, comboboxAnchorTargets, target);
  };

  const setComboboxRestoreTarget = (
    ctx: ComboboxContextValue,
    target: FocusTargetLike | null | undefined
  ): void => {
    setMapTarget(ctx, comboboxRestoreTargets, target);
  };

  const restoreComboboxFocus = (ctx: ComboboxContextValue): void => {
    restoreFocusFromMap(ctx, comboboxRestoreTargets);
  };

  const setMultiselectAnchorTarget = (
    ctx: MultiselectContextValue,
    target: AnchorElementLike | null | undefined
  ): void => {
    setMapTarget(ctx, multiselectAnchorTargets, target);
  };

  const setMultiselectRestoreTarget = (
    ctx: MultiselectContextValue,
    target: FocusTargetLike | null | undefined
  ): void => {
    setMapTarget(ctx, multiselectRestoreTargets, target);
  };

  const restoreMultiselectFocus = (ctx: MultiselectContextValue): void => {
    restoreFocusFromMap(ctx, multiselectRestoreTargets);
  };

  const setTooltipAnchorTarget = (ctx: TooltipContextValue, target: AnchorElementLike | null | undefined): void => {
    setMapTarget(ctx, tooltipAnchorTargets, target);
  };

  const registerMenuValue = (ctx: MenuContextValue, value: string, label?: string | null): void => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(menuTypeaheadLabels, ctx.open as object, value, label);
  };

  const getMenuActiveSignal = (ctx: MenuContextValue): Signal<string> => {
    const key = ctx.open as object;
    const existing = menuActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal('');
    menuActiveValues.set(key, created);
    return created;
  };

  const setMenuActiveValue = (ctx: MenuContextValue, value: string | null | undefined): void => {
    getMenuActiveSignal(ctx).set(typeof value === 'string' ? value : '');
  };

  const getMenuActiveValue = (ctx: MenuContextValue): string => {
    const explicit = getMenuActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    return ctx.order[0] ?? explicit ?? '';
  };

  const registerRadioValue = (ctx: RadioGroupContextValue, value: string): void => {
    registerOrderedValue(ctx.order, value);
  };

  const registerSelectValue = (ctx: SelectContextValue, value: string, label?: string | null): void => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(selectTypeaheadLabels, ctx.value as object, value, label);
  };

  const getSelectActiveSignal = (ctx: SelectContextValue): Signal<string> => {
    const key = ctx.value as object;
    const existing = selectActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal('');
    selectActiveValues.set(key, created);
    return created;
  };

  const setSelectActiveValue = (ctx: SelectContextValue, value: string | null | undefined): void => {
    getSelectActiveSignal(ctx).set(typeof value === 'string' ? value : '');
  };

  const resolveSelectActiveValue = (ctx: SelectContextValue): string => {
    const explicit = getSelectActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? '';
  };

  const getSelectActiveValue = (ctx: SelectContextValue): string => resolveSelectActiveValue(ctx);

  const getSelectActiveDescendantId = (ctx: SelectContextValue): string | null => {
    const activeValue = resolveSelectActiveValue(ctx);
    return activeValue ? getSelectItemId(ctx, activeValue) : null;
  };

  const acceptSelectActiveValue = (ctx: SelectContextValue): string => {
    const nextValue = resolveSelectActiveValue(ctx);
    if (!nextValue) return '';
    ctx.value.set(nextValue);
    setSelectActiveValue(ctx, nextValue);
    return nextValue;
  };

  const registerComboboxValue = (ctx: ComboboxContextValue, value: string): void => {
    registerOrderedValue(ctx.order, value);
  };

  const getComboboxActiveSignal = (ctx: ComboboxContextValue): Signal<string> => {
    const key = ctx.value as object;
    const existing = comboboxActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal('');
    comboboxActiveValues.set(key, created);
    return created;
  };

  const setComboboxActiveValue = (ctx: ComboboxContextValue, value: string | null | undefined): void => {
    getComboboxActiveSignal(ctx).set(typeof value === 'string' ? value : '');
  };

  const resolveComboboxActiveValue = (ctx: ComboboxContextValue): string => {
    const explicit = getComboboxActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? '';
  };

  const getComboboxActiveValue = (ctx: ComboboxContextValue): string => resolveComboboxActiveValue(ctx);

  const getComboboxActiveDescendantId = (ctx: ComboboxContextValue): string | null => {
    const activeValue = resolveComboboxActiveValue(ctx);
    return activeValue ? getComboboxItemId(ctx, activeValue) : null;
  };

  const acceptComboboxActiveValue = (ctx: ComboboxContextValue): string => {
    const nextValue = resolveComboboxActiveValue(ctx);
    if (!nextValue) return '';
    ctx.value.set(nextValue);
    ctx.query.set(nextValue);
    setComboboxActiveValue(ctx, nextValue);
    return nextValue;
  };

  const registerMultiselectValue = (ctx: MultiselectContextValue, value: string, label?: string | null): void => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(multiselectTypeaheadLabels, ctx.open as object, value, label);
  };

  const getMultiselectActiveSignal = (ctx: MultiselectContextValue): Signal<string> => {
    const key = ctx.values as object;
    const existing = multiselectActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal('');
    multiselectActiveValues.set(key, created);
    return created;
  };

  const setMultiselectActiveValue = (ctx: MultiselectContextValue, value: string | null | undefined): void => {
    getMultiselectActiveSignal(ctx).set(typeof value === 'string' ? value : '');
  };

  const getMultiselectActiveValue = (ctx: MultiselectContextValue): string => {
    const explicit = getMultiselectActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    const selected = readStringSelection(ctx.values.get()).find((entry) => ctx.order.includes(entry));
    return selected ?? ctx.order[0] ?? '';
  };

  const getMenuNavigationTarget = (ctx: MenuContextValue, current: string, key: string): string | null =>
    getWrappedNavigationTarget(ctx.order, current, key, ['ArrowDown'], ['ArrowUp']);

  const getMenuTypeaheadTarget = (ctx: MenuContextValue, current: string, key: string): string | null =>
    getTypeaheadTarget(
      menuTypeaheadStates,
      ctx.open as object,
      ctx.order,
      menuTypeaheadLabels.get(ctx.open as object),
      current,
      key
    );

  const getRadioNavigationTarget = (ctx: RadioGroupContextValue, current: string, key: string): string | null =>
    getWrappedNavigationTarget(ctx.order, current, key, ['ArrowRight', 'ArrowDown'], ['ArrowLeft', 'ArrowUp']);

  const getSelectNavigationTarget = (ctx: SelectContextValue, current: string, key: string): string | null =>
    getClampedNavigationTarget(ctx.order, current, key, ['ArrowDown'], ['ArrowUp']);

  const getSelectTypeaheadTarget = (ctx: SelectContextValue, current: string, key: string): string | null =>
    getTypeaheadTarget(
      selectTypeaheadStates,
      ctx.value as object,
      ctx.order,
      selectTypeaheadLabels.get(ctx.value as object),
      current,
      key
    );

  const getComboboxNavigationTarget = (
    ctx: ComboboxContextValue,
    current: string,
    key: string
  ): string | null =>
    getWrappedNavigationTarget(ctx.order, current, key, ['ArrowDown', 'ArrowRight'], ['ArrowUp', 'ArrowLeft']);

  const getMultiselectNavigationTarget = (
    ctx: MultiselectContextValue,
    current: string,
    key: string
  ): string | null =>
    getClampedNavigationTarget(ctx.order, current, key, ['ArrowDown'], ['ArrowUp']);

  const getMultiselectTypeaheadTarget = (
    ctx: MultiselectContextValue,
    current: string,
    key: string
  ): string | null =>
    getTypeaheadTarget(
      multiselectTypeaheadStates,
      ctx.open as object,
      ctx.order,
      multiselectTypeaheadLabels.get(ctx.open as object),
      current,
      key
    );

  const focusMenuItem = (
    documentLike: LookupDocumentLike | null | undefined,
    ctx: MenuContextValue,
    value: string
  ): boolean => focusElementById(documentLike, getMenuItemId(ctx, value));

  const focusRadioItem = (
    documentLike: LookupDocumentLike | null | undefined,
    ctx: RadioGroupContextValue,
    value: string,
    fallbackRoot?: AccessibleDomNodeLike | null
  ): boolean => focusElementById(documentLike, getRadioItemId(ctx, value), fallbackRoot);

  const focusSelectItem = (
    documentLike: LookupDocumentLike | null | undefined,
    ctx: SelectContextValue,
    value: string,
    fallbackRoot?: AccessibleDomNodeLike | null
  ): boolean => focusElementById(documentLike, getSelectItemId(ctx, value), fallbackRoot);

  const focusComboboxItem = (
    documentLike: LookupDocumentLike | null | undefined,
    ctx: ComboboxContextValue,
    value: string,
    fallbackRoot?: AccessibleDomNodeLike | null
  ): boolean => focusElementById(documentLike, getComboboxItemId(ctx, value), fallbackRoot);

  const focusMultiselectItem = (
    documentLike: LookupDocumentLike | null | undefined,
    ctx: MultiselectContextValue,
    value: string,
    fallbackRoot?: AccessibleDomNodeLike | null
  ): boolean => focusElementById(documentLike, getMultiselectItemId(ctx, value), fallbackRoot);

  const closeMenu = (ctx: MenuContextValue): void => {
    setMenuActiveValue(ctx, '');
    ctx.open.set(false);
    restoreMenuFocus(ctx);
  };

  const closeSelect = (ctx: SelectContextValue): void => {
    setSelectActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreSelectFocus(ctx);
  };

  const closeCombobox = (ctx: ComboboxContextValue): void => {
    setComboboxActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreComboboxFocus(ctx);
  };

  const closeMultiselect = (ctx: MultiselectContextValue): void => {
    setMultiselectActiveValue(ctx, getMultiselectActiveValue(ctx));
    ctx.open.set(false);
    restoreMultiselectFocus(ctx);
  };

  const readStringSelection = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

  const toggleMultiselectValue = (ctx: MultiselectContextValue, value: string): string[] => {
    const current = readStringSelection(ctx.values.get());
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    ctx.values.set(next);
    return next;
  };

  const getPopoverAnchorRect = (ctx: PopoverContextValue): AnchorRect | null =>
    readAnchorRect(ctx, popoverAnchorTargets);
  const getMenuAnchorRect = (ctx: MenuContextValue): AnchorRect | null =>
    readAnchorRect(ctx, menuAnchorTargets);
  const getTooltipAnchorRect = (ctx: TooltipContextValue): AnchorRect | null =>
    readAnchorRect(ctx, tooltipAnchorTargets);
  const getSelectAnchorRect = (ctx: SelectContextValue): AnchorRect | null =>
    readAnchorRect(ctx, selectAnchorTargets);
  const getComboboxAnchorRect = (ctx: ComboboxContextValue): AnchorRect | null =>
    readAnchorRect(ctx, comboboxAnchorTargets);
  const getMultiselectAnchorRect = (ctx: MultiselectContextValue): AnchorRect | null =>
    readAnchorRect(ctx, multiselectAnchorTargets);

  const pickPopoverSide = (props: Record<string, unknown> | null | undefined): PopoverSide => {
    const value = props?.side;
    return value === 'top' || value === 'bottom' || value === 'left' || value === 'right' ? value : 'bottom';
  };

  const pickPopoverAlign = (props: Record<string, unknown> | null | undefined): PopoverAlign => {
    const value = props?.align;
    return value === 'start' || value === 'center' || value === 'end' ? value : 'center';
  };

  const pickPopoverOffset = (props: Record<string, unknown> | null | undefined): number => {
    const value = props?.offset;
    return typeof value === 'number' && Number.isFinite(value) ? value : 8;
  };

  const omitPopoverLayoutProps = (
    props: Record<string, unknown> | null | undefined
  ): Record<string, unknown> | undefined => {
    if (!props) return undefined;
    const next = { ...props };
    delete next.side;
    delete next.align;
    delete next.offset;
    return next;
  };

  const pickToastDuration = (props: Record<string, unknown> | null | undefined): number => {
    const value = props?.duration;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };

  const omitToastControlProps = (
    props: Record<string, unknown> | null | undefined
  ): Record<string, unknown> | undefined => {
    if (!props) return undefined;
    const next = { ...props };
    delete next.duration;
    return next;
  };

  const getPopoverContentStyle = (
    rect: AnchorRect | null,
    props: Record<string, unknown> | null | undefined
  ): Record<string, unknown> => {
    const side = pickPopoverSide(props);
    const align = pickPopoverAlign(props);
    const offset = pickPopoverOffset(props);
    const style: Record<string, unknown> = {
      position: 'fixed',
      zIndex: '1001',
    };

    if (!rect) {
      return {
        ...style,
        top: '16px',
        left: '16px',
      };
    }

    if (side === 'top' || side === 'bottom') {
      style.top = `${Math.round(side === 'bottom' ? rect.bottom + offset : rect.top - offset)}px`;
      if (align === 'start') {
        style.left = `${Math.round(rect.left)}px`;
      } else if (align === 'end') {
        style.left = `${Math.round(rect.right)}px`;
        style.transform = side === 'top' ? 'translate(-100%, -100%)' : 'translateX(-100%)';
      } else {
        style.left = `${Math.round(rect.left + rect.width / 2)}px`;
        style.transform = side === 'top' ? 'translate(-50%, -100%)' : 'translateX(-50%)';
      }
      if (align === 'start' && side === 'top') {
        style.transform = 'translateY(-100%)';
      }
      return style;
    }

    style.left = `${Math.round(side === 'right' ? rect.right + offset : rect.left - offset)}px`;
    if (align === 'start') {
      style.top = `${Math.round(rect.top)}px`;
    } else if (align === 'end') {
      style.top = `${Math.round(rect.bottom)}px`;
      style.transform = side === 'left' ? 'translate(-100%, -100%)' : 'translateY(-100%)';
    } else {
      style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      style.transform = side === 'left' ? 'translate(-100%, -50%)' : 'translateY(-50%)';
    }
    if (align === 'start' && side === 'left') {
      style.transform = 'translateX(-100%)';
    }
    return style;
  };

  return {
    tabsContext,
    checkboxContext,
    radioGroupContext,
    radioItemContext,
    dialogContext,
    popoverContext,
    tooltipContext,
    toastContext,
    menuContext,
    selectContext,
    selectItemContext,
    comboboxContext,
    comboboxItemContext,
    multiselectContext,
    multiselectItemContext,
    getTabsBaseId,
    getCheckboxBaseId,
    getRadioBaseId,
    getDialogBaseId,
    getPopoverBaseId,
    getTooltipBaseId,
    getToastBaseId,
    getMenuBaseId,
    getSelectBaseId,
    getComboboxBaseId,
    getMultiselectBaseId,
    normalizeTabsPart,
    getTabsIds,
    registerTabsValue,
    getTabsNavigationTarget,
    getDialogIds,
    getPopoverIds,
    getTooltipIds,
    getToastIds,
    getMenuIds,
    getSelectIds,
    getComboboxIds,
    getMultiselectIds,
    getCheckboxIds,
    getMenuItemId,
    getRadioItemId,
    getSelectItemId,
    getComboboxItemId,
    getMultiselectItemId,
    getRadioIndicatorId,
    getSelectIndicatorId,
    getComboboxIndicatorId,
    getMultiselectIndicatorId,
    setDialogRestoreTarget,
    restoreDialogFocus,
    setPopoverAnchorTarget,
    setPopoverRestoreTarget,
    restorePopoverFocus,
    clearToastTimer,
    scheduleToastTimer,
    setMenuAnchorTarget,
    setMenuRestoreTarget,
    restoreMenuFocus,
    setSelectAnchorTarget,
    setSelectRestoreTarget,
    restoreSelectFocus,
    setComboboxAnchorTarget,
    setComboboxRestoreTarget,
    restoreComboboxFocus,
    setMultiselectAnchorTarget,
    setMultiselectRestoreTarget,
    restoreMultiselectFocus,
    setTooltipAnchorTarget,
    registerMenuValue,
    registerRadioValue,
    registerSelectValue,
    registerComboboxValue,
    registerMultiselectValue,
    getMenuActiveValue,
    setMenuActiveValue,
    getMenuNavigationTarget,
    getMenuTypeaheadTarget,
    getRadioNavigationTarget,
    getSelectNavigationTarget,
    getSelectTypeaheadTarget,
    getComboboxNavigationTarget,
    getMultiselectNavigationTarget,
    getMultiselectTypeaheadTarget,
    getSelectActiveValue,
    getSelectActiveDescendantId,
    setSelectActiveValue,
    acceptSelectActiveValue,
    getComboboxActiveValue,
    getComboboxActiveDescendantId,
    setComboboxActiveValue,
    acceptComboboxActiveValue,
    getMultiselectActiveValue,
    setMultiselectActiveValue,
    focusMenuItem,
    focusRadioItem,
    focusSelectItem,
    focusComboboxItem,
    focusMultiselectItem,
    closeMenu,
    closeSelect,
    closeCombobox,
    closeMultiselect,
    readStringSelection,
    toggleMultiselectValue,
    getPopoverAnchorRect,
    getMenuAnchorRect,
    getTooltipAnchorRect,
    getSelectAnchorRect,
    getComboboxAnchorRect,
    getMultiselectAnchorRect,
    pickPopoverSide,
    pickPopoverAlign,
    pickPopoverOffset,
    omitPopoverLayoutProps,
    pickToastDuration,
    omitToastControlProps,
    getPopoverContentStyle,
  };
};
