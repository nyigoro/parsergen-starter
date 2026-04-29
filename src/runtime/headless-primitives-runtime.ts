import { type ContextToken } from '../frame-manager.js';
import {
  getFocusTargetFromEvent,
  trapDialogTabNavigation,
  type AccessibleDomElementLike,
  type AccessibleDomNodeLike,
} from './dom-accessibility.js';
import { mergeProps } from './props-core.js';
import { type Signal } from './reactive-core.js';
import { createHeadlessUiRuntime } from './headless-ui-runtime.js';
import {
  coerceRenderableToVNode,
  normalizeVNodeChildren,
  resolveChildrenInput,
  vnodeElement,
  vnodePortal,
  type ComponentRenderable,
  type VNode,
  type VNodeInput,
} from './vnode-core.js';

type HeadlessFrameManager = {
  withContext: <T>(
    context: ContextToken<T>,
    value: T,
    renderChildren: () => ComponentRenderable
  ) => ComponentRenderable;
  useContext: <T>(context: ContextToken<T>) => T;
};

type DomDocumentLike = { getElementById?: (id: string) => AccessibleDomElementLike | null };
type DomElementLike = AccessibleDomElementLike & {
  ownerDocument?: DomDocumentLike;
  parentNode?: AccessibleDomNodeLike | null;
};
type DomNodeLike = AccessibleDomNodeLike;

interface HeadlessPrimitivesRuntimeOptions {
  requireActiveFrameManager: (apiName: string) => HeadlessFrameManager;
  headlessUi: ReturnType<typeof createHeadlessUiRuntime>;
}

