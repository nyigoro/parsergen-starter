import { type Signal } from './reactive-core.js';

export interface TransitionRuntimeHooks<TRenderable, TChildren> {
  state: <T>(initial: T) => Signal<T>;
  remember: <T>(compute: () => T) => T;
  mergeProps: (left: unknown, right: unknown) => Record<string, unknown>;
  element: (tag: string, props: Record<string, unknown> | null | undefined, children: TChildren) => TRenderable;
  fragment: (children: TChildren) => TRenderable;
  resolveChildrenInput: (children: () => unknown) => TChildren;
  runMicrotask: (fn: () => void) => void;
}

const clearTimerHandle = (handle: ReturnType<typeof setTimeout> | null | undefined): void => {
  if (handle !== null && handle !== undefined) {
    clearTimeout(handle);
  }
};

export const createTransitionRuntime = <TRenderable, TChildren>(
  hooks: TransitionRuntimeHooks<TRenderable, TChildren>
) => ({
  transitionPresence: (
    open: Signal<boolean>,
    props: Record<string, unknown> | null | undefined,
    durationMs: number,
    children: () => unknown
  ): TRenderable => {
    const mounted = hooks.state(open.peek());
    const phase = hooks.state(open.peek() ? 'entered' : 'hidden');
    const refs = hooks.remember(() => ({
      lastOpen: open.peek(),
      settleTimer: null as ReturnType<typeof setTimeout> | null,
      unmountTimer: null as ReturnType<typeof setTimeout> | null,
    }));

    const openNow = open.get();
    let mountedNow = mounted.get();
    let phaseNow = phase.get();
    if (openNow !== refs.lastOpen) {
      refs.lastOpen = openNow;
      clearTimerHandle(refs.settleTimer);
      clearTimerHandle(refs.unmountTimer);
      refs.settleTimer = null;
      refs.unmountTimer = null;

      if (openNow) {
        if (!mountedNow) {
          mounted.set(true);
          mountedNow = true;
        }
        phase.set('enter-from');
        phaseNow = 'enter-from';
        hooks.runMicrotask(() => {
          if (open.peek()) phase.set('enter-to');
        });
        refs.settleTimer = setTimeout(() => {
          if (open.peek()) phase.set('entered');
          refs.settleTimer = null;
        }, durationMs);
      } else if (mountedNow) {
        phase.set('exit-from');
        phaseNow = 'exit-from';
        hooks.runMicrotask(() => {
          if (!open.peek()) phase.set('exit-to');
        });
        refs.unmountTimer = setTimeout(() => {
          if (!open.peek()) {
            mounted.set(false);
            phase.set('hidden');
          }
          refs.unmountTimer = null;
        }, durationMs);
      }
    }

    if (!openNow && !mountedNow) {
      return hooks.fragment([] as unknown as TChildren);
    }

    const currentPhase = openNow && phaseNow === 'hidden' ? 'entered' : phaseNow;
    const currentProps = hooks.mergeProps(props, {
      'data-transition-state': currentPhase,
      'data-transition-open': openNow ? 'true' : 'false',
      'data-transition-duration': String(durationMs),
    });

    return hooks.element('div', currentProps, hooks.resolveChildrenInput(children));
  },
});
