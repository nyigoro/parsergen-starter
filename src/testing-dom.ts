type TestingNodeList<T> = ArrayLike<T> & Iterable<T>;

const createNodeListView = <T>(items: readonly T[]): TestingNodeList<T> => {
  const view: Record<number, T> & {
    length: number;
    item: (index: number) => T | null;
    [Symbol.iterator]: () => Iterator<T>;
  } = {
    length: items.length,
    item: (index: number) => items[index] ?? null,
    [Symbol.iterator]: function* (): Iterator<T> {
      yield* items;
    },
  };

  items.forEach((item, index) => {
    view[index] = item;
  });

  return view as TestingNodeList<T>;
};

export class TestingNode {
  textContent: string | null = '';
  private readonly nodes: TestingNode[] = [];
  parentNode: TestingNode | null = null;

  get childNodes(): TestingNodeList<TestingNode> {
    return createNodeListView(this.nodes);
  }

  appendChild(node: TestingNode): TestingNode {
    const currentParent = node.parentNode;
    if (currentParent && currentParent !== this) {
      currentParent.removeChild(node);
    }
    if (currentParent === this) {
      const currentIndex = this.nodes.indexOf(node);
      if (currentIndex >= 0) {
        this.nodes.splice(currentIndex, 1);
      }
    }
    node.parentNode = this;
    this.nodes.push(node);
    return node;
  }

  insertBefore(node: TestingNode, referenceNode: TestingNode | null): TestingNode {
    const currentParent = node.parentNode;
    if (currentParent && currentParent !== this) {
      currentParent.removeChild(node);
    }
    if (currentParent === this) {
      const currentIndex = this.nodes.indexOf(node);
      if (currentIndex >= 0) {
        this.nodes.splice(currentIndex, 1);
      }
    }
    node.parentNode = this;
    if (referenceNode == null) {
      this.nodes.push(node);
      return node;
    }
    const index = this.nodes.indexOf(referenceNode);
    if (index < 0) {
      this.nodes.push(node);
      return node;
    }
    this.nodes.splice(index, 0, node);
    return node;
  }

  removeChild(node: TestingNode): TestingNode {
    const index = this.nodes.indexOf(node);
    if (index >= 0) {
      this.nodes.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }

  replaceChild(newChild: TestingNode, oldChild: TestingNode): TestingNode {
    const index = this.nodes.indexOf(oldChild);
    if (index >= 0) {
      this.nodes[index] = newChild;
      oldChild.parentNode = null;
      newChild.parentNode = this;
    }
    return oldChild;
  }
}

export class TestingDocument {
  activeElement: TestingElement | null = null;
  readonly body: TestingElement;

  constructor() {
    this.body = new TestingElement('body', this);
  }

  createElement(tag: string): TestingElement {
    return new TestingElement(tag, this);
  }

  createTextNode(value: string): TestingTextNode {
    return new TestingTextNode(value);
  }

  getElementById(id: string): TestingElement | null {
    const visit = (node: TestingNode): TestingElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof TestingElement && child.getAttribute('id') === id) {
          return child;
        }
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };

    return visit(this.body);
  }

  querySelector(selector: string): TestingElement | null {
    if (selector === 'body') return this.body;
    if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
    return null;
  }
}

export class TestingElement extends TestingNode {
  readonly tagName: string;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  readonly ownerDocument: TestingDocument;
  style: Record<string, unknown> & { setProperty: (name: string, value: string) => void };
  boundingRect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  value = '';
  checked = false;
  disabled = false;
  hidden = false;
  name = '';
  type = '';
  className = '';
  shadowRoot: TestingElement | null = null;

  constructor(tagName: string, ownerDocument: TestingDocument) {
    super();
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.boundingRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.style = {
      setProperty: (name: string, value: string) => {
        this.style[name] = value;
      },
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(event: string, listener: (event: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  removeEventListener(event: string): void {
    this.listeners.delete(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { ...this.boundingRect };
  }

  attachShadow(_options?: { mode?: string }): TestingElement {
    if (!this.shadowRoot) {
      this.shadowRoot = new TestingElement('shadow-root', this.ownerDocument);
      this.shadowRoot.parentNode = this;
    }
    return this.shadowRoot;
  }
}

export class TestingTextNode extends TestingNode {
  constructor(value: string) {
    super();
    this.textContent = value;
  }
}

export type TestingDomHarness = {
  document: TestingDocument;
  container: TestingElement;
  renderer?: unknown;
  root?: unknown;
};

const asTestingElement = (value: unknown): TestingElement | null =>
  value instanceof TestingElement ? value : null;

const resolveTestingRoot = (value: unknown): TestingNode | null => {
  if (value instanceof TestingNode) return value;
  if (value && typeof value === 'object') {
    const harnessBody = (value as { document?: TestingDocument }).document?.body;
    if (harnessBody instanceof TestingElement) return harnessBody;
    const harnessContainer = (value as { container?: TestingElement }).container;
    if (harnessContainer instanceof TestingElement) return harnessContainer;
  }
  return null;
};

const walkTestingTree = (root: TestingNode, visit: (node: TestingNode) => void): void => {
  visit(root);
  for (const child of root.childNodes) {
    walkTestingTree(child, visit);
  }
};

const implicitRoleForElement = (element: TestingElement): string | null => {
  if (element.tagName === 'button') return 'button';
  if (element.tagName === 'a' && !!element.getAttribute('href')) return 'link';
  if (element.tagName === 'input') {
    const kind = element.getAttribute('type') ?? element.type;
    if (kind === 'checkbox') return 'checkbox';
    if (kind === 'radio') return 'radio';
    return 'textbox';
  }
  if (element.tagName === 'textarea') return 'textbox';
  if (element.tagName === 'select') return 'combobox';
  return null;
};

const labelableTags = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);

const isDescendantOfTestingElement = (node: TestingNode, ancestor: TestingElement): boolean => {
  let current: TestingNode | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
};

const labelMatchesElement = (label: TestingElement, element: TestingElement): boolean => {
  const forId = label.getAttribute('for');
  if (forId && element.getAttribute('id') === forId) return true;
  return isDescendantOfTestingElement(element, label);
};

const findLabelsForElement = (element: TestingElement): TestingElement[] => {
  const labels: TestingElement[] = [];
  walkTestingTree(element.ownerDocument.body, (node) => {
    if (node instanceof TestingElement && node.tagName === 'label' && labelMatchesElement(node, element)) {
      labels.push(node);
    }
  });
  return labels;
};

const getTestingAccessibleName = (element: TestingElement): string => {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const value = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id))
      .filter((node): node is TestingElement => node instanceof TestingElement)
      .map((node) => getTestingTextContent(node))
      .join(' ')
      .trim();
    if (value) return value;
  }
  const labels = findLabelsForElement(element).map((label) => getTestingTextContent(label)).join(' ').trim();
  if (labels) return labels;
  return getTestingTextContent(element).trim();
};

const createEventBase = (target: TestingElement) => ({
  currentTarget: target,
  target,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
    // no-op for test harness
  },
});

