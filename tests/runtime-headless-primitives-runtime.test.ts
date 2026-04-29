import { createHeadlessPrimitivesRuntime } from '../src/runtime/headless-primitives-runtime.js';
import { createHeadlessUiRuntime } from '../src/runtime/headless-ui-runtime.js';
import { Signal } from '../src/runtime/reactive-core.js';

type ContextToken = object;

const createPrimitiveRuntime = () => {
  const contexts = new Map<ContextToken, unknown>();
  const frameManager = {
    withContext: <T,>(context: ContextToken, value: T, renderChildren: () => unknown): unknown => {
      const had = contexts.has(context);
      const previous = contexts.get(context);
      contexts.set(context, value);
      try {
        return renderChildren();
      } finally {
        if (had) {
          contexts.set(context, previous);
        } else {
          contexts.delete(context);
        }
      }
    },
    useContext: <T,>(context: ContextToken): T => {
      const value = contexts.get(context);
      if (value === undefined) {
        throw new Error('missing context');
      }
      return value as T;
    },
  };

  return createHeadlessPrimitivesRuntime({
    requireActiveFrameManager: () => frameManager as never,
    headlessUi: createHeadlessUiRuntime(),
  });
};

describe('runtime headless primitives', () => {
  test('tabs root wires trigger selection and keyboard navigation', () => {
    const runtime = createPrimitiveRuntime();
    const selected = new Signal('overview');
    const root = runtime.tabs_root(selected, () => [
      runtime.tabs_trigger('overview', null, ['Overview']),
      runtime.tabs_trigger('activity', null, ['Activity']),
    ]);

    const triggers = root.children ?? [];
    const first = triggers[0];
    const second = triggers[1];
    expect(first?.props?.['aria-selected']).toBe('true');
    expect(second?.props?.['aria-selected']).toBe('false');

    (second?.props?.onClick as (() => void) | undefined)?.();
    expect(selected.get()).toBe('activity');

    const preventDefault = jest.fn();
    (second?.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'ArrowLeft',
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(selected.get()).toBe('overview');
  });

  test('dialog and popover primitives open, close, and compute anchored style', () => {
    const runtime = createPrimitiveRuntime();

    const dialogOpen = new Signal(false);
    const triggerTarget = { focus: jest.fn() };
    const dialogTrigger = runtime.dialog_root(dialogOpen, () => runtime.dialog_trigger(null, []));
    (dialogTrigger.props?.onClick as ((event: Event) => void) | undefined)?.({
      currentTarget: triggerTarget,
    } as unknown as Event);
    expect(dialogOpen.get()).toBe(true);

    const dialogContent = runtime.dialog_root(dialogOpen, () => runtime.dialog_content(null, []));
    expect(dialogContent.props?.role).toBe('dialog');
    expect(dialogContent.props?.['aria-modal']).toBe('true');
    expect(dialogContent.props?.autoFocus).toBe(true);
    const preventDefault = jest.fn();
    (dialogContent.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'Escape',
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dialogOpen.get()).toBe(false);
    expect(triggerTarget.focus).toHaveBeenCalledTimes(1);

    const popoverOpen = new Signal(false);
    const popoverTarget = {
      focus: jest.fn(),
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 50,
        bottom: 80,
        width: 40,
        height: 60,
      }),
    };
    const popoverTrigger = runtime.popover_root(popoverOpen, () => runtime.popover_trigger(null, []));
    (popoverTrigger.props?.onClick as ((event: Event) => void) | undefined)?.({
      currentTarget: popoverTarget,
    } as unknown as Event);
    expect(popoverOpen.get()).toBe(true);

    const popoverContent = runtime.popover_root(popoverOpen, () =>
      runtime.popover_content({ side: 'right', align: 'end', offset: 6 }, [])
    );
    expect(popoverContent.props?.['data-side']).toBe('right');
    expect(popoverContent.props?.style).toEqual({
      position: 'fixed',
      zIndex: '1001',
      left: '56px',
      top: '80px',
      transform: 'translateY(-100%)',
    });
  });

  test('toast and menu primitives preserve behavior after extraction', () => {
    jest.useFakeTimers();
    try {
      const runtime = createPrimitiveRuntime();

      const toastOpen = new Signal(true);
      runtime.toast_root(toastOpen, () => runtime.toast_content({ duration: 15 }, []));
      jest.advanceTimersByTime(15);
      expect(toastOpen.get()).toBe(false);

      const menuOpen = new Signal(true);
      const clicks: string[] = [];
      const item = runtime.menu_root(menuOpen, () =>
        runtime.menu_item(
          'profile',
          {
            onClick: () => {
              clicks.push('profile');
            },
          },
          ['Profile']
        )
      );

      const preventDefault = jest.fn();
      (item.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
        key: 'Enter',
        preventDefault,
      } as unknown as KeyboardEvent);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(clicks).toEqual(['profile']);
      expect(menuOpen.get()).toBe(false);

      const menuOpenByKey = new Signal(false);
      const triggerTarget = { focus: jest.fn() };
      const renderMenuTree = () =>
        runtime.menu_root(menuOpenByKey, () => [
          runtime.menu_item('profile', null, ['Profile']),
          runtime.menu_item('settings', null, ['Settings']),
          runtime.menu_item('billing-id', null, ['Billing']),
          runtime.menu_trigger(null, ['Open']),
        ]);
      let tree = renderMenuTree();
      let trigger = (tree.children ?? [])[3];
      (trigger?.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
        key: 'ArrowUp',
        currentTarget: triggerTarget,
        target: triggerTarget,
        preventDefault: jest.fn(),
      } as unknown as KeyboardEvent);
      expect(menuOpenByKey.get()).toBe(true);
      tree = renderMenuTree();
      const firstItem = (tree.children ?? [])[0];
      const secondItem = (tree.children ?? [])[1];
      const lastItem = (tree.children ?? [])[2];
      expect(firstItem?.props?.autoFocus).toBe(false);
      expect(lastItem?.props?.autoFocus).toBe(true);
      expect(firstItem?.props?.tabIndex).toBe(-1);
      expect(lastItem?.props?.tabIndex).toBe(0);

      (firstItem?.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
        key: 'b',
        currentTarget: triggerTarget,
        target: triggerTarget,
        preventDefault: jest.fn(),
      } as unknown as KeyboardEvent);
      tree = renderMenuTree();
      expect(((tree.children ?? [])[2])?.props?.autoFocus).toBe(true);

      const closeEvent = { key: 'Tab' } as unknown as KeyboardEvent;
      expect((secondItem?.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.(closeEvent)).toBeUndefined();
      expect(menuOpenByKey.get()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('select, combobox, and multiselect primitives preserve selection behavior', () => {
    const runtime = createPrimitiveRuntime();

    const selectOpen = new Signal(false);
    const selectValue = new Signal('overview');
    const selectTriggerTarget = { focus: jest.fn() };
    const renderSelectTree = () =>
      runtime.select_root(selectOpen, selectValue, () => [
        runtime.select_item('overview', null, () => ['Overview']),
        runtime.select_item('activity', null, () => ['Activity']),
        runtime.select_trigger(null, []),
      ]);

    let selectTree = renderSelectTree();
    let selectTrigger = (selectTree.children ?? [])[2];
    (selectTrigger.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'A',
      preventDefault: jest.fn(),
      currentTarget: selectTriggerTarget,
      target: selectTriggerTarget,
    } as unknown as KeyboardEvent);
    expect(selectOpen.get()).toBe(true);
    selectTree = renderSelectTree();
    selectTrigger = (selectTree.children ?? [])[2];
    expect(selectTrigger?.props?.['aria-activedescendant']).toBe('lumina-select-1-item-activity');

    (selectTrigger.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'A',
      preventDefault: jest.fn(),
      currentTarget: selectTriggerTarget,
      target: selectTriggerTarget,
    } as unknown as KeyboardEvent);
    selectTree = renderSelectTree();
    selectTrigger = (selectTree.children ?? [])[2];
    expect(selectTrigger?.props?.['aria-activedescendant']).toBe('lumina-select-1-item-activity');

    selectOpen.set(false);
    (selectTrigger.props?.onClick as ((event: Event) => void) | undefined)?.({
      currentTarget: selectTriggerTarget,
    } as unknown as Event);
    expect(selectOpen.get()).toBe(true);
    selectTree = renderSelectTree();
    selectTrigger = (selectTree.children ?? [])[2];
    expect(selectTrigger?.props?.['aria-activedescendant']).toBe('lumina-select-1-item-overview');

    (selectTrigger.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'ArrowDown',
      preventDefault: jest.fn(),
      currentTarget: selectTriggerTarget,
      target: selectTriggerTarget,
    } as unknown as KeyboardEvent);

    selectTree = renderSelectTree();
    selectTrigger = (selectTree.children ?? [])[2];
    expect(selectValue.get()).toBe('overview');
    expect(selectTrigger?.props?.['aria-activedescendant']).toBe('lumina-select-1-item-activity');

    (selectTrigger.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'Enter',
      preventDefault: jest.fn(),
      currentTarget: selectTriggerTarget,
      target: selectTriggerTarget,
    } as unknown as KeyboardEvent);
    expect(selectValue.get()).toBe('activity');
    expect(selectOpen.get()).toBe(false);
    expect(selectTriggerTarget.focus).toHaveBeenCalled();

    const comboboxOpen = new Signal(false);
    const comboboxValue = new Signal('alpha');
    const comboboxQuery = new Signal('');
    const comboboxTarget = { focus: jest.fn() };
    const comboboxInput = runtime.combobox_root(comboboxOpen, comboboxValue, comboboxQuery, () =>
      runtime.combobox_input(null, [])
    );
    (comboboxInput.props?.onInput as ((event: Event) => void) | undefined)?.({
      currentTarget: comboboxTarget,
      target: { value: 'bet' },
    } as unknown as Event);
    expect(comboboxOpen.get()).toBe(true);
    expect(comboboxQuery.get()).toBe('bet');

    const comboboxItem = runtime.combobox_root(comboboxOpen, comboboxValue, comboboxQuery, () =>
      runtime.combobox_item('beta', null, () => ['Beta'])
    );
    (comboboxItem.props?.onClick as (() => void) | undefined)?.();
    expect(comboboxValue.get()).toBe('beta');
    expect(comboboxQuery.get()).toBe('beta');
    expect(comboboxOpen.get()).toBe(false);
    expect(comboboxTarget.focus).toHaveBeenCalledTimes(1);

    const multiselectOpen = new Signal(true);
    const multiselectValues = new Signal<string[]>(['alpha']);
    const multiselectTree = runtime.multiselect_root(multiselectOpen, multiselectValues, () => [
      runtime.multiselect_trigger(null, []),
      runtime.multiselect_item('alpha', null, () => ['Amber']),
      runtime.multiselect_item('beta', null, () => ['Blue']),
      runtime.multiselect_item('gamma', null, () => ['Green']),
    ]);
    const multiselectTrigger = (multiselectTree.children ?? [])[0];
    const multiselectFirstItem = (multiselectTree.children ?? [])[1];
    const multiselectItem = (multiselectTree.children ?? [])[2];
    expect(multiselectTrigger?.props?.role).toBeUndefined();
    expect(multiselectTrigger?.props?.['aria-haspopup']).toBe('listbox');
    expect(multiselectFirstItem?.props?.tabIndex).toBe(0);
    expect(multiselectItem?.props?.tabIndex).toBe(-1);
    expect(multiselectFirstItem?.props?.['data-active']).toBe('true');
    (multiselectFirstItem?.props?.onKeyDown as ((event: KeyboardEvent) => unknown) | undefined)?.({
      key: 'g',
      preventDefault: jest.fn(),
      currentTarget: { focus: jest.fn() },
      target: { focus: jest.fn() },
    } as unknown as KeyboardEvent);
    const multiselectAfterTypeahead = runtime.multiselect_root(multiselectOpen, multiselectValues, () => [
      runtime.multiselect_trigger(null, []),
      runtime.multiselect_item('alpha', null, () => ['Amber']),
      runtime.multiselect_item('beta', null, () => ['Blue']),
      runtime.multiselect_item('gamma', null, () => ['Green']),
    ]);
    const multiselectGamma = (multiselectAfterTypeahead.children ?? [])[3];
    expect(multiselectGamma?.props?.tabIndex).toBe(0);
    expect(multiselectGamma?.props?.['data-active']).toBe('true');
    (multiselectItem.props?.onClick as (() => void) | undefined)?.();
    expect(multiselectValues.get()).toEqual(['alpha', 'beta']);
    expect(multiselectOpen.get()).toBe(true);
  });

  test('combobox keeps focus on the input and uses aria-activedescendant navigation', () => {
    const runtime = createPrimitiveRuntime();

    const open = new Signal(true);
    const value = new Signal('alpha');
    const query = new Signal('');
    const inputTarget = { focus: jest.fn() };

    const renderTree = () =>
      runtime.combobox_root(open, value, query, () => [
        runtime.combobox_item('alpha', null, () => ['Alpha']),
        runtime.combobox_item('beta', null, () => ['Beta']),
        runtime.combobox_item('gamma', null, () => ['Gamma']),
        runtime.combobox_input(null, []),
      ]);

    let root = renderTree();
    let input = (root.children ?? [])[3];
    expect(input?.props?.['aria-activedescendant']).toBeDefined();
    expect(input?.props?.['aria-activedescendant']).toBe(String(input.props?.id).replace('-input', '-item-alpha'));

    (input?.props?.onFocus as ((event?: Event) => unknown) | undefined)?.({
      currentTarget: inputTarget,
      target: inputTarget,
    } as unknown as Event);
    (input?.props?.onKeyDown as ((event?: KeyboardEvent) => unknown) | undefined)?.({
      key: 'ArrowDown',
      preventDefault: jest.fn(),
      currentTarget: inputTarget,
      target: inputTarget,
    } as unknown as KeyboardEvent);

    root = renderTree();
    input = (root.children ?? [])[3];
    expect(input?.props?.['aria-activedescendant']).toBe(String(input.props?.id).replace('-input', '-item-beta'));

    const activeItem = (root.children ?? [])[1];
    expect(activeItem?.props?.['aria-selected']).toBe('true');
    expect(activeItem?.props?.['data-active']).toBe('true');

    (input?.props?.onKeyDown as ((event?: KeyboardEvent) => unknown) | undefined)?.({
      key: 'Enter',
      preventDefault: jest.fn(),
      currentTarget: inputTarget,
      target: inputTarget,
    } as unknown as KeyboardEvent);

    expect(value.get()).toBe('beta');
    expect(query.get()).toBe('beta');
    expect(open.get()).toBe(false);
    expect(inputTarget.focus).toHaveBeenCalled();
  });

  test('checkbox and radio primitives preserve toggle behavior', () => {
    const runtime = createPrimitiveRuntime();

    const checked = new Signal(false);
    const checkbox = runtime.checkbox_root(checked, null, () => ['Enabled']);
    (checkbox.props?.onClick as (() => void) | undefined)?.();
    expect(checked.get()).toBe(true);

    const indicator = runtime.checkbox_root(checked, null, () => runtime.checkbox_indicator(null, ['yes']));
    const indicatorNode = (indicator.children ?? [])[0];
    expect(indicatorNode?.props?.hidden).toBe(false);

    const choice = new Signal('overview');
    const radioGroup = runtime.radio_group(choice, null, () => runtime.radio_item('activity', null, () => ['Activity']));
    const radio = (radioGroup.children ?? [])[0];
    (radio?.props?.onClick as (() => void) | undefined)?.();
    expect(choice.get()).toBe('activity');

    const radioIndicator = runtime.radio_group(choice, null, () =>
      runtime.radio_item('activity', null, () => runtime.radio_indicator(null, ['dot']))
    );
    const radioButton = (radioIndicator.children ?? [])[0];
    const radioChildren = radioButton?.children ?? [];
    expect(radioButton.props?.['aria-checked']).toBe('true');
    expect(radioChildren[0]?.props?.hidden).toBe(false);
  });
});
