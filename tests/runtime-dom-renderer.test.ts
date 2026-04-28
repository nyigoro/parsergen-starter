import { readChildNodes } from '../src/runtime/dom-accessibility.js';
import { createDomRenderer } from '../src/runtime/dom-renderer.js';
import { vnodeElement, vnodeText } from '../src/runtime/vnode-core.js';
import { TestingDocument, TestingElement } from '../src/testing-dom.js';

const childText = (element: TestingElement): string =>
  readChildNodes(element)
    .map((node) => node.textContent ?? '')
    .join('');

describe('runtime dom renderer', () => {
  test('mounts, patches, and unmounts element trees through the extracted renderer', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const renderer = createDomRenderer({ document }, Object.is);

    const prev = vnodeElement('button', { id: 'save', className: 'primary' }, [vnodeText('Save')]);
    const next = vnodeElement('button', { id: 'save', className: 'secondary' }, [vnodeText('Saved')]);

    renderer.mount(prev, container);

    const mounted = readChildNodes(container)[0] as TestingElement;
    expect(mounted.tagName).toBe('button');
    expect(mounted.getAttribute('id')).toBe('save');
    expect(childText(mounted)).toBe('Save');

    renderer.patch?.(prev, next, container);

    const patched = readChildNodes(container)[0] as TestingElement;
    expect(patched).toBe(mounted);
    expect(patched.className).toBe('secondary');
    expect(childText(patched)).toBe('Saved');

    renderer.unmount?.(container);
    expect(readChildNodes(container)).toHaveLength(0);
  });

  test('hydrates existing dom nodes without replacing the root element', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const existing = document.createElement('section');
    existing.appendChild(document.createTextNode('Hello'));
    container.appendChild(existing);

    const renderer = createDomRenderer({ document }, Object.is);
    const node = vnodeElement('section', {}, [vnodeText('Hello')]);

    renderer.hydrate?.(node, container);

    const hydrated = readChildNodes(container)[0] as TestingElement;
    expect(hydrated).toBe(existing);
    expect(childText(hydrated)).toBe('Hello');

    const next = vnodeElement('section', {}, [vnodeText('Hydrated')]);
    renderer.patch?.(node, next, container);
    expect(childText(hydrated)).toBe('Hydrated');
  });
});