export const createTestingDomHarness = (): TestingDomHarness => {
  const document = new TestingDocument();
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { document, container };
};

export const getTestingHarnessContainer = (harness: unknown): TestingElement | null =>
  harness && typeof harness === 'object' && (harness as { container?: unknown }).container instanceof TestingElement
    ? ((harness as { container: TestingElement }).container)
    : null;

export const getTestingHarnessBody = (harness: unknown): TestingElement | null =>
  harness && typeof harness === 'object' && (harness as { document?: unknown }).document instanceof TestingDocument
    ? ((harness as { document: TestingDocument }).document.body)
    : null;

export const getTestingHarnessById = (harness: unknown, id: string): TestingElement | null =>
  harness && typeof harness === 'object' && (harness as { document?: unknown }).document instanceof TestingDocument
    ? ((harness as { document: TestingDocument }).document.getElementById(id))
    : null;

export const getTestingHarnessByText = (scope: unknown, value: string): TestingElement | null => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found: TestingElement | null = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement)) return;
    if (getTestingTextContent(node) === value) {
      found = node;
    }
  });
  return found;
};

export const queryTestingHarnessByRole = (scope: unknown, role: string, name?: string): TestingElement[] => {
  const root = resolveTestingRoot(scope);
  if (!root) return [];
  const matches: TestingElement[] = [];
  walkTestingTree(root, (node) => {
    if (!(node instanceof TestingElement)) return;
    const explicitRole = node.getAttribute('role');
    const effectiveRole = explicitRole ?? implicitRoleForElement(node);
    if (effectiveRole === role && (name === undefined || getTestingAccessibleName(node) === name)) {
      matches.push(node);
    }
  });
  return matches;
};

export const getTestingHarnessByLabel = (scope: unknown, label: string): TestingElement | null => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found: TestingElement | null = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement) || !labelableTags.has(node.tagName)) return;
    if (findLabelsForElement(node).some((entry) => getTestingTextContent(entry).trim() === label)) {
      found = node;
    }
  });
  return found;
};

export const getTestingHarnessByPlaceholder = (scope: unknown, placeholder: string): TestingElement | null => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found: TestingElement | null = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement)) return;
    if ((node.getAttribute('placeholder') ?? '') === placeholder) found = node;
  });
  return found;
};

export const getTestingTextContent = (node: unknown): string => {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (!(node instanceof TestingNode)) {
    const direct = (node as { textContent?: unknown } | null)?.textContent;
    return typeof direct === 'string' ? direct : '';
  }

  if (node.childNodes.length === 0) {
    return node.textContent ?? '';
  }

  let out = '';
  for (const child of node.childNodes) {
    out += getTestingTextContent(child);
  }
  return out;
};

export const dispatchTestingClick = (node: unknown): void => {
  const element = asTestingElement(node);
  if (!element) return;
  element.focus();
  const event = createEventBase(element);
  element.listeners.get('click')?.(event);
  if (event.defaultPrevented) return;
  const type = element.getAttribute('type') ?? element.type;
  const submits = (element.tagName === 'button' && type === 'submit') ||
    (element.tagName === 'input' && type === 'submit');
  if (!submits) return;
  let parent = element.parentNode;
  while (parent) {
    if (parent instanceof TestingElement && parent.tagName === 'form') {
      dispatchTestingSubmit(parent);
      return;
    }
    parent = parent.parentNode;
  }
};

export const dispatchTestingInput = (node: unknown, value: string): void => {
  const element = asTestingElement(node);
  if (!element) return;
  element.value = value;
  element.listeners.get('input')?.({
    ...createEventBase(element),
    target: element,
  });
};

export const dispatchTestingCheckedChange = (node: unknown, checked: boolean): void => {
  const element = asTestingElement(node);
  if (!element) return;
  element.checked = checked;
  element.listeners.get('change')?.({
    ...createEventBase(element),
    target: element,
  });
};

export const dispatchTestingKeydown = (node: unknown, key: string, shiftKey: boolean = false): void => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get('keydown')?.({
    ...createEventBase(element),
    key,
    shiftKey,
  });
};

export const dispatchTestingSubmit = (node: unknown): void => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get('submit')?.(createEventBase(element));
};
