import { Signal } from '../src/runtime/reactive-core.js';
import {
  applyVNodeKey,
  coerceRenderableToVNode,
  indexListHostProps,
  isVNode,
  materializeForListChildren,
  materializeIndexListChildren,
  normalizeVNodeChildren,
  parseVNode,
  resolveChildrenInput,
  serializeVNode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeKeyed,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
} from '../src/runtime/vnode-core.js';

describe('runtime vnode core', () => {
  test('normalizes children and constructors preserve basic shape', () => {
    const children = normalizeVNodeChildren(['a', [vnodeText('b')], false, null, 3]);
    expect(children).toHaveLength(3);
    expect(children[0]?.text).toBe('a');
    expect(children[1]?.text).toBe('b');
    expect(children[2]?.text).toBe('3');

    const element = vnodeElement('section', { id: 'hero', skip: undefined }, children);
    const portal = vnodePortal('#modal', [element]);
    const fragment = vnodeFragment([portal]);

    expect(element.props).toEqual({ id: 'hero' });
    expect(portal.target).toBe('#modal');
    expect(fragment.kind).toBe('fragment');
    expect(isVNode(fragment)).toBe(true);
  });

  test('coerces renderables, applies keys, and serializes snapshots', () => {
    const live = vnodeLiveText(new Signal('Ada'));
    const keyed = applyVNodeKey(vnodeElement('li', null, [live]), 'user-1');
    const explicit = vnodeKeyed('user-2', () => vnodeElement('li', null, [vnodeText('Grace')]));
    const coerced = coerceRenderableToVNode([keyed, vnodeText('tail')]);
    const json = serializeVNode(coerced);
    const parsed = parseVNode(json);

    expect(coerced.kind).toBe('fragment');
    expect(explicit.key).toBe('user-2');
    expect(parsed.kind).toBe('fragment');
    expect(parsed.children?.[0]?.key).toBe('user-1');
    expect(parsed.children?.[0]?.children?.[0]?.text).toBe('Ada');
  });

  test('rejects invalid keys and conflicting assigned keys', () => {
    expect(() => vnodeElement('li', { key: { id: 'bad' } }, [])).toThrow(
      'VNode key must be a string or number'
    );
    expect(() => vnodeKeyed({}, vnodeText('bad'))).toThrow('VNode key must be a string or number');
    expect(() => applyVNodeKey(vnodeElement('li', { key: 'child' }, []), 'parent')).toThrow(
      "Conflicting keyed child: child already has key 'child' but parent assigned 'parent'"
    );
  });

  test('materializes index and keyed lists into stable host nodes', () => {
    const items = new Signal(['one', 'two']);
    const indexNode = vnodeIndexList(items, (item, index) =>
      vnodeElement('row', { index }, [vnodeText(item.get())])
    );
    const keyedNode = vnodeForList(items, (item) => String(item), (item, index) =>
      vnodeElement('row', { index: index.get() }, [vnodeText(item.get())])
    );

    const indexChildren = materializeIndexListChildren(indexNode, false);
    const keyedChildren = materializeForListChildren(keyedNode, false);

    expect(indexChildren).toHaveLength(2);
    expect(indexChildren[0]?.tag).toBe('row');
    expect(keyedChildren[1]?.key).toBe('two');
    expect(indexListHostProps['data-lumina-index-list']).toBe('true');
  });

  test('rejects duplicate keyed children and resolves callable child inputs', () => {
    const items = new Signal(['dup', 'dup']);
    const keyedNode = vnodeForList(items, (item) => String(item), (item) => vnodeText(item.get()));

    expect(() => materializeForListChildren(keyedNode, false)).toThrow(/Duplicate keyed child/);
    expect(resolveChildrenInput(() => [vnodeText('slot')])).toEqual([vnodeText('slot')]);
  });
});
