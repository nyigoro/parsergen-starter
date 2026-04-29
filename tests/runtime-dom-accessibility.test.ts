import { TestingElement, TestingTextNode, TestingDocument } from '../src/testing-dom.js';
import {
  collectFocusableDescendants,
  findDomElementById,
  findFirstFocusableDescendant,
  getDomAttribute,
  isElementInert,
  readChildNodes,
  trapDialogTabNavigation,
} from '../src/runtime/dom-accessibility.js';

describe('runtime dom accessibility helpers', () => {
  test('reads child nodes, ids, and attributes from testing DOM trees', () => {
    const document = new TestingDocument();
    const root = document.createElement('div');
    const button = document.createElement('button');
    button.setAttribute('id', 'save');
    button.setAttribute('aria-label', 'Save');
    button.appendChild(new TestingTextNode('Save'));
    root.appendChild(button);

    expect(readChildNodes(root)).toEqual([button]);
    expect(findDomElementById(root, 'save')).toBe(button);
    expect(getDomAttribute(button, 'aria-label')).toBe('Save');
  });

  test('collects focusable descendants and skips hidden/disabled nodes', () => {
    const document = new TestingDocument();
    const root = document.createElement('div');
    const button = document.createElement('button');
    const hiddenInput = document.createElement('input');
    hiddenInput.hidden = true;
    const disabledSelect = document.createElement('select');
    disabledSelect.disabled = true;
    const link = document.createElement('a');
    link.setAttribute('href', '/docs');

    root.appendChild(button);
    root.appendChild(hiddenInput);
    root.appendChild(disabledSelect);
    root.appendChild(link);

    expect(collectFocusableDescendants(root)).toEqual([button, link]);
    expect(findFirstFocusableDescendant(root)).toBe(button);
  });

  test('treats inert subtrees as non-focusable', () => {
    const document = new TestingDocument();
    const root = document.createElement('div');
    const inertRegion = document.createElement('div');
    inertRegion.setAttribute('inert', '');
    const inertButton = document.createElement('button');
    const liveButton = document.createElement('button');

    inertRegion.appendChild(inertButton);
    root.appendChild(inertRegion);
    root.appendChild(liveButton);

    expect(isElementInert(inertButton)).toBe(true);
    expect(collectFocusableDescendants(root)).toEqual([liveButton]);
    expect(findFirstFocusableDescendant(root)).toBe(liveButton);
  });

  test('traps tab navigation within a dialog-like container', () => {
    const document = new TestingDocument();
    const container = document.createElement('div');
    const first = document.createElement('button');
    const second = document.createElement('button');
    container.appendChild(first);
    container.appendChild(second);
    document.body.appendChild(container);

    const preventDefault = jest.fn();

    document.activeElement = container as TestingElement;
    expect(trapDialogTabNavigation({ key: 'Tab', currentTarget: container, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(first);

    document.activeElement = first as TestingElement;
    expect(trapDialogTabNavigation({ key: 'Tab', shiftKey: true, currentTarget: container, preventDefault })).toBe(true);
    expect(document.activeElement).toBe(second);

    document.activeElement = second as TestingElement;
    expect(trapDialogTabNavigation({ key: 'Tab', currentTarget: container, preventDefault })).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});
