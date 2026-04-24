import {
  TestingNode,
  TestingDocument,
  TestingTextNode,
  createTestingDomHarness,
  getTestingHarnessContainer,
  getTestingHarnessBody,
  getTestingHarnessById,
  getTestingHarnessByText,
  queryTestingHarnessByRole,
  getTestingTextContent,
  dispatchTestingClick,
  dispatchTestingInput,
  dispatchTestingCheckedChange,
  dispatchTestingKeydown,
  dispatchTestingSubmit,
} from '../src/testing-dom.js';

describe('testing DOM matrix', () => {
  test('appendChild grows childNodes length', () => {
    const parent = new TestingNode();
    parent.appendChild(new TestingTextNode('a'));
    expect(parent.childNodes.length).toBe(1);
  });

  test('childNodes item resolves inserted node', () => {
    const parent = new TestingNode();
    const child = new TestingTextNode('a');
    parent.appendChild(child);
    expect(parent.childNodes.item(0)).toBe(child);
  });

  test('childNodes iterator yields nodes in append order', () => {
    const parent = new TestingNode();
    const first = new TestingTextNode('a');
    const second = new TestingTextNode('b');
    parent.appendChild(first);
    parent.appendChild(second);
    expect(Array.from(parent.childNodes)).toEqual([first, second]);
  });

  test('appendChild sets parentNode on inserted child', () => {
    const parent = new TestingNode();
    const child = new TestingTextNode('a');
    parent.appendChild(child);
    expect(child.parentNode).toBe(parent);
  });

  test('removeChild detaches an existing child', () => {
    const parent = new TestingNode();
    const child = new TestingTextNode('a');
    parent.appendChild(child);
    parent.removeChild(child);
    expect(parent.childNodes.length).toBe(0);
  });

  test('removeChild clears parentNode on detached child', () => {
    const parent = new TestingNode();
    const child = new TestingTextNode('a');
    parent.appendChild(child);
    parent.removeChild(child);
    expect(child.parentNode).toBeNull();
  });

  test('replaceChild swaps the node in place', () => {
    const parent = new TestingNode();
    const oldChild = new TestingTextNode('a');
    const newChild = new TestingTextNode('b');
    parent.appendChild(oldChild);
    parent.replaceChild(newChild, oldChild);
    expect(parent.childNodes.item(0)).toBe(newChild);
  });

  test('replaceChild clears oldChild parentNode', () => {
    const parent = new TestingNode();
    const oldChild = new TestingTextNode('a');
    const newChild = new TestingTextNode('b');
    parent.appendChild(oldChild);
    parent.replaceChild(newChild, oldChild);
    expect(oldChild.parentNode).toBeNull();
  });

  test('replaceChild sets newChild parentNode', () => {
    const document = new TestingDocument();
    const parent = document.createElement('div');
    const oldChild = document.createTextNode('a');
    const newChild = document.createTextNode('b');
    parent.appendChild(oldChild);
    parent.replaceChild(newChild, oldChild);
    expect(newChild.parentNode).toBe(parent);
  });

  test('numeric childNodes index access works', () => {
    const parent = new TestingNode();
    const child = new TestingTextNode('a');
    parent.appendChild(child);
    expect(parent.childNodes[0]).toBe(child);
  });

  test('createElement lowercases tagName', () => {
    const document = new TestingDocument();
    expect(document.createElement('SECTION').tagName).toBe('section');
  });

  test('createTextNode stores text content', () => {
    const document = new TestingDocument();
    expect(document.createTextNode('hello').textContent).toBe('hello');
  });

  test('getElementById finds nested descendants', () => {
    const document = new TestingDocument();
    const wrapper = document.createElement('div');
    const nested = document.createElement('button');
    nested.setAttribute('id', 'save');
    wrapper.appendChild(nested);
    document.body.appendChild(wrapper);
    expect(document.getElementById('save')).toBe(nested);
  });

  test('querySelector returns body', () => {
    const document = new TestingDocument();
    expect(document.querySelector('body')).toBe(document.body);
  });

  test('querySelector resolves id selectors', () => {
    const document = new TestingDocument();
    const nested = document.createElement('button');
    nested.setAttribute('id', 'save');
    document.body.appendChild(nested);
    expect(document.querySelector('#save')).toBe(nested);
  });

  test.each([
    ['button', (document: TestingDocument) => document.createElement('button')],
    ['link', (document: TestingDocument) => {
      const el = document.createElement('a');
      el.setAttribute('href', '/docs');
      return el;
    }],
    ['textbox', (document: TestingDocument) => document.createElement('input')],
    ['textbox', (document: TestingDocument) => document.createElement('textarea')],
    ['combobox', (document: TestingDocument) => document.createElement('select')],
    ['checkbox', (document: TestingDocument) => {
      const el = document.createElement('input');
      el.setAttribute('type', 'checkbox');
      return el;
    }],
    ['radio', (document: TestingDocument) => {
      const el = document.createElement('input');
      el.setAttribute('type', 'radio');
      return el;
    }],
  ] as const)('queryTestingHarnessByRole finds implicit %s roles', (role, factory) => {
    const document = new TestingDocument();
    const element = factory(document);
    document.body.appendChild(element);
    expect(queryTestingHarnessByRole(document.body, role)).toEqual([element]);
  });

  test('queryTestingHarnessByRole respects explicit roles', () => {
    const document = new TestingDocument();
    const element = document.createElement('div');
    element.setAttribute('role', 'dialog');
    document.body.appendChild(element);
    expect(queryTestingHarnessByRole(document.body, 'dialog')).toEqual([element]);
  });

  test('queryTestingHarnessByRole returns empty on unknown roles', () => {
    const document = new TestingDocument();
    document.body.appendChild(document.createElement('div'));
    expect(queryTestingHarnessByRole(document.body, 'menuitem')).toEqual([]);
  });

  test('queryTestingHarnessByRole accepts a harness object scope', () => {
    const harness = createTestingDomHarness();
    const button = harness.document.createElement('button');
    harness.container.appendChild(button);
    expect(queryTestingHarnessByRole(harness, 'button')).toEqual([button]);
  });

  test('queryTestingHarnessByRole works with container scope', () => {
    const harness = createTestingDomHarness();
    const button = harness.document.createElement('button');
    harness.container.appendChild(button);
    expect(queryTestingHarnessByRole(harness.container, 'button')).toEqual([button]);
  });

  test('getTestingHarnessByText finds exact element text', () => {
    const document = new TestingDocument();
    const button = document.createElement('button');
    button.appendChild(document.createTextNode('Save'));
    document.body.appendChild(button);
    expect(getTestingHarnessByText(document.body, 'Save')).toBe(document.body);
  });

  test('getTestingHarnessByText matches nested text content', () => {
    const document = new TestingDocument();
    const button = document.createElement('button');
    const icon = document.createElement('span');
    icon.appendChild(document.createTextNode('Save'));
    button.appendChild(icon);
    document.body.appendChild(button);
    expect(getTestingHarnessByText(document.body, 'Save')).toBe(document.body);
  });

  test('getTestingHarnessByText concatenates nested fragments', () => {
    const document = new TestingDocument();
    const element = document.createElement('div');
    const left = document.createElement('span');
    const right = document.createElement('span');
    left.appendChild(document.createTextNode('Hello'));
    right.appendChild(document.createTextNode('World'));
    element.appendChild(left);
    element.appendChild(right);
    document.body.appendChild(element);
    expect(getTestingHarnessByText(element, 'HelloWorld')).toBe(element);
  });

  test('getTestingHarnessByText accepts a harness object scope', () => {
    const harness = createTestingDomHarness();
    const button = harness.document.createElement('button');
    button.appendChild(harness.document.createTextNode('Launch'));
    harness.container.appendChild(button);
    expect(getTestingHarnessByText(harness, 'Launch')).toBe(harness.document.body);
  });

  test('getTestingHarnessByText accepts a container scope', () => {
    const harness = createTestingDomHarness();
    const button = harness.document.createElement('button');
    button.appendChild(harness.document.createTextNode('Launch'));
    harness.container.appendChild(button);
    expect(getTestingHarnessByText(harness.container, 'Launch')).toBe(harness.container);
  });

  test('getTestingHarnessByText returns null for missing text', () => {
    const harness = createTestingDomHarness();
    expect(getTestingHarnessByText(harness, 'Missing')).toBeNull();
  });

  test('getTestingHarnessByText returns the first matching element', () => {
    const harness = createTestingDomHarness();
    const first = harness.document.createElement('button');
    const second = harness.document.createElement('button');
    first.appendChild(harness.document.createTextNode('Open'));
    second.appendChild(harness.document.createTextNode('Open'));
    harness.container.appendChild(first);
    harness.container.appendChild(second);
    expect(getTestingHarnessByText(harness, 'Open')).toBe(first);
  });

  test('getTestingHarnessByText returns null for invalid scopes', () => {
    expect(getTestingHarnessByText(null, 'Open')).toBeNull();
  });

  test('dispatchTestingClick calls the click listener', () => {
    const document = new TestingDocument();
    const button = document.createElement('button');
    const calls: string[] = [];
    button.addEventListener('click', () => calls.push('click'));
    dispatchTestingClick(button);
    expect(calls).toEqual(['click']);
  });

  test('dispatchTestingClick focuses the clicked element', () => {
    const document = new TestingDocument();
    const button = document.createElement('button');
    dispatchTestingClick(button);
    expect(document.activeElement).toBe(button);
  });

  test('dispatchTestingClick is a no-op for non-elements', () => {
    expect(() => dispatchTestingClick({})).not.toThrow();
  });

  test('dispatchTestingInput updates element value', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    dispatchTestingInput(input, 'Ada');
    expect(input.value).toBe('Ada');
  });

  test('dispatchTestingInput calls the input listener', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    const seen: string[] = [];
    input.addEventListener('input', (event: { target?: { value?: string } }) => {
      seen.push(event.target?.value ?? '');
    });
    dispatchTestingInput(input, 'Ada');
    expect(seen).toEqual(['Ada']);
  });

  test('dispatchTestingInput is a no-op for non-elements', () => {
    expect(() => dispatchTestingInput({}, 'Ada')).not.toThrow();
  });

  test('dispatchTestingCheckedChange updates checked', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    dispatchTestingCheckedChange(input, true);
    expect(input.checked).toBe(true);
  });

  test('dispatchTestingCheckedChange calls the change listener', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    const seen: boolean[] = [];
    input.addEventListener('change', (event: { target?: { checked?: boolean } }) => {
      seen.push(Boolean(event.target?.checked));
    });
    dispatchTestingCheckedChange(input, true);
    expect(seen).toEqual([true]);
  });

  test('dispatchTestingCheckedChange is a no-op for non-elements', () => {
    expect(() => dispatchTestingCheckedChange({}, true)).not.toThrow();
  });

  test('dispatchTestingKeydown passes the pressed key', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    const seen: string[] = [];
    input.addEventListener('keydown', (event: { key?: string }) => {
      seen.push(event.key ?? '');
    });
    dispatchTestingKeydown(input, 'Enter');
    expect(seen).toEqual(['Enter']);
  });

  test('dispatchTestingKeydown passes shift state', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    const seen: boolean[] = [];
    input.addEventListener('keydown', (event: { shiftKey?: boolean }) => {
      seen.push(Boolean(event.shiftKey));
    });
    dispatchTestingKeydown(input, 'Tab', true);
    expect(seen).toEqual([true]);
  });

  test('dispatchTestingKeydown is a no-op for non-elements', () => {
    expect(() => dispatchTestingKeydown({}, 'Tab')).not.toThrow();
  });

  test('dispatchTestingSubmit calls the submit listener', () => {
    const document = new TestingDocument();
    const form = document.createElement('form');
    const calls: string[] = [];
    form.addEventListener('submit', () => calls.push('submit'));
    dispatchTestingSubmit(form);
    expect(calls).toEqual(['submit']);
  });

  test('dispatchTestingSubmit exposes preventDefault', () => {
    const document = new TestingDocument();
    const form = document.createElement('form');
    let prevented = false;
    form.addEventListener('submit', (event: { preventDefault: () => void; defaultPrevented?: boolean }) => {
      event.preventDefault();
      prevented = Boolean(event.defaultPrevented);
    });
    dispatchTestingSubmit(form);
    expect(prevented).toBe(true);
  });

  test('dispatchTestingSubmit is a no-op for non-elements', () => {
    expect(() => dispatchTestingSubmit({})).not.toThrow();
  });

  test('focus sets activeElement on the owner document', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  test('blur clears activeElement when focused', () => {
    const document = new TestingDocument();
    const input = document.createElement('input');
    input.focus();
    input.blur();
    expect(document.activeElement).toBeNull();
  });

  test('attachShadow creates a reusable shadow root', () => {
    const document = new TestingDocument();
    const host = document.createElement('div');
    const first = host.attachShadow({ mode: 'open' });
    const second = host.attachShadow({ mode: 'open' });
    expect(second).toBe(first);
  });

  test('attachShadow sets the host as parentNode', () => {
    const document = new TestingDocument();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    expect(shadow.parentNode).toBe(host);
  });

  test('setAttribute/getAttribute/removeAttribute round trip values', () => {
    const document = new TestingDocument();
    const element = document.createElement('div');
    element.setAttribute('data-id', '42');
    expect(element.getAttribute('data-id')).toBe('42');
    element.removeAttribute('data-id');
    expect(element.getAttribute('data-id')).toBeNull();
  });

  test('addEventListener/removeEventListener update the listener map', () => {
    const document = new TestingDocument();
    const element = document.createElement('button');
    const handler = () => undefined;
    element.addEventListener('click', handler);
    expect(element.listeners.get('click')).toBe(handler);
    element.removeEventListener('click');
    expect(element.listeners.has('click')).toBe(false);
  });

  test('style.setProperty stores values on the style object', () => {
    const document = new TestingDocument();
    const element = document.createElement('div');
    element.style.setProperty('opacity', '0.4');
    expect(element.style.opacity).toBe('0.4');
  });

  test('default element flags start falsy', () => {
    const document = new TestingDocument();
    const element = document.createElement('input');
    expect(element.disabled).toBe(false);
    expect(element.hidden).toBe(false);
    expect(element.checked).toBe(false);
  });

  test('default element string fields start empty', () => {
    const document = new TestingDocument();
    const element = document.createElement('input');
    expect(element.name).toBe('');
    expect(element.type).toBe('');
    expect(element.className).toBe('');
  });

  test('boundingRect defaults to zeros', () => {
    const document = new TestingDocument();
    const element = document.createElement('div');
    expect(element.getBoundingClientRect()).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    });
  });

  test('createTestingDomHarness returns a container in document.body', () => {
    const harness = createTestingDomHarness();
    expect(harness.document.body.childNodes.item(0)).toBe(harness.container);
  });

  test('getTestingHarnessContainer resolves a harness container', () => {
    const harness = createTestingDomHarness();
    expect(getTestingHarnessContainer(harness)).toBe(harness.container);
  });

  test('getTestingHarnessBody resolves a harness body', () => {
    const harness = createTestingDomHarness();
    expect(getTestingHarnessBody(harness)).toBe(harness.document.body);
  });

  test('getTestingHarnessById finds existing ids', () => {
    const harness = createTestingDomHarness();
    const button = harness.document.createElement('button');
    button.setAttribute('id', 'save');
    harness.container.appendChild(button);
    expect(getTestingHarnessById(harness, 'save')).toBe(button);
  });

  test('getTestingHarnessById returns null for missing ids', () => {
    const harness = createTestingDomHarness();
    expect(getTestingHarnessById(harness, 'missing')).toBeNull();
  });

  test('getTestingTextContent returns raw strings', () => {
    expect(getTestingTextContent('hello')).toBe('hello');
  });

  test('getTestingTextContent returns empty for null', () => {
    expect(getTestingTextContent(null)).toBe('');
  });

  test('getTestingTextContent uses plain object textContent when present', () => {
    expect(getTestingTextContent({ textContent: 'hello' })).toBe('hello');
  });

  test('getTestingTextContent reads text nodes', () => {
    expect(getTestingTextContent(new TestingTextNode('hello'))).toBe('hello');
  });

  test('getTestingTextContent concatenates nested element content', () => {
    const document = new TestingDocument();
    const wrapper = document.createElement('div');
    const left = document.createElement('span');
    const right = document.createElement('span');
    left.appendChild(document.createTextNode('Ada'));
    right.appendChild(document.createTextNode('Lovelace'));
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    expect(getTestingTextContent(wrapper)).toBe('AdaLovelace');
  });
});
