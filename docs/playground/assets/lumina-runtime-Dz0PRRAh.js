// src/frame-manager.ts
var nextContextId = 1;
function createContextToken(defaultValue) {
  return {
    id: nextContextId++,
    defaultValue,
    hasDefault: arguments.length > 0
  };
}
var frameName = (frame) => {
  if (!frame) return "unknown";
  if (!frame.componentFn) return "root";
  const name = frame.componentFn.name?.trim();
  return name && name.length > 0 ? name : "<anonymous component>";
};
var slotErrorPrefix = (frame) => `Component '${frameName(frame)}' rendered an inconsistent local slot layout`;
var FrameManager = class {
  constructor() {
    this.renderEpoch = 0;
    this.currentFrame = null;
    this.nextFrameId = 1;
    this.currentContextScope = null;
    this.rootFrame = this.createFrame(null, null, null);
    this.rootFrame.expectedSlotCount = 0;
  }
  beginRender() {
    this.renderEpoch += 1;
  }
  renderFrame(frame, render2) {
    const previousFrame = this.currentFrame;
    const previousContextScope = this.currentContextScope;
    frame.slotCursor = 0;
    frame.unkeyedChildCursor = 0;
    this.currentFrame = frame;
    this.currentContextScope = frame.contextScope;
    try {
      const result = render2();
      this.finalizeFrame(frame);
      return result;
    } finally {
      this.currentFrame = previousFrame;
      this.currentContextScope = previousContextScope;
    }
  }
  executeComponent(parentFrame, componentFn, key2, props) {
    const frame = this.resolveFrame(parentFrame, componentFn, key2);
    frame.contextScope = this.currentContextScope;
    frame.seenEpoch = this.renderEpoch;
    const result = this.renderFrame(frame, () => componentFn(props));
    return { frame, result };
  }
  withContext(context, value, render2) {
    const previousScope = this.currentContextScope;
    this.currentContextScope = {
      parent: previousScope,
      context,
      value
    };
    try {
      return render2();
    } finally {
      this.currentContextScope = previousScope;
    }
  }
  useContext(context) {
    let scope = this.currentContextScope;
    while (scope) {
      if (scope.context.id === context.id) {
        return scope.value;
      }
      scope = scope.parent;
    }
    if (context.hasDefault) {
      return context.defaultValue;
    }
    throw new Error(`No provider found for context ${context.id}`);
  }
  getSlot(kind, initializer, dispose) {
    const frame = this.currentFrame;
    if (!frame || !frame.componentFn) {
      throw new Error(`Local ${kind} slots can only be allocated while rendering a component frame`);
    }
    const slotIndex = frame.slotCursor;
    frame.slotCursor += 1;
    if (slotIndex < frame.slots.length) {
      const slot3 = frame.slots[slotIndex];
      if (slot3.kind !== kind) {
        throw new Error(
          `${slotErrorPrefix(frame)}: slot ${slotIndex} was '${slot3.kind}' before but is now '${kind}'`
        );
      }
      return slot3.value;
    }
    if (frame.expectedSlotCount !== null) {
      throw new Error(
        `${slotErrorPrefix(frame)}: expected ${frame.expectedSlotCount} slot(s), but render tried to allocate slot ${slotIndex + 1}`
      );
    }
    const value = initializer();
    const slot2 = {
      kind,
      value,
      dispose: dispose ? () => dispose(value) : void 0
    };
    frame.slots.push(slot2);
    return value;
  }
  sweepChildren(frame) {
    const staleKeyed = [];
    for (const entry of frame.keyedChildren.entries()) {
      const [, child] = entry;
      if (child.seenEpoch !== this.renderEpoch) {
        staleKeyed.push(entry);
      }
    }
    for (const [key2, child] of staleKeyed) {
      frame.keyedChildren.delete(key2);
      this.disposeFrame(child, false);
    }
    const staleUnkeyed = frame.unkeyedChildren.slice(frame.unkeyedChildCursor);
    if (staleUnkeyed.length > 0) {
      frame.unkeyedChildren.length = frame.unkeyedChildCursor;
      for (const child of staleUnkeyed) {
        this.disposeFrame(child, false);
      }
    }
  }
  disposeFrame(frame, detachFromParent = true) {
    if (frame.disposed) return;
    frame.disposed = true;
    for (const child of frame.keyedChildren.values()) {
      this.disposeFrame(child, false);
    }
    frame.keyedChildren.clear();
    for (const child of frame.unkeyedChildren) {
      this.disposeFrame(child, false);
    }
    frame.unkeyedChildren.length = 0;
    for (let idx = frame.slots.length - 1; idx >= 0; idx -= 1) {
      try {
        frame.slots[idx]?.dispose?.();
      } catch {
      }
    }
    frame.slots.length = 0;
    frame.contextScope = null;
    if (!detachFromParent || !frame.parent) return;
    if (frame.key !== null && frame.key !== void 0) {
      const current = frame.parent.keyedChildren.get(frame.key);
      if (current === frame) {
        frame.parent.keyedChildren.delete(frame.key);
      }
      return;
    }
    const index = frame.parent.unkeyedChildren.indexOf(frame);
    if (index >= 0) {
      frame.parent.unkeyedChildren.splice(index, 1);
    }
  }
  resolveFrame(parentFrame, componentFn, key2) {
    if (key2 !== null && key2 !== void 0) {
      const existing2 = parentFrame.keyedChildren.get(key2);
      if (existing2 && existing2.componentFn === componentFn && !existing2.disposed) {
        return existing2;
      }
      if (existing2) {
        this.disposeFrame(existing2, false);
      }
      const frame2 = this.createFrame(parentFrame, componentFn, key2);
      parentFrame.keyedChildren.set(key2, frame2);
      return frame2;
    }
    const childIndex = parentFrame.unkeyedChildCursor;
    parentFrame.unkeyedChildCursor += 1;
    const existing = parentFrame.unkeyedChildren[childIndex];
    if (existing && existing.componentFn === componentFn && !existing.disposed) {
      return existing;
    }
    if (existing) {
      this.disposeFrame(existing, false);
    }
    const frame = this.createFrame(parentFrame, componentFn, null);
    parentFrame.unkeyedChildren[childIndex] = frame;
    return frame;
  }
  finalizeFrame(frame) {
    if (frame.expectedSlotCount === null) {
      frame.expectedSlotCount = frame.slotCursor;
    } else if (frame.slotCursor !== frame.expectedSlotCount) {
      throw new Error(
        `${slotErrorPrefix(frame)}: expected ${frame.expectedSlotCount} slot(s), but render finished with ${frame.slotCursor}`
      );
    }
    this.sweepChildren(frame);
  }
  createFrame(parent, componentFn, key2) {
    return {
      id: this.nextFrameId++,
      componentFn,
      parent,
      key: key2,
      slotCursor: 0,
      unkeyedChildCursor: 0,
      expectedSlotCount: null,
      slots: [],
      keyedChildren: /* @__PURE__ */ new Map(),
      unkeyedChildren: [],
      contextScope: parent?.contextScope ?? null,
      seenEpoch: this.renderEpoch,
      disposed: false
    };
  }
};

// src/runtime/custom-elements.ts
var readCustomElementAttributes = (host, observedAttributes) => {
  const attrs = {};
  const element = host;
  for (const name of observedAttributes) {
    attrs[name] = typeof element.getAttribute === "function" ? element.getAttribute(name) : null;
  }
  return attrs;
};
var buildCustomElementProps = (host, options) => {
  const attrs = readCustomElementAttributes(host, options?.observedAttributes ?? []);
  if (typeof options?.mapProps === "function") {
    return options.mapProps(attrs, host);
  }
  return {
    ...options?.props ?? {},
    ...attrs
  };
};
var ensureCustomElementTarget = (host, options) => {
  const element = host;
  if (!options?.useShadow) return host;
  if (element.shadowRoot) return element.shadowRoot;
  if (typeof element.attachShadow === "function") {
    return element.attachShadow({ mode: "open" });
  }
  return host;
};
var createCustomElementsRuntime = (hooks) => ({
  mountCustomElementHost: (host, componentFn, options) => {
    const documentLike = host.ownerDocument ?? hooks.getGlobalDocument();
    if (!documentLike) {
      throw new Error("mountCustomElement requires a document-like host");
    }
    const renderer = hooks.createRenderer(documentLike);
    const target = ensureCustomElementTarget(host, options);
    const props = hooks.createSignal(buildCustomElementProps(host, options));
    const root = hooks.mountReactive(renderer, target, hooks.createView(componentFn, props));
    return {
      root,
      props,
      host,
      target,
      updateProps: (next) => {
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      },
      syncAttributes: () => {
        const next = buildCustomElementProps(host, options);
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      },
      disconnect: () => {
        if (hooks.isDisposableLike(root)) {
          hooks.disposeReactive(root);
        }
      }
    };
  },
  defineCustomElementClass: (tagName, componentFn, options) => {
    const BaseCtor = options?.baseClass ?? (globalThis.HTMLElement ?? class {
    });
    const registry = options?.registry ?? globalThis.customElements;
    const runtime = createCustomElementsRuntime(hooks);
    const CustomElement = class LuminaCustomElement extends BaseCtor {
      static get observedAttributes() {
        return [...options?.observedAttributes ?? []];
      }
      connectedCallback() {
        if (!this.__luminaController) {
          this.__luminaController = runtime.mountCustomElementHost(this, componentFn, options);
        } else {
          this.__luminaController.syncAttributes();
        }
      }
      attributeChangedCallback() {
        this.__luminaController?.syncAttributes();
      }
      disconnectedCallback() {
        this.__luminaController?.disconnect();
        this.__luminaController = void 0;
      }
    };
    if (registry?.define) {
      const existing = typeof registry.get === "function" ? registry.get(tagName) : void 0;
      if (!existing) {
        registry.define(tagName, CustomElement);
      }
    }
    return CustomElement;
  }
});

// src/runtime/ssg.ts
var asRecord = (value) => value && typeof value === "object" ? value : {};
var coerceSsgPageOptions = (options) => {
  const candidate = asRecord(options);
  const headValue = candidate.head;
  const head = Array.isArray(headValue) ? headValue.map((entry) => String(entry)) : headValue == null ? [] : [String(headValue)];
  const lifecycleState = candidate.loaderState == null && candidate.islandState == null && candidate.deferredData == null ? null : {
    ...candidate.loaderState == null ? {} : { loaderState: candidate.loaderState },
    ...candidate.islandState == null ? {} : { islandState: candidate.islandState },
    ...candidate.deferredData == null ? {} : { deferredData: candidate.deferredData }
  };
  return {
    title: typeof candidate.title === "string" ? candidate.title : "",
    lang: typeof candidate.lang === "string" && candidate.lang.length > 0 ? candidate.lang : "en",
    head,
    bodyClassName: typeof candidate.bodyClassName === "string" ? candidate.bodyClassName : "",
    appClassName: typeof candidate.appClassName === "string" ? candidate.appClassName : "",
    appId: typeof candidate.appId === "string" && candidate.appId.length > 0 ? candidate.appId : "app",
    hydrateModule: typeof candidate.hydrateModule === "string" ? candidate.hydrateModule : "",
    hydrationState: candidate.hydrationState ?? candidate.state ?? candidate.serializedState ?? lifecycleState,
    hydrationStateId: typeof candidate.hydrationStateId === "string" && candidate.hydrationStateId.length > 0 ? candidate.hydrationStateId : "__lumina-hydration",
    hydrationBoundary: typeof candidate.hydrationBoundary === "string" && candidate.hydrationBoundary.length > 0 ? candidate.hydrationBoundary : "root",
    scriptNonce: typeof candidate.scriptNonce === "string" && candidate.scriptNonce.length > 0 ? candidate.scriptNonce : "",
    requestId: typeof candidate.requestId === "string" ? candidate.requestId : "",
    deferredData: candidate.deferredData ?? null
  };
};
var serializeHydrationState = (value) => JSON.stringify(value ?? null).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
var createSsgApi = (deps) => {
  const renderPage = (body, options) => {
    const normalized = coerceSsgPageOptions(options);
    const bodyContent = deps.isVNode(body) ? deps.renderToString(body) : Array.isArray(body) || body && typeof body === "object" ? deps.renderToString(deps.coerceRenderableToVNode(body)) : String(body ?? "");
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      normalized.title ? `<title>${deps.escapeHtml(normalized.title)}</title>` : "",
      ...normalized.head
    ].filter((entry) => entry.length > 0).join("");
    const hydrateScript = normalized.hydrateModule ? `<script type="module"${normalized.scriptNonce ? ` nonce="${deps.escapeHtml(normalized.scriptNonce)}"` : ""} src="${deps.escapeHtml(normalized.hydrateModule)}"></script>` : "";
    const hydrationStateScript = normalized.hydrationState !== null ? `<script type="application/json"${normalized.scriptNonce ? ` nonce="${deps.escapeHtml(normalized.scriptNonce)}"` : ""} id="${deps.escapeHtml(normalized.hydrationStateId)}">${serializeHydrationState(normalized.hydrationState)}</script>` : "";
    const bodyClass = normalized.bodyClassName ? ` class="${deps.escapeHtml(normalized.bodyClassName)}"` : "";
    const appClass = normalized.appClassName ? ` class="${deps.escapeHtml(normalized.appClassName)}"` : "";
    const hydrationAttrs = normalized.hydrateModule || normalized.hydrationState !== null ? ` data-lumina-hydration="${deps.escapeHtml(normalized.hydrationBoundary)}"${normalized.hydrationState !== null ? ` data-lumina-state="${deps.escapeHtml(normalized.hydrationStateId)}"` : ""}${normalized.requestId ? ` data-lumina-request-id="${deps.escapeHtml(normalized.requestId)}"` : ""}` : "";
    return `<!DOCTYPE html><html lang="${deps.escapeHtml(normalized.lang)}"><head>${head}</head><body${bodyClass}><div id="${deps.escapeHtml(normalized.appId)}"${appClass}${hydrationAttrs}>${bodyContent}</div>${hydrationStateScript}${hydrateScript}</body></html>`;
  };
  const writePage = (filePath, body, options) => {
    const resolvedPath = deps.resolvePath(filePath);
    const fsModule = deps.getNodeBuiltinModule("node:fs");
    if (!fsModule?.mkdirSync || !fsModule.writeFileSync) {
      throw new Error("SSG write requires Node.js file system support");
    }
    fsModule.mkdirSync(deps.dirnamePath(resolvedPath), { recursive: true });
    fsModule.writeFileSync(resolvedPath, renderPage(body, options), "utf-8");
    return resolvedPath;
  };
  const renderAppPage = (componentFn, props, options) => renderPage(deps.renderApp(componentFn, props), options);
  const writeAppPage = (filePath, componentFn, props, options) => writePage(filePath, deps.renderApp(componentFn, props), options);
  return {
    renderPage,
    writePage,
    renderAppPage,
    writeAppPage
  };
};

// src/testing-dom.ts
var createNodeListView = (items) => {
  const view = {
    length: items.length,
    item: (index) => items[index] ?? null,
    [Symbol.iterator]: function* () {
      yield* items;
    }
  };
  items.forEach((item, index) => {
    view[index] = item;
  });
  return view;
};
var TestingNode = class {
  constructor() {
    this.textContent = "";
    this.nodes = [];
    this.parentNode = null;
  }
  get childNodes() {
    return createNodeListView(this.nodes);
  }
  appendChild(node) {
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
  insertBefore(node, referenceNode) {
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
  removeChild(node) {
    const index = this.nodes.indexOf(node);
    if (index >= 0) {
      this.nodes.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }
  replaceChild(newChild, oldChild) {
    const index = this.nodes.indexOf(oldChild);
    if (index >= 0) {
      this.nodes[index] = newChild;
      oldChild.parentNode = null;
      newChild.parentNode = this;
    }
    return oldChild;
  }
};
var TestingDocument = class {
  constructor() {
    this.activeElement = null;
    this.body = new TestingElement("body", this);
  }
  createElement(tag) {
    return new TestingElement(tag, this);
  }
  createTextNode(value) {
    return new TestingTextNode(value);
  }
  getElementById(id) {
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof TestingElement && child.getAttribute("id") === id) {
          return child;
        }
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this.body);
  }
  querySelector(selector) {
    if (selector === "body") return this.body;
    if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
    return null;
  }
};
var TestingElement = class _TestingElement extends TestingNode {
  constructor(tagName, ownerDocument) {
    super();
    this.attributes = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Map();
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.name = "";
    this.type = "";
    this.className = "";
    this.shadowRoot = null;
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.boundingRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = value;
      }
    };
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  addEventListener(event, listener) {
    this.listeners.set(event, listener);
  }
  removeEventListener(event) {
    this.listeners.delete(event);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }
  getBoundingClientRect() {
    return { ...this.boundingRect };
  }
  attachShadow(_options) {
    if (!this.shadowRoot) {
      this.shadowRoot = new _TestingElement("shadow-root", this.ownerDocument);
      this.shadowRoot.parentNode = this;
    }
    return this.shadowRoot;
  }
};
var TestingTextNode = class extends TestingNode {
  constructor(value) {
    super();
    this.textContent = value;
  }
};
var asTestingElement = (value) => value instanceof TestingElement ? value : null;
var resolveTestingRoot = (value) => {
  if (value instanceof TestingNode) return value;
  if (value && typeof value === "object") {
    const harnessBody = value.document?.body;
    if (harnessBody instanceof TestingElement) return harnessBody;
    const harnessContainer = value.container;
    if (harnessContainer instanceof TestingElement) return harnessContainer;
  }
  return null;
};
var walkTestingTree = (root, visit) => {
  visit(root);
  for (const child of root.childNodes) {
    walkTestingTree(child, visit);
  }
};
var implicitRoleForElement = (element) => {
  if (element.tagName === "button") return "button";
  if (element.tagName === "a" && !!element.getAttribute("href")) return "link";
  if (element.tagName === "input") {
    const kind = element.getAttribute("type") ?? element.type;
    if (kind === "checkbox") return "checkbox";
    if (kind === "radio") return "radio";
    return "textbox";
  }
  if (element.tagName === "textarea") return "textbox";
  if (element.tagName === "select") return "combobox";
  return null;
};
var labelableTags = /* @__PURE__ */ new Set(["button", "input", "meter", "output", "progress", "select", "textarea"]);
var isDescendantOfTestingElement = (node, ancestor) => {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
};
var labelMatchesElement = (label, element) => {
  const forId = label.getAttribute("for");
  if (forId && element.getAttribute("id") === forId) return true;
  return isDescendantOfTestingElement(element, label);
};
var findLabelsForElement = (element) => {
  const labels = [];
  walkTestingTree(element.ownerDocument.body, (node) => {
    if (node instanceof TestingElement && node.tagName === "label" && labelMatchesElement(node, element)) {
      labels.push(node);
    }
  });
  return labels;
};
var getTestingAccessibleName = (element) => {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const value = labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)).filter((node) => node instanceof TestingElement).map((node) => getTestingTextContent(node)).join(" ").trim();
    if (value) return value;
  }
  const labels = findLabelsForElement(element).map((label) => getTestingTextContent(label)).join(" ").trim();
  if (labels) return labels;
  return getTestingTextContent(element).trim();
};
var createEventBase = (target) => ({
  currentTarget: target,
  target,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
  }
});
var createTestingDomHarness = () => {
  const document = new TestingDocument();
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { document, container };
};
var getTestingHarnessContainer = (harness) => harness && typeof harness === "object" && harness.container instanceof TestingElement ? harness.container : null;
var getTestingHarnessBody = (harness) => harness && typeof harness === "object" && harness.document instanceof TestingDocument ? harness.document.body : null;
var getTestingHarnessById = (harness, id) => harness && typeof harness === "object" && harness.document instanceof TestingDocument ? harness.document.getElementById(id) : null;
var getTestingHarnessByText = (scope, value) => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement)) return;
    if (getTestingTextContent(node) === value) {
      found = node;
    }
  });
  return found;
};
var queryTestingHarnessByRole = (scope, role, name) => {
  const root = resolveTestingRoot(scope);
  if (!root) return [];
  const matches = [];
  walkTestingTree(root, (node) => {
    if (!(node instanceof TestingElement)) return;
    const explicitRole = node.getAttribute("role");
    const effectiveRole = explicitRole ?? implicitRoleForElement(node);
    if (effectiveRole === role && (name === void 0 || getTestingAccessibleName(node) === name)) {
      matches.push(node);
    }
  });
  return matches;
};
var getTestingHarnessByLabel = (scope, label) => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement) || !labelableTags.has(node.tagName)) return;
    if (findLabelsForElement(node).some((entry) => getTestingTextContent(entry).trim() === label)) {
      found = node;
    }
  });
  return found;
};
var getTestingHarnessByPlaceholder = (scope, placeholder) => {
  const root = resolveTestingRoot(scope);
  if (!root) return null;
  let found = null;
  walkTestingTree(root, (node) => {
    if (found || !(node instanceof TestingElement)) return;
    if ((node.getAttribute("placeholder") ?? "") === placeholder) found = node;
  });
  return found;
};
var getTestingTextContent = (node) => {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (!(node instanceof TestingNode)) {
    const direct = node?.textContent;
    return typeof direct === "string" ? direct : "";
  }
  if (node.childNodes.length === 0) {
    return node.textContent ?? "";
  }
  let out = "";
  for (const child of node.childNodes) {
    out += getTestingTextContent(child);
  }
  return out;
};
var dispatchTestingClick = (node) => {
  const element = asTestingElement(node);
  if (!element) return;
  if (element.disabled || element.getAttribute("disabled") !== null) return;
  element.focus();
  const event = createEventBase(element);
  element.listeners.get("click")?.(event);
  if (event.defaultPrevented) return;
  const type = element.getAttribute("type") ?? element.type;
  const submits = element.tagName === "button" && type === "submit" || element.tagName === "button" && (type === null || type === void 0 || type === "") || element.tagName === "input" && type === "submit";
  if (!submits) return;
  let parent = element.parentNode;
  while (parent) {
    if (parent instanceof TestingElement && parent.tagName === "form") {
      dispatchTestingSubmit(parent);
      return;
    }
    parent = parent.parentNode;
  }
};
var dispatchTestingInput = (node, value) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.value = value;
  element.listeners.get("input")?.({
    ...createEventBase(element),
    target: element
  });
};
var dispatchTestingCheckedChange = (node, checked) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.checked = checked;
  element.listeners.get("change")?.({
    ...createEventBase(element),
    target: element
  });
};
var dispatchTestingKeydown = (node, key2, shiftKey = false) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get("keydown")?.({
    ...createEventBase(element),
    key: key2,
    shiftKey
  });
};
var dispatchTestingSubmit = (node) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get("submit")?.(createEventBase(element));
};

// src/runtime/testing-facade.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var settleTestingAttempt = async (check, timeoutMs) => {
  const pending = Promise.resolve().then(check);
  pending.catch(() => void 0);
  const timeout2 = sleep(timeoutMs).then(() => ({ __timeout: true }));
  const value = await Promise.race([pending, timeout2]);
  if (value && typeof value === "object" && value.__timeout === true) {
    return { settled: false };
  }
  return { settled: true, value };
};
var createTestingFacade = (deps) => ({
  testing_create_dom_harness: () => {
    const harness = createTestingDomHarness();
    harness.renderer = deps.createRenderer(harness.document);
    return harness;
  },
  testing_mount_app: (harness, componentFn, props) => deps.mountApp(harness, componentFn, props, false),
  testing_hydrate_app: (harness, componentFn, props) => deps.mountApp(harness, componentFn, props, true),
  testing_container: (harness) => getTestingHarnessContainer(harness),
  testing_body: (harness) => getTestingHarnessBody(harness),
  testing_get_by_id: (harness, id) => getTestingHarnessById(harness, id),
  testing_get_by_text: (scope, value) => getTestingHarnessByText(scope, value),
  testing_get_by_role: (scope, role) => queryTestingHarnessByRole(scope, role)[0] ?? null,
  testing_get_by_role_name: (scope, role, name) => queryTestingHarnessByRole(scope, role, name)[0] ?? null,
  testing_query_all_by_role: (scope, role) => queryTestingHarnessByRole(scope, role),
  testing_get_by_label: (scope, label) => getTestingHarnessByLabel(scope, label),
  testing_get_by_placeholder: (scope, placeholder) => getTestingHarnessByPlaceholder(scope, placeholder),
  testing_text_content: (node) => getTestingTextContent(node),
  testing_click: (node) => dispatchTestingClick(node),
  testing_input: (node, value) => dispatchTestingInput(node, value),
  testing_change_checked: (node, checked) => dispatchTestingCheckedChange(node, checked),
  testing_keydown: (node, key2, shiftKey) => dispatchTestingKeydown(node, key2, shiftKey ?? false),
  testing_submit: (node) => dispatchTestingSubmit(node),
  testing_flush: async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  },
  testing_wait_for: async (check, attempts = 5) => {
    const limit = Math.max(1, Math.trunc(Number(attempts) || 1));
    let lastError = null;
    for (let i = 0; i < limit; i += 1) {
      try {
        const attempt = await settleTestingAttempt(check, 10);
        if (attempt.settled && attempt.value) return attempt.value;
        lastError = null;
        if (attempt.settled) {
          await sleep(10);
        }
      } catch (error) {
        lastError = error;
        await sleep(10);
      }
    }
    if (lastError) throw lastError;
    return null;
  }
});

// src/runtime/app-runtime.ts
var createAppRuntime = (deps) => {
  const renderAppVNode = (componentFn, props) => deps.runWithFrameManager(deps.createFrameManager(), () => deps.component(componentFn, props));
  const mountReactiveApp = (renderer, container, componentFn, props) => deps.mountReactive(renderer, container, () => deps.component(componentFn, props));
  const hydrateReactiveApp = (renderer, container, componentFn, props) => deps.hydrateReactive(renderer, container, () => deps.component(componentFn, props));
  const mountTestingApp = (harness, componentFn, props, hydrate = false) => {
    const renderer = harness.renderer ?? deps.createDomRenderer({ document: harness.document });
    harness.renderer = renderer;
    const root = hydrate ? hydrateReactiveApp(renderer, harness.container, componentFn, props) : mountReactiveApp(renderer, harness.container, componentFn, props);
    harness.root = root;
    return root;
  };
  const testingFacade = createTestingFacade({
    createRenderer: (documentLike) => deps.createDomRenderer({ document: documentLike }),
    mountApp: (harness, componentFn, props, hydrate) => mountTestingApp(harness, componentFn, props, hydrate)
  });
  const ssgApi = createSsgApi({
    isVNode: deps.isVNode,
    renderToString: deps.renderToString,
    coerceRenderableToVNode: deps.coerceRenderableToVNode,
    escapeHtml: deps.escapeHtml,
    resolvePath: deps.resolvePath,
    dirnamePath: deps.dirnamePath,
    getNodeBuiltinModule: deps.getNodeBuiltinModule,
    renderApp: (componentFn, props) => renderAppVNode(componentFn, props)
  });
  const customElementsRuntime = createCustomElementsRuntime({
    createRenderer: (documentLike) => deps.createDomRenderer({ document: documentLike }),
    createSignal: deps.createSignal,
    getSignal: deps.getSignal,
    setSignal: deps.setSignal,
    createView: (componentFn, propsSignal) => () => deps.component(
      componentFn,
      deps.getSignal(propsSignal)
    ),
    mountReactive: deps.mountReactive,
    isDisposableLike: deps.isDisposableLike,
    disposeReactive: deps.disposeReactive,
    getGlobalDocument: deps.getGlobalDocument
  });
  const mountCustomElementInternal = (host, componentFn, options) => customElementsRuntime.mountCustomElementHost(
    host,
    componentFn,
    options
  );
  const defineCustomElementInternal = (tagName, componentFn, options) => customElementsRuntime.defineCustomElementClass(
    tagName,
    componentFn,
    options
  );
  return {
    renderAppVNode,
    mountReactiveApp,
    hydrateReactiveApp,
    testingFacade,
    ssgApi,
    mountCustomElementInternal,
    defineCustomElementInternal
  };
};

// src/runtime/devtools.ts
var snapshotComponentFrame = (frame) => ({
  id: frame.id,
  name: frame.componentFn?.name?.trim() || (frame.componentFn ? "<anonymous component>" : "root"),
  key: frame.key ?? null,
  slots: frame.slots.map((slot2) => ({ kind: slot2.kind })),
  children: [
    ...Array.from(frame.keyedChildren.values()).map(snapshotComponentFrame),
    ...frame.unkeyedChildren.map(snapshotComponentFrame)
  ]
});
var cloneDevtoolsValue = (value) => {
  if (value === null || value === void 0) return value;
  if (typeof globalThis.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};
var cloneTimelineEvent = (event) => Object.freeze({
  ...event,
  detail: cloneDevtoolsValue(event.detail)
});
var createDevtoolsController = (deps) => {
  let nextSignalId = 1;
  let nextRootId = 1;
  let nextEventId = 1;
  let notifyPending = false;
  const signalEntries = /* @__PURE__ */ new Map();
  const roots = /* @__PURE__ */ new Map();
  const rootIds = /* @__PURE__ */ new WeakMap();
  const listeners = /* @__PURE__ */ new Set();
  const timeline = [];
  const recordEvent = (type, label, detail = null) => {
    const event = {
      id: nextEventId++,
      type,
      label,
      timestamp: Date.now(),
      detail: cloneDevtoolsValue(detail)
    };
    timeline.push(event);
    if (timeline.length > 500) {
      timeline.splice(0, timeline.length - 500);
    }
    scheduleNotify();
    return cloneTimelineEvent(event);
  };
  const snapshot = () => ({
    roots: Array.from(roots.entries()).map(([id, root]) => deps.snapshotRoot(root, id)),
    resources: deps.snapshotResources(),
    signals: Array.from(signalEntries.entries()).map(([id, entry]) => ({
      id,
      kind: entry.kind,
      value: entry.source.peek()
    })),
    timeline: timeline.map(cloneTimelineEvent)
  });
  const scheduleNotify = () => {
    if (listeners.size === 0 || notifyPending) return;
    notifyPending = true;
    deps.scheduleMicrotask(() => {
      notifyPending = false;
      const next = snapshot();
      for (const listener of Array.from(listeners)) {
        try {
          listener(next);
        } catch {
        }
      }
    });
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    registerSignal(kind, source) {
      const id = nextSignalId++;
      signalEntries.set(id, { kind, source });
      scheduleNotify();
      return id;
    },
    unregisterSignal(id) {
      if (signalEntries.delete(id)) {
        scheduleNotify();
      }
    },
    registerRoot(root) {
      if (!rootIds.has(root)) {
        rootIds.set(root, nextRootId++);
      }
      const id = rootIds.get(root);
      roots.set(id, root);
      scheduleNotify();
      return id;
    },
    unregisterRoot(root) {
      const id = rootIds.get(root);
      if (id !== void 0 && roots.delete(id)) {
        scheduleNotify();
      }
    },
    recordEvent,
    timeline() {
      return timeline.map(cloneTimelineEvent);
    },
    clearTimeline() {
      if (timeline.length === 0) return;
      timeline.splice(0, timeline.length);
      scheduleNotify();
    },
    snapshot,
    subscribe,
    install(key2 = "__LUMINA_DEVTOOLS__") {
      const globalRecord = globalThis;
      const handle = {
        version: "beta",
        snapshot: () => snapshot(),
        subscribe,
        timeline: () => timeline.map(cloneTimelineEvent),
        recordEvent,
        clearTimeline: () => {
          timeline.splice(0, timeline.length);
          scheduleNotify();
        }
      };
      globalRecord[key2] = handle;
      return handle;
    },
    scheduleNotify
  };
};

// src/runtime/browser-runtime.ts
var isUrlRecord = (value) => !!value && typeof value === "object" && typeof value.href === "string" && typeof value.origin === "string";
var normalizeProtocol = (value) => {
  const base = String(value ?? "").trim();
  if (!base) return "";
  return base.endsWith(":") ? base : `${base}:`;
};
var toUrlRecord = (raw) => ({
  href: raw.href,
  origin: raw.origin,
  protocol: raw.protocol,
  host: raw.host,
  pathname: raw.pathname,
  search: raw.search,
  hash: raw.hash
});
var emptyUrlRecord = () => ({
  href: "",
  origin: "",
  protocol: "",
  host: "",
  pathname: "",
  search: "",
  hash: ""
});
var coerceToUrl = (value) => {
  if (typeof URL !== "function") return null;
  if (typeof value === "string") {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }
  if (isUrlRecord(value)) {
    try {
      return new URL(value.href);
    } catch {
      return null;
    }
  }
  return null;
};
var asStorageLike = (value) => {
  if (!value || typeof value !== "object") return null;
  const candidate = value;
  if (typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function" || typeof candidate.removeItem !== "function" || typeof candidate.clear !== "function") {
    return null;
  }
  return candidate;
};
var createBrowserRuntime = (deps) => {
  const webStorageLocalFallback = /* @__PURE__ */ new Map();
  const webStorageSessionFallback = /* @__PURE__ */ new Map();
  let domNextHandle = 1;
  let domNextEventHandle = 1;
  const domElements = /* @__PURE__ */ new Map();
  const domElementHandles = /* @__PURE__ */ new WeakMap();
  const domEvents = /* @__PURE__ */ new Map();
  const routerPopStateHandlers = /* @__PURE__ */ new Map();
  const browserLocalStorage = () => asStorageLike(globalThis.localStorage);
  const browserSessionStorage = () => asStorageLike(globalThis.sessionStorage);
  const webStorageGet = (scope, key2) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        const value = storage.getItem(String(key2));
        return value == null ? deps.optionNone : deps.optionSome(value);
      } catch {
        return deps.optionNone;
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    return fallback.has(String(key2)) ? deps.optionSome(fallback.get(String(key2)) ?? "") : deps.optionNone;
  };
  const webStorageSet = (scope, key2, value) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.setItem(String(key2), String(value));
        return deps.resultOk(void 0);
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.set(String(key2), String(value));
    return deps.resultOk(void 0);
  };
  const webStorageRemove = (scope, key2) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.removeItem(String(key2));
        return;
      } catch {
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.delete(String(key2));
  };
  const webStorageClear = (scope) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.clear();
        return;
      } catch {
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.clear();
  };
  const webStorageLength = (scope) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        return Math.trunc(storage.length);
      } catch {
        return 0;
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    return fallback.size;
  };
  const getDocumentHandle = () => {
    const doc = globalThis.document;
    if (!doc || typeof doc.querySelector !== "function") return null;
    return doc;
  };
  const toDomHandle = (element) => {
    if (!element || typeof element !== "object") return 0;
    const existing = domElementHandles.get(element);
    if (existing) return existing;
    const next = domNextHandle++;
    domElementHandles.set(element, next);
    domElements.set(next, element);
    return next;
  };
  const fromDomHandle = (handle) => domElements.get(Math.trunc(handle)) ?? null;
  const createDomStubElement = () => {
    const attrs = /* @__PURE__ */ new Map();
    const children2 = [];
    return {
      textContent: "",
      innerHTML: "",
      style: {},
      getAttribute: (name) => attrs.get(String(name)) ?? null,
      setAttribute: (name, value) => {
        attrs.set(String(name), String(value));
      },
      removeAttribute: (name) => {
        attrs.delete(String(name));
      },
      appendChild: (child) => {
        children2.push(child);
      },
      removeChild: (child) => {
        const idx = children2.indexOf(child);
        if (idx >= 0) children2.splice(idx, 1);
      }
    };
  };
  const getRouterWindowHandle = () => {
    const windowHandle = globalThis.window;
    if (windowHandle && typeof windowHandle === "object") return windowHandle;
    const globalHandle = globalThis;
    if (typeof globalHandle.addEventListener === "function" || typeof globalHandle.dispatchEvent === "function" || typeof globalHandle.location === "object") {
      return globalHandle;
    }
    return null;
  };
  const getRouterLocationHandle = () => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.location) return windowHandle.location;
    const locationHandle = globalThis.location;
    return locationHandle && typeof locationHandle === "object" ? locationHandle : null;
  };
  const getRouterHistoryHandle = () => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.history) return windowHandle.history;
    const historyHandle = globalThis.history;
    return historyHandle && typeof historyHandle === "object" ? historyHandle : null;
  };
  const readRouterPathname = () => String(getRouterLocationHandle()?.pathname ?? "/");
  const readRouterHash = () => String(getRouterLocationHandle()?.hash ?? "");
  const readRouterSearch = () => String(getRouterLocationHandle()?.search ?? "");
  const trimRouterTrailingSlash = (value) => {
    if (value.length <= 1) return value || "/";
    return value.endsWith("/") ? value.slice(0, -1) : value;
  };
  const normalizeRouterPath = (value) => {
    const text2 = String(value || "/");
    const withLeadingSlash = text2.startsWith("/") ? text2 : `/${text2}`;
    return trimRouterTrailingSlash(withLeadingSlash);
  };
  const splitRouterSegments = (value) => normalizeRouterPath(value).split("/").filter((segment) => segment.length > 0);
  const decodeRouterComponent = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const createRouterParamMap = (entries) => {
    const out = deps.createHashMap();
    for (const [key2, value] of entries) {
      if (key2.length > 0) out.insert(key2, value);
    }
    return out;
  };
  const matchRouterPattern = (pattern, path2) => {
    if (pattern === "*") return true;
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path2);
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? "";
      if (expected === "*" || expected.startsWith("*")) return true;
      const actual = pathSegments[i] ?? "";
      if (expected.startsWith(":")) continue;
      if (expected !== actual) return false;
    }
    return patternSegments.length === pathSegments.length;
  };
  const extractRouterParams = (pattern, path2) => {
    if (pattern === "*") return deps.createHashMap();
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path2);
    const entries = [];
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? "";
      const actual = pathSegments[i] ?? "";
      if (expected === "*" || expected.startsWith("*")) {
        const name = expected.startsWith("*") && expected.length > 1 ? expected.slice(1) : "splat";
        entries.push([name, pathSegments.slice(i).map(decodeRouterComponent).join("/")]);
        return createRouterParamMap(entries);
      }
      if (actual.length === 0) return deps.createHashMap();
      if (!expected.startsWith(":")) {
        if (expected !== actual) return deps.createHashMap();
        continue;
      }
      entries.push([expected.slice(1), decodeRouterComponent(actual)]);
      continue;
    }
    if (!matchRouterPattern(pattern, path2)) {
      return deps.createHashMap();
    }
    return createRouterParamMap(entries);
  };
  const parseRouterSearchParams = (search) => {
    const text2 = String(search ?? "");
    const body = text2.startsWith("?") ? text2.slice(1) : text2;
    if (body.length === 0) return deps.createHashMap();
    const entries = [];
    if (typeof URLSearchParams === "function") {
      for (const [key2, value] of new URLSearchParams(body)) {
        if (key2.length > 0) entries.push([key2, value]);
      }
      return createRouterParamMap(entries);
    }
    for (const pair of body.split("&")) {
      if (!pair) continue;
      const [rawKey, rawValue = ""] = pair.split("=");
      if (!rawKey) continue;
      entries.push([decodeRouterComponent(rawKey), decodeRouterComponent(rawValue.replace(/\+/g, " "))]);
    }
    return createRouterParamMap(entries);
  };
  const updateRouterLocationValue = (nextPath) => {
    const locationHandle = getRouterLocationHandle();
    if (!locationHandle) return;
    try {
      const parsed = typeof URL === "function" ? new URL(String(nextPath), "http://lumina.local") : null;
      locationHandle.pathname = parsed?.pathname ?? String(nextPath);
      locationHandle.search = parsed?.search ?? "";
      locationHandle.hash = parsed?.hash ?? "";
    } catch {
    }
  };
  const createRouterPopStateEvent = () => {
    try {
      const PopStateEventCtor = globalThis.PopStateEvent;
      if (typeof PopStateEventCtor === "function") {
        return new PopStateEventCtor("popstate", { state: getRouterHistoryHandle()?.state });
      }
    } catch {
    }
    try {
      const EventCtor = globalThis.Event;
      if (typeof EventCtor === "function") {
        return new EventCtor("popstate");
      }
    } catch {
    }
    return { type: "popstate" };
  };
  const dispatchRouterPopState = () => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle && typeof windowHandle.dispatchEvent === "function") {
      try {
        windowHandle.dispatchEvent(createRouterPopStateEvent());
        return;
      } catch {
      }
    }
    const path2 = readRouterPathname();
    for (const handler of routerPopStateHandlers.keys()) {
      try {
        handler(path2);
      } catch {
      }
    }
  };
  const readRouterBasePath = () => {
    const documentHandle = globalThis.document;
    const baseURI = typeof documentHandle?.baseURI === "string" ? documentHandle.baseURI : "";
    if (!baseURI) return "/";
    try {
      if (typeof URL === "function") {
        const parsed = new URL(baseURI, "http://lumina.local");
        return parsed.pathname || "/";
      }
    } catch {
    }
    return baseURI;
  };
  const supportsRouterNavigationApi = () => {
    const windowHandle = getRouterWindowHandle();
    return typeof (windowHandle?.navigation ?? globalThis.navigation) === "object";
  };
  const supportsRouterViewTransition = () => {
    const documentHandle = globalThis.document;
    return typeof documentHandle?.startViewTransition === "function";
  };
  const supportsRouterUrlPattern = () => typeof globalThis.URLPattern === "function";
  const matchRouterUrlPattern = (pattern, path2) => {
    const URLPatternCtor = globalThis.URLPattern;
    if (typeof URLPatternCtor !== "function") return matchRouterPattern(pattern, path2);
    try {
      return new URLPatternCtor({ pathname: pattern }).test({ pathname: normalizeRouterPath(path2) });
    } catch {
      return matchRouterPattern(pattern, path2);
    }
  };
  const startRouterViewTransition = (update) => {
    if (typeof update !== "function") return false;
    const documentHandle = globalThis.document;
    if (typeof documentHandle?.startViewTransition === "function") {
      documentHandle.startViewTransition(() => update());
      return true;
    }
    update();
    return false;
  };
  const url2 = {
    is_available: () => typeof URL === "function",
    parse: (raw) => {
      if (typeof URL !== "function") return deps.resultErr("URL API is not available in this runtime");
      try {
        return deps.resultOk(toUrlRecord(new URL(String(raw))));
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    build: (config) => {
      if (typeof URL !== "function") return deps.resultErr("URL API is not available in this runtime");
      const protocol = normalizeProtocol(config?.protocol);
      const host = String(config?.host ?? "").trim();
      if (!protocol || !host) return deps.resultErr("URL build requires protocol and host");
      try {
        const built = new URL(`${protocol}//${host}`);
        const pathname = config?.pathname;
        const search = config?.search;
        const hash = config?.hash;
        if (pathname != null && pathname !== "") {
          const text2 = String(pathname);
          built.pathname = text2.startsWith("/") ? text2 : `/${text2}`;
        }
        if (search != null && search !== "") {
          const text2 = String(search);
          built.search = text2.startsWith("?") ? text2 : `?${text2}`;
        }
        if (hash != null && hash !== "") {
          const text2 = String(hash);
          built.hash = text2.startsWith("#") ? text2 : `#${text2}`;
        }
        return deps.resultOk(built.href);
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    get_origin: (value) => coerceToUrl(value)?.origin ?? "",
    get_pathname: (value) => coerceToUrl(value)?.pathname ?? "",
    get_search: (value) => coerceToUrl(value)?.search ?? "",
    get_hash: (value) => coerceToUrl(value)?.hash ?? "",
    set_pathname: (value, pathname) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text2 = String(pathname ?? "");
      next.pathname = text2.startsWith("/") ? text2 : `/${text2}`;
      return toUrlRecord(next);
    },
    set_search: (value, search) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text2 = String(search ?? "");
      next.search = !text2 ? "" : text2.startsWith("?") ? text2 : `?${text2}`;
      return toUrlRecord(next);
    },
    append_param: (value, key2, paramValue) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      next.searchParams.append(String(key2), String(paramValue));
      return toUrlRecord(next);
    }
  };
  const web_storage2 = {
    is_available: () => browserLocalStorage() !== null && browserSessionStorage() !== null,
    local_get: (key2) => webStorageGet("local", key2),
    local_set: (key2, value) => webStorageSet("local", key2, value),
    local_remove: (key2) => webStorageRemove("local", key2),
    local_clear: () => webStorageClear("local"),
    local_length: () => webStorageLength("local"),
    session_get: (key2) => webStorageGet("session", key2),
    session_set: (key2, value) => webStorageSet("session", key2, value),
    session_remove: (key2) => webStorageRemove("session", key2),
    session_clear: () => webStorageClear("session"),
    session_length: () => webStorageLength("session")
  };
  const dom2 = {
    is_available: () => getDocumentHandle() !== null,
    call_global_1: (name, arg) => {
      const key2 = String(name);
      const fn = globalThis[key2];
      if (typeof fn !== "function") {
        return {
          ok: false,
          js: "",
          output: `// Missing global function: ${key2}`,
          diagnostics: [{ severity: "error", message: `Missing global function: ${key2}` }]
        };
      }
      try {
        return fn(arg);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : String(error);
        return {
          ok: false,
          js: "",
          output: `// ${message}`,
          diagnostics: [{ severity: "error", message }]
        };
      }
    },
    call_global_1_string: (name, arg) => {
      const value = dom2.call_global_1(name, arg);
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const record = value;
        if (typeof record.output === "string") return record.output;
        if (typeof record.message === "string") return record.message;
      }
      return value == null ? "" : String(value);
    },
    query: (selector) => {
      const doc = getDocumentHandle();
      if (!doc) return deps.optionNone;
      const element = doc.querySelector(String(selector));
      return element ? deps.optionSome(toDomHandle(element)) : deps.optionNone;
    },
    query_all: (selector) => {
      const doc = getDocumentHandle();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll(String(selector))).map((entry) => toDomHandle(entry));
    },
    create: (tag) => {
      const doc = getDocumentHandle();
      if (!doc) return toDomHandle(createDomStubElement());
      return toDomHandle(doc.createElement(String(tag)));
    },
    get_attr: (elementHandle, name) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.getAttribute !== "function") return deps.optionNone;
      const value = element.getAttribute(String(name));
      return value == null ? deps.optionNone : deps.optionSome(value);
    },
    set_attr: (elementHandle, name, value) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.setAttribute !== "function") return;
      element.setAttribute(String(name), String(value));
    },
    remove_attr: (elementHandle, name) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.removeAttribute !== "function") return;
      element.removeAttribute(String(name));
    },
    get_text: (elementHandle) => {
      const element = fromDomHandle(elementHandle);
      return element?.textContent ?? "";
    },
    set_text: (elementHandle, text2) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return;
      element.textContent = String(text2);
    },
    get_html: (elementHandle) => {
      const element = fromDomHandle(elementHandle);
      return element?.innerHTML ?? "";
    },
    set_html: (elementHandle, html) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return;
      element.innerHTML = String(html);
    },
    append_child: (parentHandle, childHandle) => {
      const parent = fromDomHandle(parentHandle);
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.appendChild !== "function") return;
      parent.appendChild(child);
    },
    remove_child: (parentHandle, childHandle) => {
      const parent = fromDomHandle(parentHandle);
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.removeChild !== "function") return;
      try {
        parent.removeChild(child);
      } catch {
      }
    },
    add_event: (elementHandle, event, handler) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof handler !== "function") return 0;
      const listener = () => {
        try {
          handler();
        } catch {
        }
      };
      if (typeof element.addEventListener === "function") {
        element.addEventListener(String(event), listener);
      }
      const handle = domNextEventHandle++;
      domEvents.set(handle, { element, event: String(event), listener });
      return handle;
    },
    remove_event: (eventHandle) => {
      const entry = domEvents.get(Math.trunc(eventHandle));
      if (!entry) return;
      if (typeof entry.element.removeEventListener === "function") {
        entry.element.removeEventListener(entry.event, entry.listener);
      }
      domEvents.delete(Math.trunc(eventHandle));
    },
    get_style: (elementHandle, prop) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return "";
      const key2 = String(prop);
      const styleObj = element.style;
      if (!styleObj) return "";
      const value = styleObj[key2];
      return typeof value === "string" ? value : "";
    },
    set_style: (elementHandle, prop, value) => {
      const element = fromDomHandle(elementHandle);
      if (!element || !element.style) return;
      element.style[String(prop)] = String(value);
    }
  };
  const router2 = {
    getCurrentPath: () => readRouterPathname(),
    getCurrentHash: () => readRouterHash(),
    getCurrentSearch: () => readRouterSearch(),
    supportsNavigationApi: () => supportsRouterNavigationApi(),
    supportsViewTransition: () => supportsRouterViewTransition(),
    supportsUrlPattern: () => supportsRouterUrlPattern(),
    matchRoute: (pattern, path2) => matchRouterPattern(pattern, path2),
    matchUrlPattern: (pattern, path2) => matchRouterUrlPattern(pattern, path2),
    extractParams: (pattern, path2) => extractRouterParams(pattern, path2),
    parseSearchParams: (search) => parseRouterSearchParams(search),
    push: (path2) => {
      const normalized = String(path2);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.pushState === "function") {
        try {
          historyHandle.pushState(historyHandle.state ?? null, "", normalized);
          updateRouterLocationValue(normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    },
    replace: (path2) => {
      const normalized = String(path2);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.replaceState === "function") {
        try {
          historyHandle.replaceState(historyHandle.state ?? null, "", normalized);
          updateRouterLocationValue(normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    },
    onPopState: (handler) => {
      if (typeof handler !== "function") return;
      router2.offPopState(handler);
      const listener = () => {
        try {
          handler(readRouterPathname());
        } catch {
        }
      };
      routerPopStateHandlers.set(handler, listener);
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.addEventListener === "function") {
        windowHandle.addEventListener("popstate", listener);
      }
    },
    offPopState: (handler) => {
      if (typeof handler !== "function") return;
      const listener = routerPopStateHandlers.get(handler);
      if (!listener) return;
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.removeEventListener === "function") {
        windowHandle.removeEventListener("popstate", listener);
      }
      routerPopStateHandlers.delete(handler);
    },
    getBasePath: () => readRouterBasePath(),
    getScrollRestoration: () => {
      const value = getRouterHistoryHandle()?.scrollRestoration;
      return typeof value === "string" ? value : "";
    },
    setScrollRestoration: (mode) => {
      const historyHandle = getRouterHistoryHandle();
      if (!historyHandle) return;
      const normalized = String(mode) === "manual" ? "manual" : "auto";
      try {
        historyHandle.scrollRestoration = normalized;
      } catch {
      }
    },
    scrollToTop: () => {
      const windowHandle = getRouterWindowHandle();
      try {
        windowHandle?.scrollTo?.(0, 0);
      } catch {
      }
    },
    startViewTransition: (update) => startRouterViewTransition(update)
  };
  return {
    url: url2,
    web_storage: web_storage2,
    dom: dom2,
    router: router2
  };
};

// src/runtime/channel-runtime.ts
var channelRuntimeConfig = null;
var requireChannelRuntimeConfig = () => {
  if (!channelRuntimeConfig) {
    throw new Error("Channel runtime is not configured");
  }
  return channelRuntimeConfig;
};
var isChannelValue = (value) => !!value && typeof value === "object" && "__lumina_channel_value" in value;
var isChannelClose = (value) => !!value && typeof value === "object" && value.__lumina_channel_close === true;
var isChannelAck = (value) => !!value && typeof value === "object" && typeof value.__lumina_channel_ack === "number";
var resolveMessageChannel = () => {
  if (typeof MessageChannel === "function") return MessageChannel;
  return null;
};
var createSenderSharedState = (port, capacity) => ({
  port,
  credits: capacity,
  refs: 1,
  closed: false,
  receiverClosed: false,
  pending: [],
  flushing: false
});
var senderPostNow = (state2, value) => {
  if (state2.closed || state2.receiverClosed) return false;
  if (state2.credits !== null && state2.credits <= 0) return false;
  if (state2.credits !== null) {
    state2.credits -= 1;
  }
  const payload = { __lumina_channel_value: value };
  try {
    state2.port.postMessage(payload);
    return true;
  } catch {
    state2.closed = true;
    return false;
  }
};
var drainPendingSends = (state2) => {
  if (state2.flushing) return;
  state2.flushing = true;
  try {
    while (state2.pending.length > 0) {
      if (state2.closed || state2.receiverClosed) {
        while (state2.pending.length > 0) {
          const item = state2.pending.shift();
          if (item) item.resolve(false);
        }
        return;
      }
      if (state2.credits !== null && state2.credits <= 0) {
        return;
      }
      const next = state2.pending.shift();
      if (!next) return;
      next.resolve(senderPostNow(state2, next.value));
    }
  } finally {
    state2.flushing = false;
  }
};
var Sender = class _Sender {
  constructor(shared) {
    this.shared = shared;
    this.closedLocal = false;
  }
  static create(port, capacity) {
    const shared = createSenderSharedState(port, capacity);
    const sender = new _Sender(shared);
    shared.port.start?.();
    shared.port.onmessage = (event) => {
      const data = event.data;
      if (isChannelClose(data)) {
        shared.receiverClosed = true;
        shared.closed = true;
        drainPendingSends(shared);
        return;
      }
      if (isChannelAck(data) && shared.credits !== null) {
        shared.credits += data.__lumina_channel_ack;
        drainPendingSends(shared);
      }
    };
    return sender;
  }
  clone() {
    const clone = new _Sender(this.shared);
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      clone.closedLocal = true;
      return clone;
    }
    this.shared.refs += 1;
    return clone;
  }
  sendFailureReason() {
    if (this.shared.receiverClosed) return "receiver closed";
    if (this.closedLocal || this.shared.closed) return "sender closed";
    if (this.shared.credits !== null && this.shared.credits <= 0) return "channel full";
    return "send failed";
  }
  send(value) {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    if (senderPostNow(this.shared, value)) {
      return Promise.resolve(true);
    }
    if (this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      this.shared.pending.push({ value, resolve });
      drainPendingSends(this.shared);
    });
  }
  try_send(value) {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) return false;
    return senderPostNow(this.shared, value);
  }
  send_result(value) {
    const { getResult } = requireChannelRuntimeConfig();
    if (this.try_send(value)) return getResult().Ok(void 0);
    return getResult().Err(this.sendFailureReason());
  }
  async send_async_result(value) {
    const { getResult } = requireChannelRuntimeConfig();
    const ok = await this.send(value);
    if (ok) return getResult().Ok(void 0);
    return getResult().Err(this.sendFailureReason());
  }
  is_closed() {
    return this.closedLocal || this.shared.closed || this.shared.receiverClosed;
  }
  drop() {
    this.close();
  }
  close() {
    if (this.closedLocal) return;
    this.closedLocal = true;
    if (this.shared.refs > 0) this.shared.refs -= 1;
    if (this.shared.refs > 0) return;
    const shouldSendClose = !this.shared.closed;
    this.shared.closed = true;
    while (this.shared.pending.length > 0) {
      const item = this.shared.pending.shift();
      if (item) item.resolve(false);
    }
    if (shouldSendClose) {
      const payload = { __lumina_channel_close: true };
      try {
        this.shared.port.postMessage(payload);
      } catch {
      }
    }
    try {
      this.shared.port.close();
    } catch {
    }
  }
};
var Receiver = class {
  constructor(port, capacity) {
    this.port = port;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    this.errorMessage = null;
    this.capacity = capacity;
    this.ackOnConsume = this.capacity !== null && this.capacity > 0;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (isChannelClose(data)) {
        this.closed = true;
        this.flushWaiters(requireChannelRuntimeConfig().getOption().None);
        return;
      }
      if (isChannelAck(data)) return;
      const value = isChannelValue(data) ? data.__lumina_channel_value : data;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(requireChannelRuntimeConfig().getOption().Some(value));
        this.sendAckIfNeeded();
      } else {
        this.queue.push(value);
      }
    };
    this.port.onmessageerror = () => {
      this.closed = true;
      this.errorMessage = "channel message error";
      this.flushWaiters(requireChannelRuntimeConfig().getOption().None);
    };
    this.port.start?.();
  }
  flushWaiters(value) {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }
  sendAckIfNeeded() {
    if (!this.ackOnConsume) return;
    const payload = { __lumina_channel_ack: 1 };
    this.port.postMessage(payload);
  }
  recv() {
    const { getOption } = requireChannelRuntimeConfig();
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Promise.resolve(getOption().Some(value));
    }
    if (this.closed) {
      return Promise.resolve(getOption().None);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (this.capacity === 0) {
        const payload = { __lumina_channel_ack: 1 };
        this.port.postMessage(payload);
      }
    });
  }
  try_recv() {
    const { getOption } = requireChannelRuntimeConfig();
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return getOption().Some(value);
    }
    return getOption().None;
  }
  async recv_result() {
    const { getResult, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2 } = requireChannelRuntimeConfig();
    if (this.errorMessage && this.queue.length === 0) {
      return getResult().Err(this.errorMessage);
    }
    const value = await this.recv();
    const tag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
    if (tag === "None" && this.errorMessage) {
      return getResult().Err(this.errorMessage);
    }
    return getResult().Ok(value);
  }
  try_recv_result() {
    const { getResult } = requireChannelRuntimeConfig();
    if (this.errorMessage && this.queue.length === 0) {
      return getResult().Err(this.errorMessage);
    }
    return getResult().Ok(this.try_recv());
  }
  is_closed() {
    return this.closed;
  }
  drop() {
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    const payload = { __lumina_channel_close: true };
    try {
      this.port.postMessage(payload);
    } catch {
    }
    this.port.close();
    this.flushWaiters(requireChannelRuntimeConfig().getOption().None);
  }
};
var createChannelRuntime = (deps) => {
  channelRuntimeConfig = deps;
  const channel2 = {
    is_available: () => resolveMessageChannel() !== null,
    new: () => channel2.bounded(-1),
    bounded: (capacity) => {
      const ChannelCtor = resolveMessageChannel();
      if (!ChannelCtor) {
        throw new Error("MessageChannel is not available in this environment");
      }
      const normalized = Number.isFinite(capacity) ? Math.trunc(capacity) : -1;
      const cap = normalized < 0 ? null : normalized;
      const { port1, port2 } = new ChannelCtor();
      return { sender: Sender.create(port1, cap), receiver: new Receiver(port2, cap) };
    },
    send: (sender, value) => sender.try_send(value),
    try_send: (sender, value) => sender.try_send(value),
    send_async: (sender, value) => sender.send(value),
    send_result: (sender, value) => sender.send_result(value),
    send_async_result: (sender, value) => sender.send_async_result(value),
    clone_sender: (sender) => sender.clone(),
    recv: (receiver) => receiver.recv(),
    try_recv: (receiver) => receiver.try_recv(),
    recv_result: (receiver) => receiver.recv_result(),
    try_recv_result: (receiver) => receiver.try_recv_result(),
    is_sender_closed: (sender) => sender.is_closed(),
    is_receiver_closed: (receiver) => receiver.is_closed(),
    close_sender: (sender) => sender.close(),
    close_receiver: (receiver) => receiver.close(),
    drop_sender: (sender) => sender.drop(),
    drop_receiver: (receiver) => receiver.drop(),
    close: (ch) => {
      ch.sender.close();
      ch.receiver.close();
    }
  };
  return channel2;
};

// src/runtime/node-platform.ts
var cachedNodeRequire;
var cachedNodePath;
var cachedReadFileSync;
var cachedSpawnSync;
var isNodeRuntime = () => typeof globalThis.process !== "undefined" && typeof globalThis.process?.versions?.node === "string";
var getNodeProcess = () => {
  const candidate = globalThis.process;
  return candidate ?? null;
};
var getNodeRequire = () => {
  if (cachedNodeRequire !== void 0) return cachedNodeRequire;
  const fromGlobal = globalThis.__luminaRequire ?? globalThis.require;
  if (typeof fromGlobal === "function") {
    cachedNodeRequire = fromGlobal;
    return cachedNodeRequire;
  }
  try {
    const fromEval = Function('return (typeof require !== "undefined") ? require : undefined;')();
    if (typeof fromEval === "function") {
      cachedNodeRequire = fromEval;
      return cachedNodeRequire;
    }
  } catch {
  }
  const mainModuleReq = getNodeProcess()?.mainModule?.require;
  if (typeof mainModuleReq === "function") {
    cachedNodeRequire = mainModuleReq.bind(getNodeProcess()?.mainModule);
    return cachedNodeRequire;
  }
  cachedNodeRequire = null;
  return cachedNodeRequire;
};
var getNodeBuiltinModule = (id) => {
  const proc = getNodeProcess();
  const getter = proc?.getBuiltinModule;
  if (typeof getter === "function") {
    const direct = getter(id);
    if (direct) return direct;
  }
  const req = getNodeRequire();
  if (!req) return null;
  try {
    return req(id);
  } catch {
    return null;
  }
};
var getNodePath = () => {
  if (cachedNodePath !== void 0) return cachedNodePath;
  const req = getNodeRequire();
  if (!req && !getNodeProcess()?.getBuiltinModule) {
    cachedNodePath = null;
    return cachedNodePath;
  }
  try {
    const mod = getNodeBuiltinModule("node:path") ?? getNodeBuiltinModule("path");
    cachedNodePath = mod.default ?? mod;
    return cachedNodePath;
  } catch {
    cachedNodePath = null;
    return cachedNodePath;
  }
};
var getNodeReadFileSync = () => {
  if (cachedReadFileSync !== void 0) return cachedReadFileSync;
  if (!getNodeRequire() && !getNodeProcess()?.getBuiltinModule) {
    cachedReadFileSync = null;
    return cachedReadFileSync;
  }
  try {
    const mod = getNodeBuiltinModule("node:fs") ?? getNodeBuiltinModule("fs");
    cachedReadFileSync = typeof mod.readFileSync === "function" ? mod.readFileSync.bind(mod) : null;
    return cachedReadFileSync;
  } catch {
    cachedReadFileSync = null;
    return cachedReadFileSync;
  }
};
var getNodeSpawnSync = () => {
  if (cachedSpawnSync !== void 0) return cachedSpawnSync;
  if (!getNodeRequire() && !getNodeProcess()?.getBuiltinModule) {
    cachedSpawnSync = null;
    return cachedSpawnSync;
  }
  try {
    const mod = getNodeBuiltinModule("node:child_process") ?? getNodeBuiltinModule("child_process");
    cachedSpawnSync = typeof mod.spawnSync === "function" ? mod.spawnSync.bind(mod) : null;
    return cachedSpawnSync;
  } catch {
    cachedSpawnSync = null;
    return cachedSpawnSync;
  }
};
var pathSeparator = () => (getNodeProcess()?.platform ?? "").startsWith("win") ? "\\" : "/";
var normalizePathBasic = (value) => {
  const sep = pathSeparator();
  const replaced = String(value).replace(/[\\/]+/g, sep);
  const isAbs = sep === "\\" ? /^[A-Za-z]:\\/.test(replaced) || replaced.startsWith("\\\\") : replaced.startsWith("/");
  const drive = sep === "\\" && /^[A-Za-z]:/.test(replaced) ? replaced.slice(0, 2) : "";
  const body = drive ? replaced.slice(2) : replaced;
  const parts = body.split(sep).filter((part) => part.length > 0 && part !== ".");
  const out = [];
  for (const part of parts) {
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push(part);
      continue;
    }
    out.push(part);
  }
  const prefix = drive ? `${drive}${sep}` : isAbs ? sep : "";
  const joined = out.join(sep);
  return `${prefix}${joined}` || (isAbs ? sep : ".");
};
var joinPathBasic = (left, right) => normalizePathBasic(`${String(left)}${pathSeparator()}${String(right)}`);
var isAbsolutePathBasic = (value) => {
  const text2 = String(value);
  if (pathSeparator() === "\\") return /^[A-Za-z]:[\\/]/.test(text2) || text2.startsWith("\\\\");
  return text2.startsWith("/");
};
var dirnamePathBasic = (value) => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  if (idx <= 0) return ".";
  return normalized.slice(0, idx);
};
var basenamePathBasic = (value) => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  return idx === -1 ? normalized : normalized.slice(idx + 1);
};
var extnamePathBasic = (value) => {
  const base = basenamePathBasic(value);
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx);
};
var resolvePathBasic = (value) => {
  const text2 = String(value);
  if (isAbsolutePathBasic(text2)) return normalizePathBasic(text2);
  const cwd = getNodeProcess()?.cwd?.() ?? ".";
  return normalizePathBasic(`${cwd}${pathSeparator()}${text2}`);
};

// src/runtime/value-runtime.ts
var runtimeTraitImpls = {
  Hash: /* @__PURE__ */ new Map(),
  Eq: /* @__PURE__ */ new Map(),
  Ord: /* @__PURE__ */ new Map()
};
var normalizeTraitTypeName = (typeName) => {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf("<");
  return idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
};
var isEnumLike = (value) => {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return typeof v.$tag === "string" || typeof v.tag === "string";
};
var getEnumTag = (value) => value.$tag ?? value.tag ?? "Unknown";
var getEnumPayload = (value) => {
  if (value.$payload !== void 0) {
    return value.$payload;
  }
  const values = value.values;
  if (!values) return void 0;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
};
var getRuntimeTypeTag = (value) => {
  if (!value || typeof value !== "object") return null;
  const candidate = value.__lumina_type;
  return typeof candidate === "string" ? candidate : null;
};
var __lumina_register_trait_impl = (traitName, forType, impl) => {
  const targetType = normalizeTraitTypeName(forType);
  if (!targetType) return;
  if (traitName === "Hash" && typeof impl === "function") {
    runtimeTraitImpls.Hash.set(targetType, impl);
    return;
  }
  if (traitName === "Eq" && typeof impl === "function") {
    runtimeTraitImpls.Eq.set(targetType, impl);
    return;
  }
  if (traitName === "Ord" && typeof impl === "function") {
    runtimeTraitImpls.Ord.set(targetType, impl);
  }
};
var supportsColor = () => {
  if (typeof window !== "undefined") return false;
  if (!isNodeRuntime()) return false;
  const stdout = getNodeProcess()?.stdout;
  return Boolean(stdout && stdout.isTTY);
};
var colors = {
  reset: "\x1B[0m",
  cyan: "\x1B[36m",
  yellow: "\x1B[33m",
  green: "\x1B[32m",
  magenta: "\x1B[35m",
  gray: "\x1B[90m"
};
var colorize = (text2, color, enabled) => {
  if (!enabled || !color) return text2;
  return `${color}${text2}${colors.reset}`;
};
var defaultFormatOptions = {
  indent: 2,
  maxDepth: 6,
  color: supportsColor()
};
function formatValue(value, options = {}) {
  const config = { ...defaultFormatOptions, ...options };
  const seen = /* @__PURE__ */ new WeakSet();
  const formatEnum = (tag, payload, depth) => {
    if (payload === void 0) return colorize(tag, colors.cyan, config.color);
    if (Array.isArray(payload)) {
      const inner = payload.map((item) => format(item, depth + 1));
      return formatEnumPayload(tag, inner, depth);
    }
    return formatEnumPayload(tag, [format(payload, depth + 1)], depth);
  };
  const formatEnumPayload = (tag, parts, depth) => {
    const name = colorize(tag, colors.cyan, config.color);
    const multiline = parts.some((part) => part.includes("\n")) || parts.join(", ").length > 60;
    if (!multiline) {
      return `${name}(${parts.join(", ")})`;
    }
    const indent = " ".repeat(config.indent * (depth + 1));
    const closing = " ".repeat(config.indent * depth);
    return `${name}(
${indent}${parts.join(`,
${indent}`)}
${closing})`;
  };
  const formatArray = (items, depth) => {
    if (items.length === 0) return "[]";
    if (depth >= config.maxDepth) return "[...]";
    const rendered = items.map((item) => format(item, depth + 1));
    const multiline = rendered.some((item) => item.includes("\n")) || rendered.join(", ").length > 60;
    if (!multiline) return `[${rendered.join(", ")}]`;
    const indent = " ".repeat(config.indent * (depth + 1));
    const closing = " ".repeat(config.indent * depth);
    return `[
${indent}${rendered.join(`,
${indent}`)}
${closing}]`;
  };
  const formatObject = (obj, depth) => {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    if (depth >= config.maxDepth) return "{...}";
    const rendered = entries.map(([key2, val]) => `${key2}: ${format(val, depth + 1)}`);
    const multiline = rendered.some((item) => item.includes("\n")) || rendered.join(", ").length > 60;
    if (!multiline) return `{ ${rendered.join(", ")} }`;
    const indent = " ".repeat(config.indent * (depth + 1));
    const closing = " ".repeat(config.indent * depth);
    return `{
${indent}${rendered.join(`,
${indent}`)}
${closing}}`;
  };
  const format = (val, depth) => {
    if (val === null || val === void 0) return colorize(String(val), colors.gray, config.color);
    if (typeof val === "string") return colorize(val, colors.green, config.color);
    if (typeof val === "number" || typeof val === "bigint") return colorize(String(val), colors.yellow, config.color);
    if (typeof val === "boolean") return colorize(String(val), colors.magenta, config.color);
    if (typeof val === "function") return `[Function${val.name ? ` ${val.name}` : ""}]`;
    if (Array.isArray(val)) return formatArray(val, depth);
    if (typeof val === "object") {
      if (isEnumLike(val)) {
        const tag = getEnumTag(val);
        const payload = getEnumPayload(val);
        return formatEnum(tag, payload, depth);
      }
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
      return formatObject(val, depth);
    }
    try {
      return String(val);
    } catch {
      return "[unprintable]";
    }
  };
  return format(value, 0);
}
var __lumina_stringify = (value) => formatValue(value, { color: false });
var __lumina_struct = (typeName, fields) => {
  try {
    Object.defineProperty(fields, "__lumina_type", {
      value: normalizeTraitTypeName(typeName),
      enumerable: false,
      writable: false,
      configurable: false
    });
  } catch {
    fields.__lumina_type = normalizeTraitTypeName(typeName);
  }
  return fields;
};
var normalizeRuntimeValue = (value) => {
  if (value === null || value === void 0) return value;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function${value.name ? ` ${value.name}` : ""}]`;
  if (Array.isArray(value)) return value.map((item) => normalizeRuntimeValue(item));
  if (typeof value === "object") {
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return { $enum: tag, value: normalizeRuntimeValue(payload) };
    }
    const typeTag = getRuntimeTypeTag(value);
    const obj = value;
    const keys = Object.keys(obj).sort();
    const out = {};
    if (typeTag) out.__lumina_type = typeTag;
    for (const key2 of keys) {
      out[key2] = normalizeRuntimeValue(obj[key2]);
    }
    return out;
  }
  return String(value);
};
var stableRuntimeHash = (value) => JSON.stringify(normalizeRuntimeValue(value));
var deepRuntimeEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepRuntimeEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aTag = getRuntimeTypeTag(a);
  const bTag = getRuntimeTypeTag(b);
  if (aTag !== bTag) return false;
  if (isEnumLike(a) || isEnumLike(b)) {
    if (!isEnumLike(a) || !isEnumLike(b)) return false;
    if (getEnumTag(a) !== getEnumTag(b)) return false;
    return deepRuntimeEqual(getEnumPayload(a), getEnumPayload(b));
  }
  const aObj = a;
  const bObj = b;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  aKeys.sort();
  bKeys.sort();
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const key2 of aKeys) {
    if (!deepRuntimeEqual(aObj[key2], bObj[key2])) return false;
  }
  return true;
};
var runtimeHashValue = (value) => {
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    const hashImpl = runtimeTraitImpls.Hash.get(typeTag);
    if (hashImpl) {
      try {
        return `${typeTag}:${String(hashImpl(value))}`;
      } catch {
        return `${typeTag}:${stableRuntimeHash(value)}`;
      }
    }
  }
  return stableRuntimeHash(value);
};
var runtimeEquals = (left, right) => {
  if (left === right) return true;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const eqImpl = runtimeTraitImpls.Eq.get(leftTag);
    if (eqImpl) {
      try {
        return !!eqImpl(left, right);
      } catch {
        return false;
      }
    }
  }
  return deepRuntimeEqual(left, right);
};
var FAST_CLONE_UNSUPPORTED = /* @__PURE__ */ Symbol("lumina.fast-clone-unsupported");
var isPlainCloneableObject = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
var cloneFast = (value, seen = /* @__PURE__ */ new WeakMap()) => {
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const cached2 = seen.get(value);
    if (cached2) return cached2;
    const out2 = new Array(value.length);
    seen.set(value, out2);
    for (let index = 0; index < value.length; index += 1) {
      const cloned = cloneFast(value[index], seen);
      if (cloned === FAST_CLONE_UNSUPPORTED) {
        return FAST_CLONE_UNSUPPORTED;
      }
      out2[index] = cloned;
    }
    return out2;
  }
  if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return FAST_CLONE_UNSUPPORTED;
  }
  if (!isPlainCloneableObject(value)) {
    return FAST_CLONE_UNSUPPORTED;
  }
  const cached = seen.get(value);
  if (cached) return cached;
  const out = {};
  seen.set(value, out);
  for (const [key2, entry] of Object.entries(value)) {
    const cloned = cloneFast(entry, seen);
    if (cloned === FAST_CLONE_UNSUPPORTED) {
      return FAST_CLONE_UNSUPPORTED;
    }
    out[key2] = cloned;
  }
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    try {
      Object.defineProperty(out, "__lumina_type", {
        value: typeTag,
        enumerable: false,
        writable: false,
        configurable: false
      });
    } catch {
      out.__lumina_type = typeTag;
    }
  }
  return out;
};
var cloneFallback = (value) => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast;
  }
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneFallback(entry));
  const out = {};
  for (const [key2, entry] of Object.entries(value)) {
    out[key2] = cloneFallback(entry);
  }
  const typeTag = getRuntimeTypeTag(value);
  if (typeTag) {
    try {
      Object.defineProperty(out, "__lumina_type", {
        value: typeTag,
        enumerable: false,
        writable: false,
        configurable: false
      });
    } catch {
      out.__lumina_type = typeTag;
    }
  }
  return out;
};
var __lumina_clone = (value) => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast;
  }
  const cloneFn = globalThis.structuredClone;
  if (typeof cloneFn === "function") {
    try {
      return cloneFn(value);
    } catch {
    }
  }
  return cloneFallback(value);
};
var __lumina_debug = (value) => formatValue(value, { color: false });
var __lumina_eq = (left, right) => runtimeEquals(left, right);
var orderingToNumber = (value) => {
  if (typeof value === "number") return value < 0 ? -1 : value > 0 ? 1 : 0;
  if (typeof value === "bigint") return value < 0n ? -1 : value > 0n ? 1 : 0;
  if (typeof value === "string") {
    const text2 = value.toLowerCase();
    if (text2 === "less") return -1;
    if (text2 === "equal") return 0;
    if (text2 === "greater") return 1;
  }
  if (isEnumLike(value)) {
    const tag = getEnumTag(value).toLowerCase();
    if (tag === "less") return -1;
    if (tag === "equal") return 0;
    if (tag === "greater") return 1;
  }
  return 0;
};
var compareRuntimeValues = (left, right) => {
  if (left === right) return 0;
  const leftTag = getRuntimeTypeTag(left);
  const rightTag = getRuntimeTypeTag(right);
  if (leftTag && rightTag && leftTag === rightTag) {
    const ordImpl = runtimeTraitImpls.Ord.get(leftTag);
    if (ordImpl) {
      try {
        return orderingToNumber(ordImpl(left, right));
      } catch {
      }
    }
  }
  if (left == null && right != null) return -1;
  if (left != null && right == null) return 1;
  const leftType = typeof left;
  const rightType = typeof right;
  if (leftType === rightType && (leftType === "number" || leftType === "bigint" || leftType === "string" || leftType === "boolean")) {
    const leftComparable = left;
    const rightComparable = right;
    return leftComparable < rightComparable ? -1 : 1;
  }
  const leftText = formatValue(left, { color: false });
  const rightText = formatValue(right, { color: false });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
};

// src/runtime/collections-runtime.ts
var collectionsRuntimeConfig = null;
var requireCollectionsRuntimeConfig = () => {
  if (!collectionsRuntimeConfig) {
    throw new Error("Collections runtime is not configured");
  }
  return collectionsRuntimeConfig;
};
var Option = () => requireCollectionsRuntimeConfig().getOption();
var normalizeCount = (value) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
var compareOrder = (left, right) => {
  if (left === right) return 0;
  const leftComparable = left;
  const rightComparable = right;
  return leftComparable < rightComparable ? -1 : 1;
};
var toIterableValues = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iteratorFn = value[Symbol.iterator];
    if (typeof iteratorFn === "function") {
      return Array.from(value);
    }
  }
  return [];
};
var configureCollectionsRuntime = (deps) => {
  collectionsRuntimeConfig = deps;
};
var list = {
  map: (f, xs) => xs.map(f),
  filter: (pred, xs) => xs.filter(pred),
  fold: (f, init, xs) => xs.reduce((acc, val) => f(acc, val), init),
  reverse: (xs) => xs.slice().reverse(),
  length: (xs) => xs.length,
  append: (xs, ys) => xs.concat(ys),
  take: (n, xs) => xs.slice(0, Math.max(0, n)),
  drop: (n, xs) => xs.slice(Math.max(0, n)),
  find: (pred, xs) => {
    const found = xs.find(pred);
    return found === void 0 ? Option().None : Option().Some(found);
  },
  any: (pred, xs) => xs.some(pred),
  all: (pred, xs) => xs.every(pred)
};
var Vec = class _Vec {
  constructor() {
    this.data = [];
  }
  static new() {
    return new _Vec();
  }
  static from(items) {
    const next = new _Vec();
    next.data = Array.isArray(items) ? [...items] : [];
    return next;
  }
  push(value) {
    this.data.push(value);
  }
  get(index) {
    if (!Number.isFinite(index)) return Option().None;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < this.data.length ? Option().Some(this.data[idx]) : Option().None;
  }
  len() {
    return this.data.length;
  }
  pop() {
    if (this.data.length === 0) return Option().None;
    const value = this.data.pop();
    return Option().Some(value);
  }
  clear() {
    this.data = [];
  }
  map(mapper) {
    const out = _Vec.new();
    for (const item of this.data) {
      out.push(mapper(item));
    }
    return out;
  }
  filter(predicate) {
    const out = _Vec.new();
    for (const item of this.data) {
      if (predicate(item)) out.push(item);
    }
    return out;
  }
  fold(init, folder) {
    let acc = init;
    for (const item of this.data) {
      acc = folder(acc, item);
    }
    return acc;
  }
  for_each(action) {
    for (const item of this.data) {
      action(item);
    }
  }
  any(predicate) {
    return this.data.some(predicate);
  }
  all(predicate) {
    return this.data.every(predicate);
  }
  find(predicate) {
    const found = this.data.find(predicate);
    return found === void 0 ? Option().None : Option().Some(found);
  }
  position(predicate) {
    const idx = this.data.findIndex(predicate);
    return idx >= 0 ? Option().Some(idx) : Option().None;
  }
  take(n) {
    const out = _Vec.new();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = 0; i < Math.min(count, this.data.length); i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }
  skip(n) {
    const out = _Vec.new();
    const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    for (let i = Math.min(count, this.data.length); i < this.data.length; i += 1) {
      out.push(this.data[i]);
    }
    return out;
  }
  zip(other) {
    const out = _Vec.new();
    const size = Math.min(this.data.length, other.data.length);
    for (let i = 0; i < size; i += 1) {
      out.push([this.data[i], other.data[i]]);
    }
    return out;
  }
  enumerate() {
    const out = _Vec.new();
    for (let i = 0; i < this.data.length; i += 1) {
      out.push([i, this.data[i]]);
    }
    return out;
  }
  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
};
var timeout = async (ms) => {
  await requireCollectionsRuntimeConfig().timeSleep(ms);
};
var join_all = async (values) => {
  const resolved = await Promise.all(toIterableValues(values).map((item) => Promise.resolve(item)));
  return Vec.from(resolved);
};
var vec = {
  new: () => Vec.new(),
  from: (items) => Vec.from(items),
  push: (v, value) => v.push(value),
  get: (v, index) => v.get(index),
  len: (v) => v.len(),
  pop: (v) => v.pop(),
  clear: (v) => v.clear(),
  map: (v, f) => v.map(f),
  filter: (v, pred) => v.filter(pred),
  fold: (v, init, f) => v.fold(init, f),
  for_each: (v, f) => v.for_each(f),
  any: (v, pred) => v.any(pred),
  all: (v, pred) => v.all(pred),
  find: (v, pred) => v.find(pred),
  position: (v, pred) => v.position(pred),
  take: (v, n) => v.take(n),
  skip: (v, n) => v.skip(n),
  zip: (v, other) => v.zip(other),
  enumerate: (v) => v.enumerate(),
  fused_filter_map_fold: (v, pred, mapper, init, folder) => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_map_fold: (v, mapper, init, folder) => {
    let acc = init;
    for (const item of v) {
      acc = folder(acc, mapper(item));
    }
    return acc;
  },
  fused_filter_fold: (v, pred, init, folder) => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, item);
    }
    return acc;
  },
  fused_pipeline: (v, stages, init, folder) => {
    let acc = init;
    for (const item of v) {
      let current = item;
      let keep = true;
      for (const stage of stages) {
        if (stage.kind === "map") {
          current = stage.f(current);
          continue;
        }
        if (stage.kind === "filter") {
          if (!stage.f(current)) {
            keep = false;
            break;
          }
          continue;
        }
      }
      if (!keep) continue;
      acc = folder(acc, current);
    }
    return acc;
  }
};
var iter = {
  map_vec: (values, mapper) => vec.map(values, mapper),
  filter_vec: (values, pred) => vec.filter(values, pred),
  filter_option: (value, pred) => {
    const tag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (tag !== "Some") return Option().None;
    const payload = getEnumPayload(value);
    return pred(payload) ? Option().Some(payload) : Option().None;
  },
  zip_vec: (left, right) => vec.zip(left, right),
  enumerate_vec: (values) => vec.enumerate(values),
  flatten_vec: (values) => {
    const out = Vec.new();
    for (const inner of values) {
      if (!(inner instanceof Vec)) continue;
      for (const value of inner) out.push(value);
    }
    return out;
  },
  flat_map_vec: (values, mapper) => {
    const out = Vec.new();
    for (const value of values) {
      const mapped = mapper(value);
      if (!(mapped instanceof Vec)) continue;
      for (const inner of mapped) out.push(inner);
    }
    return out;
  },
  chunk_vec: (values, size) => {
    const out = Vec.new();
    const chunkSize = normalizeCount(size);
    if (chunkSize <= 0) return out;
    let current = Vec.new();
    let count = 0;
    for (const value of values) {
      current.push(value);
      count += 1;
      if (count >= chunkSize) {
        out.push(current);
        current = Vec.new();
        count = 0;
      }
    }
    if (current.len() > 0) out.push(current);
    return out;
  },
  window_vec: (values, size) => {
    const out = Vec.new();
    const windowSize = normalizeCount(size);
    if (windowSize <= 0 || windowSize > values.len()) return out;
    const source = Array.from(values);
    for (let start = 0; start <= values.len() - windowSize; start += 1) {
      const window2 = Vec.new();
      for (let offset = 0; offset < windowSize; offset += 1) {
        window2.push(source[start + offset]);
      }
      out.push(window2);
    }
    return out;
  },
  partition_vec: (values, pred) => {
    const pass = Vec.new();
    const fail = Vec.new();
    for (const value of values) {
      if (pred(value)) pass.push(value);
      else fail.push(value);
    }
    return [pass, fail];
  },
  take_vec: (values, n) => vec.take(values, n),
  skip_vec: (values, n) => vec.skip(values, n),
  any_vec: (values, pred) => vec.any(values, pred),
  all_vec: (values, pred) => vec.all(values, pred),
  find_vec: (values, pred) => vec.find(values, pred),
  count_vec: (values) => vec.len(values),
  sum_vec: (values) => vec.fold(values, 0, (acc, value) => acc + value),
  sum_vec_f64: (values) => vec.fold(values, 0, (acc, value) => acc + value),
  unique_vec: (values) => {
    const out = Vec.new();
    for (const value of values) {
      let seen = false;
      for (const existing of out) {
        if (runtimeEquals(existing, value)) {
          seen = true;
          break;
        }
      }
      if (!seen) out.push(value);
    }
    return out;
  },
  reverse_vec: (values) => Vec.from(Array.from(values).reverse()),
  sort_vec: (values, cmp) => Vec.from(Array.from(values).sort((left, right) => cmp(left, right))),
  sort_by_vec: (values, key2) => Vec.from(Array.from(values).sort((left, right) => compareOrder(key2(left), key2(right)))),
  sort_by_desc_vec: (values, key2) => Vec.from(Array.from(values).sort((left, right) => compareOrder(key2(right), key2(left)))),
  group_by_vec: (values, key2) => {
    const out = HashMap.new();
    for (const value of values) {
      const groupKey = key2(value);
      const existing = out.get(groupKey);
      if (existing === Option().None) {
        const bucket2 = Vec.new();
        bucket2.push(value);
        out.insert(groupKey, bucket2);
        continue;
      }
      const bucket = getEnumPayload(existing);
      bucket.push(value);
    }
    return out;
  },
  intersperse_vec: (values, sep) => {
    const out = Vec.new();
    let first = true;
    for (const value of values) {
      if (!first) out.push(sep);
      out.push(value);
      first = false;
    }
    return out;
  },
  join_vec: (left, right, left_key, right_key) => {
    const out = Vec.new();
    for (const leftValue of left) {
      const leftKey = left_key(leftValue);
      for (const rightValue of right) {
        if (runtimeEquals(leftKey, right_key(rightValue))) {
          out.push([leftValue, rightValue]);
        }
      }
    }
    return out;
  }
};
var map_vec = iter.map_vec;
var filter_vec = iter.filter_vec;
var filter_option = iter.filter_option;
var zip_vec = iter.zip_vec;
var enumerate_vec = iter.enumerate_vec;
var flatten_vec = iter.flatten_vec;
var flat_map_vec = iter.flat_map_vec;
var chunk_vec = iter.chunk_vec;
var window_vec = iter.window_vec;
var partition_vec = iter.partition_vec;
var take_vec = iter.take_vec;
var skip_vec = iter.skip_vec;
var any_vec = iter.any_vec;
var all_vec = iter.all_vec;
var find_vec = iter.find_vec;
var count_vec = iter.count_vec;
var sum_vec = iter.sum_vec;
var sum_vec_f64 = iter.sum_vec_f64;
var unique_vec = iter.unique_vec;
var reverse_vec = iter.reverse_vec;
var sort_vec = iter.sort_vec;
var sort_by_vec = iter.sort_by_vec;
var sort_by_desc_vec = iter.sort_by_desc_vec;
var group_by_vec = iter.group_by_vec;
var intersperse_vec = iter.intersperse_vec;
var join_vec = iter.join_vec;
var query = (items) => ({ items });
var where_q = (q, pred) => ({
  items: iter.filter_vec(q.items, pred)
});
var select_q = (q, mapper) => ({
  items: iter.map_vec(q.items, mapper)
});
var order_by_q = (q, key2) => ({
  items: iter.sort_by_vec(q.items, key2)
});
var order_by_desc_q = (q, key2) => ({
  items: iter.sort_by_desc_vec(q.items, key2)
});
var limit_q = (q, n) => ({ items: iter.take_vec(q.items, n) });
var offset_q = (q, n) => ({ items: iter.skip_vec(q.items, n) });
var group_by_q = (q, key2) => iter.group_by_vec(q.items, key2);
var count_q = (q) => iter.count_vec(q.items);
var first_q = (q) => vec.get(q.items, 0);
var to_vec_q = (q) => q.items;
var join_q = (left, right, left_key, right_key) => ({
  items: iter.join_vec(left.items, right.items, left_key, right_key)
});
var HashMap = class _HashMap {
  constructor() {
    this.buckets = /* @__PURE__ */ new Map();
    this.sizeValue = 0;
  }
  static new() {
    return new _HashMap();
  }
  getBucket(key2) {
    const hash = runtimeHashValue(key2);
    const existing = this.buckets.get(hash);
    if (existing) return existing;
    const next = [];
    this.buckets.set(hash, next);
    return next;
  }
  lookupBucket(key2) {
    const hash = runtimeHashValue(key2);
    return this.buckets.get(hash) ?? null;
  }
  insert(key2, value) {
    const bucket = this.getBucket(key2);
    for (let i = 0; i < bucket.length; i += 1) {
      const current = bucket[i];
      if (runtimeEquals(current.key, key2)) {
        const old = current.value;
        current.value = value;
        return Option().Some(old);
      }
    }
    bucket.push({ key: key2, value });
    this.sizeValue += 1;
    return Option().None;
  }
  get(key2) {
    const bucket = this.lookupBucket(key2);
    if (!bucket) return Option().None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key2)) {
        return Option().Some(entry.value);
      }
    }
    return Option().None;
  }
  remove(key2) {
    const hash = runtimeHashValue(key2);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option().None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key2)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option().Some(removed.value);
      }
    }
    return Option().None;
  }
  contains_key(key2) {
    const bucket = this.lookupBucket(key2);
    if (!bucket) return false;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key2)) return true;
    }
    return false;
  }
  len() {
    return this.sizeValue;
  }
  clear() {
    this.buckets.clear();
    this.sizeValue = 0;
  }
  keys() {
    const v = Vec.new();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.key);
      }
    }
    return v;
  }
  values() {
    const v = Vec.new();
    for (const bucket of this.buckets.values()) {
      for (const entry of bucket) {
        v.push(entry.value);
      }
    }
    return v;
  }
};
var hashmap = {
  new: () => HashMap.new(),
  insert: (m, k, v) => m.insert(k, v),
  get: (m, k) => m.get(k),
  remove: (m, k) => m.remove(k),
  contains_key: (m, k) => m.contains_key(k),
  len: (m) => m.len(),
  clear: (m) => m.clear(),
  keys: (m) => m.keys(),
  values: (m) => m.values()
};
var HashSet = class _HashSet {
  constructor() {
    this.map = HashMap.new();
  }
  static new() {
    return new _HashSet();
  }
  insert(value) {
    const result = this.map.insert(value, void 0);
    return result === Option().None;
  }
  contains(value) {
    return this.map.contains_key(value);
  }
  remove(value) {
    const result = this.map.remove(value);
    return result !== Option().None;
  }
  len() {
    return this.map.len();
  }
  clear() {
    this.map.clear();
  }
  values() {
    return this.map.keys();
  }
};
var hashset = {
  new: () => HashSet.new(),
  insert: (s, v) => s.insert(v),
  contains: (s, v) => s.contains(v),
  remove: (s, v) => s.remove(v),
  len: (s) => s.len(),
  clear: (s) => s.clear(),
  values: (s) => s.values()
};
var Deque = class _Deque {
  constructor() {
    this.data = [];
  }
  static new() {
    return new _Deque();
  }
  push_front(value) {
    this.data.unshift(value);
  }
  push_back(value) {
    this.data.push(value);
  }
  pop_front() {
    if (this.data.length === 0) return Option().None;
    const value = this.data.shift();
    return Option().Some(value);
  }
  pop_back() {
    if (this.data.length === 0) return Option().None;
    const value = this.data.pop();
    return Option().Some(value);
  }
  len() {
    return this.data.length;
  }
  clear() {
    this.data = [];
  }
};
var deque = {
  new: () => Deque.new(),
  push_front: (d, value) => d.push_front(value),
  push_back: (d, value) => d.push_back(value),
  pop_front: (d) => d.pop_front(),
  pop_back: (d) => d.pop_back(),
  len: (d) => d.len(),
  clear: (d) => d.clear()
};
var BTreeMap = class _BTreeMap {
  constructor() {
    this.records = [];
  }
  static new() {
    return new _BTreeMap();
  }
  lowerBound(key2) {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (compareRuntimeValues(this.records[mid].key, key2) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  insert(key2, value) {
    const idx = this.lowerBound(key2);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key2) === 0) {
      const previous = this.records[idx].value;
      this.records[idx].value = value;
      return Option().Some(previous);
    }
    this.records.splice(idx, 0, { key: key2, value });
    return Option().None;
  }
  get(key2) {
    const idx = this.lowerBound(key2);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key2) === 0) {
      return Option().Some(this.records[idx].value);
    }
    return Option().None;
  }
  remove(key2) {
    const idx = this.lowerBound(key2);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key2) === 0) {
      const [removed] = this.records.splice(idx, 1);
      return Option().Some(removed.value);
    }
    return Option().None;
  }
  contains_key(key2) {
    const idx = this.lowerBound(key2);
    return idx < this.records.length && compareRuntimeValues(this.records[idx].key, key2) === 0;
  }
  len() {
    return this.records.length;
  }
  clear() {
    this.records = [];
  }
  keys() {
    return Vec.from(this.records.map((entry) => entry.key));
  }
  values() {
    return Vec.from(this.records.map((entry) => entry.value));
  }
  entries() {
    return Vec.from(this.records.map((entry) => [entry.key, entry.value]));
  }
};
var btreemap = {
  new: () => BTreeMap.new(),
  insert: (m, k, v) => m.insert(k, v),
  get: (m, k) => m.get(k),
  remove: (m, k) => m.remove(k),
  contains_key: (m, k) => m.contains_key(k),
  len: (m) => m.len(),
  clear: (m) => m.clear(),
  keys: (m) => m.keys(),
  values: (m) => m.values(),
  entries: (m) => m.entries()
};
var BTreeSet = class _BTreeSet {
  constructor() {
    this.map = BTreeMap.new();
  }
  static new() {
    return new _BTreeSet();
  }
  insert(value) {
    return this.map.insert(value, void 0) === Option().None;
  }
  contains(value) {
    return this.map.contains_key(value);
  }
  remove(value) {
    return this.map.remove(value) !== Option().None;
  }
  len() {
    return this.map.len();
  }
  clear() {
    this.map.clear();
  }
  values() {
    return this.map.keys();
  }
};
var btreeset = {
  new: () => BTreeSet.new(),
  insert: (s, v) => s.insert(v),
  contains: (s, v) => s.contains(v),
  remove: (s, v) => s.remove(v),
  len: (s) => s.len(),
  clear: (s) => s.clear(),
  values: (s) => s.values()
};
var PriorityQueue = class _PriorityQueue {
  constructor() {
    this.heap = [];
  }
  static new() {
    return new _PriorityQueue();
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = index - 1 >> 1;
      if (compareRuntimeValues(this.heap[parent], this.heap[index]) <= 0) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }
  bubbleDown(index) {
    const length = this.heap.length;
    for (; ; ) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && compareRuntimeValues(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < length && compareRuntimeValues(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
  push(value) {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return Option().None;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return Option().Some(top);
  }
  peek() {
    return this.heap.length > 0 ? Option().Some(this.heap[0]) : Option().None;
  }
  len() {
    return this.heap.length;
  }
  clear() {
    this.heap = [];
  }
};
var priority_queue = {
  new: () => PriorityQueue.new(),
  push: (q, value) => q.push(value),
  pop: (q) => q.pop(),
  peek: (q) => q.peek(),
  len: (q) => q.len(),
  clear: (q) => q.clear()
};

// src/runtime/algebra-runtime.ts
var mapHashMapValues = (map, mapper) => {
  const out = HashMap.new();
  for (const key2 of map.keys()) {
    const current = map.get(key2);
    if (current && typeof current === "object" && current.$tag === "Some") {
      out.insert(key2, mapper(current.$payload));
    }
  }
  return out;
};
var pureHashMap = (key2, value) => {
  const out = HashMap.new();
  out.insert(key2, value);
  return out;
};
var apHashMapValues = (fns, values) => {
  const out = HashMap.new();
  for (const key2 of fns.keys()) {
    const fnEntry = fns.get(key2);
    const valueEntry = values.get(key2);
    if (!fnEntry || typeof fnEntry !== "object" || fnEntry.$tag !== "Some" || !valueEntry || typeof valueEntry !== "object" || valueEntry.$tag !== "Some") {
      continue;
    }
    const fn = fnEntry.$payload;
    if (typeof fn !== "function") continue;
    out.insert(key2, fn(valueEntry.$payload));
  }
  return out;
};
var flatMapHashMapValues = (values, mapper) => {
  const out = HashMap.new();
  for (const key2 of values.keys()) {
    const current = values.get(key2);
    if (!current || typeof current !== "object" || current.$tag !== "Some") continue;
    const mapped = mapper(current.$payload);
    if (!(mapped instanceof HashMap)) continue;
    for (const mappedKey of mapped.keys()) {
      const mappedValue = mapped.get(mappedKey);
      if (mappedValue && typeof mappedValue === "object" && mappedValue.$tag === "Some") {
        out.insert(mappedKey, mappedValue.$payload);
      }
    }
  }
  return out;
};
var createAlgebraRuntime = ({ Option: Option3, Result: Result2, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  const functor2 = {
    map_option: (value, mapper) => Option3.map(mapper, value),
    map_result: (value, mapper) => Result2.map(mapper, value),
    map_vec: (values, mapper) => vec.map(values, mapper),
    map_hashmap_values: (values, mapper) => mapHashMapValues(values, mapper)
  };
  const applicative2 = {
    pure_option: (value) => Option3.Some(value),
    pure_result: (value) => Result2.Ok(value),
    pure_vec: (value) => Vec.from([value]),
    pure_hashmap: (key2, value) => pureHashMap(key2, value),
    ap_option: (fns, value) => {
      const fnTag = fns && typeof fns === "object" && isEnumLike2(fns) ? getEnumTag2(fns) : "";
      const valueTag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (fnTag !== "Some" || valueTag !== "Some") return Option3.None;
      const fn = getEnumPayload2(fns);
      if (typeof fn !== "function") return Option3.None;
      return Option3.Some(fn(getEnumPayload2(value)));
    },
    ap_result: (fns, value) => {
      const fnTag = fns && typeof fns === "object" && isEnumLike2(fns) ? getEnumTag2(fns) : "";
      if (fnTag !== "Ok") return fns;
      const valueTag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (valueTag !== "Ok") return value;
      const fn = getEnumPayload2(fns);
      if (typeof fn !== "function") return Result2.Err("Result ap expected Ok(function)");
      return Result2.Ok(fn(getEnumPayload2(value)));
    },
    ap_vec: (fns, values) => {
      const out = Vec.new();
      for (const fn of fns) {
        for (const value of values) {
          out.push(fn(value));
        }
      }
      return out;
    },
    ap_hashmap_values: (fns, values) => apHashMapValues(fns, values)
  };
  const monad2 = {
    flat_map_option: (value, mapper) => Option3.and_then(mapper, value),
    flat_map_result: (value, mapper) => Result2.and_then(mapper, value),
    flat_map_vec: (values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        if (!(mapped instanceof Vec)) continue;
        for (const inner of mapped) out.push(inner);
      }
      return out;
    },
    flat_map_hashmap_values: (values, mapper) => flatMapHashMapValues(values, mapper),
    join_option: (value) => Option3.and_then((v) => v, value),
    join_result: (value) => Result2.and_then((v) => v, value),
    join_vec: (values) => {
      const out = Vec.new();
      for (const inner of values) {
        if (!(inner instanceof Vec)) continue;
        for (const value of inner) out.push(value);
      }
      return out;
    },
    join_hashmap_values: (values) => flatMapHashMapValues(values, (inner) => inner)
  };
  const foldable2 = {
    fold_option: (value, init, folder) => {
      const tag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (tag !== "Some") return init;
      return folder(init, getEnumPayload2(value));
    },
    fold_result: (value, init, folder) => {
      const tag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (tag !== "Ok") return init;
      return folder(init, getEnumPayload2(value));
    },
    fold_vec: (values, init, folder) => vec.fold(values, init, folder),
    fold_hashmap_values: (values, init, folder) => {
      let acc = init;
      for (const value of values.values()) {
        acc = folder(acc, value);
      }
      return acc;
    }
  };
  const traversable2 = {
    traverse_vec_option: (values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === "object" && isEnumLike2(mapped) ? getEnumTag2(mapped) : "";
        if (tag !== "Some") return Option3.None;
        out.push(getEnumPayload2(mapped));
      }
      return Option3.Some(out);
    },
    traverse_vec_result: (values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === "object" && isEnumLike2(mapped) ? getEnumTag2(mapped) : "";
        if (tag !== "Ok") return mapped;
        out.push(getEnumPayload2(mapped));
      }
      return Result2.Ok(out);
    },
    sequence_vec_option: (values) => traversable2.traverse_vec_option(values, (item) => item),
    sequence_vec_result: (values) => traversable2.traverse_vec_result(values, (item) => item)
  };
  return { functor: functor2, applicative: applicative2, monad: monad2, foldable: foldable2, traversable: traversable2 };
};

// src/runtime/core-runtime.ts
var __lumina_range = (start, end, inclusive, hasStart, hasEnd) => {
  const startValue = hasStart ? Number(start) : null;
  const endValue = hasEnd ? Number(end) : null;
  return { start: startValue, end: endValue, inclusive: !!inclusive };
};
var __lumina_slice = (str2, start, end, inclusive) => {
  const actualStart = start ?? 0;
  const actualEnd = end ?? str2.length;
  const finalEnd = inclusive ? actualEnd + 1 : actualEnd;
  if (actualStart < 0 || actualStart > str2.length) {
    throw new Error(`String slice start index ${actualStart} out of bounds`);
  }
  if (finalEnd < 0 || finalEnd > str2.length) {
    throw new Error(`String slice end index ${finalEnd} out of bounds`);
  }
  return str2.substring(actualStart, finalEnd);
};
var isRangeValue = (value) => !!value && typeof value === "object" && "start" in value && "end" in value && "inclusive" in value;
var clampIndex = (value, min, max) => Math.min(Math.max(value, min), max);
var __lumina_fixed_array = (size, initializer) => {
  const normalized = Math.max(0, Math.trunc(size));
  const arr = new Array(normalized);
  if (initializer) {
    for (let i = 0; i < normalized; i += 1) {
      arr[i] = initializer(i);
    }
  }
  return arr;
};
var __lumina_array_bounds_check = (array, index, expectedSize) => {
  if (expectedSize !== void 0 && array.length !== expectedSize) {
    throw new Error(`Array size mismatch: expected ${expectedSize}, got ${array.length}`);
  }
  if (index < 0 || index >= array.length) {
    throw new Error(`Array index out of bounds: ${index} (array length: ${array.length})`);
  }
};
var __lumina_array_literal = (elements, expectedSize) => {
  if (expectedSize !== void 0 && elements.length !== expectedSize) {
    throw new Error(`Array literal has wrong size: expected ${expectedSize}, got ${elements.length}`);
  }
  return elements;
};
function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
var LuminaPanic = class _LuminaPanic extends Error {
  constructor(message, value) {
    super(message);
    this.name = "LuminaPanic";
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _LuminaPanic);
    }
  }
};
var createCoreRuntime = ({ formatValue: formatValue2, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  const __lumina_index2 = (target, index, expectedSize) => {
    if (typeof target === "string" && isRangeValue(index)) {
      const length = target.length;
      const start = index.start == null ? 0 : clampIndex(Math.trunc(index.start), 0, length);
      const endBase = index.end == null ? length : clampIndex(Math.trunc(index.end), 0, length);
      return __lumina_slice(target, start, endBase, index.inclusive);
    }
    if (target && typeof target.get === "function") {
      const result = target.get(Math.trunc(Number(index)));
      const tag = result && typeof result === "object" && isEnumLike2(result) ? getEnumTag2(result) : "";
      if (tag === "Some") return getEnumPayload2(result);
      const err = new LuminaPanic("Index out of bounds", result);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(err, __lumina_index2);
      }
      throw err;
    }
    if (Array.isArray(target)) {
      const normalizedIndex = Math.trunc(Number(index));
      __lumina_array_bounds_check(target, normalizedIndex, expectedSize);
      return target[normalizedIndex];
    }
    if (target && typeof target === "object") {
      return target[String(index)];
    }
    return void 0;
  };
  const Option3 = {
    Some: (value) => ({ $tag: "Some", $payload: value }),
    None: { $tag: "None" },
    map: (fn, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return Option3.Some(fn(getEnumPayload2(opt)));
      return Option3.None;
    },
    and_then: (fn, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return fn(getEnumPayload2(opt));
      return Option3.None;
    },
    or_else: (fallback, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return opt;
      return fallback();
    },
    unwrap_or: (fallback, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return getEnumPayload2(opt);
      return fallback;
    },
    is_some: (opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      return tag === "Some";
    },
    is_none: (opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      return tag !== "Some";
    },
    unwrap: (opt, message) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return getEnumPayload2(opt);
      const rendered = formatValue2(opt);
      const msg = message ?? `Tried to unwrap None: ${rendered}`;
      const err = new LuminaPanic(msg, opt);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(err, Option3.unwrap);
      }
      throw err;
    }
  };
  const Result2 = {
    Ok: (value) => ({ $tag: "Ok", $payload: value }),
    Err: (error) => ({ $tag: "Err", $payload: error }),
    map: (fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return Result2.Ok(fn(getEnumPayload2(res)));
      return res;
    },
    and_then: (fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return fn(getEnumPayload2(res));
      return res;
    },
    or_else: (fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return res;
      return fn(getEnumPayload2(res));
    },
    unwrap_or: (fallback, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return getEnumPayload2(res);
      return fallback;
    },
    is_ok: (res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      return tag === "Ok";
    },
    is_err: (res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      return tag !== "Ok";
    }
  };
  return { __lumina_index: __lumina_index2, Option: Option3, Result: Result2 };
};

// src/runtime/concurrency-runtime.ts
var formatError = (error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};
var isUrlLike = (specifier) => /^[a-z]+:/i.test(specifier);
var toWorkerMessageString = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
var toByteNumber = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(num)));
};
var toByteArray = (value) => {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value.map((entry) => toByteNumber(entry)));
  if (value && typeof value === "object") {
    const iterator = value[Symbol.iterator];
    if (typeof iterator === "function") {
      return Uint8Array.from(Array.from(value).map((entry) => toByteNumber(entry)));
    }
  }
  return new Uint8Array(0);
};
var decodeTextFromBytes = (bytes) => {
  const data = Uint8Array.from(bytes);
  if (typeof TextDecoder === "function") {
    return new TextDecoder().decode(data);
  }
  return String.fromCharCode(...Array.from(data));
};
var STREAM_DEFAULT_CHUNK_SIZE = 16 * 1024;
var AtomicI32 = class {
  constructor(initial) {
    this.storage = null;
    this.fallback = 0;
    const value = Math.trunc(initial) | 0;
    const hasSharedMemory = typeof SharedArrayBuffer === "function" && typeof Atomics !== "undefined";
    if (hasSharedMemory) {
      this.storage = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
      Atomics.store(this.storage, 0, value);
      return;
    }
    this.fallback = value;
  }
  static is_available() {
    return typeof SharedArrayBuffer === "function" && typeof Atomics !== "undefined";
  }
  load() {
    if (!this.storage) return this.fallback;
    return Atomics.load(this.storage, 0);
  }
  store(value) {
    const next = Math.trunc(value) | 0;
    if (!this.storage) {
      this.fallback = next;
      return next;
    }
    Atomics.store(this.storage, 0, next);
    return next;
  }
  add(delta) {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = this.fallback + d | 0;
      return prev;
    }
    return Atomics.add(this.storage, 0, d);
  }
  sub(delta) {
    const d = Math.trunc(delta) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      this.fallback = this.fallback - d | 0;
      return prev;
    }
    return Atomics.sub(this.storage, 0, d);
  }
  compare_exchange(expected, replacement) {
    const exp = Math.trunc(expected) | 0;
    const rep = Math.trunc(replacement) | 0;
    if (!this.storage) {
      const prev = this.fallback;
      if (prev === exp) this.fallback = rep;
      return prev;
    }
    return Atomics.compareExchange(this.storage, 0, exp, rep);
  }
};
var Thread = class {
  constructor(entry, option) {
    this.entry = entry;
    this.option = option;
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    this.exitCode = null;
    this.joinWaiters = [];
    if (entry.kind === "node") {
      entry.worker.on("message", (value) => this.onMessage(value));
      entry.worker.on("error", () => this.finish(-1));
      entry.worker.on("exit", (code) => this.finish(code | 0));
    } else {
      entry.worker.addEventListener("message", (event) => this.onMessage(event.data));
      entry.worker.addEventListener("error", () => this.finish(-1));
    }
  }
  onMessage(value) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(this.option.Some(value));
      return;
    }
    this.queue.push(value);
  }
  finish(code) {
    if (this.exitCode !== null) return;
    this.exitCode = code | 0;
    this.closed = true;
    this.flushWaiters(this.option.None);
    while (this.joinWaiters.length > 0) {
      const waiter = this.joinWaiters.shift();
      if (waiter) waiter(this.exitCode);
    }
  }
  flushWaiters(value) {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }
  post(value) {
    if (this.closed) return false;
    try {
      this.entry.worker.postMessage(value);
      return true;
    } catch {
      return false;
    }
  }
  recv() {
    if (this.queue.length > 0) {
      return Promise.resolve(this.option.Some(this.queue.shift()));
    }
    if (this.closed) {
      return Promise.resolve(this.option.None);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
  try_recv() {
    if (this.queue.length > 0) {
      return this.option.Some(this.queue.shift());
    }
    return this.option.None;
  }
  async terminate() {
    if (this.exitCode !== null) return;
    if (this.entry.kind === "node") {
      const code = await this.entry.worker.terminate();
      this.finish(code | 0);
      return;
    }
    this.entry.worker.terminate();
    this.finish(0);
  }
  join() {
    if (this.exitCode !== null) return Promise.resolve(this.exitCode);
    return new Promise((resolve) => {
      this.joinWaiters.push(resolve);
    });
  }
};
var ThreadHandle = class {
  constructor(task, resultRuntime) {
    this.resultRuntime = resultRuntime;
    this.result = Promise.resolve().then(() => task()).then(
      (value) => this.resultRuntime.Ok(value),
      (error) => this.resultRuntime.Err(error instanceof Error ? error.message : String(error))
    );
  }
  join() {
    return this.result;
  }
};
var createConcurrencyRuntime = (deps) => {
  let webWorkerNextHandle = 1;
  const webWorkerHandles = /* @__PURE__ */ new Map();
  let runtimeStreamNextHandle = 1;
  const runtimeStreams = /* @__PURE__ */ new Map();
  const option = () => deps.getOption();
  const result = () => deps.getResult();
  const channel2 = () => deps.getChannel();
  const resolveNodeWorkerSpecifier = (specifier) => {
    if (isUrlLike(specifier)) return specifier;
    const nodePath = getNodePath();
    return nodePath ? nodePath.resolve(specifier) : resolvePathBasic(specifier);
  };
  const createThreadWorker = async (specifier) => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import("worker_threads");
        const WorkerCtor = nodeWorkers.Worker;
        if (typeof WorkerCtor === "function") {
          const worker = new WorkerCtor(resolveNodeWorkerSpecifier(specifier), { type: "module" });
          return { kind: "node", worker };
        }
      } catch {
      }
    }
    if (typeof Worker === "function") {
      const worker = new Worker(specifier, { type: "module" });
      return { kind: "web", worker };
    }
    throw new Error("Worker API is not available in this environment");
  };
  const getWebWorkerRecord = (handle) => webWorkerHandles.get(Math.trunc(handle)) ?? null;
  const registerWebWorker = (entry, inlineUrl = null) => {
    const id = webWorkerNextHandle++;
    webWorkerHandles.set(id, { id, entry, inlineUrl });
    return id;
  };
  const createInlineWorker = async (source) => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import("worker_threads");
        const WorkerCtor = nodeWorkers.Worker;
        if (typeof WorkerCtor === "function") {
          return {
            worker: { kind: "node", worker: new WorkerCtor(String(source), { eval: true }) },
            inlineUrl: null
          };
        }
      } catch {
      }
    }
    if (typeof Worker === "function" && typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([String(source)], { type: "application/javascript" });
      const inlineUrl = URL.createObjectURL(blob);
      const worker = new Worker(inlineUrl, { type: "module" });
      return { worker: { kind: "web", worker }, inlineUrl };
    }
    throw new Error("Worker API is not available in this environment");
  };
  const cleanupWebWorkerRecord = (record) => {
    if (!record) return;
    webWorkerHandles.delete(record.id);
    if (record.inlineUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(record.inlineUrl);
      } catch {
      }
    }
  };
  const isWorkerContextBrowser = () => typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
  const isWorkerContextNode = () => {
    if (!isNodeRuntime()) return false;
    const workerThreads = getNodeBuiltinModule("node:worker_threads");
    return workerThreads != null && typeof workerThreads.isMainThread === "boolean" ? !workerThreads.isMainThread : false;
  };
  const registerRuntimeStream = (state2) => {
    const id = runtimeStreamNextHandle++;
    runtimeStreams.set(id, { id, state: state2 });
    return id;
  };
  const cleanupRuntimeStreamHandle = (handle, seen = /* @__PURE__ */ new Set()) => {
    const normalized = Math.trunc(handle);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const record = runtimeStreams.get(normalized);
    if (!record) return;
    if (record.state.kind === "reader" && typeof record.state.reader.cancel === "function") {
      try {
        void record.state.reader.cancel();
      } catch {
      }
    }
    runtimeStreams.delete(normalized);
    if (record.state.kind === "pipe") {
      cleanupRuntimeStreamHandle(record.state.sourceHandle, seen);
    }
  };
  const readChunkFromRuntimeStream = async (handle, seen = /* @__PURE__ */ new Set()) => {
    const normalized = Math.trunc(handle);
    if (seen.has(normalized)) {
      return { ok: false, error: "Detected cyclic stream pipeline" };
    }
    const record = runtimeStreams.get(normalized);
    if (!record) return { ok: false, error: `Unknown stream handle ${handle}` };
    if (record.state.kind === "buffer") {
      const state2 = record.state;
      if (state2.offset >= state2.data.length) return { ok: true, chunk: null };
      const nextEnd = Math.min(state2.data.length, state2.offset + state2.chunkSize);
      const chunk = Array.from(state2.data.subarray(state2.offset, nextEnd));
      state2.offset = nextEnd;
      return { ok: true, chunk };
    }
    if (record.state.kind === "reader") {
      const state2 = record.state;
      if (state2.done) return { ok: true, chunk: null };
      try {
        const next = await state2.reader.read();
        if (next.done) {
          state2.done = true;
          return { ok: true, chunk: null };
        }
        return { ok: true, chunk: Array.from(toByteArray(next.value)) };
      } catch (error) {
        return { ok: false, error: formatError(error) };
      }
    }
    const pipeState = record.state;
    const nestedSeen = new Set(seen);
    nestedSeen.add(normalized);
    const source = await readChunkFromRuntimeStream(pipeState.sourceHandle, nestedSeen);
    if (!source.ok) return source;
    if (source.chunk == null) return source;
    try {
      return { ok: true, chunk: Array.from(toByteArray(pipeState.transform(source.chunk))) };
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  };
  const sabYield = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  class Mutex {
    constructor() {
      this.locked = false;
      this.waiters = [];
    }
    async acquire() {
      if (!this.locked) {
        this.locked = true;
        return true;
      }
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }
    try_acquire() {
      if (this.locked) return false;
      this.locked = true;
      return true;
    }
    release() {
      if (!this.locked) return false;
      const next = this.waiters.shift();
      if (next) {
        next(true);
        return true;
      }
      this.locked = false;
      return true;
    }
    is_locked() {
      return this.locked;
    }
  }
  class Semaphore {
    constructor(initialPermits) {
      this.waiters = [];
      this.permits = Math.max(0, Math.trunc(initialPermits));
    }
    async acquire() {
      if (this.permits > 0) {
        this.permits -= 1;
        return true;
      }
      return new Promise((resolve) => {
        this.waiters.push(resolve);
      });
    }
    try_acquire() {
      if (this.permits <= 0) return false;
      this.permits -= 1;
      return true;
    }
    release(count = 1) {
      const n = Math.max(1, Math.trunc(count));
      for (let i = 0; i < n; i += 1) {
        const next = this.waiters.shift();
        if (next) {
          next(true);
        } else {
          this.permits += 1;
        }
      }
    }
    available() {
      return this.permits;
    }
  }
  const sync2 = {
    mutex_new: () => new Mutex(),
    mutex_acquire: async (mutex) => mutex.acquire(),
    mutex_try_acquire: (mutex) => mutex.try_acquire(),
    mutex_release: (mutex) => mutex.release(),
    mutex_is_locked: (mutex) => mutex.is_locked(),
    semaphore_new: (permits) => new Semaphore(permits),
    semaphore_acquire: async (semaphore) => semaphore.acquire(),
    semaphore_try_acquire: (semaphore) => semaphore.try_acquire(),
    semaphore_release: (semaphore, count = 1) => semaphore.release(count),
    semaphore_available: (semaphore) => semaphore.available(),
    atomic_i32_new: (initial) => new AtomicI32(initial),
    atomic_i32_is_available: () => AtomicI32.is_available(),
    atomic_i32_load: (value) => value.load(),
    atomic_i32_store: (value, next) => value.store(next),
    atomic_i32_add: (value, delta) => value.add(delta),
    atomic_i32_sub: (value, delta) => value.sub(delta),
    atomic_i32_compare_exchange: (value, expected, replacement) => value.compare_exchange(expected, replacement)
  };
  const SAB_HEAD = 0;
  const SAB_TAIL = 1;
  const SAB_COUNT = 2;
  const SAB_SENDER_CLOSED = 3;
  const SAB_RECEIVER_CLOSED = 4;
  const SAB_CLOSE_FLAG = 5;
  const SAB_CONTROL_WORDS = 6;
  const SAB_DATA_OFFSET_BYTES = Int32Array.BYTES_PER_ELEMENT * SAB_CONTROL_WORDS;
  const sabElementSize = (kind) => kind === "f64" ? 8 : 4;
  const normalizeSabValue = (kind, value) => {
    const n = Number(value);
    switch (kind) {
      case "u32":
        return Math.trunc(n) >>> 0;
      case "f32":
        return Math.fround(n);
      case "f64":
        return Number(n);
      case "i32":
      default:
        return Math.trunc(n) | 0;
    }
  };
  const createSABChannelState = (capacity, kind) => {
    const cap = Math.max(1, Math.trunc(capacity));
    if (AtomicI32.is_available()) {
      const totalBytes = SAB_DATA_OFFSET_BYTES + cap * sabElementSize(kind);
      const buffer = new SharedArrayBuffer(totalBytes);
      const control = new Int32Array(buffer, 0, SAB_CONTROL_WORDS);
      Atomics.store(control, SAB_HEAD, 0);
      Atomics.store(control, SAB_TAIL, 0);
      Atomics.store(control, SAB_COUNT, 0);
      Atomics.store(control, SAB_SENDER_CLOSED, 0);
      Atomics.store(control, SAB_RECEIVER_CLOSED, 0);
      Atomics.store(control, SAB_CLOSE_FLAG, 0);
      const state2 = { mode: "sab", kind, capacity: cap, control };
      if (kind === "i32") {
        state2.dataI32 = new Int32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else if (kind === "u32") {
        state2.dataU32 = new Uint32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else if (kind === "f32") {
        state2.dataF32 = new Float32Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      } else {
        state2.dataF64 = new Float64Array(buffer, SAB_DATA_OFFSET_BYTES, cap);
      }
      return state2;
    }
    if (channel2().is_available()) {
      const fallback = channel2().bounded(cap);
      return {
        mode: "fallback",
        kind,
        capacity: cap,
        fallbackSender: fallback.sender,
        fallbackReceiver: fallback.receiver
      };
    }
    throw new Error("SharedArrayBuffer + Atomics or MessageChannel fallback is not available in this environment");
  };
  const writeSabStateValue = (state2, index, value) => {
    const normalized = normalizeSabValue(state2.kind, value);
    switch (state2.kind) {
      case "u32":
        state2.dataU32[index] = normalized >>> 0;
        return;
      case "f32":
        state2.dataF32[index] = Math.fround(normalized);
        return;
      case "f64":
        state2.dataF64[index] = Number(normalized);
        return;
      case "i32":
      default:
        state2.dataI32[index] = Math.trunc(normalized) | 0;
    }
  };
  const readSabStateValue = (state2, index) => {
    switch (state2.kind) {
      case "u32":
        return state2.dataU32[index] >>> 0;
      case "f32":
        return Math.fround(state2.dataF32[index]);
      case "f64":
        return Number(state2.dataF64[index]);
      case "i32":
      default:
        return Math.trunc(state2.dataI32[index]) | 0;
    }
  };
  class SABSenderBase {
    constructor(state2) {
      this.state = state2;
    }
    try_send(value) {
      const normalized = normalizeSabValue(this.state.kind, value);
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackSender) return false;
        return channel2().try_send(this.state.fallbackSender, normalized);
      }
      const control = this.state.control;
      if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0) return false;
      if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return false;
      const count = Atomics.load(control, SAB_COUNT);
      if (count >= this.state.capacity) return false;
      const tail = Atomics.load(control, SAB_TAIL);
      writeSabStateValue(this.state, tail, normalized);
      Atomics.store(control, SAB_TAIL, (tail + 1) % this.state.capacity);
      Atomics.store(control, SAB_COUNT, count + 1);
      Atomics.notify(control, SAB_COUNT, 1);
      return true;
    }
    async send(value) {
      for (; ; ) {
        if (this.try_send(value)) return true;
        if (this.is_closed()) return false;
        await sabYield();
      }
    }
    async send_timeout(value, timeoutMs) {
      const deadline = Date.now() + Math.max(0, Math.trunc(timeoutMs));
      for (; ; ) {
        if (this.try_send(value)) return result().Ok(void 0);
        if (this.is_closed()) return result().Err("closed");
        if (Date.now() >= deadline) return result().Err("timeout");
        await sabYield();
      }
    }
    is_closed() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackSender) return true;
        return channel2().is_sender_closed(this.state.fallbackSender);
      }
      const control = this.state.control;
      return Atomics.load(control, SAB_SENDER_CLOSED) !== 0 || Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0;
    }
    close() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackSender) return;
        channel2().close_sender(this.state.fallbackSender);
        return;
      }
      const control = this.state.control;
      Atomics.store(control, SAB_SENDER_CLOSED, 1);
      Atomics.store(control, SAB_CLOSE_FLAG, 1);
      Atomics.notify(control, SAB_COUNT);
    }
    drop() {
      this.close();
    }
  }
  class SABReceiverBase {
    constructor(state2) {
      this.state = state2;
    }
    try_recv() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackReceiver) return option().None;
        const value2 = channel2().try_recv(this.state.fallbackReceiver);
        if (deps.getEnumTag(value2) !== "Some") return option().None;
        return option().Some(normalizeSabValue(this.state.kind, Number(deps.getEnumPayload(value2))));
      }
      const control = this.state.control;
      const count = Atomics.load(control, SAB_COUNT);
      if (count <= 0) return option().None;
      const head = Atomics.load(control, SAB_HEAD);
      const value = readSabStateValue(this.state, head);
      Atomics.store(control, SAB_HEAD, (head + 1) % this.state.capacity);
      Atomics.store(control, SAB_COUNT, count - 1);
      Atomics.notify(control, SAB_COUNT, 1);
      return option().Some(value);
    }
    async recv() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackReceiver) return option().None;
        for (; ; ) {
          const value = await channel2().recv(this.state.fallbackReceiver);
          if (deps.getEnumTag(value) === "Some") {
            return option().Some(normalizeSabValue(this.state.kind, Number(deps.getEnumPayload(value))));
          }
          if (this.is_closed()) return option().None;
          await sabYield();
        }
      }
      for (; ; ) {
        const value = this.try_recv();
        if (deps.getEnumTag(value) === "Some") return value;
        if (this.is_closed()) return option().None;
        await sabYield();
      }
    }
    is_closed() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackReceiver) return true;
        return channel2().is_receiver_closed(this.state.fallbackReceiver);
      }
      const control = this.state.control;
      if (Atomics.load(control, SAB_RECEIVER_CLOSED) !== 0) return true;
      if (Atomics.load(control, SAB_SENDER_CLOSED) !== 0 && Atomics.load(control, SAB_COUNT) <= 0) return true;
      return false;
    }
    close() {
      if (this.state.mode === "fallback") {
        if (!this.state.fallbackReceiver) return;
        channel2().close_receiver(this.state.fallbackReceiver);
        return;
      }
      const control = this.state.control;
      Atomics.store(control, SAB_RECEIVER_CLOSED, 1);
      Atomics.store(control, SAB_CLOSE_FLAG, 1);
      Atomics.notify(control, SAB_COUNT);
    }
    drop() {
      this.close();
    }
  }
  class SABSenderI32 extends SABSenderBase {
  }
  class SABReceiverI32 extends SABReceiverBase {
  }
  class SABSenderU32 extends SABSenderBase {
  }
  class SABReceiverU32 extends SABReceiverBase {
  }
  class SABSenderF32 extends SABSenderBase {
  }
  class SABReceiverF32 extends SABReceiverBase {
  }
  class SABSenderF64 extends SABSenderBase {
  }
  class SABReceiverF64 extends SABReceiverBase {
  }
  const sab_channel2 = {
    is_available: () => AtomicI32.is_available() || channel2().is_available(),
    bounded_i32: (capacity) => {
      const state2 = createSABChannelState(capacity, "i32");
      return { sender: new SABSenderI32(state2), receiver: new SABReceiverI32(state2) };
    },
    bounded_u32: (capacity) => {
      const state2 = createSABChannelState(capacity, "u32");
      return { sender: new SABSenderU32(state2), receiver: new SABReceiverU32(state2) };
    },
    bounded_f32: (capacity) => {
      const state2 = createSABChannelState(capacity, "f32");
      return { sender: new SABSenderF32(state2), receiver: new SABReceiverF32(state2) };
    },
    bounded_f64: (capacity) => {
      const state2 = createSABChannelState(capacity, "f64");
      return { sender: new SABSenderF64(state2), receiver: new SABReceiverF64(state2) };
    },
    send_i32: (sender, value) => sender.try_send(value),
    try_send_i32: (sender, value) => sender.try_send(value),
    send_async_i32: (sender, value) => sender.send(value),
    send_timeout_i32: (sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs),
    recv_i32: (receiver) => receiver.recv(),
    try_recv_i32: (receiver) => receiver.try_recv(),
    close_sender_i32: (sender) => sender.close(),
    close_receiver_i32: (receiver) => receiver.close(),
    is_sender_closed_i32: (sender) => sender.is_closed(),
    is_receiver_closed_i32: (receiver) => receiver.is_closed(),
    close_i32: (ch) => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_u32: (sender, value) => sender.try_send(value),
    try_send_u32: (sender, value) => sender.try_send(value),
    send_async_u32: (sender, value) => sender.send(value),
    send_timeout_u32: (sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs),
    recv_u32: (receiver) => receiver.recv(),
    try_recv_u32: (receiver) => receiver.try_recv(),
    close_sender_u32: (sender) => sender.close(),
    close_receiver_u32: (receiver) => receiver.close(),
    is_sender_closed_u32: (sender) => sender.is_closed(),
    is_receiver_closed_u32: (receiver) => receiver.is_closed(),
    close_u32: (ch) => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_f32: (sender, value) => sender.try_send(value),
    try_send_f32: (sender, value) => sender.try_send(value),
    send_async_f32: (sender, value) => sender.send(value),
    send_timeout_f32: (sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs),
    recv_f32: (receiver) => receiver.recv(),
    try_recv_f32: (receiver) => receiver.try_recv(),
    close_sender_f32: (sender) => sender.close(),
    close_receiver_f32: (receiver) => receiver.close(),
    is_sender_closed_f32: (sender) => sender.is_closed(),
    is_receiver_closed_f32: (receiver) => receiver.is_closed(),
    close_f32: (ch) => {
      ch.sender.close();
      ch.receiver.close();
    },
    send_f64: (sender, value) => sender.try_send(value),
    try_send_f64: (sender, value) => sender.try_send(value),
    send_async_f64: (sender, value) => sender.send(value),
    send_timeout_f64: (sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs),
    recv_f64: (receiver) => receiver.recv(),
    try_recv_f64: (receiver) => receiver.try_recv(),
    close_sender_f64: (sender) => sender.close(),
    close_receiver_f64: (receiver) => receiver.close(),
    is_sender_closed_f64: (sender) => sender.is_closed(),
    is_receiver_closed_f64: (receiver) => receiver.is_closed(),
    close_f64: (ch) => {
      ch.sender.close();
      ch.receiver.close();
    }
  };
  const thread2 = {
    is_available: () => isNodeRuntime() || typeof Worker === "function",
    spawn: (task) => {
      if (typeof task === "function") {
        return new ThreadHandle(() => task(), result());
      }
      return thread2.spawn_worker(task);
    },
    spawn_worker: async (specifier) => {
      if (typeof specifier !== "string" || specifier.length === 0) {
        return result().Err("Thread specifier must be a non-empty string");
      }
      try {
        const worker = await createThreadWorker(specifier);
        return result().Ok(new Thread(worker, option()));
      } catch (error) {
        return result().Err(String(error));
      }
    },
    post: (handle, value) => handle.post(value),
    recv: (handle) => handle.recv(),
    try_recv: (handle) => handle.try_recv(),
    terminate: async (handle) => {
      await handle.terminate();
    },
    join: (handle) => {
      if (handle instanceof ThreadHandle) return handle.join();
      if (handle instanceof Thread) return handle.join();
      throw new Error("Invalid thread handle");
    },
    join_worker: (handle) => handle.join()
  };
  const web_worker2 = {
    is_available: () => isNodeRuntime() || typeof Worker === "function",
    spawn: async (specifier) => {
      const input = String(specifier ?? "").trim();
      if (!input) return result().Err("Worker specifier must be a non-empty string");
      try {
        const worker = await createThreadWorker(input);
        return result().Ok(registerWebWorker(worker));
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    spawn_inline: async (source) => {
      const input = String(source ?? "");
      if (!input.trim()) return result().Err("Inline worker source must be a non-empty string");
      try {
        const worker = await createInlineWorker(input);
        return result().Ok(registerWebWorker(worker.worker, worker.inlineUrl));
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    post: (handle, msg) => {
      const record = getWebWorkerRecord(handle);
      if (!record) return result().Err(`Unknown worker handle ${handle}`);
      try {
        record.entry.worker.postMessage(String(msg));
        return result().Ok(void 0);
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    on_message: (handle, handler) => {
      const record = getWebWorkerRecord(handle);
      if (!record || typeof handler !== "function") return;
      if (record.entry.kind === "node") {
        record.entry.worker.on("message", (value) => {
          handler(toWorkerMessageString(value));
        });
        return;
      }
      record.entry.worker.addEventListener("message", (event) => {
        handler(toWorkerMessageString(event.data));
      });
    },
    on_error: (handle, handler) => {
      const record = getWebWorkerRecord(handle);
      if (!record || typeof handler !== "function") return;
      if (record.entry.kind === "node") {
        record.entry.worker.on("error", (error) => {
          handler(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      record.entry.worker.addEventListener("error", (event) => {
        const error = event.error;
        const message = error instanceof Error ? error.message : event.message || String(error ?? "");
        handler(message);
      });
    },
    terminate: (handle) => {
      const record = getWebWorkerRecord(handle);
      if (!record) return;
      try {
        if (record.entry.kind === "node") {
          void record.entry.worker.terminate();
        } else {
          record.entry.worker.terminate();
        }
      } finally {
        cleanupWebWorkerRecord(record);
      }
    },
    is_worker_context: () => isWorkerContextBrowser() || isWorkerContextNode(),
    self_post: (msg) => {
      if (isWorkerContextBrowser() && typeof postMessage === "function") {
        postMessage(String(msg));
        return;
      }
      if (isWorkerContextNode()) {
        const workerThreads = getNodeBuiltinModule("node:worker_threads");
        if (typeof workerThreads?.parentPort?.postMessage === "function") {
          workerThreads.parentPort.postMessage(String(msg));
        }
      }
    },
    self_on_message: (handler) => {
      if (typeof handler !== "function") return;
      if (isWorkerContextBrowser() && typeof addEventListener === "function") {
        addEventListener("message", (event) => {
          handler(toWorkerMessageString(event.data));
        });
        return;
      }
      if (isWorkerContextNode()) {
        const workerThreads = getNodeBuiltinModule("node:worker_threads");
        if (typeof workerThreads?.parentPort?.on === "function") {
          workerThreads.parentPort.on("message", (value) => {
            handler(toWorkerMessageString(value));
          });
        }
      }
    }
  };
  const web_streams2 = {
    is_available: () => typeof ReadableStream === "function" || typeof fetch === "function" || isNodeRuntime(),
    from_fetch: async (url2) => {
      if (typeof fetch !== "function") return result().Err("Fetch API is not available in this environment");
      try {
        const response = await fetch(String(url2));
        const body = response.body;
        if (body && typeof body.getReader === "function") {
          const reader = body.getReader();
          return result().Ok(registerRuntimeStream({ kind: "reader", reader, done: false }));
        }
        if (typeof response.arrayBuffer === "function") {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return result().Ok(registerRuntimeStream({ kind: "buffer", data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE }));
        }
        return result().Err("Response body stream is not available");
      } catch (error) {
        return result().Err(formatError(error));
      }
    },
    from_string: (source) => {
      const bytes = typeof TextEncoder === "function" ? new TextEncoder().encode(String(source)) : Uint8Array.from(String(source).split("").map((ch) => ch.charCodeAt(0) & 255));
      return registerRuntimeStream({ kind: "buffer", data: bytes, offset: 0, chunkSize: STREAM_DEFAULT_CHUNK_SIZE });
    },
    from_bytes: (data) => registerRuntimeStream({
      kind: "buffer",
      data: toByteArray(data),
      offset: 0,
      chunkSize: STREAM_DEFAULT_CHUNK_SIZE
    }),
    read_chunk: async (streamHandle) => {
      const next = await readChunkFromRuntimeStream(streamHandle);
      if (!next.ok) return result().Err(next.error);
      if (next.chunk == null) return result().Ok(option().None);
      return result().Ok(option().Some(next.chunk));
    },
    read_all: async (streamHandle) => {
      const all = [];
      for (; ; ) {
        const next = await readChunkFromRuntimeStream(streamHandle);
        if (!next.ok) {
          cleanupRuntimeStreamHandle(streamHandle);
          return result().Err(next.error);
        }
        if (next.chunk == null) {
          cleanupRuntimeStreamHandle(streamHandle);
          return result().Ok(all);
        }
        all.push(...next.chunk);
      }
    },
    read_text: async (streamHandle) => {
      const all = await web_streams2.read_all(streamHandle);
      if (!deps.isEnumLike(all) || deps.getEnumTag(all) !== "Ok") return all;
      return result().Ok(decodeTextFromBytes(deps.getEnumPayload(all)));
    },
    pipe: (sourceHandle, transform) => registerRuntimeStream({ kind: "pipe", sourceHandle: Math.trunc(sourceHandle), transform }),
    cancel: (streamHandle) => {
      cleanupRuntimeStreamHandle(streamHandle);
    }
  };
  return {
    Thread,
    ThreadHandle,
    sync: sync2,
    sab_channel: sab_channel2,
    thread: thread2,
    web_worker: web_worker2,
    web_streams: web_streams2
  };
};

// src/runtime/dom-accessibility.ts
var elementRecord = (element) => element;
var readChildNodes = (node) => Array.from(node?.childNodes ?? []);
var getDomAttribute = (element, name) => {
  if (typeof element.getAttribute === "function") {
    const value2 = element.getAttribute(name);
    return value2 == null ? null : String(value2);
  }
  const attributes = element.attributes;
  if (attributes && typeof attributes.get === "function") {
    const value2 = attributes.get(name);
    return value2 == null ? null : String(value2);
  }
  const value = elementRecord(element)[name];
  return value == null ? null : String(value);
};
var findDomElementById = (root, id) => {
  if (!root) return null;
  for (const child of readChildNodes(root)) {
    const element = child;
    if (getDomAttribute(element, "id") === id) {
      return element;
    }
    const nested = findDomElementById(child, id);
    if (nested) return nested;
  }
  return null;
};
var isElementHidden = (element) => elementRecord(element).hidden === true || getDomAttribute(element, "hidden") !== null;
var isElementDisabled = (element) => elementRecord(element).disabled === true || getDomAttribute(element, "disabled") !== null;
var isElementInert = (element) => {
  let current = element;
  while (current) {
    const candidate = current;
    if (elementRecord(candidate).inert === true || getDomAttribute(candidate, "inert") !== null) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
};
var getElementTabIndex = (element) => {
  const raw = elementRecord(element).tabIndex ?? getDomAttribute(element, "tabIndex") ?? getDomAttribute(element, "tabindex");
  if (raw === null || raw === void 0 || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
var isFocusableElement = (element) => {
  if (isElementHidden(element) || isElementDisabled(element) || isElementInert(element)) return false;
  const tabIndex = getElementTabIndex(element);
  if (tabIndex !== null) {
    return tabIndex >= 0;
  }
  const tag = String(element.tagName ?? "").toLowerCase();
  if (tag === "a") {
    return getDomAttribute(element, "href") !== null;
  }
  return tag === "button" || tag === "input" || tag === "select" || tag === "textarea";
};
var collectFocusableDescendants = (root) => {
  const focusable = [];
  const visit = (node) => {
    for (const child of readChildNodes(node)) {
      const element = child;
      if (isElementInert(element)) {
        continue;
      }
      if (typeof element.focus === "function" && isFocusableElement(element)) {
        focusable.push(element);
      }
      if (readChildNodes(child).length > 0) {
        visit(child);
      }
    }
  };
  visit(root);
  return focusable;
};
var findFirstFocusableDescendant = (root) => collectFocusableDescendants(root)[0] ?? null;
var getFocusTargetFromEvent = (event) => {
  if (!event || typeof event !== "object") return null;
  const target = event.currentTarget ?? event.target;
  return target && typeof target === "object" ? target : null;
};
var trapDialogTabNavigation = (event) => {
  if (String(event?.key ?? "") !== "Tab") return false;
  const container = getFocusTargetFromEvent(event);
  if (!container) return false;
  const focusable = collectFocusableDescendants(container);
  if (focusable.length === 0) {
    event?.preventDefault?.();
    container.focus?.();
    return true;
  }
  const active = container.ownerDocument?.activeElement ?? null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isShift = Boolean(event?.shiftKey);
  if (isShift) {
    if (active === container || active === first || !focusable.includes(active)) {
      event?.preventDefault?.();
      last.focus?.();
      return true;
    }
    return false;
  }
  if (active === container || active === last || !focusable.includes(active)) {
    event?.preventDefault?.();
    first.focus?.();
    return true;
  }
  return false;
};

// src/runtime/dom-reconciler.ts
var setChildren = (container, children2) => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children2) {
    container.appendChild(child);
  }
};
var findStableSequenceWindow = (currentChildren, nextChildren, equals = (left, right) => left === right) => {
  let currentStart = 0;
  let nextStart = 0;
  while (currentStart < currentChildren.length && nextStart < nextChildren.length && equals(currentChildren[currentStart], nextChildren[nextStart])) {
    currentStart += 1;
    nextStart += 1;
  }
  let currentEnd = currentChildren.length - 1;
  let nextEnd = nextChildren.length - 1;
  while (currentEnd >= currentStart && nextEnd >= nextStart && equals(currentChildren[currentEnd], nextChildren[nextEnd])) {
    currentEnd -= 1;
    nextEnd -= 1;
  }
  if (currentStart > currentEnd && nextStart > nextEnd) {
    return null;
  }
  return { currentStart, currentEnd, nextStart, nextEnd };
};
var getTransitionAffectedRange = (transition, length) => {
  switch (transition.kind) {
    case "same_order":
      return null;
    case "adjacent_swap":
      return { start: transition.left, end: transition.right };
    case "single_move":
      return {
        start: Math.min(transition.from, transition.to),
        end: Math.max(transition.from, transition.to)
      };
    case "complex_reorder":
      if (typeof transition.start === "number" && typeof transition.end === "number") {
        return { start: transition.start, end: transition.end };
      }
      return length > 0 ? { start: 0, end: length - 1 } : null;
  }
};
var findSingleMove = (previous, next, equals, first, last) => {
  if (previous.length !== next.length || previous.length < 2 || last <= first) {
    return null;
  }
  for (let from = first + 1; from <= last; from += 1) {
    if (!equals(previous[from], next[first])) continue;
    let matches = true;
    for (let index = first; index < from; index += 1) {
      if (!equals(previous[index], next[index + 1])) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    for (let index = from + 1; index <= last; index += 1) {
      if (!equals(previous[index], next[index])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { from, to: first };
    }
  }
  for (let to = first + 1; to <= last; to += 1) {
    if (!equals(previous[first], next[to])) continue;
    let matches = true;
    for (let index = first + 1; index <= to; index += 1) {
      if (!equals(previous[index], next[index - 1])) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    for (let index = to + 1; index <= last; index += 1) {
      if (!equals(previous[index], next[index])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { from: first, to };
    }
  }
  return null;
};
var analyzeSequenceTransition = (previous, next, equals) => {
  if (previous.length !== next.length) {
    return { kind: "complex_reorder" };
  }
  let firstMismatch = -1;
  for (let index = 0; index < previous.length; index += 1) {
    if (!equals(previous[index], next[index])) {
      firstMismatch = index;
      break;
    }
  }
  if (firstMismatch < 0) {
    return { kind: "same_order" };
  }
  let lastMismatch = previous.length - 1;
  while (lastMismatch > firstMismatch && equals(previous[lastMismatch], next[lastMismatch])) {
    lastMismatch -= 1;
  }
  if (previous.length >= 2) {
    const left = firstMismatch;
    const right = left + 1;
    if (right <= lastMismatch && equals(previous[left], next[right]) && equals(previous[right], next[left])) {
      let restMatches = true;
      for (let index = right + 1; index <= lastMismatch; index += 1) {
        if (!equals(previous[index], next[index])) {
          restMatches = false;
          break;
        }
      }
      if (restMatches) {
        return { kind: "adjacent_swap", left, right };
      }
    }
  }
  const singleMove = findSingleMove(previous, next, equals, firstMismatch, lastMismatch);
  if (singleMove) {
    return { kind: "single_move", from: singleMove.from, to: singleMove.to };
  }
  return { kind: "complex_reorder", start: firstMismatch, end: lastMismatch };
};
var analyzeDomChildTransition = (currentChildren, nextChildren) => analyzeSequenceTransition(currentChildren, nextChildren, (left, right) => left === right);
var longestIncreasingSubsequenceIndices = (values) => {
  const predecessors = new Array(values.length).fill(-1);
  const tails = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (values[tails[mid]] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low > 0) {
      predecessors[index] = tails[low - 1];
    }
    if (low === tails.length) {
      tails.push(index);
    } else {
      tails[low] = index;
    }
  }
  if (tails.length === 0) return [];
  const result = new Array(tails.length);
  let cursor = tails[tails.length - 1];
  for (let index = tails.length - 1; index >= 0; index -= 1) {
    result[index] = cursor;
    cursor = predecessors[cursor];
  }
  return result;
};
var resolveComplexTransitionWindow = (transition, currentLength, nextLength) => {
  if (transition.kind !== "complex_reorder" || typeof transition.start !== "number" || typeof transition.end !== "number" || currentLength !== nextLength || transition.start < 0 || transition.end < transition.start || transition.end >= currentLength) {
    return null;
  }
  return {
    currentStart: transition.start,
    currentEnd: transition.end,
    nextStart: transition.start,
    nextEnd: transition.end
  };
};
var reorderChildren = (container, children2, disposeChild, options) => {
  if (typeof container.insertBefore !== "function") {
    setChildren(container, children2);
    return;
  }
  const structureChanged = options?.structureChanged ?? true;
  let currentChildren = options?.currentChildren ?? readChildNodes(container);
  if (structureChanged) {
    const desired = new Set(children2);
    currentChildren = currentChildren.filter((child) => {
      if (desired.has(child)) {
        return true;
      }
      disposeChild(child);
      container.removeChild(child);
      return false;
    });
  }
  const transition = options?.transition ?? analyzeDomChildTransition(currentChildren, children2);
  if (transition.kind === "same_order") {
    return;
  }
  if (transition.kind === "adjacent_swap") {
    container.insertBefore(children2[transition.left], children2[transition.right]);
    return;
  }
  if (transition.kind === "single_move") {
    const moving = currentChildren[transition.from];
    if (!moving) return;
    const reference = transition.from < transition.to ? currentChildren[transition.to + 1] ?? null : currentChildren[transition.to] ?? null;
    container.insertBefore(moving, reference);
    return;
  }
  const window2 = resolveComplexTransitionWindow(transition, currentChildren.length, children2.length) ?? findStableSequenceWindow(currentChildren, children2);
  if (!window2) {
    return;
  }
  const {
    currentStart,
    currentEnd,
    nextStart,
    nextEnd
  } = window2;
  const currentWindow = currentChildren.slice(currentStart, currentEnd + 1);
  const nextWindow = children2.slice(nextStart, nextEnd + 1);
  const currentOrder = /* @__PURE__ */ new Map();
  currentWindow.forEach((child, index) => {
    currentOrder.set(child, index);
  });
  const sequence = nextWindow.map((child) => currentOrder.get(child) ?? -1);
  const keepIndices = longestIncreasingSubsequenceIndices(sequence);
  const keepMarks = new Array(nextWindow.length).fill(false);
  for (const index of keepIndices) {
    keepMarks[index] = true;
  }
  let anchor = children2[nextEnd + 1] ?? null;
  for (let localIndex = nextWindow.length - 1; localIndex >= 0; localIndex -= 1) {
    const nextChild = nextWindow[localIndex];
    const currentIndex = sequence[localIndex];
    if (currentIndex >= 0 && keepMarks[localIndex]) {
      anchor = nextChild;
      continue;
    }
    container.insertBefore(nextChild, anchor);
    anchor = nextChild;
  }
};

// src/runtime/reactive-core.ts
var defaultHooks = {
  cloneValue: (value) => value,
  equalsValue: Object.is,
  scheduleMicrotask: (fn) => {
    Promise.resolve().then(fn);
  },
  registerSignal: () => 0,
  unregisterSignal: () => void 0,
  notifyDevtools: () => void 0
};
var reactiveHooks = defaultHooks;
var configureReactiveCore = (hooks) => {
  reactiveHooks = { ...reactiveHooks, ...hooks };
};
var activeComputation = null;
var pendingEffects = /* @__PURE__ */ new Set();
var effectFlushPending = false;
var batchDepth = 0;
var flushEffects = () => {
  if (pendingEffects.size === 0) return;
  const toRun = Array.from(pendingEffects);
  pendingEffects.clear();
  for (const computation of toRun) {
    computation.run();
  }
  if (pendingEffects.size > 0 && batchDepth === 0) {
    scheduleEffectsFlush();
  }
};
var scheduleEffectsFlush = () => {
  if (batchDepth > 0 || effectFlushPending) return;
  effectFlushPending = true;
  reactiveHooks.scheduleMicrotask(() => {
    effectFlushPending = false;
    flushEffects();
  });
};
var trackReactiveSource = (source) => {
  if (!activeComputation) return;
  if (activeComputation.isDisposed()) return;
  if (source.observers.has(activeComputation)) return;
  source.observers.add(activeComputation);
  activeComputation.dependencies.add(source);
};
var clearComputationDependencies = (computation) => {
  for (const dep of computation.dependencies) {
    dep.observers.delete(computation);
  }
  computation.dependencies.clear();
};
var ReactiveComputation = class {
  constructor(runner, kind, onInvalidate) {
    this.runner = runner;
    this.kind = kind;
    this.onInvalidate = onInvalidate;
    this.dependencies = /* @__PURE__ */ new Set();
    this.cleanups = [];
    this.disposed = false;
    this.running = false;
  }
  isDisposed() {
    return this.disposed;
  }
  runCleanups() {
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
      }
    }
  }
  run() {
    if (this.disposed || this.running) return;
    this.running = true;
    this.runCleanups();
    clearComputationDependencies(this);
    const previous = activeComputation;
    activeComputation = this;
    try {
      this.runner((cleanup) => {
        if (!this.disposed) this.cleanups.push(cleanup);
      });
    } finally {
      activeComputation = previous;
      this.running = false;
    }
  }
  invalidate() {
    if (this.disposed) return;
    if (this.onInvalidate) {
      this.onInvalidate();
      return;
    }
    if (this.kind === "effect") {
      pendingEffects.add(this);
      scheduleEffectsFlush();
      return;
    }
    this.run();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    pendingEffects.delete(this);
    this.runCleanups();
    clearComputationDependencies(this);
  }
};
var notifyReactiveObservers = (source) => {
  const observers = Array.from(source.observers);
  for (const observer of observers) {
    observer.invalidate();
  }
};
var Signal = class {
  constructor(initial) {
    this.observers = /* @__PURE__ */ new Set();
    this.__luminaDevtoolsId = reactiveHooks.registerSignal?.("signal", this) ?? 0;
    this.value = reactiveHooks.cloneValue(initial);
  }
  get() {
    trackReactiveSource(this);
    return reactiveHooks.cloneValue(this.value);
  }
  peek() {
    return reactiveHooks.cloneValue(this.value);
  }
  set(next) {
    const cloned = reactiveHooks.cloneValue(next);
    const currentIsAggregate = this.value !== null && typeof this.value === "object";
    const nextIsAggregate = cloned !== null && typeof cloned === "object";
    if (currentIsAggregate || nextIsAggregate) {
      if (Object.is(this.value, cloned)) return false;
    } else if (reactiveHooks.equalsValue(this.value, cloned)) {
      return false;
    }
    this.value = cloned;
    notifyReactiveObservers(this);
    reactiveHooks.notifyDevtools?.();
    return true;
  }
  update(updater) {
    const next = updater(this.get());
    this.set(next);
    return this.get();
  }
};
var Memo = class {
  constructor(compute) {
    this.observers = /* @__PURE__ */ new Set();
    this.ready = false;
    this.stale = true;
    this.__luminaDevtoolsId = reactiveHooks.registerSignal?.("memo", this) ?? 0;
    this.compute = compute;
    this.computation = new ReactiveComputation(
      () => {
        const next = reactiveHooks.cloneValue(this.compute());
        const changed = !this.ready || !reactiveHooks.equalsValue(this.value, next);
        this.value = next;
        this.ready = true;
        this.stale = false;
        reactiveHooks.notifyDevtools?.();
        if (changed) {
          notifyReactiveObservers(this);
        }
      },
      "memo",
      () => {
        this.stale = true;
        notifyReactiveObservers(this);
        reactiveHooks.notifyDevtools?.();
      }
    );
  }
  ensureFresh() {
    if (!this.ready || this.stale) {
      this.computation.run();
    }
  }
  get() {
    this.ensureFresh();
    trackReactiveSource(this);
    return reactiveHooks.cloneValue(this.value);
  }
  peek() {
    this.ensureFresh();
    return reactiveHooks.cloneValue(this.value);
  }
  dispose() {
    this.computation.dispose();
    this.observers.clear();
    if (this.__luminaDevtoolsId !== 0) {
      reactiveHooks.unregisterSignal?.(this.__luminaDevtoolsId);
    }
    reactiveHooks.notifyDevtools?.();
  }
};
var Effect = class {
  constructor(effectFn) {
    this.computation = new ReactiveComputation((onCleanup) => {
      const cleanup = effectFn(onCleanup);
      if (typeof cleanup === "function") onCleanup(cleanup);
    }, "effect");
    this.computation.run();
  }
  dispose() {
    this.computation.dispose();
  }
};
var batch = (fn) => {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth = Math.max(0, batchDepth - 1);
    if (batchDepth === 0) {
      flushEffects();
    }
  }
};
var untrack = (fn) => {
  const previous = activeComputation;
  activeComputation = null;
  try {
    return fn();
  } finally {
    activeComputation = previous;
  }
};
var createStaticSignal = (value) => {
  let current = reactiveHooks.cloneValue(value);
  return {
    observers: /* @__PURE__ */ new Set(),
    __luminaDevtoolsId: 0,
    get: () => reactiveHooks.cloneValue(current),
    peek: () => reactiveHooks.cloneValue(current),
    set: (next) => {
      current = reactiveHooks.cloneValue(next);
      return true;
    },
    update: (updater) => {
      current = reactiveHooks.cloneValue(updater(reactiveHooks.cloneValue(current)));
      return reactiveHooks.cloneValue(current);
    }
  };
};
var readSignalRaw = (signal, tracked) => {
  if (tracked) {
    trackReactiveSource(signal);
  }
  return signal.value;
};

// src/runtime/ssr-renderer.ts
var LUMINA_HYDRATION_KEY_ATTR = "data-lumina-key";
var htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char);
var kebabCase = (value) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^ms-/, "-ms-");
var normalizeHtmlPropName = (name) => {
  if (name === "className") return "class";
  if (name === "htmlFor") return "for";
  return name;
};
var isSafeHtmlAttrName = (name) => /^[A-Za-z_:-][A-Za-z0-9_.:-]*$/.test(name) && !/^on/i.test(name);
var serializeStyleValue = (value) => Object.entries(value).filter(([, entry]) => entry !== null && entry !== void 0).map(([key2, entry]) => `${kebabCase(key2)}:${String(entry)}`).join(";");
var serializePropsToHtml = (props, hydrationKey) => {
  const propSource = props ?? {};
  const attrs = [];
  const keyForHydration = typeof hydrationKey === "string" || typeof hydrationKey === "number" ? hydrationKey : typeof propSource.key === "string" || typeof propSource.key === "number" ? propSource.key : void 0;
  for (const [key2, value] of Object.entries(propSource)) {
    if (key2 === "key") continue;
    if (/^on/i.test(key2)) continue;
    if (value === false || value === null || value === void 0) continue;
    const attrName = normalizeHtmlPropName(key2);
    if (!isSafeHtmlAttrName(attrName)) continue;
    if (key2 === "style" && typeof value === "object" && value !== null) {
      const styleText = serializeStyleValue(value);
      if (styleText.length > 0) attrs.push(`style="${escapeHtml(styleText)}"`);
      continue;
    }
    if (value === true) {
      attrs.push(attrName);
      continue;
    }
    attrs.push(`${attrName}="${escapeHtml(String(value))}"`);
  }
  if (keyForHydration !== void 0 && !Object.prototype.hasOwnProperty.call(propSource, LUMINA_HYDRATION_KEY_ATTR)) {
    attrs.push(`${LUMINA_HYDRATION_KEY_ATTR}="${escapeHtml(String(keyForHydration))}"`);
  }
  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
};
var voidHtmlTags = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);
var setContainerMarkup = (container, output) => {
  if (container && typeof container === "object") {
    const target = container;
    if (typeof target.write === "function") {
      target.write(output);
      return;
    }
    if (typeof target.innerHTML === "string" || "innerHTML" in target) {
      target.innerHTML = output;
      return;
    }
    if (typeof target.html === "string" || "html" in target) {
      target.html = output;
      return;
    }
    if (typeof target.textContent === "string" || "textContent" in target) {
      target.textContent = output;
      return;
    }
    target.html = output;
  }
};
var createSsrRuntime = (deps) => {
  const vnodeToChunks = function* (node) {
    const normalized = deps.normalizeNodeForHtml(node);
    const kind = deps.getKind(normalized);
    if (kind === "text") {
      yield escapeHtml(deps.getText(normalized) ?? "");
      return;
    }
    if (kind === "live_text") {
      yield escapeHtml(String(deps.getSignalValue(normalized) ?? ""));
      return;
    }
    if (kind === "fragment") {
      for (const child of deps.getChildren(normalized)) yield* vnodeToChunks(child);
      return;
    }
    if (kind === "portal") {
      const target = deps.getTarget?.(normalized);
      const targetAttr = target ? ` data-lumina-portal-target="${escapeHtml(target)}"` : "";
      yield `<lumina-portal-anchor hidden data-lumina-portal-anchor="true"${targetAttr}></lumina-portal-anchor>`;
      return;
    }
    const tag = deps.getTag(normalized) ?? "div";
    const attrs = serializePropsToHtml(deps.getProps(normalized), deps.getKey?.(normalized));
    yield `<${tag}${attrs}>`;
    if (voidHtmlTags.has(tag.toLowerCase())) return;
    for (const child of deps.getChildren(normalized)) yield* vnodeToChunks(child);
    yield `</${tag}>`;
  };
  const vnodeToHtml = (node) => {
    return Array.from(vnodeToChunks(node)).join("");
  };
  return {
    renderToString: (node, _options) => vnodeToHtml(node),
    renderToChunks: (node, _options) => vnodeToChunks(node),
    renderToReadableStream: (node, _options) => {
      if (typeof ReadableStream !== "function") return null;
      return new ReadableStream({
        start(controller) {
          for (const chunk of vnodeToChunks(node)) controller.enqueue(chunk);
          controller.close();
        }
      });
    },
    createRenderer: () => {
      let current = "";
      return {
        mount(node, container) {
          current = vnodeToHtml(node);
          setContainerMarkup(container, current);
        },
        patch(_prev, next, container) {
          current = vnodeToHtml(next);
          setContainerMarkup(container, current);
        },
        hydrate(node, container) {
          current = vnodeToHtml(node);
          setContainerMarkup(container, current);
        },
        unmount(container) {
          current = "";
          setContainerMarkup(container, "");
        }
      };
    }
  };
};

// src/runtime/vnode-core.ts
var normalizeVNodeChildren = (input) => {
  if (Array.isArray(input)) {
    const out = [];
    for (const child of input) {
      out.push(...normalizeVNodeChildren(child));
    }
    return out;
  }
  if (input && typeof input === "object" && !isVNode(input)) {
    const iterator = input[Symbol.iterator];
    if (typeof iterator === "function") {
      const out = [];
      for (const child of input) {
        out.push(...normalizeVNodeChildren(child));
      }
      return out;
    }
  }
  if (input === null || input === void 0 || input === false) return [];
  if (typeof input === "object" && input !== null && isVNode(input)) {
    return [input];
  }
  return [vnodeText(input)];
};
var sanitizeProps = (props) => {
  if (!props) return {};
  const out = {};
  for (const [key2, value] of Object.entries(props)) {
    if (value !== void 0) out[key2] = value;
  }
  return out;
};
var isVNode = (value) => {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return candidate.kind === "text" || candidate.kind === "live_text" || candidate.kind === "index_list" || candidate.kind === "for_list" || candidate.kind === "element" || candidate.kind === "fragment" || candidate.kind === "portal";
};
var vnodeText = (value) => ({
  kind: "text",
  text: value == null ? "" : String(value)
});
var vnodeLiveText = (signal) => ({
  kind: "live_text",
  signal
});
var readIndexListValues = (signal, tracked) => {
  const value = readSignalRaw(signal, tracked);
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iterator = value[Symbol.iterator];
    if (typeof iterator === "function") {
      return Array.from(value);
    }
  }
  return [];
};
var indexListHostProps = {
  style: { display: "contents" },
  "data-lumina-index-list": "true"
};
var forListHostProps = {
  style: { display: "contents" },
  "data-lumina-for-list": "true"
};
var coerceListKey = (value, index) => {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new Error(`List key at index ${index} must be a string or number`);
};
var coerceVNodeKey = (value, label = "VNode key") => {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new Error(`${label} must be a string or number`);
};
var getPropsKey = (props) => {
  if (!props || !Object.prototype.hasOwnProperty.call(props, "key") || props.key === void 0) {
    return void 0;
  }
  return coerceVNodeKey(props.key);
};
var vnodeIndexList = (itemsSignal, renderItem) => ({
  kind: "index_list",
  itemsSignal,
  listRender: renderItem
});
var vnodeForList = (itemsSignal, keyOf, renderItem) => ({
  kind: "for_list",
  itemsSignal,
  listKey: keyOf,
  listIndexedRender: renderItem
});
var vnodeElement = (tag, props, children2 = []) => ({
  kind: "element",
  tag,
  key: getPropsKey(props),
  props: sanitizeProps(props),
  children: normalizeVNodeChildren(children2)
});
var vnodeFragment = (children2 = []) => ({
  kind: "fragment",
  children: normalizeVNodeChildren(children2)
});
var vnodePortal = (target, children2 = []) => ({
  kind: "portal",
  target: target == null ? null : String(target),
  children: normalizeVNodeChildren(children2)
});
var asVNodeChildren = (node) => node.children ?? [];
var coerceRenderableToVNode = (input) => {
  const children2 = normalizeVNodeChildren(input);
  if (children2.length === 1) {
    return children2[0];
  }
  return vnodeFragment(children2);
};
var applyVNodeKey = (node, key2) => {
  if (key2 === void 0 || key2 === null) {
    return node;
  }
  const nextKey = coerceVNodeKey(key2);
  if (node.key !== void 0) {
    if (node.key !== nextKey) {
      throw new Error(
        `Conflicting keyed child: child already has key '${String(node.key)}' but parent assigned '${String(nextKey)}'`
      );
    }
    return node;
  }
  return { ...node, key: nextKey };
};
var materializeIndexListChildren = (node, tracked) => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== "function") {
    return [];
  }
  return readIndexListValues(source, tracked).map(
    (value, index) => coerceRenderableToVNode(renderItem(createStaticSignal(value), index))
  );
};
var materializeForListChildren = (node, tracked) => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== "function" || typeof renderItem !== "function") {
    return [];
  }
  const seenKeys = /* @__PURE__ */ new Set();
  return readIndexListValues(source, tracked).map((value, index) => {
    const key2 = coerceListKey(keyOf(value, index), index);
    if (seenKeys.has(key2)) {
      throw new Error(`Duplicate keyed child '${String(key2)}' in the same parent is not supported`);
    }
    seenKeys.add(key2);
    const vnode2 = coerceRenderableToVNode(renderItem(createStaticSignal(value), createStaticSignal(index)));
    return applyVNodeKey(vnode2, key2);
  });
};
var snapshotVNode = (node) => {
  if (node.kind === "live_text") {
    return vnodeText(node.signal ? node.signal.get() : "");
  }
  if (node.kind === "index_list") {
    return vnodeElement("lumina-index-list", indexListHostProps, materializeIndexListChildren(node, false));
  }
  if (node.kind === "for_list") {
    return vnodeElement("lumina-for-list", forListHostProps, materializeForListChildren(node, false));
  }
  if (node.kind === "element" || node.kind === "fragment" || node.kind === "portal") {
    return {
      ...node,
      children: asVNodeChildren(node).map((child) => snapshotVNode(child))
    };
  }
  return node;
};
var resolveChildrenInput = (input) => typeof input === "function" ? input() : input;
var vnodeKeyed = (key2, input) => applyVNodeKey(coerceRenderableToVNode(resolveChildrenInput(input)), key2);
var serializeVNode = (node) => JSON.stringify(snapshotVNode(node));
var parseVNode = (json2) => {
  const parsed = JSON.parse(json2);
  if (!isVNode(parsed)) throw new Error("Invalid VNode payload");
  return parsed;
};

// src/runtime/dom-renderer.ts
var domTemplateCache = /* @__PURE__ */ new WeakMap();
var dialogModalInertTargets = /* @__PURE__ */ new WeakMap();
var inertCounts = /* @__PURE__ */ new WeakMap();
var inertStates = /* @__PURE__ */ new WeakMap();
var getDomDocument = (options) => {
  if (options?.document) return options.document;
  const doc = globalThis.document;
  if (!doc) {
    throw new Error("DOM renderer requires a document-like object");
  }
  return doc;
};
var asDomChildren = (node) => node.children ?? [];
var serializeFingerprintProps = (props) => {
  if (!props) {
    return "";
  }
  let out = "";
  for (const key2 in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key2) || key2 === "key") {
      continue;
    }
    const value = props[key2];
    if (value !== null && value !== void 0 && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return null;
    }
    out += `|${key2}:${String(value ?? "")}`;
  }
  return out;
};
var getStablePatchFingerprint = (node) => {
  const fingerprinted = node;
  if (fingerprinted.__luminaPatchFingerprint !== void 0) {
    return fingerprinted.__luminaPatchFingerprint;
  }
  let fingerprint = null;
  if (node.kind === "text") {
    fingerprint = `t:${node.text ?? ""}`;
  } else if (node.kind === "element" || node.kind === "fragment") {
    const children2 = asDomChildren(node);
    if (children2.length <= 6) {
      const propsFingerprint = node.kind === "element" ? serializeFingerprintProps(node.props) : "";
      if (propsFingerprint !== null) {
        const head = node.kind === "element" ? `e:${node.tag ?? ""}:${String(node.key ?? "")}${propsFingerprint}` : `f:${String(node.key ?? "")}`;
        let composed = head;
        for (const child of children2) {
          const childFingerprint = getStablePatchFingerprint(child);
          if (childFingerprint === null) {
            composed = "";
            break;
          }
          composed += `[${childFingerprint}]`;
        }
        fingerprint = composed === "" ? null : composed;
      }
    }
  }
  fingerprinted.__luminaPatchFingerprint = fingerprint;
  return fingerprint;
};
var isEventProp = (name) => /^on[A-Z]/.test(name);
var isForcedAttributeProp = (name) => name === "role" || name.startsWith("aria-") || name.startsWith("data-");
var isHiddenPropValue = (value) => value === true || value === "true";
var isPortalHostElement = (node) => node != null && String(node.tagName ?? "").toLowerCase() === "lumina-portal-host";
var isDialogOverlayElement = (node) => node != null && getDomAttribute(node, "data-lumina-dialog-overlay") === "true";
var isModalDialogElement = (element) => getDomAttribute(element, "role") === "dialog" && getDomAttribute(element, "aria-modal") === "true";
var containsDomNode = (root, target) => {
  if (!target) return false;
  if (root === target) return true;
  for (const child of readChildNodes(root)) {
    if (containsDomNode(child, target)) {
      return true;
    }
  }
  return false;
};
var findMarkedDialogInitialFocus = (root) => {
  for (const child of readChildNodes(root)) {
    const element = child;
    if (getDomAttribute(element, "data-lumina-dialog-initial-focus") === "true") {
      return element;
    }
    const nested = findMarkedDialogInitialFocus(child);
    if (nested) {
      return nested;
    }
  }
  return null;
};
var focusInitialDialogTarget = (element) => {
  const activeElement = element.ownerDocument?.activeElement;
  if (activeElement && activeElement !== element && containsDomNode(element, activeElement)) {
    return;
  }
  const marked = findMarkedDialogInitialFocus(element);
  if (marked?.focus) {
    marked.focus();
    return;
  }
  const firstFocusable = findFirstFocusableDescendant(element);
  if (firstFocusable?.focus) {
    firstFocusable.focus();
    return;
  }
  element.focus?.();
};
var setElementInert = (element, active) => {
  const record = element;
  if (active) {
    const count2 = inertCounts.get(element) ?? 0;
    inertCounts.set(element, count2 + 1);
    if (count2 > 0) {
      return;
    }
    inertStates.set(element, {
      hadAttribute: getDomAttribute(element, "inert") !== null,
      previousValue: record.inert
    });
    if (element.setAttribute) {
      element.setAttribute("inert", "");
    }
    record.inert = true;
    return;
  }
  const count = inertCounts.get(element) ?? 0;
  if (count <= 1) {
    inertCounts.delete(element);
    const previous = inertStates.get(element);
    inertStates.delete(element);
    if (previous?.hadAttribute) {
      if (element.setAttribute) {
        element.setAttribute("inert", "");
      }
    } else if (element.removeAttribute) {
      element.removeAttribute("inert");
    }
    record.inert = previous?.previousValue;
    return;
  }
  inertCounts.set(element, count - 1);
};
var collectModalInertTargets = (dialog) => {
  const parent = dialog.parentNode;
  if (!parent) return [];
  const scopeParent = isPortalHostElement(parent) && parent.parentNode ? parent.parentNode : parent;
  const exempt = /* @__PURE__ */ new Set();
  if (isPortalHostElement(parent)) {
    exempt.add(parent);
  } else {
    exempt.add(dialog);
  }
  const targets = [];
  for (const sibling of readChildNodes(scopeParent)) {
    const element = sibling;
    if (exempt.has(sibling) || isDialogOverlayElement(sibling)) {
      continue;
    }
    targets.push(element);
  }
  return targets;
};
var syncModalDialogInertState = (dialog, active) => {
  const previousTargets = dialogModalInertTargets.get(dialog) ?? [];
  if (!active) {
    for (const target of previousTargets) {
      setElementInert(target, false);
    }
    dialogModalInertTargets.delete(dialog);
    return;
  }
  if (previousTargets.length > 0) {
    return;
  }
  const targets = collectModalInertTargets(dialog);
  for (const target of targets) {
    setElementInert(target, true);
  }
  dialogModalInertTargets.set(dialog, targets);
};
var cloneStaticTemplateElement = (documentLike, html) => {
  let cache = domTemplateCache.get(documentLike);
  if (!cache) {
    cache = /* @__PURE__ */ new Map();
    domTemplateCache.set(documentLike, cache);
  }
  let template = cache.get(html);
  if (!template) {
    const candidate = documentLike.createElement("template");
    if (!candidate || typeof candidate !== "object") return null;
    if (!("innerHTML" in candidate) || !candidate.content || typeof candidate.content.cloneNode !== "function") {
      return null;
    }
    candidate.innerHTML = html;
    template = candidate;
    cache.set(html, template);
  }
  const clonedContent = template.content?.cloneNode?.(true);
  const rawChildNodes = clonedContent?.childNodes;
  const childNodes = rawChildNodes == null ? [] : Array.isArray(rawChildNodes) ? rawChildNodes : Array.from(rawChildNodes);
  if (childNodes.length !== 1) {
    return null;
  }
  const root = childNodes[0];
  return root && typeof root === "object" ? root : null;
};
var normalizeEventName = (name) => name.slice(2).toLowerCase();
var setDomStyle = (element, previous, next) => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  const style = element.style;
  if (!style) return;
  for (const [key2, value] of Object.entries(nxt)) {
    if (prev[key2] === value) continue;
    if (style.setProperty) {
      style.setProperty(key2, value == null ? "" : String(value));
    } else {
      style[key2] = value;
    }
  }
  for (const key2 of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key2)) continue;
    if (style.setProperty) {
      style.setProperty(key2, "");
    } else {
      delete style[key2];
    }
  }
};
var setDomStyleValue = (element, previous, next) => {
  if (typeof previous === "object" && previous !== null && typeof next !== "object") {
    setDomStyle(element, previous, void 0);
  }
  if (typeof next === "string") {
    if (element.setAttribute) element.setAttribute("style", next);
    if (element.style && "cssText" in element.style) {
      element.style.cssText = next;
    }
    return;
  }
  if (next && typeof next === "object") {
    if (typeof previous === "string" && element.removeAttribute) element.removeAttribute("style");
    setDomStyle(
      element,
      previous && typeof previous === "object" ? previous : void 0,
      next
    );
    return;
  }
  if (typeof previous === "string" && element.removeAttribute) element.removeAttribute("style");
  if (element.style && "cssText" in element.style) {
    element.style.cssText = "";
  }
};
var setDomProperty = (element, name, value, eventStore) => {
  if (name === "key") return;
  if (name === "autoFocus") {
    return;
  }
  if (isEventProp(name)) {
    const event = normalizeEventName(name);
    const map = eventStore.get(element) ?? {};
    const prev = map[event];
    if (prev && element.removeEventListener) {
      element.removeEventListener(event, prev);
    }
    if (typeof value === "function") {
      const next = value;
      if (element.addEventListener) {
        element.addEventListener(event, next);
      }
      map[event] = next;
      eventStore.set(element, map);
    } else {
      delete map[event];
      if (Object.keys(map).length === 0) {
        eventStore.delete(element);
      } else {
        eventStore.set(element, map);
      }
    }
    return;
  }
  if (name === "style") {
    setDomStyleValue(element, void 0, value);
    return;
  }
  if (value === false || value === null || value === void 0) {
    if (element.removeAttribute) element.removeAttribute(name);
    if (!isForcedAttributeProp(name)) {
      element[name] = value;
    }
    return;
  }
  if (isForcedAttributeProp(name) && element.setAttribute) {
    element.setAttribute(name, String(value));
  } else if (name in element) {
    element[name] = value;
  } else if (element.setAttribute) {
    element.setAttribute(name, String(value));
  } else {
    element[name] = value;
  }
};
var updateDomProperties = (element, previous, next, eventStore) => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  for (const key2 of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key2)) continue;
    if (key2 === "style") {
      setDomStyleValue(element, prev.style, void 0);
      continue;
    }
    setDomProperty(element, key2, void 0, eventStore);
  }
  for (const [key2, value] of Object.entries(nxt)) {
    if (key2 === "style") {
      setDomStyleValue(element, prev.style, value);
      continue;
    }
    if (prev[key2] === value) continue;
    setDomProperty(element, key2, value, eventStore);
  }
  if (isModalDialogElement(element)) {
    syncModalDialogInertState(element, !isElementHidden(element));
  }
  if (nxt.autoFocus && (prev.autoFocus !== nxt.autoFocus || isModalDialogElement(element) && isHiddenPropValue(prev.hidden) && !isElementHidden(element))) {
    if (!isModalDialogElement(element)) {
      element.focus?.();
    }
  }
};
var setChildren2 = (container, children2) => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children2) {
    container.appendChild(child);
    const childElement = child;
    if (childElement.getAttribute && isModalDialogElement(childElement)) {
      const open = !isElementHidden(childElement);
      syncModalDialogInertState(childElement, open);
      if (open) {
        focusInitialDialogTarget(childElement);
      }
    }
  }
};
var resolvePortalTarget = (node, documentLike) => {
  const target = node.target;
  if (target == null || target === "" || target === "body") {
    return documentLike.body ?? null;
  }
  if (typeof documentLike.querySelector === "function") {
    return documentLike.querySelector(String(target));
  }
  return null;
};
var disposeDomNode = (node, eventStore, portalStore, liveTextStore) => {
  if (node.getAttribute && isModalDialogElement(node)) {
    syncModalDialogInertState(node, false);
  }
  const liveTextEffect = liveTextStore.get(node);
  if (liveTextEffect) {
    liveTextEffect.dispose();
    liveTextStore.delete(node);
  }
  if (node.__luminaIndexListEffect) {
    node.__luminaIndexListEffect.dispose();
    node.__luminaIndexListEffect = null;
    node.__luminaIndexListSource = null;
    node.__luminaIndexListRender = null;
  }
  if (node.__luminaForListEffect) {
    node.__luminaForListEffect.dispose();
    node.__luminaForListEffect = null;
    node.__luminaForListSource = null;
    node.__luminaForListKey = null;
    node.__luminaForListRender = null;
  }
  const portal2 = portalStore.get(node);
  if (portal2?.host) {
    disposeDomNode(portal2.host, eventStore, portalStore, liveTextStore);
    const portalParent = portal2.host.parentNode;
    if (portalParent) {
      try {
        portalParent.removeChild(portal2.host);
      } catch {
      }
    }
  }
  portalStore.delete(node);
  for (const child of readChildNodes(node)) {
    disposeDomNode(child, eventStore, portalStore, liveTextStore);
  }
  eventStore.delete(node);
};
var replaceChildren = (container, children2, eventStore, portalStore, liveTextStore) => {
  const current = readChildNodes(container);
  for (const child of current) {
    disposeDomNode(child, eventStore, portalStore, liveTextStore);
    container.removeChild(child);
  }
  for (const child of children2) {
    container.appendChild(child);
    const childElement = child;
    if (childElement.getAttribute && isModalDialogElement(childElement)) {
      const open = !isElementHidden(childElement);
      syncModalDialogInertState(childElement, open);
      if (open) {
        focusInitialDialogTarget(childElement);
      }
    }
  }
};
var vnodeKindTag = (node) => `${node.kind}:${node.tag ?? ""}`;
var hasVNodeKey = (node) => typeof node.key === "string" || typeof node.key === "number";
var hasKeyedChildren = (children2) => children2.some((child) => hasVNodeKey(child));
var getDomHydrationKey = (node) => getDomAttribute(node, LUMINA_HYDRATION_KEY_ATTR);
var isDomTextNode = (node) => {
  const candidate = node;
  if (candidate.nodeType === 3 || candidate.nodeName === "#text") return true;
  return !("tagName" in node) && readChildNodes(node).length === 0;
};
var getDomHydrationLabel = (node) => {
  const element = node;
  if (typeof element.tagName === "string" && element.tagName.length > 0) {
    return element.tagName.toLowerCase();
  }
  if (isDomTextNode(node)) return "#text";
  return "node";
};
var childHydrationContext = (hydration, segment) => hydration ? {
  ...hydration,
  path: `${hydration.path}.${String(segment)}`
} : void 0;
var reportHydrationMismatch = (hydration, mismatch) => {
  if (!hydration) return;
  const diagnostic = { ...mismatch, path: hydration.path };
  hydration.onMismatch?.(diagnostic);
  if (hydration.strict) {
    const details = [diagnostic.expected && `expected ${diagnostic.expected}`, diagnostic.actual && `actual ${diagnostic.actual}`].filter(Boolean).join(", ");
    throw new Error(
      `Hydration mismatch at ${diagnostic.path}: ${diagnostic.kind}${details ? ` (${details})` : ""}`
    );
  }
};
var isIgnorableHydrationNode = (node) => {
  const candidate = node;
  if (candidate.nodeType === 8) return true;
  return isDomTextNode(node) && (candidate.textContent ?? "").trim() === "";
};
var canIgnoreHydrationWhitespace = (children2) => children2.every((child) => child.kind !== "text" && child.kind !== "live_text");
var findHydrationRootNode = (children2, node) => {
  if (node.kind === "text" || node.kind === "live_text") {
    return children2[0] ?? null;
  }
  return children2.find((child) => !isIgnorableHydrationNode(child)) ?? null;
};
var hasHydratableKeyedChildren = (children2) => children2.some((child) => hasVNodeKey(child));
var duplicateKeyError = (key2) => new Error(`Duplicate keyed child '${String(key2)}' in the same parent is not supported`);
var assertUniqueVNodeChildKeys = (children2) => {
  const seen = /* @__PURE__ */ new Set();
  for (const child of children2) {
    if (!hasVNodeKey(child)) continue;
    if (seen.has(child.key)) {
      throw duplicateKeyError(child.key);
    }
    seen.add(child.key);
  }
};
var areAllChildrenKeyed = (children2) => children2.every((child) => hasVNodeKey(child));
var tryReadTextLeaf = (node) => {
  if (node.kind === "text") {
    return { kind: "text", text: node.text ?? "" };
  }
  if (node.kind === "live_text") {
    return { kind: "live_text", signal: node.signal };
  }
  if (node.kind !== "element" && node.kind !== "fragment") {
    return null;
  }
  const children2 = asDomChildren(node);
  if (children2.length !== 1) {
    return null;
  }
  const child = children2[0];
  if (child.kind === "text") {
    return { kind: "text", text: child.text ?? "" };
  }
  if (child.kind === "live_text") {
    return { kind: "live_text", signal: child.signal };
  }
  return null;
};
var trySkipStableKeyedChildFast = (prevNode, nextNode) => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;
  if (prevNode.kind === "text" && nextNode.kind === "text") {
    return prevNode.text === nextNode.text;
  }
  if (prevNode.kind === "live_text" && nextNode.kind === "live_text") {
    return prevNode.signal === nextNode.signal;
  }
  if (prevNode.kind === "portal" || nextNode.kind === "portal") {
    return null;
  }
  if (prevNode.kind === "index_list" && nextNode.kind === "index_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }
  if (prevNode.kind === "for_list" && nextNode.kind === "for_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listKey === nextNode.listKey && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }
  if (prevNode.kind !== "element" && prevNode.kind !== "fragment") {
    return null;
  }
  if (prevNode.kind === "element" && nextNode.kind === "element") {
    if (prevNode.tag !== nextNode.tag) {
      return false;
    }
    if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
      return false;
    }
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }
  if (prevChildren.length === 0) {
    return true;
  }
  if (prevChildren.length > 4) {
    return null;
  }
  for (let index = 0; index < prevChildren.length; index += 1) {
    const prevChild = prevChildren[index];
    const nextChild = nextChildren[index];
    if (prevChild.kind === "text" && nextChild.kind === "text") {
      if ((prevChild.text ?? "") !== (nextChild.text ?? "")) {
        return false;
      }
      continue;
    }
    if (prevChild.kind === "live_text" && nextChild.kind === "live_text") {
      if (prevChild.signal !== nextChild.signal) {
        return false;
      }
      continue;
    }
    if (prevChild.kind !== nextChild.kind) {
      return false;
    }
    if (prevChild.kind !== "element" && prevChild.kind !== "fragment") {
      return null;
    }
    if (prevChild.kind === "element" && nextChild.kind === "element") {
      if (prevChild.tag !== nextChild.tag || !hasShallowEqualProps(prevChild.props, nextChild.props)) {
        return false;
      }
    }
    const prevLeaf = tryReadTextLeaf(prevChild);
    const nextLeaf = tryReadTextLeaf(nextChild);
    if (!prevLeaf || !nextLeaf || prevLeaf.kind !== nextLeaf.kind) {
      return null;
    }
    if (prevLeaf.kind === "text" && nextLeaf.kind === "text") {
      if (prevLeaf.text !== nextLeaf.text) {
        return false;
      }
      continue;
    }
    if (prevLeaf.kind === "live_text" && nextLeaf.kind === "live_text") {
      if (prevLeaf.signal !== nextLeaf.signal) {
        return false;
      }
      continue;
    }
    return null;
  }
  return true;
};
var analyzeKeyedChildTransition = (prevChildren, nextChildren) => {
  if (prevChildren.length !== nextChildren.length) {
    return null;
  }
  const seenNextKeys = /* @__PURE__ */ new Set();
  let sawMismatch = false;
  for (let index = 0; index < prevChildren.length; index += 1) {
    const prevChild = prevChildren[index];
    const nextChild = nextChildren[index];
    if (!hasVNodeKey(prevChild) || !hasVNodeKey(nextChild)) {
      return null;
    }
    const prevKey = prevChild.key;
    const nextKey = nextChild.key;
    if (seenNextKeys.has(nextKey)) {
      throw duplicateKeyError(nextKey);
    }
    seenNextKeys.add(nextKey);
    sawMismatch || (sawMismatch = prevKey !== nextKey);
  }
  if (!sawMismatch) {
    return { kind: "same_order" };
  }
  return analyzeSequenceTransition(
    prevChildren,
    nextChildren,
    (left, right) => left.key === right.key
  );
};
var createForListState = (entries) => ({
  entries,
  entriesByKey: new Map(entries.map((entry) => [entry.key, entry])),
  order: entries.map((entry) => entry.key)
});
var genericKeyedStates = /* @__PURE__ */ new WeakMap();
var createGenericKeyedState = (entries) => ({
  entries
});
var buildKeyedOrder = (items, keyOf) => {
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < items.length; index += 1) {
    const key2 = coerceListKey(keyOf(items[index], index), index);
    if (seen.has(key2)) {
      throw duplicateKeyError(key2);
    }
    seen.add(key2);
    order.push(key2);
  }
  return order;
};
var buildGenericKeyedState = (children2, domChildren) => createGenericKeyedState(
  children2.map((child, index) => ({
    key: child.key,
    vnode: child,
    domNode: domChildren[index]
  })).filter((entry) => Boolean(entry.domNode))
);
var isGenericKeyedStateValid = (host, state2, children2) => {
  if (!state2 || state2.entries.length !== children2.length) {
    return false;
  }
  for (let index = 0; index < children2.length; index += 1) {
    const entry = state2.entries[index];
    const child = children2[index];
    if (!entry || entry.key !== child.key || entry.domNode.parentNode !== host) {
      return false;
    }
  }
  return true;
};
var ensureGenericKeyedState = (host, children2) => {
  const existing = genericKeyedStates.get(host);
  if (isGenericKeyedStateValid(host, existing, children2)) {
    return existing;
  }
  const rebuilt = buildGenericKeyedState(children2, readChildNodes(host));
  genericKeyedStates.set(host, rebuilt);
  return rebuilt;
};
var syncGenericKeyedStateForTransition = (state2, nextChildren, transition) => {
  if (transition.kind === "adjacent_swap") {
    const leftEntry = state2.entries[transition.left];
    state2.entries[transition.left] = state2.entries[transition.right];
    state2.entries[transition.right] = leftEntry;
  } else {
    const moving = state2.entries.splice(transition.from, 1)[0];
    if (moving) {
      state2.entries.splice(transition.to, 0, moving);
    }
  }
  for (let index = 0; index < nextChildren.length; index += 1) {
    const entry = state2.entries[index];
    if (!entry) continue;
    entry.vnode = nextChildren[index];
  }
};
var replaceGenericKeyedState = (host, nextEntries, existingState) => {
  if (existingState) {
    existingState.entries = nextEntries;
    genericKeyedStates.set(host, existingState);
    return;
  }
  genericKeyedStates.set(host, createGenericKeyedState(nextEntries));
};
var collectGenericEntryDomChildren = (entries, host, attachedOnly) => {
  if (!attachedOnly) {
    const children3 = new Array(entries.length);
    for (let index = 0; index < entries.length; index += 1) {
      children3[index] = entries[index].domNode;
    }
    return children3;
  }
  const children2 = [];
  for (let index = 0; index < entries.length; index += 1) {
    const domNode = entries[index].domNode;
    if (domNode.parentNode === host) {
      children2.push(domNode);
    }
  }
  return children2;
};
var analyzeKeyedOrderTransition = (items, previousOrder, keyOf) => {
  if (items.length !== previousOrder.length) {
    return { transition: { kind: "complex_reorder" }, nextOrder: null };
  }
  let firstMismatch = -1;
  let firstMismatchKey = null;
  for (let index = 0; index < items.length; index += 1) {
    const key2 = coerceListKey(keyOf(items[index], index), index);
    if (previousOrder[index] !== key2) {
      firstMismatch = index;
      firstMismatchKey = key2;
      break;
    }
  }
  if (firstMismatch < 0) {
    return { transition: { kind: "same_order" }, nextOrder: null };
  }
  const swapRight = firstMismatch + 1;
  if (swapRight < items.length) {
    const rightKey = coerceListKey(keyOf(items[swapRight], swapRight), swapRight);
    if (previousOrder[firstMismatch] === rightKey && previousOrder[swapRight] === firstMismatchKey) {
      let restMatches = true;
      for (let index = swapRight + 1; index < items.length; index += 1) {
        const key2 = coerceListKey(keyOf(items[index], index), index);
        if (previousOrder[index] !== key2) {
          restMatches = false;
          break;
        }
      }
      if (restMatches) {
        return {
          transition: { kind: "adjacent_swap", left: firstMismatch, right: swapRight },
          nextOrder: null
        };
      }
    }
  }
  const nextOrder = previousOrder.slice();
  nextOrder[firstMismatch] = firstMismatchKey;
  for (let index = firstMismatch + 1; index < items.length; index += 1) {
    nextOrder[index] = coerceListKey(keyOf(items[index], index), index);
  }
  return {
    transition: analyzeSequenceTransition(
      previousOrder,
      nextOrder,
      (left, right) => left === right
    ),
    nextOrder
  };
};
var hasShallowEqualProps = (left, right) => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  let leftCount = 0;
  for (const key2 in left) {
    if (!Object.prototype.hasOwnProperty.call(left, key2)) continue;
    leftCount += 1;
    if (!Object.prototype.hasOwnProperty.call(right, key2)) return false;
    if (left[key2] !== right[key2]) return false;
  }
  let rightCount = 0;
  for (const key2 in right) {
    if (!Object.prototype.hasOwnProperty.call(right, key2)) continue;
    rightCount += 1;
  }
  return leftCount === rightCount;
};
var canSkipChildListPatch = (length, compareChild) => {
  if (length === 0) {
    return true;
  }
  if (length > 6) {
    return false;
  }
  for (let index = 0; index < length; index += 1) {
    if (!compareChild(index)) {
      return false;
    }
  }
  return true;
};
var canSkipStructuredSmallSubtree = (prevNode, nextNode, equalsValue) => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;
  if (prevNode.kind === "text" && nextNode.kind === "text") {
    return prevNode.text === nextNode.text;
  }
  if (prevNode.kind === "live_text" && nextNode.kind === "live_text") {
    return prevNode.signal === nextNode.signal;
  }
  if (prevNode.kind === "index_list" && nextNode.kind === "index_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }
  if (prevNode.kind === "for_list" && nextNode.kind === "for_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listKey === nextNode.listKey && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }
  if (prevNode.kind === "portal" || nextNode.kind === "portal") {
    return false;
  }
  if (prevNode.kind !== "element" && prevNode.kind !== "fragment") {
    return null;
  }
  if (prevNode.kind === "element" && nextNode.kind === "element") {
    if (prevNode.tag !== nextNode.tag || prevNode.key !== nextNode.key) {
      return false;
    }
    if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
      return false;
    }
  } else if (prevNode.kind === "fragment" && nextNode.kind === "fragment") {
    if (prevNode.key !== nextNode.key) {
      return false;
    }
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }
  if (prevChildren.length === 0) {
    return true;
  }
  if (prevChildren.length > 6) {
    return null;
  }
  for (let index = 0; index < prevChildren.length; index += 1) {
    const childResult = canSkipStructuredSmallSubtree(
      prevChildren[index],
      nextChildren[index],
      equalsValue
    );
    if (childResult === null) {
      return null;
    }
    if (!childResult) {
      return false;
    }
  }
  return true;
};
var remapMovedIndex = (index, from, to) => {
  if (from === to) {
    return index;
  }
  if (from < to) {
    if (index < from || index > to) return index;
    if (index === to) return from;
    return index + 1;
  }
  if (index < to || index > from) return index;
  if (index === to) return from;
  return index - 1;
};
var getComplexOrderAffectedRange = (previousOrder, nextOrder) => {
  const window2 = findStableSequenceWindow(previousOrder, nextOrder);
  if (!window2) {
    return null;
  }
  return { start: window2.nextStart, end: window2.nextEnd };
};
var canSkipDomPatch = (prevNode, nextNode, equalsValue) => {
  if (prevNode === nextNode) return true;
  if (prevNode.kind !== nextNode.kind) return false;
  if (prevNode.kind === "text" && nextNode.kind === "text") {
    return prevNode.text === nextNode.text;
  }
  if (prevNode.kind === "live_text" && nextNode.kind === "live_text") {
    return prevNode.signal === nextNode.signal;
  }
  if (prevNode.kind === "index_list" && nextNode.kind === "index_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listRender === nextNode.listRender;
  }
  if (prevNode.kind === "for_list" && nextNode.kind === "for_list") {
    return prevNode.itemsSignal === nextNode.itemsSignal && prevNode.listKey === nextNode.listKey && prevNode.listIndexedRender === nextNode.listIndexedRender;
  }
  if (prevNode.kind === "portal" || nextNode.kind === "portal") {
    return false;
  }
  const structuredSmallSubtree = canSkipStructuredSmallSubtree(prevNode, nextNode, equalsValue);
  if (structuredSmallSubtree !== null) {
    return structuredSmallSubtree;
  }
  const prevFingerprint = getStablePatchFingerprint(prevNode);
  if (prevFingerprint !== null) {
    const nextFingerprint = getStablePatchFingerprint(nextNode);
    if (nextFingerprint !== null) {
      return prevFingerprint === nextFingerprint;
    }
  }
  if (prevNode.tag !== nextNode.tag || prevNode.key !== nextNode.key) {
    return false;
  }
  if (!hasShallowEqualProps(prevNode.props, nextNode.props)) {
    return false;
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (prevChildren.length !== nextChildren.length) {
    return false;
  }
  if (prevChildren.length === 0) {
    return true;
  }
  return canSkipChildListPatch(
    prevChildren.length,
    (index) => canSkipDomPatch(prevChildren[index], nextChildren[index], equalsValue)
  );
};
var patchPortalMount = (anchor, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const previous = portalStore.get(anchor) ?? { target: null, host: null };
  const nextTarget = resolvePortalTarget(nextNode, documentLike);
  const prevChildren = prevNode?.kind === "portal" ? prevNode.children ?? [] : [];
  const nextChildren = nextNode.children ?? [];
  if (!nextTarget) {
    if (previous.host) {
      replaceChildren(previous.host, [], eventStore, portalStore, liveTextStore);
      const parent = previous.host.parentNode;
      if (parent) parent.removeChild(previous.host);
    }
    portalStore.set(anchor, { target: null, host: null });
    return;
  }
  let host = previous.host;
  const targetChanged = previous.target !== nextTarget || !host || host.parentNode !== nextTarget;
  assertUniqueVNodeChildKeys(nextChildren);
  if (targetChanged) {
    if (host) {
      replaceChildren(host, [], eventStore, portalStore, liveTextStore);
      const parent = host.parentNode;
      if (parent) parent.removeChild(host);
    }
    host = documentLike.createElement("lumina-portal-host");
    nextTarget.appendChild(host);
  }
  if (!host) {
    host = documentLike.createElement("lumina-portal-host");
    nextTarget.appendChild(host);
  }
  if (targetChanged || !prevNode || prevNode.kind !== "portal") {
    const mountedChildren = nextChildren.map(
      (child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
    );
    replaceChildren(host, mountedChildren, eventStore, portalStore, liveTextStore);
  } else if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(
      host,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  } else {
    patchDomChildrenPositionally(
      host,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
  portalStore.set(anchor, { target: nextTarget, host });
};
var bindIndexListHost = (host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== "function") {
    host.__luminaIndexListEffect?.dispose();
    host.__luminaIndexListEffect = null;
    host.__luminaIndexListSource = null;
    host.__luminaIndexListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }
  if (host.__luminaIndexListEffect && host.__luminaIndexListSource === source && host.__luminaIndexListRender === renderItem) {
    return;
  }
  host.__luminaIndexListEffect?.dispose();
  let currentItems = readIndexListValues(source, false);
  let itemSignals = currentItems.map((value) => new Signal(value));
  const renderChildren = () => itemSignals.map(
    (itemSignal, index) => createDomNode(
      coerceRenderableToVNode(renderItem(itemSignal, index)),
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    )
  );
  replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);
  const runBatched = (fn) => {
    batch(fn);
  };
  host.__luminaIndexListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    if (nextItems.length !== itemSignals.length) {
      currentItems = nextItems;
      itemSignals = nextItems.map((value) => new Signal(value));
      replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);
      return;
    }
    runBatched(() => {
      for (let index = 0; index < nextItems.length; index += 1) {
        if (currentItems[index] === nextItems[index] || equalsValue(currentItems[index], nextItems[index])) {
          continue;
        }
        itemSignals[index].set(nextItems[index]);
      }
      currentItems = nextItems;
    });
  });
  host.__luminaIndexListSource = source;
  host.__luminaIndexListRender = renderItem;
};
var bindForListHost = (host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue, hydrateExisting = false, hydration) => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== "function" || typeof renderItem !== "function") {
    host.__luminaForListEffect?.dispose();
    host.__luminaForListEffect = null;
    host.__luminaForListSource = null;
    host.__luminaForListKey = null;
    host.__luminaForListRender = null;
    replaceChildren(host, [], eventStore, portalStore, liveTextStore);
    return;
  }
  if (host.__luminaForListEffect && host.__luminaForListSource === source && host.__luminaForListKey === keyOf && host.__luminaForListRender === renderItem) {
    return;
  }
  host.__luminaForListEffect?.dispose();
  const runBatched = (fn) => {
    batch(fn);
  };
  const createEntry = (value, index, existingDomNode, keyOverride) => {
    const key2 = keyOverride ?? coerceListKey(keyOf(value, index), index);
    const itemSignal = new Signal(value);
    const indexSignal = new Signal(index);
    const vnode2 = applyVNodeKey(coerceRenderableToVNode(renderItem(itemSignal, indexSignal)), key2);
    const domNode = existingDomNode ? hydrateDomNode(
      existingDomNode,
      vnode2,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue,
      childHydrationContext(hydration, `key:${String(key2)}`)
    ) : createDomNode(vnode2, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return {
      key: key2,
      currentValue: value,
      currentIndex: index,
      itemSignal,
      indexSignal,
      vnode: vnode2,
      domNode
    };
  };
  const createInitialEntries = (items, existingChildren2 = []) => {
    const seen = /* @__PURE__ */ new Set();
    const keyedExisting = /* @__PURE__ */ new Map();
    for (const child of existingChildren2) {
      const key2 = getDomHydrationKey(child);
      if (key2 !== null && !keyedExisting.has(key2)) {
        keyedExisting.set(key2, child);
      }
    }
    return items.map((value, index) => {
      const key2 = coerceListKey(keyOf(value, index), index);
      if (seen.has(key2)) {
        throw duplicateKeyError(key2);
      }
      seen.add(key2);
      const keyedDom = keyedExisting.get(String(key2));
      if (!keyedDom && hydrateExisting) {
        reportHydrationMismatch(childHydrationContext(hydration, index), {
          kind: "missing_keyed_child",
          expected: String(key2),
          key: key2
        });
      }
      return createEntry(value, index, keyedDom, key2);
    });
  };
  const replaceOrHydrateInitialChildren = (entries, existingChildren2) => {
    if (!hydrateExisting) {
      replaceChildren(
        host,
        entries.map((entry) => entry.domNode),
        eventStore,
        portalStore,
        liveTextStore
      );
      return;
    }
    reorderChildren(
      host,
      entries.map((entry) => entry.domNode),
      (child) => {
        reportHydrationMismatch(hydration, {
          kind: "extra_node",
          actual: getDomHydrationLabel(child)
        });
        disposeDomNode(child, eventStore, portalStore, liveTextStore);
      },
      {
        currentChildren: existingChildren2,
        structureChanged: true
      }
    );
  };
  const existingChildren = hydrateExisting ? readChildNodes(host) : [];
  const initialEntries = createInitialEntries(readIndexListValues(source, false), existingChildren);
  let state2 = createForListState(initialEntries);
  const dirtyEntries = /* @__PURE__ */ new Set();
  replaceOrHydrateInitialChildren(state2.entries, existingChildren);
  const renderEntryVNode = (entry) => applyVNodeKey(
    coerceRenderableToVNode(renderItem(entry.itemSignal, entry.indexSignal)),
    entry.key
  );
  const markEntryDirty = (entry) => {
    dirtyEntries.add(entry);
  };
  const flushDirtyEntries = () => {
    for (const entry of dirtyEntries) {
      const nextVNode = renderEntryVNode(entry);
      if (!canSkipDomPatch(entry.vnode, nextVNode, equalsValue)) {
        entry.domNode = patchDomNode(
          entry.domNode,
          entry.vnode,
          nextVNode,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      }
      entry.vnode = nextVNode;
    }
    dirtyEntries.clear();
  };
  const syncEntryValue = (entry, value) => {
    if (entry.currentValue !== value && !equalsValue(entry.currentValue, value)) {
      entry.itemSignal.set(value);
      entry.currentValue = value;
      markEntryDirty(entry);
    }
  };
  const syncEntryIndex = (entry, index) => {
    if (entry.currentIndex !== index) {
      entry.indexSignal.set(index);
      entry.currentIndex = index;
      markEntryDirty(entry);
    }
  };
  const syncValuesForOrder = (items, order) => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = state2.entriesByKey.get(order[index]);
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  };
  const syncValuesForEntries = (items, nextEntries) => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  };
  const hasPureEntryValueReuse = (items, nextEntries) => {
    if (items.length !== nextEntries.length) {
      return false;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (nextEntries[index]?.currentValue !== items[index]) {
        return false;
      }
    }
    return true;
  };
  const swapItems = (entries, left, right) => {
    const nextEntries = entries.slice();
    const previousLeft = nextEntries[left];
    nextEntries[left] = nextEntries[right];
    nextEntries[right] = previousLeft;
    return nextEntries;
  };
  const moveItems = (entries, from, to) => {
    const nextEntries = entries.slice();
    const moving = nextEntries.splice(from, 1)[0];
    if (!moving) {
      return nextEntries;
    }
    nextEntries.splice(to, 0, moving);
    return nextEntries;
  };
  const applyDirectEntryReorder = (currentEntries, nextEntries, transition) => {
    if (typeof host.insertBefore !== "function") {
      return false;
    }
    if (transition.kind === "adjacent_swap") {
      const leftDom = currentEntries[transition.left]?.domNode;
      const rightDom = currentEntries[transition.right]?.domNode;
      if (!leftDom || !rightDom) {
        return false;
      }
      host.insertBefore(rightDom, leftDom);
      return true;
    }
    if (transition.kind === "single_move") {
      const movingDom = currentEntries[transition.from]?.domNode;
      if (!movingDom) {
        return false;
      }
      const reference = transition.from < transition.to ? currentEntries[transition.to + 1]?.domNode ?? null : currentEntries[transition.to]?.domNode ?? null;
      host.insertBefore(movingDom, reference);
      return true;
    }
    return false;
  };
  const syncIndicesForRange = (nextEntries, transition, previousOrder, nextOrder) => {
    const range = transition.kind === "complex_reorder" && previousOrder && nextOrder ? getComplexOrderAffectedRange(previousOrder, nextOrder) : getTransitionAffectedRange(transition, nextEntries.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryIndex(entry, index);
    }
  };
  const reorderEntriesForComplexWindow = (currentEntries, previousOrder, nextOrder) => {
    if (currentEntries.length !== nextOrder.length || previousOrder.length !== nextOrder.length) {
      return null;
    }
    const window2 = findStableSequenceWindow(previousOrder, nextOrder);
    if (!window2) {
      return currentEntries.slice();
    }
    const nextEntries = currentEntries.slice();
    const windowEntries = /* @__PURE__ */ new Map();
    for (let index = window2.currentStart; index <= window2.currentEnd; index += 1) {
      const entry = currentEntries[index];
      const key2 = previousOrder[index];
      if (!entry || key2 == null) {
        return null;
      }
      windowEntries.set(key2, entry);
    }
    for (let index = window2.nextStart; index <= window2.nextEnd; index += 1) {
      const entry = windowEntries.get(nextOrder[index]);
      if (!entry) {
        return null;
      }
      nextEntries[index] = entry;
    }
    return nextEntries;
  };
  const buildNextEntries = (items, order) => {
    const retained = /* @__PURE__ */ new Set();
    const nextEntries = [];
    let structureChanged = items.length !== state2.entries.length;
    for (let index = 0; index < items.length; index += 1) {
      const key2 = order[index];
      const value = items[index];
      let entry = state2.entriesByKey.get(key2);
      if (!entry) {
        entry = createEntry(value, index);
        state2.entriesByKey.set(key2, entry);
        structureChanged = true;
      } else {
        syncEntryValue(entry, value);
      }
      retained.add(key2);
      nextEntries.push(entry);
    }
    for (const key2 of Array.from(state2.entriesByKey.keys())) {
      if (retained.has(key2)) continue;
      state2.entriesByKey.delete(key2);
      structureChanged = true;
    }
    return { nextEntries, structureChanged };
  };
  host.__luminaForListEffect = new Effect(() => {
    const nextItems = readIndexListValues(source, true);
    const analyzedTransition = analyzeKeyedOrderTransition(nextItems, state2.order, keyOf);
    const transition = analyzedTransition.transition;
    const nextOrder = analyzedTransition.nextOrder ?? (transition.kind === "adjacent_swap" ? swapItems(state2.order, transition.left, transition.right) : null);
    if (transition.kind === "same_order") {
      runBatched(() => {
        for (let index = 0; index < nextItems.length; index += 1) {
          const entry = state2.entries[index];
          if (!entry) continue;
          syncEntryValue(entry, nextItems[index]);
        }
        flushDirtyEntries();
      });
      return;
    }
    if (transition.kind === "adjacent_swap" || transition.kind === "single_move") {
      const previousEntries2 = state2.entries;
      const nextEntries2 = transition.kind === "adjacent_swap" ? swapItems(state2.entries, transition.left, transition.right) : moveItems(state2.entries, transition.from, transition.to);
      for (let index = 0; index < nextEntries2.length; index += 1) {
        if (!nextEntries2[index]) {
          throw new Error(
            `Missing keyed list entry '${String(nextOrder?.[index] ?? index)}' during transition`
          );
        }
      }
      runBatched(() => {
        if (nextOrder && !hasPureEntryValueReuse(nextItems, nextEntries2)) {
          syncValuesForOrder(nextItems, nextOrder);
        }
        syncIndicesForRange(nextEntries2, transition, state2.order, nextOrder ?? state2.order);
        flushDirtyEntries();
      });
      state2.entries = nextEntries2;
      state2.order = nextOrder ?? (transition.kind === "adjacent_swap" ? swapItems(state2.order, transition.left, transition.right) : moveItems(state2.order, transition.from, transition.to));
      if (!applyDirectEntryReorder(previousEntries2, nextEntries2, transition)) {
        reorderChildren(
          host,
          nextEntries2.map((entry) => entry.domNode),
          (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
          {
            currentChildren: previousEntries2.map((entry) => entry.domNode),
            transition,
            structureChanged: false
          }
        );
      }
      return;
    }
    let nextEntries = [];
    let structureChanged = false;
    const resolvedNextOrder = nextOrder ?? buildKeyedOrder(nextItems, keyOf);
    const reorderedEntries = transition.kind === "complex_reorder" ? reorderEntriesForComplexWindow(state2.entries, state2.order, resolvedNextOrder) : null;
    if (reorderedEntries) {
      const previousEntries2 = state2.entries;
      runBatched(() => {
        if (!hasPureEntryValueReuse(nextItems, reorderedEntries)) {
          syncValuesForEntries(nextItems, reorderedEntries);
        }
        syncIndicesForRange(reorderedEntries, transition, state2.order, resolvedNextOrder);
        flushDirtyEntries();
      });
      state2.entries = reorderedEntries;
      state2.order = resolvedNextOrder;
      if (!applyDirectEntryReorder(previousEntries2, reorderedEntries, transition)) {
        reorderChildren(
          host,
          reorderedEntries.map((entry) => entry.domNode),
          (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
          {
            currentChildren: previousEntries2.map((entry) => entry.domNode),
            transition,
            structureChanged: false
          }
        );
      }
      return;
    }
    const previousEntries = state2.entries;
    runBatched(() => {
      const built = buildNextEntries(nextItems, resolvedNextOrder);
      nextEntries = built.nextEntries;
      structureChanged = built.structureChanged;
      syncIndicesForRange(nextEntries, transition, state2.order, resolvedNextOrder);
      flushDirtyEntries();
    });
    state2.entries = nextEntries;
    state2.order = resolvedNextOrder;
    reorderChildren(
      host,
      nextEntries.map((entry) => entry.domNode),
      (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
      {
        currentChildren: previousEntries.map((entry) => entry.domNode),
        transition,
        structureChanged
      }
    );
  });
  host.__luminaForListSource = source;
  host.__luminaForListKey = keyOf;
  host.__luminaForListRender = renderItem;
};
var createDomNode = (node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  if (node.kind === "text") {
    return documentLike.createTextNode(node.text ?? "");
  }
  if (node.kind === "live_text") {
    const textNode = documentLike.createTextNode(node.signal ? String(node.signal.get()) : "");
    if (node.signal) {
      const effect = new Effect(() => {
        textNode.textContent = String(node.signal?.get() ?? "");
      });
      liveTextStore.set(textNode, effect);
    }
    return textNode;
  }
  if (node.kind === "index_list") {
    const host = documentLike.createElement("lumina-index-list");
    updateDomProperties(host, {}, indexListHostProps, eventStore);
    bindIndexListHost(
      host,
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return host;
  }
  if (node.kind === "for_list") {
    const host = documentLike.createElement("lumina-for-list");
    updateDomProperties(host, {}, forListHostProps, eventStore);
    bindForListHost(host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return host;
  }
  if (node.kind === "fragment") {
    const wrapper = documentLike.createElement("lumina-fragment");
    const vnodeChildren2 = asDomChildren(node);
    assertUniqueVNodeChildKeys(vnodeChildren2);
    const children3 = vnodeChildren2.map(
      (child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
    );
    setChildren2(wrapper, children3);
    return wrapper;
  }
  if (node.kind === "portal") {
    const anchor = documentLike.createElement("lumina-portal-anchor");
    updateDomProperties(
      anchor,
      {},
      { hidden: true, "data-lumina-portal-anchor": "true" },
      eventStore
    );
    patchPortalMount(
      anchor,
      null,
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return anchor;
  }
  if (node.kind === "element" && typeof node.domTemplateHtml === "string") {
    const templated = cloneStaticTemplateElement(documentLike, node.domTemplateHtml);
    if (templated) {
      updateDomProperties(templated, {}, node.props, eventStore);
      return templated;
    }
  }
  const element = documentLike.createElement(node.tag ?? "div");
  updateDomProperties(element, {}, node.props, eventStore);
  const vnodeChildren = asDomChildren(node);
  assertUniqueVNodeChildKeys(vnodeChildren);
  const children2 = vnodeChildren.map(
    (child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
  );
  setChildren2(element, children2);
  if (node.props?.autoFocus && isModalDialogElement(element) && !isElementHidden(element)) {
    focusInitialDialogTarget(element);
  }
  return element;
};
var patchDomChildrenPositionally = (element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const shared = Math.min(prevChildren.length, nextChildren.length);
  for (let i = 0; i < shared; i += 1) {
    const currentChild = element.childNodes[i];
    if (!currentChild) {
      element.appendChild(
        createDomNode(
          nextChildren[i],
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        )
      );
      continue;
    }
    if (canSkipDomPatch(prevChildren[i], nextChildren[i], equalsValue)) {
      continue;
    }
    patchDomNode(
      currentChild,
      prevChildren[i],
      nextChildren[i],
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
  if (nextChildren.length > prevChildren.length) {
    for (let i = prevChildren.length; i < nextChildren.length; i += 1) {
      element.appendChild(
        createDomNode(
          nextChildren[i],
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        )
      );
    }
  } else if (prevChildren.length > nextChildren.length) {
    for (let i = prevChildren.length - 1; i >= nextChildren.length; i -= 1) {
      const child = element.childNodes[i];
      if (child) {
        disposeDomNode(child, eventStore, portalStore, liveTextStore);
        element.removeChild(child);
      }
    }
  }
};
var patchStableKeyedChildAt = (currentDomChildren, prevChildren, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const domChild = currentDomChildren[index];
  const prevChild = prevChildren[index];
  const nextChild = nextChildren[index];
  if (!domChild || !prevChild || !nextChild || canSkipDomPatch(prevChild, nextChild, equalsValue)) {
    return;
  }
  patchDomNode(
    domChild,
    prevChild,
    nextChild,
    documentLike,
    eventStore,
    portalStore,
    liveTextStore,
    equalsValue
  );
};
var patchTransitionAffectedRange = (currentDomChildren, prevChildren, nextChildren, transition, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const range = getTransitionAffectedRange(transition, nextChildren.length);
  if (!range) {
    return;
  }
  for (let index = range.start; index <= range.end; index += 1) {
    const sourceIndex = transition.kind === "adjacent_swap" ? index === transition.left ? transition.right : transition.left : remapMovedIndex(index, transition.from, transition.to);
    const domChild = currentDomChildren[sourceIndex];
    const prevChild = prevChildren[sourceIndex];
    const nextChild = nextChildren[index];
    if (!domChild || !prevChild || !nextChild || canSkipDomPatch(prevChild, nextChild, equalsValue)) {
      continue;
    }
    patchDomNode(
      domChild,
      prevChild,
      nextChild,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
};
var patchStableGenericKeyedEntryAt = (entries, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const entry = entries[index];
  const nextChild = nextChildren[index];
  if (!entry || !nextChild) {
    return;
  }
  const fastSkip = trySkipStableKeyedChildFast(entry.vnode, nextChild);
  if (fastSkip === true || fastSkip !== false && canSkipDomPatch(entry.vnode, nextChild, equalsValue)) {
    return;
  }
  entry.domNode = patchDomNode(
    entry.domNode,
    entry.vnode,
    nextChild,
    documentLike,
    eventStore,
    portalStore,
    liveTextStore,
    equalsValue
  );
};
var patchTransitionAffectedGenericKeyedEntries = (entries, nextChildren, transition, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const range = getTransitionAffectedRange(transition, nextChildren.length);
  if (!range) {
    return;
  }
  for (let index = range.start; index <= range.end; index += 1) {
    const sourceIndex = transition.kind === "adjacent_swap" ? index === transition.left ? transition.right : transition.left : remapMovedIndex(index, transition.from, transition.to);
    const entry = entries[sourceIndex];
    const nextChild = nextChildren[index];
    if (!entry || !nextChild) {
      continue;
    }
    const fastSkip = trySkipStableKeyedChildFast(entry.vnode, nextChild);
    if (fastSkip === true || fastSkip !== false && canSkipDomPatch(entry.vnode, nextChild, equalsValue)) {
      continue;
    }
    entry.domNode = patchDomNode(
      entry.domNode,
      entry.vnode,
      nextChild,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
};
var patchDomChildrenWithKeys = (element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const allPrevChildrenKeyed = areAllChildrenKeyed(prevChildren);
  const allNextChildrenKeyed = areAllChildrenKeyed(nextChildren);
  const genericKeyedState = allPrevChildrenKeyed && allNextChildrenKeyed ? ensureGenericKeyedState(element, prevChildren) : (genericKeyedStates.delete(element), null);
  const keyedTransition = analyzeKeyedChildTransition(prevChildren, nextChildren);
  if (keyedTransition?.kind === "same_order") {
    for (let index = 0; index < nextChildren.length; index += 1) {
      const entry = genericKeyedState?.entries[index];
      const domChild = entry?.domNode ?? element.childNodes[index];
      const prevChild = entry?.vnode ?? prevChildren[index];
      const nextChild = nextChildren[index];
      if (!prevChild || !nextChild) {
        continue;
      }
      if (!domChild) {
        element.appendChild(
          createDomNode(
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          )
        );
        continue;
      }
      const fastSkip = trySkipStableKeyedChildFast(prevChild, nextChild);
      if (fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue)) {
        if (entry) {
          entry.vnode = nextChild;
        }
        continue;
      }
      const nextDomNode = patchDomNode(
        domChild,
        prevChild,
        nextChild,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      );
      if (entry) {
        entry.vnode = nextChild;
        entry.domNode = nextDomNode;
      }
    }
    return;
  }
  if (keyedTransition?.kind === "adjacent_swap") {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren2 = currentEntries ? null : Array.from(element.childNodes);
    const leftDom = currentEntries?.[keyedTransition.left]?.domNode ?? currentDomChildren2?.[keyedTransition.left];
    const rightDom = currentEntries?.[keyedTransition.right]?.domNode ?? currentDomChildren2?.[keyedTransition.right];
    if (leftDom && rightDom && typeof element.insertBefore === "function") {
      if (currentEntries && allNextChildrenKeyed) {
        patchTransitionAffectedGenericKeyedEntries(
          currentEntries,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      } else {
        patchTransitionAffectedRange(
          currentDomChildren2,
          prevChildren,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      }
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (index === keyedTransition.left || index === keyedTransition.right) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(
            currentEntries,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        } else {
          patchStableKeyedChildAt(
            currentDomChildren2,
            prevChildren,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        }
      }
      element.insertBefore(rightDom, leftDom);
      if (genericKeyedState && allNextChildrenKeyed) {
        syncGenericKeyedStateForTransition(genericKeyedState, nextChildren, keyedTransition);
      }
      return;
    }
  }
  if (keyedTransition?.kind === "single_move") {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren2 = currentEntries ? null : Array.from(element.childNodes);
    const movingDom = currentEntries?.[keyedTransition.from]?.domNode ?? currentDomChildren2?.[keyedTransition.from];
    if (movingDom && typeof element.insertBefore === "function") {
      const reference = keyedTransition.from < keyedTransition.to ? currentEntries?.[keyedTransition.to + 1]?.domNode ?? currentDomChildren2?.[keyedTransition.to + 1] ?? null : currentEntries?.[keyedTransition.to]?.domNode ?? currentDomChildren2?.[keyedTransition.to] ?? null;
      if (currentEntries && allNextChildrenKeyed) {
        patchTransitionAffectedGenericKeyedEntries(
          currentEntries,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      } else {
        patchTransitionAffectedRange(
          currentDomChildren2,
          prevChildren,
          nextChildren,
          keyedTransition,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
      }
      const affectedRange = getTransitionAffectedRange(keyedTransition, nextChildren.length);
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (affectedRange && index >= affectedRange.start && index <= affectedRange.end) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(
            currentEntries,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        } else {
          patchStableKeyedChildAt(
            currentDomChildren2,
            prevChildren,
            nextChildren,
            index,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
        }
      }
      element.insertBefore(movingDom, reference);
      if (genericKeyedState && allNextChildrenKeyed) {
        syncGenericKeyedStateForTransition(genericKeyedState, nextChildren, keyedTransition);
      }
      return;
    }
  }
  if (allPrevChildrenKeyed && allNextChildrenKeyed) {
    const currentEntries = genericKeyedState?.entries ?? null;
    const currentDomChildren2 = currentEntries ? null : readChildNodes(element);
    const window2 = keyedTransition?.kind === "complex_reorder" && typeof keyedTransition.start === "number" && typeof keyedTransition.end === "number" && prevChildren.length === nextChildren.length ? {
      currentStart: keyedTransition.start,
      currentEnd: keyedTransition.end,
      nextStart: keyedTransition.start,
      nextEnd: keyedTransition.end
    } : findStableSequenceWindow(
      prevChildren,
      nextChildren,
      (left, right) => left.key === right.key
    );
    if (window2) {
      const nextEntries = new Array(nextChildren.length);
      for (let index = 0; index < window2.currentStart; index += 1) {
        const entry = currentEntries?.[index];
        const domChild = entry?.domNode ?? currentDomChildren2?.[index];
        const prevChild = entry?.vnode ?? prevChildren[index];
        const nextChild = nextChildren[index];
        if (!domChild || !prevChild || !nextChild) {
          continue;
        }
        const fastSkip = trySkipStableKeyedChildFast(prevChild, nextChild);
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue) ? domChild : patchDomNode(
          domChild,
          prevChild,
          nextChild,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[index] = entry;
          continue;
        }
        nextEntries[index] = { key: nextChild.key, vnode: nextChild, domNode: nextDomNode };
      }
      const stableSuffixCount = prevChildren.length - (window2.currentEnd + 1);
      for (let offset = 1; offset <= stableSuffixCount; offset += 1) {
        const currentIndex = prevChildren.length - offset;
        const nextIndex = nextChildren.length - offset;
        const entry = currentEntries?.[currentIndex];
        const domChild = entry?.domNode ?? currentDomChildren2?.[currentIndex];
        const prevChild = entry?.vnode ?? prevChildren[currentIndex];
        const nextChild = nextChildren[nextIndex];
        if (!domChild || !prevChild || !nextChild) {
          continue;
        }
        const fastSkip = trySkipStableKeyedChildFast(prevChild, nextChild);
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue) ? domChild : patchDomNode(
          domChild,
          prevChild,
          nextChild,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[nextIndex] = entry;
          continue;
        }
        nextEntries[nextIndex] = { key: nextChild.key, vnode: nextChild, domNode: nextDomNode };
      }
      const prevKeyedWindow = /* @__PURE__ */ new Map();
      for (let index = window2.currentStart; index <= window2.currentEnd; index += 1) {
        const entry = currentEntries?.[index];
        const prevChild = entry?.vnode ?? prevChildren[index];
        const domChild = entry?.domNode ?? currentDomChildren2?.[index];
        if (!domChild || !prevChild || prevChild.key == null) continue;
        prevKeyedWindow.set(
          prevChild.key,
          entry ?? { key: prevChild.key, vnode: prevChild, domNode: domChild }
        );
      }
      let structureChanged2 = prevChildren.length !== nextChildren.length;
      for (let nextIndex = window2.nextStart; nextIndex <= window2.nextEnd; nextIndex += 1) {
        const nextChild = nextChildren[nextIndex];
        const prevEntry = prevKeyedWindow.get(nextChild.key);
        if (!prevEntry) {
          structureChanged2 = true;
          const createdDomNode = createDomNode(
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          );
          nextEntries[nextIndex] = {
            key: nextChild.key,
            vnode: nextChild,
            domNode: createdDomNode
          };
          continue;
        }
        prevKeyedWindow.delete(nextChild.key);
        const fastSkip = trySkipStableKeyedChildFast(prevEntry.vnode, nextChild);
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue) ? prevEntry.domNode : patchDomNode(
          prevEntry.domNode,
          prevEntry.vnode,
          nextChild,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
        prevEntry.vnode = nextChild;
        prevEntry.domNode = nextDomNode;
        nextEntries[nextIndex] = prevEntry;
      }
      for (const stale of prevKeyedWindow.values()) {
        structureChanged2 = true;
        disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
        if (stale.domNode.parentNode === element) {
          element.removeChild(stale.domNode);
        }
      }
      const nextDomChildren2 = collectGenericEntryDomChildren(
        nextEntries,
        element,
        false
      );
      const reconcilerCurrentChildren = structureChanged2 ? currentEntries ? collectGenericEntryDomChildren(currentEntries, element, true) : currentDomChildren2.filter((child) => child.parentNode === element) : currentEntries ? collectGenericEntryDomChildren(currentEntries, element, false) : currentDomChildren2;
      reorderChildren(
        element,
        nextDomChildren2,
        (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
        structureChanged2 ? {
          currentChildren: reconcilerCurrentChildren,
          structureChanged: false
        } : {
          currentChildren: reconcilerCurrentChildren,
          transition: keyedTransition?.kind === "complex_reorder" ? keyedTransition : null,
          structureChanged: false
        }
      );
      replaceGenericKeyedState(element, nextEntries, genericKeyedState);
      return;
    }
  }
  genericKeyedStates.delete(element);
  const currentDomChildren = readChildNodes(element);
  const prevKeyed = /* @__PURE__ */ new Map();
  const prevUnkeyed = [];
  for (let i = 0; i < prevChildren.length; i += 1) {
    const prevChild = prevChildren[i];
    const domChild = currentDomChildren[i];
    if (!domChild) continue;
    if (hasVNodeKey(prevChild)) {
      if (prevKeyed.has(prevChild.key)) {
        throw duplicateKeyError(prevChild.key);
      }
      prevKeyed.set(prevChild.key, { vnode: prevChild, domNode: domChild });
      continue;
    }
    prevUnkeyed.push({ vnode: prevChild, domNode: domChild });
  }
  const seenNextKeys = /* @__PURE__ */ new Set();
  const nextDomChildren = [];
  let unkeyedIndex = 0;
  for (const nextChild of nextChildren) {
    if (hasVNodeKey(nextChild)) {
      if (seenNextKeys.has(nextChild.key)) {
        throw duplicateKeyError(nextChild.key);
      }
      seenNextKeys.add(nextChild.key);
      const prevEntry2 = prevKeyed.get(nextChild.key);
      if (!prevEntry2) {
        nextDomChildren.push(
          createDomNode(
            nextChild,
            documentLike,
            eventStore,
            portalStore,
            liveTextStore,
            equalsValue
          )
        );
        continue;
      }
      prevKeyed.delete(nextChild.key);
      nextDomChildren.push(
        canSkipDomPatch(prevEntry2.vnode, nextChild, equalsValue) ? prevEntry2.domNode : patchDomNode(
          prevEntry2.domNode,
          prevEntry2.vnode,
          nextChild,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        )
      );
      continue;
    }
    const prevEntry = prevUnkeyed[unkeyedIndex];
    unkeyedIndex += 1;
    if (!prevEntry) {
      nextDomChildren.push(
        createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue)
      );
      continue;
    }
    nextDomChildren.push(
      canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue) ? prevEntry.domNode : patchDomNode(
        prevEntry.domNode,
        prevEntry.vnode,
        nextChild,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      )
    );
  }
  const alreadyDisposedStaleNodes = /* @__PURE__ */ new WeakSet();
  for (const stale of prevKeyed.values()) {
    disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
    alreadyDisposedStaleNodes.add(stale.domNode);
  }
  for (let i = unkeyedIndex; i < prevUnkeyed.length; i += 1) {
    disposeDomNode(prevUnkeyed[i].domNode, eventStore, portalStore, liveTextStore);
    alreadyDisposedStaleNodes.add(prevUnkeyed[i].domNode);
  }
  const structureChanged = prevKeyed.size > 0 || unkeyedIndex < prevUnkeyed.length || currentDomChildren.length !== nextDomChildren.length;
  reorderChildren(
    element,
    nextDomChildren,
    (child) => {
      const domChild = child;
      if (alreadyDisposedStaleNodes.has(domChild)) {
        return;
      }
      disposeDomNode(domChild, eventStore, portalStore, liveTextStore);
    },
    {
      currentChildren: currentDomChildren,
      transition: keyedTransition,
      structureChanged
    }
  );
};
var patchDomNode = (domNode, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  if (vnodeKindTag(prevNode) !== vnodeKindTag(nextNode)) {
    const replacement = createDomNode(
      nextNode,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    const parent = domNode.parentNode;
    if (parent && parent.replaceChild) {
      parent.replaceChild(replacement, domNode);
      disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
      return replacement;
    }
    disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
    return replacement;
  }
  if (nextNode.kind === "text") {
    const nextText = nextNode.text ?? "";
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }
  if (nextNode.kind === "live_text") {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (nextNode.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(nextNode.signal?.get() ?? "");
      });
      liveTextStore.set(domNode, effect);
    } else {
      domNode.textContent = "";
    }
    return domNode;
  }
  if (nextNode.kind === "index_list") {
    updateDomProperties(domNode, prevNode.props, indexListHostProps, eventStore);
    bindIndexListHost(
      domNode,
      nextNode,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }
  if (nextNode.kind === "for_list") {
    updateDomProperties(domNode, prevNode.props, forListHostProps, eventStore);
    bindForListHost(
      domNode,
      nextNode,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }
  if (nextNode.kind === "portal") {
    patchPortalMount(
      domNode,
      prevNode,
      nextNode,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }
  const element = domNode;
  if (nextNode.kind === "element") {
    updateDomProperties(element, prevNode.props, nextNode.props, eventStore);
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(
      element,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  } else {
    patchDomChildrenPositionally(
      element,
      prevChildren,
      nextChildren,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
  }
  if (nextNode.kind === "element" && nextNode.props?.autoFocus && isModalDialogElement(element) && isHiddenPropValue(prevNode.props?.hidden) && !isElementHidden(element)) {
    focusInitialDialogTarget(element);
  }
  return element;
};
var hydrateDomNode = (domNode, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue, hydration) => {
  if (node.kind === "text") {
    if (getDomHydrationLabel(domNode) !== "#text") {
      reportHydrationMismatch(hydration, {
        kind: "tag",
        expected: "#text",
        actual: getDomHydrationLabel(domNode)
      });
      const replacement = documentLike.createTextNode(node.text ?? "");
      const parent = domNode.parentNode;
      if (parent?.replaceChild) {
        parent.replaceChild(replacement, domNode);
        disposeDomNode(domNode, eventStore, portalStore, liveTextStore);
      }
      return replacement;
    }
    const nextText = node.text ?? "";
    if (domNode.textContent !== nextText) {
      reportHydrationMismatch(hydration, {
        kind: "text",
        expected: nextText,
        actual: domNode.textContent ?? ""
      });
      domNode.textContent = nextText;
    }
    return domNode;
  }
  if (node.kind === "live_text") {
    const existingEffect = liveTextStore.get(domNode);
    if (existingEffect) {
      existingEffect.dispose();
      liveTextStore.delete(domNode);
    }
    if (node.signal) {
      const effect = new Effect(() => {
        domNode.textContent = String(node.signal?.get() ?? "");
      });
      liveTextStore.set(domNode, effect);
      domNode.textContent = String(node.signal.get());
    } else {
      domNode.textContent = "";
    }
    return domNode;
  }
  if (node.kind === "index_list") {
    updateDomProperties(domNode, void 0, indexListHostProps, eventStore);
    bindIndexListHost(
      domNode,
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }
  if (node.kind === "for_list") {
    updateDomProperties(domNode, void 0, forListHostProps, eventStore);
    bindForListHost(
      domNode,
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue,
      true,
      childHydrationContext(hydration, "forList")
    );
    return domNode;
  }
  if (node.kind === "portal") {
    patchPortalMount(
      domNode,
      vnodePortal(node.target, []),
      node,
      documentLike,
      eventStore,
      portalStore,
      liveTextStore,
      equalsValue
    );
    return domNode;
  }
  const element = domNode;
  if (node.kind === "element") {
    const expectedTag = (node.tag ?? "div").toLowerCase();
    const actualTag = getDomHydrationLabel(domNode);
    if (actualTag !== expectedTag) {
      reportHydrationMismatch(hydration, {
        kind: "tag",
        expected: expectedTag,
        actual: actualTag
      });
      return createDomNode(node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    }
    updateDomProperties(element, void 0, node.props, eventStore);
  }
  const nextChildren = asDomChildren(node);
  const allExistingChildren = readChildNodes(element);
  const existingChildren = canIgnoreHydrationWhitespace(nextChildren) ? allExistingChildren.filter((child) => !isIgnorableHydrationNode(child)) : allExistingChildren;
  const nextDomChildren = [];
  const keyedHydration = hasHydratableKeyedChildren(nextChildren);
  const usedExisting = /* @__PURE__ */ new Set();
  const keyedExisting = /* @__PURE__ */ new Map();
  if (keyedHydration) {
    for (const child of existingChildren) {
      const key2 = getDomHydrationKey(child);
      if (key2 !== null && !keyedExisting.has(key2)) {
        keyedExisting.set(key2, child);
      }
    }
  }
  let unkeyedCursor = 0;
  const takeUnkeyedExisting = () => {
    while (unkeyedCursor < existingChildren.length) {
      const candidate = existingChildren[unkeyedCursor];
      unkeyedCursor += 1;
      if (usedExisting.has(candidate)) continue;
      if (keyedHydration && getDomHydrationKey(candidate) !== null) continue;
      usedExisting.add(candidate);
      return candidate;
    }
    return void 0;
  };
  const seenHydrationKeys = /* @__PURE__ */ new Set();
  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];
    let currentChild;
    if (keyedHydration && hasVNodeKey(nextChild)) {
      if (seenHydrationKeys.has(nextChild.key)) {
        throw duplicateKeyError(nextChild.key);
      }
      seenHydrationKeys.add(nextChild.key);
      currentChild = keyedExisting.get(String(nextChild.key));
      if (currentChild) {
        usedExisting.add(currentChild);
      } else {
        reportHydrationMismatch(childHydrationContext(hydration, index), {
          kind: "missing_keyed_child",
          expected: String(nextChild.key),
          key: nextChild.key
        });
      }
    }
    currentChild ?? (currentChild = keyedHydration && hasVNodeKey(nextChild) ? void 0 : keyedHydration ? takeUnkeyedExisting() : existingChildren[index]);
    if (currentChild) {
      usedExisting.add(currentChild);
    }
    nextDomChildren.push(
      currentChild ? hydrateDomNode(
        currentChild,
        nextChild,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue,
        childHydrationContext(hydration, index)
      ) : createDomNode(
        nextChild,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      )
    );
  }
  for (const existingChild of allExistingChildren) {
    if (!usedExisting.has(existingChild)) {
      if (!isIgnorableHydrationNode(existingChild)) {
        reportHydrationMismatch(hydration, {
          kind: "extra_node",
          actual: getDomHydrationLabel(existingChild)
        });
      }
      disposeDomNode(existingChild, eventStore, portalStore, liveTextStore);
    }
  }
  reorderChildren(
    element,
    nextDomChildren,
    (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
    {
      currentChildren: allExistingChildren
    }
  );
  return element;
};
var createDomRenderer = (options, equalsValue) => {
  const documentLike = getDomDocument(options);
  const eventStore = /* @__PURE__ */ new Map();
  const portalStore = /* @__PURE__ */ new WeakMap();
  const liveTextStore = /* @__PURE__ */ new WeakMap();
  let currentDom = null;
  let currentVNode = null;
  return {
    mount(node, container) {
      const domContainer = container;
      const domNode = createDomNode(
        node,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      );
      replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
      currentDom = domNode;
      currentVNode = node;
    },
    patch(prev, next, container) {
      const domContainer = container;
      if (!currentDom || !currentVNode || !prev) {
        const domNode = createDomNode(
          next,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = next;
        return;
      }
      const nextDom = patchDomNode(
        currentDom,
        prev,
        next,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue
      );
      if (nextDom !== currentDom) {
        reorderChildren(
          domContainer,
          [nextDom],
          (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
          {
            currentChildren: [currentDom]
          }
        );
      }
      currentDom = nextDom;
      currentVNode = next;
    },
    hydrate(node, container) {
      const domContainer = container;
      const hydrationContext = {
        path: "root",
        onMismatch: options?.onHydrationMismatch,
        strict: options?.strictHydration === true
      };
      const existingChildren = readChildNodes(domContainer);
      const existing = findHydrationRootNode(existingChildren, node);
      if (!existing) {
        const domNode = createDomNode(
          node,
          documentLike,
          eventStore,
          portalStore,
          liveTextStore,
          equalsValue
        );
        replaceChildren(domContainer, [domNode], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = node;
        return;
      }
      const hydratedDom = hydrateDomNode(
        existing,
        node,
        documentLike,
        eventStore,
        portalStore,
        liveTextStore,
        equalsValue,
        hydrationContext
      );
      for (const child of existingChildren) {
        if (child === existing || !isIgnorableHydrationNode(child)) continue;
        disposeDomNode(child, eventStore, portalStore, liveTextStore);
        domContainer.removeChild(child);
      }
      if (hydratedDom !== existing) {
        reorderChildren(
          domContainer,
          [hydratedDom],
          (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore),
          {
            currentChildren: [existing]
          }
        );
      }
      currentDom = hydratedDom;
      currentVNode = node;
    },
    unmount(container) {
      const domContainer = container;
      replaceChildren(domContainer, [], eventStore, portalStore, liveTextStore);
      currentDom = null;
      currentVNode = null;
      eventStore.clear();
    }
  };
};

// src/runtime/render-core.ts
var RenderRoot = class {
  constructor(renderer, container) {
    this.renderer = renderer;
    this.container = container;
    this.current = null;
  }
  mount(node) {
    this.current = node;
    this.renderer.mount(node, this.container);
  }
  hydrate(node) {
    this.current = node;
    if (typeof this.renderer.hydrate === "function") {
      this.renderer.hydrate(node, this.container);
      return;
    }
    this.renderer.mount(node, this.container);
  }
  update(node) {
    if (!this.current) {
      this.mount(node);
      return;
    }
    if (typeof this.renderer.patch === "function") {
      this.renderer.patch(this.current, node, this.container);
    } else {
      this.renderer.mount(node, this.container);
    }
    this.current = node;
  }
  unmount() {
    if (typeof this.renderer.unmount === "function") {
      this.renderer.unmount(this.container);
    }
    this.current = null;
  }
  currentNode() {
    return this.current;
  }
};
var ReactiveRenderRoot = class {
  constructor(root, effect, frameManager, hooks) {
    this.root = root;
    this.effect = effect;
    this.frameManager = frameManager;
    this.hooks = hooks;
    this.hooks?.onInit?.(this);
  }
  dispose() {
    this.hooks?.onDispose?.(this);
    this.effect.dispose();
    this.frameManager.disposeFrame(this.frameManager.rootFrame, false);
    this.root.unmount();
  }
};
var isDisposableLike = (value) => !!value && typeof value === "object" && typeof value.dispose === "function";
var isUnmountableLike = (value) => !!value && typeof value === "object" && typeof value.unmount === "function";
var coerceRenderer = (candidate) => {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Renderer must be an object with a mount function");
  }
  const renderer = candidate;
  if (typeof renderer.mount !== "function") {
    throw new Error("Renderer.mount must be a function");
  }
  if (renderer.patch && typeof renderer.patch !== "function") {
    throw new Error("Renderer.patch must be a function when provided");
  }
  if (renderer.unmount && typeof renderer.unmount !== "function") {
    throw new Error("Renderer.unmount must be a function when provided");
  }
  return renderer;
};
var runWithFrameManager = (frameManager, getActiveManager, setActiveManager, renderView) => {
  frameManager.beginRender();
  frameManager.rootFrame.seenEpoch = frameManager.renderEpoch;
  const previousManager = getActiveManager();
  setActiveManager(frameManager);
  try {
    return frameManager.renderFrame(frameManager.rootFrame, renderView);
  } finally {
    setActiveManager(previousManager);
  }
};

// src/runtime/frame-runtime.ts
var createFrameRuntime = (options) => {
  let activeFrameManager = null;
  const runWithFrameManager3 = (frameManager, renderView) => runWithFrameManager(
    frameManager,
    () => activeFrameManager,
    (next) => {
      activeFrameManager = next;
    },
    renderView
  );
  const requireActiveFrameManager = (apiName) => {
    if (!activeFrameManager) {
      throw new Error(`${apiName} can only be used while rendering inside mount_reactive`);
    }
    return activeFrameManager;
  };
  return {
    runWithFrameManager: runWithFrameManager3,
    requireActiveFrameManager,
    component: (componentFn, props, key2) => {
      const frameManager = requireActiveFrameManager("render.component");
      const parentFrame = frameManager.currentFrame ?? frameManager.rootFrame;
      const { result } = frameManager.executeComponent(parentFrame, componentFn, key2 ?? null, props);
      return options.coerceRenderable(result);
    },
    createContext: (defaultValue) => createContextToken(defaultValue),
    createRequiredContext: () => createContextToken(),
    withContext: (context, value, renderChildren) => {
      const frameManager = requireActiveFrameManager("render.with_context");
      return options.coerceRenderable(frameManager.withContext(context, value, renderChildren));
    },
    useContext: (context) => {
      const frameManager = requireActiveFrameManager("render.use_context");
      return frameManager.useContext(context);
    },
    state: (initial) => {
      const frameManager = requireActiveFrameManager("render.state");
      return frameManager.getSlot("state", () => options.createState(initial));
    },
    remember: (compute) => {
      const frameManager = requireActiveFrameManager("render.remember");
      return frameManager.getSlot("memo", compute);
    }
  };
};

// src/runtime/props-core.ts
var isEventProp2 = (name) => /^on[A-Z]/.test(name);
var mergeClassValues = (left, right) => {
  const tokens = [left, right].flatMap((value) => typeof value === "string" ? value.split(/\s+/) : []).map((token) => token.trim()).filter((token) => token.length > 0);
  if (tokens.length === 0) return right ?? left;
  return Array.from(new Set(tokens)).join(" ");
};
var mergeStyleValues = (left, right) => {
  if (typeof left === "string" && typeof right === "string") {
    const parts = [left, right].map((value) => value.trim()).filter((value) => value.length > 0);
    return parts.join(parts.length > 1 ? ";" : "");
  }
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    return {
      ...left,
      ...right
    };
  }
  return right ?? left;
};
var preventDefaultIfNeeded = (args) => {
  const event = args[0];
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
};
var composeHandlers = (left, right) => {
  if (typeof left !== "function") return typeof right === "function" ? right : void 0;
  if (typeof right !== "function") return left;
  return (...args) => {
    const leftResult = left(...args);
    if (leftResult === false) {
      preventDefaultIfNeeded(args);
    }
    const rightResult = right(...args);
    if (rightResult === false) {
      preventDefaultIfNeeded(args);
    }
    return rightResult === void 0 ? leftResult : rightResult;
  };
};
var mergePropValue = (name, left, right) => {
  if (right === void 0) return left;
  if (left === void 0) return right;
  if (name === "class" || name === "className") {
    return mergeClassValues(left, right);
  }
  if (name === "style") {
    return mergeStyleValues(left, right);
  }
  if (isEventProp2(name) && typeof left === "function" && typeof right === "function") {
    return composeHandlers(
      left,
      right
    );
  }
  return right;
};
var mergeProps = (left, right) => {
  const lhs = left && typeof left === "object" ? left : {};
  const rhs = right && typeof right === "object" ? right : {};
  const merged = {};
  for (const key2 of /* @__PURE__ */ new Set([...Object.keys(lhs), ...Object.keys(rhs)])) {
    const value = mergePropValue(key2, lhs[key2], rhs[key2]);
    if (value !== void 0) {
      merged[key2] = value;
    }
  }
  return merged;
};
var normalizeAuthoringPropName = (name) => {
  if (name === "class") return "className";
  if (name.startsWith("data_")) return `data-${name.slice(5).replace(/_/g, "-")}`;
  if (name.startsWith("aria_")) return `aria-${name.slice(5).replace(/_/g, "-")}`;
  if (name.startsWith("on_")) {
    const eventName = name.slice(3).replace(/_([a-zA-Z0-9])/g, (_match, ch) => ch.toUpperCase());
    return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
  }
  return name.replace(/_([a-zA-Z0-9])/g, (_match, ch) => ch.toUpperCase());
};
var propsAttr = (name, value) => ({
  [normalizeAuthoringPropName(name)]: value
});
var propsWhen = (condition, props) => {
  const resolved = condition instanceof Signal ? condition.get() : condition;
  return resolved ? mergeProps({}, props) : {};
};
var propsEmpty = () => ({});
var propsClass = (className) => ({ className });
var propsId = (id) => ({ id });
var propsStyle = (style) => ({ style });
var propsValue = (value) => ({ value });
var propsChecked = (checked) => ({ checked });
var propsType = (type) => ({ type });
var propsName = (name) => ({ name });
var propsPlaceholder = (placeholder) => ({ placeholder });
var propsHref = (href) => ({ href });
var propsDisabled = (disabled) => ({ disabled });
var propsKey = (key2) => {
  if (typeof key2 !== "string" && typeof key2 !== "number") {
    throw new Error("props_key key must be a string or number");
  }
  return { key: key2 };
};
var propsOnClick = (handler) => ({
  onClick: (event) => {
    if (typeof handler !== "function") return void 0;
    const outcome = handler();
    if (outcome === false && event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    return outcome;
  }
});
var propsOnClickDelta = (signal, delta) => ({
  onClick: () => {
    signal.set(signal.get() + delta);
  }
});
var propsOnClickInc = (signal) => ({
  onClick: () => {
    signal.set(signal.get() + 1);
  }
});
var propsOnClickDec = (signal) => ({
  onClick: () => {
    signal.set(signal.get() - 1);
  }
});
var propsOnInput = (handler) => ({
  onInput: (event) => handler(event.target?.value ?? "")
});
var propsOnChange = (handler) => ({
  onChange: (event) => handler(event.target?.value ?? "")
});
var propsOnCheckedChange = (handler) => ({
  onChange: (event) => handler(!!event.target?.checked)
});
var propsOnSubmit = (handler) => ({
  onSubmit: (event) => {
    event?.preventDefault?.();
    if (typeof handler !== "function") return void 0;
    const outcome = handler();
    if (outcome && (typeof outcome === "object" || typeof outcome === "function") && typeof outcome.then === "function") {
      outcome.then(void 0, () => void 0);
    }
    return outcome;
  }
});

// src/runtime/headless-primitives-runtime.ts
var getTextLabel = (input) => {
  const parts = [];
  for (const child of normalizeVNodeChildren(input)) {
    if (child.kind === "text" && child.text) {
      parts.push(child.text);
      continue;
    }
    if (child.children && child.children.length > 0) {
      const nested = getTextLabel(child.children);
      if (nested) {
        parts.push(nested);
      }
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
};
var createHeadlessPrimitivesRuntime = (options) => {
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
    getMenuActiveValue,
    setMenuActiveValue,
    getMenuNavigationTarget,
    getMenuTypeaheadTarget,
    getRadioNavigationTarget,
    getSelectNavigationTarget,
    getSelectTypeaheadTarget,
    getComboboxNavigationTarget,
    getMultiselectNavigationTarget,
    getMultiselectTypeaheadTarget,
    getSelectActiveValue,
    getSelectActiveDescendantId,
    setSelectActiveValue,
    acceptSelectActiveValue,
    getComboboxActiveValue,
    getComboboxActiveDescendantId,
    setComboboxActiveValue,
    acceptComboboxActiveValue,
    getMultiselectActiveValue,
    setMultiselectActiveValue,
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
    getPopoverContentStyle
  } = options.headlessUi;
  const resolveMultiselectOpenActiveValue = (ctx) => readStringSelection(ctx.values.get()).find((entry) => ctx.order.includes(entry)) ?? ctx.order[0] ?? "";
  const api = {
    tabs_root: (value, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          tabsContext,
          { value, baseId: getTabsBaseId(value), order: [] },
          renderChildren
        )
      );
    },
    tabs_list: (props, renderChildren) => vnodeElement(
      "div",
      mergeProps({ role: "tablist", "data-lumina-tabs-list": "true" }, props),
      resolveChildrenInput(renderChildren)
    ),
    tabs_trigger: (value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_trigger");
      const ctx = frameManager.useContext(tabsContext);
      registerTabsValue(ctx, value);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement(
        "button",
        mergeProps(
          {
            role: "tab",
            type: "button",
            id: triggerId,
            "aria-controls": panelId,
            "aria-selected": selected ? "true" : "false",
            tabIndex: selected ? 0 : -1,
            "data-state": selected ? "active" : "inactive",
            onClick: () => ctx.value.set(value),
            onKeyDown: (event) => {
              const nextValue = getTabsNavigationTarget(ctx, value, String(event?.key ?? ""));
              if (!nextValue) return void 0;
              event?.preventDefault?.();
              ctx.value.set(nextValue);
              return false;
            }
          },
          props
        ),
        children2
      );
    },
    tabs_panel: (value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_panel");
      const ctx = frameManager.useContext(tabsContext);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "tabpanel",
            id: panelId,
            "aria-labelledby": triggerId,
            hidden: !selected,
            tabIndex: selected ? 0 : -1,
            "data-state": selected ? "active" : "inactive"
          },
          props
        ),
        children2
      );
    },
    dialog_root: (open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          dialogContext,
          { open, baseId: getDialogBaseId(open), hasTitle: false, hasDescription: false },
          renderChildren
        )
      );
    },
    dialog_portal: (children2 = []) => vnodePortal(null, children2),
    dialog_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_trigger");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getDialogIds(ctx);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            "aria-haspopup": "dialog",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": contentId,
            "data-state": open ? "open" : "closed",
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setDialogRestoreTarget(ctx, target);
              }
              ctx.open.set(true);
            }
          },
          props
        ),
        children2
      );
    },
    dialog_overlay: (props) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_overlay");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      return vnodeElement(
        "div",
        mergeProps(
          {
            "data-lumina-dialog-overlay": "true",
            "data-state": open ? "open" : "closed",
            hidden: !open,
            onClick: () => {
              ctx.open.set(false);
              restoreDialogFocus(ctx);
            }
          },
          props
        ),
        []
      );
    },
    dialog_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_content");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { contentId, titleId, descriptionId } = getDialogIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "dialog",
            id: contentId,
            "aria-modal": "true",
            "aria-labelledby": ctx.hasTitle ? titleId : void 0,
            "aria-describedby": ctx.hasDescription ? descriptionId : void 0,
            autoFocus: open,
            hidden: !open,
            tabIndex: -1,
            "data-state": open ? "open" : "closed",
            onKeyDown: (event) => {
              if (trapDialogTabNavigation(event)) {
                return false;
              }
              if (String(event?.key ?? "") !== "Escape") return void 0;
              event?.preventDefault?.();
              ctx.open.set(false);
              restoreDialogFocus(ctx);
              return false;
            }
          },
          props
        ),
        children2
      );
    },
    dialog_title: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_title");
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasTitle = true;
      const { titleId } = getDialogIds(ctx);
      return vnodeElement(
        "h2",
        mergeProps(
          {
            id: titleId,
            "data-lumina-dialog-title": "true"
          },
          props
        ),
        children2
      );
    },
    dialog_description: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_description");
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasDescription = true;
      const { descriptionId } = getDialogIds(ctx);
      return vnodeElement(
        "p",
        mergeProps(
          {
            id: descriptionId,
            "data-lumina-dialog-description": "true"
          },
          props
        ),
        children2
      );
    },
    dialog_close: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_close");
      const ctx = frameManager.useContext(dialogContext);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            "data-lumina-dialog-close": "true",
            onClick: () => {
              ctx.open.set(false);
              restoreDialogFocus(ctx);
            }
          },
          props
        ),
        children2
      );
    },
    popover_root: (open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.popover_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          popoverContext,
          { open, baseId: getPopoverBaseId(open) },
          renderChildren
        )
      );
    },
    popover_portal: (children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_portal");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        "div",
        {
          "data-lumina-popover-dismiss": "true",
          "data-state": open ? "open" : "closed",
          hidden: !open,
          style: {
            position: "fixed",
            inset: "0",
            background: "transparent",
            zIndex: "1000"
          },
          onClick: () => {
            ctx.open.set(false);
            restorePopoverFocus(ctx);
          }
        },
        []
      );
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    },
    popover_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_trigger");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            "aria-haspopup": "dialog",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": contentId,
            "data-state": open ? "open" : "closed",
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setPopoverRestoreTarget(ctx, target);
                setPopoverAnchorTarget(ctx, target);
              }
              const nextOpen = !ctx.open.get();
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restorePopoverFocus(ctx);
              }
            }
          },
          props
        ),
        children2
      );
    },
    popover_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_content");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "dialog",
            id: contentId,
            "aria-modal": "false",
            "aria-labelledby": triggerId,
            autoFocus: open,
            hidden: !open,
            tabIndex: -1,
            "data-lumina-popover-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getPopoverAnchorRect(ctx), props),
            onKeyDown: (event) => {
              if (String(event?.key ?? "") !== "Escape") return void 0;
              event?.preventDefault?.();
              ctx.open.set(false);
              restorePopoverFocus(ctx);
              return false;
            }
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    tooltip_root: (open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          tooltipContext,
          { open, baseId: getTooltipBaseId(open) },
          renderChildren
        )
      );
    },
    tooltip_portal: (children2 = []) => vnodePortal(null, children2),
    tooltip_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_trigger");
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getTooltipIds(ctx);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            "aria-describedby": open ? contentId : void 0,
            "data-state": open ? "open" : "closed",
            onMouseEnter: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setTooltipAnchorTarget(ctx, target);
              }
              ctx.open.set(true);
            },
            onMouseLeave: () => {
              ctx.open.set(false);
            },
            onFocus: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setTooltipAnchorTarget(ctx, target);
              }
              ctx.open.set(true);
            },
            onBlur: () => {
              ctx.open.set(false);
            }
          },
          props
        ),
        children2
      );
    },
    tooltip_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_content");
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { contentId } = getTooltipIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "tooltip",
            id: contentId,
            hidden: !open,
            "data-lumina-tooltip-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getTooltipAnchorRect(ctx), props)
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    toast_root: (open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.toast_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          toastContext,
          { open, baseId: getToastBaseId(open), hasTitle: false, hasDescription: false },
          renderChildren
        )
      );
    },
    toast_portal: (children2 = []) => vnodePortal(null, children2),
    toast_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_content");
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
        "div",
        mergeProps(
          {
            role: "status",
            id: contentId,
            "aria-live": "polite",
            "aria-atomic": "true",
            "aria-labelledby": ctx.hasTitle ? titleId : void 0,
            "aria-describedby": ctx.hasDescription ? descriptionId : void 0,
            hidden: !open,
            tabIndex: 0,
            "data-lumina-toast-content": "true",
            "data-state": open ? "open" : "closed",
            style: {
              position: "fixed",
              top: "16px",
              right: "16px",
              zIndex: "1002"
            },
            onKeyDown: (event) => {
              if (String(event?.key ?? "") !== "Escape") return void 0;
              event?.preventDefault?.();
              clearToastTimer(ctx.open);
              ctx.open.set(false);
              return false;
            }
          },
          omitToastControlProps(props)
        ),
        children2
      );
    },
    toast_title: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_title");
      const ctx = frameManager.useContext(toastContext);
      ctx.hasTitle = true;
      const { titleId } = getToastIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            id: titleId,
            "data-lumina-toast-title": "true"
          },
          props
        ),
        children2
      );
    },
    toast_description: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_description");
      const ctx = frameManager.useContext(toastContext);
      ctx.hasDescription = true;
      const { descriptionId } = getToastIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            id: descriptionId,
            "data-lumina-toast-description": "true"
          },
          props
        ),
        children2
      );
    },
    toast_close: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_close");
      const ctx = frameManager.useContext(toastContext);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            "data-lumina-toast-close": "true",
            onClick: () => {
              clearToastTimer(ctx.open);
              ctx.open.set(false);
            }
          },
          props
        ),
        children2
      );
    },
    menu_root: (open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.menu_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          menuContext,
          { open, baseId: getMenuBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    menu_portal: (children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_portal");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        "div",
        {
          "data-lumina-menu-dismiss": "true",
          "data-state": open ? "open" : "closed",
          hidden: !open,
          style: {
            position: "fixed",
            inset: "0",
            background: "transparent",
            zIndex: "1000"
          },
          onClick: () => {
            closeMenu(ctx);
          }
        },
        []
      );
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    },
    menu_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_trigger");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            "aria-haspopup": "menu",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": contentId,
            "data-state": open ? "open" : "closed",
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setMenuRestoreTarget(ctx, target);
                setMenuAnchorTarget(ctx, target);
              }
              const nextOpen = !ctx.open.get();
              if (nextOpen) {
                setMenuActiveValue(ctx, "");
              }
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restoreMenuFocus(ctx);
              }
            },
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              const target = getFocusTargetFromEvent(event);
              if (key2 !== "Enter" && key2 !== " " && key2 !== "ArrowDown" && key2 !== "ArrowUp") {
                return void 0;
              }
              event?.preventDefault?.();
              if (target) {
                setMenuRestoreTarget(ctx, target);
                setMenuAnchorTarget(ctx, target);
              }
              setMenuActiveValue(
                ctx,
                key2 === "ArrowUp" ? ctx.order[ctx.order.length - 1] ?? "" : ""
              );
              ctx.open.set(true);
              return false;
            }
          },
          props
        ),
        children2
      );
    },
    menu_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_content");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "menu",
            id: contentId,
            "aria-labelledby": triggerId,
            hidden: !open,
            tabIndex: -1,
            autoFocus: open,
            "data-lumina-menu-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getMenuAnchorRect(ctx), props),
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeMenu(ctx);
                return false;
              }
              if (key2 === "Tab") {
                setMenuActiveValue(ctx, "");
                ctx.open.set(false);
                return void 0;
              }
              if (key2 === "ArrowDown" || key2 === "Home") {
                event?.preventDefault?.();
                setMenuActiveValue(ctx, ctx.order[0] ?? "");
                focusMenuItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  ctx.order[0] ?? ""
                );
                return false;
              }
              if (key2 === "ArrowUp" || key2 === "End") {
                event?.preventDefault?.();
                setMenuActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? "");
                focusMenuItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  ctx.order[ctx.order.length - 1] ?? ""
                );
                return false;
              }
              const typeaheadTarget = getMenuTypeaheadTarget(ctx, getMenuActiveValue(ctx), key2);
              if (!typeaheadTarget) {
                return void 0;
              }
              event?.preventDefault?.();
              setMenuActiveValue(ctx, typeaheadTarget);
              focusMenuItem(
                getFocusTargetFromEvent(event)?.ownerDocument,
                ctx,
                typeaheadTarget
              );
              return false;
            }
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    menu_item: (value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_item");
      const ctx = frameManager.useContext(menuContext);
      registerMenuValue(ctx, value, getTextLabel(children2));
      const open = ctx.open.get();
      const active = getMenuActiveValue(ctx);
      const itemId = getMenuItemId(ctx, value);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: itemId,
            role: "menuitem",
            hidden: !open,
            tabIndex: open && active === value ? 0 : -1,
            autoFocus: open && active === value,
            "data-lumina-menu-item": "true",
            "data-state": open ? "open" : "closed",
            onClick: () => {
              closeMenu(ctx);
            },
            onMouseEnter: () => {
              setMenuActiveValue(ctx, value);
            },
            onFocus: () => {
              setMenuActiveValue(ctx, value);
            },
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeMenu(ctx);
                return false;
              }
              if (key2 === "Tab") {
                setMenuActiveValue(ctx, "");
                ctx.open.set(false);
                return void 0;
              }
              if (key2 === "Enter" || key2 === " ") {
                event?.preventDefault?.();
                const click = props?.onClick;
                if (typeof click === "function") {
                  click(event);
                }
                closeMenu(ctx);
                return false;
              }
              const nextValue = getMenuNavigationTarget(ctx, value, key2);
              if (nextValue) {
                event?.preventDefault?.();
                setMenuActiveValue(ctx, nextValue);
                focusMenuItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  nextValue
                );
                return false;
              }
              const typeaheadTarget = getMenuTypeaheadTarget(ctx, value, key2);
              if (!typeaheadTarget) return void 0;
              event?.preventDefault?.();
              setMenuActiveValue(ctx, typeaheadTarget);
              focusMenuItem(
                getFocusTargetFromEvent(event)?.ownerDocument,
                ctx,
                typeaheadTarget
              );
              return false;
            }
          },
          props
        ),
        children2
      );
    },
    select_root: (open, value, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.select_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          selectContext,
          { open, value, baseId: getSelectBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    select_portal: (children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_portal");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        "div",
        {
          "data-lumina-select-dismiss": "true",
          "data-state": open ? "open" : "closed",
          hidden: !open,
          style: {
            position: "fixed",
            inset: "0",
            background: "transparent",
            zIndex: "1000"
          },
          onClick: () => {
            closeSelect(ctx);
          }
        },
        []
      );
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    },
    select_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_trigger");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      const activeDescendantId = open ? getSelectActiveDescendantId(ctx) : null;
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            role: "combobox",
            "aria-haspopup": "listbox",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": open ? contentId : void 0,
            "aria-activedescendant": activeDescendantId ?? void 0,
            "data-state": open ? "open" : "closed",
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setSelectRestoreTarget(ctx, target);
                setSelectAnchorTarget(ctx, target);
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
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              const openNow = ctx.open.get();
              const currentValue = ctx.value.get();
              const currentActive = getSelectActiveValue(ctx);
              if (key2 === "Escape" && openNow) {
                event?.preventDefault?.();
                closeSelect(ctx);
                return false;
              }
              if (!openNow) {
                if (key2 === "ArrowDown" || key2 === "Enter" || key2 === " ") {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, currentValue);
                  ctx.open.set(true);
                  return false;
                }
                if (key2 === "ArrowUp" || key2 === "Home") {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, ctx.order[0] ?? currentValue);
                  ctx.open.set(true);
                  return false;
                }
                if (key2 === "End") {
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentValue);
                  ctx.open.set(true);
                  return false;
                }
                const typeaheadTarget2 = getSelectTypeaheadTarget(ctx, currentValue, key2);
                if (!typeaheadTarget2) {
                  return void 0;
                }
                event?.preventDefault?.();
                setSelectActiveValue(ctx, typeaheadTarget2);
                ctx.open.set(true);
                return false;
              }
              if (key2 === "Enter" || key2 === " " || key2 === "Tab") {
                if (key2 !== "Tab") {
                  event?.preventDefault?.();
                }
                acceptSelectActiveValue(ctx);
                setSelectActiveValue(ctx, ctx.value.get());
                ctx.open.set(false);
                return key2 === "Tab" ? void 0 : false;
              }
              if (key2 === "Home") {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[0] ?? currentActive);
                return false;
              }
              if (key2 === "End") {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentActive);
                return false;
              }
              const typeaheadTarget = getSelectTypeaheadTarget(ctx, currentActive, key2);
              if (typeaheadTarget) {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, typeaheadTarget);
                return false;
              }
              const nextValue = getSelectNavigationTarget(ctx, currentActive, key2);
              if (!nextValue) return void 0;
              event?.preventDefault?.();
              setSelectActiveValue(ctx, nextValue);
              return false;
            }
          },
          props
        ),
        children2
      );
    },
    select_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_content");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "listbox",
            id: contentId,
            "aria-labelledby": triggerId,
            hidden: !open,
            "data-lumina-select-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getSelectAnchorRect(ctx), props),
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              const currentActive = getSelectActiveValue(ctx);
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeSelect(ctx);
                return false;
              }
              if (key2 === "ArrowDown" || key2 === "ArrowRight") {
                event?.preventDefault?.();
                setSelectActiveValue(
                  ctx,
                  getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key2)
                );
                return false;
              }
              if (key2 === "ArrowUp" || key2 === "ArrowLeft") {
                event?.preventDefault?.();
                setSelectActiveValue(
                  ctx,
                  getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key2)
                );
                return false;
              }
              if (key2 === "Home") {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[0] ?? currentActive);
                return false;
              }
              if (key2 === "End") {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentActive);
                return false;
              }
              if (key2 === "Enter" || key2 === " " || key2 === "Tab") {
                if (key2 !== "Tab") {
                  event?.preventDefault?.();
                }
                acceptSelectActiveValue(ctx);
                setSelectActiveValue(ctx, ctx.value.get());
                ctx.open.set(false);
                return key2 === "Tab" ? void 0 : false;
              }
              const typeaheadTarget = getSelectTypeaheadTarget(ctx, currentActive, key2);
              if (typeaheadTarget) {
                event?.preventDefault?.();
                setSelectActiveValue(ctx, typeaheadTarget);
                return false;
              }
              return void 0;
            }
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    select_item: (value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.select_item");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const currentValue = ctx.value.get();
      const activeValue = getSelectActiveValue(ctx);
      const selected = currentValue === value;
      const active = open && activeValue === value;
      const itemId = getSelectItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(selectItemContext, { value, itemId, selected }, () => {
          const resolvedChildren = resolveChildrenInput(renderChildren);
          registerSelectValue(ctx, value, getTextLabel(resolvedChildren));
          return vnodeElement(
            "button",
            mergeProps(
              {
                type: "button",
                id: itemId,
                role: "option",
                hidden: !open,
                tabIndex: -1,
                "aria-selected": selected ? "true" : "false",
                "data-lumina-select-item": "true",
                "data-active": active ? "true" : "false",
                "data-state": selected ? "checked" : "unchecked",
                onClick: () => {
                  setSelectActiveValue(ctx, value);
                  acceptSelectActiveValue(ctx);
                  closeSelect(ctx);
                },
                onMouseEnter: () => {
                  setSelectActiveValue(ctx, value);
                },
                onKeyDown: (event) => {
                  const key2 = String(event?.key ?? "");
                  if (key2 === "Escape") {
                    event?.preventDefault?.();
                    closeSelect(ctx);
                    return false;
                  }
                  if (key2 === "Enter" || key2 === " " || key2 === "Tab") {
                    if (key2 !== "Tab") {
                      event?.preventDefault?.();
                    }
                    setSelectActiveValue(ctx, value);
                    acceptSelectActiveValue(ctx);
                    setSelectActiveValue(ctx, ctx.value.get());
                    ctx.open.set(false);
                    return key2 === "Tab" ? void 0 : false;
                  }
                  const nextValue = getSelectNavigationTarget(ctx, value, key2);
                  if (!nextValue) return void 0;
                  event?.preventDefault?.();
                  setSelectActiveValue(ctx, nextValue);
                  restoreSelectFocus(ctx);
                  return false;
                }
              },
              props
            ),
            resolvedChildren
          );
        })
      );
    },
    select_indicator: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_indicator");
      const ctx = frameManager.useContext(selectItemContext);
      return vnodeElement(
        "span",
        mergeProps(
          {
            id: getSelectIndicatorId(ctx.itemId),
            "aria-hidden": "true",
            hidden: !ctx.selected,
            "data-lumina-select-indicator": "true",
            "data-state": ctx.selected ? "checked" : "unchecked"
          },
          props
        ),
        children2
      );
    },
    combobox_root: (open, value, query2, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          comboboxContext,
          { open, value, query: query2, baseId: getComboboxBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    combobox_portal: (children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_portal");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        "div",
        {
          "data-lumina-combobox-dismiss": "true",
          "data-state": open ? "open" : "closed",
          hidden: !open,
          style: {
            position: "fixed",
            inset: "0",
            background: "transparent",
            zIndex: "1000"
          },
          onClick: () => {
            closeCombobox(ctx);
          }
        },
        []
      );
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    },
    combobox_input: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_input");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      const activeDescendantId = open ? getComboboxActiveDescendantId(ctx) : null;
      return vnodeElement(
        "input",
        mergeProps(
          {
            type: "text",
            id: inputId,
            role: "combobox",
            value: ctx.query.get(),
            "aria-autocomplete": "list",
            "aria-haspopup": "listbox",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": contentId,
            "aria-activedescendant": activeDescendantId ?? void 0,
            "data-state": open ? "open" : "closed",
            onInput: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setComboboxRestoreTarget(ctx, target);
                setComboboxAnchorTarget(ctx, target);
              }
              const nextQuery = String(
                event?.target?.value ?? ""
              );
              ctx.query.set(nextQuery);
              setComboboxActiveValue(ctx, "");
              ctx.open.set(true);
            },
            onFocus: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (!target) return void 0;
              setComboboxRestoreTarget(ctx, target);
              setComboboxAnchorTarget(ctx, target);
              setComboboxActiveValue(ctx, ctx.value.get());
              ctx.open.set(true);
              return void 0;
            },
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (!target) return void 0;
              setComboboxRestoreTarget(ctx, target);
              setComboboxAnchorTarget(ctx, target);
              setComboboxActiveValue(ctx, ctx.value.get());
              ctx.open.set(true);
              return void 0;
            },
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeCombobox(ctx);
                return false;
              }
              if (key2 === "Enter") {
                event?.preventDefault?.();
                acceptComboboxActiveValue(ctx);
                closeCombobox(ctx);
                return false;
              }
              if (key2 === "ArrowDown" || key2 === "ArrowUp") {
                event?.preventDefault?.();
                ctx.open.set(true);
                const currentValue = getComboboxActiveValue(ctx);
                const nextValue = key2 === "ArrowDown" ? getComboboxNavigationTarget(
                  ctx,
                  currentValue,
                  currentValue ? "ArrowDown" : "Home"
                ) : getComboboxNavigationTarget(
                  ctx,
                  currentValue,
                  currentValue ? "ArrowUp" : "End"
                );
                if (nextValue) {
                  setComboboxActiveValue(ctx, nextValue);
                }
                return false;
              }
              return void 0;
            }
          },
          props
        ),
        children2
      );
    },
    combobox_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_content");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "listbox",
            id: contentId,
            "aria-labelledby": inputId,
            hidden: !open,
            tabIndex: -1,
            "data-lumina-combobox-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getComboboxAnchorRect(ctx), props),
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeCombobox(ctx);
                return false;
              }
              if (key2 === "Enter") {
                event?.preventDefault?.();
                acceptComboboxActiveValue(ctx);
                closeCombobox(ctx);
                return false;
              }
              if (key2 === "ArrowDown" || key2 === "ArrowUp" || key2 === "Home" || key2 === "End") {
                event?.preventDefault?.();
                const currentValue = getComboboxActiveValue(ctx);
                const nextValue = getComboboxNavigationTarget(
                  ctx,
                  currentValue,
                  key2 === "ArrowDown" || key2 === "ArrowUp" ? key2 : key2
                );
                if (nextValue) {
                  setComboboxActiveValue(ctx, nextValue);
                }
                restoreComboboxFocus(ctx);
                return false;
              }
              return void 0;
            }
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    combobox_item: (value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_item");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const query2 = ctx.query.get().trim().toLowerCase();
      const matchesQuery = query2.length === 0 || value.toLowerCase().includes(query2);
      if (matchesQuery) {
        registerComboboxValue(ctx, value);
      }
      const currentValue = ctx.value.get();
      const selected = currentValue === value;
      const active = getComboboxActiveValue(ctx) === value;
      const itemId = getComboboxItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(
          comboboxItemContext,
          { value, itemId, selected, active },
          () => vnodeElement(
            "div",
            mergeProps(
              {
                id: itemId,
                role: "option",
                hidden: !open || !matchesQuery,
                tabIndex: -1,
                "aria-selected": active ? "true" : "false",
                "data-lumina-combobox-item": "true",
                "data-state": selected ? "checked" : "unchecked",
                "data-active": active ? "true" : "false",
                onMouseDown: (event) => {
                  event?.preventDefault?.();
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
                onKeyDown: (event) => {
                  const key2 = String(event?.key ?? "");
                  if (key2 === "Escape") {
                    event?.preventDefault?.();
                    closeCombobox(ctx);
                    return false;
                  }
                  if (key2 === "Enter" || key2 === " ") {
                    event?.preventDefault?.();
                    ctx.value.set(value);
                    ctx.query.set(value);
                    setComboboxActiveValue(ctx, value);
                    closeCombobox(ctx);
                    return false;
                  }
                  const nextValue = getComboboxNavigationTarget(ctx, value, key2);
                  if (!nextValue) return void 0;
                  event?.preventDefault?.();
                  setComboboxActiveValue(ctx, nextValue);
                  restoreComboboxFocus(ctx);
                  return false;
                }
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    combobox_indicator: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_indicator");
      const ctx = frameManager.useContext(comboboxItemContext);
      return vnodeElement(
        "span",
        mergeProps(
          {
            id: getComboboxIndicatorId(ctx.itemId),
            "aria-hidden": "true",
            hidden: !ctx.active,
            "data-lumina-combobox-indicator": "true",
            "data-state": ctx.active ? "checked" : "unchecked"
          },
          props
        ),
        children2
      );
    },
    multiselect_root: (open, values, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          multiselectContext,
          { open, values, baseId: getMultiselectBaseId(open), order: [] },
          renderChildren
        )
      );
    },
    multiselect_portal: (children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_portal");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement(
        "div",
        {
          "data-lumina-multiselect-dismiss": "true",
          "data-state": open ? "open" : "closed",
          hidden: !open,
          style: {
            position: "fixed",
            inset: "0",
            background: "transparent",
            zIndex: "1000"
          },
          onClick: () => {
            closeMultiselect(ctx);
          }
        },
        []
      );
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    },
    multiselect_trigger: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_trigger");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement(
        "button",
        mergeProps(
          {
            type: "button",
            id: triggerId,
            "aria-haspopup": "listbox",
            "aria-expanded": open ? "true" : "false",
            "aria-controls": contentId,
            "data-state": open ? "open" : "closed",
            onClick: (event) => {
              const target = getFocusTargetFromEvent(event);
              if (target) {
                setMultiselectRestoreTarget(ctx, target);
                setMultiselectAnchorTarget(ctx, target);
              }
              const nextOpen = !ctx.open.get();
              if (nextOpen) {
                setMultiselectActiveValue(ctx, resolveMultiselectOpenActiveValue(ctx));
              }
              ctx.open.set(nextOpen);
              if (!nextOpen) {
                restoreMultiselectFocus(ctx);
              }
            },
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              const target = getFocusTargetFromEvent(event);
              const openWithValue = (nextValue) => {
                event?.preventDefault?.();
                if (target) {
                  setMultiselectRestoreTarget(ctx, target);
                  setMultiselectAnchorTarget(ctx, target);
                }
                setMultiselectActiveValue(ctx, nextValue);
                ctx.open.set(true);
                return false;
              };
              const initialValue = resolveMultiselectOpenActiveValue(ctx);
              if (key2 === "Enter" || key2 === " " || key2 === "ArrowDown") {
                return openWithValue(initialValue);
              }
              if (key2 === "ArrowUp" || key2 === "End") {
                return openWithValue(ctx.order[ctx.order.length - 1] ?? initialValue);
              }
              if (key2 === "Home") {
                return openWithValue(ctx.order[0] ?? initialValue);
              }
              const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, initialValue, key2);
              if (!typeaheadTarget) {
                return void 0;
              }
              return openWithValue(typeaheadTarget);
            }
          },
          props
        ),
        children2
      );
    },
    multiselect_content: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_content");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement(
        "div",
        mergeProps(
          {
            role: "listbox",
            id: contentId,
            "aria-labelledby": triggerId,
            "aria-multiselectable": "true",
            hidden: !open,
            tabIndex: -1,
            autoFocus: open,
            "data-lumina-multiselect-content": "true",
            "data-state": open ? "open" : "closed",
            "data-side": pickPopoverSide(props),
            style: getPopoverContentStyle(getMultiselectAnchorRect(ctx), props),
            onKeyDown: (event) => {
              const key2 = String(event?.key ?? "");
              if (key2 === "Escape") {
                event?.preventDefault?.();
                closeMultiselect(ctx);
                return false;
              }
              if (key2 === "Tab") {
                ctx.open.set(false);
                return void 0;
              }
              const activeValue = getMultiselectActiveValue(ctx);
              if (key2 === "Enter" || key2 === " ") {
                if (!activeValue) {
                  return void 0;
                }
                event?.preventDefault?.();
                setMultiselectActiveValue(ctx, activeValue);
                toggleMultiselectValue(ctx, activeValue);
                focusMultiselectItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  activeValue,
                  getFocusTargetFromEvent(event)
                );
                return false;
              }
              if (key2 === "ArrowDown" || key2 === "Home") {
                event?.preventDefault?.();
                const targetValue = key2 === "Home" ? ctx.order[0] ?? activeValue : getMultiselectNavigationTarget(ctx, activeValue, key2) ?? activeValue;
                setMultiselectActiveValue(ctx, targetValue);
                focusMultiselectItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  targetValue,
                  getFocusTargetFromEvent(event)
                );
                return false;
              }
              if (key2 === "ArrowUp" || key2 === "End") {
                event?.preventDefault?.();
                const targetValue = key2 === "End" ? ctx.order[ctx.order.length - 1] ?? activeValue : getMultiselectNavigationTarget(ctx, activeValue, key2) ?? activeValue;
                setMultiselectActiveValue(ctx, targetValue);
                focusMultiselectItem(
                  getFocusTargetFromEvent(event)?.ownerDocument,
                  ctx,
                  targetValue,
                  getFocusTargetFromEvent(event)
                );
                return false;
              }
              const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, activeValue, key2);
              if (!typeaheadTarget) {
                return void 0;
              }
              event?.preventDefault?.();
              setMultiselectActiveValue(ctx, typeaheadTarget);
              focusMultiselectItem(
                getFocusTargetFromEvent(event)?.ownerDocument,
                ctx,
                typeaheadTarget,
                getFocusTargetFromEvent(event)
              );
              return false;
            }
          },
          omitPopoverLayoutProps(props)
        ),
        children2
      );
    },
    multiselect_item: (value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_item");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const selectedValues = readStringSelection(ctx.values.get());
      const selected = selectedValues.includes(value);
      const itemId = getMultiselectItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(multiselectItemContext, { value, itemId, selected }, () => {
          const resolvedChildren = resolveChildrenInput(renderChildren);
          registerMultiselectValue(ctx, value, getTextLabel(resolvedChildren));
          const active = getMultiselectActiveValue(ctx);
          const shouldAutoFocus = open && active === value;
          return vnodeElement(
            "button",
            mergeProps(
              {
                type: "button",
                id: itemId,
                role: "option",
                hidden: !open,
                tabIndex: open && active === value ? 0 : -1,
                autoFocus: shouldAutoFocus,
                "aria-selected": selected ? "true" : "false",
                "data-lumina-multiselect-item": "true",
                "data-active": active === value ? "true" : "false",
                "data-state": selected ? "checked" : "unchecked",
                onClick: () => {
                  setMultiselectActiveValue(ctx, value);
                  toggleMultiselectValue(ctx, value);
                },
                onMouseEnter: () => {
                  setMultiselectActiveValue(ctx, value);
                },
                onFocus: () => {
                  setMultiselectActiveValue(ctx, value);
                },
                onKeyDown: (event) => {
                  const key2 = String(event?.key ?? "");
                  if (key2 === "Escape") {
                    event?.preventDefault?.();
                    closeMultiselect(ctx);
                    return false;
                  }
                  if (key2 === "Tab") {
                    ctx.open.set(false);
                    return void 0;
                  }
                  if (key2 === "Enter" || key2 === " ") {
                    event?.preventDefault?.();
                    setMultiselectActiveValue(ctx, value);
                    toggleMultiselectValue(ctx, value);
                    return false;
                  }
                  if (key2 === "Home") {
                    event?.preventDefault?.();
                    const firstValue = ctx.order[0] ?? value;
                    setMultiselectActiveValue(ctx, firstValue);
                    focusMultiselectItem(
                      getFocusTargetFromEvent(event)?.ownerDocument,
                      ctx,
                      firstValue,
                      getFocusTargetFromEvent(event)
                    );
                    return false;
                  }
                  if (key2 === "End") {
                    event?.preventDefault?.();
                    const lastValue = ctx.order[ctx.order.length - 1] ?? value;
                    setMultiselectActiveValue(ctx, lastValue);
                    focusMultiselectItem(
                      getFocusTargetFromEvent(event)?.ownerDocument,
                      ctx,
                      lastValue,
                      getFocusTargetFromEvent(event)
                    );
                    return false;
                  }
                  const nextValue = getMultiselectNavigationTarget(ctx, value, key2);
                  if (nextValue) {
                    event?.preventDefault?.();
                    setMultiselectActiveValue(ctx, nextValue);
                    focusMultiselectItem(
                      getFocusTargetFromEvent(event)?.ownerDocument,
                      ctx,
                      nextValue,
                      getFocusTargetFromEvent(event)
                    );
                    return false;
                  }
                  const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, value, key2);
                  if (!typeaheadTarget) return void 0;
                  event?.preventDefault?.();
                  setMultiselectActiveValue(ctx, typeaheadTarget);
                  focusMultiselectItem(
                    getFocusTargetFromEvent(event)?.ownerDocument,
                    ctx,
                    typeaheadTarget,
                    getFocusTargetFromEvent(event)
                  );
                  return false;
                }
              },
              props
            ),
            resolvedChildren
          );
        })
      );
    },
    multiselect_indicator: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_indicator");
      const ctx = frameManager.useContext(multiselectItemContext);
      return vnodeElement(
        "span",
        mergeProps(
          {
            id: getMultiselectIndicatorId(ctx.itemId),
            "aria-hidden": "true",
            hidden: !ctx.selected,
            "data-lumina-multiselect-indicator": "true",
            "data-state": ctx.selected ? "checked" : "unchecked"
          },
          props
        ),
        children2
      );
    },
    checkbox_root: (checked, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.checkbox_root");
      return coerceRenderableToVNode(
        frameManager.withContext(
          checkboxContext,
          { checked, baseId: getCheckboxBaseId(checked) },
          () => {
            const ctx = frameManager.useContext(checkboxContext);
            const current = ctx.checked.get();
            const { rootId, indicatorId } = getCheckboxIds(ctx);
            return vnodeElement(
              "button",
              mergeProps(
                {
                  type: "button",
                  id: rootId,
                  role: "checkbox",
                  "aria-checked": current ? "true" : "false",
                  "aria-controls": indicatorId,
                  tabIndex: 0,
                  "data-lumina-checkbox-root": "true",
                  "data-state": current ? "checked" : "unchecked",
                  onClick: () => {
                    ctx.checked.set(!ctx.checked.get());
                  },
                  onKeyDown: (event) => {
                    const key2 = String(event?.key ?? "");
                    if (key2 !== "Enter" && key2 !== " ") return void 0;
                    event?.preventDefault?.();
                    ctx.checked.set(!ctx.checked.get());
                    return false;
                  }
                },
                props
              ),
              resolveChildrenInput(renderChildren)
            );
          }
        )
      );
    },
    checkbox_indicator: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.checkbox_indicator");
      const ctx = frameManager.useContext(checkboxContext);
      const current = ctx.checked.get();
      const { indicatorId } = getCheckboxIds(ctx);
      return vnodeElement(
        "span",
        mergeProps(
          {
            id: indicatorId,
            "aria-hidden": "true",
            hidden: !current,
            "data-lumina-checkbox-indicator": "true",
            "data-state": current ? "checked" : "unchecked"
          },
          props
        ),
        children2
      );
    },
    radio_group: (value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.radio_group");
      return coerceRenderableToVNode(
        frameManager.withContext(
          radioGroupContext,
          { value, baseId: getRadioBaseId(value), order: [] },
          () => vnodeElement(
            "div",
            mergeProps(
              {
                role: "radiogroup",
                "data-lumina-radio-group": "true"
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    radio_item: (value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.radio_item");
      const ctx = frameManager.useContext(radioGroupContext);
      registerRadioValue(ctx, value);
      const selected = ctx.value.get() === value;
      const itemId = getRadioItemId(ctx, value);
      return coerceRenderableToVNode(
        frameManager.withContext(
          radioItemContext,
          { value, itemId, selected },
          () => vnodeElement(
            "button",
            mergeProps(
              {
                type: "button",
                id: itemId,
                role: "radio",
                "aria-checked": selected ? "true" : "false",
                tabIndex: selected ? 0 : -1,
                "data-lumina-radio-item": "true",
                "data-state": selected ? "checked" : "unchecked",
                onClick: () => {
                  ctx.value.set(value);
                },
                onKeyDown: (event) => {
                  const key2 = String(event?.key ?? "");
                  if (key2 === "Enter" || key2 === " ") {
                    event?.preventDefault?.();
                    ctx.value.set(value);
                    return false;
                  }
                  const nextValue = getRadioNavigationTarget(ctx, value, key2);
                  if (!nextValue) return void 0;
                  event?.preventDefault?.();
                  ctx.value.set(nextValue);
                  const focusTarget = getFocusTargetFromEvent(event);
                  focusRadioItem(
                    focusTarget?.ownerDocument,
                    ctx,
                    nextValue,
                    focusTarget?.parentNode ?? null
                  );
                  return false;
                }
              },
              props
            ),
            resolveChildrenInput(renderChildren)
          )
        )
      );
    },
    radio_indicator: (props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.radio_indicator");
      const ctx = frameManager.useContext(radioItemContext);
      return vnodeElement(
        "span",
        mergeProps(
          {
            id: getRadioIndicatorId(ctx.itemId),
            "aria-hidden": "true",
            hidden: !ctx.selected,
            "data-lumina-radio-indicator": "true",
            "data-state": ctx.selected ? "checked" : "unchecked"
          },
          props
        ),
        children2
      );
    }
  };
  return api;
};

// src/runtime/system-runtime.ts
var padTimePart = (value) => String(Math.trunc(value)).padStart(2, "0");
var localDateString = (date) => `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;
var localTimeString = (date) => `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`;
var localClockMs = (date) => date.getHours() * 60 * 60 * 1e3 + date.getMinutes() * 60 * 1e3 + date.getSeconds() * 1e3 + date.getMilliseconds();
var localTimeZoneName = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  } catch {
    return "Local time";
  }
};
var blockedHttpHosts = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254"
]);
var isPrivateIpv4Host = (host) => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
};
var validateHttpUrl = (rawUrl) => {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked protocol '${parsed.protocol}'. Only http and https are allowed.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (blockedHttpHosts.has(host)) {
    throw new Error(`Blocked host '${host}' for security reasons.`);
  }
  if (isPrivateIpv4Host(host)) {
    throw new Error(`Blocked private IP address: ${host}`);
  }
  return parsed.toString();
};
var hasOpfsSupport = () => {
  const nav = globalThis.navigator;
  return typeof nav?.storage?.getDirectory === "function";
};
var getOpfsRoot = async () => {
  const nav = globalThis.navigator;
  const getter = nav?.storage?.getDirectory;
  if (typeof getter !== "function") {
    throw new Error("OPFS is not available in this environment");
  }
  return await getter.call(nav.storage);
};
var opfsError = (error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
};
var isOpfsNotFoundError = (error) => !!error && typeof error === "object" && (error.name === "NotFoundError" || error.code === "ENOENT");
var splitOpfsPath = (path2) => String(path2).replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== ".");
var walkOpfsDirectory = async (segments, create) => {
  let current = await getOpfsRoot();
  for (const segment of segments) {
    if (segment === "..") {
      throw new Error("OPFS path traversal is not supported");
    }
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
};
var resolveOpfsParent = async (path2, createParent) => {
  const segments = splitOpfsPath(path2);
  if (segments.length === 0) {
    throw new Error("Path must not be empty");
  }
  const name = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const directory = await walkOpfsDirectory(parentSegments, createParent);
  return { directory, name };
};
var isLikelyRemotePath = (path2) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path2) || path2.startsWith("//");
var getMonotonicNow = () => {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
};
var compileRegex = (pattern, flags = "") => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
};
var toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
var toBase64 = (bytes) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
var fromBase64 = (value) => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};
var getWebCrypto = async () => {
  if (globalThis.crypto && typeof globalThis.crypto.subtle !== "undefined") {
    return globalThis.crypto;
  }
  if (!isNodeRuntime()) return null;
  try {
    const nodeCrypto = await import("crypto");
    return nodeCrypto.webcrypto ?? null;
  } catch {
    return null;
  }
};
var utf8Encode = (value) => new TextEncoder().encode(value);
var utf8Decode = (value) => new TextDecoder().decode(value);
var deriveAesKey = async (web, key2, usage) => {
  const digest = await web.subtle.digest("SHA-256", utf8Encode(key2));
  return await web.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [usage]);
};
var toIterableValues2 = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iteratorFn = value[Symbol.iterator];
    if (typeof iteratorFn === "function") {
      return Array.from(value);
    }
  }
  return [];
};
var createSystemRuntime = (deps) => {
  const toJsonValue = (value, seen) => {
    if (value === null || value === void 0) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return `[Function${value.name ? ` ${value.name}` : ""}]`;
    if (Array.isArray(value)) return value.map((item) => toJsonValue(item, seen));
    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      if (deps.isEnumLike(value)) {
        const tag = deps.getEnumTag(value);
        const payload = deps.getEnumPayload(value);
        return payload === void 0 ? { $tag: tag } : { $tag: tag, $payload: toJsonValue(payload, seen) };
      }
      const entries = Object.entries(value).map(([key2, val]) => [key2, toJsonValue(val, seen)]);
      return Object.fromEntries(entries);
    }
    return String(value);
  };
  const toJsonString2 = (value, pretty = true) => {
    const normalized = toJsonValue(value, /* @__PURE__ */ new WeakSet());
    return JSON.stringify(normalized, null, pretty ? 2 : void 0);
  };
  const resultOk = (value) => deps.getResult().Ok(value);
  const resultErr = (message) => deps.getResult().Err(message);
  const optionSome = (value) => deps.getOption().Some(value);
  const optionNone = () => deps.getOption().None;
  const renderArgs = (args) => args.map((arg) => deps.formatValue(arg)).join(" ");
  const writeStdout = (text2, newline) => {
    if (isNodeRuntime()) {
      const stdout = getNodeProcess()?.stdout;
      if (stdout?.write) {
        stdout.write(text2 + (newline ? "\n" : ""));
        return;
      }
    }
    console.log(text2);
  };
  const writeStderr = (text2, newline) => {
    if (isNodeRuntime()) {
      const stderr = getNodeProcess()?.stderr;
      if (stderr?.write) {
        stderr.write(text2 + (newline ? "\n" : ""));
        return;
      }
    }
    console.error(text2);
  };
  let stdinCache = null;
  let stdinIndex = 0;
  const readStdinLines = () => {
    if (stdinCache) return stdinCache;
    const globalAny = globalThis;
    if (globalAny.__luminaStdin !== void 0) {
      const raw = globalAny.__luminaStdin;
      stdinCache = Array.isArray(raw) ? raw.map(String) : String(raw).split(/\r?\n/);
      return stdinCache;
    }
    if (isNodeRuntime()) {
      const stdin = getNodeProcess()?.stdin;
      const isTty = stdin?.isTTY;
      if (isTty !== true) {
        try {
          const readSync = getNodeReadFileSync();
          const raw = readSync ? readSync(0, "utf8") : "";
          if (raw.length > 0) {
            stdinCache = raw.split(/\r?\n/);
            return stdinCache;
          }
        } catch {
        }
      }
      if (stdin?.setEncoding) stdin.setEncoding("utf8");
      const chunk = stdin?.read?.();
      if (typeof chunk === "string") {
        stdinCache = chunk.split(/\r?\n/);
        return stdinCache;
      }
      if (chunk && typeof chunk.toString === "function") {
        stdinCache = chunk.toString("utf8").split(/\r?\n/);
        return stdinCache;
      }
    }
    stdinCache = [];
    return stdinCache;
  };
  const unwrapOption = (value) => {
    if (deps.isEnumLike(value)) {
      const tag = deps.getEnumTag(value);
      if (tag === "Some") return { isSome: true, value: deps.getEnumPayload(value) };
      if (tag === "None") return { isSome: false };
    }
    return { isSome: true, value };
  };
  const opfsReadFile = async (path3) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, false);
      const handle = await directory.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      const content = await file.text();
      return resultOk(content);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const opfsWriteFile = async (path3, content) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, true);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(String(content));
      await writable.close();
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const opfsReadDir = async (path3) => {
    try {
      const segments = splitOpfsPath(path3);
      const directory = await walkOpfsDirectory(segments, false);
      const entries = [];
      if (typeof directory.entries === "function") {
        for await (const [name] of directory.entries()) {
          entries.push(name);
        }
        return resultOk(entries);
      }
      if (typeof directory.keys === "function") {
        for await (const name of directory.keys()) {
          entries.push(name);
        }
        return resultOk(entries);
      }
      return resultErr("OPFS directory iteration is not available");
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const opfsMetadata = async (path3) => {
    try {
      const segments = splitOpfsPath(path3);
      if (segments.length === 0) {
        return resultOk({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
      }
      const { directory, name } = await resolveOpfsParent(path3, false);
      try {
        const fileHandle = await directory.getFileHandle(name, { create: false });
        const file = await fileHandle.getFile();
        return resultOk({
          isFile: true,
          isDirectory: false,
          size: Math.trunc(file.size),
          modifiedMs: Math.trunc(file.lastModified)
        });
      } catch (fileError) {
        if (!isOpfsNotFoundError(fileError)) {
          return resultErr(opfsError(fileError));
        }
      }
      const dirHandle = await directory.getDirectoryHandle(name, { create: false });
      if (dirHandle) {
        return resultOk({ isFile: false, isDirectory: true, size: 0, modifiedMs: 0 });
      }
      return resultErr(`Entry not found: ${path3}`);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const opfsExists = async (path3) => {
    try {
      const meta = await opfsMetadata(path3);
      return deps.isEnumLike(meta) && deps.getEnumTag(meta) === "Ok";
    } catch {
      return false;
    }
  };
  const opfsMkdir = async (path3, recursive = true) => {
    try {
      const segments = splitOpfsPath(path3);
      if (segments.length === 0) return resultOk(void 0);
      if (recursive) {
        await walkOpfsDirectory(segments, true);
        return resultOk(void 0);
      }
      const parentSegments = segments.slice(0, -1);
      const parent = await walkOpfsDirectory(parentSegments, false);
      await parent.getDirectoryHandle(segments[segments.length - 1], { create: true });
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const opfsRemoveFile = async (path3) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, false);
      await directory.removeEntry(name, { recursive: false });
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  };
  const io2 = {
    print: (...args) => {
      writeStdout(renderArgs(args), false);
    },
    println: (...args) => {
      writeStdout(renderArgs(args), true);
    },
    eprint: (...args) => {
      writeStderr(renderArgs(args), false);
    },
    eprintln: (...args) => {
      writeStderr(renderArgs(args), true);
    },
    readLine: () => {
      const globalAny = globalThis;
      if (typeof globalAny.__luminaReadLine === "function") {
        const value2 = globalAny.__luminaReadLine();
        return value2 == null ? optionNone() : optionSome(value2);
      }
      if (typeof globalThis.prompt === "function") {
        const value2 = globalThis.prompt?.();
        return value2 == null ? optionNone() : optionSome(value2);
      }
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return optionNone();
      const value = lines[stdinIndex++];
      return optionSome(value);
    },
    readLineAsync: async () => {
      const globalAny = globalThis;
      if (globalAny.__luminaStdin !== void 0) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return optionNone();
        const value = lines[stdinIndex++];
        return optionSome(value);
      }
      if (isNodeRuntime()) {
        const nodeProcess = getNodeProcess();
        const stdin = nodeProcess?.stdin;
        if (stdin && stdin.isTTY !== true) {
          const lines = readStdinLines();
          if (stdinIndex >= lines.length) return optionNone();
          const value = lines[stdinIndex++];
          return optionSome(value);
        }
        if (stdin?.isTTY) {
          const readline = await import("readline");
          const rl = nodeProcess?.stdout ? readline.createInterface({
            input: stdin,
            output: nodeProcess.stdout
          }) : readline.createInterface({
            input: stdin
          });
          return await new Promise((resolve) => {
            rl.question("", (answer) => {
              rl.close();
              resolve(optionSome(answer));
            });
          });
        }
      }
      if (typeof globalThis.prompt === "function") {
        const value = globalThis.prompt?.();
        return value == null ? optionNone() : optionSome(value);
      }
      return optionNone();
    },
    printJson: (value, pretty = true) => {
      console.log(toJsonString2(value, pretty));
    }
  };
  const str2 = {
    length: (value) => value.length,
    concat: (a, b) => a + b,
    substring: (value, start, end) => {
      const safeStart = Math.max(0, Math.trunc(start));
      const safeEnd = Math.max(safeStart, Math.trunc(end));
      return value.substring(safeStart, safeEnd);
    },
    slice: (value, range) => {
      const start = range?.start ?? void 0;
      const end = range?.end ?? void 0;
      return value.slice(start ?? void 0, range?.inclusive && end !== void 0 ? end + 1 : end ?? void 0);
    },
    split: (value, sep) => value.split(sep),
    trim: (value) => value.trim(),
    contains: (haystack, needle) => haystack.includes(needle),
    eq: (a, b) => a === b,
    char_at: (value, index) => {
      if (Number.isNaN(index) || index < 0 || index >= value.length) return optionNone();
      return optionSome(value.charAt(index));
    },
    is_whitespace: (value) => value === " " || value === "\n" || value === "	" || value === "\r",
    is_digit: (value) => {
      if (!value || value.length === 0) return false;
      const code = value.charCodeAt(0);
      return code >= 48 && code <= 57;
    },
    to_int: (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? resultErr(`Invalid int: ${value}`) : resultOk(parsed);
    },
    to_float: (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? resultErr(`Invalid float: ${value}`) : resultOk(parsed);
    },
    from_int: (value) => String(Math.trunc(value)),
    from_float: (value) => String(value)
  };
  const math2 = {
    abs: (value) => Math.abs(value),
    min: (a, b) => Math.min(a, b),
    max: (a, b) => Math.max(a, b),
    absf: (value) => Math.abs(value),
    minf: (a, b) => Math.min(a, b),
    maxf: (a, b) => Math.max(a, b),
    sqrt: (value) => Math.sqrt(value),
    pow: (base, exp) => Math.pow(base, exp),
    powf: (base, exp) => Math.pow(base, exp),
    floor: (value) => Math.floor(value),
    ceil: (value) => Math.ceil(value),
    round: (value) => Math.round(value),
    pi: Math.PI,
    e: Math.E
  };
  const opfs2 = {
    is_available: () => hasOpfsSupport(),
    readFile: async (path3) => opfsReadFile(path3),
    writeFile: async (path3, content) => opfsWriteFile(path3, content),
    readDir: async (path3) => opfsReadDir(path3),
    metadata: async (path3) => opfsMetadata(path3),
    exists: async (path3) => opfsExists(path3),
    mkdir: async (path3, recursive = true) => opfsMkdir(path3, recursive),
    removeFile: async (path3) => opfsRemoveFile(path3)
  };
  const fs2 = {
    readFile: async (path3) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          const content = await fsPromises.readFile(path3, "utf8");
          return resultOk(content);
        }
        if (opfs2.is_available() && !isLikelyRemotePath(path3)) {
          return await opfs2.readFile(path3);
        }
        if (typeof fetch !== "undefined") {
          const response = await fetch(path3);
          if (!response.ok) {
            return resultErr(`HTTP ${response.status}: ${response.statusText}`);
          }
          const content = await response.text();
          return resultOk(content);
        }
        return resultErr("No file system available");
      } catch (error) {
        return resultErr(String(error));
      }
    },
    writeFile: async (path3, content) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          await fsPromises.writeFile(path3, content, "utf8");
          return resultOk(void 0);
        }
        if (opfs2.is_available()) {
          return await opfs2.writeFile(path3, content);
        }
        return resultErr("writeFile not supported in browser");
      } catch (error) {
        return resultErr(String(error));
      }
    },
    readDir: async (path3) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          const entries = await fsPromises.readdir(path3);
          return resultOk(entries);
        }
        if (opfs2.is_available()) {
          return await opfs2.readDir(path3);
        }
        if (!isNodeRuntime()) {
          return resultErr("readDir is not supported in browser");
        }
        return resultErr("No file system available");
      } catch (error) {
        return resultErr(String(error));
      }
    },
    metadata: async (path3) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          const stats = await fsPromises.stat(path3);
          return resultOk({
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: Math.trunc(stats.size),
            modifiedMs: Math.trunc(stats.mtimeMs)
          });
        }
        if (opfs2.is_available()) {
          return await opfs2.metadata(path3);
        }
        return resultErr("metadata is not supported in browser");
      } catch (error) {
        return resultErr(String(error));
      }
    },
    exists: async (path3) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          await fsPromises.access(path3);
          return true;
        }
        if (opfs2.is_available()) return await opfs2.exists(path3);
        return false;
      } catch {
        return false;
      }
    },
    mkdir: async (path3, recursive = true) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          await fsPromises.mkdir(path3, { recursive: !!recursive });
          return resultOk(void 0);
        }
        if (opfs2.is_available()) {
          return await opfs2.mkdir(path3, recursive);
        }
        return resultErr("mkdir is not supported in browser");
      } catch (error) {
        return resultErr(String(error));
      }
    },
    removeFile: async (path3) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          await fsPromises.unlink(path3);
          return resultOk(void 0);
        }
        if (opfs2.is_available()) {
          return await opfs2.removeFile(path3);
        }
        return resultErr("removeFile is not supported in browser");
      } catch (error) {
        return resultErr(String(error));
      }
    }
  };
  const path2 = {
    join: (left, right) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.join(String(left), String(right)) : joinPathBasic(String(left), String(right));
    },
    is_absolute: (value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.isAbsolute(String(value)) : isAbsolutePathBasic(String(value));
    },
    extension: (value) => {
      const nodePath = getNodePath();
      const ext = nodePath ? nodePath.extname(String(value)) : extnamePathBasic(String(value));
      if (!ext) return optionNone();
      return optionSome(ext.startsWith(".") ? ext.slice(1) : ext);
    },
    dirname: (value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.dirname(String(value)) : dirnamePathBasic(String(value));
    },
    basename: (value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.basename(String(value)) : basenamePathBasic(String(value));
    },
    normalize: (value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.normalize(String(value)) : normalizePathBasic(String(value));
    }
  };
  const env2 = {
    var: (name) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      const value = nodeProcess.env?.[String(name)];
      if (value === void 0) {
        return resultErr(`Environment variable '${name}' is not set`);
      }
      return resultOk(String(value));
    },
    set_var: (name, value) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      nodeProcess.env[String(name)] = String(value);
      return resultOk(void 0);
    },
    remove_var: (name) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      delete nodeProcess.env[String(name)];
      return resultOk(void 0);
    },
    args: () => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return [];
      return nodeProcess.argv.slice(2);
    },
    cwd: () => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Current working directory is not available in this runtime");
      }
      return resultOk(nodeProcess.cwd());
    }
  };
  const processRuntime = {
    spawn: (command, args = []) => {
      if (!isNodeRuntime()) {
        return resultErr("Process spawning is not available in this runtime");
      }
      const commandText = String(command).trim();
      if (!commandText) {
        return resultErr("Process command must be a non-empty string");
      }
      const argv = toIterableValues2(args).map((part) => String(part));
      try {
        const spawn = getNodeSpawnSync();
        if (!spawn) {
          return resultErr("Process spawning is not available in this runtime");
        }
        const output = spawn(commandText, argv, {
          encoding: "utf8",
          shell: false,
          windowsHide: true
        });
        if (output.error) {
          return resultErr(output.error.message || String(output.error));
        }
        return resultOk({
          status: typeof output.status === "number" ? Math.trunc(output.status) : -1,
          success: output.status === 0,
          stdout: typeof output.stdout === "string" ? output.stdout : String(output.stdout ?? ""),
          stderr: typeof output.stderr === "string" ? output.stderr : String(output.stderr ?? "")
        });
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    exit: (code = 0) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return;
      nodeProcess.exit(Math.trunc(code));
    },
    cwd: () => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? nodeProcess.cwd() : "";
    },
    pid: () => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? Math.trunc(nodeProcess.pid) : -1;
    }
  };
  const json2 = {
    to_string: (value) => {
      try {
        return resultOk(JSON.stringify(value));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    to_pretty_string: (value) => {
      try {
        return resultOk(toJsonString2(value, true));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    from_string: (source) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    },
    parse: (source) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    }
  };
  const http2 = {
    fetch: async (request) => {
      if (typeof fetch !== "function") {
        return resultErr("Fetch API is not available");
      }
      if (!request || typeof request !== "object") {
        return resultErr("Invalid request");
      }
      const req = request;
      const rawUrl = typeof req.url === "string" ? req.url : "";
      if (!rawUrl) {
        return resultErr("Invalid request url");
      }
      let url2;
      try {
        url2 = validateHttpUrl(rawUrl);
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
      const method = typeof req.method === "string" && req.method.length > 0 ? req.method : "GET";
      const headerInput = unwrapOption(req.headers).value;
      const headers = {};
      if (Array.isArray(headerInput)) {
        for (const entry of headerInput) {
          if (Array.isArray(entry) && entry.length >= 2) {
            const [name, value] = entry;
            if (typeof name === "string") {
              headers[name] = typeof value === "string" ? value : String(value ?? "");
            }
            continue;
          }
          if (entry && typeof entry === "object") {
            const name = entry.name;
            const value = entry.value;
            if (typeof name === "string") {
              headers[name] = typeof value === "string" ? value : String(value ?? "");
            }
          }
        }
      }
      const bodyValue = unwrapOption(req.body).value;
      const body = typeof bodyValue === "string" ? bodyValue : bodyValue == null ? void 0 : String(bodyValue);
      try {
        const response = await fetch(url2, { method, headers, body });
        const text2 = await response.text();
        const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({ name, value }));
        return resultOk({
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: text2
        });
      } catch (error) {
        return resultErr(String(error));
      }
    },
    get: async (url2) => await http2.fetch({
      url: url2,
      method: "GET",
      headers: optionNone(),
      body: optionNone()
    }),
    post: async (url2, body) => await http2.fetch({
      url: url2,
      method: "POST",
      headers: optionNone(),
      body: body === void 0 ? optionNone() : optionSome(typeof body === "string" ? body : JSON.stringify(body))
    }),
    put: async (url2, body) => await http2.fetch({
      url: url2,
      method: "PUT",
      headers: optionNone(),
      body: body === void 0 ? optionNone() : optionSome(typeof body === "string" ? body : JSON.stringify(body))
    }),
    del: async (url2) => await http2.fetch({
      url: url2,
      method: "DELETE",
      headers: optionNone(),
      body: optionNone()
    })
  };
  const time2 = {
    nowMs: () => Math.trunc(Date.now()),
    nowIso: () => (/* @__PURE__ */ new Date()).toISOString(),
    localDate: () => localDateString(/* @__PURE__ */ new Date()),
    localTime: () => localTimeString(/* @__PURE__ */ new Date()),
    localClockMs: () => Math.trunc(localClockMs(/* @__PURE__ */ new Date())),
    timeZone: () => localTimeZoneName(),
    instantNow: () => Math.trunc(getMonotonicNow()),
    elapsedMs: (since) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)),
    sleep: async (ms) => await new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Math.trunc(ms)));
    })
  };
  const regex2 = {
    isValid: (pattern, flags = "") => compileRegex(pattern, flags) !== null,
    test: (pattern, text2, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(re.test(text2));
    },
    find: (pattern, text2, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return optionNone();
      const match = text2.match(re);
      if (!match) return optionNone();
      return optionSome(match[0]);
    },
    findAll: (pattern, text2, flags = "") => {
      const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
      const re = compileRegex(pattern, normalizedFlags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${normalizedFlags}`);
      const matches = Array.from(text2.matchAll(re)).map((m) => m[0]);
      return resultOk(matches);
    },
    replace: (pattern, text2, replacement, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(text2.replace(re, replacement));
    }
  };
  const crypto2 = {
    isAvailable: async () => await getWebCrypto() !== null,
    sha256: async (value) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const digest = await web.subtle.digest("SHA-256", utf8Encode(value));
        return resultOk(toHex(new Uint8Array(digest)));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    hmacSha256: async (key2, value) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const cryptoKey = await web.subtle.importKey(
          "raw",
          utf8Encode(key2),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signature = await web.subtle.sign("HMAC", cryptoKey, utf8Encode(value));
        return resultOk(toHex(new Uint8Array(signature)));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    randomBytes: async (length) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const n = Math.max(0, Math.trunc(length));
        const bytes = new Uint8Array(n);
        web.getRandomValues(bytes);
        return resultOk(Array.from(bytes).map((b) => b | 0));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    randomInt: async (min, max) => {
      const lower = Math.trunc(Math.min(min, max));
      const upper = Math.trunc(Math.max(min, max));
      const span = upper - lower + 1;
      if (span <= 0) return resultErr("Invalid range");
      const random = await crypto2.randomBytes(4);
      if (!deps.isEnumLike(random) || deps.getEnumTag(random) !== "Ok") return random;
      const bytes = deps.getEnumPayload(random);
      if (!Array.isArray(bytes) || bytes.length < 4) return resultErr("Failed to generate randomness");
      const packed = new Uint8Array([bytes[0], bytes[1], bytes[2], bytes[3]]);
      const value = new DataView(packed.buffer).getUint32(0, false);
      return resultOk(lower + value % span);
    },
    aesGcmEncrypt: async (key2, plaintext) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const aesKey = await deriveAesKey(web, key2, "encrypt");
        const iv = new Uint8Array(12);
        web.getRandomValues(iv);
        const encrypted = await web.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, utf8Encode(plaintext));
        const cipherBytes = new Uint8Array(encrypted);
        const packed = new Uint8Array(iv.length + cipherBytes.length);
        packed.set(iv, 0);
        packed.set(cipherBytes, iv.length);
        return resultOk(toBase64(packed));
      } catch (error) {
        return resultErr(String(error));
      }
    },
    aesGcmDecrypt: async (key2, payloadBase64) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const packed = fromBase64(payloadBase64);
        if (packed.length < 13) return resultErr("Invalid AES payload");
        const iv = packed.slice(0, 12);
        const cipher = packed.slice(12);
        const aesKey = await deriveAesKey(web, key2, "decrypt");
        const plain = await web.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipher);
        return resultOk(utf8Decode(new Uint8Array(plain)));
      } catch (error) {
        return resultErr(String(error));
      }
    }
  };
  return {
    toJsonString: toJsonString2,
    io: io2,
    str: str2,
    math: math2,
    opfs: opfs2,
    fs: fs2,
    path: path2,
    env: env2,
    process: processRuntime,
    json: json2,
    http: http2,
    time: time2,
    regex: regex2,
    crypto: crypto2
  };
};

// src/runtime/headless-ui-runtime.ts
var createSignalBaseIdResolver = (prefix) => {
  const ids = /* @__PURE__ */ new WeakMap();
  let nextId = 1;
  return (signal) => {
    const key2 = signal;
    const existing = ids.get(key2);
    if (existing) return existing;
    const next = `${prefix}-${nextId++}`;
    ids.set(key2, next);
    return next;
  };
};
var registerOrderedValue = (order, value) => {
  if (!order.includes(value)) {
    order.push(value);
  }
};
var getTypeaheadLabels = (labelsMap, keyObject) => {
  const existing = labelsMap.get(keyObject);
  if (existing) return existing;
  const created = /* @__PURE__ */ new Map();
  labelsMap.set(keyObject, created);
  return created;
};
var registerTypeaheadLabel = (labelsMap, keyObject, value, label) => {
  const normalized = String(label ?? "").trim();
  if (!normalized) return;
  getTypeaheadLabels(labelsMap, keyObject).set(value, normalized);
};
var getWrappedNavigationTarget = (order, current, key2, forwardKeys, backwardKeys) => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));
  if (key2 === "Home") {
    return order[0] ?? null;
  }
  if (key2 === "End") {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key2)) {
    return order[(currentIndex + 1) % order.length] ?? null;
  }
  if (backwardKeys.includes(key2)) {
    return order[(currentIndex - 1 + order.length) % order.length] ?? null;
  }
  return null;
};
var getClampedNavigationTarget = (order, current, key2, forwardKeys, backwardKeys) => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));
  if (key2 === "Home") {
    return order[0] ?? null;
  }
  if (key2 === "End") {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key2)) {
    return order[Math.min(currentIndex + 1, order.length - 1)] ?? null;
  }
  if (backwardKeys.includes(key2)) {
    return order[Math.max(currentIndex - 1, 0)] ?? null;
  }
  return null;
};
var restoreFocusFromMap = (ctx, targets) => {
  const key2 = ctx.open;
  const target = targets.get(key2);
  if (!target || typeof target.focus !== "function") return;
  targets.delete(key2);
  target.focus();
};
var setMapTarget = (ctx, map, value) => {
  const key2 = ctx.open;
  if (value == null) {
    map.delete(key2);
    return;
  }
  map.set(key2, value);
};
var focusElementById = (documentLike, targetId, fallbackRoot) => {
  const target = (documentLike && typeof documentLike.getElementById === "function" ? documentLike.getElementById(targetId) : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== "function") return false;
  target.focus();
  return true;
};
var readNumericRectValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
var readAnchorRect = (ctx, anchors) => {
  const anchor = anchors.get(ctx.open);
  if (!anchor || typeof anchor.getBoundingClientRect !== "function") return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return { left, top, right, bottom, width, height };
};
var clearTimerHandle = (handle) => {
  if (handle !== void 0 && typeof globalThis.clearTimeout === "function") {
    globalThis.clearTimeout(handle);
  }
};
var TYPEAHEAD_RESET_MS = 700;
var isPrintableTypeaheadKey = (key2) => key2.length === 1 && key2.trim().length > 0;
var updateTypeaheadBuffer = (state2, key2) => {
  const normalizedKey = key2.toLowerCase();
  const previous = state2?.buffer ?? "";
  const nextRaw = `${previous}${normalizedKey}`;
  const repeated = new Set(nextRaw).size === 1 ? normalizedKey : nextRaw;
  clearTimerHandle(state2?.resetHandle);
  const nextState = {
    buffer: repeated,
    resetHandle: void 0
  };
  nextState.resetHandle = typeof globalThis.setTimeout === "function" ? globalThis.setTimeout(() => {
    nextState.buffer = "";
    nextState.resetHandle = void 0;
  }, TYPEAHEAD_RESET_MS) : void 0;
  return nextState;
};
var getTypeaheadTarget = (stateMap, keyObject, order, labels, current, key2) => {
  if (!isPrintableTypeaheadKey(key2) || order.length === 0) return null;
  const nextState = updateTypeaheadBuffer(stateMap.get(keyObject), key2);
  stateMap.set(keyObject, nextState);
  const needle = nextState.buffer;
  const currentIndex = order.indexOf(current);
  const startOffset = currentIndex >= 0 ? 1 : 0;
  for (let offset = startOffset; offset < order.length + startOffset; offset += 1) {
    const index = currentIndex >= 0 ? (currentIndex + offset) % order.length : offset % order.length;
    const candidate = order[index];
    const label = (labels?.get(candidate) ?? candidate ?? "").trim().toLowerCase();
    if (label.startsWith(needle)) {
      return candidate;
    }
  }
  return null;
};
var createHeadlessUiRuntime = () => {
  const tabsContext = createContextToken();
  const checkboxContext = createContextToken();
  const radioGroupContext = createContextToken();
  const radioItemContext = createContextToken();
  const dialogContext = createContextToken();
  const popoverContext = createContextToken();
  const tooltipContext = createContextToken();
  const toastContext = createContextToken();
  const menuContext = createContextToken();
  const selectContext = createContextToken();
  const selectItemContext = createContextToken();
  const comboboxContext = createContextToken();
  const comboboxItemContext = createContextToken();
  const multiselectContext = createContextToken();
  const multiselectItemContext = createContextToken();
  const dialogRestoreTargets = /* @__PURE__ */ new WeakMap();
  const popoverAnchorTargets = /* @__PURE__ */ new WeakMap();
  const popoverRestoreTargets = /* @__PURE__ */ new WeakMap();
  const tooltipAnchorTargets = /* @__PURE__ */ new WeakMap();
  const toastTimers = /* @__PURE__ */ new WeakMap();
  const menuAnchorTargets = /* @__PURE__ */ new WeakMap();
  const menuRestoreTargets = /* @__PURE__ */ new WeakMap();
  const menuActiveValues = /* @__PURE__ */ new WeakMap();
  const menuTypeaheadStates = /* @__PURE__ */ new WeakMap();
  const menuTypeaheadLabels = /* @__PURE__ */ new WeakMap();
  const selectAnchorTargets = /* @__PURE__ */ new WeakMap();
  const selectRestoreTargets = /* @__PURE__ */ new WeakMap();
  const selectActiveValues = /* @__PURE__ */ new WeakMap();
  const selectTypeaheadStates = /* @__PURE__ */ new WeakMap();
  const selectTypeaheadLabels = /* @__PURE__ */ new WeakMap();
  const comboboxAnchorTargets = /* @__PURE__ */ new WeakMap();
  const comboboxRestoreTargets = /* @__PURE__ */ new WeakMap();
  const comboboxActiveValues = /* @__PURE__ */ new WeakMap();
  const multiselectAnchorTargets = /* @__PURE__ */ new WeakMap();
  const multiselectRestoreTargets = /* @__PURE__ */ new WeakMap();
  const multiselectActiveValues = /* @__PURE__ */ new WeakMap();
  const multiselectTypeaheadStates = /* @__PURE__ */ new WeakMap();
  const multiselectTypeaheadLabels = /* @__PURE__ */ new WeakMap();
  const getTabsBaseId = createSignalBaseIdResolver("lumina-tabs");
  const getCheckboxBaseId = createSignalBaseIdResolver("lumina-checkbox");
  const getRadioBaseId = createSignalBaseIdResolver("lumina-radio");
  const getDialogBaseId = createSignalBaseIdResolver("lumina-dialog");
  const getPopoverBaseId = createSignalBaseIdResolver("lumina-popover");
  const getTooltipBaseId = createSignalBaseIdResolver("lumina-tooltip");
  const getToastBaseId = createSignalBaseIdResolver("lumina-toast");
  const getMenuBaseId = createSignalBaseIdResolver("lumina-menu");
  const getSelectBaseId = createSignalBaseIdResolver("lumina-select");
  const getComboboxBaseId = createSignalBaseIdResolver("lumina-combobox");
  const getMultiselectBaseId = createSignalBaseIdResolver("lumina-multiselect");
  const normalizeTabsPart = (value) => {
    const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized.length > 0 ? normalized : "tab";
  };
  const getTabsIds = (ctx, value) => {
    const part = normalizeTabsPart(value);
    return {
      triggerId: `${ctx.baseId}-trigger-${part}`,
      panelId: `${ctx.baseId}-panel-${part}`
    };
  };
  const registerTabsValue = (ctx, value) => {
    registerOrderedValue(ctx.order, value);
  };
  const getTabsNavigationTarget = (ctx, current, key2) => getWrappedNavigationTarget(
    ctx.order,
    current,
    key2,
    ["ArrowRight", "ArrowDown"],
    ["ArrowLeft", "ArrowUp"]
  );
  const getDialogIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`
  });
  const getPopoverIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  });
  const getTooltipIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  });
  const getToastIds = (ctx) => ({
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`
  });
  const getMenuIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  });
  const getSelectIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  });
  const getComboboxIds = (ctx) => ({
    inputId: `${ctx.baseId}-input`,
    contentId: `${ctx.baseId}-content`
  });
  const getMultiselectIds = (ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  });
  const getCheckboxIds = (ctx) => ({
    rootId: `${ctx.baseId}-root`,
    indicatorId: `${ctx.baseId}-indicator`
  });
  const getMenuItemId = (ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getRadioItemId = (ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getSelectItemId = (ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getComboboxItemId = (ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getMultiselectItemId = (ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`;
  const getRadioIndicatorId = (itemId) => `${itemId}-indicator`;
  const getSelectIndicatorId = (itemId) => `${itemId}-indicator`;
  const getComboboxIndicatorId = (itemId) => `${itemId}-indicator`;
  const getMultiselectIndicatorId = (itemId) => `${itemId}-indicator`;
  const setDialogRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, dialogRestoreTargets, target);
  };
  const restoreDialogFocus = (ctx) => {
    restoreFocusFromMap(ctx, dialogRestoreTargets);
  };
  const setPopoverAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, popoverAnchorTargets, target);
  };
  const setPopoverRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, popoverRestoreTargets, target);
  };
  const restorePopoverFocus = (ctx) => {
    restoreFocusFromMap(ctx, popoverRestoreTargets);
  };
  const clearToastTimer = (signal) => {
    const key2 = signal;
    clearTimerHandle(toastTimers.get(key2));
    toastTimers.delete(key2);
  };
  const scheduleToastTimer = (ctx, duration) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      clearToastTimer(ctx.open);
      return;
    }
    if (typeof globalThis.setTimeout !== "function") return;
    const key2 = ctx.open;
    const existing = toastTimers.get(key2);
    if (existing !== void 0) return;
    const handle = globalThis.setTimeout(() => {
      toastTimers.delete(key2);
      ctx.open.set(false);
    }, duration);
    toastTimers.set(key2, handle);
  };
  const setMenuAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, menuAnchorTargets, target);
  };
  const setMenuRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, menuRestoreTargets, target);
  };
  const restoreMenuFocus = (ctx) => {
    restoreFocusFromMap(ctx, menuRestoreTargets);
  };
  const setSelectAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, selectAnchorTargets, target);
  };
  const setSelectRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, selectRestoreTargets, target);
  };
  const restoreSelectFocus = (ctx) => {
    restoreFocusFromMap(ctx, selectRestoreTargets);
  };
  const setComboboxAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, comboboxAnchorTargets, target);
  };
  const setComboboxRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, comboboxRestoreTargets, target);
  };
  const restoreComboboxFocus = (ctx) => {
    restoreFocusFromMap(ctx, comboboxRestoreTargets);
  };
  const setMultiselectAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, multiselectAnchorTargets, target);
  };
  const setMultiselectRestoreTarget = (ctx, target) => {
    setMapTarget(ctx, multiselectRestoreTargets, target);
  };
  const restoreMultiselectFocus = (ctx) => {
    restoreFocusFromMap(ctx, multiselectRestoreTargets);
  };
  const setTooltipAnchorTarget = (ctx, target) => {
    setMapTarget(ctx, tooltipAnchorTargets, target);
  };
  const registerMenuValue = (ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(menuTypeaheadLabels, ctx.open, value, label);
  };
  const getMenuActiveSignal = (ctx) => {
    const key2 = ctx.open;
    const existing = menuActiveValues.get(key2);
    if (existing) return existing;
    const created = new Signal("");
    menuActiveValues.set(key2, created);
    return created;
  };
  const setMenuActiveValue = (ctx, value) => {
    getMenuActiveSignal(ctx).set(typeof value === "string" ? value : "");
  };
  const getMenuActiveValue = (ctx) => {
    const explicit = getMenuActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    return ctx.order[0] ?? explicit ?? "";
  };
  const registerRadioValue = (ctx, value) => {
    registerOrderedValue(ctx.order, value);
  };
  const registerSelectValue = (ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(selectTypeaheadLabels, ctx.value, value, label);
  };
  const getSelectActiveSignal = (ctx) => {
    const key2 = ctx.value;
    const existing = selectActiveValues.get(key2);
    if (existing) return existing;
    const created = new Signal("");
    selectActiveValues.set(key2, created);
    return created;
  };
  const setSelectActiveValue = (ctx, value) => {
    getSelectActiveSignal(ctx).set(typeof value === "string" ? value : "");
  };
  const resolveSelectActiveValue = (ctx) => {
    const explicit = getSelectActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? "";
  };
  const getSelectActiveValue = (ctx) => resolveSelectActiveValue(ctx);
  const getSelectActiveDescendantId = (ctx) => {
    const activeValue = resolveSelectActiveValue(ctx);
    return activeValue ? getSelectItemId(ctx, activeValue) : null;
  };
  const acceptSelectActiveValue = (ctx) => {
    const nextValue = resolveSelectActiveValue(ctx);
    if (!nextValue) return "";
    ctx.value.set(nextValue);
    setSelectActiveValue(ctx, nextValue);
    return nextValue;
  };
  const registerComboboxValue = (ctx, value) => {
    registerOrderedValue(ctx.order, value);
  };
  const getComboboxActiveSignal = (ctx) => {
    const key2 = ctx.value;
    const existing = comboboxActiveValues.get(key2);
    if (existing) return existing;
    const created = new Signal("");
    comboboxActiveValues.set(key2, created);
    return created;
  };
  const setComboboxActiveValue = (ctx, value) => {
    getComboboxActiveSignal(ctx).set(typeof value === "string" ? value : "");
  };
  const resolveComboboxActiveValue = (ctx) => {
    const explicit = getComboboxActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? "";
  };
  const getComboboxActiveValue = (ctx) => resolveComboboxActiveValue(ctx);
  const getComboboxActiveDescendantId = (ctx) => {
    const activeValue = resolveComboboxActiveValue(ctx);
    return activeValue ? getComboboxItemId(ctx, activeValue) : null;
  };
  const acceptComboboxActiveValue = (ctx) => {
    const nextValue = resolveComboboxActiveValue(ctx);
    if (!nextValue) return "";
    ctx.value.set(nextValue);
    ctx.query.set(nextValue);
    setComboboxActiveValue(ctx, nextValue);
    return nextValue;
  };
  const registerMultiselectValue = (ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(multiselectTypeaheadLabels, ctx.open, value, label);
  };
  const getMultiselectActiveSignal = (ctx) => {
    const key2 = ctx.values;
    const existing = multiselectActiveValues.get(key2);
    if (existing) return existing;
    const created = new Signal("");
    multiselectActiveValues.set(key2, created);
    return created;
  };
  const setMultiselectActiveValue = (ctx, value) => {
    getMultiselectActiveSignal(ctx).set(typeof value === "string" ? value : "");
  };
  const getMultiselectActiveValue = (ctx) => {
    const explicit = getMultiselectActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    const selected = readStringSelection(ctx.values.get()).find(
      (entry) => ctx.order.includes(entry)
    );
    return selected ?? ctx.order[0] ?? "";
  };
  const getMenuNavigationTarget = (ctx, current, key2) => getWrappedNavigationTarget(ctx.order, current, key2, ["ArrowDown"], ["ArrowUp"]);
  const getMenuTypeaheadTarget = (ctx, current, key2) => getTypeaheadTarget(
    menuTypeaheadStates,
    ctx.open,
    ctx.order,
    menuTypeaheadLabels.get(ctx.open),
    current,
    key2
  );
  const getRadioNavigationTarget = (ctx, current, key2) => getWrappedNavigationTarget(
    ctx.order,
    current,
    key2,
    ["ArrowRight", "ArrowDown"],
    ["ArrowLeft", "ArrowUp"]
  );
  const getSelectNavigationTarget = (ctx, current, key2) => getClampedNavigationTarget(ctx.order, current, key2, ["ArrowDown"], ["ArrowUp"]);
  const getSelectTypeaheadTarget = (ctx, current, key2) => getTypeaheadTarget(
    selectTypeaheadStates,
    ctx.value,
    ctx.order,
    selectTypeaheadLabels.get(ctx.value),
    current,
    key2
  );
  const getComboboxNavigationTarget = (ctx, current, key2) => getWrappedNavigationTarget(
    ctx.order,
    current,
    key2,
    ["ArrowDown", "ArrowRight"],
    ["ArrowUp", "ArrowLeft"]
  );
  const getMultiselectNavigationTarget = (ctx, current, key2) => getClampedNavigationTarget(ctx.order, current, key2, ["ArrowDown"], ["ArrowUp"]);
  const getMultiselectTypeaheadTarget = (ctx, current, key2) => getTypeaheadTarget(
    multiselectTypeaheadStates,
    ctx.open,
    ctx.order,
    multiselectTypeaheadLabels.get(ctx.open),
    current,
    key2
  );
  const focusMenuItem = (documentLike, ctx, value) => focusElementById(documentLike, getMenuItemId(ctx, value));
  const focusRadioItem = (documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getRadioItemId(ctx, value), fallbackRoot);
  const focusSelectItem = (documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getSelectItemId(ctx, value), fallbackRoot);
  const focusComboboxItem = (documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getComboboxItemId(ctx, value), fallbackRoot);
  const focusMultiselectItem = (documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getMultiselectItemId(ctx, value), fallbackRoot);
  const closeMenu = (ctx) => {
    setMenuActiveValue(ctx, "");
    ctx.open.set(false);
    restoreMenuFocus(ctx);
  };
  const closeSelect = (ctx) => {
    setSelectActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreSelectFocus(ctx);
  };
  const closeCombobox = (ctx) => {
    setComboboxActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreComboboxFocus(ctx);
  };
  const closeMultiselect = (ctx) => {
    setMultiselectActiveValue(ctx, getMultiselectActiveValue(ctx));
    ctx.open.set(false);
    restoreMultiselectFocus(ctx);
  };
  const readStringSelection = (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  const toggleMultiselectValue = (ctx, value) => {
    const current = readStringSelection(ctx.values.get());
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
    ctx.values.set(next);
    return next;
  };
  const getPopoverAnchorRect = (ctx) => readAnchorRect(ctx, popoverAnchorTargets);
  const getMenuAnchorRect = (ctx) => readAnchorRect(ctx, menuAnchorTargets);
  const getTooltipAnchorRect = (ctx) => readAnchorRect(ctx, tooltipAnchorTargets);
  const getSelectAnchorRect = (ctx) => readAnchorRect(ctx, selectAnchorTargets);
  const getComboboxAnchorRect = (ctx) => readAnchorRect(ctx, comboboxAnchorTargets);
  const getMultiselectAnchorRect = (ctx) => readAnchorRect(ctx, multiselectAnchorTargets);
  const pickPopoverSide = (props) => {
    const value = props?.side;
    return value === "top" || value === "bottom" || value === "left" || value === "right" ? value : "bottom";
  };
  const pickPopoverAlign = (props) => {
    const value = props?.align;
    return value === "start" || value === "center" || value === "end" ? value : "center";
  };
  const pickPopoverOffset = (props) => {
    const value = props?.offset;
    return typeof value === "number" && Number.isFinite(value) ? value : 8;
  };
  const omitPopoverLayoutProps = (props) => {
    if (!props) return void 0;
    const next = { ...props };
    delete next.side;
    delete next.align;
    delete next.offset;
    return next;
  };
  const pickToastDuration = (props) => {
    const value = props?.duration;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const omitToastControlProps = (props) => {
    if (!props) return void 0;
    const next = { ...props };
    delete next.duration;
    return next;
  };
  const getPopoverContentStyle = (rect, props) => {
    const side = pickPopoverSide(props);
    const align = pickPopoverAlign(props);
    const offset = pickPopoverOffset(props);
    const style = {
      position: "fixed",
      zIndex: "1001"
    };
    if (!rect) {
      return {
        ...style,
        top: "16px",
        left: "16px"
      };
    }
    if (side === "top" || side === "bottom") {
      style.top = `${Math.round(side === "bottom" ? rect.bottom + offset : rect.top - offset)}px`;
      if (align === "start") {
        style.left = `${Math.round(rect.left)}px`;
      } else if (align === "end") {
        style.left = `${Math.round(rect.right)}px`;
        style.transform = side === "top" ? "translate(-100%, -100%)" : "translateX(-100%)";
      } else {
        style.left = `${Math.round(rect.left + rect.width / 2)}px`;
        style.transform = side === "top" ? "translate(-50%, -100%)" : "translateX(-50%)";
      }
      if (align === "start" && side === "top") {
        style.transform = "translateY(-100%)";
      }
      return style;
    }
    style.left = `${Math.round(side === "right" ? rect.right + offset : rect.left - offset)}px`;
    if (align === "start") {
      style.top = `${Math.round(rect.top)}px`;
    } else if (align === "end") {
      style.top = `${Math.round(rect.bottom)}px`;
      style.transform = side === "left" ? "translate(-100%, -100%)" : "translateY(-100%)";
    } else {
      style.top = `${Math.round(rect.top + rect.height / 2)}px`;
      style.transform = side === "left" ? "translate(-100%, -50%)" : "translateY(-50%)";
    }
    if (align === "start" && side === "left") {
      style.transform = "translateX(-100%)";
    }
    return style;
  };
  return {
    tabsContext,
    checkboxContext,
    radioGroupContext,
    radioItemContext,
    dialogContext,
    popoverContext,
    tooltipContext,
    toastContext,
    menuContext,
    selectContext,
    selectItemContext,
    comboboxContext,
    comboboxItemContext,
    multiselectContext,
    multiselectItemContext,
    getTabsBaseId,
    getCheckboxBaseId,
    getRadioBaseId,
    getDialogBaseId,
    getPopoverBaseId,
    getTooltipBaseId,
    getToastBaseId,
    getMenuBaseId,
    getSelectBaseId,
    getComboboxBaseId,
    getMultiselectBaseId,
    normalizeTabsPart,
    getTabsIds,
    registerTabsValue,
    getTabsNavigationTarget,
    getDialogIds,
    getPopoverIds,
    getTooltipIds,
    getToastIds,
    getMenuIds,
    getSelectIds,
    getComboboxIds,
    getMultiselectIds,
    getCheckboxIds,
    getMenuItemId,
    getRadioItemId,
    getSelectItemId,
    getComboboxItemId,
    getMultiselectItemId,
    getRadioIndicatorId,
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
    setSelectAnchorTarget,
    setSelectRestoreTarget,
    restoreSelectFocus,
    setComboboxAnchorTarget,
    setComboboxRestoreTarget,
    restoreComboboxFocus,
    setMultiselectAnchorTarget,
    setMultiselectRestoreTarget,
    restoreMultiselectFocus,
    setTooltipAnchorTarget,
    registerMenuValue,
    registerRadioValue,
    registerSelectValue,
    registerComboboxValue,
    registerMultiselectValue,
    getMenuActiveValue,
    setMenuActiveValue,
    getMenuNavigationTarget,
    getMenuTypeaheadTarget,
    getRadioNavigationTarget,
    getSelectNavigationTarget,
    getSelectTypeaheadTarget,
    getComboboxNavigationTarget,
    getMultiselectNavigationTarget,
    getMultiselectTypeaheadTarget,
    getSelectActiveValue,
    getSelectActiveDescendantId,
    setSelectActiveValue,
    acceptSelectActiveValue,
    getComboboxActiveValue,
    getComboboxActiveDescendantId,
    setComboboxActiveValue,
    acceptComboboxActiveValue,
    getMultiselectActiveValue,
    setMultiselectActiveValue,
    focusMenuItem,
    focusRadioItem,
    focusSelectItem,
    focusComboboxItem,
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
    pickPopoverAlign,
    pickPopoverOffset,
    omitPopoverLayoutProps,
    pickToastDuration,
    omitToastControlProps,
    getPopoverContentStyle
  };
};

// src/runtime/resource-core.ts
var resourceHooks = {};
var configureResourceCore = (hooks) => {
  resourceHooks = { ...resourceHooks, ...hooks };
};
var ResourceHandle = class {
  constructor(record) {
    this.record = record;
  }
};
var resourceCache = /* @__PURE__ */ new Map();
var normalizeResourceKey = (key2) => {
  if (typeof key2 === "string") return key2;
  if (typeof key2 === "number" || typeof key2 === "boolean" || typeof key2 === "bigint") {
    return String(key2);
  }
  if (key2 === null) return "null";
  if (key2 === void 0) return "undefined";
  if (resourceHooks.serializeKey) {
    try {
      return resourceHooks.serializeKey(key2);
    } catch {
    }
  }
  try {
    return JSON.stringify(key2);
  } catch {
    return String(key2);
  }
};
var normalizeResourceTags = (value) => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw.map((entry) => String(entry).trim()).filter((entry, index, list2) => entry.length > 0 && list2.indexOf(entry) === index);
};
var normalizeResourceOptions = (options) => {
  const candidate = options && typeof options === "object" ? options : {};
  const ttlRaw = candidate.ttlMs;
  const ttlMs = typeof ttlRaw === "number" && Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : 0;
  const enabled = candidate.enabled !== false;
  const staleWhileRevalidate = candidate.staleWhileRevalidate === true || candidate.swr === true;
  const abortOnRefresh = candidate.abortOnRefresh === true || candidate.abort === true;
  const scope = typeof candidate.scope === "string" && candidate.scope.trim() ? candidate.scope.trim() : "global";
  const requestId = typeof candidate.requestId === "string" && candidate.requestId.trim() ? candidate.requestId.trim() : "";
  const tags = normalizeResourceTags(candidate.tags ?? candidate.tag);
  const dependencies = normalizeResourceTags(candidate.dependencies ?? candidate.dependency ?? candidate.dependsOn);
  return { ttlMs, enabled, staleWhileRevalidate, abortOnRefresh, scope, requestId, tags, dependencies };
};
var resourceCacheIdentity = (key2, scope, requestId) => JSON.stringify([scope, requestId, key2]);
var resourceHasData = (record) => !!record.hasData.peek();
var createResourceRecord = (key2, loader, options) => ({
  key: key2,
  loader,
  ttlMs: options.ttlMs,
  enabled: options.enabled,
  staleWhileRevalidate: options.staleWhileRevalidate,
  abortOnRefresh: options.abortOnRefresh,
  scope: options.scope,
  requestId: options.requestId,
  tags: new Set(options.tags),
  dependencies: new Set(options.dependencies),
  data: new Signal(null),
  hasData: new Signal(false),
  error: new Signal(null),
  status: new Signal("idle"),
  promise: null,
  abortController: null,
  expiresAt: 0,
  version: 0
});
var startResourceLoad = (record, force = false) => {
  if (record.promise && !force) return record.promise;
  if (!record.enabled && !force) {
    return Promise.reject(new Error(`Resource '${record.key}' is disabled`));
  }
  const version = record.version + 1;
  record.version = version;
  if (force && record.abortOnRefresh) {
    record.abortController?.abort();
  }
  record.abortController = typeof AbortController === "undefined" ? null : new AbortController();
  record.status.set("loading");
  record.error.set(null);
  let loadResult;
  try {
    loadResult = Promise.resolve(record.loader(record.abortController?.signal));
  } catch (error) {
    loadResult = Promise.reject(error);
  }
  const promise = loadResult.then(
    (value) => {
      if (record.version !== version) {
        return value;
      }
      record.data.set(value);
      record.hasData.set(true);
      record.error.set(null);
      record.status.set("success");
      record.expiresAt = record.ttlMs > 0 ? Date.now() + record.ttlMs : Number.POSITIVE_INFINITY;
      record.promise = null;
      record.abortController = null;
      resourceHooks.notifyDevtools?.();
      return value;
    },
    (error) => {
      if (record.version !== version) {
        throw error;
      }
      record.error.set(error);
      record.status.set("error");
      record.expiresAt = 0;
      record.promise = null;
      record.abortController = null;
      resourceHooks.notifyDevtools?.();
      throw error;
    }
  );
  promise.catch(() => void 0);
  record.promise = promise;
  resourceHooks.notifyDevtools?.();
  return promise;
};
var ensureResourceCurrent = (record) => {
  if (record.promise) return;
  if (!record.enabled) return;
  if (!resourceHasData(record)) {
    if (record.status.peek() === "idle") {
      startResourceLoad(record);
    }
    return;
  }
  if (record.ttlMs > 0 && Date.now() >= record.expiresAt) {
    startResourceLoad(record);
  }
};
var discardResourcePending = (record, abort) => {
  record.version += 1;
  if (abort) {
    record.abortController?.abort();
  }
  record.abortController = null;
  record.promise = null;
};
var invalidateResourceRecord = (record) => {
  record.expiresAt = 0;
  discardResourcePending(record, record.abortOnRefresh);
  if (!record.hasData.peek() || !record.staleWhileRevalidate) {
    record.status.set("idle");
  }
  if (record.enabled) {
    startResourceLoad(record, true);
  }
};
var resolveResourceRecord = (key2, loader, options) => {
  const normalizedKey = normalizeResourceKey(key2);
  const normalizedOptions = normalizeResourceOptions(options);
  const cacheIdentity = resourceCacheIdentity(
    normalizedKey,
    normalizedOptions.scope,
    normalizedOptions.requestId
  );
  const existing = resourceCache.get(cacheIdentity);
  if (existing) {
    existing.loader = loader;
    existing.ttlMs = normalizedOptions.ttlMs;
    existing.enabled = normalizedOptions.enabled;
    existing.staleWhileRevalidate = normalizedOptions.staleWhileRevalidate;
    existing.abortOnRefresh = normalizedOptions.abortOnRefresh;
    existing.scope = normalizedOptions.scope;
    existing.requestId = normalizedOptions.requestId;
    existing.tags = new Set(normalizedOptions.tags);
    existing.dependencies = new Set(normalizedOptions.dependencies);
    ensureResourceCurrent(existing);
    return existing;
  }
  const record = createResourceRecord(normalizedKey, loader, normalizedOptions);
  resourceCache.set(cacheIdentity, record);
  ensureResourceCurrent(record);
  return record;
};
var asResourceHandle = (candidate, apiName) => {
  if (candidate instanceof ResourceHandle) {
    return candidate;
  }
  throw new Error(`${apiName} expects a resource handle`);
};
var listResourceRecords = () => Array.from(resourceCache.values());
var invalidateResourceKey = (key2) => {
  const normalizedKey = normalizeResourceKey(key2);
  let changed = false;
  for (const record of resourceCache.values()) {
    if (record.key !== normalizedKey) continue;
    invalidateResourceRecord(record);
    changed = true;
  }
  if (changed) resourceHooks.notifyDevtools?.();
  return changed;
};
var invalidateResourcePrefix = (prefix) => {
  const normalizedPrefix = String(prefix);
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.key.startsWith(normalizedPrefix)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var invalidateResourceTag = (tag) => {
  const normalizedTag = String(tag).trim();
  if (!normalizedTag) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.tags.has(normalizedTag)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var invalidateResourceDependency = (dependency) => {
  const normalizedDependency = String(dependency).trim();
  if (!normalizedDependency) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (!record.dependencies.has(normalizedDependency)) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var invalidateResourceScope = (scope) => {
  const normalizedScope = String(scope).trim() || "global";
  let count = 0;
  for (const record of resourceCache.values()) {
    if (record.scope !== normalizedScope) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var invalidateResourceRequest = (requestId) => {
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return 0;
  let count = 0;
  for (const record of resourceCache.values()) {
    if (record.requestId !== normalizedRequestId) continue;
    invalidateResourceRecord(record);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var clearResourceRecords = () => {
  if (resourceCache.size === 0) return;
  for (const record of resourceCache.values()) {
    discardResourcePending(record, true);
  }
  resourceCache.clear();
  resourceHooks.notifyDevtools?.();
};
var clearResourceScope = (scope) => {
  const normalizedScope = String(scope).trim() || "global";
  let count = 0;
  for (const [key2, record] of resourceCache) {
    if (record.scope !== normalizedScope) continue;
    discardResourcePending(record, true);
    resourceCache.delete(key2);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};
var clearResourceRequest = (requestId) => {
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return 0;
  let count = 0;
  for (const [key2, record] of resourceCache) {
    if (record.requestId !== normalizedRequestId) continue;
    discardResourcePending(record, true);
    resourceCache.delete(key2);
    count += 1;
  }
  if (count > 0) resourceHooks.notifyDevtools?.();
  return count;
};

// src/runtime/root-runtime.ts
var coerceRenderer2 = (candidate) => coerceRenderer(candidate);
var createRootRuntime = (deps) => {
  const mountReactiveView2 = (renderer, container, view) => {
    if (container == null) return deps.renderError("Render container is required");
    const root = deps.createRenderRoot(coerceRenderer(renderer), container);
    const frameManager = deps.createFrameManager();
    try {
      const effect = new Effect(() => {
        const node = deps.runWithFrameManager(frameManager, view);
        root.update(node);
      });
      return deps.createReactiveRoot(root, effect, frameManager);
    } catch (error) {
      return deps.renderError(deps.toRenderErrorMessage(error));
    }
  };
  const hydrateReactiveView2 = (renderer, container, view) => {
    if (container == null) return deps.renderError("Render container is required");
    const root = deps.createRenderRoot(coerceRenderer(renderer), container);
    const frameManager = deps.createFrameManager();
    let initialized = false;
    try {
      const effect = new Effect(() => {
        const node = deps.runWithFrameManager(frameManager, view);
        if (!initialized) {
          root.hydrate(node);
          initialized = true;
          return;
        }
        root.update(node);
      });
      return deps.createReactiveRoot(root, effect, frameManager);
    } catch (error) {
      return deps.renderError(deps.toRenderErrorMessage(error));
    }
  };
  return {
    coerceRenderer: coerceRenderer2,
    mountReactiveView: mountReactiveView2,
    hydrateReactiveView: hydrateReactiveView2
  };
};

// src/runtime/render-api.ts
var isThenable = (value) => !!value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
var createRenderApi = (deps) => {
  const render2 = {
    signal: (initial) => new Signal(initial),
    get: (signal) => signal.get(),
    peek: (signal) => signal.peek(),
    set: (signal, value) => signal.set(value),
    update_signal: (signal, updater) => signal.update(updater),
    memo: (compute) => new Memo(compute),
    memo_get: (memo) => memo.get(),
    memo_peek: (memo) => memo.peek(),
    memo_dispose: (memo) => memo.dispose(),
    effect: (fn) => new Effect(fn),
    dispose_effect: (effect) => {
      if (!isDisposableLike(effect)) return;
      try {
        effect.dispose();
      } catch {
      }
    },
    batch: (fn) => batch(fn),
    untrack: (fn) => untrack(fn),
    component: (componentFn, props, key2) => applyVNodeKey(deps.frameRuntime.component(componentFn, props, key2), key2),
    component_keyed: (componentFn, props, key2) => render2.component(componentFn, props, key2),
    render_app: (componentFn, props) => deps.appRuntime.renderAppVNode(componentFn, props),
    render_to_string_app: (componentFn, props) => deps.renderToString(deps.appRuntime.renderAppVNode(componentFn, props)),
    create_context: deps.frameRuntime.createContext,
    create_required_context: deps.frameRuntime.createRequiredContext,
    with_context: (context, value, renderChildren) => deps.frameRuntime.withContext(context, value, renderChildren),
    use_context: (context) => deps.frameRuntime.useContext(context),
    state: (initial) => deps.frameRuntime.state(initial),
    remember: (compute) => deps.frameRuntime.remember(compute),
    transition_presence: (open, props, durationMs, renderChildren) => deps.transitionRuntime.transitionPresence(open, props, durationMs, renderChildren),
    resource_create: (key2, loader, options) => new ResourceHandle(resolveResourceRecord(key2, loader, options)),
    resource_status: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_status");
      ensureResourceCurrent(handle.record);
      return handle.record.status.get();
    },
    resource_data: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_data");
      ensureResourceCurrent(handle.record);
      return handle.record.hasData.get() ? handle.record.data.get() : null;
    },
    resource_error: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_error");
      ensureResourceCurrent(handle.record);
      return handle.record.error.get();
    },
    resource_read: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_read");
      ensureResourceCurrent(handle.record);
      const status = handle.record.status.get();
      if (handle.record.hasData.get()) {
        return handle.record.data.get();
      }
      if (status === "loading" && handle.record.promise) {
        throw handle.record.promise;
      }
      const error = handle.record.error.get();
      if (error !== null) {
        throw error;
      }
      throw new Error(`Resource '${handle.record.key}' has no data`);
    },
    resource_refresh: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_refresh");
      handle.record.expiresAt = 0;
      return startResourceLoad(handle.record, true);
    },
    resource_submit: async (resource, submitting) => {
      if (submitting instanceof Signal) submitting.set(true);
      try {
        return await render2.resource_refresh(resource);
      } finally {
        if (submitting instanceof Signal) submitting.set(false);
      }
    },
    resource_submit_optimistic: async (resource, submitting, target, optimistic, previous) => {
      render2.resource_mutate(target, optimistic);
      try {
        return await render2.resource_submit(resource, submitting);
      } catch (error) {
        render2.resource_mutate(target, previous);
        throw error;
      }
    },
    resource_invalidate: (resource) => {
      const handle = asResourceHandle(resource, "render.resource_invalidate");
      invalidateResourceRecord(handle.record);
      deps.scheduleDevtoolsNotify();
    },
    resource_invalidate_key: (key2) => {
      const changed = invalidateResourceKey(key2);
      if (changed) deps.scheduleDevtoolsNotify();
      return changed;
    },
    resource_invalidate_prefix: (prefix) => {
      const count = invalidateResourcePrefix(prefix);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_tag: (tag) => {
      const count = invalidateResourceTag(tag);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_dependency: (dependency) => {
      const count = invalidateResourceDependency(dependency);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_scope: (scope) => {
      const count = invalidateResourceScope(scope);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_invalidate_request: (requestId) => {
      const count = invalidateResourceRequest(requestId);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_clear_cache: () => {
      clearResourceRecords();
      deps.scheduleDevtoolsNotify();
    },
    resource_clear_scope: (scope) => {
      const count = clearResourceScope(scope);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_clear_request: (requestId) => {
      const count = clearResourceRequest(requestId);
      if (count > 0) deps.scheduleDevtoolsNotify();
      return count;
    },
    resource_mutate: (resource, value) => {
      const handle = asResourceHandle(resource, "render.resource_mutate");
      handle.record.version += 1;
      handle.record.abortController?.abort();
      handle.record.abortController = null;
      handle.record.promise = null;
      handle.record.data.set(value);
      handle.record.hasData.set(true);
      handle.record.error.set(null);
      handle.record.status.set("success");
      handle.record.expiresAt = handle.record.ttlMs > 0 ? Date.now() + handle.record.ttlMs : Number.POSITIVE_INFINITY;
      deps.scheduleDevtoolsNotify();
      return handle.record.data.get();
    },
    suspense: (fallback, renderChildren) => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (!isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === "function" ? fallback() : fallback;
        return coerceRenderableToVNode(resolvedFallback);
      }
    },
    error_boundary: (fallback, renderChildren) => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === "function" ? fallback(error) : fallback;
        return coerceRenderableToVNode(resolvedFallback);
      }
    },
    show: (condition, renderChildren, fallback) => {
      const resolved = condition instanceof Signal ? condition.get() : condition;
      return resolved ? coerceRenderableToVNode(renderChildren()) : coerceRenderableToVNode(typeof fallback === "function" ? fallback() : fallback);
    },
    createResource: (key2, loader, options) => render2.resource_create(key2, loader, options),
    renderApp: (componentFn, props) => render2.render_app(componentFn, props),
    renderToStringApp: (componentFn, props) => render2.render_to_string_app(componentFn, props),
    renderToChunks: (node) => render2.render_to_chunks(node),
    renderToReadableStream: (node) => render2.render_to_readable_stream(node),
    transitionPresence: (open, props, durationMs, renderChildren) => render2.transition_presence(open, props, durationMs, renderChildren),
    resourceStatus: (resource) => render2.resource_status(resource),
    resourceData: (resource) => render2.resource_data(resource),
    resourceError: (resource) => render2.resource_error(resource),
    resourceRead: (resource) => render2.resource_read(resource),
    resourceRefresh: (resource) => render2.resource_refresh(resource),
    resourceSubmit: (resource, submitting) => render2.resource_submit(resource, submitting),
    resourceSubmitOptimistic: (resource, submitting, target, optimistic, previous) => render2.resource_submit_optimistic(resource, submitting, target, optimistic, previous),
    resourceInvalidate: (resource) => render2.resource_invalidate(resource),
    resourceInvalidateKey: (key2) => render2.resource_invalidate_key(key2),
    resourceInvalidatePrefix: (prefix) => render2.resource_invalidate_prefix(prefix),
    resourceInvalidateTag: (tag) => render2.resource_invalidate_tag(tag),
    resourceInvalidateDependency: (dependency) => render2.resource_invalidate_dependency(dependency),
    resourceInvalidateScope: (scope) => render2.resource_invalidate_scope(scope),
    resourceInvalidateRequest: (requestId) => render2.resource_invalidate_request(requestId),
    resourceClearCache: () => render2.resource_clear_cache(),
    resourceClearScope: (scope) => render2.resource_clear_scope(scope),
    resourceClearRequest: (requestId) => render2.resource_clear_request(requestId),
    resourceMutate: (resource, value) => render2.resource_mutate(resource, value),
    errorBoundary: (fallback, renderChildren) => render2.error_boundary(fallback, renderChildren),
    mountApp: (renderer, container, componentFn, props) => render2.mount_app(renderer, container, componentFn, props),
    hydrateApp: (renderer, container, componentFn, props) => render2.hydrate_app(renderer, container, componentFn, props),
    testingCreateDomHarness: () => render2.testing_create_dom_harness(),
    testingMountApp: (harness, componentFn, props) => render2.testing_mount_app(harness, componentFn, props),
    testingHydrateApp: (harness, componentFn, props) => render2.testing_hydrate_app(harness, componentFn, props),
    testingContainer: (harness) => render2.testing_container(harness),
    testingBody: (harness) => render2.testing_body(harness),
    testingGetById: (harness, id) => render2.testing_get_by_id(harness, id),
    testingGetByText: (scope, value) => render2.testing_get_by_text(scope, value),
    testingGetByRole: (scope, role) => {
      const matches = render2.testing_query_all_by_role(scope, role);
      return matches[0] ?? null;
    },
    testingGetByRoleName: (scope, role, name) => render2.testing_get_by_role_name(scope, role, name),
    testingQueryAllByRole: (scope, role) => render2.testing_query_all_by_role(scope, role),
    testingGetByLabel: (scope, label) => render2.testing_get_by_label(scope, label),
    testingGetByPlaceholder: (scope, placeholder) => render2.testing_get_by_placeholder(scope, placeholder),
    testingTextContent: (node) => render2.testing_text_content(node),
    testingClick: (node) => render2.testing_click(node),
    testingInput: (node, value) => render2.testing_input(node, value),
    testingChangeChecked: (node, checked) => render2.testing_change_checked(node, checked),
    testingKeydown: (node, key2, shiftKey) => render2.testing_keydown(node, key2, shiftKey),
    testingSubmit: (node) => render2.testing_submit(node),
    testingFlush: () => render2.testing_flush(),
    testingWaitFor: (check, attempts) => render2.testing_wait_for(check, attempts),
    devtoolsSnapshot: () => render2.devtools_snapshot(),
    installDevtools: (key2) => render2.install_devtools(key2),
    devtoolsRecordEvent: (type, label, detail) => render2.devtools_record_event(type, label, detail),
    devtoolsTimeline: () => render2.devtools_timeline(),
    devtoolsClearTimeline: () => render2.devtools_clear_timeline(),
    ssgPage: (body, options) => render2.ssg_page(body, options),
    ssgRenderApp: (componentFn, props, options) => render2.ssg_render_app(componentFn, props, options),
    ssgWritePage: (filePath, body, options) => render2.ssg_write_page(filePath, body, options),
    ssgWriteApp: (filePath, componentFn, props, options) => render2.ssg_write_app(filePath, componentFn, props, options),
    devtools_snapshot: () => deps.snapshotDevtools(),
    install_devtools: (key2) => deps.installLuminaDevtools(key2),
    devtools_record_event: (type, label, detail) => deps.recordDevtoolsEvent(type, label, detail),
    devtools_timeline: () => deps.readDevtoolsTimeline(),
    devtools_clear_timeline: () => deps.clearDevtoolsTimeline(),
    ssg_page: (body, options) => deps.appRuntime.ssgApi.renderPage(body, options),
    ssg_render_app: (componentFn, props, options) => deps.appRuntime.ssgApi.renderAppPage(
      componentFn,
      props,
      options
    ),
    ssg_write_page: (filePath, body, options) => deps.appRuntime.ssgApi.writePage(filePath, body, options),
    ssg_write_app: (filePath, componentFn, props, options) => deps.appRuntime.ssgApi.writeAppPage(
      filePath,
      componentFn,
      props,
      options
    ),
    mountCustomElement: (host, componentFn, options) => render2.mount_custom_element(host, componentFn, options),
    defineCustomElement: (tagName, componentFn, options) => render2.define_custom_element(tagName, componentFn, options),
    children: (input) => normalizeVNodeChildren(resolveChildrenInput(input)),
    slot: (slotValue, props, fallback = []) => {
      if (typeof slotValue === "function") {
        return coerceRenderableToVNode(slotValue(props));
      }
      if (slotValue === null || slotValue === void 0) {
        return coerceRenderableToVNode(fallback);
      }
      return coerceRenderableToVNode(slotValue);
    },
    slot_or: (slotValue, props, fallback) => render2.slot(slotValue, props, fallback),
    compose_handlers: (left, right) => composeHandlers(left, right),
    portal: (target, children2 = []) => vnodePortal(target, children2),
    portal_body: (children2 = []) => vnodePortal(null, children2),
    ...deps.headlessPrimitiveRender,
    selectRoot: (open, value, renderChildren) => render2.select_root(open, value, renderChildren),
    selectPortal: (children2 = []) => render2.select_portal(children2),
    selectTrigger: (props, children2 = []) => render2.select_trigger(props, children2),
    selectContent: (props, children2 = []) => render2.select_content(props, children2),
    selectItem: (value, props, renderChildren) => render2.select_item(value, props, renderChildren),
    selectIndicator: (props, children2 = []) => render2.select_indicator(props, children2),
    comboboxRoot: (open, value, query2, renderChildren) => render2.combobox_root(open, value, query2, renderChildren),
    comboboxPortal: (children2 = []) => render2.combobox_portal(children2),
    comboboxInput: (props, children2 = []) => render2.combobox_input(props, children2),
    comboboxContent: (props, children2 = []) => render2.combobox_content(props, children2),
    comboboxItem: (value, props, renderChildren) => render2.combobox_item(value, props, renderChildren),
    comboboxIndicator: (props, children2 = []) => render2.combobox_indicator(props, children2),
    multiselectRoot: (open, values, renderChildren) => render2.multiselect_root(open, values, renderChildren),
    multiselectPortal: (children2 = []) => render2.multiselect_portal(children2),
    multiselectTrigger: (props, children2 = []) => render2.multiselect_trigger(props, children2),
    multiselectContent: (props, children2 = []) => render2.multiselect_content(props, children2),
    multiselectItem: (value, props, renderChildren) => render2.multiselect_item(value, props, renderChildren),
    multiselectIndicator: (props, children2 = []) => render2.multiselect_indicator(props, children2),
    checkboxRoot: (checked, props, renderChildren) => render2.checkbox_root(checked, props, renderChildren),
    checkboxIndicator: (props, children2 = []) => render2.checkbox_indicator(props, children2),
    radioGroup: (value, props, renderChildren) => render2.radio_group(value, props, renderChildren),
    radioItem: (value, props, renderChildren) => render2.radio_item(value, props, renderChildren),
    radioIndicator: (props, children2 = []) => render2.radio_indicator(props, children2),
    portalBody: (children2 = []) => render2.portal_body(children2),
    tabsRoot: (value, renderChildren) => render2.tabs_root(value, renderChildren),
    tabsList: (props, renderChildren) => render2.tabs_list(props, renderChildren),
    tabsTrigger: (value, props, children2 = []) => render2.tabs_trigger(value, props, children2),
    tabsPanel: (value, props, children2 = []) => render2.tabs_panel(value, props, children2),
    dialogRoot: (open, renderChildren) => render2.dialog_root(open, renderChildren),
    dialogPortal: (children2 = []) => render2.dialog_portal(children2),
    dialogTrigger: (props, children2 = []) => render2.dialog_trigger(props, children2),
    dialogOverlay: (props) => render2.dialog_overlay(props),
    dialogContent: (props, children2 = []) => render2.dialog_content(props, children2),
    dialogTitle: (props, children2 = []) => render2.dialog_title(props, children2),
    dialogDescription: (props, children2 = []) => render2.dialog_description(props, children2),
    dialogClose: (props, children2 = []) => render2.dialog_close(props, children2),
    popoverRoot: (open, renderChildren) => render2.popover_root(open, renderChildren),
    popoverPortal: (children2 = []) => render2.popover_portal(children2),
    popoverTrigger: (props, children2 = []) => render2.popover_trigger(props, children2),
    popoverContent: (props, children2 = []) => render2.popover_content(props, children2),
    tooltipRoot: (open, renderChildren) => render2.tooltip_root(open, renderChildren),
    tooltipPortal: (children2 = []) => render2.tooltip_portal(children2),
    tooltipTrigger: (props, children2 = []) => render2.tooltip_trigger(props, children2),
    tooltipContent: (props, children2 = []) => render2.tooltip_content(props, children2),
    menuRoot: (open, renderChildren) => render2.menu_root(open, renderChildren),
    menuPortal: (children2 = []) => render2.menu_portal(children2),
    menuTrigger: (props, children2 = []) => render2.menu_trigger(props, children2),
    menuContent: (props, children2 = []) => render2.menu_content(props, children2),
    menuItem: (value, props, children2 = []) => render2.menu_item(value, props, children2),
    text: (value) => vnodeText(value),
    live_text: (signal) => vnodeLiveText(signal),
    liveText: (signal) => vnodeLiveText(signal),
    index_list: (itemsSignal, renderItem) => vnodeIndexList(itemsSignal, renderItem),
    indexList: (itemsSignal, renderItem) => vnodeIndexList(itemsSignal, renderItem),
    for_list: (itemsSignal, keyOf, renderItem) => vnodeForList(itemsSignal, keyOf, renderItem),
    forList: (itemsSignal, keyOf, renderItem) => vnodeForList(itemsSignal, keyOf, renderItem),
    keyed: (key2, child) => vnodeKeyed(key2, child),
    key: (key2, child) => render2.keyed(key2, child),
    element: (tag, props, children2 = []) => vnodeElement(tag, props, children2),
    props_empty: propsEmpty,
    props_class: propsClass,
    props_on_click: propsOnClick,
    props_on_click_delta: propsOnClickDelta,
    props_on_click_inc: propsOnClickInc,
    props_on_click_dec: propsOnClickDec,
    props_id: propsId,
    props_style: propsStyle,
    props_value: propsValue,
    props_checked: propsChecked,
    props_type: propsType,
    props_name: propsName,
    props_placeholder: propsPlaceholder,
    props_href: propsHref,
    props_disabled: propsDisabled,
    props_on_input: propsOnInput,
    props_on_change: propsOnChange,
    props_on_checked_change: propsOnCheckedChange,
    props_on_submit: propsOnSubmit,
    props_key: propsKey,
    props_attr: (name, value) => propsAttr(name, value),
    props_when: (condition, props) => propsWhen(condition, props),
    props_merge: (left, right) => mergeProps(left, right),
    dom_get_element_by_id: (id) => {
      const doc = globalThis.document;
      if (!doc || typeof doc.getElementById !== "function") return null;
      return doc.getElementById(id);
    },
    fragment: (children2 = []) => vnodeFragment(children2),
    is_vnode: (value) => isVNode(value),
    serialize: (node) => serializeVNode(node),
    parse: (json2) => parseVNode(json2),
    create_renderer: (renderer) => deps.coerceRenderer(renderer),
    create_dom_renderer: (options) => deps.createDomRenderer(options),
    create_ssr_renderer: () => deps.createSsrRenderer(),
    create_canvas_renderer: (options) => deps.createCanvasRenderer(options),
    create_terminal_renderer: () => deps.createTerminalRenderer(),
    render_to_string: (node) => deps.renderToString(node),
    render_to_chunks: (node) => deps.renderToChunks(node),
    render_to_readable_stream: (node) => deps.renderToReadableStream(node),
    render_to_terminal: (node) => deps.renderToTerminal(node),
    create_root: (renderer, container) => new deps.RenderRoot(deps.coerceRenderer(renderer), container),
    mount: (renderer, container, node) => {
      if (container == null) return deps.renderError("Render container is required");
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.mount(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    },
    hydrate: (renderer, container, node) => {
      if (container == null) return deps.renderError("Render container is required");
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.hydrate(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    },
    mount_reactive: (renderer, container, view) => deps.mountReactiveView(renderer, container, view),
    hydrate_reactive: (renderer, container, view) => deps.hydrateReactiveView(renderer, container, view),
    mount_app: (renderer, container, componentFn, props) => deps.appRuntime.mountReactiveApp(renderer, container, componentFn, props),
    hydrate_app: (renderer, container, componentFn, props) => deps.appRuntime.hydrateReactiveApp(renderer, container, componentFn, props),
    testing_create_dom_harness: () => deps.appRuntime.testingFacade.testing_create_dom_harness(),
    testing_mount_app: (harness, componentFn, props) => deps.appRuntime.testingFacade.testing_mount_app(
      harness,
      componentFn,
      props
    ),
    testing_hydrate_app: (harness, componentFn, props) => deps.appRuntime.testingFacade.testing_hydrate_app(
      harness,
      componentFn,
      props
    ),
    testing_container: (harness) => deps.appRuntime.testingFacade.testing_container(harness),
    testing_body: (harness) => deps.appRuntime.testingFacade.testing_body(harness),
    testing_get_by_id: (harness, id) => deps.appRuntime.testingFacade.testing_get_by_id(harness, id),
    testing_get_by_text: (scope, value) => deps.appRuntime.testingFacade.testing_get_by_text(scope, value),
    testing_get_by_role_name: (scope, role, name) => deps.appRuntime.testingFacade.testing_get_by_role_name(scope, role, name),
    testing_query_all_by_role: (scope, role) => deps.appRuntime.testingFacade.testing_query_all_by_role(scope, role),
    testing_get_by_label: (scope, label) => deps.appRuntime.testingFacade.testing_get_by_label(scope, label),
    testing_get_by_placeholder: (scope, placeholder) => deps.appRuntime.testingFacade.testing_get_by_placeholder(scope, placeholder),
    testing_text_content: (node) => deps.appRuntime.testingFacade.testing_text_content(node),
    testing_click: (node) => deps.appRuntime.testingFacade.testing_click(node),
    testing_input: (node, value) => deps.appRuntime.testingFacade.testing_input(node, value),
    testing_change_checked: (node, checked) => deps.appRuntime.testingFacade.testing_change_checked(node, checked),
    testing_keydown: (node, key2, shiftKey) => deps.appRuntime.testingFacade.testing_keydown(node, key2, shiftKey),
    testing_submit: (node) => deps.appRuntime.testingFacade.testing_submit(node),
    testing_flush: () => deps.appRuntime.testingFacade.testing_flush(),
    testing_wait_for: (check, attempts) => deps.appRuntime.testingFacade.testing_wait_for(check, attempts),
    mount_custom_element: (host, componentFn, options) => deps.appRuntime.mountCustomElementInternal(
      host,
      componentFn,
      options
    ),
    define_custom_element: (tagName, componentFn, options) => deps.appRuntime.defineCustomElementInternal(
      tagName,
      componentFn,
      options
    ),
    update: (root, node) => {
      if (!root || typeof root !== "object") return;
      if (typeof root.update !== "function") return;
      try {
        root.update(node);
      } catch {
      }
    },
    unmount: (root) => {
      if (!isUnmountableLike(root)) return;
      try {
        root.unmount();
      } catch {
      }
    },
    dispose_reactive: (root) => {
      if (!isDisposableLike(root)) return;
      try {
        root.dispose();
      } catch {
      }
    }
  };
  return render2;
};

// src/runtime/transition-runtime.ts
var clearTimerHandle2 = (handle) => {
  if (handle !== null && handle !== void 0) {
    clearTimeout(handle);
  }
};
var createTransitionRuntime = (hooks) => ({
  transitionPresence: (open, props, durationMs, children2) => {
    const mounted = hooks.state(open.peek());
    const phase = hooks.state(open.peek() ? "entered" : "hidden");
    const refs = hooks.remember(() => ({
      lastOpen: open.peek(),
      settleTimer: null,
      unmountTimer: null
    }));
    const openNow = open.get();
    let mountedNow = mounted.get();
    let phaseNow = phase.get();
    if (openNow !== refs.lastOpen) {
      refs.lastOpen = openNow;
      clearTimerHandle2(refs.settleTimer);
      clearTimerHandle2(refs.unmountTimer);
      refs.settleTimer = null;
      refs.unmountTimer = null;
      if (openNow) {
        if (!mountedNow) {
          mounted.set(true);
          mountedNow = true;
        }
        phase.set("enter-from");
        phaseNow = "enter-from";
        hooks.runMicrotask(() => {
          if (open.peek()) phase.set("enter-to");
        });
        refs.settleTimer = setTimeout(() => {
          if (open.peek()) phase.set("entered");
          refs.settleTimer = null;
        }, durationMs);
      } else if (mountedNow) {
        phase.set("exit-from");
        phaseNow = "exit-from";
        hooks.runMicrotask(() => {
          if (!open.peek()) phase.set("exit-to");
        });
        refs.unmountTimer = setTimeout(() => {
          if (!open.peek()) {
            mounted.set(false);
            phase.set("hidden");
          }
          refs.unmountTimer = null;
        }, durationMs);
      }
    }
    if (!openNow && !mountedNow) {
      return hooks.fragment([]);
    }
    const currentPhase = openNow && phaseNow === "hidden" ? "entered" : phaseNow;
    const currentProps = hooks.mergeProps(props, {
      "data-transition-state": currentPhase,
      "data-transition-open": openNow ? "true" : "false",
      "data-transition-duration": String(durationMs)
    });
    return hooks.element("div", currentProps, hooks.resolveChildrenInput(children2));
  }
});

// src/runtime/webgpu-runtime.ts
var getWebGpu = () => {
  const nav = globalThis.navigator;
  const gpu = nav?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return null;
  return gpu;
};
var WEBGPU_BUFFER_USAGE = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128
};
var WEBGPU_MAP_MODE = {
  READ: 1,
  WRITE: 2
};
var normalizeElementType = (typeHint) => {
  const value = String(typeHint ?? "i32").toLowerCase();
  switch (value) {
    case "u32":
      return "u32";
    case "f32":
      return "f32";
    case "f64":
      return "f64";
    case "u8":
      return "u8";
    case "i32":
    default:
      return "i32";
  }
};
var elementSize = (elementType) => {
  switch (elementType) {
    case "u8":
      return 1;
    case "f64":
      return 8;
    case "i32":
    case "u32":
    case "f32":
    default:
      return 4;
  }
};
var inferElementType = (data) => {
  if (data instanceof Uint8Array) return "u8";
  if (data instanceof Uint32Array) return "u32";
  if (data instanceof Float32Array) return "f32";
  if (data instanceof Float64Array) return "f64";
  return "i32";
};
var numberArrayToView = (values, elementType) => {
  switch (elementType) {
    case "u8":
      return Uint8Array.from(values.map((value) => Math.trunc(value) & 255));
    case "u32":
      return Uint32Array.from(values.map((value) => Math.trunc(value) >>> 0));
    case "f32":
      return Float32Array.from(values);
    case "f64":
      return Float64Array.from(values);
    case "i32":
    default:
      return Int32Array.from(values.map((value) => Math.trunc(value) | 0));
  }
};
var toTypedArray = (data, typeHint) => {
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const view2 = data;
    const elementType2 = inferElementType(view2);
    const elementCount2 = Math.max(0, Math.floor(view2.byteLength / elementSize(elementType2)));
    return { view: view2, elementType: elementType2, elementCount: elementCount2 };
  }
  const elementType = normalizeElementType(typeHint);
  const source = Array.isArray(data) ? data.map((value) => Number(value)) : [];
  const view = numberArrayToView(source, elementType);
  const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
  return { view, elementType, elementCount };
};
var readTypedArray = (buffer, elementType, elementCount) => {
  const maxCount = Math.max(0, elementCount);
  switch (elementType) {
    case "u8":
      return Array.from(new Uint8Array(buffer).subarray(0, maxCount));
    case "u32":
      return Array.from(new Uint32Array(buffer).subarray(0, maxCount));
    case "f32":
      return Array.from(new Float32Array(buffer).subarray(0, maxCount));
    case "f64":
      return Array.from(new Float64Array(buffer).subarray(0, maxCount));
    case "i32":
    default:
      return Array.from(new Int32Array(buffer).subarray(0, maxCount));
  }
};
var resolveWebGpuDevice = (device) => {
  if (device && typeof device.createBuffer === "function") {
    return device;
  }
  return null;
};
var alignTo4 = (value) => {
  const v = Math.max(4, Math.trunc(value));
  const mod = v % 4;
  return mod === 0 ? v : v + (4 - mod);
};
var hasWgslStageEntryPoint = (source, stage, entryPoint) => {
  const escaped = entryPoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`@${stage}[\\s\\S]*\\bfn\\s+${escaped}\\s*\\(`, "m");
  return pattern.test(source);
};
var createWebGpuRuntime = ({ resultOk, resultErr, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  let webgpuNextHandle = 1;
  const webgpuBuffers = /* @__PURE__ */ new Map();
  const webgpuPipelines = /* @__PURE__ */ new Map();
  const webgpuCanvases = /* @__PURE__ */ new Map();
  const newWebGpuHandle = () => {
    const handle = webgpuNextHandle;
    webgpuNextHandle += 1;
    return handle;
  };
  const formatError2 = (error) => {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
  };
  const webgpu2 = {
    GPU_BUFFER_USAGE_STORAGE: WEBGPU_BUFFER_USAGE.STORAGE,
    GPU_BUFFER_USAGE_UNIFORM: WEBGPU_BUFFER_USAGE.UNIFORM,
    GPU_BUFFER_USAGE_VERTEX: WEBGPU_BUFFER_USAGE.VERTEX,
    GPU_BUFFER_USAGE_INDEX: WEBGPU_BUFFER_USAGE.INDEX,
    GPU_BUFFER_USAGE_COPY_SRC: WEBGPU_BUFFER_USAGE.COPY_SRC,
    GPU_BUFFER_USAGE_COPY_DST: WEBGPU_BUFFER_USAGE.COPY_DST,
    is_available: () => getWebGpu() !== null,
    request_adapter: async () => {
      try {
        const gpu = getWebGpu();
        if (!gpu) return resultErr("WebGPU is not available in this environment");
        const adapter = await gpu.requestAdapter();
        if (!adapter) return resultErr("No WebGPU adapter available");
        return resultOk(adapter);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    request_device: async (adapter) => {
      try {
        const source = adapter ?? null;
        const resolved = source && typeof source.requestDevice === "function" ? source : await webgpu2.request_adapter();
        if (isEnumLike2(resolved) && getEnumTag2(resolved) === "Err") return resolved;
        const adapterLike = isEnumLike2(resolved) ? getEnumPayload2(resolved) : resolved;
        if (!adapterLike || typeof adapterLike.requestDevice !== "function") {
          return resultErr("Invalid WebGPU adapter");
        }
        const device = await adapterLike.requestDevice();
        return resultOk(device);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    buffer_create: (device, size, usage) => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const byteSize = alignTo4(Math.max(0, Math.trunc(size)));
        const buffer = resolvedDevice.createBuffer({
          size: byteSize,
          usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE
        });
        const id = newWebGpuHandle();
        webgpuBuffers.set(id, {
          id,
          kind: "buffer",
          device: resolvedDevice,
          buffer,
          usage: Number.isFinite(usage) ? Math.trunc(usage) : WEBGPU_BUFFER_USAGE.STORAGE,
          size: byteSize,
          elementType: "i32",
          elementCount: 0
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    buffer_write: (device, bufferHandle, data, offset = 0, typeHint = "i32") => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
        if (!entry) return resultErr(`Unknown WebGPU buffer handle ${bufferHandle}`);
        if (resolvedDevice && entry.device !== resolvedDevice) {
          return resultErr("WebGPU buffer handle does not belong to provided device");
        }
        const typed = toTypedArray(data, typeHint);
        const byteOffset = Math.max(0, Math.trunc(offset));
        entry.device.queue.writeBuffer(entry.buffer, byteOffset, typed.view, 0, typed.view.byteLength);
        entry.elementType = typed.elementType;
        entry.elementCount = typed.elementCount;
        return resultOk(void 0);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    buffer_read: async (device, bufferHandle, size, typeHint = "i32") => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
        if (!entry) return resultErr(`Unknown WebGPU buffer handle ${bufferHandle}`);
        if (resolvedDevice && entry.device !== resolvedDevice) {
          return resultErr("WebGPU buffer handle does not belong to provided device");
        }
        const readDevice = entry.device;
        const bytes = alignTo4(Math.max(0, Math.trunc(size)));
        const readBuffer = readDevice.createBuffer({
          size: bytes,
          usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ
        });
        const encoder = readDevice.createCommandEncoder();
        encoder.copyBufferToBuffer(entry.buffer, 0, readBuffer, 0, bytes);
        readDevice.queue.submit([encoder.finish()]);
        if (typeof readDevice.queue.onSubmittedWorkDone === "function") {
          await readDevice.queue.onSubmittedWorkDone();
        }
        if (typeof readBuffer.mapAsync !== "function" || typeof readBuffer.getMappedRange !== "function") {
          return resultErr("WebGPU readback buffer does not support mapAsync");
        }
        await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
        const mapped = readBuffer.getMappedRange();
        const elementType = normalizeElementType(typeHint ?? entry.elementType);
        const count = Math.max(0, Math.floor(bytes / elementSize(elementType)));
        const result = readTypedArray(mapped, elementType, count);
        readBuffer.unmap?.();
        readBuffer.destroy?.();
        return resultOk(result);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    buffer_destroy: (bufferHandle) => {
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return;
      entry.buffer.destroy?.();
      webgpuBuffers.delete(Math.trunc(bufferHandle));
    },
    uniform_create: (device, data, typeHint = "f32") => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const typed = toTypedArray(data, typeHint);
        const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
        const buffer = resolvedDevice.createBuffer({
          size: byteSize,
          usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST
        });
        resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
        const id = newWebGpuHandle();
        webgpuBuffers.set(id, {
          id,
          kind: "uniform",
          device: resolvedDevice,
          buffer,
          usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
          size: byteSize,
          elementType: typed.elementType,
          elementCount: typed.elementCount
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    uniform_update: (device, uniformHandle, data, typeHint = "f32") => {
      const entry = webgpuBuffers.get(Math.trunc(uniformHandle));
      if (!entry || entry.kind !== "uniform") return resultErr(`Unknown WebGPU uniform handle ${uniformHandle}`);
      return webgpu2.buffer_write(device, uniformHandle, data, 0, typeHint);
    },
    uniform_destroy: (uniformHandle) => {
      webgpu2.buffer_destroy(uniformHandle);
    },
    vertex_buffer: (device, data, typeHint = "f32") => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const typed = toTypedArray(data, typeHint);
        const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
        const buffer = resolvedDevice.createBuffer({
          size: byteSize,
          usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST
        });
        resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
        const id = newWebGpuHandle();
        webgpuBuffers.set(id, {
          id,
          kind: "vertex",
          device: resolvedDevice,
          buffer,
          usage: WEBGPU_BUFFER_USAGE.VERTEX | WEBGPU_BUFFER_USAGE.COPY_DST,
          size: byteSize,
          elementType: typed.elementType,
          elementCount: typed.elementCount
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    index_buffer: (device, data, typeHint = "u32") => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const typed = toTypedArray(data, typeHint);
        const byteSize = alignTo4(Math.max(typed.view.byteLength, 4));
        const buffer = resolvedDevice.createBuffer({
          size: byteSize,
          usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST
        });
        resolvedDevice.queue.writeBuffer(buffer, 0, typed.view, 0, typed.view.byteLength);
        const id = newWebGpuHandle();
        webgpuBuffers.set(id, {
          id,
          kind: "index",
          device: resolvedDevice,
          buffer,
          usage: WEBGPU_BUFFER_USAGE.INDEX | WEBGPU_BUFFER_USAGE.COPY_DST,
          size: byteSize,
          elementType: typed.elementType,
          elementCount: typed.elementCount
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    vertex_buffer_destroy: (handle) => {
      webgpu2.buffer_destroy(handle);
    },
    index_buffer_destroy: (handle) => {
      webgpu2.buffer_destroy(handle);
    },
    canvas: (selector) => {
      try {
        const documentRef = globalThis.document;
        if (!documentRef || typeof documentRef.querySelector !== "function") {
          return resultErr("DOM is not available in this environment");
        }
        const canvas = documentRef.querySelector(String(selector));
        if (!canvas || typeof canvas.getContext !== "function") {
          return resultErr(`Canvas not found for selector '${selector}'`);
        }
        const context = canvas.getContext("webgpu");
        if (!context) {
          return resultErr("Canvas does not support WebGPU context");
        }
        const format = getWebGpu()?.getPreferredCanvasFormat?.() ?? "bgra8unorm";
        const id = newWebGpuHandle();
        webgpuCanvases.set(id, {
          id,
          canvas,
          context,
          format,
          configuredDevice: null,
          hasSubmittedFrame: false
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    canvas_destroy: (canvasHandle) => {
      webgpuCanvases.delete(Math.trunc(canvasHandle));
    },
    present: (device, canvasHandle, _pipelineHandle) => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const canvasEntry = webgpuCanvases.get(Math.trunc(canvasHandle));
        if (!canvasEntry) return resultErr(`Unknown WebGPU canvas handle ${canvasHandle}`);
        if (!canvasEntry.hasSubmittedFrame) {
          return resultErr("No submitted render frame available for present");
        }
        if (typeof canvasEntry.context.configure === "function" && canvasEntry.configuredDevice !== resolvedDevice) {
          canvasEntry.context.configure({
            device: resolvedDevice,
            format: canvasEntry.format,
            alphaMode: "opaque"
          });
          canvasEntry.configuredDevice = resolvedDevice;
        }
        canvasEntry.hasSubmittedFrame = false;
        return resultOk(void 0);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    render_pipeline: async (device, config) => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const vertexShader = String(config?.vertex_shader ?? "");
        const fragmentShader = String(config?.fragment_shader ?? "");
        if (!vertexShader || !fragmentShader) return resultErr("Render pipeline requires vertex and fragment shaders");
        if (!hasWgslStageEntryPoint(vertexShader, "vertex", "main")) {
          return resultErr("Invalid WGSL vertex shader: expected @vertex fn main(...)");
        }
        if (!hasWgslStageEntryPoint(fragmentShader, "fragment", "main")) {
          return resultErr("Invalid WGSL fragment shader: expected @fragment fn main(...)");
        }
        const vertexModule = resolvedDevice.createShaderModule({ code: vertexShader });
        const fragmentModule = resolvedDevice.createShaderModule({ code: fragmentShader });
        const vertexLayouts = Array.isArray(config?.vertex_layout) ? config.vertex_layout : [];
        const buffers = vertexLayouts.length ? vertexLayouts.map((layout) => ({
          arrayStride: Math.max(0, Math.trunc(layout.stride)),
          attributes: [
            {
              shaderLocation: Math.max(0, Math.trunc(layout.attribute)),
              offset: Math.max(0, Math.trunc(layout.offset)),
              format: String(layout.format ?? "float32x4")
            }
          ]
        })) : [];
        const descriptor = {
          layout: "auto",
          vertex: { module: vertexModule, entryPoint: "main", buffers },
          fragment: {
            module: fragmentModule,
            entryPoint: "main",
            targets: [{ format: String(config?.format ?? "bgra8unorm") }]
          },
          primitive: {
            topology: String(config?.topology ?? "triangle-list")
          }
        };
        const pipeline = resolvedDevice.createRenderPipelineAsync ? await resolvedDevice.createRenderPipelineAsync(descriptor) : resolvedDevice.createRenderPipeline?.(descriptor);
        if (!pipeline) return resultErr("WebGPU device does not support render pipelines");
        const id = newWebGpuHandle();
        webgpuPipelines.set(id, {
          id,
          device: resolvedDevice,
          pipeline,
          config: {
            vertex_buffers: Array.isArray(config?.vertex_buffers) ? config.vertex_buffers.map((v) => Math.trunc(v)) : [],
            index_buffer: config?.index_buffer == null ? null : Math.trunc(config.index_buffer),
            uniforms: Array.isArray(config?.uniforms) ? config.uniforms.map((v) => Math.trunc(v)) : [],
            format: config?.format ? String(config.format) : void 0,
            topology: config?.topology ? String(config.topology) : void 0
          }
        });
        return resultOk(id);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    render_pipeline_destroy: (pipelineHandle) => {
      webgpuPipelines.delete(Math.trunc(pipelineHandle));
    },
    render_frame: (device, pipelineHandle, config) => {
      try {
        const resolvedDevice = resolveWebGpuDevice(device);
        if (!resolvedDevice) return resultErr("Invalid WebGPU device");
        const pipelineEntry = webgpuPipelines.get(Math.trunc(pipelineHandle));
        if (!pipelineEntry) return resultErr(`Unknown WebGPU pipeline handle ${pipelineHandle}`);
        const canvasEntry = webgpuCanvases.get(Math.trunc(config?.canvas));
        if (!canvasEntry) return resultErr(`Unknown WebGPU canvas handle ${config?.canvas}`);
        if (typeof canvasEntry.context.configure === "function" && canvasEntry.configuredDevice !== resolvedDevice) {
          canvasEntry.context.configure({
            device: resolvedDevice,
            format: canvasEntry.format,
            alphaMode: "opaque"
          });
          canvasEntry.configuredDevice = resolvedDevice;
        }
        const currentTexture = canvasEntry.context.getCurrentTexture?.();
        if (!currentTexture || typeof currentTexture.createView !== "function") {
          return resultErr("Canvas context does not provide current texture");
        }
        const encoder = resolvedDevice.createCommandEncoder();
        const pass = encoder.beginRenderPass?.({
          colorAttachments: [
            {
              view: currentTexture.createView(),
              clearValue: {
                r: Number(config?.clear_color?.[0] ?? 0),
                g: Number(config?.clear_color?.[1] ?? 0),
                b: Number(config?.clear_color?.[2] ?? 0),
                a: Number(config?.clear_color?.[3] ?? 1)
              },
              loadOp: "clear",
              storeOp: "store"
            }
          ]
        });
        if (!pass) return resultErr("WebGPU command encoder does not support render passes");
        pass.setPipeline?.(pipelineEntry.pipeline);
        for (const [slot2, bufferHandle] of (pipelineEntry.config.vertex_buffers ?? []).entries()) {
          const bufferEntry = webgpuBuffers.get(Math.trunc(bufferHandle));
          if (!bufferEntry) return resultErr(`Unknown WebGPU vertex buffer handle ${bufferHandle}`);
          pass.setVertexBuffer?.(slot2, bufferEntry.buffer);
        }
        for (const uniformHandle of pipelineEntry.config.uniforms ?? []) {
          const uniformEntry = webgpuBuffers.get(Math.trunc(uniformHandle));
          if (!uniformEntry || uniformEntry.kind !== "uniform") {
            return resultErr(`Unknown WebGPU uniform handle ${uniformHandle}`);
          }
        }
        const indexHandle = pipelineEntry.config.index_buffer;
        const shouldIndexed = !!config?.indexed || indexHandle !== null && indexHandle !== void 0;
        const drawCount = Math.max(0, Math.trunc(config?.draw_count ?? 0));
        if (shouldIndexed && indexHandle !== null && indexHandle !== void 0) {
          const indexEntry = webgpuBuffers.get(Math.trunc(indexHandle));
          if (!indexEntry) return resultErr(`Unknown WebGPU index buffer handle ${indexHandle}`);
          pass.setIndexBuffer?.(indexEntry.buffer, "uint32");
          pass.drawIndexed?.(drawCount || indexEntry.elementCount || 0, 1, 0, 0, 0);
        } else {
          pass.draw?.(drawCount, 1, 0, 0);
        }
        pass.end();
        resolvedDevice.queue.submit([encoder.finish()]);
        canvasEntry.hasSubmittedFrame = true;
        return webgpu2.present(resolvedDevice, canvasEntry.id, pipelineHandle);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    compute: async (wgsl, entryPoint, input, outputLength, workgroupSize = 64, typeHint = "i32") => {
      try {
        const deviceResult = await webgpu2.request_device(null);
        if (isEnumLike2(deviceResult) && getEnumTag2(deviceResult) === "Err") return deviceResult;
        const device = getEnumPayload2(deviceResult);
        const typedInput = toTypedArray(input, typeHint);
        const outLen = Math.max(0, Math.trunc(outputLength ?? typedInput.elementCount));
        const inputType = normalizeElementType(typeHint ?? typedInput.elementType);
        const inBytes = alignTo4(Math.max(typedInput.view.byteLength, 4));
        const outBytes = alignTo4(outLen * elementSize(inputType));
        const safeWorkgroupSize = Math.max(1, Math.trunc(workgroupSize));
        const dispatchCount = Math.max(1, Math.ceil(outLen / safeWorkgroupSize));
        const shaderSource = String(wgsl);
        if (!hasWgslStageEntryPoint(shaderSource, "compute", String(entryPoint))) {
          return resultErr(`Invalid WGSL compute shader: expected @compute fn ${String(entryPoint)}(...)`);
        }
        const shaderModule = device.createShaderModule({ code: shaderSource });
        const inputBuffer = device.createBuffer({
          size: inBytes,
          usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_DST
        });
        const outputBuffer = device.createBuffer({
          size: outBytes,
          usage: WEBGPU_BUFFER_USAGE.STORAGE | WEBGPU_BUFFER_USAGE.COPY_SRC
        });
        const readBuffer = device.createBuffer({
          size: outBytes,
          usage: WEBGPU_BUFFER_USAGE.COPY_DST | WEBGPU_BUFFER_USAGE.MAP_READ
        });
        device.queue.writeBuffer(inputBuffer, 0, typedInput.view, 0, typedInput.view.byteLength);
        const pipeline = device.createComputePipelineAsync ? await device.createComputePipelineAsync({
          layout: "auto",
          compute: { module: shaderModule, entryPoint: String(entryPoint) }
        }) : device.createComputePipeline({
          layout: "auto",
          compute: { module: shaderModule, entryPoint: String(entryPoint) }
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: inputBuffer } },
            { binding: 1, resource: { buffer: outputBuffer } }
          ]
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(dispatchCount, 1, 1);
        pass.end();
        encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outBytes);
        device.queue.submit([encoder.finish()]);
        if (typeof device.queue.onSubmittedWorkDone === "function") {
          await device.queue.onSubmittedWorkDone();
        }
        if (typeof readBuffer.mapAsync !== "function" || typeof readBuffer.getMappedRange !== "function") {
          return resultErr("WebGPU readback buffer does not support mapAsync");
        }
        await readBuffer.mapAsync(WEBGPU_MAP_MODE.READ);
        const mapped = readBuffer.getMappedRange();
        const result = readTypedArray(mapped, inputType, outLen);
        readBuffer.unmap?.();
        inputBuffer.destroy?.();
        outputBuffer.destroy?.();
        readBuffer.destroy?.();
        return resultOk(result);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    },
    compute_i32: async (wgsl, entryPoint, input, outputLength, workgroupSize = 64) => webgpu2.compute(wgsl, entryPoint, input, outputLength, workgroupSize, "i32"),
    __debug_counts: () => ({
      buffers: webgpuBuffers.size,
      pipelines: webgpuPipelines.size,
      canvases: webgpuCanvases.size
    })
  };
  return webgpu2;
};

// src/runtime/render-targets.ts
var resolveCanvasContext = (container, options) => {
  if (options?.context) return options.context;
  if (container && typeof container === "object") {
    const maybeContext = container;
    if (typeof maybeContext.fillText === "function" || typeof maybeContext.fillRect === "function") {
      return maybeContext;
    }
    const canvas = container;
    if (typeof canvas.getContext === "function") {
      const ctx = canvas.getContext("2d");
      if (ctx) return ctx;
    }
  }
  throw new Error("Canvas renderer requires a 2D context or canvas");
};
var setTerminalOutput = (container, text2) => {
  if (!container || typeof container !== "object") return;
  const sink = container;
  if (typeof sink.write === "function") {
    sink.write(text2);
    return;
  }
  if (typeof sink.textContent === "string" || "textContent" in sink) {
    sink.textContent = text2;
    return;
  }
  if (typeof sink.output === "string" || "output" in sink) {
    sink.output = text2;
    return;
  }
  sink.output = text2;
};
var createRenderTargetsRuntime = (deps) => {
  const drawCanvasNode = (ctx, node, state2) => {
    const kind = deps.getKind(node);
    if (kind === "text") {
      if (ctx.fillText) ctx.fillText(deps.getText(node) ?? "", state2.x, state2.y);
      return state2.y + state2.lineHeight;
    }
    if (kind === "live_text") {
      if (ctx.fillText) ctx.fillText(String(deps.getSignalValue(node) ?? ""), state2.x, state2.y);
      return state2.y + state2.lineHeight;
    }
    if (kind === "index_list") {
      let y2 = state2.y;
      for (const child of deps.materializeIndexListChildren(node, false)) {
        y2 = drawCanvasNode(ctx, child, { ...state2, y: y2 });
      }
      return y2;
    }
    if (kind === "for_list") {
      let y2 = state2.y;
      for (const child of deps.materializeForListChildren(node, false)) {
        y2 = drawCanvasNode(ctx, child, { ...state2, y: y2 });
      }
      return y2;
    }
    if (kind === "fragment" || kind === "portal") {
      let y2 = state2.y;
      for (const child of deps.getChildren(node)) {
        y2 = drawCanvasNode(ctx, child, { ...state2, y: y2 });
      }
      return y2;
    }
    const props = deps.getProps(node) ?? {};
    const tag = String(deps.getTag(node) ?? "").toLowerCase();
    if (typeof props.fill === "string") ctx.fillStyle = props.fill;
    if (typeof props.stroke === "string") ctx.strokeStyle = props.stroke;
    if (typeof props.font === "string") ctx.font = props.font;
    if (tag === "rect") {
      const x = Number(props.x ?? state2.x);
      const y2 = Number(props.y ?? state2.y);
      const width = Number(props.width ?? 50);
      const height = Number(props.height ?? 20);
      if (ctx.fillRect) ctx.fillRect(x, y2, width, height);
      if (ctx.strokeRect) ctx.strokeRect(x, y2, width, height);
      return Math.max(state2.y + state2.lineHeight, y2 + height + 4);
    }
    if (tag === "circle") {
      const x = Number(props.x ?? state2.x);
      const y2 = Number(props.y ?? state2.y);
      const radius = Number(props.radius ?? 10);
      if (ctx.beginPath && ctx.arc) {
        ctx.beginPath();
        ctx.arc(x, y2, radius, 0, Math.PI * 2);
        if (ctx.fill) ctx.fill();
        if (ctx.stroke) ctx.stroke();
      }
      return Math.max(state2.y + state2.lineHeight, y2 + radius + 4);
    }
    if (tag === "text") {
      const value = typeof props.value === "string" ? props.value : deps.getChildren(node).map((child) => deps.getText(child) ?? "").join("");
      const x = Number(props.x ?? state2.x);
      const y2 = Number(props.y ?? state2.y);
      if (ctx.fillText) ctx.fillText(value, x, y2);
      return Math.max(state2.y + state2.lineHeight, y2 + state2.lineHeight);
    }
    let y = state2.y;
    for (const child of deps.getChildren(node)) {
      y = drawCanvasNode(ctx, child, { ...state2, y });
    }
    return y;
  };
  const renderNodeToTerminalLines = (node, depth = 0) => {
    const indent = "  ".repeat(depth);
    const kind = deps.getKind(node);
    if (kind === "text") {
      return [`${indent}${deps.getText(node) ?? ""}`];
    }
    if (kind === "live_text") {
      return [`${indent}${String(deps.getSignalValue(node) ?? "")}`];
    }
    if (kind === "index_list") {
      return deps.materializeIndexListChildren(node, false).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    if (kind === "for_list") {
      return deps.materializeForListChildren(node, false).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    if (kind === "fragment" || kind === "portal") {
      return deps.getChildren(node).flatMap((child) => renderNodeToTerminalLines(child, depth));
    }
    const tag = deps.getTag(node) ?? "div";
    const head = `${indent}<${tag}>`;
    const children2 = deps.getChildren(node).flatMap((child) => renderNodeToTerminalLines(child, depth + 1));
    const tail = `${indent}</${tag}>`;
    return [head, ...children2, tail];
  };
  const renderToTerminal2 = (node) => renderNodeToTerminalLines(node).join("\n");
  const createCanvasRenderer2 = (options) => {
    let context = options?.context ?? null;
    return {
      mount(node, container) {
        context = resolveCanvasContext(container, options);
        const width = Number(options?.width ?? context.canvas?.width ?? 800);
        const height = Number(options?.height ?? context.canvas?.height ?? 600);
        if (options?.clear !== false && context.clearRect) {
          context.clearRect(0, 0, width, height);
        }
        drawCanvasNode(context, node, { x: 8, y: 20, lineHeight: 20 });
      },
      patch(_prev, next, container) {
        const ctx = context ?? resolveCanvasContext(container, options);
        context = ctx;
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (options?.clear !== false && ctx.clearRect) {
          ctx.clearRect(0, 0, width, height);
        }
        drawCanvasNode(ctx, next, { x: 8, y: 20, lineHeight: 20 });
      },
      unmount(container) {
        const ctx = context ?? resolveCanvasContext(container, options);
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (ctx.clearRect) ctx.clearRect(0, 0, width, height);
        context = null;
      }
    };
  };
  const createTerminalRenderer2 = () => ({
    mount(node, container) {
      setTerminalOutput(container, renderToTerminal2(node));
    },
    patch(_prev, next, container) {
      setTerminalOutput(container, renderToTerminal2(next));
    },
    hydrate(node, container) {
      setTerminalOutput(container, renderToTerminal2(node));
    },
    unmount(container) {
      setTerminalOutput(container, "");
    }
  });
  return {
    createCanvasRenderer: createCanvasRenderer2,
    createTerminalRenderer: createTerminalRenderer2,
    renderToTerminal: renderToTerminal2
  };
};

// src/lumina-runtime.ts
var coreRuntime = createCoreRuntime({
  formatValue,
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
var __lumina_index = coreRuntime.__lumina_index;
var Option2 = coreRuntime.Option;
var Result = coreRuntime.Result;
var systemRuntime = createSystemRuntime({
  formatValue,
  getOption: () => Option2,
  getResult: () => Result,
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
configureCollectionsRuntime({
  getOption: () => Option2,
  timeSleep: (ms) => systemRuntime.time.sleep(ms)
});
var toJsonString = systemRuntime.toJsonString;
var io = systemRuntime.io;
var str = systemRuntime.str;
var math = systemRuntime.math;
var opfs = systemRuntime.opfs;
var fs = systemRuntime.fs;
var path = systemRuntime.path;
var env = systemRuntime.env;
var process = systemRuntime.process;
var json = systemRuntime.json;
var http = systemRuntime.http;
var time = systemRuntime.time;
var regex = systemRuntime.regex;
var crypto = systemRuntime.crypto;
var channel = createChannelRuntime({
  getOption: () => Option2,
  getResult: () => Result,
  isEnumLike,
  getEnumTag
});
var async_channel = channel;
var concurrencyRuntime = createConcurrencyRuntime({
  getOption: () => Option2,
  getResult: () => Result,
  getChannel: () => channel,
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
var sync = concurrencyRuntime.sync;
var sab_channel = concurrencyRuntime.sab_channel;
var thread = concurrencyRuntime.thread;
var web_worker = concurrencyRuntime.web_worker;
var web_streams = concurrencyRuntime.web_streams;
var browserRuntime = createBrowserRuntime({
  optionSome: (value) => Option2.Some(value),
  optionNone: Option2.None,
  resultOk: (value) => Result.Ok(value),
  resultErr: (message) => Result.Err(message),
  createHashMap: () => HashMap.new()
});
var url = browserRuntime.url;
var web_storage = browserRuntime.web_storage;
var dom = browserRuntime.dom;
var router = browserRuntime.router;
var webgpu = createWebGpuRuntime({
  resultOk: (value) => Result.Ok(value),
  resultErr: (message) => Result.Err(message),
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
var runMicrotask = (fn) => {
  const queue = globalThis.queueMicrotask;
  if (typeof queue === "function") {
    queue(fn);
    return;
  }
  Promise.resolve().then(fn);
};
var devtools = createDevtoolsController({
  scheduleMicrotask: runMicrotask,
  snapshotRoot: (root, id) => ({
    id,
    current: root.root.currentNode(),
    frames: [
      ...Array.from(root.frameManager.rootFrame.keyedChildren.values()).map(snapshotComponentFrame),
      ...root.frameManager.rootFrame.unkeyedChildren.map(snapshotComponentFrame)
    ]
  }),
  snapshotResources: () => listResourceRecords().map(
    (record) => ({
      key: record.key,
      status: record.status.peek(),
      hasData: record.hasData.peek(),
      error: record.error.peek(),
      scope: record.scope,
      requestId: record.requestId,
      tags: Array.from(record.tags)
    })
  )
});
var registerDevtoolsSignal = (kind, signal) => devtools.registerSignal(kind, signal);
var unregisterDevtoolsSignal = (id) => {
  devtools.unregisterSignal(id);
};
var scheduleDevtoolsNotify = () => {
  devtools.scheduleNotify();
};
configureReactiveCore({
  cloneValue: __lumina_clone,
  equalsValue: runtimeEquals,
  scheduleMicrotask: runMicrotask,
  registerSignal: registerDevtoolsSignal,
  unregisterSignal: unregisterDevtoolsSignal,
  notifyDevtools: scheduleDevtoolsNotify
});
configureResourceCore({
  serializeKey: (key2) => {
    try {
      return toJsonString(key2, false);
    } catch {
      return String(key2);
    }
  },
  notifyDevtools: scheduleDevtoolsNotify
});
var createDomRenderer2 = (options) => createDomRenderer(options, runtimeEquals);
var ssrRuntime = createSsrRuntime({
  normalizeNodeForHtml: (node) => {
    if (node.kind === "index_list") {
      return vnodeElement(
        "lumina-index-list",
        indexListHostProps,
        materializeIndexListChildren(node, false)
      );
    }
    if (node.kind === "for_list") {
      return vnodeElement(
        "lumina-for-list",
        forListHostProps,
        materializeForListChildren(node, false)
      );
    }
    return node;
  },
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getKey: (node) => node.key,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
  getTarget: (node) => node.target
});
var createSsrRenderer = () => ssrRuntime.createRenderer();
var renderToString = (node) => ssrRuntime.renderToString(node);
var renderToChunks = (node) => Array.from(ssrRuntime.renderToChunks(node));
var renderToReadableStream = (node) => ssrRuntime.renderToReadableStream(node);
var renderTargetsRuntime = createRenderTargetsRuntime({
  getKind: (node) => node.kind,
  getTag: (node) => node.tag,
  getProps: (node) => node.props,
  getChildren: (node) => node.children ?? [],
  getText: (node) => node.text,
  getSignalValue: (node) => node.signal?.get(),
  materializeIndexListChildren: (node, tracked) => materializeIndexListChildren(node, tracked),
  materializeForListChildren: (node, tracked) => materializeForListChildren(node, tracked)
});
var frameRuntime = createFrameRuntime({
  coerceRenderable: (input) => coerceRenderableToVNode(input),
  createState: (initial) => new Signal(initial)
});
var transitionRuntime = createTransitionRuntime({
  state: (initial) => frameRuntime.state(initial),
  remember: frameRuntime.remember,
  mergeProps,
  element: vnodeElement,
  fragment: vnodeFragment,
  resolveChildrenInput: (children2) => normalizeVNodeChildren(resolveChildrenInput(children2)),
  runMicrotask
});
var runWithFrameManager2 = frameRuntime.runWithFrameManager;
var createCanvasRenderer = (options) => renderTargetsRuntime.createCanvasRenderer(options);
var renderToTerminal = (node) => renderTargetsRuntime.renderToTerminal(node);
var createTerminalRenderer = () => renderTargetsRuntime.createTerminalRenderer();
var RenderRoot2 = class extends RenderRoot {
};
var ReactiveRenderRoot2 = class extends ReactiveRenderRoot {
  constructor(root, effect, frameManager) {
    super(root, effect, frameManager, {
      onInit: (root2) => registerDevtoolsRoot(root2),
      onDispose: (root2) => unregisterDevtoolsRoot(root2)
    });
    this.root = root;
    this.effect = effect;
    this.frameManager = frameManager;
  }
};
var registerDevtoolsRoot = (root) => void devtools.registerRoot(root);
var unregisterDevtoolsRoot = (root) => devtools.unregisterRoot(root);
var toRenderErrorMessage = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Canvas renderer requires")) {
    return "Canvas renderer not available in this environment";
  }
  if (message.includes("Terminal renderer")) {
    return "Terminal renderer not available in this environment";
  }
  return message;
};
var rootRuntime = createRootRuntime({
  createRenderRoot: (renderer, container) => new RenderRoot2(renderer, container),
  createFrameManager: () => new FrameManager(),
  runWithFrameManager: runWithFrameManager2,
  createReactiveRoot: (root, effect, frameManager) => new ReactiveRenderRoot2(root, effect, frameManager),
  renderError: (message) => Result.Err(message),
  toRenderErrorMessage
});
var coerceRenderer3 = (candidate) => rootRuntime.coerceRenderer(candidate);
var mountReactiveView = (renderer, container, view) => rootRuntime.mountReactiveView(renderer, container, view);
var hydrateReactiveView = (renderer, container, view) => rootRuntime.hydrateReactiveView(renderer, container, view);
var appRuntime = createAppRuntime({
  createFrameManager: () => new FrameManager(),
  runWithFrameManager: runWithFrameManager2,
  component: (componentFn, props) => applyVNodeKey(frameRuntime.component(componentFn, props), void 0),
  createDomRenderer: (options) => createDomRenderer2(options),
  mountReactive: mountReactiveView,
  hydrateReactive: hydrateReactiveView,
  createSignal: (initial) => new Signal(initial),
  getSignal: (signal) => signal.get(),
  setSignal: (signal, value) => {
    signal.set(value);
  },
  isDisposableLike,
  disposeReactive: (root) => {
    if (!isDisposableLike(root)) return;
    root.dispose();
  },
  getGlobalDocument: () => globalThis.document,
  isVNode,
  renderToString,
  coerceRenderableToVNode: (value) => coerceRenderableToVNode(value),
  escapeHtml,
  resolvePath: resolvePathBasic,
  dirnamePath: dirnamePathBasic,
  getNodeBuiltinModule
});
var headlessUi = createHeadlessUiRuntime();
var headlessPrimitiveRender = createHeadlessPrimitivesRuntime({
  requireActiveFrameManager: frameRuntime.requireActiveFrameManager,
  headlessUi
});
var render = createRenderApi({
  frameRuntime,
  transitionRuntime,
  appRuntime,
  headlessPrimitiveRender,
  renderToString,
  renderToChunks,
  renderToReadableStream,
  renderToTerminal,
  createDomRenderer: createDomRenderer2,
  createSsrRenderer,
  createCanvasRenderer,
  createTerminalRenderer,
  coerceRenderer: coerceRenderer3,
  RenderRoot: RenderRoot2,
  mountReactiveView,
  hydrateReactiveView,
  renderError: (message) => Result.Err(message),
  toRenderErrorMessage,
  snapshotDevtools: () => devtools.snapshot(),
  installLuminaDevtools: (key2) => devtools.install(key2),
  recordDevtoolsEvent: (type, label, detail) => devtools.recordEvent(type, label, detail),
  readDevtoolsTimeline: () => devtools.timeline(),
  clearDevtoolsTimeline: () => devtools.clearTimeline(),
  scheduleDevtoolsNotify
});
var renderSurface = {
  createSignal: render.signal,
  get: render.get,
  set: render.set,
  createMemo: render.memo,
  createEffect: render.effect,
  batch: render.batch,
  untrack: render.untrack,
  component: render.component,
  component_keyed: render.component_keyed,
  renderApp: render.render_app,
  renderToStringApp: render.render_to_string_app,
  createContext: render.create_context,
  create_required_context: render.create_required_context,
  withContext: render.with_context,
  useContext: render.use_context,
  state: render.state,
  remember: render.remember,
  createResource: render.resource_create,
  resourceStatus: render.resource_status,
  resourceData: render.resource_data,
  resourceError: render.resource_error,
  resourceRead: render.resource_read,
  resourceRefresh: render.resource_refresh,
  resourceSubmit: render.resource_submit,
  resourceSubmitOptimistic: render.resource_submit_optimistic,
  resourceInvalidate: render.resource_invalidate,
  resourceInvalidateKey: render.resource_invalidate_key,
  resourceInvalidatePrefix: render.resource_invalidate_prefix,
  resourceInvalidateTag: render.resource_invalidate_tag,
  resourceInvalidateDependency: render.resource_invalidate_dependency,
  resourceInvalidateScope: render.resource_invalidate_scope,
  resourceInvalidateRequest: render.resource_invalidate_request,
  resourceClearCache: render.resource_clear_cache,
  resourceClearScope: render.resource_clear_scope,
  resourceClearRequest: render.resource_clear_request,
  resourceMutate: render.resource_mutate,
  suspense: render.suspense,
  errorBoundary: render.error_boundary,
  show: render.show,
  mountApp: render.mount_app,
  hydrateApp: render.hydrate_app,
  testingCreateDomHarness: render.testing_create_dom_harness,
  testingMountApp: render.testing_mount_app,
  testingHydrateApp: render.testing_hydrate_app,
  testingContainer: render.testing_container,
  testingBody: render.testing_body,
  testingGetById: render.testing_get_by_id,
  testingTextContent: render.testing_text_content,
  testingClick: render.testing_click,
  testingInput: render.testing_input,
  testingChangeChecked: render.testing_change_checked,
  testingKeydown: render.testing_keydown,
  testingSubmit: render.testing_submit,
  testingFlush: render.testing_flush,
  testingWaitFor: render.testing_wait_for,
  mountCustomElement: render.mount_custom_element,
  defineCustomElement: render.define_custom_element,
  children: render.children,
  slot: render.slot,
  slot_or: render.slot_or,
  compose_handlers: render.compose_handlers,
  portal: render.portal,
  portalBody: render.portal_body,
  tabsRoot: render.tabs_root,
  tabsList: render.tabs_list,
  tabsTrigger: render.tabs_trigger,
  tabsPanel: render.tabs_panel,
  dialogRoot: render.dialog_root,
  dialogPortal: render.dialog_portal,
  dialogTrigger: render.dialog_trigger,
  dialogOverlay: render.dialog_overlay,
  dialogContent: render.dialog_content,
  dialogTitle: render.dialog_title,
  dialogDescription: render.dialog_description,
  dialogClose: render.dialog_close,
  popoverRoot: render.popover_root,
  popoverPortal: render.popover_portal,
  popoverTrigger: render.popover_trigger,
  popoverContent: render.popover_content,
  tooltipRoot: render.tooltip_root,
  tooltipPortal: render.tooltip_portal,
  tooltipTrigger: render.tooltip_trigger,
  tooltipContent: render.tooltip_content,
  toastRoot: render.toast_root,
  toastPortal: render.toast_portal,
  toastContent: render.toast_content,
  toastTitle: render.toast_title,
  toastDescription: render.toast_description,
  toastClose: render.toast_close,
  menuRoot: render.menu_root,
  menuPortal: render.menu_portal,
  menuTrigger: render.menu_trigger,
  menuContent: render.menu_content,
  menuItem: render.menu_item,
  selectRoot: render.select_root,
  selectPortal: render.select_portal,
  selectTrigger: render.select_trigger,
  selectContent: render.select_content,
  selectItem: render.select_item,
  selectIndicator: render.select_indicator,
  comboboxRoot: render.combobox_root,
  comboboxPortal: render.combobox_portal,
  comboboxInput: render.combobox_input,
  comboboxContent: render.combobox_content,
  comboboxItem: render.combobox_item,
  comboboxIndicator: render.combobox_indicator,
  multiselectRoot: render.multiselect_root,
  multiselectPortal: render.multiselect_portal,
  multiselectTrigger: render.multiselect_trigger,
  multiselectContent: render.multiselect_content,
  multiselectItem: render.multiselect_item,
  multiselectIndicator: render.multiselect_indicator,
  checkboxRoot: render.checkbox_root,
  checkboxIndicator: render.checkbox_indicator,
  radioGroup: render.radio_group,
  radioItem: render.radio_item,
  radioIndicator: render.radio_indicator,
  vnode: render.element,
  text: render.text,
  liveText: render.liveText,
  indexList: render.indexList,
  forList: render.forList,
  keyed: render.keyed,
  key: render.key,
  mount_reactive: render.mount_reactive,
  props_empty: render.props_empty,
  props_class: render.props_class,
  props_on_click: render.props_on_click,
  props_on_click_delta: render.props_on_click_delta,
  props_on_click_inc: render.props_on_click_inc,
  props_on_click_dec: render.props_on_click_dec,
  props_id: render.props_id,
  props_style: render.props_style,
  props_value: render.props_value,
  props_checked: render.props_checked,
  props_type: render.props_type,
  props_name: render.props_name,
  props_placeholder: render.props_placeholder,
  props_href: render.props_href,
  props_disabled: render.props_disabled,
  props_on_input: render.props_on_input,
  props_on_change: render.props_on_change,
  props_on_checked_change: render.props_on_checked_change,
  props_on_submit: render.props_on_submit,
  props_key: render.props_key,
  props_attr: render.props_attr,
  props_when: render.props_when,
  props_merge: render.props_merge,
  dom_get_element_by_id: render.dom_get_element_by_id,
  transitionPresence: render.transition_presence,
  testingGetByText: render.testing_get_by_text,
  testingGetByRole: render.testingGetByRole,
  testingGetByRoleName: render.testingGetByRoleName,
  testingGetByLabel: render.testingGetByLabel,
  testingGetByPlaceholder: render.testingGetByPlaceholder,
  testingQueryAllByRole: render.testing_query_all_by_role,
  devtoolsSnapshot: render.devtools_snapshot,
  installDevtools: render.install_devtools,
  devtoolsRecordEvent: render.devtools_record_event,
  devtoolsTimeline: render.devtools_timeline,
  devtoolsClearTimeline: render.devtools_clear_timeline,
  ssgPage: render.ssg_page,
  ssgRenderApp: render.ssg_render_app,
  ssgWritePage: render.ssg_write_page,
  ssgWriteApp: render.ssg_write_app
};
var {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  batch: batch2,
  untrack: untrack2,
  component,
  component_keyed,
  renderApp,
  renderToStringApp,
  createContext,
  create_required_context,
  withContext,
  useContext,
  state,
  remember,
  createResource,
  resourceStatus,
  resourceData,
  resourceError,
  resourceRead,
  resourceRefresh,
  resourceSubmit,
  resourceSubmitOptimistic,
  resourceInvalidate,
  resourceInvalidateKey,
  resourceInvalidatePrefix,
  resourceInvalidateTag,
  resourceInvalidateDependency,
  resourceInvalidateScope,
  resourceInvalidateRequest,
  resourceClearCache,
  resourceClearScope,
  resourceClearRequest,
  resourceMutate,
  suspense,
  errorBoundary,
  show,
  mountApp,
  hydrateApp,
  testingCreateDomHarness,
  testingMountApp,
  testingHydrateApp,
  testingContainer,
  testingBody,
  testingGetById,
  testingTextContent,
  testingClick,
  testingInput,
  testingChangeChecked,
  testingKeydown,
  testingSubmit,
  testingFlush,
  testingWaitFor,
  mountCustomElement,
  defineCustomElement,
  children,
  slot,
  slot_or,
  compose_handlers,
  portal,
  portalBody,
  tabsRoot,
  tabsList,
  tabsTrigger,
  tabsPanel,
  dialogRoot,
  dialogPortal,
  dialogTrigger,
  dialogOverlay,
  dialogContent,
  dialogTitle,
  dialogDescription,
  dialogClose,
  popoverRoot,
  popoverPortal,
  popoverTrigger,
  popoverContent,
  tooltipRoot,
  tooltipPortal,
  tooltipTrigger,
  tooltipContent,
  toastRoot,
  toastPortal,
  toastContent,
  toastTitle,
  toastDescription,
  toastClose,
  menuRoot,
  menuPortal,
  menuTrigger,
  menuContent,
  menuItem,
  selectRoot,
  selectPortal,
  selectTrigger,
  selectContent,
  selectItem,
  selectIndicator,
  comboboxRoot,
  comboboxPortal,
  comboboxInput,
  comboboxContent,
  comboboxItem,
  comboboxIndicator,
  multiselectRoot,
  multiselectPortal,
  multiselectTrigger,
  multiselectContent,
  multiselectItem,
  multiselectIndicator,
  checkboxRoot,
  checkboxIndicator,
  radioGroup,
  radioItem,
  radioIndicator,
  vnode,
  text,
  liveText,
  indexList,
  forList,
  keyed,
  key,
  mount_reactive,
  props_empty,
  props_class,
  props_on_click,
  props_on_click_delta,
  props_on_click_inc,
  props_on_click_dec,
  props_id,
  props_style,
  props_value,
  props_checked,
  props_type,
  props_name,
  props_placeholder,
  props_href,
  props_disabled,
  props_on_input,
  props_on_change,
  props_on_checked_change,
  props_on_submit,
  props_key,
  props_attr,
  props_when,
  props_merge,
  dom_get_element_by_id,
  transitionPresence,
  testingGetByText,
  testingGetByRole,
  testingGetByRoleName,
  testingGetByLabel,
  testingGetByPlaceholder,
  testingQueryAllByRole,
  devtoolsSnapshot,
  installDevtools,
  devtoolsRecordEvent,
  devtoolsTimeline,
  devtoolsClearTimeline,
  ssgPage,
  ssgRenderApp,
  ssgWritePage,
  ssgWriteApp
} = renderSurface;
var reactive = {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  disposeEffect: render.dispose_effect,
  updateSignal: render.update_signal,
  batch: render.batch,
  untrack: render.untrack
};
var algebraRuntime = createAlgebraRuntime({
  Option: Option2,
  Result,
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
var functor = algebraRuntime.functor;
var applicative = algebraRuntime.applicative;
var monad = algebraRuntime.monad;
var foldable = algebraRuntime.foldable;
var traversable = algebraRuntime.traversable;
export {
  AtomicI32,
  BTreeMap,
  BTreeSet,
  Deque,
  Effect,
  HashMap,
  HashSet,
  LuminaPanic,
  Memo,
  Option2 as Option,
  PriorityQueue,
  ReactiveRenderRoot2 as ReactiveRenderRoot,
  Receiver,
  RenderRoot2 as RenderRoot,
  ResourceHandle,
  Result,
  Sender,
  Signal,
  Thread,
  ThreadHandle,
  Vec,
  __lumina_array_bounds_check,
  __lumina_array_literal,
  __lumina_clone,
  __lumina_debug,
  __lumina_eq,
  __lumina_fixed_array,
  __lumina_index,
  __lumina_range,
  __lumina_register_trait_impl,
  __lumina_slice,
  __lumina_stringify,
  __lumina_struct,
  __set,
  all_vec,
  any_vec,
  applicative,
  async_channel,
  batch2 as batch,
  btreemap,
  btreeset,
  channel,
  checkboxIndicator,
  checkboxRoot,
  children,
  chunk_vec,
  comboboxContent,
  comboboxIndicator,
  comboboxInput,
  comboboxItem,
  comboboxPortal,
  comboboxRoot,
  component,
  component_keyed,
  compose_handlers,
  count_q,
  count_vec,
  createCanvasRenderer,
  createContext,
  createDomRenderer2 as createDomRenderer,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createSsrRenderer,
  createTerminalRenderer,
  create_required_context,
  crypto,
  defineCustomElement,
  deque,
  devtoolsClearTimeline,
  devtoolsRecordEvent,
  devtoolsSnapshot,
  devtoolsTimeline,
  dialogClose,
  dialogContent,
  dialogDescription,
  dialogOverlay,
  dialogPortal,
  dialogRoot,
  dialogTitle,
  dialogTrigger,
  dom,
  dom_get_element_by_id,
  enumerate_vec,
  env,
  errorBoundary,
  filter_option,
  filter_vec,
  find_vec,
  first_q,
  flat_map_vec,
  flatten_vec,
  foldable,
  forList,
  formatValue,
  fs,
  functor,
  get,
  group_by_q,
  group_by_vec,
  hashmap,
  hashset,
  http,
  hydrateApp,
  indexList,
  installDevtools,
  intersperse_vec,
  io,
  isVNode,
  iter,
  join_all,
  join_q,
  join_vec,
  json,
  key,
  keyed,
  limit_q,
  list,
  liveText,
  map_vec,
  math,
  menuContent,
  menuItem,
  menuPortal,
  menuRoot,
  menuTrigger,
  monad,
  mountApp,
  mountCustomElement,
  mount_reactive,
  multiselectContent,
  multiselectIndicator,
  multiselectItem,
  multiselectPortal,
  multiselectRoot,
  multiselectTrigger,
  offset_q,
  opfs,
  order_by_desc_q,
  order_by_q,
  parseVNode,
  partition_vec,
  path,
  popoverContent,
  popoverPortal,
  popoverRoot,
  popoverTrigger,
  portal,
  portalBody,
  priority_queue,
  process,
  props_attr,
  props_checked,
  props_class,
  props_disabled,
  props_empty,
  props_href,
  props_id,
  props_key,
  props_merge,
  props_name,
  props_on_change,
  props_on_checked_change,
  props_on_click,
  props_on_click_dec,
  props_on_click_delta,
  props_on_click_inc,
  props_on_input,
  props_on_submit,
  props_placeholder,
  props_style,
  props_type,
  props_value,
  props_when,
  query,
  radioGroup,
  radioIndicator,
  radioItem,
  reactive,
  regex,
  remember,
  render,
  renderApp,
  renderToChunks,
  renderToReadableStream,
  renderToString,
  renderToStringApp,
  renderToTerminal,
  resourceClearCache,
  resourceClearRequest,
  resourceClearScope,
  resourceData,
  resourceError,
  resourceInvalidate,
  resourceInvalidateDependency,
  resourceInvalidateKey,
  resourceInvalidatePrefix,
  resourceInvalidateRequest,
  resourceInvalidateScope,
  resourceInvalidateTag,
  resourceMutate,
  resourceRead,
  resourceRefresh,
  resourceStatus,
  resourceSubmit,
  resourceSubmitOptimistic,
  reverse_vec,
  router,
  sab_channel,
  selectContent,
  selectIndicator,
  selectItem,
  selectPortal,
  selectRoot,
  selectTrigger,
  select_q,
  serializeVNode,
  set,
  show,
  skip_vec,
  slot,
  slot_or,
  sort_by_desc_vec,
  sort_by_vec,
  sort_vec,
  ssgPage,
  ssgRenderApp,
  ssgWriteApp,
  ssgWritePage,
  state,
  str,
  sum_vec,
  sum_vec_f64,
  suspense,
  sync,
  tabsList,
  tabsPanel,
  tabsRoot,
  tabsTrigger,
  take_vec,
  testingBody,
  testingChangeChecked,
  testingClick,
  testingContainer,
  testingCreateDomHarness,
  testingFlush,
  testingGetById,
  testingGetByLabel,
  testingGetByPlaceholder,
  testingGetByRole,
  testingGetByRoleName,
  testingGetByText,
  testingHydrateApp,
  testingInput,
  testingKeydown,
  testingMountApp,
  testingQueryAllByRole,
  testingSubmit,
  testingTextContent,
  testingWaitFor,
  text,
  thread,
  time,
  timeout,
  toJsonString,
  to_vec_q,
  toastClose,
  toastContent,
  toastDescription,
  toastPortal,
  toastRoot,
  toastTitle,
  tooltipContent,
  tooltipPortal,
  tooltipRoot,
  tooltipTrigger,
  transitionPresence,
  traversable,
  unique_vec,
  untrack2 as untrack,
  url,
  useContext,
  vec,
  vnode,
  vnodeElement,
  vnodeForList,
  vnodeFragment,
  vnodeIndexList,
  vnodeKeyed,
  vnodeLiveText,
  vnodePortal,
  vnodeText,
  web_storage,
  web_streams,
  web_worker,
  webgpu,
  where_q,
  window_vec,
  withContext,
  zip_vec
};