import { generateJSFromAst } from '../src/lumina/codegen-js.js';
import { render } from '../src/lumina-runtime.js';
import { parseLuminaProgram } from './helpers/lumina-parser.js';

describe('render prop helpers', () => {
  test('new props return the expected object shape', () => {
    expect(render.props_id('foo')).toEqual({ id: 'foo' });
    expect(render.props_style('color:red')).toEqual({ style: 'color:red' });
    expect(render.props_value('hello')).toEqual({ value: 'hello' });
    expect(render.props_checked(true)).toEqual({ checked: true });
    expect(render.props_type('checkbox')).toEqual({ type: 'checkbox' });
    expect(render.props_name('contact')).toEqual({ name: 'contact' });
    expect(render.props_placeholder('Enter...')).toEqual({ placeholder: 'Enter...' });
    expect(render.props_href('/home')).toEqual({ href: '/home' });
    expect(render.props_disabled(true)).toEqual({ disabled: true });
    expect(render.props_key('item-1')).toEqual({ key: 'item-1' });
    expect(render.keyed('panel', render.text('Profile')).key).toBe('panel');
    expect(() => render.props_key({ id: 'bad' })).toThrow(
      'props_key key must be a string or number'
    );
  });

  test('input and change handlers extract string values', () => {
    const onInput = jest.fn();
    const onChange = jest.fn();
    const inputProps = render.props_on_input(onInput) as { onInput?: (event: Event) => void };
    const changeProps = render.props_on_change(onChange) as { onChange?: (event: Event) => void };

    inputProps.onInput?.({ target: { value: 'typed text' } } as unknown as Event);
    changeProps.onChange?.({ target: { value: 'changed text' } } as unknown as Event);

    expect(onInput).toHaveBeenCalledWith('typed text');
    expect(onChange).toHaveBeenCalledWith('changed text');
  });

  test('checked-change and submit handlers normalize DOM events', () => {
    const onChecked = jest.fn();
    const onSubmit = jest.fn();
    const preventDefault = jest.fn();
    const checkedProps = render.props_on_checked_change(onChecked) as {
      onChange?: (event: Event) => void;
    };
    const submitProps = render.props_on_submit(onSubmit) as { onSubmit?: (event: Event) => void };

    checkedProps.onChange?.({ target: { checked: true } } as unknown as Event);
    submitProps.onSubmit?.({ preventDefault } as unknown as Event);

    expect(onChecked).toHaveBeenCalledWith(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('props_merge composes new helpers with existing props', () => {
    const handler = jest.fn();
    const merged = render.props_merge(render.props_class('x'), render.props_id('y')) as {
      className?: string;
      id?: string;
    };
    expect(merged).toEqual({ className: 'x', id: 'y' });

    const mergedHandler = render.props_merge(
      render.props_class('x'),
      render.props_on_input(handler)
    ) as {
      className?: string;
      onInput?: (event: Event) => void;
    };
    expect(mergedHandler.className).toBe('x');
    expect(typeof mergedHandler.onInput).toBe('function');
    mergedHandler.onInput?.({ target: { value: 'merged value' } } as unknown as Event);
    expect(handler).toHaveBeenCalledWith('merged value');
  });

  test('props_merge composes classes, styles, and event handlers instead of overwriting', () => {
    const left = jest.fn(() => false);
    const right = jest.fn();
    const preventDefault = jest.fn();

    const merged = render.props_merge(
      {
        className: 'base',
        style: 'color:red',
        onClick: left,
      },
      {
        className: 'accent',
        style: 'background:blue',
        onClick: right,
      }
    ) as {
      className?: string;
      style?: string;
      onClick?: (event: Event) => void;
    };

    expect(merged.className).toBe('base accent');
    expect(merged.style).toBe('color:red;background:blue');

    merged.onClick?.({ preventDefault } as unknown as Event);
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  test('compose_handlers chains callbacks directly', () => {
    const left = jest.fn();
    const right = jest.fn();
    const composed = render.compose_handlers(left, right);

    composed?.('payload');

    expect(left).toHaveBeenCalledWith('payload');
    expect(right).toHaveBeenCalledWith('payload');
  });

  test('stdlib wrappers emit render runtime calls for composition helpers', () => {
    const source =
      `
      import {
        children,
        composeHandlers,
        createContext,
        keyed,
        props_checked,
        props_name,
        props_on_checked_change,
        props_on_submit,
        props_type,
        slot,
        text,
        useContext,
        withContext
      } from "@std/render";

      fn main() -> VNode {
        let theme = createContext("light");
        let _click = composeHandlers(0, 0);
        let _items = children(text("item"));
        let _keyed = keyed("stable", text("panel"));
        let _checked = props_checked(true);
        let _type = props_type("checkbox");
        let _name = props_name("contact");
        let _toggle = props_on_checked_change(fn(next: bool) -> void {
          let _ = next;
        });
        let _submit = props_on_submit(fn() -> void {
          let _ = 0;
        });
        let _wrapped = withContext(theme, "dark", slot(text(useContext(theme)), 0));
        text("done")
      }
    `.trim() + '\n';

    const ast = parseLuminaProgram(source);
    const js = generateJSFromAst(ast, { target: 'esm', includeRuntime: true }).code;
    expect(js).toMatch(
      /import \{[^}]*\bprops_checked\b[^}]*\bprops_type\b[^}]*\bprops_name\b[^}]*\bprops_on_checked_change\b[^}]*\bprops_on_submit\b[^}]*\} from "\.\/lumina-runtime\.js";/s
    );
    expect(js).toContain('createContext("light")');
    expect(js).toContain('withContext(theme, "dark"');
    expect(js).toContain('useContext(theme)');
    expect(js).toContain('keyed("stable"');
    expect(js).toContain('props_checked(true)');
    expect(js).toContain('props_type("checkbox")');
    expect(js).toContain('props_name("contact")');
    expect(js).toContain('props_on_checked_change');
    expect(js).toContain('props_on_submit');
    expect(js).toContain('composeHandlers');
    expect(
      js.includes('children(text("item"))') ||
        (js.includes('const __lumina_static_render_') &&
          js.includes('children(__lumina_static_render_'))
    ).toBe(true);
    expect(js).toContain('slot(text(useContext(theme)), 0)');
  });
});