export const createHeadlessPrimitivesRuntime = (options: HeadlessPrimitivesRuntimeOptions) => {
  const {
    tabsContext,
    dialogContext,
    popoverContext,
    tooltipContext,
    toastContext,
    menuContext,
    checkboxContext,
    radioGroupContext,
    radioItemContext,
    selectContext,
    selectItemContext,
    comboboxContext,
    comboboxItemContext,
    multiselectContext,
    multiselectItemContext,
    getTabsBaseId,
    getDialogBaseId,
    getPopoverBaseId,
    getTooltipBaseId,
    getToastBaseId,
    getMenuBaseId,
    getCheckboxBaseId,
    getRadioBaseId,
    getSelectBaseId,
    getComboboxBaseId,
    getMultiselectBaseId,
    getTabsIds,
    registerTabsValue,
    getTabsNavigationTarget,
    getDialogIds,
    getPopoverIds,
    getTooltipIds,
    getToastIds,
    getMenuIds,
    getCheckboxIds,
    getRadioItemId,
    getSelectIds,
    getComboboxIds,
    getMultiselectIds,
    getRadioIndicatorId,
    getSelectItemId,
    getComboboxItemId,
    getMultiselectItemId,
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
    setTooltipAnchorTarget,
    setSelectAnchorTarget,
    setSelectRestoreTarget,
    restoreSelectFocus,
    setComboboxAnchorTarget,
    setComboboxRestoreTarget,
    restoreComboboxFocus,
    setMultiselectAnchorTarget,
    setMultiselectRestoreTarget,
    restoreMultiselectFocus,
    registerMenuValue,
    registerRadioValue,
    registerSelectValue,
    registerComboboxValue,
    registerMultiselectValue,
    getMenuItemId,
    getMenuNavigationTarget,
    getRadioNavigationTarget,
    getSelectNavigationTarget,
    getComboboxNavigationTarget,
    getMultiselectNavigationTarget,
    getSelectActiveValue,
    getSelectActiveDescendantId,
    setSelectActiveValue,
    acceptSelectActiveValue,
    getComboboxActiveValue,
    getComboboxActiveDescendantId,
    setComboboxActiveValue,
    acceptComboboxActiveValue,
    focusMenuItem,
    focusRadioItem,
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
    omitPopoverLayoutProps,
    pickToastDuration,
    omitToastControlProps,
    getPopoverContentStyle,
  } = options.headlessUi;

  const api = {
    tabs_root: (value: Signal<string>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tabs_root');
      return coerceRenderableToVNode(
        frameManager.withContext(tabsContext, { value, baseId: getTabsBaseId(value), order: [] }, renderChildren)
      );
    },
    tabs_list: (
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode =>
      vnodeElement(
        'div',
        mergeProps({ role: 'tablist', 'data-lumina-tabs-list': 'true' }, props),
        resolveChildrenInput(renderChildren)
      ),
    tabs_trigger: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tabs_trigger');
      const ctx = frameManager.useContext(tabsContext);
      registerTabsValue(ctx, value);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement(
        'button',
        mergeProps(
          {
            role: 'tab',
            type: 'button',
            id: triggerId,
            'aria-controls': panelId,
            'aria-selected': selected ? 'true' : 'false',
            tabIndex: selected ? 0 : -1,
            'data-state': selected ? 'active' : 'inactive',
            onClick: () => ctx.value.set(value),
            onKeyDown: (event?: KeyboardEvent) => {
              const nextValue = getTabsNavigationTarget(ctx, value, String(event?.key ?? ''));
              if (!nextValue) return undefined;
              event?.preventDefault?.();
              ctx.value.set(nextValue);
              return false;
            },
          },
          props
        ),
        children
      );
    },
    tabs_panel: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tabs_panel');
      const ctx = frameManager.useContext(tabsContext);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'tabpanel',
            id: panelId,
            'aria-labelledby': triggerId,
            hidden: !selected,
            tabIndex: selected ? 0 : -1,
            'data-state': selected ? 'active' : 'inactive',
          },
          props
        ),
        children
      );
    },
    dialog_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_root');
      return coerceRenderableToVNode(
        frameManager.withContext(
          dialogContext,
          { open, baseId: getDialogBaseId(open), hasTitle: false, hasDescription: false },
          renderChildren
        )
      );
    },
    dialog_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
    dialog_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_trigger');
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getDialogIds(ctx);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            'aria-haspopup': 'dialog',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': contentId,
            'data-state': open ? 'open' : 'closed',
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setDialogRestoreTarget(ctx, target);
              }
              ctx.open.set(true);
            },
          },
          props
        ),
        children
      );
    },
    dialog_overlay: (props: Record<string, unknown> | null | undefined): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_overlay');
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      return vnodeElement(
        'div',
        mergeProps(
          {
            'data-lumina-dialog-overlay': 'true',
            'data-state': open ? 'open' : 'closed',
            hidden: !open,
            onClick: () => {
              ctx.open.set(false);
              restoreDialogFocus(ctx);
            },
          },
          props
        ),
        []
      );
    },
    dialog_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_content');
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { contentId, titleId, descriptionId } = getDialogIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'dialog',
            id: contentId,
            'aria-modal': 'true',
            'aria-labelledby': ctx.hasTitle ? titleId : undefined,
            'aria-describedby': ctx.hasDescription ? descriptionId : undefined,
            autoFocus: open,
            hidden: !open,
            tabIndex: -1,
            'data-state': open ? 'open' : 'closed',
            onKeyDown: (event?: KeyboardEvent) => {
              if (trapDialogTabNavigation(event)) {
                return false;
              }
              if (String(event?.key ?? '') !== 'Escape') return undefined;
              event?.preventDefault?.();
              ctx.open.set(false);
              restoreDialogFocus(ctx);
              return false;
            },
          },
          props
        ),
        children
      );
    },
    dialog_title: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_title');
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasTitle = true;
      const { titleId } = getDialogIds(ctx);
      return vnodeElement(
        'h2',
        mergeProps(
          {
            id: titleId,
            'data-lumina-dialog-title': 'true',
          },
          props
        ),
        children
      );
    },
    dialog_description: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_description');
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasDescription = true;
      const { descriptionId } = getDialogIds(ctx);
      return vnodeElement(
        'p',
        mergeProps(
          {
            id: descriptionId,
            'data-lumina-dialog-description': 'true',
          },
          props
        ),
        children
      );
    },
    dialog_close: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.dialog_close');
      const ctx = frameManager.useContext(dialogContext);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            'data-lumina-dialog-close': 'true',
            onClick: () => {
              ctx.open.set(false);
              restoreDialogFocus(ctx);
            },
          },
          props
        ),
        children
      );
    },
    popover_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.popover_root');
      return coerceRenderableToVNode(
        frameManager.withContext(popoverContext, { open, baseId: getPopoverBaseId(open) }, renderChildren)
      );
    },
    popover_portal: (children: VNodeInput = []): VNode => {
      const frameManager = options.requireActiveFrameManager('render.popover_portal');
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        'div',
        {
          'data-lumina-popover-dismiss': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          style: {
            position: 'fixed',
            inset: '0',
            background: 'transparent',
            zIndex: '1000',
          },
          onClick: () => {
            ctx.open.set(false);
            restorePopoverFocus(ctx);
          },
        },
        []
      );
      return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
    },
    popover_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.popover_trigger');
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            'aria-haspopup': 'dialog',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': contentId,
            'data-state': open ? 'open' : 'closed',
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setPopoverRestoreTarget(ctx, target);
                setPopoverAnchorTarget(ctx, target as DomElementLike);
              }
              const nextOpen = !ctx.open.get();
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restorePopoverFocus(ctx);
              }
            },
          },
          props
        ),
        children
      );
    },
    popover_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.popover_content');
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'dialog',
            id: contentId,
            'aria-modal': 'false',
            'aria-labelledby': triggerId,
            autoFocus: open,
            hidden: !open,
            tabIndex: -1,
            'data-lumina-popover-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getPopoverAnchorRect(ctx), props),
            onKeyDown: (event?: KeyboardEvent) => {
              if (String(event?.key ?? '') !== 'Escape') return undefined;
              event?.preventDefault?.();
              ctx.open.set(false);
              restorePopoverFocus(ctx);
              return false;
            },
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    tooltip_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tooltip_root');
      return coerceRenderableToVNode(
        frameManager.withContext(tooltipContext, { open, baseId: getTooltipBaseId(open) }, renderChildren)
      );
    },
    tooltip_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
    tooltip_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tooltip_trigger');
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getTooltipIds(ctx);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            'aria-describedby': open ? contentId : undefined,
            'data-state': open ? 'open' : 'closed',
            onMouseEnter: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setTooltipAnchorTarget(ctx, target as DomElementLike);
              }
              ctx.open.set(true);
            },
            onMouseLeave: () => {
              ctx.open.set(false);
            },
            onFocus: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setTooltipAnchorTarget(ctx, target as DomElementLike);
              }
              ctx.open.set(true);
            },
            onBlur: () => {
              ctx.open.set(false);
            },
          },
          props
        ),
        children
      );
    },
    tooltip_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.tooltip_content');
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { contentId } = getTooltipIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'tooltip',
            id: contentId,
            hidden: !open,
            'data-lumina-tooltip-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getTooltipAnchorRect(ctx), props),
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    toast_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.toast_root');
      return coerceRenderableToVNode(
        frameManager.withContext(
          toastContext,
          { open, baseId: getToastBaseId(open), hasTitle: false, hasDescription: false },
          renderChildren
        )
      );
    },
    toast_portal: (children: VNodeInput = []): VNode => vnodePortal(null, children),
    toast_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.toast_content');
      const ctx = frameManager.useContext(toastContext);
      const open = ctx.open.get();
      const { contentId, titleId, descriptionId } = getToastIds(ctx);
      const duration = pickToastDuration(props);
      if (open) {
        scheduleToastTimer(ctx, duration);
      } else {
        clearToastTimer(ctx.open);
      }
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'status',
            id: contentId,
            'aria-live': 'polite',
            'aria-atomic': 'true',
            'aria-labelledby': ctx.hasTitle ? titleId : undefined,
            'aria-describedby': ctx.hasDescription ? descriptionId : undefined,
            hidden: !open,
            tabIndex: 0,
            'data-lumina-toast-content': 'true',
            'data-state': open ? 'open' : 'closed',
            style: {
              position: 'fixed',
              top: '16px',
              right: '16px',
              zIndex: '1002',
            },
            onKeyDown: (event?: KeyboardEvent) => {
              if (String(event?.key ?? '') !== 'Escape') return undefined;
              event?.preventDefault?.();
              clearToastTimer(ctx.open);
              ctx.open.set(false);
              return false;
            },
          },
          omitToastControlProps(props)
        ),
        children
      );
    },
    toast_title: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.toast_title');
      const ctx = frameManager.useContext(toastContext);
      ctx.hasTitle = true;
      const { titleId } = getToastIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            id: titleId,
            'data-lumina-toast-title': 'true',
          },
          props
        ),
        children
      );
    },
    toast_description: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.toast_description');
      const ctx = frameManager.useContext(toastContext);
      ctx.hasDescription = true;
      const { descriptionId } = getToastIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            id: descriptionId,
            'data-lumina-toast-description': 'true',
          },
          props
        ),
        children
      );
    },
    toast_close: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.toast_close');
      const ctx = frameManager.useContext(toastContext);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            'data-lumina-toast-close': 'true',
            onClick: () => {
              clearToastTimer(ctx.open);
              ctx.open.set(false);
            },
          },
          props
        ),
        children
      );
    },
    menu_root: (open: Signal<boolean>, renderChildren: () => ComponentRenderable): VNode => {
      const frameManager = options.requireActiveFrameManager('render.menu_root');
      return coerceRenderableToVNode(
        frameManager.withContext(menuContext, { open, baseId: getMenuBaseId(open), order: [] }, renderChildren)
      );
    },
    menu_portal: (children: VNodeInput = []): VNode => {
      const frameManager = options.requireActiveFrameManager('render.menu_portal');
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        'div',
        {
          'data-lumina-menu-dismiss': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          style: {
            position: 'fixed',
            inset: '0',
            background: 'transparent',
            zIndex: '1000',
          },
          onClick: () => {
            closeMenu(ctx);
          },
        },
        []
      );
      return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
    },
    menu_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.menu_trigger');
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            'aria-haspopup': 'menu',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': contentId,
            'data-state': open ? 'open' : 'closed',
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setMenuRestoreTarget(ctx, target);
                setMenuAnchorTarget(ctx, target as DomElementLike);
              }
              const nextOpen = !ctx.open.get();
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restoreMenuFocus(ctx);
              }
            },
          },
          props
        ),
        children
      );
    },
    menu_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.menu_content');
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'menu',
            id: contentId,
            'aria-labelledby': triggerId,
            hidden: !open,
            tabIndex: -1,
            autoFocus: open,
            'data-lumina-menu-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getMenuAnchorRect(ctx), props),
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeMenu(ctx);
                return false;
              }
              if (key === 'ArrowDown' || key === 'Home') {
                event?.preventDefault?.();
                focusMenuItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  ctx.order[0] ?? ''
                );
                return false;
              }
              if (key === 'ArrowUp' || key === 'End') {
                event?.preventDefault?.();
                focusMenuItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  ctx.order[ctx.order.length - 1] ?? ''
                );
                return false;
              }
              return undefined;
            },
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    menu_item: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.menu_item');
      const ctx = frameManager.useContext(menuContext);
      registerMenuValue(ctx, value);
      const open = ctx.open.get();
      const isFirst = ctx.order[0] === value;
      const itemId = getMenuItemId(ctx, value);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: itemId,
            role: 'menuitem',
            hidden: !open,
            tabIndex: open ? 0 : -1,
            autoFocus: open && isFirst,
            'data-lumina-menu-item': 'true',
            'data-state': open ? 'open' : 'closed',
            onClick: () => {
              closeMenu(ctx);
            },
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeMenu(ctx);
                return false;
              }
              if (key === 'Enter' || key === ' ') {
                event?.preventDefault?.();
                const click = props?.onClick;
                if (typeof click === 'function') {
                  click(event as unknown as Event);
                }
                closeMenu(ctx);
                return false;
              }
              const nextValue = getMenuNavigationTarget(ctx, value, key);
              if (!nextValue) return undefined;
              event?.preventDefault?.();
              focusMenuItem(
                (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                ctx,
                nextValue
              );
              return false;
            },
          },
          props
        ),
        children
      );
    },
    select_root: (
      open: Signal<boolean>,
      value: Signal<string>,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_root');
      return coerceRenderableToVNode(
        frameManager.withContext(selectContext, { open, value, baseId: getSelectBaseId(open), order: [] }, renderChildren)
      );
    },
    select_portal: (children: VNodeInput = []): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_portal');
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        'div',
        {
          'data-lumina-select-dismiss': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          style: {
            position: 'fixed',
            inset: '0',
            background: 'transparent',
            zIndex: '1000',
          },
          onClick: () => {
            closeSelect(ctx);
          },
        },
        []
      );
      return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
    },
    select_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_trigger');
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      const activeDescendantId = open ? getSelectActiveDescendantId(ctx) : null;
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            role: 'combobox',
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': open ? contentId : undefined,
            'aria-activedescendant': activeDescendantId ?? undefined,
            'data-state': open ? 'open' : 'closed',
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setSelectRestoreTarget(ctx, target);
                setSelectAnchorTarget(ctx, target as DomElementLike);
                target.focus?.();
              }
              const nextOpen = !ctx.open.get();
              if (nextOpen) {
                setSelectActiveValue(ctx, ctx.value.get());
              }
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restoreSelectFocus(ctx);
              }
            },
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              const openNow = ctx.open.get();
              const currentValue = ctx.value.get();
              const currentActive = getSelectActiveValue(ctx);
              if (key === 'Escape' && openNow) {
                event?.preventDefault?.();
                closeSelect(ctx);
                return false;
              }
              if (!openNow) {
                if (key === 'ArrowDown' || key === 'Enter' || key === ' ') {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, currentValue);
                  ctx.open.set(true);
                  return false;
                }
                if (key === 'ArrowUp' || key === 'End') {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentValue);
                  ctx.open.set(true);
                  return false;
                }
                if (key === 'Home') {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, ctx.order[0] ?? currentValue);
                  ctx.open.set(true);
                  return false;
                }
                return undefined;
              }
              if (key === 'Enter' || key === ' ' || key === 'Tab') {
                if (key !== 'Tab') {
                  event?.preventDefault?.();
                }
                acceptSelectActiveValue(ctx);
                closeSelect(ctx);
                return key === 'Tab' ? undefined : false;
              }
              if (key === 'Home') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[0] ?? currentActive);
                return false;
              }
              if (key === 'End') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentActive);
                return false;
              }
              const nextValue = getSelectNavigationTarget(ctx, currentActive, key);
              if (!nextValue) return undefined;
              event?.preventDefault?.();
              setSelectActiveValue(ctx, nextValue);
              return false;
            },
          },
          props
        ),
        children
      );
    },
    select_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_content');
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'listbox',
            id: contentId,
            'aria-labelledby': triggerId,
            hidden: !open,
            'data-lumina-select-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getSelectAnchorRect(ctx), props),
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeSelect(ctx);
                return false;
              }
              if (key === 'ArrowDown' || key === 'ArrowRight') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key));
                return false;
              }
              if (key === 'ArrowUp' || key === 'ArrowLeft') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key));
                return false;
              }
              if (key === 'Home') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[0] ?? getSelectActiveValue(ctx));
                return false;
              }
              if (key === 'End') {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? getSelectActiveValue(ctx));
                return false;
              }
              if (key === 'Enter' || key === ' ' || key === 'Tab') {
                if (key !== 'Tab') {
                  event?.preventDefault?.();
                }
                acceptSelectActiveValue(ctx);
                closeSelect(ctx);
                return false;
              }
              return undefined;
            },
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    select_item: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_item');
      const ctx = frameManager.useContext(selectContext);
      registerSelectValue(ctx, value);
      const open = ctx.open.get();
      const currentValue = ctx.value.get();
      const activeValue = getSelectActiveValue(ctx);
      const selected = currentValue === value;
      const active = open && activeValue === value;
      const itemId = getSelectItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(selectItemContext, { value, itemId, selected }, () =>
          vnodeElement(
            'button',
            mergeProps(
              {
                type: 'button',
                id: itemId,
                role: 'option',
                hidden: !open,
                tabIndex: -1,
                'aria-selected': selected ? 'true' : 'false',
                'data-lumina-select-item': 'true',
                'data-active': active ? 'true' : 'false',
                'data-state': selected ? 'checked' : 'unchecked',
                onClick: () => {
                  setSelectActiveValue(ctx, value);
                  acceptSelectActiveValue(ctx);
                  closeSelect(ctx);
                },
                onMouseEnter: () => {
                  setSelectActiveValue(ctx, value);
                },
                onKeyDown: (event?: KeyboardEvent) => {
                  const key = String(event?.key ?? '');
                  if (key === 'Escape') {
                    event?.preventDefault?.();
                    closeSelect(ctx);
                    return false;
                  }
                  if (key === 'Enter' || key === ' ' || key === 'Tab') {
                    if (key !== 'Tab') {
                      event?.preventDefault?.();
                    }
                    setSelectActiveValue(ctx, value);
                    acceptSelectActiveValue(ctx);
                    closeSelect(ctx);
                    return key === 'Tab' ? undefined : false;
                  }
                  const nextValue = getSelectNavigationTarget(ctx, value, key);
                  if (!nextValue) return undefined;
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, nextValue);
                  restoreSelectFocus(ctx);
                  return false;
                },
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    select_indicator: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.select_indicator');
      const ctx = frameManager.useContext(selectItemContext);
      return vnodeElement(
        'span',
        mergeProps(
          {
            id: getSelectIndicatorId(ctx.itemId),
            'aria-hidden': 'true',
            hidden: !ctx.selected,
            'data-lumina-select-indicator': 'true',
            'data-state': ctx.selected ? 'checked' : 'unchecked',
          },
          props
        ),
        children
      );
    },
    combobox_root: (
      open: Signal<boolean>,
      value: Signal<string>,
      query: Signal<string>,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_root');
      return coerceRenderableToVNode(
        frameManager.withContext(
          comboboxContext,
          { open, value, query, baseId: getComboboxBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    combobox_portal: (children: VNodeInput = []): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_portal');
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        'div',
        {
          'data-lumina-combobox-dismiss': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          style: {
            position: 'fixed',
            inset: '0',
            background: 'transparent',
            zIndex: '1000',
          },
          onClick: () => {
            closeCombobox(ctx);
          },
        },
        []
      );
      return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
    },
    combobox_input: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_input');
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      const activeDescendantId = open ? getComboboxActiveDescendantId(ctx) : null;
      return vnodeElement(
        'input',
        mergeProps(
          {
            type: 'text',
            id: inputId,
            role: 'combobox',
            value: ctx.query.get(),
            'aria-autocomplete': 'list',
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': contentId,
            'aria-activedescendant': activeDescendantId ?? undefined,
            'data-state': open ? 'open' : 'closed',
            onInput: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setComboboxRestoreTarget(ctx, target);
                setComboboxAnchorTarget(ctx, target as DomElementLike);
              }
              const nextQuery = String(((event as { target?: { value?: unknown } } | undefined)?.target?.value ?? ''));
              ctx.query.set(nextQuery);
              setComboboxActiveValue(ctx, '');
              ctx.open.set(true);
            },
            onFocus: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (!target) return undefined;
              setComboboxRestoreTarget(ctx, target);
              setComboboxAnchorTarget(ctx, target as DomElementLike);
              setComboboxActiveValue(ctx, ctx.value.get());
              ctx.open.set(true);
              return undefined;
            },
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (!target) return undefined;
              setComboboxRestoreTarget(ctx, target);
              setComboboxAnchorTarget(ctx, target as DomElementLike);
              setComboboxActiveValue(ctx, ctx.value.get());
              ctx.open.set(true);
              return undefined;
            },
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeCombobox(ctx);
                return false;
              }
              if (key === 'Enter') {
                event?.preventDefault?.();
                acceptComboboxActiveValue(ctx);
                closeCombobox(ctx);
                return false;
              }
              if (key === 'ArrowDown' || key === 'ArrowUp') {
                event?.preventDefault?.();
                ctx.open.set(true);
                const currentValue = getComboboxActiveValue(ctx);
                const nextValue =
                  key === 'ArrowDown'
                    ? getComboboxNavigationTarget(ctx, currentValue, currentValue ? 'ArrowDown' : 'Home')
                    : getComboboxNavigationTarget(
                        ctx,
                        currentValue,
                        currentValue ? 'ArrowUp' : 'End'
                      );
                if (nextValue) {
                  setComboboxActiveValue(ctx, nextValue);
                }
                return false;
              }
              return undefined;
            },
          },
          props
        ),
        children
      );
    },
    combobox_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_content');
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'listbox',
            id: contentId,
            'aria-labelledby': inputId,
            hidden: !open,
            tabIndex: -1,
            'data-lumina-combobox-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getComboboxAnchorRect(ctx), props),
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeCombobox(ctx);
                return false;
              }
              if (key === 'Enter') {
                event?.preventDefault?.();
                acceptComboboxActiveValue(ctx);
                closeCombobox(ctx);
                return false;
              }
              if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
                event?.preventDefault?.();
                const currentValue = getComboboxActiveValue(ctx);
                const nextValue = getComboboxNavigationTarget(
                  ctx,
                  currentValue,
                  key === 'ArrowDown' || key === 'ArrowUp' ? key : key
                );
                if (nextValue) {
                  setComboboxActiveValue(ctx, nextValue);
                }
                restoreComboboxFocus(ctx);
                return false;
              }
              return undefined;
            },
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    combobox_item: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_item');
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const query = ctx.query.get().trim().toLowerCase();
      const matchesQuery = query.length === 0 || value.toLowerCase().includes(query);
      if (matchesQuery) {
        registerComboboxValue(ctx, value);
      }
      const currentValue = ctx.value.get();
      const selected = currentValue === value;
      const active = getComboboxActiveValue(ctx) === value;
      const itemId = getComboboxItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(comboboxItemContext, { value, itemId, selected, active }, () =>
          vnodeElement(
            'div',
            mergeProps(
              {
                id: itemId,
                role: 'option',
                hidden: !open || !matchesQuery,
                tabIndex: -1,
                'aria-selected': active ? 'true' : 'false',
                'data-lumina-combobox-item': 'true',
                'data-state': selected ? 'checked' : 'unchecked',
                'data-active': active ? 'true' : 'false',
                onMouseDown: (event?: Event) => {
                  (event as { preventDefault?: () => void } | undefined)?.preventDefault?.();
                  return false;
                },
                onMouseEnter: () => {
                  setComboboxActiveValue(ctx, value);
                },
                onFocus: () => {
                  setComboboxActiveValue(ctx, value);
                },
                onClick: () => {
                  ctx.value.set(value);
                  ctx.query.set(value);
                  setComboboxActiveValue(ctx, value);
                  closeCombobox(ctx);
                },
                onKeyDown: (event?: KeyboardEvent) => {
                  const key = String(event?.key ?? '');
                  if (key === 'Escape') {
                    event?.preventDefault?.();
                    closeCombobox(ctx);
                    return false;
                  }
                  if (key === 'Enter' || key === ' ') {
                    event?.preventDefault?.();
                    ctx.value.set(value);
                    ctx.query.set(value);
                    setComboboxActiveValue(ctx, value);
                    closeCombobox(ctx);
                    return false;
                  }
                  const nextValue = getComboboxNavigationTarget(ctx, value, key);
                  if (!nextValue) return undefined;
                  event?.preventDefault?.();
                  setComboboxActiveValue(ctx, nextValue);
                  restoreComboboxFocus(ctx);
                  return false;
                },
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    combobox_indicator: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.combobox_indicator');
      const ctx = frameManager.useContext(comboboxItemContext);
      return vnodeElement(
        'span',
        mergeProps(
          {
            id: getComboboxIndicatorId(ctx.itemId),
            'aria-hidden': 'true',
            hidden: !ctx.active,
            'data-lumina-combobox-indicator': 'true',
            'data-state': ctx.active ? 'checked' : 'unchecked',
          },
          props
        ),
        children
      );
    },
    multiselect_root: (
      open: Signal<boolean>,
      values: Signal<string[]>,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_root');
      return coerceRenderableToVNode(
        frameManager.withContext(
          multiselectContext,
          { open, values, baseId: getMultiselectBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    multiselect_portal: (children: VNodeInput = []): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_portal');
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        'div',
        {
          'data-lumina-multiselect-dismiss': 'true',
          'data-state': open ? 'open' : 'closed',
          hidden: !open,
          style: {
            position: 'fixed',
            inset: '0',
            background: 'transparent',
            zIndex: '1000',
          },
          onClick: () => {
            closeMultiselect(ctx);
          },
        },
        []
      );
      return vnodePortal(null, [dismissLayer, ...normalizeVNodeChildren(resolveChildrenInput(children))]);
    },
    multiselect_trigger: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_trigger');
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement(
        'button',
        mergeProps(
          {
            type: 'button',
            id: triggerId,
            role: 'combobox',
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': contentId,
            'data-state': open ? 'open' : 'closed',
            onClick: (event?: Event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setMultiselectRestoreTarget(ctx, target);
                setMultiselectAnchorTarget(ctx, target as DomElementLike);
              }
              const nextOpen = !ctx.open.get();
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restoreMultiselectFocus(ctx);
              }
            },
          },
          props
        ),
        children
      );
    },
    multiselect_content: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_content');
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement(
        'div',
        mergeProps(
          {
            role: 'listbox',
            id: contentId,
            'aria-labelledby': triggerId,
            'aria-multiselectable': 'true',
            hidden: !open,
            tabIndex: -1,
            autoFocus: open,
            'data-lumina-multiselect-content': 'true',
            'data-state': open ? 'open' : 'closed',
            'data-side': pickPopoverSide(props),
            style: getPopoverContentStyle(getMultiselectAnchorRect(ctx), props),
            onKeyDown: (event?: KeyboardEvent) => {
              const key = String(event?.key ?? '');
              if (key === 'Escape') {
                event?.preventDefault?.();
                closeMultiselect(ctx);
                return false;
              }
              const currentValues = readStringSelection(ctx.values.get());
              if (key === 'ArrowDown' || key === 'Home') {
                event?.preventDefault?.();
                focusMultiselectItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  currentValues.find((entry) => ctx.order.includes(entry)) ?? (ctx.order[0] ?? ''),
                  getFocusTargetFromEvent(event) as DomNodeLike | null
                );
                return false;
              }
              if (key === 'ArrowUp' || key === 'End') {
                event?.preventDefault?.();
                focusMultiselectItem(
                  (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                  ctx,
                  [...currentValues].reverse().find((entry) => ctx.order.includes(entry))
                    ?? (ctx.order[ctx.order.length - 1] ?? ''),
                  getFocusTargetFromEvent(event) as DomNodeLike | null
                );
                return false;
              }
              return undefined;
            },
          },
          omitPopoverLayoutProps(props)
        ),
        children
      );
    },
    multiselect_item: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_item');
      const ctx = frameManager.useContext(multiselectContext);
      registerMultiselectValue(ctx, value);
      const open = ctx.open.get();
      const selectedValues = readStringSelection(ctx.values.get());
      const selected = selectedValues.includes(value);
      const itemId = getMultiselectItemId(ctx, value);
      const firstSelected = selectedValues.find((entry) => ctx.order.includes(entry));
      const isFirst = ctx.order[0] === value;
      const shouldAutoFocus = open && ((selected && value === firstSelected) || (!firstSelected && isFirst));
      return coerceRenderableToVNode(
        frameManager.withContext(multiselectItemContext, { value, itemId, selected }, () =>
          vnodeElement(
            'button',
            mergeProps(
              {
                type: 'button',
                id: itemId,
                role: 'option',
                hidden: !open,
                tabIndex: open ? (selected ? 0 : -1) : -1,
                autoFocus: shouldAutoFocus,
                'aria-selected': selected ? 'true' : 'false',
                'data-lumina-multiselect-item': 'true',
                'data-state': selected ? 'checked' : 'unchecked',
                onClick: () => {
                  toggleMultiselectValue(ctx, value);
                },
                onKeyDown: (event?: KeyboardEvent) => {
                  const key = String(event?.key ?? '');
                  if (key === 'Escape') {
                    event?.preventDefault?.();
                    closeMultiselect(ctx);
                    return false;
                  }
                  if (key === 'Enter' || key === ' ') {
                    event?.preventDefault?.();
                    toggleMultiselectValue(ctx, value);
                    return false;
                  }
                  const nextValue = getMultiselectNavigationTarget(ctx, value, key);
                  if (!nextValue) return undefined;
                  event?.preventDefault?.();
                  focusMultiselectItem(
                    (getFocusTargetFromEvent(event) as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                    ctx,
                    nextValue,
                    getFocusTargetFromEvent(event) as DomNodeLike | null
                  );
                  return false;
                },
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    multiselect_indicator: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.multiselect_indicator');
      const ctx = frameManager.useContext(multiselectItemContext);
      return vnodeElement(
        'span',
        mergeProps(
          {
            id: getMultiselectIndicatorId(ctx.itemId),
            'aria-hidden': 'true',
            hidden: !ctx.selected,
            'data-lumina-multiselect-indicator': 'true',
            'data-state': ctx.selected ? 'checked' : 'unchecked',
          },
          props
        ),
        children
      );
    },
    checkbox_root: (
      checked: Signal<boolean>,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.checkbox_root');
      return coerceRenderableToVNode(
        frameManager.withContext(checkboxContext, { checked, baseId: getCheckboxBaseId(checked) }, () => {
          const ctx = frameManager.useContext(checkboxContext);
          const current = ctx.checked.get();
          const { rootId, indicatorId } = getCheckboxIds(ctx);
          return vnodeElement(
            'button',
            mergeProps(
              {
                type: 'button',
                id: rootId,
                role: 'checkbox',
                'aria-checked': current ? 'true' : 'false',
                'aria-controls': indicatorId,
                tabIndex: 0,
                'data-lumina-checkbox-root': 'true',
                'data-state': current ? 'checked' : 'unchecked',
                onClick: () => {
                  ctx.checked.set(!ctx.checked.get());
                },
                onKeyDown: (event?: KeyboardEvent) => {
                  const key = String(event?.key ?? '');
                  if (key !== 'Enter' && key !== ' ') return undefined;
                  event?.preventDefault?.();
                  ctx.checked.set(!ctx.checked.get());
                  return false;
                },
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          );
        })
      );
    },
    checkbox_indicator: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.checkbox_indicator');
      const ctx = frameManager.useContext(checkboxContext);
      const current = ctx.checked.get();
      const { indicatorId } = getCheckboxIds(ctx);
      return vnodeElement(
        'span',
        mergeProps(
          {
            id: indicatorId,
            'aria-hidden': 'true',
            hidden: !current,
            'data-lumina-checkbox-indicator': 'true',
            'data-state': current ? 'checked' : 'unchecked',
          },
          props
        ),
        children
      );
    },
    radio_group: (
      value: Signal<string>,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.radio_group');
      return coerceRenderableToVNode(
        frameManager.withContext(radioGroupContext, { value, baseId: getRadioBaseId(value), order: [] }, () =>
          vnodeElement(
            'div',
            mergeProps(
              {
                role: 'radiogroup',
                'data-lumina-radio-group': 'true',
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    radio_item: (
      value: string,
      props: Record<string, unknown> | null | undefined,
      renderChildren: () => ComponentRenderable
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.radio_item');
      const ctx = frameManager.useContext(radioGroupContext);
      registerRadioValue(ctx, value);
      const selected = ctx.value.get() === value;
      const itemId = getRadioItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(radioItemContext, { value, itemId, selected }, () =>
          vnodeElement(
            'button',
            mergeProps(
              {
                type: 'button',
                id: itemId,
                role: 'radio',
                'aria-checked': selected ? 'true' : 'false',
                tabIndex: selected ? 0 : -1,
                'data-lumina-radio-item': 'true',
                'data-state': selected ? 'checked' : 'unchecked',
                onClick: () => {
                  ctx.value.set(value);
                },
                onKeyDown: (event?: KeyboardEvent) => {
                  const key = String(event?.key ?? '');
                  if (key === 'Enter' || key === ' ') {
                    event?.preventDefault?.();
                    ctx.value.set(value);
                    return false;
                  }
                  const nextValue = getRadioNavigationTarget(ctx, value, key);
                  if (!nextValue) return undefined;
                  event?.preventDefault?.();
                  ctx.value.set(nextValue);
                  const focusTarget = getFocusTargetFromEvent(event) as DomElementLike | null;
                  focusRadioItem(
                    (focusTarget as { ownerDocument?: DomDocumentLike } | null)?.ownerDocument,
                    ctx,
                    nextValue,
                    focusTarget?.parentNode ?? null
                  );
                  return false;
                },
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    radio_indicator: (
      props: Record<string, unknown> | null | undefined,
      children: VNodeInput = []
    ): VNode => {
      const frameManager = options.requireActiveFrameManager('render.radio_indicator');
      const ctx = frameManager.useContext(radioItemContext);
      return vnodeElement(
        'span',
        mergeProps(
          {
            id: getRadioIndicatorId(ctx.itemId),
            'aria-hidden': 'true',
            hidden: !ctx.selected,
            'data-lumina-radio-indicator': 'true',
            'data-state': ctx.selected ? 'checked' : 'unchecked',
          },
          props
        ),
        children
      );
    },
  };

  return api;
};
