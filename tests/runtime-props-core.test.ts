import {
  composeHandlers,
  mergeProps,
  normalizeAuthoringPropName,
  propsAttr,
  propsChecked,
  propsClass,
  propsDisabled,
  propsHref,
  propsId,
  propsKey,
  propsName,
  propsOnChange,
  propsOnCheckedChange,
  propsOnClick,
  propsOnClickDec,
  propsOnClickDelta,
  propsOnClickInc,
  propsOnInput,
  propsOnSubmit,
  propsPlaceholder,
  propsStyle,
  propsType,
  propsValue,
  propsWhen,
} from '../src/runtime/props-core.js';
import { Signal } from '../src/runtime/reactive-core.js';

describe('runtime props core', () => {
  test('composeHandlers preserves both results and preventDefault semantics', () => {
    const calls: string[] = [];
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    const handler = composeHandlers(
      () => {
        calls.push('left');
        return false;
      },
      () => {
        calls.push('right');
        return 'done';
      }
    );

    expect(handler?.(event as unknown as Event)).toBe('done');
    expect(calls).toEqual(['left', 'right']);
    expect(event.prevented).toBe(true);
  });

  test('mergeProps merges classes styles and event handlers', () => {
    const calls: string[] = [];
    const merged = mergeProps(
      {
        className: 'alpha beta',
        style: { color: 'red' },
        onClick: () => {
          calls.push('left');
        },
      },
      {
        className: 'beta gamma',
        style: { background: 'blue' },
        onClick: () => {
          calls.push('right');
        },
      }
    );

    expect(merged.className).toBe('alpha beta gamma');
    expect(merged.style).toEqual({ color: 'red', background: 'blue' });
    expect(typeof merged.onClick).toBe('function');
    (merged.onClick as () => void)();
    expect(calls).toEqual(['left', 'right']);
  });

  test('normalizes authoring prop names and conditional props', () => {
    expect(normalizeAuthoringPropName('class')).toBe('className');
    expect(normalizeAuthoringPropName('data_state')).toBe('data-state');
    expect(normalizeAuthoringPropName('aria_labelledby')).toBe('aria-labelledby');
    expect(normalizeAuthoringPropName('on_checked_change')).toBe('onCheckedChange');
    expect(propsAttr('data_state', 'open')).toEqual({ 'data-state': 'open' });
    expect(propsWhen(false, { hidden: true })).toEqual({});
    expect(propsWhen(new Signal(true), { hidden: true })).toEqual({ hidden: true });
  });

  test('signal-backed click props mutate signals', () => {
    const signal = new Signal(1);
    (propsOnClickDelta(signal, 4).onClick as () => void)();
    expect(signal.get()).toBe(5);
    (propsOnClickInc(signal).onClick as () => void)();
    expect(signal.get()).toBe(6);
    (propsOnClickDec(signal).onClick as () => void)();
    expect(signal.get()).toBe(5);
  });

  test('form prop handlers read event payloads', () => {
    let textValue = '';
    let checkedValue = false;
    let submitted = 0;
    propsOnInput((value) => {
      textValue = value;
    }).onInput?.({ target: { value: 'hello' } } as unknown as Event);
    propsOnChange((value) => {
      textValue = `${value}!`;
    }).onChange?.({ target: { value: 'world' } } as unknown as Event);
    propsOnCheckedChange((checked) => {
      checkedValue = checked;
    }).onChange?.({ target: { checked: 1 } } as unknown as Event);
    propsOnSubmit(() => {
      submitted += 1;
    }).onSubmit?.({ preventDefault() {} } as unknown as Event);

    expect(textValue).toBe('world!');
    expect(checkedValue).toBe(true);
    expect(submitted).toBe(1);
  });

  test('simple prop builders remain plain records', () => {
    expect(propsClass('hero')).toEqual({ className: 'hero' });
    expect(propsId('root')).toEqual({ id: 'root' });
    expect(propsStyle('color:red')).toEqual({ style: 'color:red' });
    expect(propsValue('value')).toEqual({ value: 'value' });
    expect(propsChecked(true)).toEqual({ checked: true });
    expect(propsType('button')).toEqual({ type: 'button' });
    expect(propsName('group')).toEqual({ name: 'group' });
    expect(propsPlaceholder('search')).toEqual({ placeholder: 'search' });
    expect(propsHref('/docs')).toEqual({ href: '/docs' });
    expect(propsDisabled(true)).toEqual({ disabled: true });
    expect(propsKey('row-1')).toEqual({ key: 'row-1' });
  });

  test('click prop wrapper preserves false semantics', () => {
    let prevented = false;
    const props = propsOnClick(() => false);
    const result = (props.onClick as (event: Event) => unknown)({
      preventDefault() {
        prevented = true;
      },
    } as unknown as Event);
    expect(result).toBe(false);
    expect(prevented).toBe(true);
  });
});
