import { createHeadlessUiRuntime } from '../src/runtime/headless-ui-runtime.js';
import { Signal } from '../src/runtime/reactive-core.js';

type FocusTarget = { focus: jest.Mock<void, []> };

const rectAnchor = () => ({
  getBoundingClientRect: () => ({
    left: 12,
    top: 18,
    right: 52,
    bottom: 78,
    width: 40,
    height: 60,
  }),
});

describe('runtime headless ui helpers', () => {
  test('reuses signal base ids and normalizes item ids', () => {
    const runtime = createHeadlessUiRuntime();
    const first = new Signal('overview');
    const second = new Signal('activity');

    expect(runtime.getTabsBaseId(first)).toBe(runtime.getTabsBaseId(first));
    expect(runtime.getTabsBaseId(first)).not.toBe(runtime.getTabsBaseId(second));
    expect(
      runtime.getTabsIds({ value: first, baseId: 'lumina-tabs-1', order: [] }, '  Team Settings!  ')
    ).toEqual({
      triggerId: 'lumina-tabs-1-trigger-team-settings',
      panelId: 'lumina-tabs-1-panel-team-settings',
    });
    expect(
      runtime.getCheckboxIds({ checked: new Signal(true), baseId: 'lumina-checkbox-1' })
    ).toEqual({
      rootId: 'lumina-checkbox-1-root',
      indicatorId: 'lumina-checkbox-1-indicator',
    });
  });

  test('registers ordered values and cycles navigation targets', () => {
    const runtime = createHeadlessUiRuntime();
    const tabs = { value: new Signal('overview'), baseId: 'tabs', order: [] as string[] };
    runtime.registerTabsValue(tabs, 'overview');
    runtime.registerTabsValue(tabs, 'activity');
    runtime.registerTabsValue(tabs, 'overview');
    expect(tabs.order).toEqual(['overview', 'activity']);
    expect(runtime.getTabsNavigationTarget(tabs, 'overview', 'ArrowRight')).toBe('activity');
    expect(runtime.getTabsNavigationTarget(tabs, 'overview', 'ArrowLeft')).toBe('activity');

    const menu = { open: new Signal(true), baseId: 'menu', order: ['one', 'two', 'three'] };
    expect(runtime.getMenuNavigationTarget(menu, 'one', 'End')).toBe('three');
    expect(runtime.getMenuNavigationTarget(menu, 'three', 'ArrowDown')).toBe('one');

    const multiselect = {
      open: new Signal(true),
      values: new Signal<string[]>(['alpha']),
      baseId: 'multi',
      order: ['alpha', 'beta', 'gamma'],
    };
    expect(runtime.getMultiselectNavigationTarget(multiselect, 'beta', 'ArrowLeft')).toBe('alpha');
    expect(runtime.toggleMultiselectValue(multiselect, 'beta')).toEqual(['alpha', 'beta']);
    expect(runtime.toggleMultiselectValue(multiselect, 'alpha')).toEqual(['beta']);

    const select = {
      open: new Signal(true),
      value: new Signal('beta'),
      baseId: 'select',
      order: ['alpha', 'beta', 'gamma'],
    };
    expect(runtime.getSelectActiveDescendantId(select)).toBe('select-item-beta');
    runtime.setSelectActiveValue(select, 'gamma');
    expect(runtime.getSelectActiveValue(select)).toBe('gamma');
    expect(runtime.getSelectActiveDescendantId(select)).toBe('select-item-gamma');
    runtime.acceptSelectActiveValue(select);
    expect(select.value.get()).toBe('gamma');

    const combobox = {
      open: new Signal(true),
      value: new Signal('beta'),
      query: new Signal(''),
      baseId: 'combo',
      order: ['alpha', 'beta', 'gamma'],
    };
    expect(runtime.getComboboxActiveDescendantId(combobox)).toBe('combo-item-beta');
    runtime.setComboboxActiveValue(combobox, 'gamma');
    expect(runtime.getComboboxActiveValue(combobox)).toBe('gamma');
    expect(runtime.getComboboxActiveDescendantId(combobox)).toBe('combo-item-gamma');
    runtime.acceptComboboxActiveValue(combobox);
    expect(combobox.value.get()).toBe('gamma');
    expect(combobox.query.get()).toBe('gamma');
  });

  test('restores focus and reads anchor-based popover layout', () => {
    const runtime = createHeadlessUiRuntime();
    const dialog = { open: new Signal(true), baseId: 'dialog', hasTitle: false, hasDescription: false };
    const focusTarget: FocusTarget = { focus: jest.fn() };
    runtime.setDialogRestoreTarget(dialog, focusTarget);
    runtime.restoreDialogFocus(dialog);
    runtime.restoreDialogFocus(dialog);
    expect(focusTarget.focus).toHaveBeenCalledTimes(1);

    const popover = { open: new Signal(true), baseId: 'popover' };
    runtime.setPopoverAnchorTarget(popover, rectAnchor());
    expect(runtime.getPopoverAnchorRect(popover)).toEqual({
      left: 12,
      top: 18,
      right: 52,
      bottom: 78,
      width: 40,
      height: 60,
    });
    expect(
      runtime.getPopoverContentStyle(runtime.getPopoverAnchorRect(popover), { side: 'right', align: 'end', offset: 6 })
    ).toEqual({
      position: 'fixed',
      zIndex: '1001',
      left: '58px',
      top: '78px',
      transform: 'translateY(-100%)',
    });
  });

  test('focus helpers fall back to tree search when document lookup is unavailable', () => {
    const runtime = createHeadlessUiRuntime();
    const target = {
      getAttribute: (name: string) => (name === 'id' ? 'select-item-two' : null),
      focus: jest.fn(),
      childNodes: [],
    };
    const root = {
      childNodes: [
        {
          getAttribute: () => null,
          childNodes: [target],
        },
      ],
    };
    const select = {
      open: new Signal(true),
      value: new Signal('two'),
      baseId: 'select',
      order: ['one', 'two'],
    };

    expect(runtime.focusSelectItem(null, select, 'two', root as never)).toBe(true);
    expect(target.focus).toHaveBeenCalledTimes(1);
  });

  test('schedules and clears toast timers', () => {
    jest.useFakeTimers();
    try {
      const runtime = createHeadlessUiRuntime();
      const toast = {
        open: new Signal(true),
        baseId: 'toast',
        hasTitle: false,
        hasDescription: false,
      };

      runtime.scheduleToastTimer(toast, 25);
      jest.advanceTimersByTime(24);
      expect(toast.open.get()).toBe(true);
      jest.advanceTimersByTime(1);
      expect(toast.open.get()).toBe(false);

      toast.open.set(true);
      runtime.scheduleToastTimer(toast, 25);
      runtime.clearToastTimer(toast.open);
      jest.advanceTimersByTime(25);
      expect(toast.open.get()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
