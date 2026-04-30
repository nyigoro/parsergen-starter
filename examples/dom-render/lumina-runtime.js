var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/frame-manager.ts
var nextContextId = 1;
function createContextToken(defaultValue) {
  return {
    id: nextContextId++,
    defaultValue,
    hasDefault: arguments.length > 0
  };
}
__name(createContextToken, "createContextToken");
var frameName = /* @__PURE__ */ __name((frame) => {
  if (!frame) return "unknown";
  if (!frame.componentFn) return "root";
  const name = frame.componentFn.name?.trim();
  return name && name.length > 0 ? name : "<anonymous component>";
}, "frameName");
var slotErrorPrefix = /* @__PURE__ */ __name((frame) => `Component '${frameName(frame)}' rendered an inconsistent local slot layout`, "slotErrorPrefix");
var _FrameManager = class _FrameManager {
  constructor() {
    __publicField(this, "renderEpoch", 0);
    __publicField(this, "currentFrame", null);
    __publicField(this, "rootFrame");
    __publicField(this, "nextFrameId", 1);
    __publicField(this, "currentContextScope", null);
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
  executeComponent(parentFrame, componentFn, key, props) {
    const frame = this.resolveFrame(parentFrame, componentFn, key);
    frame.contextScope = this.currentContextScope;
    frame.seenEpoch = this.renderEpoch;
    const result = this.renderFrame(frame, () => componentFn(props));
    return {
      frame,
      result
    };
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
        throw new Error(`${slotErrorPrefix(frame)}: slot ${slotIndex} was '${slot3.kind}' before but is now '${kind}'`);
      }
      return slot3.value;
    }
    if (frame.expectedSlotCount !== null) {
      throw new Error(`${slotErrorPrefix(frame)}: expected ${frame.expectedSlotCount} slot(s), but render tried to allocate slot ${slotIndex + 1}`);
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
    for (const [key, child] of staleKeyed) {
      frame.keyedChildren.delete(key);
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
  resolveFrame(parentFrame, componentFn, key) {
    if (key !== null && key !== void 0) {
      const existing2 = parentFrame.keyedChildren.get(key);
      if (existing2 && existing2.componentFn === componentFn && !existing2.disposed) {
        return existing2;
      }
      if (existing2) {
        this.disposeFrame(existing2, false);
      }
      const frame2 = this.createFrame(parentFrame, componentFn, key);
      parentFrame.keyedChildren.set(key, frame2);
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
      throw new Error(`${slotErrorPrefix(frame)}: expected ${frame.expectedSlotCount} slot(s), but render finished with ${frame.slotCursor}`);
    }
    this.sweepChildren(frame);
  }
  createFrame(parent, componentFn, key) {
    return {
      id: this.nextFrameId++,
      componentFn,
      parent,
      key,
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
__name(_FrameManager, "FrameManager");
var FrameManager = _FrameManager;

// src/runtime/custom-elements.ts
var readCustomElementAttributes = /* @__PURE__ */ __name((host, observedAttributes) => {
  const attrs = {};
  const element = host;
  for (const name of observedAttributes) {
    attrs[name] = typeof element.getAttribute === "function" ? element.getAttribute(name) : null;
  }
  return attrs;
}, "readCustomElementAttributes");
var buildCustomElementProps = /* @__PURE__ */ __name((host, options) => {
  const attrs = readCustomElementAttributes(host, options?.observedAttributes ?? []);
  if (typeof options?.mapProps === "function") {
    return options.mapProps(attrs, host);
  }
  return {
    ...options?.props ?? {},
    ...attrs
  };
}, "buildCustomElementProps");
var ensureCustomElementTarget = /* @__PURE__ */ __name((host, options) => {
  const element = host;
  if (!options?.useShadow) return host;
  if (element.shadowRoot) return element.shadowRoot;
  if (typeof element.attachShadow === "function") {
    return element.attachShadow({
      mode: "open"
    });
  }
  return host;
}, "ensureCustomElementTarget");
var createCustomElementsRuntime = /* @__PURE__ */ __name((hooks) => ({
  mountCustomElementHost: /* @__PURE__ */ __name((host, componentFn, options) => {
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
      updateProps: /* @__PURE__ */ __name((next) => {
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      }, "updateProps"),
      syncAttributes: /* @__PURE__ */ __name(() => {
        const next = buildCustomElementProps(host, options);
        hooks.setSignal(props, next);
        return hooks.getSignal(props);
      }, "syncAttributes"),
      disconnect: /* @__PURE__ */ __name(() => {
        if (hooks.isDisposableLike(root)) {
          hooks.disposeReactive(root);
        }
      }, "disconnect")
    };
  }, "mountCustomElementHost"),
  defineCustomElementClass: /* @__PURE__ */ __name((tagName, componentFn, options) => {
    var _a2;
    const BaseCtor = options?.baseClass ?? globalThis.HTMLElement ?? class {
    };
    const registry = options?.registry ?? globalThis.customElements;
    const runtime = createCustomElementsRuntime(hooks);
    const CustomElement = (_a2 = class extends BaseCtor {
      constructor() {
        super(...arguments);
        __publicField(this, "__luminaController");
      }
      static get observedAttributes() {
        return [
          ...options?.observedAttributes ?? []
        ];
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
    }, __name(_a2, "LuminaCustomElement"), _a2);
    if (registry?.define) {
      const existing = typeof registry.get === "function" ? registry.get(tagName) : void 0;
      if (!existing) {
        registry.define(tagName, CustomElement);
      }
    }
    return CustomElement;
  }, "defineCustomElementClass")
}), "createCustomElementsRuntime");

// src/runtime/ssg.ts
var asRecord = /* @__PURE__ */ __name((value) => value && typeof value === "object" ? value : {}, "asRecord");
var coerceSsgPageOptions = /* @__PURE__ */ __name((options) => {
  const candidate = asRecord(options);
  const headValue = candidate.head;
  const head = Array.isArray(headValue) ? headValue.map((entry) => String(entry)) : headValue == null ? [] : [
    String(headValue)
  ];
  return {
    title: typeof candidate.title === "string" ? candidate.title : "",
    lang: typeof candidate.lang === "string" && candidate.lang.length > 0 ? candidate.lang : "en",
    head,
    bodyClassName: typeof candidate.bodyClassName === "string" ? candidate.bodyClassName : "",
    appClassName: typeof candidate.appClassName === "string" ? candidate.appClassName : "",
    appId: typeof candidate.appId === "string" && candidate.appId.length > 0 ? candidate.appId : "app",
    hydrateModule: typeof candidate.hydrateModule === "string" ? candidate.hydrateModule : ""
  };
}, "coerceSsgPageOptions");
var createSsgApi = /* @__PURE__ */ __name((deps) => {
  const renderPage = /* @__PURE__ */ __name((body, options) => {
    const normalized = coerceSsgPageOptions(options);
    const bodyContent = deps.isVNode(body) ? deps.renderToString(body) : Array.isArray(body) || body && typeof body === "object" ? deps.renderToString(deps.coerceRenderableToVNode(body)) : String(body ?? "");
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      normalized.title ? `<title>${deps.escapeHtml(normalized.title)}</title>` : "",
      ...normalized.head
    ].filter((entry) => entry.length > 0).join("");
    const hydrateScript = normalized.hydrateModule ? `<script type="module" src="${deps.escapeHtml(normalized.hydrateModule)}"></script>` : "";
    const bodyClass = normalized.bodyClassName ? ` class="${deps.escapeHtml(normalized.bodyClassName)}"` : "";
    const appClass = normalized.appClassName ? ` class="${deps.escapeHtml(normalized.appClassName)}"` : "";
    return `<!DOCTYPE html><html lang="${deps.escapeHtml(normalized.lang)}"><head>${head}</head><body${bodyClass}><div id="${deps.escapeHtml(normalized.appId)}"${appClass}>${bodyContent}</div>${hydrateScript}</body></html>`;
  }, "renderPage");
  const writePage = /* @__PURE__ */ __name((filePath, body, options) => {
    const resolvedPath = deps.resolvePath(filePath);
    const fsModule = deps.getNodeBuiltinModule("node:fs");
    if (!fsModule?.mkdirSync || !fsModule.writeFileSync) {
      throw new Error("SSG write requires Node.js file system support");
    }
    fsModule.mkdirSync(deps.dirnamePath(resolvedPath), {
      recursive: true
    });
    fsModule.writeFileSync(resolvedPath, renderPage(body, options), "utf-8");
    return resolvedPath;
  }, "writePage");
  const renderAppPage = /* @__PURE__ */ __name((componentFn, props, options) => renderPage(deps.renderApp(componentFn, props), options), "renderAppPage");
  const writeAppPage = /* @__PURE__ */ __name((filePath, componentFn, props, options) => writePage(filePath, deps.renderApp(componentFn, props), options), "writeAppPage");
  return {
    renderPage,
    writePage,
    renderAppPage,
    writeAppPage
  };
}, "createSsgApi");

// src/testing-dom.ts
var createNodeListView = /* @__PURE__ */ __name((items) => {
  const view = {
    length: items.length,
    item: /* @__PURE__ */ __name((index) => items[index] ?? null, "item"),
    [Symbol.iterator]: function* () {
      yield* items;
    }
  };
  items.forEach((item, index) => {
    view[index] = item;
  });
  return view;
}, "createNodeListView");
var _TestingNode = class _TestingNode {
  constructor() {
    __publicField(this, "textContent", "");
    __publicField(this, "nodes", []);
    __publicField(this, "parentNode", null);
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
__name(_TestingNode, "TestingNode");
var TestingNode = _TestingNode;
var _TestingDocument = class _TestingDocument {
  constructor() {
    __publicField(this, "activeElement", null);
    __publicField(this, "body");
    this.body = new TestingElement("body", this);
  }
  createElement(tag) {
    return new TestingElement(tag, this);
  }
  createTextNode(value) {
    return new TestingTextNode(value);
  }
  getElementById(id) {
    const visit = /* @__PURE__ */ __name((node) => {
      for (const child of node.childNodes) {
        if (child instanceof TestingElement && child.getAttribute("id") === id) {
          return child;
        }
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }, "visit");
    return visit(this.body);
  }
  querySelector(selector) {
    if (selector === "body") return this.body;
    if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
    return null;
  }
};
__name(_TestingDocument, "TestingDocument");
var TestingDocument = _TestingDocument;
var _TestingElement = class _TestingElement extends TestingNode {
  constructor(tagName, ownerDocument) {
    super();
    __publicField(this, "tagName");
    __publicField(this, "attributes", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
    __publicField(this, "ownerDocument");
    __publicField(this, "style");
    __publicField(this, "boundingRect");
    __publicField(this, "value", "");
    __publicField(this, "checked", false);
    __publicField(this, "disabled", false);
    __publicField(this, "hidden", false);
    __publicField(this, "name", "");
    __publicField(this, "type", "");
    __publicField(this, "className", "");
    __publicField(this, "shadowRoot", null);
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.boundingRect = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0
    };
    this.style = {
      setProperty: /* @__PURE__ */ __name((name, value) => {
        this.style[name] = value;
      }, "setProperty")
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
    return {
      ...this.boundingRect
    };
  }
  attachShadow(_options) {
    if (!this.shadowRoot) {
      this.shadowRoot = new _TestingElement("shadow-root", this.ownerDocument);
      this.shadowRoot.parentNode = this;
    }
    return this.shadowRoot;
  }
};
__name(_TestingElement, "TestingElement");
var TestingElement = _TestingElement;
var _TestingTextNode = class _TestingTextNode extends TestingNode {
  constructor(value) {
    super();
    this.textContent = value;
  }
};
__name(_TestingTextNode, "TestingTextNode");
var TestingTextNode = _TestingTextNode;
var asTestingElement = /* @__PURE__ */ __name((value) => value instanceof TestingElement ? value : null, "asTestingElement");
var resolveTestingRoot = /* @__PURE__ */ __name((value) => {
  if (value instanceof TestingNode) return value;
  if (value && typeof value === "object") {
    const harnessBody = value.document?.body;
    if (harnessBody instanceof TestingElement) return harnessBody;
    const harnessContainer = value.container;
    if (harnessContainer instanceof TestingElement) return harnessContainer;
  }
  return null;
}, "resolveTestingRoot");
var walkTestingTree = /* @__PURE__ */ __name((root, visit) => {
  visit(root);
  for (const child of root.childNodes) {
    walkTestingTree(child, visit);
  }
}, "walkTestingTree");
var implicitRoleForElement = /* @__PURE__ */ __name((element) => {
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
}, "implicitRoleForElement");
var createEventBase = /* @__PURE__ */ __name((target) => ({
  currentTarget: target,
  target,
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
  stopPropagation() {
  }
}), "createEventBase");
var createTestingDomHarness = /* @__PURE__ */ __name(() => {
  const document = new TestingDocument();
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    document,
    container
  };
}, "createTestingDomHarness");
var getTestingHarnessContainer = /* @__PURE__ */ __name((harness) => harness && typeof harness === "object" && harness.container instanceof TestingElement ? harness.container : null, "getTestingHarnessContainer");
var getTestingHarnessBody = /* @__PURE__ */ __name((harness) => harness && typeof harness === "object" && harness.document instanceof TestingDocument ? harness.document.body : null, "getTestingHarnessBody");
var getTestingHarnessById = /* @__PURE__ */ __name((harness, id) => harness && typeof harness === "object" && harness.document instanceof TestingDocument ? harness.document.getElementById(id) : null, "getTestingHarnessById");
var getTestingHarnessByText = /* @__PURE__ */ __name((scope, value) => {
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
}, "getTestingHarnessByText");
var queryTestingHarnessByRole = /* @__PURE__ */ __name((scope, role) => {
  const root = resolveTestingRoot(scope);
  if (!root) return [];
  const matches = [];
  walkTestingTree(root, (node) => {
    if (!(node instanceof TestingElement)) return;
    const explicitRole = node.getAttribute("role");
    const effectiveRole = explicitRole ?? implicitRoleForElement(node);
    if (effectiveRole === role) {
      matches.push(node);
    }
  });
  return matches;
}, "queryTestingHarnessByRole");
var getTestingTextContent = /* @__PURE__ */ __name((node) => {
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
}, "getTestingTextContent");
var dispatchTestingClick = /* @__PURE__ */ __name((node) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.focus();
  element.listeners.get("click")?.(createEventBase(element));
}, "dispatchTestingClick");
var dispatchTestingInput = /* @__PURE__ */ __name((node, value) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.value = value;
  element.listeners.get("input")?.({
    ...createEventBase(element),
    target: element
  });
}, "dispatchTestingInput");
var dispatchTestingCheckedChange = /* @__PURE__ */ __name((node, checked) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.checked = checked;
  element.listeners.get("change")?.({
    ...createEventBase(element),
    target: element
  });
}, "dispatchTestingCheckedChange");
var dispatchTestingKeydown = /* @__PURE__ */ __name((node, key, shiftKey = false) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get("keydown")?.({
    ...createEventBase(element),
    key,
    shiftKey
  });
}, "dispatchTestingKeydown");
var dispatchTestingSubmit = /* @__PURE__ */ __name((node) => {
  const element = asTestingElement(node);
  if (!element) return;
  element.listeners.get("submit")?.(createEventBase(element));
}, "dispatchTestingSubmit");

// src/runtime/testing-facade.ts
var createTestingFacade = /* @__PURE__ */ __name((deps) => ({
  testing_create_dom_harness: /* @__PURE__ */ __name(() => {
    const harness = createTestingDomHarness();
    harness.renderer = deps.createRenderer(harness.document);
    return harness;
  }, "testing_create_dom_harness"),
  testing_mount_app: /* @__PURE__ */ __name((harness, componentFn, props) => deps.mountApp(harness, componentFn, props, false), "testing_mount_app"),
  testing_hydrate_app: /* @__PURE__ */ __name((harness, componentFn, props) => deps.mountApp(harness, componentFn, props, true), "testing_hydrate_app"),
  testing_container: /* @__PURE__ */ __name((harness) => getTestingHarnessContainer(harness), "testing_container"),
  testing_body: /* @__PURE__ */ __name((harness) => getTestingHarnessBody(harness), "testing_body"),
  testing_get_by_id: /* @__PURE__ */ __name((harness, id) => getTestingHarnessById(harness, id), "testing_get_by_id"),
  testing_get_by_text: /* @__PURE__ */ __name((scope, value) => getTestingHarnessByText(scope, value), "testing_get_by_text"),
  testing_get_by_role: /* @__PURE__ */ __name((scope, role) => queryTestingHarnessByRole(scope, role)[0] ?? null, "testing_get_by_role"),
  testing_query_all_by_role: /* @__PURE__ */ __name((scope, role) => queryTestingHarnessByRole(scope, role), "testing_query_all_by_role"),
  testing_text_content: /* @__PURE__ */ __name((node) => getTestingTextContent(node), "testing_text_content"),
  testing_click: /* @__PURE__ */ __name((node) => dispatchTestingClick(node), "testing_click"),
  testing_input: /* @__PURE__ */ __name((node, value) => dispatchTestingInput(node, value), "testing_input"),
  testing_change_checked: /* @__PURE__ */ __name((node, checked) => dispatchTestingCheckedChange(node, checked), "testing_change_checked"),
  testing_keydown: /* @__PURE__ */ __name((node, key, shiftKey) => dispatchTestingKeydown(node, key, shiftKey ?? false), "testing_keydown"),
  testing_submit: /* @__PURE__ */ __name((node) => dispatchTestingSubmit(node), "testing_submit")
}), "createTestingFacade");

// src/runtime/app-runtime.ts
var createAppRuntime = /* @__PURE__ */ __name((deps) => {
  const renderAppVNode = /* @__PURE__ */ __name((componentFn, props) => deps.runWithFrameManager(deps.createFrameManager(), () => deps.component(componentFn, props)), "renderAppVNode");
  const mountReactiveApp = /* @__PURE__ */ __name((renderer, container, componentFn, props) => deps.mountReactive(renderer, container, () => deps.component(componentFn, props)), "mountReactiveApp");
  const hydrateReactiveApp = /* @__PURE__ */ __name((renderer, container, componentFn, props) => deps.hydrateReactive(renderer, container, () => deps.component(componentFn, props)), "hydrateReactiveApp");
  const mountTestingApp = /* @__PURE__ */ __name((harness, componentFn, props, hydrate = false) => {
    const renderer = harness.renderer ?? deps.createDomRenderer({
      document: harness.document
    });
    harness.renderer = renderer;
    const root = hydrate ? hydrateReactiveApp(renderer, harness.container, componentFn, props) : mountReactiveApp(renderer, harness.container, componentFn, props);
    harness.root = root;
    return root;
  }, "mountTestingApp");
  const testingFacade = createTestingFacade({
    createRenderer: /* @__PURE__ */ __name((documentLike) => deps.createDomRenderer({
      document: documentLike
    }), "createRenderer"),
    mountApp: /* @__PURE__ */ __name((harness, componentFn, props, hydrate) => mountTestingApp(harness, componentFn, props, hydrate), "mountApp")
  });
  const ssgApi = createSsgApi({
    isVNode: deps.isVNode,
    renderToString: deps.renderToString,
    coerceRenderableToVNode: deps.coerceRenderableToVNode,
    escapeHtml: deps.escapeHtml,
    resolvePath: deps.resolvePath,
    dirnamePath: deps.dirnamePath,
    getNodeBuiltinModule: deps.getNodeBuiltinModule,
    renderApp: /* @__PURE__ */ __name((componentFn, props) => renderAppVNode(componentFn, props), "renderApp")
  });
  const customElementsRuntime = createCustomElementsRuntime({
    createRenderer: /* @__PURE__ */ __name((documentLike) => deps.createDomRenderer({
      document: documentLike
    }), "createRenderer"),
    createSignal: deps.createSignal,
    getSignal: deps.getSignal,
    setSignal: deps.setSignal,
    createView: /* @__PURE__ */ __name((componentFn, propsSignal) => () => deps.component(componentFn, deps.getSignal(propsSignal)), "createView"),
    mountReactive: deps.mountReactive,
    isDisposableLike: deps.isDisposableLike,
    disposeReactive: deps.disposeReactive,
    getGlobalDocument: deps.getGlobalDocument
  });
  const mountCustomElementInternal = /* @__PURE__ */ __name((host, componentFn, options) => customElementsRuntime.mountCustomElementHost(host, componentFn, options), "mountCustomElementInternal");
  const defineCustomElementInternal = /* @__PURE__ */ __name((tagName, componentFn, options) => customElementsRuntime.defineCustomElementClass(tagName, componentFn, options), "defineCustomElementInternal");
  return {
    renderAppVNode,
    mountReactiveApp,
    hydrateReactiveApp,
    testingFacade,
    ssgApi,
    mountCustomElementInternal,
    defineCustomElementInternal
  };
}, "createAppRuntime");

// src/runtime/devtools.ts
var snapshotComponentFrame = /* @__PURE__ */ __name((frame) => ({
  id: frame.id,
  name: frame.componentFn?.name?.trim() || (frame.componentFn ? "<anonymous component>" : "root"),
  key: frame.key ?? null,
  slots: frame.slots.map((slot2) => ({
    kind: slot2.kind
  })),
  children: [
    ...Array.from(frame.keyedChildren.values()).map(snapshotComponentFrame),
    ...frame.unkeyedChildren.map(snapshotComponentFrame)
  ]
}), "snapshotComponentFrame");
var createDevtoolsController = /* @__PURE__ */ __name((deps) => {
  let nextSignalId = 1;
  let nextRootId = 1;
  let notifyPending = false;
  const signalEntries = /* @__PURE__ */ new Map();
  const roots = /* @__PURE__ */ new Map();
  const rootIds = /* @__PURE__ */ new WeakMap();
  const listeners = /* @__PURE__ */ new Set();
  const snapshot = /* @__PURE__ */ __name(() => ({
    roots: Array.from(roots.entries()).map(([id, root]) => deps.snapshotRoot(root, id)),
    resources: deps.snapshotResources(),
    signals: Array.from(signalEntries.entries()).map(([id, entry]) => ({
      id,
      kind: entry.kind,
      value: entry.source.peek()
    }))
  }), "snapshot");
  const scheduleNotify = /* @__PURE__ */ __name(() => {
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
  }, "scheduleNotify");
  const subscribe = /* @__PURE__ */ __name((listener) => {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  }, "subscribe");
  return {
    registerSignal(kind, source) {
      const id = nextSignalId++;
      signalEntries.set(id, {
        kind,
        source
      });
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
    snapshot,
    subscribe,
    install(key = "__LUMINA_DEVTOOLS__") {
      const globalRecord = globalThis;
      const handle = {
        version: "beta",
        snapshot: /* @__PURE__ */ __name(() => snapshot(), "snapshot"),
        subscribe
      };
      globalRecord[key] = handle;
      return handle;
    },
    scheduleNotify
  };
}, "createDevtoolsController");

// src/runtime/browser-runtime.ts
var isUrlRecord = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && typeof value.href === "string" && typeof value.origin === "string", "isUrlRecord");
var normalizeProtocol = /* @__PURE__ */ __name((value) => {
  const base = String(value ?? "").trim();
  if (!base) return "";
  return base.endsWith(":") ? base : `${base}:`;
}, "normalizeProtocol");
var toUrlRecord = /* @__PURE__ */ __name((raw) => ({
  href: raw.href,
  origin: raw.origin,
  protocol: raw.protocol,
  host: raw.host,
  pathname: raw.pathname,
  search: raw.search,
  hash: raw.hash
}), "toUrlRecord");
var emptyUrlRecord = /* @__PURE__ */ __name(() => ({
  href: "",
  origin: "",
  protocol: "",
  host: "",
  pathname: "",
  search: "",
  hash: ""
}), "emptyUrlRecord");
var coerceToUrl = /* @__PURE__ */ __name((value) => {
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
}, "coerceToUrl");
var asStorageLike = /* @__PURE__ */ __name((value) => {
  if (!value || typeof value !== "object") return null;
  const candidate = value;
  if (typeof candidate.getItem !== "function" || typeof candidate.setItem !== "function" || typeof candidate.removeItem !== "function" || typeof candidate.clear !== "function") {
    return null;
  }
  return candidate;
}, "asStorageLike");
var createBrowserRuntime = /* @__PURE__ */ __name((deps) => {
  const webStorageLocalFallback = /* @__PURE__ */ new Map();
  const webStorageSessionFallback = /* @__PURE__ */ new Map();
  let domNextHandle = 1;
  let domNextEventHandle = 1;
  const domElements = /* @__PURE__ */ new Map();
  const domElementHandles = /* @__PURE__ */ new WeakMap();
  const domEvents = /* @__PURE__ */ new Map();
  const routerPopStateHandlers = /* @__PURE__ */ new Map();
  const browserLocalStorage = /* @__PURE__ */ __name(() => asStorageLike(globalThis.localStorage), "browserLocalStorage");
  const browserSessionStorage = /* @__PURE__ */ __name(() => asStorageLike(globalThis.sessionStorage), "browserSessionStorage");
  const webStorageGet = /* @__PURE__ */ __name((scope, key) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        const value = storage.getItem(String(key));
        return value == null ? deps.optionNone : deps.optionSome(value);
      } catch {
        return deps.optionNone;
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    return fallback.has(String(key)) ? deps.optionSome(fallback.get(String(key)) ?? "") : deps.optionNone;
  }, "webStorageGet");
  const webStorageSet = /* @__PURE__ */ __name((scope, key, value) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.setItem(String(key), String(value));
        return deps.resultOk(void 0);
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.set(String(key), String(value));
    return deps.resultOk(void 0);
  }, "webStorageSet");
  const webStorageRemove = /* @__PURE__ */ __name((scope, key) => {
    const storage = scope === "local" ? browserLocalStorage() : browserSessionStorage();
    if (storage) {
      try {
        storage.removeItem(String(key));
        return;
      } catch {
      }
    }
    const fallback = scope === "local" ? webStorageLocalFallback : webStorageSessionFallback;
    fallback.delete(String(key));
  }, "webStorageRemove");
  const webStorageClear = /* @__PURE__ */ __name((scope) => {
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
  }, "webStorageClear");
  const webStorageLength = /* @__PURE__ */ __name((scope) => {
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
  }, "webStorageLength");
  const getDocumentHandle = /* @__PURE__ */ __name(() => {
    const doc = globalThis.document;
    if (!doc || typeof doc.querySelector !== "function") return null;
    return doc;
  }, "getDocumentHandle");
  const toDomHandle = /* @__PURE__ */ __name((element) => {
    if (!element || typeof element !== "object") return 0;
    const existing = domElementHandles.get(element);
    if (existing) return existing;
    const next = domNextHandle++;
    domElementHandles.set(element, next);
    domElements.set(next, element);
    return next;
  }, "toDomHandle");
  const fromDomHandle = /* @__PURE__ */ __name((handle) => domElements.get(Math.trunc(handle)) ?? null, "fromDomHandle");
  const createDomStubElement = /* @__PURE__ */ __name(() => {
    const attrs = /* @__PURE__ */ new Map();
    const children2 = [];
    return {
      textContent: "",
      innerHTML: "",
      style: {},
      getAttribute: /* @__PURE__ */ __name((name) => attrs.get(String(name)) ?? null, "getAttribute"),
      setAttribute: /* @__PURE__ */ __name((name, value) => {
        attrs.set(String(name), String(value));
      }, "setAttribute"),
      removeAttribute: /* @__PURE__ */ __name((name) => {
        attrs.delete(String(name));
      }, "removeAttribute"),
      appendChild: /* @__PURE__ */ __name((child) => {
        children2.push(child);
      }, "appendChild"),
      removeChild: /* @__PURE__ */ __name((child) => {
        const idx = children2.indexOf(child);
        if (idx >= 0) children2.splice(idx, 1);
      }, "removeChild")
    };
  }, "createDomStubElement");
  const getRouterWindowHandle = /* @__PURE__ */ __name(() => {
    const windowHandle = globalThis.window;
    if (windowHandle && typeof windowHandle === "object") return windowHandle;
    const globalHandle = globalThis;
    if (typeof globalHandle.addEventListener === "function" || typeof globalHandle.dispatchEvent === "function" || typeof globalHandle.location === "object") {
      return globalHandle;
    }
    return null;
  }, "getRouterWindowHandle");
  const getRouterLocationHandle = /* @__PURE__ */ __name(() => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.location) return windowHandle.location;
    const locationHandle = globalThis.location;
    return locationHandle && typeof locationHandle === "object" ? locationHandle : null;
  }, "getRouterLocationHandle");
  const getRouterHistoryHandle = /* @__PURE__ */ __name(() => {
    const windowHandle = getRouterWindowHandle();
    if (windowHandle?.history) return windowHandle.history;
    const historyHandle = globalThis.history;
    return historyHandle && typeof historyHandle === "object" ? historyHandle : null;
  }, "getRouterHistoryHandle");
  const readRouterPathname = /* @__PURE__ */ __name(() => String(getRouterLocationHandle()?.pathname ?? "/"), "readRouterPathname");
  const readRouterHash = /* @__PURE__ */ __name(() => String(getRouterLocationHandle()?.hash ?? ""), "readRouterHash");
  const readRouterSearch = /* @__PURE__ */ __name(() => String(getRouterLocationHandle()?.search ?? ""), "readRouterSearch");
  const trimRouterTrailingSlash = /* @__PURE__ */ __name((value) => {
    if (value.length <= 1) return value || "/";
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }, "trimRouterTrailingSlash");
  const normalizeRouterPath = /* @__PURE__ */ __name((value) => {
    const text2 = String(value || "/");
    const withLeadingSlash = text2.startsWith("/") ? text2 : `/${text2}`;
    return trimRouterTrailingSlash(withLeadingSlash);
  }, "normalizeRouterPath");
  const splitRouterSegments = /* @__PURE__ */ __name((value) => normalizeRouterPath(value).split("/").filter((segment) => segment.length > 0), "splitRouterSegments");
  const createRouterParamMap = /* @__PURE__ */ __name((entries) => {
    const out = deps.createHashMap();
    for (const [key, value] of entries) {
      if (key.length > 0) out.insert(key, value);
    }
    return out;
  }, "createRouterParamMap");
  const matchRouterPattern = /* @__PURE__ */ __name((pattern, path2) => {
    if (pattern === "*") return true;
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path2);
    if (patternSegments.length !== pathSegments.length) return false;
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? "";
      const actual = pathSegments[i] ?? "";
      if (expected.startsWith(":")) continue;
      if (expected !== actual) return false;
    }
    return true;
  }, "matchRouterPattern");
  const extractRouterParams = /* @__PURE__ */ __name((pattern, path2) => {
    if (pattern === "*") return deps.createHashMap();
    const patternSegments = splitRouterSegments(pattern);
    const pathSegments = splitRouterSegments(path2);
    if (patternSegments.length !== pathSegments.length) return deps.createHashMap();
    const entries = [];
    for (let i = 0; i < patternSegments.length; i += 1) {
      const expected = patternSegments[i] ?? "";
      if (!expected.startsWith(":")) continue;
      entries.push([
        expected.slice(1),
        pathSegments[i] ?? ""
      ]);
    }
    return createRouterParamMap(entries);
  }, "extractRouterParams");
  const parseRouterSearchParams = /* @__PURE__ */ __name((search) => {
    const text2 = String(search ?? "");
    const body = text2.startsWith("?") ? text2.slice(1) : text2;
    if (body.length === 0) return deps.createHashMap();
    const entries = [];
    for (const pair of body.split("&")) {
      if (!pair) continue;
      const [rawKey, rawValue = ""] = pair.split("=");
      if (!rawKey) continue;
      entries.push([
        rawKey,
        rawValue
      ]);
    }
    return createRouterParamMap(entries);
  }, "parseRouterSearchParams");
  const updateRouterLocationValue = /* @__PURE__ */ __name((nextPath) => {
    const locationHandle = getRouterLocationHandle();
    if (!locationHandle) return;
    try {
      const normalized = String(nextPath);
      locationHandle.pathname = normalized;
      locationHandle.hash = "";
      locationHandle.search = "";
    } catch {
    }
  }, "updateRouterLocationValue");
  const createRouterPopStateEvent = /* @__PURE__ */ __name(() => {
    try {
      const PopStateEventCtor = globalThis.PopStateEvent;
      if (typeof PopStateEventCtor === "function") {
        return new PopStateEventCtor("popstate", {
          state: getRouterHistoryHandle()?.state
        });
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
    return {
      type: "popstate"
    };
  }, "createRouterPopStateEvent");
  const dispatchRouterPopState = /* @__PURE__ */ __name(() => {
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
  }, "dispatchRouterPopState");
  const readRouterBasePath = /* @__PURE__ */ __name(() => {
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
  }, "readRouterBasePath");
  const url2 = {
    is_available: /* @__PURE__ */ __name(() => typeof URL === "function", "is_available"),
    parse: /* @__PURE__ */ __name((raw) => {
      if (typeof URL !== "function") return deps.resultErr("URL API is not available in this runtime");
      try {
        return deps.resultOk(toUrlRecord(new URL(String(raw))));
      } catch (error) {
        return deps.resultErr(error instanceof Error ? error.message : String(error));
      }
    }, "parse"),
    build: /* @__PURE__ */ __name((config) => {
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
    }, "build"),
    get_origin: /* @__PURE__ */ __name((value) => coerceToUrl(value)?.origin ?? "", "get_origin"),
    get_pathname: /* @__PURE__ */ __name((value) => coerceToUrl(value)?.pathname ?? "", "get_pathname"),
    get_search: /* @__PURE__ */ __name((value) => coerceToUrl(value)?.search ?? "", "get_search"),
    get_hash: /* @__PURE__ */ __name((value) => coerceToUrl(value)?.hash ?? "", "get_hash"),
    set_pathname: /* @__PURE__ */ __name((value, pathname) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text2 = String(pathname ?? "");
      next.pathname = text2.startsWith("/") ? text2 : `/${text2}`;
      return toUrlRecord(next);
    }, "set_pathname"),
    set_search: /* @__PURE__ */ __name((value, search) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      const text2 = String(search ?? "");
      next.search = !text2 ? "" : text2.startsWith("?") ? text2 : `?${text2}`;
      return toUrlRecord(next);
    }, "set_search"),
    append_param: /* @__PURE__ */ __name((value, key, paramValue) => {
      const next = coerceToUrl(value);
      if (!next) return emptyUrlRecord();
      next.searchParams.append(String(key), String(paramValue));
      return toUrlRecord(next);
    }, "append_param")
  };
  const web_storage2 = {
    is_available: /* @__PURE__ */ __name(() => browserLocalStorage() !== null && browserSessionStorage() !== null, "is_available"),
    local_get: /* @__PURE__ */ __name((key) => webStorageGet("local", key), "local_get"),
    local_set: /* @__PURE__ */ __name((key, value) => webStorageSet("local", key, value), "local_set"),
    local_remove: /* @__PURE__ */ __name((key) => webStorageRemove("local", key), "local_remove"),
    local_clear: /* @__PURE__ */ __name(() => webStorageClear("local"), "local_clear"),
    local_length: /* @__PURE__ */ __name(() => webStorageLength("local"), "local_length"),
    session_get: /* @__PURE__ */ __name((key) => webStorageGet("session", key), "session_get"),
    session_set: /* @__PURE__ */ __name((key, value) => webStorageSet("session", key, value), "session_set"),
    session_remove: /* @__PURE__ */ __name((key) => webStorageRemove("session", key), "session_remove"),
    session_clear: /* @__PURE__ */ __name(() => webStorageClear("session"), "session_clear"),
    session_length: /* @__PURE__ */ __name(() => webStorageLength("session"), "session_length")
  };
  const dom2 = {
    is_available: /* @__PURE__ */ __name(() => getDocumentHandle() !== null, "is_available"),
    call_global_1: /* @__PURE__ */ __name((name, arg) => {
      const key = String(name);
      const fn = globalThis[key];
      if (typeof fn !== "function") {
        return {
          ok: false,
          js: "",
          output: `// Missing global function: ${key}`,
          diagnostics: [
            {
              severity: "error",
              message: `Missing global function: ${key}`
            }
          ]
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
          diagnostics: [
            {
              severity: "error",
              message
            }
          ]
        };
      }
    }, "call_global_1"),
    call_global_1_string: /* @__PURE__ */ __name((name, arg) => {
      const value = dom2.call_global_1(name, arg);
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const record = value;
        if (typeof record.output === "string") return record.output;
        if (typeof record.message === "string") return record.message;
      }
      return value == null ? "" : String(value);
    }, "call_global_1_string"),
    query: /* @__PURE__ */ __name((selector) => {
      const doc = getDocumentHandle();
      if (!doc) return deps.optionNone;
      const element = doc.querySelector(String(selector));
      return element ? deps.optionSome(toDomHandle(element)) : deps.optionNone;
    }, "query"),
    query_all: /* @__PURE__ */ __name((selector) => {
      const doc = getDocumentHandle();
      if (!doc) return [];
      return Array.from(doc.querySelectorAll(String(selector))).map((entry) => toDomHandle(entry));
    }, "query_all"),
    create: /* @__PURE__ */ __name((tag) => {
      const doc = getDocumentHandle();
      if (!doc) return toDomHandle(createDomStubElement());
      return toDomHandle(doc.createElement(String(tag)));
    }, "create"),
    get_attr: /* @__PURE__ */ __name((elementHandle, name) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.getAttribute !== "function") return deps.optionNone;
      const value = element.getAttribute(String(name));
      return value == null ? deps.optionNone : deps.optionSome(value);
    }, "get_attr"),
    set_attr: /* @__PURE__ */ __name((elementHandle, name, value) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.setAttribute !== "function") return;
      element.setAttribute(String(name), String(value));
    }, "set_attr"),
    remove_attr: /* @__PURE__ */ __name((elementHandle, name) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof element.removeAttribute !== "function") return;
      element.removeAttribute(String(name));
    }, "remove_attr"),
    get_text: /* @__PURE__ */ __name((elementHandle) => {
      const element = fromDomHandle(elementHandle);
      return element?.textContent ?? "";
    }, "get_text"),
    set_text: /* @__PURE__ */ __name((elementHandle, text2) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return;
      element.textContent = String(text2);
    }, "set_text"),
    get_html: /* @__PURE__ */ __name((elementHandle) => {
      const element = fromDomHandle(elementHandle);
      return element?.innerHTML ?? "";
    }, "get_html"),
    set_html: /* @__PURE__ */ __name((elementHandle, html) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return;
      element.innerHTML = String(html);
    }, "set_html"),
    append_child: /* @__PURE__ */ __name((parentHandle, childHandle) => {
      const parent = fromDomHandle(parentHandle);
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.appendChild !== "function") return;
      parent.appendChild(child);
    }, "append_child"),
    remove_child: /* @__PURE__ */ __name((parentHandle, childHandle) => {
      const parent = fromDomHandle(parentHandle);
      const child = fromDomHandle(childHandle);
      if (!parent || !child || typeof parent.removeChild !== "function") return;
      try {
        parent.removeChild(child);
      } catch {
      }
    }, "remove_child"),
    add_event: /* @__PURE__ */ __name((elementHandle, event, handler) => {
      const element = fromDomHandle(elementHandle);
      if (!element || typeof handler !== "function") return 0;
      const listener = /* @__PURE__ */ __name(() => {
        try {
          handler();
        } catch {
        }
      }, "listener");
      if (typeof element.addEventListener === "function") {
        element.addEventListener(String(event), listener);
      }
      const handle = domNextEventHandle++;
      domEvents.set(handle, {
        element,
        event: String(event),
        listener
      });
      return handle;
    }, "add_event"),
    remove_event: /* @__PURE__ */ __name((eventHandle) => {
      const entry = domEvents.get(Math.trunc(eventHandle));
      if (!entry) return;
      if (typeof entry.element.removeEventListener === "function") {
        entry.element.removeEventListener(entry.event, entry.listener);
      }
      domEvents.delete(Math.trunc(eventHandle));
    }, "remove_event"),
    get_style: /* @__PURE__ */ __name((elementHandle, prop) => {
      const element = fromDomHandle(elementHandle);
      if (!element) return "";
      const key = String(prop);
      const styleObj = element.style;
      if (!styleObj) return "";
      const value = styleObj[key];
      return typeof value === "string" ? value : "";
    }, "get_style"),
    set_style: /* @__PURE__ */ __name((elementHandle, prop, value) => {
      const element = fromDomHandle(elementHandle);
      if (!element || !element.style) return;
      element.style[String(prop)] = String(value);
    }, "set_style")
  };
  const router2 = {
    getCurrentPath: /* @__PURE__ */ __name(() => readRouterPathname(), "getCurrentPath"),
    getCurrentHash: /* @__PURE__ */ __name(() => readRouterHash(), "getCurrentHash"),
    getCurrentSearch: /* @__PURE__ */ __name(() => readRouterSearch(), "getCurrentSearch"),
    matchRoute: /* @__PURE__ */ __name((pattern, path2) => matchRouterPattern(pattern, path2), "matchRoute"),
    extractParams: /* @__PURE__ */ __name((pattern, path2) => extractRouterParams(pattern, path2), "extractParams"),
    parseSearchParams: /* @__PURE__ */ __name((search) => parseRouterSearchParams(search), "parseSearchParams"),
    push: /* @__PURE__ */ __name((path2) => {
      const normalized = String(path2);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.pushState === "function") {
        try {
          historyHandle.pushState(historyHandle.state ?? null, "", normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    }, "push"),
    replace: /* @__PURE__ */ __name((path2) => {
      const normalized = String(path2);
      const historyHandle = getRouterHistoryHandle();
      if (historyHandle && typeof historyHandle.replaceState === "function") {
        try {
          historyHandle.replaceState(historyHandle.state ?? null, "", normalized);
        } catch {
          updateRouterLocationValue(normalized);
        }
      } else {
        updateRouterLocationValue(normalized);
      }
      dispatchRouterPopState();
    }, "replace"),
    onPopState: /* @__PURE__ */ __name((handler) => {
      if (typeof handler !== "function") return;
      router2.offPopState(handler);
      const listener = /* @__PURE__ */ __name(() => {
        try {
          handler(readRouterPathname());
        } catch {
        }
      }, "listener");
      routerPopStateHandlers.set(handler, listener);
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.addEventListener === "function") {
        windowHandle.addEventListener("popstate", listener);
      }
    }, "onPopState"),
    offPopState: /* @__PURE__ */ __name((handler) => {
      if (typeof handler !== "function") return;
      const listener = routerPopStateHandlers.get(handler);
      if (!listener) return;
      const windowHandle = getRouterWindowHandle();
      if (windowHandle && typeof windowHandle.removeEventListener === "function") {
        windowHandle.removeEventListener("popstate", listener);
      }
      routerPopStateHandlers.delete(handler);
    }, "offPopState"),
    getBasePath: /* @__PURE__ */ __name(() => readRouterBasePath(), "getBasePath")
  };
  return {
    url: url2,
    web_storage: web_storage2,
    dom: dom2,
    router: router2
  };
}, "createBrowserRuntime");

// src/runtime/channel-runtime.ts
var channelRuntimeConfig = null;
var requireChannelRuntimeConfig = /* @__PURE__ */ __name(() => {
  if (!channelRuntimeConfig) {
    throw new Error("Channel runtime is not configured");
  }
  return channelRuntimeConfig;
}, "requireChannelRuntimeConfig");
var isChannelValue = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && "__lumina_channel_value" in value, "isChannelValue");
var isChannelClose = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && value.__lumina_channel_close === true, "isChannelClose");
var isChannelAck = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && typeof value.__lumina_channel_ack === "number", "isChannelAck");
var resolveMessageChannel = /* @__PURE__ */ __name(() => {
  if (typeof MessageChannel === "function") return MessageChannel;
  return null;
}, "resolveMessageChannel");
var createSenderSharedState = /* @__PURE__ */ __name((port, capacity) => ({
  port,
  credits: capacity,
  refs: 1,
  closed: false,
  receiverClosed: false,
  pending: [],
  flushing: false
}), "createSenderSharedState");
var senderPostNow = /* @__PURE__ */ __name((state2, value) => {
  if (state2.closed || state2.receiverClosed) return false;
  if (state2.credits !== null && state2.credits <= 0) return false;
  if (state2.credits !== null) {
    state2.credits -= 1;
  }
  const payload = {
    __lumina_channel_value: value
  };
  try {
    state2.port.postMessage(payload);
    return true;
  } catch {
    state2.closed = true;
    return false;
  }
}, "senderPostNow");
var drainPendingSends = /* @__PURE__ */ __name((state2) => {
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
}, "drainPendingSends");
var _Sender = class _Sender {
  constructor(shared) {
    __publicField(this, "shared");
    __publicField(this, "closedLocal", false);
    this.shared = shared;
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
      this.shared.pending.push({
        value,
        resolve
      });
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
      const payload = {
        __lumina_channel_close: true
      };
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
__name(_Sender, "Sender");
var Sender = _Sender;
var _Receiver = class _Receiver {
  constructor(port, capacity) {
    __publicField(this, "port");
    __publicField(this, "queue", []);
    __publicField(this, "waiters", []);
    __publicField(this, "closed", false);
    __publicField(this, "errorMessage", null);
    __publicField(this, "capacity");
    __publicField(this, "ackOnConsume");
    this.port = port;
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
    const payload = {
      __lumina_channel_ack: 1
    };
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
        const payload = {
          __lumina_channel_ack: 1
        };
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
    const payload = {
      __lumina_channel_close: true
    };
    try {
      this.port.postMessage(payload);
    } catch {
    }
    this.port.close();
    this.flushWaiters(requireChannelRuntimeConfig().getOption().None);
  }
};
__name(_Receiver, "Receiver");
var Receiver = _Receiver;
var createChannelRuntime = /* @__PURE__ */ __name((deps) => {
  channelRuntimeConfig = deps;
  const channel2 = {
    is_available: /* @__PURE__ */ __name(() => resolveMessageChannel() !== null, "is_available"),
    new: /* @__PURE__ */ __name(() => channel2.bounded(-1), "new"),
    bounded: /* @__PURE__ */ __name((capacity) => {
      const ChannelCtor = resolveMessageChannel();
      if (!ChannelCtor) {
        throw new Error("MessageChannel is not available in this environment");
      }
      const normalized = Number.isFinite(capacity) ? Math.trunc(capacity) : -1;
      const cap = normalized < 0 ? null : normalized;
      const { port1, port2 } = new ChannelCtor();
      return {
        sender: Sender.create(port1, cap),
        receiver: new Receiver(port2, cap)
      };
    }, "bounded"),
    send: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "send"),
    try_send: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "try_send"),
    send_async: /* @__PURE__ */ __name((sender, value) => sender.send(value), "send_async"),
    send_result: /* @__PURE__ */ __name((sender, value) => sender.send_result(value), "send_result"),
    send_async_result: /* @__PURE__ */ __name((sender, value) => sender.send_async_result(value), "send_async_result"),
    clone_sender: /* @__PURE__ */ __name((sender) => sender.clone(), "clone_sender"),
    recv: /* @__PURE__ */ __name((receiver) => receiver.recv(), "recv"),
    try_recv: /* @__PURE__ */ __name((receiver) => receiver.try_recv(), "try_recv"),
    recv_result: /* @__PURE__ */ __name((receiver) => receiver.recv_result(), "recv_result"),
    try_recv_result: /* @__PURE__ */ __name((receiver) => receiver.try_recv_result(), "try_recv_result"),
    is_sender_closed: /* @__PURE__ */ __name((sender) => sender.is_closed(), "is_sender_closed"),
    is_receiver_closed: /* @__PURE__ */ __name((receiver) => receiver.is_closed(), "is_receiver_closed"),
    close_sender: /* @__PURE__ */ __name((sender) => sender.close(), "close_sender"),
    close_receiver: /* @__PURE__ */ __name((receiver) => receiver.close(), "close_receiver"),
    drop_sender: /* @__PURE__ */ __name((sender) => sender.drop(), "drop_sender"),
    drop_receiver: /* @__PURE__ */ __name((receiver) => receiver.drop(), "drop_receiver"),
    close: /* @__PURE__ */ __name((ch) => {
      ch.sender.close();
      ch.receiver.close();
    }, "close")
  };
  return channel2;
}, "createChannelRuntime");

// src/runtime/node-platform.ts
var cachedNodeRequire;
var cachedNodePath;
var cachedReadFileSync;
var cachedSpawnSync;
var isNodeRuntime = /* @__PURE__ */ __name(() => typeof globalThis.process !== "undefined" && typeof globalThis.process?.versions?.node === "string", "isNodeRuntime");
var getNodeProcess = /* @__PURE__ */ __name(() => {
  const candidate = globalThis.process;
  return candidate ?? null;
}, "getNodeProcess");
var getNodeRequire = /* @__PURE__ */ __name(() => {
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
}, "getNodeRequire");
var getNodeBuiltinModule = /* @__PURE__ */ __name((id) => {
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
}, "getNodeBuiltinModule");
var getNodePath = /* @__PURE__ */ __name(() => {
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
}, "getNodePath");
var getNodeReadFileSync = /* @__PURE__ */ __name(() => {
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
}, "getNodeReadFileSync");
var getNodeSpawnSync = /* @__PURE__ */ __name(() => {
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
}, "getNodeSpawnSync");
var pathSeparator = /* @__PURE__ */ __name(() => (getNodeProcess()?.platform ?? "").startsWith("win") ? "\\" : "/", "pathSeparator");
var normalizePathBasic = /* @__PURE__ */ __name((value) => {
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
}, "normalizePathBasic");
var joinPathBasic = /* @__PURE__ */ __name((left, right) => normalizePathBasic(`${String(left)}${pathSeparator()}${String(right)}`), "joinPathBasic");
var isAbsolutePathBasic = /* @__PURE__ */ __name((value) => {
  const text2 = String(value);
  if (pathSeparator() === "\\") return /^[A-Za-z]:[\\/]/.test(text2) || text2.startsWith("\\\\");
  return text2.startsWith("/");
}, "isAbsolutePathBasic");
var dirnamePathBasic = /* @__PURE__ */ __name((value) => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  if (idx <= 0) return ".";
  return normalized.slice(0, idx);
}, "dirnamePathBasic");
var basenamePathBasic = /* @__PURE__ */ __name((value) => {
  const normalized = normalizePathBasic(String(value));
  const sep = pathSeparator();
  const idx = normalized.lastIndexOf(sep);
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}, "basenamePathBasic");
var extnamePathBasic = /* @__PURE__ */ __name((value) => {
  const base = basenamePathBasic(value);
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx);
}, "extnamePathBasic");
var resolvePathBasic = /* @__PURE__ */ __name((value) => {
  const text2 = String(value);
  if (isAbsolutePathBasic(text2)) return normalizePathBasic(text2);
  const cwd = getNodeProcess()?.cwd?.() ?? ".";
  return normalizePathBasic(`${cwd}${pathSeparator()}${text2}`);
}, "resolvePathBasic");

// src/runtime/value-runtime.ts
var runtimeTraitImpls = {
  Hash: /* @__PURE__ */ new Map(),
  Eq: /* @__PURE__ */ new Map(),
  Ord: /* @__PURE__ */ new Map()
};
var normalizeTraitTypeName = /* @__PURE__ */ __name((typeName) => {
  const trimmed = typeName.trim();
  const idx = trimmed.indexOf("<");
  return idx === -1 ? trimmed : trimmed.slice(0, idx).trim();
}, "normalizeTraitTypeName");
var isEnumLike = /* @__PURE__ */ __name((value) => {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return typeof v.$tag === "string" || typeof v.tag === "string";
}, "isEnumLike");
var getEnumTag = /* @__PURE__ */ __name((value) => value.$tag ?? value.tag ?? "Unknown", "getEnumTag");
var getEnumPayload = /* @__PURE__ */ __name((value) => {
  if (value.$payload !== void 0) {
    return value.$payload;
  }
  const values = value.values;
  if (!values) return void 0;
  if (Array.isArray(values) && values.length === 1) return values[0];
  return values;
}, "getEnumPayload");
var getRuntimeTypeTag = /* @__PURE__ */ __name((value) => {
  if (!value || typeof value !== "object") return null;
  const candidate = value.__lumina_type;
  return typeof candidate === "string" ? candidate : null;
}, "getRuntimeTypeTag");
var __lumina_register_trait_impl = /* @__PURE__ */ __name((traitName, forType, impl) => {
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
}, "__lumina_register_trait_impl");
var supportsColor = /* @__PURE__ */ __name(() => {
  if (typeof window !== "undefined") return false;
  if (!isNodeRuntime()) return false;
  const stdout = getNodeProcess()?.stdout;
  return Boolean(stdout && stdout.isTTY);
}, "supportsColor");
var colors = {
  reset: "\x1B[0m",
  cyan: "\x1B[36m",
  yellow: "\x1B[33m",
  green: "\x1B[32m",
  magenta: "\x1B[35m",
  gray: "\x1B[90m"
};
var colorize = /* @__PURE__ */ __name((text2, color, enabled) => {
  if (!enabled || !color) return text2;
  return `${color}${text2}${colors.reset}`;
}, "colorize");
var defaultFormatOptions = {
  indent: 2,
  maxDepth: 6,
  color: supportsColor()
};
function formatValue(value, options = {}) {
  const config = {
    ...defaultFormatOptions,
    ...options
  };
  const seen = /* @__PURE__ */ new WeakSet();
  const formatEnum = /* @__PURE__ */ __name((tag, payload, depth) => {
    if (payload === void 0) return colorize(tag, colors.cyan, config.color);
    if (Array.isArray(payload)) {
      const inner = payload.map((item) => format(item, depth + 1));
      return formatEnumPayload(tag, inner, depth);
    }
    return formatEnumPayload(tag, [
      format(payload, depth + 1)
    ], depth);
  }, "formatEnum");
  const formatEnumPayload = /* @__PURE__ */ __name((tag, parts, depth) => {
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
  }, "formatEnumPayload");
  const formatArray = /* @__PURE__ */ __name((items, depth) => {
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
  }, "formatArray");
  const formatObject = /* @__PURE__ */ __name((obj, depth) => {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    if (depth >= config.maxDepth) return "{...}";
    const rendered = entries.map(([key, val]) => `${key}: ${format(val, depth + 1)}`);
    const multiline = rendered.some((item) => item.includes("\n")) || rendered.join(", ").length > 60;
    if (!multiline) return `{ ${rendered.join(", ")} }`;
    const indent = " ".repeat(config.indent * (depth + 1));
    const closing = " ".repeat(config.indent * depth);
    return `{
${indent}${rendered.join(`,
${indent}`)}
${closing}}`;
  }, "formatObject");
  const format = /* @__PURE__ */ __name((val, depth) => {
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
  }, "format");
  return format(value, 0);
}
__name(formatValue, "formatValue");
var __lumina_stringify = /* @__PURE__ */ __name((value) => formatValue(value, {
  color: false
}), "__lumina_stringify");
var __lumina_struct = /* @__PURE__ */ __name((typeName, fields) => {
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
}, "__lumina_struct");
var normalizeRuntimeValue = /* @__PURE__ */ __name((value) => {
  if (value === null || value === void 0) return value;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function${value.name ? ` ${value.name}` : ""}]`;
  if (Array.isArray(value)) return value.map((item) => normalizeRuntimeValue(item));
  if (typeof value === "object") {
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
      return {
        $enum: tag,
        value: normalizeRuntimeValue(payload)
      };
    }
    const typeTag = getRuntimeTypeTag(value);
    const obj = value;
    const keys = Object.keys(obj).sort();
    const out = {};
    if (typeTag) out.__lumina_type = typeTag;
    for (const key of keys) {
      out[key] = normalizeRuntimeValue(obj[key]);
    }
    return out;
  }
  return String(value);
}, "normalizeRuntimeValue");
var stableRuntimeHash = /* @__PURE__ */ __name((value) => JSON.stringify(normalizeRuntimeValue(value)), "stableRuntimeHash");
var deepRuntimeEqual = /* @__PURE__ */ __name((a, b) => {
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
  for (const key of aKeys) {
    if (!deepRuntimeEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}, "deepRuntimeEqual");
var runtimeHashValue = /* @__PURE__ */ __name((value) => {
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
}, "runtimeHashValue");
var runtimeEquals = /* @__PURE__ */ __name((left, right) => {
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
}, "runtimeEquals");
var FAST_CLONE_UNSUPPORTED = /* @__PURE__ */ Symbol("lumina.fast-clone-unsupported");
var isPlainCloneableObject = /* @__PURE__ */ __name((value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}, "isPlainCloneableObject");
var cloneFast = /* @__PURE__ */ __name((value, seen = /* @__PURE__ */ new WeakMap()) => {
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
  for (const [key, entry] of Object.entries(value)) {
    const cloned = cloneFast(entry, seen);
    if (cloned === FAST_CLONE_UNSUPPORTED) {
      return FAST_CLONE_UNSUPPORTED;
    }
    out[key] = cloned;
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
}, "cloneFast");
var cloneFallback = /* @__PURE__ */ __name((value) => {
  const fast = cloneFast(value);
  if (fast !== FAST_CLONE_UNSUPPORTED) {
    return fast;
  }
  if (value === null || value === void 0) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneFallback(entry));
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = cloneFallback(entry);
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
}, "cloneFallback");
var __lumina_clone = /* @__PURE__ */ __name((value) => {
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
}, "__lumina_clone");
var __lumina_debug = /* @__PURE__ */ __name((value) => formatValue(value, {
  color: false
}), "__lumina_debug");
var __lumina_eq = /* @__PURE__ */ __name((left, right) => runtimeEquals(left, right), "__lumina_eq");
var orderingToNumber = /* @__PURE__ */ __name((value) => {
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
}, "orderingToNumber");
var compareRuntimeValues = /* @__PURE__ */ __name((left, right) => {
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
  const leftText = formatValue(left, {
    color: false
  });
  const rightText = formatValue(right, {
    color: false
  });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
}, "compareRuntimeValues");

// src/runtime/collections-runtime.ts
var collectionsRuntimeConfig = null;
var requireCollectionsRuntimeConfig = /* @__PURE__ */ __name(() => {
  if (!collectionsRuntimeConfig) {
    throw new Error("Collections runtime is not configured");
  }
  return collectionsRuntimeConfig;
}, "requireCollectionsRuntimeConfig");
var Option = /* @__PURE__ */ __name(() => requireCollectionsRuntimeConfig().getOption(), "Option");
var normalizeCount = /* @__PURE__ */ __name((value) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0, "normalizeCount");
var compareOrder = /* @__PURE__ */ __name((left, right) => {
  if (left === right) return 0;
  const leftComparable = left;
  const rightComparable = right;
  return leftComparable < rightComparable ? -1 : 1;
}, "compareOrder");
var toIterableValues = /* @__PURE__ */ __name((value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iteratorFn = value[Symbol.iterator];
    if (typeof iteratorFn === "function") {
      return Array.from(value);
    }
  }
  return [];
}, "toIterableValues");
var configureCollectionsRuntime = /* @__PURE__ */ __name((deps) => {
  collectionsRuntimeConfig = deps;
}, "configureCollectionsRuntime");
var list = {
  map: /* @__PURE__ */ __name((f, xs) => xs.map(f), "map"),
  filter: /* @__PURE__ */ __name((pred, xs) => xs.filter(pred), "filter"),
  fold: /* @__PURE__ */ __name((f, init, xs) => xs.reduce((acc, val) => f(acc, val), init), "fold"),
  reverse: /* @__PURE__ */ __name((xs) => xs.slice().reverse(), "reverse"),
  length: /* @__PURE__ */ __name((xs) => xs.length, "length"),
  append: /* @__PURE__ */ __name((xs, ys) => xs.concat(ys), "append"),
  take: /* @__PURE__ */ __name((n, xs) => xs.slice(0, Math.max(0, n)), "take"),
  drop: /* @__PURE__ */ __name((n, xs) => xs.slice(Math.max(0, n)), "drop"),
  find: /* @__PURE__ */ __name((pred, xs) => {
    const found = xs.find(pred);
    return found === void 0 ? Option().None : Option().Some(found);
  }, "find"),
  any: /* @__PURE__ */ __name((pred, xs) => xs.some(pred), "any"),
  all: /* @__PURE__ */ __name((pred, xs) => xs.every(pred), "all")
};
var _Vec = class _Vec {
  constructor() {
    __publicField(this, "data");
    this.data = [];
  }
  static new() {
    return new _Vec();
  }
  static from(items) {
    const next = new _Vec();
    next.data = Array.isArray(items) ? [
      ...items
    ] : [];
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
      out.push([
        this.data[i],
        other.data[i]
      ]);
    }
    return out;
  }
  enumerate() {
    const out = _Vec.new();
    for (let i = 0; i < this.data.length; i += 1) {
      out.push([
        i,
        this.data[i]
      ]);
    }
    return out;
  }
  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
};
__name(_Vec, "Vec");
var Vec = _Vec;
var timeout = /* @__PURE__ */ __name(async (ms) => {
  await requireCollectionsRuntimeConfig().timeSleep(ms);
}, "timeout");
var join_all = /* @__PURE__ */ __name(async (values) => {
  const resolved = await Promise.all(toIterableValues(values).map((item) => Promise.resolve(item)));
  return Vec.from(resolved);
}, "join_all");
var vec = {
  new: /* @__PURE__ */ __name(() => Vec.new(), "new"),
  from: /* @__PURE__ */ __name((items) => Vec.from(items), "from"),
  push: /* @__PURE__ */ __name((v, value) => v.push(value), "push"),
  get: /* @__PURE__ */ __name((v, index) => v.get(index), "get"),
  len: /* @__PURE__ */ __name((v) => v.len(), "len"),
  pop: /* @__PURE__ */ __name((v) => v.pop(), "pop"),
  clear: /* @__PURE__ */ __name((v) => v.clear(), "clear"),
  map: /* @__PURE__ */ __name((v, f) => v.map(f), "map"),
  filter: /* @__PURE__ */ __name((v, pred) => v.filter(pred), "filter"),
  fold: /* @__PURE__ */ __name((v, init, f) => v.fold(init, f), "fold"),
  for_each: /* @__PURE__ */ __name((v, f) => v.for_each(f), "for_each"),
  any: /* @__PURE__ */ __name((v, pred) => v.any(pred), "any"),
  all: /* @__PURE__ */ __name((v, pred) => v.all(pred), "all"),
  find: /* @__PURE__ */ __name((v, pred) => v.find(pred), "find"),
  position: /* @__PURE__ */ __name((v, pred) => v.position(pred), "position"),
  take: /* @__PURE__ */ __name((v, n) => v.take(n), "take"),
  skip: /* @__PURE__ */ __name((v, n) => v.skip(n), "skip"),
  zip: /* @__PURE__ */ __name((v, other) => v.zip(other), "zip"),
  enumerate: /* @__PURE__ */ __name((v) => v.enumerate(), "enumerate"),
  fused_filter_map_fold: /* @__PURE__ */ __name((v, pred, mapper, init, folder) => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, mapper(item));
    }
    return acc;
  }, "fused_filter_map_fold"),
  fused_map_fold: /* @__PURE__ */ __name((v, mapper, init, folder) => {
    let acc = init;
    for (const item of v) {
      acc = folder(acc, mapper(item));
    }
    return acc;
  }, "fused_map_fold"),
  fused_filter_fold: /* @__PURE__ */ __name((v, pred, init, folder) => {
    let acc = init;
    for (const item of v) {
      if (!pred(item)) continue;
      acc = folder(acc, item);
    }
    return acc;
  }, "fused_filter_fold"),
  fused_pipeline: /* @__PURE__ */ __name((v, stages, init, folder) => {
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
  }, "fused_pipeline")
};
var iter = {
  map_vec: /* @__PURE__ */ __name((values, mapper) => vec.map(values, mapper), "map_vec"),
  filter_vec: /* @__PURE__ */ __name((values, pred) => vec.filter(values, pred), "filter_vec"),
  filter_option: /* @__PURE__ */ __name((value, pred) => {
    const tag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (tag !== "Some") return Option().None;
    const payload = getEnumPayload(value);
    return pred(payload) ? Option().Some(payload) : Option().None;
  }, "filter_option"),
  zip_vec: /* @__PURE__ */ __name((left, right) => vec.zip(left, right), "zip_vec"),
  enumerate_vec: /* @__PURE__ */ __name((values) => vec.enumerate(values), "enumerate_vec"),
  flatten_vec: /* @__PURE__ */ __name((values) => {
    const out = Vec.new();
    for (const inner of values) {
      if (!(inner instanceof Vec)) continue;
      for (const value of inner) out.push(value);
    }
    return out;
  }, "flatten_vec"),
  flat_map_vec: /* @__PURE__ */ __name((values, mapper) => {
    const out = Vec.new();
    for (const value of values) {
      const mapped = mapper(value);
      if (!(mapped instanceof Vec)) continue;
      for (const inner of mapped) out.push(inner);
    }
    return out;
  }, "flat_map_vec"),
  chunk_vec: /* @__PURE__ */ __name((values, size) => {
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
  }, "chunk_vec"),
  window_vec: /* @__PURE__ */ __name((values, size) => {
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
  }, "window_vec"),
  partition_vec: /* @__PURE__ */ __name((values, pred) => {
    const pass = Vec.new();
    const fail = Vec.new();
    for (const value of values) {
      if (pred(value)) pass.push(value);
      else fail.push(value);
    }
    return [
      pass,
      fail
    ];
  }, "partition_vec"),
  take_vec: /* @__PURE__ */ __name((values, n) => vec.take(values, n), "take_vec"),
  skip_vec: /* @__PURE__ */ __name((values, n) => vec.skip(values, n), "skip_vec"),
  any_vec: /* @__PURE__ */ __name((values, pred) => vec.any(values, pred), "any_vec"),
  all_vec: /* @__PURE__ */ __name((values, pred) => vec.all(values, pred), "all_vec"),
  find_vec: /* @__PURE__ */ __name((values, pred) => vec.find(values, pred), "find_vec"),
  count_vec: /* @__PURE__ */ __name((values) => vec.len(values), "count_vec"),
  sum_vec: /* @__PURE__ */ __name((values) => vec.fold(values, 0, (acc, value) => acc + value), "sum_vec"),
  sum_vec_f64: /* @__PURE__ */ __name((values) => vec.fold(values, 0, (acc, value) => acc + value), "sum_vec_f64"),
  unique_vec: /* @__PURE__ */ __name((values) => {
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
  }, "unique_vec"),
  reverse_vec: /* @__PURE__ */ __name((values) => Vec.from(Array.from(values).reverse()), "reverse_vec"),
  sort_vec: /* @__PURE__ */ __name((values, cmp) => Vec.from(Array.from(values).sort((left, right) => cmp(left, right))), "sort_vec"),
  sort_by_vec: /* @__PURE__ */ __name((values, key) => Vec.from(Array.from(values).sort((left, right) => compareOrder(key(left), key(right)))), "sort_by_vec"),
  sort_by_desc_vec: /* @__PURE__ */ __name((values, key) => Vec.from(Array.from(values).sort((left, right) => compareOrder(key(right), key(left)))), "sort_by_desc_vec"),
  group_by_vec: /* @__PURE__ */ __name((values, key) => {
    const out = HashMap.new();
    for (const value of values) {
      const groupKey = key(value);
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
  }, "group_by_vec"),
  intersperse_vec: /* @__PURE__ */ __name((values, sep) => {
    const out = Vec.new();
    let first = true;
    for (const value of values) {
      if (!first) out.push(sep);
      out.push(value);
      first = false;
    }
    return out;
  }, "intersperse_vec"),
  join_vec: /* @__PURE__ */ __name((left, right, left_key, right_key) => {
    const out = Vec.new();
    for (const leftValue of left) {
      const leftKey = left_key(leftValue);
      for (const rightValue of right) {
        if (runtimeEquals(leftKey, right_key(rightValue))) {
          out.push([
            leftValue,
            rightValue
          ]);
        }
      }
    }
    return out;
  }, "join_vec")
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
var query = /* @__PURE__ */ __name((items) => ({
  items
}), "query");
var where_q = /* @__PURE__ */ __name((q, pred) => ({
  items: iter.filter_vec(q.items, pred)
}), "where_q");
var select_q = /* @__PURE__ */ __name((q, mapper) => ({
  items: iter.map_vec(q.items, mapper)
}), "select_q");
var order_by_q = /* @__PURE__ */ __name((q, key) => ({
  items: iter.sort_by_vec(q.items, key)
}), "order_by_q");
var order_by_desc_q = /* @__PURE__ */ __name((q, key) => ({
  items: iter.sort_by_desc_vec(q.items, key)
}), "order_by_desc_q");
var limit_q = /* @__PURE__ */ __name((q, n) => ({
  items: iter.take_vec(q.items, n)
}), "limit_q");
var offset_q = /* @__PURE__ */ __name((q, n) => ({
  items: iter.skip_vec(q.items, n)
}), "offset_q");
var group_by_q = /* @__PURE__ */ __name((q, key) => iter.group_by_vec(q.items, key), "group_by_q");
var count_q = /* @__PURE__ */ __name((q) => iter.count_vec(q.items), "count_q");
var first_q = /* @__PURE__ */ __name((q) => vec.get(q.items, 0), "first_q");
var to_vec_q = /* @__PURE__ */ __name((q) => q.items, "to_vec_q");
var join_q = /* @__PURE__ */ __name((left, right, left_key, right_key) => ({
  items: iter.join_vec(left.items, right.items, left_key, right_key)
}), "join_q");
var _HashMap = class _HashMap {
  constructor() {
    __publicField(this, "buckets");
    __publicField(this, "sizeValue");
    this.buckets = /* @__PURE__ */ new Map();
    this.sizeValue = 0;
  }
  static new() {
    return new _HashMap();
  }
  getBucket(key) {
    const hash = runtimeHashValue(key);
    const existing = this.buckets.get(hash);
    if (existing) return existing;
    const next = [];
    this.buckets.set(hash, next);
    return next;
  }
  lookupBucket(key) {
    const hash = runtimeHashValue(key);
    return this.buckets.get(hash) ?? null;
  }
  insert(key, value) {
    const bucket = this.getBucket(key);
    for (let i = 0; i < bucket.length; i += 1) {
      const current = bucket[i];
      if (runtimeEquals(current.key, key)) {
        const old = current.value;
        current.value = value;
        return Option().Some(old);
      }
    }
    bucket.push({
      key,
      value
    });
    this.sizeValue += 1;
    return Option().None;
  }
  get(key) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return Option().None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) {
        return Option().Some(entry.value);
      }
    }
    return Option().None;
  }
  remove(key) {
    const hash = runtimeHashValue(key);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option().None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option().Some(removed.value);
      }
    }
    return Option().None;
  }
  contains_key(key) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return false;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) return true;
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
__name(_HashMap, "HashMap");
var HashMap = _HashMap;
var hashmap = {
  new: /* @__PURE__ */ __name(() => HashMap.new(), "new"),
  insert: /* @__PURE__ */ __name((m, k, v) => m.insert(k, v), "insert"),
  get: /* @__PURE__ */ __name((m, k) => m.get(k), "get"),
  remove: /* @__PURE__ */ __name((m, k) => m.remove(k), "remove"),
  contains_key: /* @__PURE__ */ __name((m, k) => m.contains_key(k), "contains_key"),
  len: /* @__PURE__ */ __name((m) => m.len(), "len"),
  clear: /* @__PURE__ */ __name((m) => m.clear(), "clear"),
  keys: /* @__PURE__ */ __name((m) => m.keys(), "keys"),
  values: /* @__PURE__ */ __name((m) => m.values(), "values")
};
var _HashSet = class _HashSet {
  constructor() {
    __publicField(this, "map");
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
__name(_HashSet, "HashSet");
var HashSet = _HashSet;
var hashset = {
  new: /* @__PURE__ */ __name(() => HashSet.new(), "new"),
  insert: /* @__PURE__ */ __name((s, v) => s.insert(v), "insert"),
  contains: /* @__PURE__ */ __name((s, v) => s.contains(v), "contains"),
  remove: /* @__PURE__ */ __name((s, v) => s.remove(v), "remove"),
  len: /* @__PURE__ */ __name((s) => s.len(), "len"),
  clear: /* @__PURE__ */ __name((s) => s.clear(), "clear"),
  values: /* @__PURE__ */ __name((s) => s.values(), "values")
};
var _Deque = class _Deque {
  constructor() {
    __publicField(this, "data");
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
__name(_Deque, "Deque");
var Deque = _Deque;
var deque = {
  new: /* @__PURE__ */ __name(() => Deque.new(), "new"),
  push_front: /* @__PURE__ */ __name((d, value) => d.push_front(value), "push_front"),
  push_back: /* @__PURE__ */ __name((d, value) => d.push_back(value), "push_back"),
  pop_front: /* @__PURE__ */ __name((d) => d.pop_front(), "pop_front"),
  pop_back: /* @__PURE__ */ __name((d) => d.pop_back(), "pop_back"),
  len: /* @__PURE__ */ __name((d) => d.len(), "len"),
  clear: /* @__PURE__ */ __name((d) => d.clear(), "clear")
};
var _BTreeMap = class _BTreeMap {
  constructor() {
    __publicField(this, "records");
    this.records = [];
  }
  static new() {
    return new _BTreeMap();
  }
  lowerBound(key) {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (compareRuntimeValues(this.records[mid].key, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  insert(key, value) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      const previous = this.records[idx].value;
      this.records[idx].value = value;
      return Option().Some(previous);
    }
    this.records.splice(idx, 0, {
      key,
      value
    });
    return Option().None;
  }
  get(key) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      return Option().Some(this.records[idx].value);
    }
    return Option().None;
  }
  remove(key) {
    const idx = this.lowerBound(key);
    if (idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0) {
      const [removed] = this.records.splice(idx, 1);
      return Option().Some(removed.value);
    }
    return Option().None;
  }
  contains_key(key) {
    const idx = this.lowerBound(key);
    return idx < this.records.length && compareRuntimeValues(this.records[idx].key, key) === 0;
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
    return Vec.from(this.records.map((entry) => [
      entry.key,
      entry.value
    ]));
  }
};
__name(_BTreeMap, "BTreeMap");
var BTreeMap = _BTreeMap;
var btreemap = {
  new: /* @__PURE__ */ __name(() => BTreeMap.new(), "new"),
  insert: /* @__PURE__ */ __name((m, k, v) => m.insert(k, v), "insert"),
  get: /* @__PURE__ */ __name((m, k) => m.get(k), "get"),
  remove: /* @__PURE__ */ __name((m, k) => m.remove(k), "remove"),
  contains_key: /* @__PURE__ */ __name((m, k) => m.contains_key(k), "contains_key"),
  len: /* @__PURE__ */ __name((m) => m.len(), "len"),
  clear: /* @__PURE__ */ __name((m) => m.clear(), "clear"),
  keys: /* @__PURE__ */ __name((m) => m.keys(), "keys"),
  values: /* @__PURE__ */ __name((m) => m.values(), "values"),
  entries: /* @__PURE__ */ __name((m) => m.entries(), "entries")
};
var _BTreeSet = class _BTreeSet {
  constructor() {
    __publicField(this, "map");
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
__name(_BTreeSet, "BTreeSet");
var BTreeSet = _BTreeSet;
var btreeset = {
  new: /* @__PURE__ */ __name(() => BTreeSet.new(), "new"),
  insert: /* @__PURE__ */ __name((s, v) => s.insert(v), "insert"),
  contains: /* @__PURE__ */ __name((s, v) => s.contains(v), "contains"),
  remove: /* @__PURE__ */ __name((s, v) => s.remove(v), "remove"),
  len: /* @__PURE__ */ __name((s) => s.len(), "len"),
  clear: /* @__PURE__ */ __name((s) => s.clear(), "clear"),
  values: /* @__PURE__ */ __name((s) => s.values(), "values")
};
var _PriorityQueue = class _PriorityQueue {
  constructor() {
    __publicField(this, "heap");
    this.heap = [];
  }
  static new() {
    return new _PriorityQueue();
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = index - 1 >> 1;
      if (compareRuntimeValues(this.heap[parent], this.heap[index]) <= 0) break;
      [this.heap[parent], this.heap[index]] = [
        this.heap[index],
        this.heap[parent]
      ];
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
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index]
      ];
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
__name(_PriorityQueue, "PriorityQueue");
var PriorityQueue = _PriorityQueue;
var priority_queue = {
  new: /* @__PURE__ */ __name(() => PriorityQueue.new(), "new"),
  push: /* @__PURE__ */ __name((q, value) => q.push(value), "push"),
  pop: /* @__PURE__ */ __name((q) => q.pop(), "pop"),
  peek: /* @__PURE__ */ __name((q) => q.peek(), "peek"),
  len: /* @__PURE__ */ __name((q) => q.len(), "len"),
  clear: /* @__PURE__ */ __name((q) => q.clear(), "clear")
};

// src/runtime/algebra-runtime.ts
var mapHashMapValues = /* @__PURE__ */ __name((map, mapper) => {
  const out = HashMap.new();
  for (const key of map.keys()) {
    const current = map.get(key);
    if (current && typeof current === "object" && current.$tag === "Some") {
      out.insert(key, mapper(current.$payload));
    }
  }
  return out;
}, "mapHashMapValues");
var pureHashMap = /* @__PURE__ */ __name((key, value) => {
  const out = HashMap.new();
  out.insert(key, value);
  return out;
}, "pureHashMap");
var apHashMapValues = /* @__PURE__ */ __name((fns, values) => {
  const out = HashMap.new();
  for (const key of fns.keys()) {
    const fnEntry = fns.get(key);
    const valueEntry = values.get(key);
    if (!fnEntry || typeof fnEntry !== "object" || fnEntry.$tag !== "Some" || !valueEntry || typeof valueEntry !== "object" || valueEntry.$tag !== "Some") {
      continue;
    }
    const fn = fnEntry.$payload;
    if (typeof fn !== "function") continue;
    out.insert(key, fn(valueEntry.$payload));
  }
  return out;
}, "apHashMapValues");
var flatMapHashMapValues = /* @__PURE__ */ __name((values, mapper) => {
  const out = HashMap.new();
  for (const key of values.keys()) {
    const current = values.get(key);
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
}, "flatMapHashMapValues");
var createAlgebraRuntime = /* @__PURE__ */ __name(({ Option: Option3, Result: Result2, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  const functor2 = {
    map_option: /* @__PURE__ */ __name((value, mapper) => Option3.map(mapper, value), "map_option"),
    map_result: /* @__PURE__ */ __name((value, mapper) => Result2.map(mapper, value), "map_result"),
    map_vec: /* @__PURE__ */ __name((values, mapper) => vec.map(values, mapper), "map_vec"),
    map_hashmap_values: /* @__PURE__ */ __name((values, mapper) => mapHashMapValues(values, mapper), "map_hashmap_values")
  };
  const applicative2 = {
    pure_option: /* @__PURE__ */ __name((value) => Option3.Some(value), "pure_option"),
    pure_result: /* @__PURE__ */ __name((value) => Result2.Ok(value), "pure_result"),
    pure_vec: /* @__PURE__ */ __name((value) => Vec.from([
      value
    ]), "pure_vec"),
    pure_hashmap: /* @__PURE__ */ __name((key, value) => pureHashMap(key, value), "pure_hashmap"),
    ap_option: /* @__PURE__ */ __name((fns, value) => {
      const fnTag = fns && typeof fns === "object" && isEnumLike2(fns) ? getEnumTag2(fns) : "";
      const valueTag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (fnTag !== "Some" || valueTag !== "Some") return Option3.None;
      const fn = getEnumPayload2(fns);
      if (typeof fn !== "function") return Option3.None;
      return Option3.Some(fn(getEnumPayload2(value)));
    }, "ap_option"),
    ap_result: /* @__PURE__ */ __name((fns, value) => {
      const fnTag = fns && typeof fns === "object" && isEnumLike2(fns) ? getEnumTag2(fns) : "";
      if (fnTag !== "Ok") return fns;
      const valueTag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (valueTag !== "Ok") return value;
      const fn = getEnumPayload2(fns);
      if (typeof fn !== "function") return Result2.Err("Result ap expected Ok(function)");
      return Result2.Ok(fn(getEnumPayload2(value)));
    }, "ap_result"),
    ap_vec: /* @__PURE__ */ __name((fns, values) => {
      const out = Vec.new();
      for (const fn of fns) {
        for (const value of values) {
          out.push(fn(value));
        }
      }
      return out;
    }, "ap_vec"),
    ap_hashmap_values: /* @__PURE__ */ __name((fns, values) => apHashMapValues(fns, values), "ap_hashmap_values")
  };
  const monad2 = {
    flat_map_option: /* @__PURE__ */ __name((value, mapper) => Option3.and_then(mapper, value), "flat_map_option"),
    flat_map_result: /* @__PURE__ */ __name((value, mapper) => Result2.and_then(mapper, value), "flat_map_result"),
    flat_map_vec: /* @__PURE__ */ __name((values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        if (!(mapped instanceof Vec)) continue;
        for (const inner of mapped) out.push(inner);
      }
      return out;
    }, "flat_map_vec"),
    flat_map_hashmap_values: /* @__PURE__ */ __name((values, mapper) => flatMapHashMapValues(values, mapper), "flat_map_hashmap_values"),
    join_option: /* @__PURE__ */ __name((value) => Option3.and_then((v) => v, value), "join_option"),
    join_result: /* @__PURE__ */ __name((value) => Result2.and_then((v) => v, value), "join_result"),
    join_vec: /* @__PURE__ */ __name((values) => {
      const out = Vec.new();
      for (const inner of values) {
        if (!(inner instanceof Vec)) continue;
        for (const value of inner) out.push(value);
      }
      return out;
    }, "join_vec"),
    join_hashmap_values: /* @__PURE__ */ __name((values) => flatMapHashMapValues(values, (inner) => inner), "join_hashmap_values")
  };
  const foldable2 = {
    fold_option: /* @__PURE__ */ __name((value, init, folder) => {
      const tag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (tag !== "Some") return init;
      return folder(init, getEnumPayload2(value));
    }, "fold_option"),
    fold_result: /* @__PURE__ */ __name((value, init, folder) => {
      const tag = value && typeof value === "object" && isEnumLike2(value) ? getEnumTag2(value) : "";
      if (tag !== "Ok") return init;
      return folder(init, getEnumPayload2(value));
    }, "fold_result"),
    fold_vec: /* @__PURE__ */ __name((values, init, folder) => vec.fold(values, init, folder), "fold_vec"),
    fold_hashmap_values: /* @__PURE__ */ __name((values, init, folder) => {
      let acc = init;
      for (const value of values.values()) {
        acc = folder(acc, value);
      }
      return acc;
    }, "fold_hashmap_values")
  };
  const traversable2 = {
    traverse_vec_option: /* @__PURE__ */ __name((values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === "object" && isEnumLike2(mapped) ? getEnumTag2(mapped) : "";
        if (tag !== "Some") return Option3.None;
        out.push(getEnumPayload2(mapped));
      }
      return Option3.Some(out);
    }, "traverse_vec_option"),
    traverse_vec_result: /* @__PURE__ */ __name((values, mapper) => {
      const out = Vec.new();
      for (const value of values) {
        const mapped = mapper(value);
        const tag = mapped && typeof mapped === "object" && isEnumLike2(mapped) ? getEnumTag2(mapped) : "";
        if (tag !== "Ok") return mapped;
        out.push(getEnumPayload2(mapped));
      }
      return Result2.Ok(out);
    }, "traverse_vec_result"),
    sequence_vec_option: /* @__PURE__ */ __name((values) => traversable2.traverse_vec_option(values, (item) => item), "sequence_vec_option"),
    sequence_vec_result: /* @__PURE__ */ __name((values) => traversable2.traverse_vec_result(values, (item) => item), "sequence_vec_result")
  };
  return {
    functor: functor2,
    applicative: applicative2,
    monad: monad2,
    foldable: foldable2,
    traversable: traversable2
  };
}, "createAlgebraRuntime");

// src/runtime/core-runtime.ts
var __lumina_range = /* @__PURE__ */ __name((start, end, inclusive, hasStart, hasEnd) => {
  const startValue = hasStart ? Number(start) : null;
  const endValue = hasEnd ? Number(end) : null;
  return {
    start: startValue,
    end: endValue,
    inclusive: !!inclusive
  };
}, "__lumina_range");
var __lumina_slice = /* @__PURE__ */ __name((str2, start, end, inclusive) => {
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
}, "__lumina_slice");
var isRangeValue = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && "start" in value && "end" in value && "inclusive" in value, "isRangeValue");
var clampIndex = /* @__PURE__ */ __name((value, min, max) => Math.min(Math.max(value, min), max), "clampIndex");
var __lumina_fixed_array = /* @__PURE__ */ __name((size, initializer) => {
  const normalized = Math.max(0, Math.trunc(size));
  const arr = new Array(normalized);
  if (initializer) {
    for (let i = 0; i < normalized; i += 1) {
      arr[i] = initializer(i);
    }
  }
  return arr;
}, "__lumina_fixed_array");
var __lumina_array_bounds_check = /* @__PURE__ */ __name((array, index, expectedSize) => {
  if (expectedSize !== void 0 && array.length !== expectedSize) {
    throw new Error(`Array size mismatch: expected ${expectedSize}, got ${array.length}`);
  }
  if (index < 0 || index >= array.length) {
    throw new Error(`Array index out of bounds: ${index} (array length: ${array.length})`);
  }
}, "__lumina_array_bounds_check");
var __lumina_array_literal = /* @__PURE__ */ __name((elements, expectedSize) => {
  if (expectedSize !== void 0 && elements.length !== expectedSize) {
    throw new Error(`Array literal has wrong size: expected ${expectedSize}, got ${elements.length}`);
  }
  return elements;
}, "__lumina_array_literal");
function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
__name(__set, "__set");
var _LuminaPanic = class _LuminaPanic extends Error {
  constructor(message, value) {
    super(message);
    __publicField(this, "value");
    this.name = "LuminaPanic";
    this.value = value;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _LuminaPanic);
    }
  }
};
__name(_LuminaPanic, "LuminaPanic");
var LuminaPanic = _LuminaPanic;
var createCoreRuntime = /* @__PURE__ */ __name(({ formatValue: formatValue2, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  const __lumina_index2 = /* @__PURE__ */ __name((target, index, expectedSize) => {
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
  }, "__lumina_index");
  const Option3 = {
    Some: /* @__PURE__ */ __name((value) => ({
      $tag: "Some",
      $payload: value
    }), "Some"),
    None: {
      $tag: "None"
    },
    map: /* @__PURE__ */ __name((fn, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return Option3.Some(fn(getEnumPayload2(opt)));
      return Option3.None;
    }, "map"),
    and_then: /* @__PURE__ */ __name((fn, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return fn(getEnumPayload2(opt));
      return Option3.None;
    }, "and_then"),
    or_else: /* @__PURE__ */ __name((fallback, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return opt;
      return fallback();
    }, "or_else"),
    unwrap_or: /* @__PURE__ */ __name((fallback, opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return getEnumPayload2(opt);
      return fallback;
    }, "unwrap_or"),
    is_some: /* @__PURE__ */ __name((opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      return tag === "Some";
    }, "is_some"),
    is_none: /* @__PURE__ */ __name((opt) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      return tag !== "Some";
    }, "is_none"),
    unwrap: /* @__PURE__ */ __name((opt, message) => {
      const tag = opt && typeof opt === "object" && isEnumLike2(opt) ? getEnumTag2(opt) : "";
      if (tag === "Some") return getEnumPayload2(opt);
      const rendered = formatValue2(opt);
      const msg = message ?? `Tried to unwrap None: ${rendered}`;
      const err = new LuminaPanic(msg, opt);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(err, Option3.unwrap);
      }
      throw err;
    }, "unwrap")
  };
  const Result2 = {
    Ok: /* @__PURE__ */ __name((value) => ({
      $tag: "Ok",
      $payload: value
    }), "Ok"),
    Err: /* @__PURE__ */ __name((error) => ({
      $tag: "Err",
      $payload: error
    }), "Err"),
    map: /* @__PURE__ */ __name((fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return Result2.Ok(fn(getEnumPayload2(res)));
      return res;
    }, "map"),
    and_then: /* @__PURE__ */ __name((fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return fn(getEnumPayload2(res));
      return res;
    }, "and_then"),
    or_else: /* @__PURE__ */ __name((fn, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return res;
      return fn(getEnumPayload2(res));
    }, "or_else"),
    unwrap_or: /* @__PURE__ */ __name((fallback, res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      if (tag === "Ok") return getEnumPayload2(res);
      return fallback;
    }, "unwrap_or"),
    is_ok: /* @__PURE__ */ __name((res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      return tag === "Ok";
    }, "is_ok"),
    is_err: /* @__PURE__ */ __name((res) => {
      const tag = res && typeof res === "object" && isEnumLike2(res) ? getEnumTag2(res) : "";
      return tag !== "Ok";
    }, "is_err")
  };
  return {
    __lumina_index: __lumina_index2,
    Option: Option3,
    Result: Result2
  };
}, "createCoreRuntime");

// src/runtime/concurrency-runtime.ts
var formatError = /* @__PURE__ */ __name((error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}, "formatError");
var isUrlLike = /* @__PURE__ */ __name((specifier) => /^[a-z]+:/i.test(specifier), "isUrlLike");
var toWorkerMessageString = /* @__PURE__ */ __name((value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}, "toWorkerMessageString");
var toByteNumber = /* @__PURE__ */ __name((value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(num)));
}, "toByteNumber");
var toByteArray = /* @__PURE__ */ __name((value) => {
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
}, "toByteArray");
var decodeTextFromBytes = /* @__PURE__ */ __name((bytes) => {
  const data = Uint8Array.from(bytes);
  if (typeof TextDecoder === "function") {
    return new TextDecoder().decode(data);
  }
  return String.fromCharCode(...Array.from(data));
}, "decodeTextFromBytes");
var STREAM_DEFAULT_CHUNK_SIZE = 16 * 1024;
var _AtomicI32 = class _AtomicI32 {
  constructor(initial) {
    __publicField(this, "storage", null);
    __publicField(this, "fallback", 0);
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
__name(_AtomicI32, "AtomicI32");
var AtomicI32 = _AtomicI32;
var _Thread = class _Thread {
  constructor(entry, option) {
    __publicField(this, "entry");
    __publicField(this, "option");
    __publicField(this, "queue", []);
    __publicField(this, "waiters", []);
    __publicField(this, "closed", false);
    __publicField(this, "exitCode", null);
    __publicField(this, "joinWaiters", []);
    this.entry = entry;
    this.option = option;
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
__name(_Thread, "Thread");
var Thread = _Thread;
var _ThreadHandle = class _ThreadHandle {
  constructor(task, resultRuntime) {
    __publicField(this, "resultRuntime");
    __publicField(this, "result");
    this.resultRuntime = resultRuntime;
    this.result = Promise.resolve().then(() => task()).then((value) => this.resultRuntime.Ok(value), (error) => this.resultRuntime.Err(error instanceof Error ? error.message : String(error)));
  }
  join() {
    return this.result;
  }
};
__name(_ThreadHandle, "ThreadHandle");
var ThreadHandle = _ThreadHandle;
var createConcurrencyRuntime = /* @__PURE__ */ __name((deps) => {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  let webWorkerNextHandle = 1;
  const webWorkerHandles = /* @__PURE__ */ new Map();
  let runtimeStreamNextHandle = 1;
  const runtimeStreams = /* @__PURE__ */ new Map();
  const option = /* @__PURE__ */ __name(() => deps.getOption(), "option");
  const result = /* @__PURE__ */ __name(() => deps.getResult(), "result");
  const channel2 = /* @__PURE__ */ __name(() => deps.getChannel(), "channel");
  const resolveNodeWorkerSpecifier = /* @__PURE__ */ __name((specifier) => {
    if (isUrlLike(specifier)) return specifier;
    const nodePath = getNodePath();
    return nodePath ? nodePath.resolve(specifier) : resolvePathBasic(specifier);
  }, "resolveNodeWorkerSpecifier");
  const createThreadWorker = /* @__PURE__ */ __name(async (specifier) => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import("worker_threads");
        const WorkerCtor = nodeWorkers.Worker;
        if (typeof WorkerCtor === "function") {
          const worker = new WorkerCtor(resolveNodeWorkerSpecifier(specifier), {
            type: "module"
          });
          return {
            kind: "node",
            worker
          };
        }
      } catch {
      }
    }
    if (typeof Worker === "function") {
      const worker = new Worker(specifier, {
        type: "module"
      });
      return {
        kind: "web",
        worker
      };
    }
    throw new Error("Worker API is not available in this environment");
  }, "createThreadWorker");
  const getWebWorkerRecord = /* @__PURE__ */ __name((handle) => webWorkerHandles.get(Math.trunc(handle)) ?? null, "getWebWorkerRecord");
  const registerWebWorker = /* @__PURE__ */ __name((entry, inlineUrl = null) => {
    const id = webWorkerNextHandle++;
    webWorkerHandles.set(id, {
      id,
      entry,
      inlineUrl
    });
    return id;
  }, "registerWebWorker");
  const createInlineWorker = /* @__PURE__ */ __name(async (source) => {
    if (isNodeRuntime()) {
      try {
        const nodeWorkers = await import("worker_threads");
        const WorkerCtor = nodeWorkers.Worker;
        if (typeof WorkerCtor === "function") {
          return {
            worker: {
              kind: "node",
              worker: new WorkerCtor(String(source), {
                eval: true
              })
            },
            inlineUrl: null
          };
        }
      } catch {
      }
    }
    if (typeof Worker === "function" && typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([
        String(source)
      ], {
        type: "application/javascript"
      });
      const inlineUrl = URL.createObjectURL(blob);
      const worker = new Worker(inlineUrl, {
        type: "module"
      });
      return {
        worker: {
          kind: "web",
          worker
        },
        inlineUrl
      };
    }
    throw new Error("Worker API is not available in this environment");
  }, "createInlineWorker");
  const cleanupWebWorkerRecord = /* @__PURE__ */ __name((record) => {
    if (!record) return;
    webWorkerHandles.delete(record.id);
    if (record.inlineUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try {
        URL.revokeObjectURL(record.inlineUrl);
      } catch {
      }
    }
  }, "cleanupWebWorkerRecord");
  const isWorkerContextBrowser = /* @__PURE__ */ __name(() => typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope, "isWorkerContextBrowser");
  const isWorkerContextNode = /* @__PURE__ */ __name(() => {
    if (!isNodeRuntime()) return false;
    const workerThreads = getNodeBuiltinModule("node:worker_threads");
    return workerThreads != null && typeof workerThreads.isMainThread === "boolean" ? !workerThreads.isMainThread : false;
  }, "isWorkerContextNode");
  const registerRuntimeStream = /* @__PURE__ */ __name((state2) => {
    const id = runtimeStreamNextHandle++;
    runtimeStreams.set(id, {
      id,
      state: state2
    });
    return id;
  }, "registerRuntimeStream");
  const cleanupRuntimeStreamHandle = /* @__PURE__ */ __name((handle, seen = /* @__PURE__ */ new Set()) => {
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
  }, "cleanupRuntimeStreamHandle");
  const readChunkFromRuntimeStream = /* @__PURE__ */ __name(async (handle, seen = /* @__PURE__ */ new Set()) => {
    const normalized = Math.trunc(handle);
    if (seen.has(normalized)) {
      return {
        ok: false,
        error: "Detected cyclic stream pipeline"
      };
    }
    const record = runtimeStreams.get(normalized);
    if (!record) return {
      ok: false,
      error: `Unknown stream handle ${handle}`
    };
    if (record.state.kind === "buffer") {
      const state2 = record.state;
      if (state2.offset >= state2.data.length) return {
        ok: true,
        chunk: null
      };
      const nextEnd = Math.min(state2.data.length, state2.offset + state2.chunkSize);
      const chunk = Array.from(state2.data.subarray(state2.offset, nextEnd));
      state2.offset = nextEnd;
      return {
        ok: true,
        chunk
      };
    }
    if (record.state.kind === "reader") {
      const state2 = record.state;
      if (state2.done) return {
        ok: true,
        chunk: null
      };
      try {
        const next = await state2.reader.read();
        if (next.done) {
          state2.done = true;
          return {
            ok: true,
            chunk: null
          };
        }
        return {
          ok: true,
          chunk: Array.from(toByteArray(next.value))
        };
      } catch (error) {
        return {
          ok: false,
          error: formatError(error)
        };
      }
    }
    const pipeState = record.state;
    const nestedSeen = new Set(seen);
    nestedSeen.add(normalized);
    const source = await readChunkFromRuntimeStream(pipeState.sourceHandle, nestedSeen);
    if (!source.ok) return source;
    if (source.chunk == null) return source;
    try {
      return {
        ok: true,
        chunk: Array.from(toByteArray(pipeState.transform(source.chunk)))
      };
    } catch (error) {
      return {
        ok: false,
        error: formatError(error)
      };
    }
  }, "readChunkFromRuntimeStream");
  const sabYield = /* @__PURE__ */ __name(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, "sabYield");
  let Mutex = (_a2 = class {
    constructor() {
      __publicField(this, "locked", false);
      __publicField(this, "waiters", []);
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
  }, __name(_a2, "Mutex"), _a2);
  let Semaphore = (_b = class {
    constructor(initialPermits) {
      __publicField(this, "permits");
      __publicField(this, "waiters", []);
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
  }, __name(_b, "Semaphore"), _b);
  const sync2 = {
    mutex_new: /* @__PURE__ */ __name(() => new Mutex(), "mutex_new"),
    mutex_acquire: /* @__PURE__ */ __name(async (mutex) => mutex.acquire(), "mutex_acquire"),
    mutex_try_acquire: /* @__PURE__ */ __name((mutex) => mutex.try_acquire(), "mutex_try_acquire"),
    mutex_release: /* @__PURE__ */ __name((mutex) => mutex.release(), "mutex_release"),
    mutex_is_locked: /* @__PURE__ */ __name((mutex) => mutex.is_locked(), "mutex_is_locked"),
    semaphore_new: /* @__PURE__ */ __name((permits) => new Semaphore(permits), "semaphore_new"),
    semaphore_acquire: /* @__PURE__ */ __name(async (semaphore) => semaphore.acquire(), "semaphore_acquire"),
    semaphore_try_acquire: /* @__PURE__ */ __name((semaphore) => semaphore.try_acquire(), "semaphore_try_acquire"),
    semaphore_release: /* @__PURE__ */ __name((semaphore, count = 1) => semaphore.release(count), "semaphore_release"),
    semaphore_available: /* @__PURE__ */ __name((semaphore) => semaphore.available(), "semaphore_available"),
    atomic_i32_new: /* @__PURE__ */ __name((initial) => new AtomicI32(initial), "atomic_i32_new"),
    atomic_i32_is_available: /* @__PURE__ */ __name(() => AtomicI32.is_available(), "atomic_i32_is_available"),
    atomic_i32_load: /* @__PURE__ */ __name((value) => value.load(), "atomic_i32_load"),
    atomic_i32_store: /* @__PURE__ */ __name((value, next) => value.store(next), "atomic_i32_store"),
    atomic_i32_add: /* @__PURE__ */ __name((value, delta) => value.add(delta), "atomic_i32_add"),
    atomic_i32_sub: /* @__PURE__ */ __name((value, delta) => value.sub(delta), "atomic_i32_sub"),
    atomic_i32_compare_exchange: /* @__PURE__ */ __name((value, expected, replacement) => value.compare_exchange(expected, replacement), "atomic_i32_compare_exchange")
  };
  const SAB_HEAD = 0;
  const SAB_TAIL = 1;
  const SAB_COUNT = 2;
  const SAB_SENDER_CLOSED = 3;
  const SAB_RECEIVER_CLOSED = 4;
  const SAB_CLOSE_FLAG = 5;
  const SAB_CONTROL_WORDS = 6;
  const SAB_DATA_OFFSET_BYTES = Int32Array.BYTES_PER_ELEMENT * SAB_CONTROL_WORDS;
  const sabElementSize = /* @__PURE__ */ __name((kind) => kind === "f64" ? 8 : 4, "sabElementSize");
  const normalizeSabValue = /* @__PURE__ */ __name((kind, value) => {
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
  }, "normalizeSabValue");
  const createSABChannelState = /* @__PURE__ */ __name((capacity, kind) => {
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
      const state2 = {
        mode: "sab",
        kind,
        capacity: cap,
        control
      };
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
  }, "createSABChannelState");
  const writeSabStateValue = /* @__PURE__ */ __name((state2, index, value) => {
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
  }, "writeSabStateValue");
  const readSabStateValue = /* @__PURE__ */ __name((state2, index) => {
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
  }, "readSabStateValue");
  let SABSenderBase = (_c = class {
    constructor(state2) {
      __publicField(this, "state");
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
  }, __name(_c, "SABSenderBase"), _c);
  let SABReceiverBase = (_d = class {
    constructor(state2) {
      __publicField(this, "state");
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
  }, __name(_d, "SABReceiverBase"), _d);
  let SABSenderI32 = (_e = class extends SABSenderBase {
  }, __name(_e, "SABSenderI32"), _e);
  let SABReceiverI32 = (_f = class extends SABReceiverBase {
  }, __name(_f, "SABReceiverI32"), _f);
  let SABSenderU32 = (_g = class extends SABSenderBase {
  }, __name(_g, "SABSenderU32"), _g);
  let SABReceiverU32 = (_h = class extends SABReceiverBase {
  }, __name(_h, "SABReceiverU32"), _h);
  let SABSenderF32 = (_i = class extends SABSenderBase {
  }, __name(_i, "SABSenderF32"), _i);
  let SABReceiverF32 = (_j = class extends SABReceiverBase {
  }, __name(_j, "SABReceiverF32"), _j);
  let SABSenderF64 = (_k = class extends SABSenderBase {
  }, __name(_k, "SABSenderF64"), _k);
  let SABReceiverF64 = (_l = class extends SABReceiverBase {
  }, __name(_l, "SABReceiverF64"), _l);
  const sab_channel2 = {
    is_available: /* @__PURE__ */ __name(() => AtomicI32.is_available() || channel2().is_available(), "is_available"),
    bounded_i32: /* @__PURE__ */ __name((capacity) => {
      const state2 = createSABChannelState(capacity, "i32");
      return {
        sender: new SABSenderI32(state2),
        receiver: new SABReceiverI32(state2)
      };
    }, "bounded_i32"),
    bounded_u32: /* @__PURE__ */ __name((capacity) => {
      const state2 = createSABChannelState(capacity, "u32");
      return {
        sender: new SABSenderU32(state2),
        receiver: new SABReceiverU32(state2)
      };
    }, "bounded_u32"),
    bounded_f32: /* @__PURE__ */ __name((capacity) => {
      const state2 = createSABChannelState(capacity, "f32");
      return {
        sender: new SABSenderF32(state2),
        receiver: new SABReceiverF32(state2)
      };
    }, "bounded_f32"),
    bounded_f64: /* @__PURE__ */ __name((capacity) => {
      const state2 = createSABChannelState(capacity, "f64");
      return {
        sender: new SABSenderF64(state2),
        receiver: new SABReceiverF64(state2)
      };
    }, "bounded_f64"),
    send_i32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "send_i32"),
    try_send_i32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "try_send_i32"),
    send_async_i32: /* @__PURE__ */ __name((sender, value) => sender.send(value), "send_async_i32"),
    send_timeout_i32: /* @__PURE__ */ __name((sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs), "send_timeout_i32"),
    recv_i32: /* @__PURE__ */ __name((receiver) => receiver.recv(), "recv_i32"),
    try_recv_i32: /* @__PURE__ */ __name((receiver) => receiver.try_recv(), "try_recv_i32"),
    close_sender_i32: /* @__PURE__ */ __name((sender) => sender.close(), "close_sender_i32"),
    close_receiver_i32: /* @__PURE__ */ __name((receiver) => receiver.close(), "close_receiver_i32"),
    is_sender_closed_i32: /* @__PURE__ */ __name((sender) => sender.is_closed(), "is_sender_closed_i32"),
    is_receiver_closed_i32: /* @__PURE__ */ __name((receiver) => receiver.is_closed(), "is_receiver_closed_i32"),
    close_i32: /* @__PURE__ */ __name((ch) => {
      ch.sender.close();
      ch.receiver.close();
    }, "close_i32"),
    send_u32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "send_u32"),
    try_send_u32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "try_send_u32"),
    send_async_u32: /* @__PURE__ */ __name((sender, value) => sender.send(value), "send_async_u32"),
    send_timeout_u32: /* @__PURE__ */ __name((sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs), "send_timeout_u32"),
    recv_u32: /* @__PURE__ */ __name((receiver) => receiver.recv(), "recv_u32"),
    try_recv_u32: /* @__PURE__ */ __name((receiver) => receiver.try_recv(), "try_recv_u32"),
    close_sender_u32: /* @__PURE__ */ __name((sender) => sender.close(), "close_sender_u32"),
    close_receiver_u32: /* @__PURE__ */ __name((receiver) => receiver.close(), "close_receiver_u32"),
    is_sender_closed_u32: /* @__PURE__ */ __name((sender) => sender.is_closed(), "is_sender_closed_u32"),
    is_receiver_closed_u32: /* @__PURE__ */ __name((receiver) => receiver.is_closed(), "is_receiver_closed_u32"),
    close_u32: /* @__PURE__ */ __name((ch) => {
      ch.sender.close();
      ch.receiver.close();
    }, "close_u32"),
    send_f32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "send_f32"),
    try_send_f32: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "try_send_f32"),
    send_async_f32: /* @__PURE__ */ __name((sender, value) => sender.send(value), "send_async_f32"),
    send_timeout_f32: /* @__PURE__ */ __name((sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs), "send_timeout_f32"),
    recv_f32: /* @__PURE__ */ __name((receiver) => receiver.recv(), "recv_f32"),
    try_recv_f32: /* @__PURE__ */ __name((receiver) => receiver.try_recv(), "try_recv_f32"),
    close_sender_f32: /* @__PURE__ */ __name((sender) => sender.close(), "close_sender_f32"),
    close_receiver_f32: /* @__PURE__ */ __name((receiver) => receiver.close(), "close_receiver_f32"),
    is_sender_closed_f32: /* @__PURE__ */ __name((sender) => sender.is_closed(), "is_sender_closed_f32"),
    is_receiver_closed_f32: /* @__PURE__ */ __name((receiver) => receiver.is_closed(), "is_receiver_closed_f32"),
    close_f32: /* @__PURE__ */ __name((ch) => {
      ch.sender.close();
      ch.receiver.close();
    }, "close_f32"),
    send_f64: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "send_f64"),
    try_send_f64: /* @__PURE__ */ __name((sender, value) => sender.try_send(value), "try_send_f64"),
    send_async_f64: /* @__PURE__ */ __name((sender, value) => sender.send(value), "send_async_f64"),
    send_timeout_f64: /* @__PURE__ */ __name((sender, value, timeoutMs) => sender.send_timeout(value, timeoutMs), "send_timeout_f64"),
    recv_f64: /* @__PURE__ */ __name((receiver) => receiver.recv(), "recv_f64"),
    try_recv_f64: /* @__PURE__ */ __name((receiver) => receiver.try_recv(), "try_recv_f64"),
    close_sender_f64: /* @__PURE__ */ __name((sender) => sender.close(), "close_sender_f64"),
    close_receiver_f64: /* @__PURE__ */ __name((receiver) => receiver.close(), "close_receiver_f64"),
    is_sender_closed_f64: /* @__PURE__ */ __name((sender) => sender.is_closed(), "is_sender_closed_f64"),
    is_receiver_closed_f64: /* @__PURE__ */ __name((receiver) => receiver.is_closed(), "is_receiver_closed_f64"),
    close_f64: /* @__PURE__ */ __name((ch) => {
      ch.sender.close();
      ch.receiver.close();
    }, "close_f64")
  };
  const thread2 = {
    is_available: /* @__PURE__ */ __name(() => isNodeRuntime() || typeof Worker === "function", "is_available"),
    spawn: /* @__PURE__ */ __name((task) => {
      if (typeof task === "function") {
        return new ThreadHandle(() => task(), result());
      }
      return thread2.spawn_worker(task);
    }, "spawn"),
    spawn_worker: /* @__PURE__ */ __name(async (specifier) => {
      if (typeof specifier !== "string" || specifier.length === 0) {
        return result().Err("Thread specifier must be a non-empty string");
      }
      try {
        const worker = await createThreadWorker(specifier);
        return result().Ok(new Thread(worker, option()));
      } catch (error) {
        return result().Err(String(error));
      }
    }, "spawn_worker"),
    post: /* @__PURE__ */ __name((handle, value) => handle.post(value), "post"),
    recv: /* @__PURE__ */ __name((handle) => handle.recv(), "recv"),
    try_recv: /* @__PURE__ */ __name((handle) => handle.try_recv(), "try_recv"),
    terminate: /* @__PURE__ */ __name(async (handle) => {
      await handle.terminate();
    }, "terminate"),
    join: /* @__PURE__ */ __name((handle) => {
      if (handle instanceof ThreadHandle) return handle.join();
      if (handle instanceof Thread) return handle.join();
      throw new Error("Invalid thread handle");
    }, "join"),
    join_worker: /* @__PURE__ */ __name((handle) => handle.join(), "join_worker")
  };
  const web_worker2 = {
    is_available: /* @__PURE__ */ __name(() => isNodeRuntime() || typeof Worker === "function", "is_available"),
    spawn: /* @__PURE__ */ __name(async (specifier) => {
      const input = String(specifier ?? "").trim();
      if (!input) return result().Err("Worker specifier must be a non-empty string");
      try {
        const worker = await createThreadWorker(input);
        return result().Ok(registerWebWorker(worker));
      } catch (error) {
        return result().Err(formatError(error));
      }
    }, "spawn"),
    spawn_inline: /* @__PURE__ */ __name(async (source) => {
      const input = String(source ?? "");
      if (!input.trim()) return result().Err("Inline worker source must be a non-empty string");
      try {
        const worker = await createInlineWorker(input);
        return result().Ok(registerWebWorker(worker.worker, worker.inlineUrl));
      } catch (error) {
        return result().Err(formatError(error));
      }
    }, "spawn_inline"),
    post: /* @__PURE__ */ __name((handle, msg) => {
      const record = getWebWorkerRecord(handle);
      if (!record) return result().Err(`Unknown worker handle ${handle}`);
      try {
        record.entry.worker.postMessage(String(msg));
        return result().Ok(void 0);
      } catch (error) {
        return result().Err(formatError(error));
      }
    }, "post"),
    on_message: /* @__PURE__ */ __name((handle, handler) => {
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
    }, "on_message"),
    on_error: /* @__PURE__ */ __name((handle, handler) => {
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
    }, "on_error"),
    terminate: /* @__PURE__ */ __name((handle) => {
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
    }, "terminate"),
    is_worker_context: /* @__PURE__ */ __name(() => isWorkerContextBrowser() || isWorkerContextNode(), "is_worker_context"),
    self_post: /* @__PURE__ */ __name((msg) => {
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
    }, "self_post"),
    self_on_message: /* @__PURE__ */ __name((handler) => {
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
    }, "self_on_message")
  };
  const web_streams2 = {
    is_available: /* @__PURE__ */ __name(() => typeof ReadableStream === "function" || typeof fetch === "function" || isNodeRuntime(), "is_available"),
    from_fetch: /* @__PURE__ */ __name(async (url2) => {
      if (typeof fetch !== "function") return result().Err("Fetch API is not available in this environment");
      try {
        const response = await fetch(String(url2));
        const body = response.body;
        if (body && typeof body.getReader === "function") {
          const reader = body.getReader();
          return result().Ok(registerRuntimeStream({
            kind: "reader",
            reader,
            done: false
          }));
        }
        if (typeof response.arrayBuffer === "function") {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return result().Ok(registerRuntimeStream({
            kind: "buffer",
            data: bytes,
            offset: 0,
            chunkSize: STREAM_DEFAULT_CHUNK_SIZE
          }));
        }
        return result().Err("Response body stream is not available");
      } catch (error) {
        return result().Err(formatError(error));
      }
    }, "from_fetch"),
    from_string: /* @__PURE__ */ __name((source) => {
      const bytes = typeof TextEncoder === "function" ? new TextEncoder().encode(String(source)) : Uint8Array.from(String(source).split("").map((ch) => ch.charCodeAt(0) & 255));
      return registerRuntimeStream({
        kind: "buffer",
        data: bytes,
        offset: 0,
        chunkSize: STREAM_DEFAULT_CHUNK_SIZE
      });
    }, "from_string"),
    from_bytes: /* @__PURE__ */ __name((data) => registerRuntimeStream({
      kind: "buffer",
      data: toByteArray(data),
      offset: 0,
      chunkSize: STREAM_DEFAULT_CHUNK_SIZE
    }), "from_bytes"),
    read_chunk: /* @__PURE__ */ __name(async (streamHandle) => {
      const next = await readChunkFromRuntimeStream(streamHandle);
      if (!next.ok) return result().Err(next.error);
      if (next.chunk == null) return result().Ok(option().None);
      return result().Ok(option().Some(next.chunk));
    }, "read_chunk"),
    read_all: /* @__PURE__ */ __name(async (streamHandle) => {
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
    }, "read_all"),
    read_text: /* @__PURE__ */ __name(async (streamHandle) => {
      const all = await web_streams2.read_all(streamHandle);
      if (!deps.isEnumLike(all) || deps.getEnumTag(all) !== "Ok") return all;
      return result().Ok(decodeTextFromBytes(deps.getEnumPayload(all)));
    }, "read_text"),
    pipe: /* @__PURE__ */ __name((sourceHandle, transform) => registerRuntimeStream({
      kind: "pipe",
      sourceHandle: Math.trunc(sourceHandle),
      transform
    }), "pipe"),
    cancel: /* @__PURE__ */ __name((streamHandle) => {
      cleanupRuntimeStreamHandle(streamHandle);
    }, "cancel")
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
}, "createConcurrencyRuntime");

// src/runtime/dom-accessibility.ts
var elementRecord = /* @__PURE__ */ __name((element) => element, "elementRecord");
var readChildNodes = /* @__PURE__ */ __name((node) => Array.from(node?.childNodes ?? []), "readChildNodes");
var getDomAttribute = /* @__PURE__ */ __name((element, name) => {
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
}, "getDomAttribute");
var findDomElementById = /* @__PURE__ */ __name((root, id) => {
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
}, "findDomElementById");
var isElementHidden = /* @__PURE__ */ __name((element) => elementRecord(element).hidden === true || getDomAttribute(element, "hidden") !== null, "isElementHidden");
var isElementDisabled = /* @__PURE__ */ __name((element) => elementRecord(element).disabled === true || getDomAttribute(element, "disabled") !== null, "isElementDisabled");
var isElementInert = /* @__PURE__ */ __name((element) => {
  let current = element;
  while (current) {
    const candidate = current;
    if (elementRecord(candidate).inert === true || getDomAttribute(candidate, "inert") !== null) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}, "isElementInert");
var getElementTabIndex = /* @__PURE__ */ __name((element) => {
  const raw = elementRecord(element).tabIndex ?? getDomAttribute(element, "tabIndex") ?? getDomAttribute(element, "tabindex");
  if (raw === null || raw === void 0 || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}, "getElementTabIndex");
var isFocusableElement = /* @__PURE__ */ __name((element) => {
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
}, "isFocusableElement");
var collectFocusableDescendants = /* @__PURE__ */ __name((root) => {
  const focusable = [];
  const visit = /* @__PURE__ */ __name((node) => {
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
  }, "visit");
  visit(root);
  return focusable;
}, "collectFocusableDescendants");
var findFirstFocusableDescendant = /* @__PURE__ */ __name((root) => collectFocusableDescendants(root)[0] ?? null, "findFirstFocusableDescendant");
var getFocusTargetFromEvent = /* @__PURE__ */ __name((event) => {
  if (!event || typeof event !== "object") return null;
  const target = event.currentTarget ?? event.target;
  return target && typeof target === "object" ? target : null;
}, "getFocusTargetFromEvent");
var trapDialogTabNavigation = /* @__PURE__ */ __name((event) => {
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
}, "trapDialogTabNavigation");

// src/runtime/dom-reconciler.ts
var setChildren = /* @__PURE__ */ __name((container, children2) => {
  const current = readChildNodes(container);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children2) {
    container.appendChild(child);
  }
}, "setChildren");
var findStableSequenceWindow = /* @__PURE__ */ __name((currentChildren, nextChildren, equals = (left, right) => left === right) => {
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
  return {
    currentStart,
    currentEnd,
    nextStart,
    nextEnd
  };
}, "findStableSequenceWindow");
var getTransitionAffectedRange = /* @__PURE__ */ __name((transition, length) => {
  switch (transition.kind) {
    case "same_order":
      return null;
    case "adjacent_swap":
      return {
        start: transition.left,
        end: transition.right
      };
    case "single_move":
      return {
        start: Math.min(transition.from, transition.to),
        end: Math.max(transition.from, transition.to)
      };
    case "complex_reorder":
      if (typeof transition.start === "number" && typeof transition.end === "number") {
        return {
          start: transition.start,
          end: transition.end
        };
      }
      return length > 0 ? {
        start: 0,
        end: length - 1
      } : null;
  }
}, "getTransitionAffectedRange");
var findSingleMove = /* @__PURE__ */ __name((previous, next, equals, first, last) => {
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
      return {
        from,
        to: first
      };
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
      return {
        from: first,
        to
      };
    }
  }
  return null;
}, "findSingleMove");
var analyzeSequenceTransition = /* @__PURE__ */ __name((previous, next, equals) => {
  if (previous.length !== next.length) {
    return {
      kind: "complex_reorder"
    };
  }
  let firstMismatch = -1;
  for (let index = 0; index < previous.length; index += 1) {
    if (!equals(previous[index], next[index])) {
      firstMismatch = index;
      break;
    }
  }
  if (firstMismatch < 0) {
    return {
      kind: "same_order"
    };
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
        return {
          kind: "adjacent_swap",
          left,
          right
        };
      }
    }
  }
  const singleMove = findSingleMove(previous, next, equals, firstMismatch, lastMismatch);
  if (singleMove) {
    return {
      kind: "single_move",
      from: singleMove.from,
      to: singleMove.to
    };
  }
  return {
    kind: "complex_reorder",
    start: firstMismatch,
    end: lastMismatch
  };
}, "analyzeSequenceTransition");
var analyzeDomChildTransition = /* @__PURE__ */ __name((currentChildren, nextChildren) => analyzeSequenceTransition(currentChildren, nextChildren, (left, right) => left === right), "analyzeDomChildTransition");
var longestIncreasingSubsequenceIndices = /* @__PURE__ */ __name((values) => {
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
}, "longestIncreasingSubsequenceIndices");
var resolveComplexTransitionWindow = /* @__PURE__ */ __name((transition, currentLength, nextLength) => {
  if (transition.kind !== "complex_reorder" || typeof transition.start !== "number" || typeof transition.end !== "number" || currentLength !== nextLength || transition.start < 0 || transition.end < transition.start || transition.end >= currentLength) {
    return null;
  }
  return {
    currentStart: transition.start,
    currentEnd: transition.end,
    nextStart: transition.start,
    nextEnd: transition.end
  };
}, "resolveComplexTransitionWindow");
var reorderChildren = /* @__PURE__ */ __name((container, children2, disposeChild, options) => {
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
  const { currentStart, currentEnd, nextStart, nextEnd } = window2;
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
}, "reorderChildren");

// src/runtime/reactive-core.ts
var defaultHooks = {
  cloneValue: /* @__PURE__ */ __name((value) => value, "cloneValue"),
  equalsValue: Object.is,
  scheduleMicrotask: /* @__PURE__ */ __name((fn) => {
    Promise.resolve().then(fn);
  }, "scheduleMicrotask"),
  registerSignal: /* @__PURE__ */ __name(() => 0, "registerSignal"),
  unregisterSignal: /* @__PURE__ */ __name(() => void 0, "unregisterSignal"),
  notifyDevtools: /* @__PURE__ */ __name(() => void 0, "notifyDevtools")
};
var reactiveHooks = defaultHooks;
var configureReactiveCore = /* @__PURE__ */ __name((hooks) => {
  reactiveHooks = {
    ...reactiveHooks,
    ...hooks
  };
}, "configureReactiveCore");
var activeComputation = null;
var pendingEffects = /* @__PURE__ */ new Set();
var effectFlushPending = false;
var batchDepth = 0;
var flushEffects = /* @__PURE__ */ __name(() => {
  if (pendingEffects.size === 0) return;
  const toRun = Array.from(pendingEffects);
  pendingEffects.clear();
  for (const computation of toRun) {
    computation.run();
  }
  if (pendingEffects.size > 0 && batchDepth === 0) {
    scheduleEffectsFlush();
  }
}, "flushEffects");
var scheduleEffectsFlush = /* @__PURE__ */ __name(() => {
  if (batchDepth > 0 || effectFlushPending) return;
  effectFlushPending = true;
  reactiveHooks.scheduleMicrotask(() => {
    effectFlushPending = false;
    flushEffects();
  });
}, "scheduleEffectsFlush");
var trackReactiveSource = /* @__PURE__ */ __name((source) => {
  if (!activeComputation) return;
  if (activeComputation.isDisposed()) return;
  if (source.observers.has(activeComputation)) return;
  source.observers.add(activeComputation);
  activeComputation.dependencies.add(source);
}, "trackReactiveSource");
var clearComputationDependencies = /* @__PURE__ */ __name((computation) => {
  for (const dep of computation.dependencies) {
    dep.observers.delete(computation);
  }
  computation.dependencies.clear();
}, "clearComputationDependencies");
var _a;
var ReactiveComputation = (_a = class {
  constructor(runner, kind, onInvalidate) {
    __publicField(this, "runner");
    __publicField(this, "kind");
    __publicField(this, "onInvalidate");
    __publicField(this, "dependencies", /* @__PURE__ */ new Set());
    __publicField(this, "cleanups", []);
    __publicField(this, "disposed", false);
    __publicField(this, "running", false);
    this.runner = runner;
    this.kind = kind;
    this.onInvalidate = onInvalidate;
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
}, __name(_a, "ReactiveComputation"), _a);
var notifyReactiveObservers = /* @__PURE__ */ __name((source) => {
  const observers = Array.from(source.observers);
  for (const observer of observers) {
    observer.invalidate();
  }
}, "notifyReactiveObservers");
var _Signal = class _Signal {
  constructor(initial) {
    __publicField(this, "observers", /* @__PURE__ */ new Set());
    __publicField(this, "__luminaDevtoolsId");
    __publicField(this, "value");
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
__name(_Signal, "Signal");
var Signal = _Signal;
var _Memo = class _Memo {
  constructor(compute) {
    __publicField(this, "observers", /* @__PURE__ */ new Set());
    __publicField(this, "__luminaDevtoolsId");
    __publicField(this, "compute");
    __publicField(this, "computation");
    __publicField(this, "value");
    __publicField(this, "ready", false);
    __publicField(this, "stale", true);
    this.__luminaDevtoolsId = reactiveHooks.registerSignal?.("memo", this) ?? 0;
    this.compute = compute;
    this.computation = new ReactiveComputation(() => {
      const next = reactiveHooks.cloneValue(this.compute());
      const changed = !this.ready || !reactiveHooks.equalsValue(this.value, next);
      this.value = next;
      this.ready = true;
      this.stale = false;
      reactiveHooks.notifyDevtools?.();
      if (changed) {
        notifyReactiveObservers(this);
      }
    }, "memo", () => {
      this.stale = true;
      notifyReactiveObservers(this);
      reactiveHooks.notifyDevtools?.();
    });
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
__name(_Memo, "Memo");
var Memo = _Memo;
var _Effect = class _Effect {
  constructor(effectFn) {
    __publicField(this, "computation");
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
__name(_Effect, "Effect");
var Effect = _Effect;
var batch = /* @__PURE__ */ __name((fn) => {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth = Math.max(0, batchDepth - 1);
    if (batchDepth === 0) {
      flushEffects();
    }
  }
}, "batch");
var untrack = /* @__PURE__ */ __name((fn) => {
  const previous = activeComputation;
  activeComputation = null;
  try {
    return fn();
  } finally {
    activeComputation = previous;
  }
}, "untrack");
var createStaticSignal = /* @__PURE__ */ __name((value) => {
  let current = reactiveHooks.cloneValue(value);
  return {
    observers: /* @__PURE__ */ new Set(),
    __luminaDevtoolsId: 0,
    get: /* @__PURE__ */ __name(() => reactiveHooks.cloneValue(current), "get"),
    peek: /* @__PURE__ */ __name(() => reactiveHooks.cloneValue(current), "peek"),
    set: /* @__PURE__ */ __name((next) => {
      current = reactiveHooks.cloneValue(next);
      return true;
    }, "set"),
    update: /* @__PURE__ */ __name((updater) => {
      current = reactiveHooks.cloneValue(updater(reactiveHooks.cloneValue(current)));
      return reactiveHooks.cloneValue(current);
    }, "update")
  };
}, "createStaticSignal");
var readSignalRaw = /* @__PURE__ */ __name((signal, tracked) => {
  if (tracked) {
    trackReactiveSource(signal);
  }
  return signal.value;
}, "readSignalRaw");

// src/runtime/vnode-core.ts
var normalizeVNodeChildren = /* @__PURE__ */ __name((input) => {
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
    return [
      input
    ];
  }
  return [
    vnodeText(input)
  ];
}, "normalizeVNodeChildren");
var sanitizeProps = /* @__PURE__ */ __name((props) => {
  if (!props) return {};
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== void 0) out[key] = value;
  }
  return out;
}, "sanitizeProps");
var isVNode = /* @__PURE__ */ __name((value) => {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return candidate.kind === "text" || candidate.kind === "live_text" || candidate.kind === "index_list" || candidate.kind === "for_list" || candidate.kind === "element" || candidate.kind === "fragment" || candidate.kind === "portal";
}, "isVNode");
var vnodeText = /* @__PURE__ */ __name((value) => ({
  kind: "text",
  text: value == null ? "" : String(value)
}), "vnodeText");
var vnodeLiveText = /* @__PURE__ */ __name((signal) => ({
  kind: "live_text",
  signal
}), "vnodeLiveText");
var readIndexListValues = /* @__PURE__ */ __name((signal, tracked) => {
  const value = readSignalRaw(signal, tracked);
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iterator = value[Symbol.iterator];
    if (typeof iterator === "function") {
      return Array.from(value);
    }
  }
  return [];
}, "readIndexListValues");
var indexListHostProps = {
  style: {
    display: "contents"
  },
  "data-lumina-index-list": "true"
};
var forListHostProps = {
  style: {
    display: "contents"
  },
  "data-lumina-for-list": "true"
};
var coerceListKey = /* @__PURE__ */ __name((value, index) => {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new Error(`List key at index ${index} must be a string or number`);
}, "coerceListKey");
var vnodeIndexList = /* @__PURE__ */ __name((itemsSignal, renderItem) => ({
  kind: "index_list",
  itemsSignal,
  listRender: renderItem
}), "vnodeIndexList");
var vnodeForList = /* @__PURE__ */ __name((itemsSignal, keyOf, renderItem) => ({
  kind: "for_list",
  itemsSignal,
  listKey: keyOf,
  listIndexedRender: renderItem
}), "vnodeForList");
var vnodeElement = /* @__PURE__ */ __name((tag, props, children2 = []) => ({
  kind: "element",
  tag,
  key: typeof props?.key === "string" || typeof props?.key === "number" ? props.key : void 0,
  props: sanitizeProps(props),
  children: normalizeVNodeChildren(children2)
}), "vnodeElement");
var vnodeFragment = /* @__PURE__ */ __name((children2 = []) => ({
  kind: "fragment",
  children: normalizeVNodeChildren(children2)
}), "vnodeFragment");
var vnodePortal = /* @__PURE__ */ __name((target, children2 = []) => ({
  kind: "portal",
  target: target == null ? null : String(target),
  children: normalizeVNodeChildren(children2)
}), "vnodePortal");
var asVNodeChildren = /* @__PURE__ */ __name((node) => node.children ?? [], "asVNodeChildren");
var coerceRenderableToVNode = /* @__PURE__ */ __name((input) => {
  const children2 = normalizeVNodeChildren(input);
  if (children2.length === 1) {
    return children2[0];
  }
  return vnodeFragment(children2);
}, "coerceRenderableToVNode");
var applyVNodeKey = /* @__PURE__ */ __name((node, key) => {
  if (typeof key !== "string" && typeof key !== "number" || node.key !== void 0) {
    return node;
  }
  return {
    ...node,
    key
  };
}, "applyVNodeKey");
var materializeIndexListChildren = /* @__PURE__ */ __name((node, tracked) => {
  const source = node.itemsSignal;
  const renderItem = node.listRender;
  if (!source || typeof renderItem !== "function") {
    return [];
  }
  return readIndexListValues(source, tracked).map((value, index) => coerceRenderableToVNode(renderItem(createStaticSignal(value), index)));
}, "materializeIndexListChildren");
var materializeForListChildren = /* @__PURE__ */ __name((node, tracked) => {
  const source = node.itemsSignal;
  const keyOf = node.listKey;
  const renderItem = node.listIndexedRender;
  if (!source || typeof keyOf !== "function" || typeof renderItem !== "function") {
    return [];
  }
  const seenKeys = /* @__PURE__ */ new Set();
  return readIndexListValues(source, tracked).map((value, index) => {
    const key = coerceListKey(keyOf(value, index), index);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`);
    }
    seenKeys.add(key);
    const vnode2 = coerceRenderableToVNode(renderItem(createStaticSignal(value), createStaticSignal(index)));
    return applyVNodeKey(vnode2, key);
  });
}, "materializeForListChildren");
var snapshotVNode = /* @__PURE__ */ __name((node) => {
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
}, "snapshotVNode");
var resolveChildrenInput = /* @__PURE__ */ __name((input) => typeof input === "function" ? input() : input, "resolveChildrenInput");
var serializeVNode = /* @__PURE__ */ __name((node) => JSON.stringify(snapshotVNode(node)), "serializeVNode");
var parseVNode = /* @__PURE__ */ __name((json2) => {
  const parsed = JSON.parse(json2);
  if (!isVNode(parsed)) throw new Error("Invalid VNode payload");
  return parsed;
}, "parseVNode");

// src/runtime/dom-renderer.ts
var domTemplateCache = /* @__PURE__ */ new WeakMap();
var dialogModalInertTargets = /* @__PURE__ */ new WeakMap();
var inertCounts = /* @__PURE__ */ new WeakMap();
var inertStates = /* @__PURE__ */ new WeakMap();
var getDomDocument = /* @__PURE__ */ __name((options) => {
  if (options?.document) return options.document;
  const doc = globalThis.document;
  if (!doc) {
    throw new Error("DOM renderer requires a document-like object");
  }
  return doc;
}, "getDomDocument");
var asDomChildren = /* @__PURE__ */ __name((node) => node.children ?? [], "asDomChildren");
var serializeFingerprintProps = /* @__PURE__ */ __name((props) => {
  if (!props) {
    return "";
  }
  let out = "";
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key) || key === "key") {
      continue;
    }
    const value = props[key];
    if (value !== null && value !== void 0 && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return null;
    }
    out += `|${key}:${String(value ?? "")}`;
  }
  return out;
}, "serializeFingerprintProps");
var getStablePatchFingerprint = /* @__PURE__ */ __name((node) => {
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
}, "getStablePatchFingerprint");
var isEventProp = /* @__PURE__ */ __name((name) => /^on[A-Z]/.test(name), "isEventProp");
var isForcedAttributeProp = /* @__PURE__ */ __name((name) => name === "role" || name.startsWith("aria-") || name.startsWith("data-"), "isForcedAttributeProp");
var isHiddenPropValue = /* @__PURE__ */ __name((value) => value === true || value === "true", "isHiddenPropValue");
var isPortalHostElement = /* @__PURE__ */ __name((node) => node != null && String(node.tagName ?? "").toLowerCase() === "lumina-portal-host", "isPortalHostElement");
var isDialogOverlayElement = /* @__PURE__ */ __name((node) => node != null && getDomAttribute(node, "data-lumina-dialog-overlay") === "true", "isDialogOverlayElement");
var isModalDialogElement = /* @__PURE__ */ __name((element) => getDomAttribute(element, "role") === "dialog" && getDomAttribute(element, "aria-modal") === "true", "isModalDialogElement");
var containsDomNode = /* @__PURE__ */ __name((root, target) => {
  if (!target) return false;
  if (root === target) return true;
  for (const child of readChildNodes(root)) {
    if (containsDomNode(child, target)) {
      return true;
    }
  }
  return false;
}, "containsDomNode");
var findMarkedDialogInitialFocus = /* @__PURE__ */ __name((root) => {
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
}, "findMarkedDialogInitialFocus");
var focusInitialDialogTarget = /* @__PURE__ */ __name((element) => {
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
}, "focusInitialDialogTarget");
var setElementInert = /* @__PURE__ */ __name((element, active) => {
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
}, "setElementInert");
var collectModalInertTargets = /* @__PURE__ */ __name((dialog) => {
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
}, "collectModalInertTargets");
var syncModalDialogInertState = /* @__PURE__ */ __name((dialog, active) => {
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
}, "syncModalDialogInertState");
var cloneStaticTemplateElement = /* @__PURE__ */ __name((documentLike, html) => {
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
}, "cloneStaticTemplateElement");
var normalizeEventName = /* @__PURE__ */ __name((name) => name.slice(2).toLowerCase(), "normalizeEventName");
var setDomStyle = /* @__PURE__ */ __name((element, previous, next) => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  const style = element.style;
  if (!style) return;
  for (const [key, value] of Object.entries(nxt)) {
    if (prev[key] === value) continue;
    if (style.setProperty) {
      style.setProperty(key, value == null ? "" : String(value));
    } else {
      style[key] = value;
    }
  }
  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (style.setProperty) {
      style.setProperty(key, "");
    } else {
      delete style[key];
    }
  }
}, "setDomStyle");
var setDomProperty = /* @__PURE__ */ __name((element, name, value, eventStore) => {
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
  if (name === "style" && typeof value === "object" && value !== null) {
    setDomStyle(element, void 0, value);
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
}, "setDomProperty");
var updateDomProperties = /* @__PURE__ */ __name((element, previous, next, eventStore) => {
  const prev = previous ?? {};
  const nxt = next ?? {};
  for (const key of Object.keys(prev)) {
    if (Object.prototype.hasOwnProperty.call(nxt, key)) continue;
    if (key === "style") {
      setDomStyle(element, prev.style, void 0);
      continue;
    }
    setDomProperty(element, key, void 0, eventStore);
  }
  for (const [key, value] of Object.entries(nxt)) {
    if (key === "style") {
      setDomStyle(element, prev.style, value);
      continue;
    }
    if (prev[key] === value) continue;
    setDomProperty(element, key, value, eventStore);
  }
  if (isModalDialogElement(element)) {
    syncModalDialogInertState(element, !isElementHidden(element));
  }
  if (nxt.autoFocus && (prev.autoFocus !== nxt.autoFocus || isModalDialogElement(element) && isHiddenPropValue(prev.hidden) && !isElementHidden(element))) {
    if (!isModalDialogElement(element)) {
      element.focus?.();
    }
  }
}, "updateDomProperties");
var setChildren2 = /* @__PURE__ */ __name((container, children2) => {
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
}, "setChildren");
var resolvePortalTarget = /* @__PURE__ */ __name((node, documentLike) => {
  const target = node.target;
  if (target == null || target === "" || target === "body") {
    return documentLike.body ?? null;
  }
  if (typeof documentLike.querySelector === "function") {
    return documentLike.querySelector(String(target));
  }
  return null;
}, "resolvePortalTarget");
var disposeDomNode = /* @__PURE__ */ __name((node, eventStore, portalStore, liveTextStore) => {
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
}, "disposeDomNode");
var replaceChildren = /* @__PURE__ */ __name((container, children2, eventStore, portalStore, liveTextStore) => {
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
}, "replaceChildren");
var vnodeKindTag = /* @__PURE__ */ __name((node) => `${node.kind}:${node.tag ?? ""}`, "vnodeKindTag");
var hasVNodeKey = /* @__PURE__ */ __name((node) => typeof node.key === "string" || typeof node.key === "number", "hasVNodeKey");
var hasKeyedChildren = /* @__PURE__ */ __name((children2) => children2.some((child) => hasVNodeKey(child)), "hasKeyedChildren");
var duplicateKeyError = /* @__PURE__ */ __name((key) => new Error(`Duplicate keyed child '${String(key)}' in the same parent is not supported`), "duplicateKeyError");
var areAllChildrenKeyed = /* @__PURE__ */ __name((children2) => children2.every((child) => hasVNodeKey(child)), "areAllChildrenKeyed");
var tryReadTextLeaf = /* @__PURE__ */ __name((node) => {
  if (node.kind === "text") {
    return {
      kind: "text",
      text: node.text ?? ""
    };
  }
  if (node.kind === "live_text") {
    return {
      kind: "live_text",
      signal: node.signal
    };
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
    return {
      kind: "text",
      text: child.text ?? ""
    };
  }
  if (child.kind === "live_text") {
    return {
      kind: "live_text",
      signal: child.signal
    };
  }
  return null;
}, "tryReadTextLeaf");
var trySkipStableKeyedChildFast = /* @__PURE__ */ __name((prevNode, nextNode) => {
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
}, "trySkipStableKeyedChildFast");
var analyzeKeyedChildTransition = /* @__PURE__ */ __name((prevChildren, nextChildren) => {
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
    return {
      kind: "same_order"
    };
  }
  return analyzeSequenceTransition(prevChildren, nextChildren, (left, right) => left.key === right.key);
}, "analyzeKeyedChildTransition");
var createForListState = /* @__PURE__ */ __name((entries) => ({
  entries,
  entriesByKey: new Map(entries.map((entry) => [
    entry.key,
    entry
  ])),
  order: entries.map((entry) => entry.key)
}), "createForListState");
var genericKeyedStates = /* @__PURE__ */ new WeakMap();
var createGenericKeyedState = /* @__PURE__ */ __name((entries) => ({
  entries
}), "createGenericKeyedState");
var buildKeyedOrder = /* @__PURE__ */ __name((items, keyOf) => {
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = 0; index < items.length; index += 1) {
    const key = coerceListKey(keyOf(items[index], index), index);
    if (seen.has(key)) {
      throw duplicateKeyError(key);
    }
    seen.add(key);
    order.push(key);
  }
  return order;
}, "buildKeyedOrder");
var buildGenericKeyedState = /* @__PURE__ */ __name((children2, domChildren) => createGenericKeyedState(children2.map((child, index) => ({
  key: child.key,
  vnode: child,
  domNode: domChildren[index]
})).filter((entry) => Boolean(entry.domNode))), "buildGenericKeyedState");
var isGenericKeyedStateValid = /* @__PURE__ */ __name((host, state2, children2) => {
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
}, "isGenericKeyedStateValid");
var ensureGenericKeyedState = /* @__PURE__ */ __name((host, children2) => {
  const existing = genericKeyedStates.get(host);
  if (isGenericKeyedStateValid(host, existing, children2)) {
    return existing;
  }
  const rebuilt = buildGenericKeyedState(children2, readChildNodes(host));
  genericKeyedStates.set(host, rebuilt);
  return rebuilt;
}, "ensureGenericKeyedState");
var syncGenericKeyedStateForTransition = /* @__PURE__ */ __name((state2, nextChildren, transition) => {
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
}, "syncGenericKeyedStateForTransition");
var replaceGenericKeyedState = /* @__PURE__ */ __name((host, nextEntries, existingState) => {
  if (existingState) {
    existingState.entries = nextEntries;
    genericKeyedStates.set(host, existingState);
    return;
  }
  genericKeyedStates.set(host, createGenericKeyedState(nextEntries));
}, "replaceGenericKeyedState");
var analyzeKeyedOrderTransition = /* @__PURE__ */ __name((items, previousOrder, keyOf) => {
  if (items.length !== previousOrder.length) {
    return {
      transition: {
        kind: "complex_reorder"
      },
      nextOrder: null
    };
  }
  let firstMismatch = -1;
  let firstMismatchKey = null;
  for (let index = 0; index < items.length; index += 1) {
    const key = coerceListKey(keyOf(items[index], index), index);
    if (previousOrder[index] !== key) {
      firstMismatch = index;
      firstMismatchKey = key;
      break;
    }
  }
  if (firstMismatch < 0) {
    return {
      transition: {
        kind: "same_order"
      },
      nextOrder: null
    };
  }
  const swapRight = firstMismatch + 1;
  if (swapRight < items.length) {
    const rightKey = coerceListKey(keyOf(items[swapRight], swapRight), swapRight);
    if (previousOrder[firstMismatch] === rightKey && previousOrder[swapRight] === firstMismatchKey) {
      let restMatches = true;
      for (let index = swapRight + 1; index < items.length; index += 1) {
        const key = coerceListKey(keyOf(items[index], index), index);
        if (previousOrder[index] !== key) {
          restMatches = false;
          break;
        }
      }
      if (restMatches) {
        return {
          transition: {
            kind: "adjacent_swap",
            left: firstMismatch,
            right: swapRight
          },
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
    transition: analyzeSequenceTransition(previousOrder, nextOrder, (left, right) => left === right),
    nextOrder
  };
}, "analyzeKeyedOrderTransition");
var hasShallowEqualProps = /* @__PURE__ */ __name((left, right) => {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  let leftCount = 0;
  for (const key in left) {
    if (!Object.prototype.hasOwnProperty.call(left, key)) continue;
    leftCount += 1;
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (left[key] !== right[key]) return false;
  }
  let rightCount = 0;
  for (const key in right) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) continue;
    rightCount += 1;
  }
  return leftCount === rightCount;
}, "hasShallowEqualProps");
var canSkipChildListPatch = /* @__PURE__ */ __name((length, compareChild) => {
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
}, "canSkipChildListPatch");
var canSkipStructuredSmallSubtree = /* @__PURE__ */ __name((prevNode, nextNode, equalsValue) => {
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
    const childResult = canSkipStructuredSmallSubtree(prevChildren[index], nextChildren[index], equalsValue);
    if (childResult === null) {
      return null;
    }
    if (!childResult) {
      return false;
    }
  }
  return true;
}, "canSkipStructuredSmallSubtree");
var remapMovedIndex = /* @__PURE__ */ __name((index, from, to) => {
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
}, "remapMovedIndex");
var getComplexOrderAffectedRange = /* @__PURE__ */ __name((previousOrder, nextOrder) => {
  const window2 = findStableSequenceWindow(previousOrder, nextOrder);
  if (!window2) {
    return null;
  }
  return {
    start: window2.nextStart,
    end: window2.nextEnd
  };
}, "getComplexOrderAffectedRange");
var canSkipDomPatch = /* @__PURE__ */ __name((prevNode, nextNode, equalsValue) => {
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
  return canSkipChildListPatch(prevChildren.length, (index) => canSkipDomPatch(prevChildren[index], nextChildren[index], equalsValue));
}, "canSkipDomPatch");
var patchPortalMount = /* @__PURE__ */ __name((anchor, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const previous = portalStore.get(anchor) ?? {
    target: null,
    host: null
  };
  const nextTarget = resolvePortalTarget(nextNode, documentLike);
  const prevChildren = prevNode?.kind === "portal" ? prevNode.children ?? [] : [];
  const nextChildren = nextNode.children ?? [];
  if (!nextTarget) {
    if (previous.host) {
      replaceChildren(previous.host, [], eventStore, portalStore, liveTextStore);
      const parent = previous.host.parentNode;
      if (parent) parent.removeChild(previous.host);
    }
    portalStore.set(anchor, {
      target: null,
      host: null
    });
    return;
  }
  let host = previous.host;
  const targetChanged = previous.target !== nextTarget || !host || host.parentNode !== nextTarget;
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
    const mountedChildren = nextChildren.map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
    replaceChildren(host, mountedChildren, eventStore, portalStore, liveTextStore);
  } else if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(host, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  } else {
    patchDomChildrenPositionally(host, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }
  portalStore.set(anchor, {
    target: nextTarget,
    host
  });
}, "patchPortalMount");
var bindIndexListHost = /* @__PURE__ */ __name((host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
  const renderChildren = /* @__PURE__ */ __name(() => itemSignals.map((itemSignal, index) => createDomNode(coerceRenderableToVNode(renderItem(itemSignal, index)), documentLike, eventStore, portalStore, liveTextStore, equalsValue)), "renderChildren");
  replaceChildren(host, renderChildren(), eventStore, portalStore, liveTextStore);
  const runBatched = /* @__PURE__ */ __name((fn) => {
    batch(fn);
  }, "runBatched");
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
}, "bindIndexListHost");
var bindForListHost = /* @__PURE__ */ __name((host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
  const runBatched = /* @__PURE__ */ __name((fn) => {
    batch(fn);
  }, "runBatched");
  const createEntry = /* @__PURE__ */ __name((value, index) => {
    const key = coerceListKey(keyOf(value, index), index);
    const itemSignal = new Signal(value);
    const indexSignal = new Signal(index);
    const domNode = createDomNode(applyVNodeKey(coerceRenderableToVNode(renderItem(itemSignal, indexSignal)), key), documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return {
      key,
      currentValue: value,
      currentIndex: index,
      itemSignal,
      indexSignal,
      domNode
    };
  }, "createEntry");
  const initialEntries = readIndexListValues(source, false).map((value, index) => createEntry(value, index));
  let state2 = createForListState(initialEntries);
  replaceChildren(host, state2.entries.map((entry) => entry.domNode), eventStore, portalStore, liveTextStore);
  const syncEntryValue = /* @__PURE__ */ __name((entry, value) => {
    if (entry.currentValue !== value && !equalsValue(entry.currentValue, value)) {
      entry.itemSignal.set(value);
      entry.currentValue = value;
    }
  }, "syncEntryValue");
  const syncEntryIndex = /* @__PURE__ */ __name((entry, index) => {
    if (entry.currentIndex !== index) {
      entry.indexSignal.set(index);
      entry.currentIndex = index;
    }
  }, "syncEntryIndex");
  const syncValuesForOrder = /* @__PURE__ */ __name((items, order) => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = state2.entriesByKey.get(order[index]);
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  }, "syncValuesForOrder");
  const syncValuesForEntries = /* @__PURE__ */ __name((items, nextEntries) => {
    for (let index = 0; index < items.length; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryValue(entry, items[index]);
    }
  }, "syncValuesForEntries");
  const hasPureEntryValueReuse = /* @__PURE__ */ __name((items, nextEntries) => {
    if (items.length !== nextEntries.length) {
      return false;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (nextEntries[index]?.currentValue !== items[index]) {
        return false;
      }
    }
    return true;
  }, "hasPureEntryValueReuse");
  const swapItems = /* @__PURE__ */ __name((entries, left, right) => {
    const nextEntries = entries.slice();
    const previousLeft = nextEntries[left];
    nextEntries[left] = nextEntries[right];
    nextEntries[right] = previousLeft;
    return nextEntries;
  }, "swapItems");
  const moveItems = /* @__PURE__ */ __name((entries, from, to) => {
    const nextEntries = entries.slice();
    const moving = nextEntries.splice(from, 1)[0];
    if (!moving) {
      return nextEntries;
    }
    nextEntries.splice(to, 0, moving);
    return nextEntries;
  }, "moveItems");
  const applyDirectEntryReorder = /* @__PURE__ */ __name((currentEntries, nextEntries, transition) => {
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
  }, "applyDirectEntryReorder");
  const syncIndicesForRange = /* @__PURE__ */ __name((nextEntries, transition, previousOrder, nextOrder) => {
    const range = transition.kind === "complex_reorder" && previousOrder && nextOrder ? getComplexOrderAffectedRange(previousOrder, nextOrder) : getTransitionAffectedRange(transition, nextEntries.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      const entry = nextEntries[index];
      if (!entry) continue;
      syncEntryIndex(entry, index);
    }
  }, "syncIndicesForRange");
  const reorderEntriesForComplexWindow = /* @__PURE__ */ __name((currentEntries, previousOrder, nextOrder) => {
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
      const key = previousOrder[index];
      if (!entry || key == null) {
        return null;
      }
      windowEntries.set(key, entry);
    }
    for (let index = window2.nextStart; index <= window2.nextEnd; index += 1) {
      const entry = windowEntries.get(nextOrder[index]);
      if (!entry) {
        return null;
      }
      nextEntries[index] = entry;
    }
    return nextEntries;
  }, "reorderEntriesForComplexWindow");
  const buildNextEntries = /* @__PURE__ */ __name((items, order) => {
    const retained = /* @__PURE__ */ new Set();
    const nextEntries = [];
    let structureChanged = items.length !== state2.entries.length;
    for (let index = 0; index < items.length; index += 1) {
      const key = order[index];
      const value = items[index];
      let entry = state2.entriesByKey.get(key);
      if (!entry) {
        entry = createEntry(value, index);
        state2.entriesByKey.set(key, entry);
        structureChanged = true;
      } else {
        syncEntryValue(entry, value);
      }
      retained.add(key);
      nextEntries.push(entry);
    }
    for (const key of Array.from(state2.entriesByKey.keys())) {
      if (retained.has(key)) continue;
      state2.entriesByKey.delete(key);
      structureChanged = true;
    }
    return {
      nextEntries,
      structureChanged
    };
  }, "buildNextEntries");
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
      });
      return;
    }
    if (transition.kind === "adjacent_swap" || transition.kind === "single_move") {
      const previousEntries2 = state2.entries;
      const nextEntries2 = transition.kind === "adjacent_swap" ? swapItems(state2.entries, transition.left, transition.right) : moveItems(state2.entries, transition.from, transition.to);
      for (let index = 0; index < nextEntries2.length; index += 1) {
        if (!nextEntries2[index]) {
          throw new Error(`Missing keyed list entry '${String(nextOrder?.[index] ?? index)}' during transition`);
        }
      }
      runBatched(() => {
        if (nextOrder && !hasPureEntryValueReuse(nextItems, nextEntries2)) {
          syncValuesForOrder(nextItems, nextOrder);
        }
        syncIndicesForRange(nextEntries2, transition, state2.order, nextOrder ?? state2.order);
      });
      state2.entries = nextEntries2;
      state2.order = nextOrder ?? (transition.kind === "adjacent_swap" ? swapItems(state2.order, transition.left, transition.right) : moveItems(state2.order, transition.from, transition.to));
      if (!applyDirectEntryReorder(previousEntries2, nextEntries2, transition)) {
        reorderChildren(host, nextEntries2.map((entry) => entry.domNode), (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
          currentChildren: previousEntries2.map((entry) => entry.domNode),
          transition,
          structureChanged: false
        });
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
      });
      state2.entries = reorderedEntries;
      state2.order = resolvedNextOrder;
      if (!applyDirectEntryReorder(previousEntries2, reorderedEntries, transition)) {
        reorderChildren(host, reorderedEntries.map((entry) => entry.domNode), (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
          currentChildren: previousEntries2.map((entry) => entry.domNode),
          transition,
          structureChanged: false
        });
      }
      return;
    }
    const previousEntries = state2.entries;
    runBatched(() => {
      const built = buildNextEntries(nextItems, resolvedNextOrder);
      nextEntries = built.nextEntries;
      structureChanged = built.structureChanged;
      syncIndicesForRange(nextEntries, transition, state2.order, resolvedNextOrder);
    });
    state2.entries = nextEntries;
    state2.order = resolvedNextOrder;
    reorderChildren(host, nextEntries.map((entry) => entry.domNode), (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
      currentChildren: previousEntries.map((entry) => entry.domNode),
      transition,
      structureChanged
    });
  });
  host.__luminaForListSource = source;
  host.__luminaForListKey = keyOf;
  host.__luminaForListRender = renderItem;
}, "bindForListHost");
var createDomNode = /* @__PURE__ */ __name((node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
    bindIndexListHost(host, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
    const children3 = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
    setChildren2(wrapper, children3);
    return wrapper;
  }
  if (node.kind === "portal") {
    const anchor = documentLike.createElement("lumina-portal-anchor");
    updateDomProperties(anchor, {}, {
      hidden: true,
      "data-lumina-portal-anchor": "true"
    }, eventStore);
    patchPortalMount(anchor, null, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
  const children2 = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
  setChildren2(element, children2);
  if (node.props?.autoFocus && isModalDialogElement(element) && !isElementHidden(element)) {
    focusInitialDialogTarget(element);
  }
  return element;
}, "createDomNode");
var patchDomChildrenPositionally = /* @__PURE__ */ __name((element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const shared = Math.min(prevChildren.length, nextChildren.length);
  for (let i = 0; i < shared; i += 1) {
    const currentChild = element.childNodes[i];
    if (!currentChild) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue));
      continue;
    }
    if (canSkipDomPatch(prevChildren[i], nextChildren[i], equalsValue)) {
      continue;
    }
    patchDomNode(currentChild, prevChildren[i], nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }
  if (nextChildren.length > prevChildren.length) {
    for (let i = prevChildren.length; i < nextChildren.length; i += 1) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore, portalStore, liveTextStore, equalsValue));
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
}, "patchDomChildrenPositionally");
var patchStableKeyedChildAt = /* @__PURE__ */ __name((currentDomChildren, prevChildren, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const domChild = currentDomChildren[index];
  const prevChild = prevChildren[index];
  const nextChild = nextChildren[index];
  if (!domChild || !prevChild || !nextChild || canSkipDomPatch(prevChild, nextChild, equalsValue)) {
    return;
  }
  patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
}, "patchStableKeyedChildAt");
var patchTransitionAffectedRange = /* @__PURE__ */ __name((currentDomChildren, prevChildren, nextChildren, transition, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
    patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }
}, "patchTransitionAffectedRange");
var patchStableGenericKeyedEntryAt = /* @__PURE__ */ __name((entries, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  const entry = entries[index];
  const nextChild = nextChildren[index];
  if (!entry || !nextChild) {
    return;
  }
  const fastSkip = trySkipStableKeyedChildFast(entry.vnode, nextChild);
  if (fastSkip === true || fastSkip !== false && canSkipDomPatch(entry.vnode, nextChild, equalsValue)) {
    return;
  }
  entry.domNode = patchDomNode(entry.domNode, entry.vnode, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
}, "patchStableGenericKeyedEntryAt");
var patchTransitionAffectedGenericKeyedEntries = /* @__PURE__ */ __name((entries, nextChildren, transition, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
    entry.domNode = patchDomNode(entry.domNode, entry.vnode, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }
}, "patchTransitionAffectedGenericKeyedEntries");
var patchDomChildrenWithKeys = /* @__PURE__ */ __name((element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
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
        element.appendChild(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
        continue;
      }
      const fastSkip = trySkipStableKeyedChildFast(prevChild, nextChild);
      if (fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue)) {
        if (entry) {
          entry.vnode = nextChild;
        }
        continue;
      }
      const nextDomNode = patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
        patchTransitionAffectedGenericKeyedEntries(currentEntries, nextChildren, keyedTransition, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      } else {
        patchTransitionAffectedRange(currentDomChildren2, prevChildren, nextChildren, keyedTransition, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      }
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (index === keyedTransition.left || index === keyedTransition.right) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(currentEntries, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        } else {
          patchStableKeyedChildAt(currentDomChildren2, prevChildren, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
        patchTransitionAffectedGenericKeyedEntries(currentEntries, nextChildren, keyedTransition, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      } else {
        patchTransitionAffectedRange(currentDomChildren2, prevChildren, nextChildren, keyedTransition, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      }
      const affectedRange = getTransitionAffectedRange(keyedTransition, nextChildren.length);
      for (let index = 0; index < nextChildren.length; index += 1) {
        if (affectedRange && index >= affectedRange.start && index <= affectedRange.end) {
          continue;
        }
        if (currentEntries && allNextChildrenKeyed) {
          patchStableGenericKeyedEntryAt(currentEntries, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        } else {
          patchStableKeyedChildAt(currentDomChildren2, prevChildren, nextChildren, index, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
    } : findStableSequenceWindow(prevChildren, nextChildren, (left, right) => left.key === right.key);
    if (window2) {
      const nextDomChildren2 = new Array(nextChildren.length);
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
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue) ? domChild : patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        nextDomChildren2[index] = nextDomNode;
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[index] = entry;
          continue;
        }
        nextEntries[index] = {
          key: nextChild.key,
          vnode: nextChild,
          domNode: nextDomNode
        };
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
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevChild, nextChild, equalsValue) ? domChild : patchDomNode(domChild, prevChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        nextDomChildren2[nextIndex] = nextDomNode;
        if (entry) {
          entry.vnode = nextChild;
          entry.domNode = nextDomNode;
          nextEntries[nextIndex] = entry;
          continue;
        }
        nextEntries[nextIndex] = {
          key: nextChild.key,
          vnode: nextChild,
          domNode: nextDomNode
        };
      }
      const prevKeyedWindow = /* @__PURE__ */ new Map();
      for (let index = window2.currentStart; index <= window2.currentEnd; index += 1) {
        const entry = currentEntries?.[index];
        const prevChild = entry?.vnode ?? prevChildren[index];
        const domChild = entry?.domNode ?? currentDomChildren2?.[index];
        if (!domChild || !prevChild || prevChild.key == null) continue;
        prevKeyedWindow.set(prevChild.key, entry ?? {
          key: prevChild.key,
          vnode: prevChild,
          domNode: domChild
        });
      }
      let structureChanged2 = prevChildren.length !== nextChildren.length;
      const alreadyDisposedStaleNodes2 = /* @__PURE__ */ new WeakSet();
      for (let nextIndex = window2.nextStart; nextIndex <= window2.nextEnd; nextIndex += 1) {
        const nextChild = nextChildren[nextIndex];
        const prevEntry = prevKeyedWindow.get(nextChild.key);
        if (!prevEntry) {
          structureChanged2 = true;
          const createdDomNode = createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
          nextDomChildren2[nextIndex] = createdDomNode;
          nextEntries[nextIndex] = {
            key: nextChild.key,
            vnode: nextChild,
            domNode: createdDomNode
          };
          continue;
        }
        prevKeyedWindow.delete(nextChild.key);
        const fastSkip = trySkipStableKeyedChildFast(prevEntry.vnode, nextChild);
        const nextDomNode = fastSkip === true || fastSkip !== false && canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue) ? prevEntry.domNode : patchDomNode(prevEntry.domNode, prevEntry.vnode, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        prevEntry.vnode = nextChild;
        prevEntry.domNode = nextDomNode;
        nextDomChildren2[nextIndex] = nextDomNode;
        nextEntries[nextIndex] = prevEntry;
      }
      for (const stale of prevKeyedWindow.values()) {
        structureChanged2 = true;
        disposeDomNode(stale.domNode, eventStore, portalStore, liveTextStore);
        alreadyDisposedStaleNodes2.add(stale.domNode);
        if (stale.domNode.parentNode === element) {
          element.removeChild(stale.domNode);
        }
      }
      const reconcilerCurrentChildren = structureChanged2 ? currentEntries ? currentEntries.map((entry) => entry.domNode).filter((child) => child.parentNode === element) : currentDomChildren2.filter((child) => child.parentNode === element) : currentEntries ? currentEntries.map((entry) => entry.domNode) : currentDomChildren2;
      reorderChildren(element, nextDomChildren2, (child) => {
        const domChild = child;
        if (alreadyDisposedStaleNodes2.has(domChild)) {
          return;
        }
        disposeDomNode(domChild, eventStore, portalStore, liveTextStore);
      }, structureChanged2 ? {
        currentChildren: reconcilerCurrentChildren,
        structureChanged: false
      } : {
        currentChildren: reconcilerCurrentChildren,
        transition: keyedTransition?.kind === "complex_reorder" ? keyedTransition : null,
        structureChanged: false
      });
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
      prevKeyed.set(prevChild.key, {
        vnode: prevChild,
        domNode: domChild
      });
      continue;
    }
    prevUnkeyed.push({
      vnode: prevChild,
      domNode: domChild
    });
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
        nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
        continue;
      }
      prevKeyed.delete(nextChild.key);
      nextDomChildren.push(canSkipDomPatch(prevEntry2.vnode, nextChild, equalsValue) ? prevEntry2.domNode : patchDomNode(prevEntry2.domNode, prevEntry2.vnode, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
      continue;
    }
    const prevEntry = prevUnkeyed[unkeyedIndex];
    unkeyedIndex += 1;
    if (!prevEntry) {
      nextDomChildren.push(createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
      continue;
    }
    nextDomChildren.push(canSkipDomPatch(prevEntry.vnode, nextChild, equalsValue) ? prevEntry.domNode : patchDomNode(prevEntry.domNode, prevEntry.vnode, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
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
  reorderChildren(element, nextDomChildren, (child) => {
    const domChild = child;
    if (alreadyDisposedStaleNodes.has(domChild)) {
      return;
    }
    disposeDomNode(domChild, eventStore, portalStore, liveTextStore);
  }, {
    currentChildren: currentDomChildren,
    transition: keyedTransition,
    structureChanged
  });
}, "patchDomChildrenWithKeys");
var patchDomNode = /* @__PURE__ */ __name((domNode, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  if (vnodeKindTag(prevNode) !== vnodeKindTag(nextNode)) {
    const replacement = createDomNode(nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
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
    bindIndexListHost(domNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  if (nextNode.kind === "for_list") {
    updateDomProperties(domNode, prevNode.props, forListHostProps, eventStore);
    bindForListHost(domNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  if (nextNode.kind === "portal") {
    patchPortalMount(domNode, prevNode, nextNode, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  const element = domNode;
  if (nextNode.kind === "element") {
    updateDomProperties(element, prevNode.props, nextNode.props, eventStore);
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  if (hasKeyedChildren(prevChildren) || hasKeyedChildren(nextChildren)) {
    patchDomChildrenWithKeys(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  } else {
    patchDomChildrenPositionally(element, prevChildren, nextChildren, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
  }
  if (nextNode.kind === "element" && nextNode.props?.autoFocus && isModalDialogElement(element) && isHiddenPropValue(prevNode.props?.hidden) && !isElementHidden(element)) {
    focusInitialDialogTarget(element);
  }
  return element;
}, "patchDomNode");
var hydrateDomNode = /* @__PURE__ */ __name((domNode, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue) => {
  if (node.kind === "text") {
    const nextText = node.text ?? "";
    if (domNode.textContent !== nextText) {
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
    bindIndexListHost(domNode, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  if (node.kind === "for_list") {
    updateDomProperties(domNode, void 0, forListHostProps, eventStore);
    bindForListHost(domNode, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  if (node.kind === "portal") {
    patchPortalMount(domNode, vnodePortal(node.target, []), node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
    return domNode;
  }
  const element = domNode;
  if (node.kind === "element") {
    updateDomProperties(element, void 0, node.props, eventStore);
  }
  const existingChildren = readChildNodes(element);
  const nextChildren = asDomChildren(node);
  const nextDomChildren = [];
  for (let index = 0; index < nextChildren.length; index += 1) {
    const nextChild = nextChildren[index];
    const currentChild = existingChildren[index];
    nextDomChildren.push(currentChild ? hydrateDomNode(currentChild, nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue) : createDomNode(nextChild, documentLike, eventStore, portalStore, liveTextStore, equalsValue));
  }
  for (let index = nextChildren.length; index < existingChildren.length; index += 1) {
    disposeDomNode(existingChildren[index], eventStore, portalStore, liveTextStore);
  }
  reorderChildren(element, nextDomChildren, (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
    currentChildren: existingChildren
  });
  return element;
}, "hydrateDomNode");
var createDomRenderer = /* @__PURE__ */ __name((options, equalsValue) => {
  const documentLike = getDomDocument(options);
  const eventStore = /* @__PURE__ */ new Map();
  const portalStore = /* @__PURE__ */ new WeakMap();
  const liveTextStore = /* @__PURE__ */ new WeakMap();
  let currentDom = null;
  let currentVNode = null;
  return {
    mount(node, container) {
      const domContainer = container;
      const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      replaceChildren(domContainer, [
        domNode
      ], eventStore, portalStore, liveTextStore);
      currentDom = domNode;
      currentVNode = node;
    },
    patch(prev, next, container) {
      const domContainer = container;
      if (!currentDom || !currentVNode || !prev) {
        const domNode = createDomNode(next, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        replaceChildren(domContainer, [
          domNode
        ], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = next;
        return;
      }
      const nextDom = patchDomNode(currentDom, prev, next, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      if (nextDom !== currentDom) {
        reorderChildren(domContainer, [
          nextDom
        ], (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
          currentChildren: [
            currentDom
          ]
        });
      }
      currentDom = nextDom;
      currentVNode = next;
    },
    hydrate(node, container) {
      const domContainer = container;
      const existing = readChildNodes(domContainer)[0] ?? null;
      if (!existing) {
        const domNode = createDomNode(node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
        replaceChildren(domContainer, [
          domNode
        ], eventStore, portalStore, liveTextStore);
        currentDom = domNode;
        currentVNode = node;
        return;
      }
      const hydratedDom = hydrateDomNode(existing, node, documentLike, eventStore, portalStore, liveTextStore, equalsValue);
      if (hydratedDom !== existing) {
        reorderChildren(domContainer, [
          hydratedDom
        ], (child) => disposeDomNode(child, eventStore, portalStore, liveTextStore), {
          currentChildren: [
            existing
          ]
        });
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
}, "createDomRenderer");

// src/runtime/render-core.ts
var _RenderRoot = class _RenderRoot {
  constructor(renderer, container) {
    __publicField(this, "renderer");
    __publicField(this, "container");
    __publicField(this, "current", null);
    this.renderer = renderer;
    this.container = container;
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
__name(_RenderRoot, "RenderRoot");
var RenderRoot = _RenderRoot;
var _ReactiveRenderRoot = class _ReactiveRenderRoot {
  constructor(root, effect, frameManager, hooks) {
    __publicField(this, "root");
    __publicField(this, "effect");
    __publicField(this, "frameManager");
    __publicField(this, "hooks");
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
__name(_ReactiveRenderRoot, "ReactiveRenderRoot");
var ReactiveRenderRoot = _ReactiveRenderRoot;
var isDisposableLike = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && typeof value.dispose === "function", "isDisposableLike");
var isUnmountableLike = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && typeof value.unmount === "function", "isUnmountableLike");
var coerceRenderer = /* @__PURE__ */ __name((candidate) => {
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
}, "coerceRenderer");
var runWithFrameManager = /* @__PURE__ */ __name((frameManager, getActiveManager, setActiveManager, renderView) => {
  frameManager.beginRender();
  frameManager.rootFrame.seenEpoch = frameManager.renderEpoch;
  const previousManager = getActiveManager();
  setActiveManager(frameManager);
  try {
    return frameManager.renderFrame(frameManager.rootFrame, renderView);
  } finally {
    setActiveManager(previousManager);
  }
}, "runWithFrameManager");

// src/runtime/frame-runtime.ts
var createFrameRuntime = /* @__PURE__ */ __name((options) => {
  let activeFrameManager = null;
  const runWithFrameManager3 = /* @__PURE__ */ __name((frameManager, renderView) => runWithFrameManager(frameManager, () => activeFrameManager, (next) => {
    activeFrameManager = next;
  }, renderView), "runWithFrameManager");
  const requireActiveFrameManager = /* @__PURE__ */ __name((apiName) => {
    if (!activeFrameManager) {
      throw new Error(`${apiName} can only be used while rendering inside mount_reactive`);
    }
    return activeFrameManager;
  }, "requireActiveFrameManager");
  return {
    runWithFrameManager: runWithFrameManager3,
    requireActiveFrameManager,
    component: /* @__PURE__ */ __name((componentFn, props, key) => {
      const frameManager = requireActiveFrameManager("render.component");
      const parentFrame = frameManager.currentFrame ?? frameManager.rootFrame;
      const { result } = frameManager.executeComponent(parentFrame, componentFn, key ?? null, props);
      return options.coerceRenderable(result);
    }, "component"),
    createContext: /* @__PURE__ */ __name((defaultValue) => createContextToken(defaultValue), "createContext"),
    createRequiredContext: /* @__PURE__ */ __name(() => createContextToken(), "createRequiredContext"),
    withContext: /* @__PURE__ */ __name((context, value, renderChildren) => {
      const frameManager = requireActiveFrameManager("render.with_context");
      return options.coerceRenderable(frameManager.withContext(context, value, renderChildren));
    }, "withContext"),
    useContext: /* @__PURE__ */ __name((context) => {
      const frameManager = requireActiveFrameManager("render.use_context");
      return frameManager.useContext(context);
    }, "useContext"),
    state: /* @__PURE__ */ __name((initial) => {
      const frameManager = requireActiveFrameManager("render.state");
      return frameManager.getSlot("state", () => options.createState(initial));
    }, "state"),
    remember: /* @__PURE__ */ __name((compute) => {
      const frameManager = requireActiveFrameManager("render.remember");
      return frameManager.getSlot("memo", compute);
    }, "remember")
  };
}, "createFrameRuntime");

// src/runtime/props-core.ts
var isEventProp2 = /* @__PURE__ */ __name((name) => /^on[A-Z]/.test(name), "isEventProp");
var mergeClassValues = /* @__PURE__ */ __name((left, right) => {
  const tokens = [
    left,
    right
  ].flatMap((value) => typeof value === "string" ? value.split(/\s+/) : []).map((token) => token.trim()).filter((token) => token.length > 0);
  if (tokens.length === 0) return right ?? left;
  return Array.from(new Set(tokens)).join(" ");
}, "mergeClassValues");
var mergeStyleValues = /* @__PURE__ */ __name((left, right) => {
  if (typeof left === "string" && typeof right === "string") {
    const parts = [
      left,
      right
    ].map((value) => value.trim()).filter((value) => value.length > 0);
    return parts.join(parts.length > 1 ? ";" : "");
  }
  if (left && right && typeof left === "object" && typeof right === "object" && !Array.isArray(left) && !Array.isArray(right)) {
    return {
      ...left,
      ...right
    };
  }
  return right ?? left;
}, "mergeStyleValues");
var preventDefaultIfNeeded = /* @__PURE__ */ __name((args) => {
  const event = args[0];
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
}, "preventDefaultIfNeeded");
var composeHandlers = /* @__PURE__ */ __name((left, right) => {
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
}, "composeHandlers");
var mergePropValue = /* @__PURE__ */ __name((name, left, right) => {
  if (right === void 0) return left;
  if (left === void 0) return right;
  if (name === "class" || name === "className") {
    return mergeClassValues(left, right);
  }
  if (name === "style") {
    return mergeStyleValues(left, right);
  }
  if (isEventProp2(name) && typeof left === "function" && typeof right === "function") {
    return composeHandlers(left, right);
  }
  return right;
}, "mergePropValue");
var mergeProps = /* @__PURE__ */ __name((left, right) => {
  const lhs = left && typeof left === "object" ? left : {};
  const rhs = right && typeof right === "object" ? right : {};
  const merged = {};
  for (const key of /* @__PURE__ */ new Set([
    ...Object.keys(lhs),
    ...Object.keys(rhs)
  ])) {
    const value = mergePropValue(key, lhs[key], rhs[key]);
    if (value !== void 0) {
      merged[key] = value;
    }
  }
  return merged;
}, "mergeProps");
var normalizeAuthoringPropName = /* @__PURE__ */ __name((name) => {
  if (name === "class") return "className";
  if (name.startsWith("data_")) return `data-${name.slice(5).replace(/_/g, "-")}`;
  if (name.startsWith("aria_")) return `aria-${name.slice(5).replace(/_/g, "-")}`;
  if (name.startsWith("on_")) {
    const eventName = name.slice(3).replace(/_([a-zA-Z0-9])/g, (_match, ch) => ch.toUpperCase());
    return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
  }
  return name.replace(/_([a-zA-Z0-9])/g, (_match, ch) => ch.toUpperCase());
}, "normalizeAuthoringPropName");
var propsAttr = /* @__PURE__ */ __name((name, value) => ({
  [normalizeAuthoringPropName(name)]: value
}), "propsAttr");
var propsWhen = /* @__PURE__ */ __name((condition, props) => {
  const resolved = condition instanceof Signal ? condition.get() : condition;
  return resolved ? mergeProps({}, props) : {};
}, "propsWhen");
var propsEmpty = /* @__PURE__ */ __name(() => ({}), "propsEmpty");
var propsClass = /* @__PURE__ */ __name((className) => ({
  className
}), "propsClass");
var propsId = /* @__PURE__ */ __name((id) => ({
  id
}), "propsId");
var propsStyle = /* @__PURE__ */ __name((style) => ({
  style
}), "propsStyle");
var propsValue = /* @__PURE__ */ __name((value) => ({
  value
}), "propsValue");
var propsChecked = /* @__PURE__ */ __name((checked) => ({
  checked
}), "propsChecked");
var propsType = /* @__PURE__ */ __name((type) => ({
  type
}), "propsType");
var propsName = /* @__PURE__ */ __name((name) => ({
  name
}), "propsName");
var propsPlaceholder = /* @__PURE__ */ __name((placeholder) => ({
  placeholder
}), "propsPlaceholder");
var propsHref = /* @__PURE__ */ __name((href) => ({
  href
}), "propsHref");
var propsDisabled = /* @__PURE__ */ __name((disabled) => ({
  disabled
}), "propsDisabled");
var propsKey = /* @__PURE__ */ __name((key) => ({
  key
}), "propsKey");
var propsOnClick = /* @__PURE__ */ __name((handler) => ({
  onClick: /* @__PURE__ */ __name((event) => {
    if (typeof handler !== "function") return void 0;
    const outcome = handler();
    if (outcome === false && event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    return outcome;
  }, "onClick")
}), "propsOnClick");
var propsOnClickDelta = /* @__PURE__ */ __name((signal, delta) => ({
  onClick: /* @__PURE__ */ __name(() => {
    signal.set(signal.get() + delta);
  }, "onClick")
}), "propsOnClickDelta");
var propsOnClickInc = /* @__PURE__ */ __name((signal) => ({
  onClick: /* @__PURE__ */ __name(() => {
    signal.set(signal.get() + 1);
  }, "onClick")
}), "propsOnClickInc");
var propsOnClickDec = /* @__PURE__ */ __name((signal) => ({
  onClick: /* @__PURE__ */ __name(() => {
    signal.set(signal.get() - 1);
  }, "onClick")
}), "propsOnClickDec");
var propsOnInput = /* @__PURE__ */ __name((handler) => ({
  onInput: /* @__PURE__ */ __name((event) => handler(event.target?.value ?? ""), "onInput")
}), "propsOnInput");
var propsOnChange = /* @__PURE__ */ __name((handler) => ({
  onChange: /* @__PURE__ */ __name((event) => handler(event.target?.value ?? ""), "onChange")
}), "propsOnChange");
var propsOnCheckedChange = /* @__PURE__ */ __name((handler) => ({
  onChange: /* @__PURE__ */ __name((event) => handler(!!event.target?.checked), "onChange")
}), "propsOnCheckedChange");
var propsOnSubmit = /* @__PURE__ */ __name((handler) => ({
  onSubmit: /* @__PURE__ */ __name((event) => {
    event?.preventDefault?.();
    if (typeof handler !== "function") return void 0;
    return handler();
  }, "onSubmit")
}), "propsOnSubmit");

// src/runtime/headless-primitives-runtime.ts
var getTextLabel = /* @__PURE__ */ __name((input) => {
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
}, "getTextLabel");
var createHeadlessPrimitivesRuntime = /* @__PURE__ */ __name((options) => {
  const { tabsContext, dialogContext, popoverContext, tooltipContext, toastContext, menuContext, checkboxContext, radioGroupContext, radioItemContext, selectContext, selectItemContext, comboboxContext, comboboxItemContext, multiselectContext, multiselectItemContext, getTabsBaseId, getDialogBaseId, getPopoverBaseId, getTooltipBaseId, getToastBaseId, getMenuBaseId, getCheckboxBaseId, getRadioBaseId, getSelectBaseId, getComboboxBaseId, getMultiselectBaseId, getTabsIds, registerTabsValue, getTabsNavigationTarget, getDialogIds, getPopoverIds, getTooltipIds, getToastIds, getMenuIds, getCheckboxIds, getRadioItemId, getSelectIds, getComboboxIds, getMultiselectIds, getRadioIndicatorId, getSelectItemId, getComboboxItemId, getMultiselectItemId, getSelectIndicatorId, getComboboxIndicatorId, getMultiselectIndicatorId, setDialogRestoreTarget, restoreDialogFocus, setPopoverAnchorTarget, setPopoverRestoreTarget, restorePopoverFocus, clearToastTimer, scheduleToastTimer, setMenuAnchorTarget, setMenuRestoreTarget, restoreMenuFocus, setTooltipAnchorTarget, setSelectAnchorTarget, setSelectRestoreTarget, restoreSelectFocus, setComboboxAnchorTarget, setComboboxRestoreTarget, restoreComboboxFocus, setMultiselectAnchorTarget, setMultiselectRestoreTarget, restoreMultiselectFocus, registerMenuValue, registerRadioValue, registerSelectValue, registerComboboxValue, registerMultiselectValue, getMenuItemId, getMenuActiveValue, setMenuActiveValue, getMenuNavigationTarget, getMenuTypeaheadTarget, getRadioNavigationTarget, getSelectNavigationTarget, getSelectTypeaheadTarget, getComboboxNavigationTarget, getMultiselectNavigationTarget, getMultiselectTypeaheadTarget, getSelectActiveValue, getSelectActiveDescendantId, setSelectActiveValue, acceptSelectActiveValue, getComboboxActiveValue, getComboboxActiveDescendantId, setComboboxActiveValue, acceptComboboxActiveValue, getMultiselectActiveValue, setMultiselectActiveValue, focusMenuItem, focusRadioItem, focusMultiselectItem, closeMenu, closeSelect, closeCombobox, closeMultiselect, readStringSelection, toggleMultiselectValue, getPopoverAnchorRect, getMenuAnchorRect, getTooltipAnchorRect, getSelectAnchorRect, getComboboxAnchorRect, getMultiselectAnchorRect, pickPopoverSide, omitPopoverLayoutProps, pickToastDuration, omitToastControlProps, getPopoverContentStyle } = options.headlessUi;
  const resolveMultiselectOpenActiveValue = /* @__PURE__ */ __name((ctx) => readStringSelection(ctx.values.get()).find((entry) => ctx.order.includes(entry)) ?? ctx.order[0] ?? "", "resolveMultiselectOpenActiveValue");
  const api = {
    tabs_root: /* @__PURE__ */ __name((value, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_root");
      return coerceRenderableToVNode(frameManager.withContext(tabsContext, {
        value,
        baseId: getTabsBaseId(value),
        order: []
      }, renderChildren));
    }, "tabs_root"),
    tabs_list: /* @__PURE__ */ __name((props, renderChildren) => vnodeElement("div", mergeProps({
      role: "tablist",
      "data-lumina-tabs-list": "true"
    }, props), resolveChildrenInput(renderChildren)), "tabs_list"),
    tabs_trigger: /* @__PURE__ */ __name((value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_trigger");
      const ctx = frameManager.useContext(tabsContext);
      registerTabsValue(ctx, value);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement("button", mergeProps({
        role: "tab",
        type: "button",
        id: triggerId,
        "aria-controls": panelId,
        "aria-selected": selected ? "true" : "false",
        tabIndex: selected ? 0 : -1,
        "data-state": selected ? "active" : "inactive",
        onClick: /* @__PURE__ */ __name(() => ctx.value.set(value), "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const nextValue = getTabsNavigationTarget(ctx, value, String(event?.key ?? ""));
          if (!nextValue) return void 0;
          event?.preventDefault?.();
          ctx.value.set(nextValue);
          return false;
        }, "onKeyDown")
      }, props), children2);
    }, "tabs_trigger"),
    tabs_panel: /* @__PURE__ */ __name((value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tabs_panel");
      const ctx = frameManager.useContext(tabsContext);
      const selected = ctx.value.get() === value;
      const { triggerId, panelId } = getTabsIds(ctx, value);
      return vnodeElement("div", mergeProps({
        role: "tabpanel",
        id: panelId,
        "aria-labelledby": triggerId,
        hidden: !selected,
        tabIndex: selected ? 0 : -1,
        "data-state": selected ? "active" : "inactive"
      }, props), children2);
    }, "tabs_panel"),
    dialog_root: /* @__PURE__ */ __name((open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_root");
      return coerceRenderableToVNode(frameManager.withContext(dialogContext, {
        open,
        baseId: getDialogBaseId(open),
        hasTitle: false,
        hasDescription: false
      }, renderChildren));
    }, "dialog_root"),
    dialog_portal: /* @__PURE__ */ __name((children2 = []) => vnodePortal(null, children2), "dialog_portal"),
    dialog_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_trigger");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getDialogIds(ctx);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        "aria-haspopup": "dialog",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": contentId,
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (target) {
            setDialogRestoreTarget(ctx, target);
          }
          ctx.open.set(true);
        }, "onClick")
      }, props), children2);
    }, "dialog_trigger"),
    dialog_overlay: /* @__PURE__ */ __name((props) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_overlay");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      return vnodeElement("div", mergeProps({
        "data-lumina-dialog-overlay": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        onClick: /* @__PURE__ */ __name(() => {
          ctx.open.set(false);
          restoreDialogFocus(ctx);
        }, "onClick")
      }, props), []);
    }, "dialog_overlay"),
    dialog_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_content");
      const ctx = frameManager.useContext(dialogContext);
      const open = ctx.open.get();
      const { contentId, titleId, descriptionId } = getDialogIds(ctx);
      return vnodeElement("div", mergeProps({
        role: "dialog",
        id: contentId,
        "aria-modal": "true",
        "aria-labelledby": ctx.hasTitle ? titleId : void 0,
        "aria-describedby": ctx.hasDescription ? descriptionId : void 0,
        autoFocus: open,
        hidden: !open,
        tabIndex: -1,
        "data-state": open ? "open" : "closed",
        onKeyDown: /* @__PURE__ */ __name((event) => {
          if (trapDialogTabNavigation(event)) {
            return false;
          }
          if (String(event?.key ?? "") !== "Escape") return void 0;
          event?.preventDefault?.();
          ctx.open.set(false);
          restoreDialogFocus(ctx);
          return false;
        }, "onKeyDown")
      }, props), children2);
    }, "dialog_content"),
    dialog_title: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_title");
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasTitle = true;
      const { titleId } = getDialogIds(ctx);
      return vnodeElement("h2", mergeProps({
        id: titleId,
        "data-lumina-dialog-title": "true"
      }, props), children2);
    }, "dialog_title"),
    dialog_description: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_description");
      const ctx = frameManager.useContext(dialogContext);
      ctx.hasDescription = true;
      const { descriptionId } = getDialogIds(ctx);
      return vnodeElement("p", mergeProps({
        id: descriptionId,
        "data-lumina-dialog-description": "true"
      }, props), children2);
    }, "dialog_description"),
    dialog_close: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.dialog_close");
      const ctx = frameManager.useContext(dialogContext);
      return vnodeElement("button", mergeProps({
        type: "button",
        "data-lumina-dialog-close": "true",
        onClick: /* @__PURE__ */ __name(() => {
          ctx.open.set(false);
          restoreDialogFocus(ctx);
        }, "onClick")
      }, props), children2);
    }, "dialog_close"),
    popover_root: /* @__PURE__ */ __name((open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.popover_root");
      return coerceRenderableToVNode(frameManager.withContext(popoverContext, {
        open,
        baseId: getPopoverBaseId(open)
      }, renderChildren));
    }, "popover_root"),
    popover_portal: /* @__PURE__ */ __name((children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_portal");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement("div", {
        "data-lumina-popover-dismiss": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        style: {
          position: "fixed",
          inset: "0",
          background: "transparent",
          zIndex: "1000"
        },
        onClick: /* @__PURE__ */ __name(() => {
          ctx.open.set(false);
          restorePopoverFocus(ctx);
        }, "onClick")
      }, []);
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    }, "popover_portal"),
    popover_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_trigger");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        "aria-haspopup": "dialog",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": contentId,
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name((event) => {
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
        }, "onClick")
      }, props), children2);
    }, "popover_trigger"),
    popover_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.popover_content");
      const ctx = frameManager.useContext(popoverContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getPopoverIds(ctx);
      return vnodeElement("div", mergeProps({
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
        onKeyDown: /* @__PURE__ */ __name((event) => {
          if (String(event?.key ?? "") !== "Escape") return void 0;
          event?.preventDefault?.();
          ctx.open.set(false);
          restorePopoverFocus(ctx);
          return false;
        }, "onKeyDown")
      }, omitPopoverLayoutProps(props)), children2);
    }, "popover_content"),
    tooltip_root: /* @__PURE__ */ __name((open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_root");
      return coerceRenderableToVNode(frameManager.withContext(tooltipContext, {
        open,
        baseId: getTooltipBaseId(open)
      }, renderChildren));
    }, "tooltip_root"),
    tooltip_portal: /* @__PURE__ */ __name((children2 = []) => vnodePortal(null, children2), "tooltip_portal"),
    tooltip_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_trigger");
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getTooltipIds(ctx);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        "aria-describedby": open ? contentId : void 0,
        "data-state": open ? "open" : "closed",
        onMouseEnter: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (target) {
            setTooltipAnchorTarget(ctx, target);
          }
          ctx.open.set(true);
        }, "onMouseEnter"),
        onMouseLeave: /* @__PURE__ */ __name(() => {
          ctx.open.set(false);
        }, "onMouseLeave"),
        onFocus: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (target) {
            setTooltipAnchorTarget(ctx, target);
          }
          ctx.open.set(true);
        }, "onFocus"),
        onBlur: /* @__PURE__ */ __name(() => {
          ctx.open.set(false);
        }, "onBlur")
      }, props), children2);
    }, "tooltip_trigger"),
    tooltip_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.tooltip_content");
      const ctx = frameManager.useContext(tooltipContext);
      const open = ctx.open.get();
      const { contentId } = getTooltipIds(ctx);
      return vnodeElement("div", mergeProps({
        role: "tooltip",
        id: contentId,
        hidden: !open,
        "data-lumina-tooltip-content": "true",
        "data-state": open ? "open" : "closed",
        "data-side": pickPopoverSide(props),
        style: getPopoverContentStyle(getTooltipAnchorRect(ctx), props)
      }, omitPopoverLayoutProps(props)), children2);
    }, "tooltip_content"),
    toast_root: /* @__PURE__ */ __name((open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.toast_root");
      return coerceRenderableToVNode(frameManager.withContext(toastContext, {
        open,
        baseId: getToastBaseId(open),
        hasTitle: false,
        hasDescription: false
      }, renderChildren));
    }, "toast_root"),
    toast_portal: /* @__PURE__ */ __name((children2 = []) => vnodePortal(null, children2), "toast_portal"),
    toast_content: /* @__PURE__ */ __name((props, children2 = []) => {
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
      return vnodeElement("div", mergeProps({
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
        onKeyDown: /* @__PURE__ */ __name((event) => {
          if (String(event?.key ?? "") !== "Escape") return void 0;
          event?.preventDefault?.();
          clearToastTimer(ctx.open);
          ctx.open.set(false);
          return false;
        }, "onKeyDown")
      }, omitToastControlProps(props)), children2);
    }, "toast_content"),
    toast_title: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_title");
      const ctx = frameManager.useContext(toastContext);
      ctx.hasTitle = true;
      const { titleId } = getToastIds(ctx);
      return vnodeElement("div", mergeProps({
        id: titleId,
        "data-lumina-toast-title": "true"
      }, props), children2);
    }, "toast_title"),
    toast_description: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_description");
      const ctx = frameManager.useContext(toastContext);
      ctx.hasDescription = true;
      const { descriptionId } = getToastIds(ctx);
      return vnodeElement("div", mergeProps({
        id: descriptionId,
        "data-lumina-toast-description": "true"
      }, props), children2);
    }, "toast_description"),
    toast_close: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.toast_close");
      const ctx = frameManager.useContext(toastContext);
      return vnodeElement("button", mergeProps({
        type: "button",
        "data-lumina-toast-close": "true",
        onClick: /* @__PURE__ */ __name(() => {
          clearToastTimer(ctx.open);
          ctx.open.set(false);
        }, "onClick")
      }, props), children2);
    }, "toast_close"),
    menu_root: /* @__PURE__ */ __name((open, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.menu_root");
      return coerceRenderableToVNode(frameManager.withContext(menuContext, {
        open,
        baseId: getMenuBaseId(open),
        order: []
      }, renderChildren));
    }, "menu_root"),
    menu_portal: /* @__PURE__ */ __name((children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_portal");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement("div", {
        "data-lumina-menu-dismiss": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        style: {
          position: "fixed",
          inset: "0",
          background: "transparent",
          zIndex: "1000"
        },
        onClick: /* @__PURE__ */ __name(() => {
          closeMenu(ctx);
        }, "onClick")
      }, []);
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    }, "menu_portal"),
    menu_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_trigger");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": contentId,
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name((event) => {
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
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          const target = getFocusTargetFromEvent(event);
          if (key !== "Enter" && key !== " " && key !== "ArrowDown" && key !== "ArrowUp") {
            return void 0;
          }
          event?.preventDefault?.();
          if (target) {
            setMenuRestoreTarget(ctx, target);
            setMenuAnchorTarget(ctx, target);
          }
          setMenuActiveValue(ctx, key === "ArrowUp" ? ctx.order[ctx.order.length - 1] ?? "" : "");
          ctx.open.set(true);
          return false;
        }, "onKeyDown")
      }, props), children2);
    }, "menu_trigger"),
    menu_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_content");
      const ctx = frameManager.useContext(menuContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMenuIds(ctx);
      return vnodeElement("div", mergeProps({
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
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeMenu(ctx);
            return false;
          }
          if (key === "Tab") {
            setMenuActiveValue(ctx, "");
            ctx.open.set(false);
            return void 0;
          }
          if (key === "ArrowDown" || key === "Home") {
            event?.preventDefault?.();
            setMenuActiveValue(ctx, ctx.order[0] ?? "");
            focusMenuItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, ctx.order[0] ?? "");
            return false;
          }
          if (key === "ArrowUp" || key === "End") {
            event?.preventDefault?.();
            setMenuActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? "");
            focusMenuItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, ctx.order[ctx.order.length - 1] ?? "");
            return false;
          }
          const typeaheadTarget = getMenuTypeaheadTarget(ctx, getMenuActiveValue(ctx), key);
          if (!typeaheadTarget) {
            return void 0;
          }
          event?.preventDefault?.();
          setMenuActiveValue(ctx, typeaheadTarget);
          focusMenuItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, typeaheadTarget);
          return false;
        }, "onKeyDown")
      }, omitPopoverLayoutProps(props)), children2);
    }, "menu_content"),
    menu_item: /* @__PURE__ */ __name((value, props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.menu_item");
      const ctx = frameManager.useContext(menuContext);
      registerMenuValue(ctx, value, getTextLabel(children2));
      const open = ctx.open.get();
      const active = getMenuActiveValue(ctx);
      const itemId = getMenuItemId(ctx, value);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: itemId,
        role: "menuitem",
        hidden: !open,
        tabIndex: open && active === value ? 0 : -1,
        autoFocus: open && active === value,
        "data-lumina-menu-item": "true",
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name(() => {
          closeMenu(ctx);
        }, "onClick"),
        onMouseEnter: /* @__PURE__ */ __name(() => {
          setMenuActiveValue(ctx, value);
        }, "onMouseEnter"),
        onFocus: /* @__PURE__ */ __name(() => {
          setMenuActiveValue(ctx, value);
        }, "onFocus"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeMenu(ctx);
            return false;
          }
          if (key === "Tab") {
            setMenuActiveValue(ctx, "");
            ctx.open.set(false);
            return void 0;
          }
          if (key === "Enter" || key === " ") {
            event?.preventDefault?.();
            const click = props?.onClick;
            if (typeof click === "function") {
              click(event);
            }
            closeMenu(ctx);
            return false;
          }
          const nextValue = getMenuNavigationTarget(ctx, value, key);
          if (nextValue) {
            event?.preventDefault?.();
            setMenuActiveValue(ctx, nextValue);
            focusMenuItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, nextValue);
            return false;
          }
          const typeaheadTarget = getMenuTypeaheadTarget(ctx, value, key);
          if (!typeaheadTarget) return void 0;
          event?.preventDefault?.();
          setMenuActiveValue(ctx, typeaheadTarget);
          focusMenuItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, typeaheadTarget);
          return false;
        }, "onKeyDown")
      }, props), children2);
    }, "menu_item"),
    select_root: /* @__PURE__ */ __name((open, value, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.select_root");
      return coerceRenderableToVNode(frameManager.withContext(selectContext, {
        open,
        value,
        baseId: getSelectBaseId(open),
        order: []
      }, renderChildren));
    }, "select_root"),
    select_portal: /* @__PURE__ */ __name((children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_portal");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement("div", {
        "data-lumina-select-dismiss": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        style: {
          position: "fixed",
          inset: "0",
          background: "transparent",
          zIndex: "1000"
        },
        onClick: /* @__PURE__ */ __name(() => {
          closeSelect(ctx);
        }, "onClick")
      }, []);
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    }, "select_portal"),
    select_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_trigger");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      const activeDescendantId = open ? getSelectActiveDescendantId(ctx) : null;
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        role: "combobox",
        "aria-haspopup": "listbox",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": open ? contentId : void 0,
        "aria-activedescendant": activeDescendantId ?? void 0,
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name((event) => {
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
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          const openNow = ctx.open.get();
          const currentValue = ctx.value.get();
          const currentActive = getSelectActiveValue(ctx);
          if (key === "Escape" && openNow) {
            event?.preventDefault?.();
            closeSelect(ctx);
            return false;
          }
          if (!openNow) {
            if (key === "ArrowDown" || key === "Enter" || key === " ") {
              event?.preventDefault?.();
              setSelectActiveValue(ctx, currentValue);
              ctx.open.set(true);
              return false;
            }
            if (key === "ArrowUp" || key === "Home") {
              event?.preventDefault?.();
              setSelectActiveValue(ctx, ctx.order[0] ?? currentValue);
              ctx.open.set(true);
              return false;
            }
            if (key === "End") {
              event?.preventDefault?.();
              setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentValue);
              ctx.open.set(true);
              return false;
            }
            const typeaheadTarget2 = getSelectTypeaheadTarget(ctx, currentValue, key);
            if (!typeaheadTarget2) {
              return void 0;
            }
            event?.preventDefault?.();
            setSelectActiveValue(ctx, typeaheadTarget2);
            ctx.open.set(true);
            return false;
          }
          if (key === "Enter" || key === " " || key === "Tab") {
            if (key !== "Tab") {
              event?.preventDefault?.();
            }
            acceptSelectActiveValue(ctx);
            setSelectActiveValue(ctx, ctx.value.get());
            ctx.open.set(false);
            return key === "Tab" ? void 0 : false;
          }
          if (key === "Home") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, ctx.order[0] ?? currentActive);
            return false;
          }
          if (key === "End") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentActive);
            return false;
          }
          const typeaheadTarget = getSelectTypeaheadTarget(ctx, currentActive, key);
          if (typeaheadTarget) {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, typeaheadTarget);
            return false;
          }
          const nextValue = getSelectNavigationTarget(ctx, currentActive, key);
          if (!nextValue) return void 0;
          event?.preventDefault?.();
          setSelectActiveValue(ctx, nextValue);
          return false;
        }, "onKeyDown")
      }, props), children2);
    }, "select_trigger"),
    select_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_content");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getSelectIds(ctx);
      return vnodeElement("div", mergeProps({
        role: "listbox",
        id: contentId,
        "aria-labelledby": triggerId,
        hidden: !open,
        "data-lumina-select-content": "true",
        "data-state": open ? "open" : "closed",
        "data-side": pickPopoverSide(props),
        style: getPopoverContentStyle(getSelectAnchorRect(ctx), props),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          const currentActive = getSelectActiveValue(ctx);
          if (key === "Escape") {
            event?.preventDefault?.();
            closeSelect(ctx);
            return false;
          }
          if (key === "ArrowDown" || key === "ArrowRight") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key));
            return false;
          }
          if (key === "ArrowUp" || key === "ArrowLeft") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, getSelectNavigationTarget(ctx, getSelectActiveValue(ctx), key));
            return false;
          }
          if (key === "Home") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, ctx.order[0] ?? currentActive);
            return false;
          }
          if (key === "End") {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, ctx.order[ctx.order.length - 1] ?? currentActive);
            return false;
          }
          if (key === "Enter" || key === " " || key === "Tab") {
            if (key !== "Tab") {
              event?.preventDefault?.();
            }
            acceptSelectActiveValue(ctx);
            setSelectActiveValue(ctx, ctx.value.get());
            ctx.open.set(false);
            return key === "Tab" ? void 0 : false;
          }
          const typeaheadTarget = getSelectTypeaheadTarget(ctx, currentActive, key);
          if (typeaheadTarget) {
            event?.preventDefault?.();
            setSelectActiveValue(ctx, typeaheadTarget);
            return false;
          }
          return void 0;
        }, "onKeyDown")
      }, omitPopoverLayoutProps(props)), children2);
    }, "select_content"),
    select_item: /* @__PURE__ */ __name((value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.select_item");
      const ctx = frameManager.useContext(selectContext);
      const open = ctx.open.get();
      const currentValue = ctx.value.get();
      const activeValue = getSelectActiveValue(ctx);
      const selected = currentValue === value;
      const active = open && activeValue === value;
      const itemId = getSelectItemId(ctx, value);
      return coerceRenderableToVNode(frameManager.withContext(selectItemContext, {
        value,
        itemId,
        selected
      }, () => {
        const resolvedChildren = resolveChildrenInput(renderChildren);
        registerSelectValue(ctx, value, getTextLabel(resolvedChildren));
        return vnodeElement("button", mergeProps({
          type: "button",
          id: itemId,
          role: "option",
          hidden: !open,
          tabIndex: -1,
          "aria-selected": selected ? "true" : "false",
          "data-lumina-select-item": "true",
          "data-active": active ? "true" : "false",
          "data-state": selected ? "checked" : "unchecked",
          onClick: /* @__PURE__ */ __name(() => {
            setSelectActiveValue(ctx, value);
            acceptSelectActiveValue(ctx);
            closeSelect(ctx);
          }, "onClick"),
          onMouseEnter: /* @__PURE__ */ __name(() => {
            setSelectActiveValue(ctx, value);
          }, "onMouseEnter"),
          onKeyDown: /* @__PURE__ */ __name((event) => {
            const key = String(event?.key ?? "");
            if (key === "Escape") {
              event?.preventDefault?.();
              closeSelect(ctx);
              return false;
            }
            if (key === "Enter" || key === " " || key === "Tab") {
              if (key !== "Tab") {
                event?.preventDefault?.();
              }
              setSelectActiveValue(ctx, value);
              acceptSelectActiveValue(ctx);
              setSelectActiveValue(ctx, ctx.value.get());
              ctx.open.set(false);
              return key === "Tab" ? void 0 : false;
            }
            const nextValue = getSelectNavigationTarget(ctx, value, key);
            if (!nextValue) return void 0;
            event?.preventDefault?.();
            setSelectActiveValue(ctx, nextValue);
            restoreSelectFocus(ctx);
            return false;
          }, "onKeyDown")
        }, props), resolvedChildren);
      }));
    }, "select_item"),
    select_indicator: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.select_indicator");
      const ctx = frameManager.useContext(selectItemContext);
      return vnodeElement("span", mergeProps({
        id: getSelectIndicatorId(ctx.itemId),
        "aria-hidden": "true",
        hidden: !ctx.selected,
        "data-lumina-select-indicator": "true",
        "data-state": ctx.selected ? "checked" : "unchecked"
      }, props), children2);
    }, "select_indicator"),
    combobox_root: /* @__PURE__ */ __name((open, value, query2, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_root");
      return coerceRenderableToVNode(frameManager.withContext(comboboxContext, {
        open,
        value,
        query: query2,
        baseId: getComboboxBaseId(open),
        order: []
      }, renderChildren));
    }, "combobox_root"),
    combobox_portal: /* @__PURE__ */ __name((children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_portal");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement("div", {
        "data-lumina-combobox-dismiss": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        style: {
          position: "fixed",
          inset: "0",
          background: "transparent",
          zIndex: "1000"
        },
        onClick: /* @__PURE__ */ __name(() => {
          closeCombobox(ctx);
        }, "onClick")
      }, []);
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    }, "combobox_portal"),
    combobox_input: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_input");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      const activeDescendantId = open ? getComboboxActiveDescendantId(ctx) : null;
      return vnodeElement("input", mergeProps({
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
        onInput: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (target) {
            setComboboxRestoreTarget(ctx, target);
            setComboboxAnchorTarget(ctx, target);
          }
          const nextQuery = String(event?.target?.value ?? "");
          ctx.query.set(nextQuery);
          setComboboxActiveValue(ctx, "");
          ctx.open.set(true);
        }, "onInput"),
        onFocus: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (!target) return void 0;
          setComboboxRestoreTarget(ctx, target);
          setComboboxAnchorTarget(ctx, target);
          setComboboxActiveValue(ctx, ctx.value.get());
          ctx.open.set(true);
          return void 0;
        }, "onFocus"),
        onClick: /* @__PURE__ */ __name((event) => {
          const target = getFocusTargetFromEvent(event);
          if (!target) return void 0;
          setComboboxRestoreTarget(ctx, target);
          setComboboxAnchorTarget(ctx, target);
          setComboboxActiveValue(ctx, ctx.value.get());
          ctx.open.set(true);
          return void 0;
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeCombobox(ctx);
            return false;
          }
          if (key === "Enter") {
            event?.preventDefault?.();
            acceptComboboxActiveValue(ctx);
            closeCombobox(ctx);
            return false;
          }
          if (key === "ArrowDown" || key === "ArrowUp") {
            event?.preventDefault?.();
            ctx.open.set(true);
            const currentValue = getComboboxActiveValue(ctx);
            const nextValue = key === "ArrowDown" ? getComboboxNavigationTarget(ctx, currentValue, currentValue ? "ArrowDown" : "Home") : getComboboxNavigationTarget(ctx, currentValue, currentValue ? "ArrowUp" : "End");
            if (nextValue) {
              setComboboxActiveValue(ctx, nextValue);
            }
            return false;
          }
          return void 0;
        }, "onKeyDown")
      }, props), children2);
    }, "combobox_input"),
    combobox_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_content");
      const ctx = frameManager.useContext(comboboxContext);
      const open = ctx.open.get();
      const { inputId, contentId } = getComboboxIds(ctx);
      return vnodeElement("div", mergeProps({
        role: "listbox",
        id: contentId,
        "aria-labelledby": inputId,
        hidden: !open,
        tabIndex: -1,
        "data-lumina-combobox-content": "true",
        "data-state": open ? "open" : "closed",
        "data-side": pickPopoverSide(props),
        style: getPopoverContentStyle(getComboboxAnchorRect(ctx), props),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeCombobox(ctx);
            return false;
          }
          if (key === "Enter") {
            event?.preventDefault?.();
            acceptComboboxActiveValue(ctx);
            closeCombobox(ctx);
            return false;
          }
          if (key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End") {
            event?.preventDefault?.();
            const currentValue = getComboboxActiveValue(ctx);
            const nextValue = getComboboxNavigationTarget(ctx, currentValue, key === "ArrowDown" || key === "ArrowUp" ? key : key);
            if (nextValue) {
              setComboboxActiveValue(ctx, nextValue);
            }
            restoreComboboxFocus(ctx);
            return false;
          }
          return void 0;
        }, "onKeyDown")
      }, omitPopoverLayoutProps(props)), children2);
    }, "combobox_content"),
    combobox_item: /* @__PURE__ */ __name((value, props, renderChildren) => {
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
      return coerceRenderableToVNode(frameManager.withContext(comboboxItemContext, {
        value,
        itemId,
        selected,
        active
      }, () => vnodeElement("div", mergeProps({
        id: itemId,
        role: "option",
        hidden: !open || !matchesQuery,
        tabIndex: -1,
        "aria-selected": active ? "true" : "false",
        "data-lumina-combobox-item": "true",
        "data-state": selected ? "checked" : "unchecked",
        "data-active": active ? "true" : "false",
        onMouseDown: /* @__PURE__ */ __name((event) => {
          event?.preventDefault?.();
          return false;
        }, "onMouseDown"),
        onMouseEnter: /* @__PURE__ */ __name(() => {
          setComboboxActiveValue(ctx, value);
        }, "onMouseEnter"),
        onFocus: /* @__PURE__ */ __name(() => {
          setComboboxActiveValue(ctx, value);
        }, "onFocus"),
        onClick: /* @__PURE__ */ __name(() => {
          ctx.value.set(value);
          ctx.query.set(value);
          setComboboxActiveValue(ctx, value);
          closeCombobox(ctx);
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeCombobox(ctx);
            return false;
          }
          if (key === "Enter" || key === " ") {
            event?.preventDefault?.();
            ctx.value.set(value);
            ctx.query.set(value);
            setComboboxActiveValue(ctx, value);
            closeCombobox(ctx);
            return false;
          }
          const nextValue = getComboboxNavigationTarget(ctx, value, key);
          if (!nextValue) return void 0;
          event?.preventDefault?.();
          setComboboxActiveValue(ctx, nextValue);
          restoreComboboxFocus(ctx);
          return false;
        }, "onKeyDown")
      }, props), resolveChildrenInput(renderChildren))));
    }, "combobox_item"),
    combobox_indicator: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.combobox_indicator");
      const ctx = frameManager.useContext(comboboxItemContext);
      return vnodeElement("span", mergeProps({
        id: getComboboxIndicatorId(ctx.itemId),
        "aria-hidden": "true",
        hidden: !ctx.active,
        "data-lumina-combobox-indicator": "true",
        "data-state": ctx.active ? "checked" : "unchecked"
      }, props), children2);
    }, "combobox_indicator"),
    multiselect_root: /* @__PURE__ */ __name((open, values, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_root");
      return coerceRenderableToVNode(frameManager.withContext(multiselectContext, {
        open,
        values,
        baseId: getMultiselectBaseId(open),
        order: []
      }, renderChildren));
    }, "multiselect_root"),
    multiselect_portal: /* @__PURE__ */ __name((children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_portal");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const dismissLayer = vnodeElement("div", {
        "data-lumina-multiselect-dismiss": "true",
        "data-state": open ? "open" : "closed",
        hidden: !open,
        style: {
          position: "fixed",
          inset: "0",
          background: "transparent",
          zIndex: "1000"
        },
        onClick: /* @__PURE__ */ __name(() => {
          closeMultiselect(ctx);
        }, "onClick")
      }, []);
      return vnodePortal(null, [
        dismissLayer,
        ...normalizeVNodeChildren(resolveChildrenInput(children2))
      ]);
    }, "multiselect_portal"),
    multiselect_trigger: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_trigger");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement("button", mergeProps({
        type: "button",
        id: triggerId,
        "aria-haspopup": "listbox",
        "aria-expanded": open ? "true" : "false",
        "aria-controls": contentId,
        "data-state": open ? "open" : "closed",
        onClick: /* @__PURE__ */ __name((event) => {
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
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          const target = getFocusTargetFromEvent(event);
          const openWithValue = /* @__PURE__ */ __name((nextValue) => {
            event?.preventDefault?.();
            if (target) {
              setMultiselectRestoreTarget(ctx, target);
              setMultiselectAnchorTarget(ctx, target);
            }
            setMultiselectActiveValue(ctx, nextValue);
            ctx.open.set(true);
            return false;
          }, "openWithValue");
          const initialValue = resolveMultiselectOpenActiveValue(ctx);
          if (key === "Enter" || key === " " || key === "ArrowDown") {
            return openWithValue(initialValue);
          }
          if (key === "ArrowUp" || key === "End") {
            return openWithValue(ctx.order[ctx.order.length - 1] ?? initialValue);
          }
          if (key === "Home") {
            return openWithValue(ctx.order[0] ?? initialValue);
          }
          const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, initialValue, key);
          if (!typeaheadTarget) {
            return void 0;
          }
          return openWithValue(typeaheadTarget);
        }, "onKeyDown")
      }, props), children2);
    }, "multiselect_trigger"),
    multiselect_content: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_content");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const { triggerId, contentId } = getMultiselectIds(ctx);
      return vnodeElement("div", mergeProps({
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
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Escape") {
            event?.preventDefault?.();
            closeMultiselect(ctx);
            return false;
          }
          if (key === "Tab") {
            ctx.open.set(false);
            return void 0;
          }
          const activeValue = getMultiselectActiveValue(ctx);
          if (key === "Enter" || key === " ") {
            if (!activeValue) {
              return void 0;
            }
            event?.preventDefault?.();
            setMultiselectActiveValue(ctx, activeValue);
            toggleMultiselectValue(ctx, activeValue);
            focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, activeValue, getFocusTargetFromEvent(event));
            return false;
          }
          if (key === "ArrowDown" || key === "Home") {
            event?.preventDefault?.();
            const targetValue = key === "Home" ? ctx.order[0] ?? activeValue : getMultiselectNavigationTarget(ctx, activeValue, key) ?? activeValue;
            setMultiselectActiveValue(ctx, targetValue);
            focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, targetValue, getFocusTargetFromEvent(event));
            return false;
          }
          if (key === "ArrowUp" || key === "End") {
            event?.preventDefault?.();
            const targetValue = key === "End" ? ctx.order[ctx.order.length - 1] ?? activeValue : getMultiselectNavigationTarget(ctx, activeValue, key) ?? activeValue;
            setMultiselectActiveValue(ctx, targetValue);
            focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, targetValue, getFocusTargetFromEvent(event));
            return false;
          }
          const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, activeValue, key);
          if (!typeaheadTarget) {
            return void 0;
          }
          event?.preventDefault?.();
          setMultiselectActiveValue(ctx, typeaheadTarget);
          focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, typeaheadTarget, getFocusTargetFromEvent(event));
          return false;
        }, "onKeyDown")
      }, omitPopoverLayoutProps(props)), children2);
    }, "multiselect_content"),
    multiselect_item: /* @__PURE__ */ __name((value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_item");
      const ctx = frameManager.useContext(multiselectContext);
      const open = ctx.open.get();
      const selectedValues = readStringSelection(ctx.values.get());
      const selected = selectedValues.includes(value);
      const itemId = getMultiselectItemId(ctx, value);
      return coerceRenderableToVNode(frameManager.withContext(multiselectItemContext, {
        value,
        itemId,
        selected
      }, () => {
        const resolvedChildren = resolveChildrenInput(renderChildren);
        registerMultiselectValue(ctx, value, getTextLabel(resolvedChildren));
        const active = getMultiselectActiveValue(ctx);
        const shouldAutoFocus = open && active === value;
        return vnodeElement("button", mergeProps({
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
          onClick: /* @__PURE__ */ __name(() => {
            setMultiselectActiveValue(ctx, value);
            toggleMultiselectValue(ctx, value);
          }, "onClick"),
          onMouseEnter: /* @__PURE__ */ __name(() => {
            setMultiselectActiveValue(ctx, value);
          }, "onMouseEnter"),
          onFocus: /* @__PURE__ */ __name(() => {
            setMultiselectActiveValue(ctx, value);
          }, "onFocus"),
          onKeyDown: /* @__PURE__ */ __name((event) => {
            const key = String(event?.key ?? "");
            if (key === "Escape") {
              event?.preventDefault?.();
              closeMultiselect(ctx);
              return false;
            }
            if (key === "Tab") {
              ctx.open.set(false);
              return void 0;
            }
            if (key === "Enter" || key === " ") {
              event?.preventDefault?.();
              setMultiselectActiveValue(ctx, value);
              toggleMultiselectValue(ctx, value);
              return false;
            }
            if (key === "Home") {
              event?.preventDefault?.();
              const firstValue = ctx.order[0] ?? value;
              setMultiselectActiveValue(ctx, firstValue);
              focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, firstValue, getFocusTargetFromEvent(event));
              return false;
            }
            if (key === "End") {
              event?.preventDefault?.();
              const lastValue = ctx.order[ctx.order.length - 1] ?? value;
              setMultiselectActiveValue(ctx, lastValue);
              focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, lastValue, getFocusTargetFromEvent(event));
              return false;
            }
            const nextValue = getMultiselectNavigationTarget(ctx, value, key);
            if (nextValue) {
              event?.preventDefault?.();
              setMultiselectActiveValue(ctx, nextValue);
              focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, nextValue, getFocusTargetFromEvent(event));
              return false;
            }
            const typeaheadTarget = getMultiselectTypeaheadTarget(ctx, value, key);
            if (!typeaheadTarget) return void 0;
            event?.preventDefault?.();
            setMultiselectActiveValue(ctx, typeaheadTarget);
            focusMultiselectItem(getFocusTargetFromEvent(event)?.ownerDocument, ctx, typeaheadTarget, getFocusTargetFromEvent(event));
            return false;
          }, "onKeyDown")
        }, props), resolvedChildren);
      }));
    }, "multiselect_item"),
    multiselect_indicator: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.multiselect_indicator");
      const ctx = frameManager.useContext(multiselectItemContext);
      return vnodeElement("span", mergeProps({
        id: getMultiselectIndicatorId(ctx.itemId),
        "aria-hidden": "true",
        hidden: !ctx.selected,
        "data-lumina-multiselect-indicator": "true",
        "data-state": ctx.selected ? "checked" : "unchecked"
      }, props), children2);
    }, "multiselect_indicator"),
    checkbox_root: /* @__PURE__ */ __name((checked, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.checkbox_root");
      return coerceRenderableToVNode(frameManager.withContext(checkboxContext, {
        checked,
        baseId: getCheckboxBaseId(checked)
      }, () => {
        const ctx = frameManager.useContext(checkboxContext);
        const current = ctx.checked.get();
        const { rootId, indicatorId } = getCheckboxIds(ctx);
        return vnodeElement("button", mergeProps({
          type: "button",
          id: rootId,
          role: "checkbox",
          "aria-checked": current ? "true" : "false",
          "aria-controls": indicatorId,
          tabIndex: 0,
          "data-lumina-checkbox-root": "true",
          "data-state": current ? "checked" : "unchecked",
          onClick: /* @__PURE__ */ __name(() => {
            ctx.checked.set(!ctx.checked.get());
          }, "onClick"),
          onKeyDown: /* @__PURE__ */ __name((event) => {
            const key = String(event?.key ?? "");
            if (key !== "Enter" && key !== " ") return void 0;
            event?.preventDefault?.();
            ctx.checked.set(!ctx.checked.get());
            return false;
          }, "onKeyDown")
        }, props), resolveChildrenInput(renderChildren));
      }));
    }, "checkbox_root"),
    checkbox_indicator: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.checkbox_indicator");
      const ctx = frameManager.useContext(checkboxContext);
      const current = ctx.checked.get();
      const { indicatorId } = getCheckboxIds(ctx);
      return vnodeElement("span", mergeProps({
        id: indicatorId,
        "aria-hidden": "true",
        hidden: !current,
        "data-lumina-checkbox-indicator": "true",
        "data-state": current ? "checked" : "unchecked"
      }, props), children2);
    }, "checkbox_indicator"),
    radio_group: /* @__PURE__ */ __name((value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.radio_group");
      return coerceRenderableToVNode(frameManager.withContext(radioGroupContext, {
        value,
        baseId: getRadioBaseId(value),
        order: []
      }, () => vnodeElement("div", mergeProps({
        role: "radiogroup",
        "data-lumina-radio-group": "true"
      }, props), resolveChildrenInput(renderChildren))));
    }, "radio_group"),
    radio_item: /* @__PURE__ */ __name((value, props, renderChildren) => {
      const frameManager = options.requireActiveFrameManager("render.radio_item");
      const ctx = frameManager.useContext(radioGroupContext);
      registerRadioValue(ctx, value);
      const selected = ctx.value.get() === value;
      const itemId = getRadioItemId(ctx, value);
      return coerceRenderableToVNode(frameManager.withContext(radioItemContext, {
        value,
        itemId,
        selected
      }, () => vnodeElement("button", mergeProps({
        type: "button",
        id: itemId,
        role: "radio",
        "aria-checked": selected ? "true" : "false",
        tabIndex: selected ? 0 : -1,
        "data-lumina-radio-item": "true",
        "data-state": selected ? "checked" : "unchecked",
        onClick: /* @__PURE__ */ __name(() => {
          ctx.value.set(value);
        }, "onClick"),
        onKeyDown: /* @__PURE__ */ __name((event) => {
          const key = String(event?.key ?? "");
          if (key === "Enter" || key === " ") {
            event?.preventDefault?.();
            ctx.value.set(value);
            return false;
          }
          const nextValue = getRadioNavigationTarget(ctx, value, key);
          if (!nextValue) return void 0;
          event?.preventDefault?.();
          ctx.value.set(nextValue);
          const focusTarget = getFocusTargetFromEvent(event);
          focusRadioItem(focusTarget?.ownerDocument, ctx, nextValue, focusTarget?.parentNode ?? null);
          return false;
        }, "onKeyDown")
      }, props), resolveChildrenInput(renderChildren))));
    }, "radio_item"),
    radio_indicator: /* @__PURE__ */ __name((props, children2 = []) => {
      const frameManager = options.requireActiveFrameManager("render.radio_indicator");
      const ctx = frameManager.useContext(radioItemContext);
      return vnodeElement("span", mergeProps({
        id: getRadioIndicatorId(ctx.itemId),
        "aria-hidden": "true",
        hidden: !ctx.selected,
        "data-lumina-radio-indicator": "true",
        "data-state": ctx.selected ? "checked" : "unchecked"
      }, props), children2);
    }, "radio_indicator")
  };
  return api;
}, "createHeadlessPrimitivesRuntime");

// src/runtime/system-runtime.ts
var blockedHttpHosts = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254"
]);
var isPrivateIpv4Host = /* @__PURE__ */ __name((host) => {
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
}, "isPrivateIpv4Host");
var validateHttpUrl = /* @__PURE__ */ __name((rawUrl) => {
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
}, "validateHttpUrl");
var hasOpfsSupport = /* @__PURE__ */ __name(() => {
  const nav = globalThis.navigator;
  return typeof nav?.storage?.getDirectory === "function";
}, "hasOpfsSupport");
var getOpfsRoot = /* @__PURE__ */ __name(async () => {
  const nav = globalThis.navigator;
  const getter = nav?.storage?.getDirectory;
  if (typeof getter !== "function") {
    throw new Error("OPFS is not available in this environment");
  }
  return await getter.call(nav.storage);
}, "getOpfsRoot");
var opfsError = /* @__PURE__ */ __name((error) => {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}, "opfsError");
var isOpfsNotFoundError = /* @__PURE__ */ __name((error) => !!error && typeof error === "object" && (error.name === "NotFoundError" || error.code === "ENOENT"), "isOpfsNotFoundError");
var splitOpfsPath = /* @__PURE__ */ __name((path2) => String(path2).replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== "."), "splitOpfsPath");
var walkOpfsDirectory = /* @__PURE__ */ __name(async (segments, create) => {
  let current = await getOpfsRoot();
  for (const segment of segments) {
    if (segment === "..") {
      throw new Error("OPFS path traversal is not supported");
    }
    current = await current.getDirectoryHandle(segment, {
      create
    });
  }
  return current;
}, "walkOpfsDirectory");
var resolveOpfsParent = /* @__PURE__ */ __name(async (path2, createParent) => {
  const segments = splitOpfsPath(path2);
  if (segments.length === 0) {
    throw new Error("Path must not be empty");
  }
  const name = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const directory = await walkOpfsDirectory(parentSegments, createParent);
  return {
    directory,
    name
  };
}, "resolveOpfsParent");
var isLikelyRemotePath = /* @__PURE__ */ __name((path2) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path2) || path2.startsWith("//"), "isLikelyRemotePath");
var getMonotonicNow = /* @__PURE__ */ __name(() => {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}, "getMonotonicNow");
var compileRegex = /* @__PURE__ */ __name((pattern, flags = "") => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}, "compileRegex");
var toHex = /* @__PURE__ */ __name((bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""), "toHex");
var toBase64 = /* @__PURE__ */ __name((bytes) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}, "toBase64");
var fromBase64 = /* @__PURE__ */ __name((value) => {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}, "fromBase64");
var getWebCrypto = /* @__PURE__ */ __name(async () => {
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
}, "getWebCrypto");
var utf8Encode = /* @__PURE__ */ __name((value) => new TextEncoder().encode(value), "utf8Encode");
var utf8Decode = /* @__PURE__ */ __name((value) => new TextDecoder().decode(value), "utf8Decode");
var deriveAesKey = /* @__PURE__ */ __name(async (web, key, usage) => {
  const digest = await web.subtle.digest("SHA-256", utf8Encode(key));
  return await web.subtle.importKey("raw", digest, {
    name: "AES-GCM"
  }, false, [
    usage
  ]);
}, "deriveAesKey");
var toIterableValues2 = /* @__PURE__ */ __name((value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const iteratorFn = value[Symbol.iterator];
    if (typeof iteratorFn === "function") {
      return Array.from(value);
    }
  }
  return [];
}, "toIterableValues");
var createSystemRuntime = /* @__PURE__ */ __name((deps) => {
  const toJsonValue = /* @__PURE__ */ __name((value, seen) => {
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
        return payload === void 0 ? {
          $tag: tag
        } : {
          $tag: tag,
          $payload: toJsonValue(payload, seen)
        };
      }
      const entries = Object.entries(value).map(([key, val]) => [
        key,
        toJsonValue(val, seen)
      ]);
      return Object.fromEntries(entries);
    }
    return String(value);
  }, "toJsonValue");
  const toJsonString2 = /* @__PURE__ */ __name((value, pretty = true) => {
    const normalized = toJsonValue(value, /* @__PURE__ */ new WeakSet());
    return JSON.stringify(normalized, null, pretty ? 2 : void 0);
  }, "toJsonString");
  const resultOk = /* @__PURE__ */ __name((value) => deps.getResult().Ok(value), "resultOk");
  const resultErr = /* @__PURE__ */ __name((message) => deps.getResult().Err(message), "resultErr");
  const optionSome = /* @__PURE__ */ __name((value) => deps.getOption().Some(value), "optionSome");
  const optionNone = /* @__PURE__ */ __name(() => deps.getOption().None, "optionNone");
  const renderArgs = /* @__PURE__ */ __name((args) => args.map((arg) => deps.formatValue(arg)).join(" "), "renderArgs");
  const writeStdout = /* @__PURE__ */ __name((text2, newline) => {
    if (isNodeRuntime()) {
      const stdout = getNodeProcess()?.stdout;
      if (stdout?.write) {
        stdout.write(text2 + (newline ? "\n" : ""));
        return;
      }
    }
    console.log(text2);
  }, "writeStdout");
  const writeStderr = /* @__PURE__ */ __name((text2, newline) => {
    if (isNodeRuntime()) {
      const stderr = getNodeProcess()?.stderr;
      if (stderr?.write) {
        stderr.write(text2 + (newline ? "\n" : ""));
        return;
      }
    }
    console.error(text2);
  }, "writeStderr");
  let stdinCache = null;
  let stdinIndex = 0;
  const readStdinLines = /* @__PURE__ */ __name(() => {
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
  }, "readStdinLines");
  const unwrapOption = /* @__PURE__ */ __name((value) => {
    if (deps.isEnumLike(value)) {
      const tag = deps.getEnumTag(value);
      if (tag === "Some") return {
        isSome: true,
        value: deps.getEnumPayload(value)
      };
      if (tag === "None") return {
        isSome: false
      };
    }
    return {
      isSome: true,
      value
    };
  }, "unwrapOption");
  const opfsReadFile = /* @__PURE__ */ __name(async (path3) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, false);
      const handle = await directory.getFileHandle(name, {
        create: false
      });
      const file = await handle.getFile();
      const content = await file.text();
      return resultOk(content);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  }, "opfsReadFile");
  const opfsWriteFile = /* @__PURE__ */ __name(async (path3, content) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, true);
      const handle = await directory.getFileHandle(name, {
        create: true
      });
      const writable = await handle.createWritable();
      await writable.write(String(content));
      await writable.close();
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  }, "opfsWriteFile");
  const opfsReadDir = /* @__PURE__ */ __name(async (path3) => {
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
  }, "opfsReadDir");
  const opfsMetadata = /* @__PURE__ */ __name(async (path3) => {
    try {
      const segments = splitOpfsPath(path3);
      if (segments.length === 0) {
        return resultOk({
          isFile: false,
          isDirectory: true,
          size: 0,
          modifiedMs: 0
        });
      }
      const { directory, name } = await resolveOpfsParent(path3, false);
      try {
        const fileHandle = await directory.getFileHandle(name, {
          create: false
        });
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
      const dirHandle = await directory.getDirectoryHandle(name, {
        create: false
      });
      if (dirHandle) {
        return resultOk({
          isFile: false,
          isDirectory: true,
          size: 0,
          modifiedMs: 0
        });
      }
      return resultErr(`Entry not found: ${path3}`);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  }, "opfsMetadata");
  const opfsExists = /* @__PURE__ */ __name(async (path3) => {
    try {
      const meta = await opfsMetadata(path3);
      return deps.isEnumLike(meta) && deps.getEnumTag(meta) === "Ok";
    } catch {
      return false;
    }
  }, "opfsExists");
  const opfsMkdir = /* @__PURE__ */ __name(async (path3, recursive = true) => {
    try {
      const segments = splitOpfsPath(path3);
      if (segments.length === 0) return resultOk(void 0);
      if (recursive) {
        await walkOpfsDirectory(segments, true);
        return resultOk(void 0);
      }
      const parentSegments = segments.slice(0, -1);
      const parent = await walkOpfsDirectory(parentSegments, false);
      await parent.getDirectoryHandle(segments[segments.length - 1], {
        create: true
      });
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  }, "opfsMkdir");
  const opfsRemoveFile = /* @__PURE__ */ __name(async (path3) => {
    try {
      const { directory, name } = await resolveOpfsParent(path3, false);
      await directory.removeEntry(name, {
        recursive: false
      });
      return resultOk(void 0);
    } catch (error) {
      return resultErr(opfsError(error));
    }
  }, "opfsRemoveFile");
  const io2 = {
    print: /* @__PURE__ */ __name((...args) => {
      writeStdout(renderArgs(args), false);
    }, "print"),
    println: /* @__PURE__ */ __name((...args) => {
      writeStdout(renderArgs(args), true);
    }, "println"),
    eprint: /* @__PURE__ */ __name((...args) => {
      writeStderr(renderArgs(args), false);
    }, "eprint"),
    eprintln: /* @__PURE__ */ __name((...args) => {
      writeStderr(renderArgs(args), true);
    }, "eprintln"),
    readLine: /* @__PURE__ */ __name(() => {
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
    }, "readLine"),
    readLineAsync: /* @__PURE__ */ __name(async () => {
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
    }, "readLineAsync"),
    printJson: /* @__PURE__ */ __name((value, pretty = true) => {
      console.log(toJsonString2(value, pretty));
    }, "printJson")
  };
  const str2 = {
    length: /* @__PURE__ */ __name((value) => value.length, "length"),
    concat: /* @__PURE__ */ __name((a, b) => a + b, "concat"),
    substring: /* @__PURE__ */ __name((value, start, end) => {
      const safeStart = Math.max(0, Math.trunc(start));
      const safeEnd = Math.max(safeStart, Math.trunc(end));
      return value.substring(safeStart, safeEnd);
    }, "substring"),
    slice: /* @__PURE__ */ __name((value, range) => {
      const start = range?.start ?? void 0;
      const end = range?.end ?? void 0;
      return value.slice(start ?? void 0, range?.inclusive && end !== void 0 ? end + 1 : end ?? void 0);
    }, "slice"),
    split: /* @__PURE__ */ __name((value, sep) => value.split(sep), "split"),
    trim: /* @__PURE__ */ __name((value) => value.trim(), "trim"),
    contains: /* @__PURE__ */ __name((haystack, needle) => haystack.includes(needle), "contains"),
    eq: /* @__PURE__ */ __name((a, b) => a === b, "eq"),
    char_at: /* @__PURE__ */ __name((value, index) => {
      if (Number.isNaN(index) || index < 0 || index >= value.length) return optionNone();
      return optionSome(value.charAt(index));
    }, "char_at"),
    is_whitespace: /* @__PURE__ */ __name((value) => value === " " || value === "\n" || value === "	" || value === "\r", "is_whitespace"),
    is_digit: /* @__PURE__ */ __name((value) => {
      if (!value || value.length === 0) return false;
      const code = value.charCodeAt(0);
      return code >= 48 && code <= 57;
    }, "is_digit"),
    to_int: /* @__PURE__ */ __name((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) ? resultErr(`Invalid int: ${value}`) : resultOk(parsed);
    }, "to_int"),
    to_float: /* @__PURE__ */ __name((value) => {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? resultErr(`Invalid float: ${value}`) : resultOk(parsed);
    }, "to_float"),
    from_int: /* @__PURE__ */ __name((value) => String(Math.trunc(value)), "from_int"),
    from_float: /* @__PURE__ */ __name((value) => String(value), "from_float")
  };
  const math2 = {
    abs: /* @__PURE__ */ __name((value) => Math.abs(value), "abs"),
    min: /* @__PURE__ */ __name((a, b) => Math.min(a, b), "min"),
    max: /* @__PURE__ */ __name((a, b) => Math.max(a, b), "max"),
    absf: /* @__PURE__ */ __name((value) => Math.abs(value), "absf"),
    minf: /* @__PURE__ */ __name((a, b) => Math.min(a, b), "minf"),
    maxf: /* @__PURE__ */ __name((a, b) => Math.max(a, b), "maxf"),
    sqrt: /* @__PURE__ */ __name((value) => Math.sqrt(value), "sqrt"),
    pow: /* @__PURE__ */ __name((base, exp) => Math.pow(base, exp), "pow"),
    powf: /* @__PURE__ */ __name((base, exp) => Math.pow(base, exp), "powf"),
    floor: /* @__PURE__ */ __name((value) => Math.floor(value), "floor"),
    ceil: /* @__PURE__ */ __name((value) => Math.ceil(value), "ceil"),
    round: /* @__PURE__ */ __name((value) => Math.round(value), "round"),
    pi: Math.PI,
    e: Math.E
  };
  const opfs2 = {
    is_available: /* @__PURE__ */ __name(() => hasOpfsSupport(), "is_available"),
    readFile: /* @__PURE__ */ __name(async (path3) => opfsReadFile(path3), "readFile"),
    writeFile: /* @__PURE__ */ __name(async (path3, content) => opfsWriteFile(path3, content), "writeFile"),
    readDir: /* @__PURE__ */ __name(async (path3) => opfsReadDir(path3), "readDir"),
    metadata: /* @__PURE__ */ __name(async (path3) => opfsMetadata(path3), "metadata"),
    exists: /* @__PURE__ */ __name(async (path3) => opfsExists(path3), "exists"),
    mkdir: /* @__PURE__ */ __name(async (path3, recursive = true) => opfsMkdir(path3, recursive), "mkdir"),
    removeFile: /* @__PURE__ */ __name(async (path3) => opfsRemoveFile(path3), "removeFile")
  };
  const fs2 = {
    readFile: /* @__PURE__ */ __name(async (path3) => {
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
    }, "readFile"),
    writeFile: /* @__PURE__ */ __name(async (path3, content) => {
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
    }, "writeFile"),
    readDir: /* @__PURE__ */ __name(async (path3) => {
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
    }, "readDir"),
    metadata: /* @__PURE__ */ __name(async (path3) => {
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
    }, "metadata"),
    exists: /* @__PURE__ */ __name(async (path3) => {
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
    }, "exists"),
    mkdir: /* @__PURE__ */ __name(async (path3, recursive = true) => {
      try {
        if (isNodeRuntime()) {
          const fsPromises = await import("fs/promises");
          await fsPromises.mkdir(path3, {
            recursive: !!recursive
          });
          return resultOk(void 0);
        }
        if (opfs2.is_available()) {
          return await opfs2.mkdir(path3, recursive);
        }
        return resultErr("mkdir is not supported in browser");
      } catch (error) {
        return resultErr(String(error));
      }
    }, "mkdir"),
    removeFile: /* @__PURE__ */ __name(async (path3) => {
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
    }, "removeFile")
  };
  const path2 = {
    join: /* @__PURE__ */ __name((left, right) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.join(String(left), String(right)) : joinPathBasic(String(left), String(right));
    }, "join"),
    is_absolute: /* @__PURE__ */ __name((value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.isAbsolute(String(value)) : isAbsolutePathBasic(String(value));
    }, "is_absolute"),
    extension: /* @__PURE__ */ __name((value) => {
      const nodePath = getNodePath();
      const ext = nodePath ? nodePath.extname(String(value)) : extnamePathBasic(String(value));
      if (!ext) return optionNone();
      return optionSome(ext.startsWith(".") ? ext.slice(1) : ext);
    }, "extension"),
    dirname: /* @__PURE__ */ __name((value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.dirname(String(value)) : dirnamePathBasic(String(value));
    }, "dirname"),
    basename: /* @__PURE__ */ __name((value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.basename(String(value)) : basenamePathBasic(String(value));
    }, "basename"),
    normalize: /* @__PURE__ */ __name((value) => {
      const nodePath = getNodePath();
      return nodePath ? nodePath.normalize(String(value)) : normalizePathBasic(String(value));
    }, "normalize")
  };
  const env2 = {
    var: /* @__PURE__ */ __name((name) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      const value = nodeProcess.env?.[String(name)];
      if (value === void 0) {
        return resultErr(`Environment variable '${name}' is not set`);
      }
      return resultOk(String(value));
    }, "var"),
    set_var: /* @__PURE__ */ __name((name, value) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      nodeProcess.env[String(name)] = String(value);
      return resultOk(void 0);
    }, "set_var"),
    remove_var: /* @__PURE__ */ __name((name) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Environment variables are not available in this runtime");
      }
      delete nodeProcess.env[String(name)];
      return resultOk(void 0);
    }, "remove_var"),
    args: /* @__PURE__ */ __name(() => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return [];
      return nodeProcess.argv.slice(2);
    }, "args"),
    cwd: /* @__PURE__ */ __name(() => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) {
        return resultErr("Current working directory is not available in this runtime");
      }
      return resultOk(nodeProcess.cwd());
    }, "cwd")
  };
  const processRuntime = {
    spawn: /* @__PURE__ */ __name((command, args = []) => {
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
    }, "spawn"),
    exit: /* @__PURE__ */ __name((code = 0) => {
      const nodeProcess = getNodeProcess();
      if (!nodeProcess) return;
      nodeProcess.exit(Math.trunc(code));
    }, "exit"),
    cwd: /* @__PURE__ */ __name(() => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? nodeProcess.cwd() : "";
    }, "cwd"),
    pid: /* @__PURE__ */ __name(() => {
      const nodeProcess = getNodeProcess();
      return nodeProcess ? Math.trunc(nodeProcess.pid) : -1;
    }, "pid")
  };
  const json2 = {
    to_string: /* @__PURE__ */ __name((value) => {
      try {
        return resultOk(JSON.stringify(value));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    }, "to_string"),
    to_pretty_string: /* @__PURE__ */ __name((value) => {
      try {
        return resultOk(toJsonString2(value, true));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    }, "to_pretty_string"),
    from_string: /* @__PURE__ */ __name((source) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    }, "from_string"),
    parse: /* @__PURE__ */ __name((source) => {
      try {
        return resultOk(JSON.parse(String(source)));
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error));
      }
    }, "parse")
  };
  const http2 = {
    fetch: /* @__PURE__ */ __name(async (request) => {
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
        const response = await fetch(url2, {
          method,
          headers,
          body
        });
        const text2 = await response.text();
        const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({
          name,
          value
        }));
        return resultOk({
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: text2
        });
      } catch (error) {
        return resultErr(String(error));
      }
    }, "fetch"),
    get: /* @__PURE__ */ __name(async (url2) => await http2.fetch({
      url: url2,
      method: "GET",
      headers: optionNone(),
      body: optionNone()
    }), "get"),
    post: /* @__PURE__ */ __name(async (url2, body) => await http2.fetch({
      url: url2,
      method: "POST",
      headers: optionNone(),
      body: body === void 0 ? optionNone() : optionSome(typeof body === "string" ? body : JSON.stringify(body))
    }), "post"),
    put: /* @__PURE__ */ __name(async (url2, body) => await http2.fetch({
      url: url2,
      method: "PUT",
      headers: optionNone(),
      body: body === void 0 ? optionNone() : optionSome(typeof body === "string" ? body : JSON.stringify(body))
    }), "put"),
    del: /* @__PURE__ */ __name(async (url2) => await http2.fetch({
      url: url2,
      method: "DELETE",
      headers: optionNone(),
      body: optionNone()
    }), "del")
  };
  const time2 = {
    nowMs: /* @__PURE__ */ __name(() => Math.trunc(Date.now()), "nowMs"),
    nowIso: /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso"),
    instantNow: /* @__PURE__ */ __name(() => Math.trunc(getMonotonicNow()), "instantNow"),
    elapsedMs: /* @__PURE__ */ __name((since) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)), "elapsedMs"),
    sleep: /* @__PURE__ */ __name(async (ms) => await new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Math.trunc(ms)));
    }), "sleep")
  };
  const regex2 = {
    isValid: /* @__PURE__ */ __name((pattern, flags = "") => compileRegex(pattern, flags) !== null, "isValid"),
    test: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(re.test(text2));
    }, "test"),
    find: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return optionNone();
      const match = text2.match(re);
      if (!match) return optionNone();
      return optionSome(match[0]);
    }, "find"),
    findAll: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
      const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
      const re = compileRegex(pattern, normalizedFlags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${normalizedFlags}`);
      const matches = Array.from(text2.matchAll(re)).map((m) => m[0]);
      return resultOk(matches);
    }, "findAll"),
    replace: /* @__PURE__ */ __name((pattern, text2, replacement, flags = "") => {
      const re = compileRegex(pattern, flags);
      if (!re) return resultErr(`Invalid regex: /${pattern}/${flags}`);
      return resultOk(text2.replace(re, replacement));
    }, "replace")
  };
  const crypto2 = {
    isAvailable: /* @__PURE__ */ __name(async () => await getWebCrypto() !== null, "isAvailable"),
    sha256: /* @__PURE__ */ __name(async (value) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const digest = await web.subtle.digest("SHA-256", utf8Encode(value));
        return resultOk(toHex(new Uint8Array(digest)));
      } catch (error) {
        return resultErr(String(error));
      }
    }, "sha256"),
    hmacSha256: /* @__PURE__ */ __name(async (key, value) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const cryptoKey = await web.subtle.importKey("raw", utf8Encode(key), {
          name: "HMAC",
          hash: "SHA-256"
        }, false, [
          "sign"
        ]);
        const signature = await web.subtle.sign("HMAC", cryptoKey, utf8Encode(value));
        return resultOk(toHex(new Uint8Array(signature)));
      } catch (error) {
        return resultErr(String(error));
      }
    }, "hmacSha256"),
    randomBytes: /* @__PURE__ */ __name(async (length) => {
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
    }, "randomBytes"),
    randomInt: /* @__PURE__ */ __name(async (min, max) => {
      const lower = Math.trunc(Math.min(min, max));
      const upper = Math.trunc(Math.max(min, max));
      const span = upper - lower + 1;
      if (span <= 0) return resultErr("Invalid range");
      const random = await crypto2.randomBytes(4);
      if (!deps.isEnumLike(random) || deps.getEnumTag(random) !== "Ok") return random;
      const bytes = deps.getEnumPayload(random);
      if (!Array.isArray(bytes) || bytes.length < 4) return resultErr("Failed to generate randomness");
      const packed = new Uint8Array([
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3]
      ]);
      const value = new DataView(packed.buffer).getUint32(0, false);
      return resultOk(lower + value % span);
    }, "randomInt"),
    aesGcmEncrypt: /* @__PURE__ */ __name(async (key, plaintext) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const aesKey = await deriveAesKey(web, key, "encrypt");
        const iv = new Uint8Array(12);
        web.getRandomValues(iv);
        const encrypted = await web.subtle.encrypt({
          name: "AES-GCM",
          iv
        }, aesKey, utf8Encode(plaintext));
        const cipherBytes = new Uint8Array(encrypted);
        const packed = new Uint8Array(iv.length + cipherBytes.length);
        packed.set(iv, 0);
        packed.set(cipherBytes, iv.length);
        return resultOk(toBase64(packed));
      } catch (error) {
        return resultErr(String(error));
      }
    }, "aesGcmEncrypt"),
    aesGcmDecrypt: /* @__PURE__ */ __name(async (key, payloadBase64) => {
      try {
        const web = await getWebCrypto();
        if (!web) return resultErr("Crypto API is not available");
        const packed = fromBase64(payloadBase64);
        if (packed.length < 13) return resultErr("Invalid AES payload");
        const iv = packed.slice(0, 12);
        const cipher = packed.slice(12);
        const aesKey = await deriveAesKey(web, key, "decrypt");
        const plain = await web.subtle.decrypt({
          name: "AES-GCM",
          iv
        }, aesKey, cipher);
        return resultOk(utf8Decode(new Uint8Array(plain)));
      } catch (error) {
        return resultErr(String(error));
      }
    }, "aesGcmDecrypt")
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
}, "createSystemRuntime");

// src/runtime/headless-ui-runtime.ts
var createSignalBaseIdResolver = /* @__PURE__ */ __name((prefix) => {
  const ids = /* @__PURE__ */ new WeakMap();
  let nextId = 1;
  return (signal) => {
    const key = signal;
    const existing = ids.get(key);
    if (existing) return existing;
    const next = `${prefix}-${nextId++}`;
    ids.set(key, next);
    return next;
  };
}, "createSignalBaseIdResolver");
var registerOrderedValue = /* @__PURE__ */ __name((order, value) => {
  if (!order.includes(value)) {
    order.push(value);
  }
}, "registerOrderedValue");
var getTypeaheadLabels = /* @__PURE__ */ __name((labelsMap, keyObject) => {
  const existing = labelsMap.get(keyObject);
  if (existing) return existing;
  const created = /* @__PURE__ */ new Map();
  labelsMap.set(keyObject, created);
  return created;
}, "getTypeaheadLabels");
var registerTypeaheadLabel = /* @__PURE__ */ __name((labelsMap, keyObject, value, label) => {
  const normalized = String(label ?? "").trim();
  if (!normalized) return;
  getTypeaheadLabels(labelsMap, keyObject).set(value, normalized);
}, "registerTypeaheadLabel");
var getWrappedNavigationTarget = /* @__PURE__ */ __name((order, current, key, forwardKeys, backwardKeys) => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));
  if (key === "Home") {
    return order[0] ?? null;
  }
  if (key === "End") {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key)) {
    return order[(currentIndex + 1) % order.length] ?? null;
  }
  if (backwardKeys.includes(key)) {
    return order[(currentIndex - 1 + order.length) % order.length] ?? null;
  }
  return null;
}, "getWrappedNavigationTarget");
var getClampedNavigationTarget = /* @__PURE__ */ __name((order, current, key, forwardKeys, backwardKeys) => {
  if (order.length === 0) return null;
  const currentIndex = Math.max(0, order.indexOf(current));
  if (key === "Home") {
    return order[0] ?? null;
  }
  if (key === "End") {
    return order[order.length - 1] ?? null;
  }
  if (forwardKeys.includes(key)) {
    return order[Math.min(currentIndex + 1, order.length - 1)] ?? null;
  }
  if (backwardKeys.includes(key)) {
    return order[Math.max(currentIndex - 1, 0)] ?? null;
  }
  return null;
}, "getClampedNavigationTarget");
var restoreFocusFromMap = /* @__PURE__ */ __name((ctx, targets) => {
  const key = ctx.open;
  const target = targets.get(key);
  if (!target || typeof target.focus !== "function") return;
  targets.delete(key);
  target.focus();
}, "restoreFocusFromMap");
var setMapTarget = /* @__PURE__ */ __name((ctx, map, value) => {
  const key = ctx.open;
  if (value == null) {
    map.delete(key);
    return;
  }
  map.set(key, value);
}, "setMapTarget");
var focusElementById = /* @__PURE__ */ __name((documentLike, targetId, fallbackRoot) => {
  const target = (documentLike && typeof documentLike.getElementById === "function" ? documentLike.getElementById(targetId) : null) ?? findDomElementById(fallbackRoot, targetId);
  if (!target || typeof target.focus !== "function") return false;
  target.focus();
  return true;
}, "focusElementById");
var readNumericRectValue = /* @__PURE__ */ __name((value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}, "readNumericRectValue");
var readAnchorRect = /* @__PURE__ */ __name((ctx, anchors) => {
  const anchor = anchors.get(ctx.open);
  if (!anchor || typeof anchor.getBoundingClientRect !== "function") return null;
  const raw = anchor.getBoundingClientRect();
  const left = readNumericRectValue(raw?.left) ?? 0;
  const top = readNumericRectValue(raw?.top) ?? 0;
  const right = readNumericRectValue(raw?.right) ?? left;
  const bottom = readNumericRectValue(raw?.bottom) ?? top;
  const width = readNumericRectValue(raw?.width) ?? Math.max(0, right - left);
  const height = readNumericRectValue(raw?.height) ?? Math.max(0, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height
  };
}, "readAnchorRect");
var clearTimerHandle = /* @__PURE__ */ __name((handle) => {
  if (handle !== void 0 && typeof globalThis.clearTimeout === "function") {
    globalThis.clearTimeout(handle);
  }
}, "clearTimerHandle");
var TYPEAHEAD_RESET_MS = 700;
var isPrintableTypeaheadKey = /* @__PURE__ */ __name((key) => key.length === 1 && key.trim().length > 0, "isPrintableTypeaheadKey");
var updateTypeaheadBuffer = /* @__PURE__ */ __name((state2, key) => {
  const normalizedKey = key.toLowerCase();
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
}, "updateTypeaheadBuffer");
var getTypeaheadTarget = /* @__PURE__ */ __name((stateMap, keyObject, order, labels, current, key) => {
  if (!isPrintableTypeaheadKey(key) || order.length === 0) return null;
  const nextState = updateTypeaheadBuffer(stateMap.get(keyObject), key);
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
}, "getTypeaheadTarget");
var createHeadlessUiRuntime = /* @__PURE__ */ __name(() => {
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
  const normalizeTabsPart = /* @__PURE__ */ __name((value) => {
    const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized.length > 0 ? normalized : "tab";
  }, "normalizeTabsPart");
  const getTabsIds = /* @__PURE__ */ __name((ctx, value) => {
    const part = normalizeTabsPart(value);
    return {
      triggerId: `${ctx.baseId}-trigger-${part}`,
      panelId: `${ctx.baseId}-panel-${part}`
    };
  }, "getTabsIds");
  const registerTabsValue = /* @__PURE__ */ __name((ctx, value) => {
    registerOrderedValue(ctx.order, value);
  }, "registerTabsValue");
  const getTabsNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getWrappedNavigationTarget(ctx.order, current, key, [
    "ArrowRight",
    "ArrowDown"
  ], [
    "ArrowLeft",
    "ArrowUp"
  ]), "getTabsNavigationTarget");
  const getDialogIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`
  }), "getDialogIds");
  const getPopoverIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  }), "getPopoverIds");
  const getTooltipIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  }), "getTooltipIds");
  const getToastIds = /* @__PURE__ */ __name((ctx) => ({
    contentId: `${ctx.baseId}-content`,
    titleId: `${ctx.baseId}-title`,
    descriptionId: `${ctx.baseId}-description`
  }), "getToastIds");
  const getMenuIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  }), "getMenuIds");
  const getSelectIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  }), "getSelectIds");
  const getComboboxIds = /* @__PURE__ */ __name((ctx) => ({
    inputId: `${ctx.baseId}-input`,
    contentId: `${ctx.baseId}-content`
  }), "getComboboxIds");
  const getMultiselectIds = /* @__PURE__ */ __name((ctx) => ({
    triggerId: `${ctx.baseId}-trigger`,
    contentId: `${ctx.baseId}-content`
  }), "getMultiselectIds");
  const getCheckboxIds = /* @__PURE__ */ __name((ctx) => ({
    rootId: `${ctx.baseId}-root`,
    indicatorId: `${ctx.baseId}-indicator`
  }), "getCheckboxIds");
  const getMenuItemId = /* @__PURE__ */ __name((ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`, "getMenuItemId");
  const getRadioItemId = /* @__PURE__ */ __name((ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`, "getRadioItemId");
  const getSelectItemId = /* @__PURE__ */ __name((ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`, "getSelectItemId");
  const getComboboxItemId = /* @__PURE__ */ __name((ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`, "getComboboxItemId");
  const getMultiselectItemId = /* @__PURE__ */ __name((ctx, value) => `${ctx.baseId}-item-${normalizeTabsPart(value)}`, "getMultiselectItemId");
  const getRadioIndicatorId = /* @__PURE__ */ __name((itemId) => `${itemId}-indicator`, "getRadioIndicatorId");
  const getSelectIndicatorId = /* @__PURE__ */ __name((itemId) => `${itemId}-indicator`, "getSelectIndicatorId");
  const getComboboxIndicatorId = /* @__PURE__ */ __name((itemId) => `${itemId}-indicator`, "getComboboxIndicatorId");
  const getMultiselectIndicatorId = /* @__PURE__ */ __name((itemId) => `${itemId}-indicator`, "getMultiselectIndicatorId");
  const setDialogRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, dialogRestoreTargets, target);
  }, "setDialogRestoreTarget");
  const restoreDialogFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, dialogRestoreTargets);
  }, "restoreDialogFocus");
  const setPopoverAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, popoverAnchorTargets, target);
  }, "setPopoverAnchorTarget");
  const setPopoverRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, popoverRestoreTargets, target);
  }, "setPopoverRestoreTarget");
  const restorePopoverFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, popoverRestoreTargets);
  }, "restorePopoverFocus");
  const clearToastTimer = /* @__PURE__ */ __name((signal) => {
    const key = signal;
    clearTimerHandle(toastTimers.get(key));
    toastTimers.delete(key);
  }, "clearToastTimer");
  const scheduleToastTimer = /* @__PURE__ */ __name((ctx, duration) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      clearToastTimer(ctx.open);
      return;
    }
    if (typeof globalThis.setTimeout !== "function") return;
    const key = ctx.open;
    const existing = toastTimers.get(key);
    if (existing !== void 0) return;
    const handle = globalThis.setTimeout(() => {
      toastTimers.delete(key);
      ctx.open.set(false);
    }, duration);
    toastTimers.set(key, handle);
  }, "scheduleToastTimer");
  const setMenuAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, menuAnchorTargets, target);
  }, "setMenuAnchorTarget");
  const setMenuRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, menuRestoreTargets, target);
  }, "setMenuRestoreTarget");
  const restoreMenuFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, menuRestoreTargets);
  }, "restoreMenuFocus");
  const setSelectAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, selectAnchorTargets, target);
  }, "setSelectAnchorTarget");
  const setSelectRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, selectRestoreTargets, target);
  }, "setSelectRestoreTarget");
  const restoreSelectFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, selectRestoreTargets);
  }, "restoreSelectFocus");
  const setComboboxAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, comboboxAnchorTargets, target);
  }, "setComboboxAnchorTarget");
  const setComboboxRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, comboboxRestoreTargets, target);
  }, "setComboboxRestoreTarget");
  const restoreComboboxFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, comboboxRestoreTargets);
  }, "restoreComboboxFocus");
  const setMultiselectAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, multiselectAnchorTargets, target);
  }, "setMultiselectAnchorTarget");
  const setMultiselectRestoreTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, multiselectRestoreTargets, target);
  }, "setMultiselectRestoreTarget");
  const restoreMultiselectFocus = /* @__PURE__ */ __name((ctx) => {
    restoreFocusFromMap(ctx, multiselectRestoreTargets);
  }, "restoreMultiselectFocus");
  const setTooltipAnchorTarget = /* @__PURE__ */ __name((ctx, target) => {
    setMapTarget(ctx, tooltipAnchorTargets, target);
  }, "setTooltipAnchorTarget");
  const registerMenuValue = /* @__PURE__ */ __name((ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(menuTypeaheadLabels, ctx.open, value, label);
  }, "registerMenuValue");
  const getMenuActiveSignal = /* @__PURE__ */ __name((ctx) => {
    const key = ctx.open;
    const existing = menuActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal("");
    menuActiveValues.set(key, created);
    return created;
  }, "getMenuActiveSignal");
  const setMenuActiveValue = /* @__PURE__ */ __name((ctx, value) => {
    getMenuActiveSignal(ctx).set(typeof value === "string" ? value : "");
  }, "setMenuActiveValue");
  const getMenuActiveValue = /* @__PURE__ */ __name((ctx) => {
    const explicit = getMenuActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    return ctx.order[0] ?? explicit ?? "";
  }, "getMenuActiveValue");
  const registerRadioValue = /* @__PURE__ */ __name((ctx, value) => {
    registerOrderedValue(ctx.order, value);
  }, "registerRadioValue");
  const registerSelectValue = /* @__PURE__ */ __name((ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(selectTypeaheadLabels, ctx.value, value, label);
  }, "registerSelectValue");
  const getSelectActiveSignal = /* @__PURE__ */ __name((ctx) => {
    const key = ctx.value;
    const existing = selectActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal("");
    selectActiveValues.set(key, created);
    return created;
  }, "getSelectActiveSignal");
  const setSelectActiveValue = /* @__PURE__ */ __name((ctx, value) => {
    getSelectActiveSignal(ctx).set(typeof value === "string" ? value : "");
  }, "setSelectActiveValue");
  const resolveSelectActiveValue = /* @__PURE__ */ __name((ctx) => {
    const explicit = getSelectActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? "";
  }, "resolveSelectActiveValue");
  const getSelectActiveValue = /* @__PURE__ */ __name((ctx) => resolveSelectActiveValue(ctx), "getSelectActiveValue");
  const getSelectActiveDescendantId = /* @__PURE__ */ __name((ctx) => {
    const activeValue = resolveSelectActiveValue(ctx);
    return activeValue ? getSelectItemId(ctx, activeValue) : null;
  }, "getSelectActiveDescendantId");
  const acceptSelectActiveValue = /* @__PURE__ */ __name((ctx) => {
    const nextValue = resolveSelectActiveValue(ctx);
    if (!nextValue) return "";
    ctx.value.set(nextValue);
    setSelectActiveValue(ctx, nextValue);
    return nextValue;
  }, "acceptSelectActiveValue");
  const registerComboboxValue = /* @__PURE__ */ __name((ctx, value) => {
    registerOrderedValue(ctx.order, value);
  }, "registerComboboxValue");
  const getComboboxActiveSignal = /* @__PURE__ */ __name((ctx) => {
    const key = ctx.value;
    const existing = comboboxActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal("");
    comboboxActiveValues.set(key, created);
    return created;
  }, "getComboboxActiveSignal");
  const setComboboxActiveValue = /* @__PURE__ */ __name((ctx, value) => {
    getComboboxActiveSignal(ctx).set(typeof value === "string" ? value : "");
  }, "setComboboxActiveValue");
  const resolveComboboxActiveValue = /* @__PURE__ */ __name((ctx) => {
    const explicit = getComboboxActiveSignal(ctx).get();
    if (explicit && (ctx.order.length === 0 || ctx.order.includes(explicit))) {
      return explicit;
    }
    const selected = ctx.value.get();
    if (selected && (ctx.order.length === 0 || ctx.order.includes(selected))) {
      return selected;
    }
    return ctx.order[0] ?? explicit ?? selected ?? "";
  }, "resolveComboboxActiveValue");
  const getComboboxActiveValue = /* @__PURE__ */ __name((ctx) => resolveComboboxActiveValue(ctx), "getComboboxActiveValue");
  const getComboboxActiveDescendantId = /* @__PURE__ */ __name((ctx) => {
    const activeValue = resolveComboboxActiveValue(ctx);
    return activeValue ? getComboboxItemId(ctx, activeValue) : null;
  }, "getComboboxActiveDescendantId");
  const acceptComboboxActiveValue = /* @__PURE__ */ __name((ctx) => {
    const nextValue = resolveComboboxActiveValue(ctx);
    if (!nextValue) return "";
    ctx.value.set(nextValue);
    ctx.query.set(nextValue);
    setComboboxActiveValue(ctx, nextValue);
    return nextValue;
  }, "acceptComboboxActiveValue");
  const registerMultiselectValue = /* @__PURE__ */ __name((ctx, value, label) => {
    registerOrderedValue(ctx.order, value);
    registerTypeaheadLabel(multiselectTypeaheadLabels, ctx.open, value, label);
  }, "registerMultiselectValue");
  const getMultiselectActiveSignal = /* @__PURE__ */ __name((ctx) => {
    const key = ctx.values;
    const existing = multiselectActiveValues.get(key);
    if (existing) return existing;
    const created = new Signal("");
    multiselectActiveValues.set(key, created);
    return created;
  }, "getMultiselectActiveSignal");
  const setMultiselectActiveValue = /* @__PURE__ */ __name((ctx, value) => {
    getMultiselectActiveSignal(ctx).set(typeof value === "string" ? value : "");
  }, "setMultiselectActiveValue");
  const getMultiselectActiveValue = /* @__PURE__ */ __name((ctx) => {
    const explicit = getMultiselectActiveSignal(ctx).get();
    if (explicit) {
      return explicit;
    }
    const selected = readStringSelection(ctx.values.get()).find((entry) => ctx.order.includes(entry));
    return selected ?? ctx.order[0] ?? "";
  }, "getMultiselectActiveValue");
  const getMenuNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getWrappedNavigationTarget(ctx.order, current, key, [
    "ArrowDown"
  ], [
    "ArrowUp"
  ]), "getMenuNavigationTarget");
  const getMenuTypeaheadTarget = /* @__PURE__ */ __name((ctx, current, key) => getTypeaheadTarget(menuTypeaheadStates, ctx.open, ctx.order, menuTypeaheadLabels.get(ctx.open), current, key), "getMenuTypeaheadTarget");
  const getRadioNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getWrappedNavigationTarget(ctx.order, current, key, [
    "ArrowRight",
    "ArrowDown"
  ], [
    "ArrowLeft",
    "ArrowUp"
  ]), "getRadioNavigationTarget");
  const getSelectNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getClampedNavigationTarget(ctx.order, current, key, [
    "ArrowDown"
  ], [
    "ArrowUp"
  ]), "getSelectNavigationTarget");
  const getSelectTypeaheadTarget = /* @__PURE__ */ __name((ctx, current, key) => getTypeaheadTarget(selectTypeaheadStates, ctx.value, ctx.order, selectTypeaheadLabels.get(ctx.value), current, key), "getSelectTypeaheadTarget");
  const getComboboxNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getWrappedNavigationTarget(ctx.order, current, key, [
    "ArrowDown",
    "ArrowRight"
  ], [
    "ArrowUp",
    "ArrowLeft"
  ]), "getComboboxNavigationTarget");
  const getMultiselectNavigationTarget = /* @__PURE__ */ __name((ctx, current, key) => getClampedNavigationTarget(ctx.order, current, key, [
    "ArrowDown"
  ], [
    "ArrowUp"
  ]), "getMultiselectNavigationTarget");
  const getMultiselectTypeaheadTarget = /* @__PURE__ */ __name((ctx, current, key) => getTypeaheadTarget(multiselectTypeaheadStates, ctx.open, ctx.order, multiselectTypeaheadLabels.get(ctx.open), current, key), "getMultiselectTypeaheadTarget");
  const focusMenuItem = /* @__PURE__ */ __name((documentLike, ctx, value) => focusElementById(documentLike, getMenuItemId(ctx, value)), "focusMenuItem");
  const focusRadioItem = /* @__PURE__ */ __name((documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getRadioItemId(ctx, value), fallbackRoot), "focusRadioItem");
  const focusSelectItem = /* @__PURE__ */ __name((documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getSelectItemId(ctx, value), fallbackRoot), "focusSelectItem");
  const focusComboboxItem = /* @__PURE__ */ __name((documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getComboboxItemId(ctx, value), fallbackRoot), "focusComboboxItem");
  const focusMultiselectItem = /* @__PURE__ */ __name((documentLike, ctx, value, fallbackRoot) => focusElementById(documentLike, getMultiselectItemId(ctx, value), fallbackRoot), "focusMultiselectItem");
  const closeMenu = /* @__PURE__ */ __name((ctx) => {
    setMenuActiveValue(ctx, "");
    ctx.open.set(false);
    restoreMenuFocus(ctx);
  }, "closeMenu");
  const closeSelect = /* @__PURE__ */ __name((ctx) => {
    setSelectActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreSelectFocus(ctx);
  }, "closeSelect");
  const closeCombobox = /* @__PURE__ */ __name((ctx) => {
    setComboboxActiveValue(ctx, ctx.value.get());
    ctx.open.set(false);
    restoreComboboxFocus(ctx);
  }, "closeCombobox");
  const closeMultiselect = /* @__PURE__ */ __name((ctx) => {
    setMultiselectActiveValue(ctx, getMultiselectActiveValue(ctx));
    ctx.open.set(false);
    restoreMultiselectFocus(ctx);
  }, "closeMultiselect");
  const readStringSelection = /* @__PURE__ */ __name((value) => Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [], "readStringSelection");
  const toggleMultiselectValue = /* @__PURE__ */ __name((ctx, value) => {
    const current = readStringSelection(ctx.values.get());
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [
      ...current,
      value
    ];
    ctx.values.set(next);
    return next;
  }, "toggleMultiselectValue");
  const getPopoverAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, popoverAnchorTargets), "getPopoverAnchorRect");
  const getMenuAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, menuAnchorTargets), "getMenuAnchorRect");
  const getTooltipAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, tooltipAnchorTargets), "getTooltipAnchorRect");
  const getSelectAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, selectAnchorTargets), "getSelectAnchorRect");
  const getComboboxAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, comboboxAnchorTargets), "getComboboxAnchorRect");
  const getMultiselectAnchorRect = /* @__PURE__ */ __name((ctx) => readAnchorRect(ctx, multiselectAnchorTargets), "getMultiselectAnchorRect");
  const pickPopoverSide = /* @__PURE__ */ __name((props) => {
    const value = props?.side;
    return value === "top" || value === "bottom" || value === "left" || value === "right" ? value : "bottom";
  }, "pickPopoverSide");
  const pickPopoverAlign = /* @__PURE__ */ __name((props) => {
    const value = props?.align;
    return value === "start" || value === "center" || value === "end" ? value : "center";
  }, "pickPopoverAlign");
  const pickPopoverOffset = /* @__PURE__ */ __name((props) => {
    const value = props?.offset;
    return typeof value === "number" && Number.isFinite(value) ? value : 8;
  }, "pickPopoverOffset");
  const omitPopoverLayoutProps = /* @__PURE__ */ __name((props) => {
    if (!props) return void 0;
    const next = {
      ...props
    };
    delete next.side;
    delete next.align;
    delete next.offset;
    return next;
  }, "omitPopoverLayoutProps");
  const pickToastDuration = /* @__PURE__ */ __name((props) => {
    const value = props?.duration;
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }, "pickToastDuration");
  const omitToastControlProps = /* @__PURE__ */ __name((props) => {
    if (!props) return void 0;
    const next = {
      ...props
    };
    delete next.duration;
    return next;
  }, "omitToastControlProps");
  const getPopoverContentStyle = /* @__PURE__ */ __name((rect, props) => {
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
  }, "getPopoverContentStyle");
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
}, "createHeadlessUiRuntime");

// src/runtime/resource-core.ts
var resourceHooks = {};
var configureResourceCore = /* @__PURE__ */ __name((hooks) => {
  resourceHooks = {
    ...resourceHooks,
    ...hooks
  };
}, "configureResourceCore");
var _ResourceHandle = class _ResourceHandle {
  constructor(record) {
    __publicField(this, "record");
    this.record = record;
  }
};
__name(_ResourceHandle, "ResourceHandle");
var ResourceHandle = _ResourceHandle;
var resourceCache = /* @__PURE__ */ new Map();
var normalizeResourceKey = /* @__PURE__ */ __name((key) => {
  if (typeof key === "string") return key;
  if (typeof key === "number" || typeof key === "boolean" || typeof key === "bigint") {
    return String(key);
  }
  if (key === null) return "null";
  if (key === void 0) return "undefined";
  if (resourceHooks.serializeKey) {
    try {
      return resourceHooks.serializeKey(key);
    } catch {
    }
  }
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}, "normalizeResourceKey");
var normalizeResourceOptions = /* @__PURE__ */ __name((options) => {
  const candidate = options && typeof options === "object" ? options : {};
  const ttlRaw = candidate.ttlMs;
  const ttlMs = typeof ttlRaw === "number" && Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : 0;
  const enabled = candidate.enabled !== false;
  return {
    ttlMs,
    enabled
  };
}, "normalizeResourceOptions");
var resourceHasData = /* @__PURE__ */ __name((record) => !!record.hasData.peek(), "resourceHasData");
var createResourceRecord = /* @__PURE__ */ __name((key, loader, options) => ({
  key,
  loader,
  ttlMs: options.ttlMs,
  enabled: options.enabled,
  data: new Signal(null),
  hasData: new Signal(false),
  error: new Signal(null),
  status: new Signal("idle"),
  promise: null,
  expiresAt: 0
}), "createResourceRecord");
var startResourceLoad = /* @__PURE__ */ __name((record, force = false) => {
  if (record.promise) return record.promise;
  if (!record.enabled && !force) {
    return Promise.reject(new Error(`Resource '${record.key}' is disabled`));
  }
  record.status.set("loading");
  record.error.set(null);
  let loadResult;
  try {
    loadResult = Promise.resolve(record.loader());
  } catch (error) {
    loadResult = Promise.reject(error);
  }
  const promise = loadResult.then((value) => {
    record.data.set(value);
    record.hasData.set(true);
    record.error.set(null);
    record.status.set("success");
    record.expiresAt = record.ttlMs > 0 ? Date.now() + record.ttlMs : Number.POSITIVE_INFINITY;
    record.promise = null;
    resourceHooks.notifyDevtools?.();
    return value;
  }, (error) => {
    record.error.set(error);
    record.status.set("error");
    record.expiresAt = 0;
    record.promise = null;
    resourceHooks.notifyDevtools?.();
    throw error;
  });
  promise.catch(() => void 0);
  record.promise = promise;
  resourceHooks.notifyDevtools?.();
  return promise;
}, "startResourceLoad");
var ensureResourceCurrent = /* @__PURE__ */ __name((record) => {
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
}, "ensureResourceCurrent");
var resolveResourceRecord = /* @__PURE__ */ __name((key, loader, options) => {
  const normalizedKey = normalizeResourceKey(key);
  const normalizedOptions = normalizeResourceOptions(options);
  const existing = resourceCache.get(normalizedKey);
  if (existing) {
    existing.loader = loader;
    existing.ttlMs = normalizedOptions.ttlMs;
    existing.enabled = normalizedOptions.enabled;
    ensureResourceCurrent(existing);
    return existing;
  }
  const record = createResourceRecord(normalizedKey, loader, normalizedOptions);
  resourceCache.set(normalizedKey, record);
  ensureResourceCurrent(record);
  return record;
}, "resolveResourceRecord");
var asResourceHandle = /* @__PURE__ */ __name((candidate, apiName) => {
  if (candidate instanceof ResourceHandle) {
    return candidate;
  }
  throw new Error(`${apiName} expects a resource handle`);
}, "asResourceHandle");
var listResourceRecords = /* @__PURE__ */ __name(() => Array.from(resourceCache.values()), "listResourceRecords");

// src/runtime/root-runtime.ts
var coerceRenderer2 = /* @__PURE__ */ __name((candidate) => coerceRenderer(candidate), "coerceRenderer");
var createRootRuntime = /* @__PURE__ */ __name((deps) => {
  const mountReactiveView2 = /* @__PURE__ */ __name((renderer, container, view) => {
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
  }, "mountReactiveView");
  const hydrateReactiveView2 = /* @__PURE__ */ __name((renderer, container, view) => {
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
  }, "hydrateReactiveView");
  return {
    coerceRenderer: coerceRenderer2,
    mountReactiveView: mountReactiveView2,
    hydrateReactiveView: hydrateReactiveView2
  };
}, "createRootRuntime");

// src/runtime/render-api.ts
var isThenable = /* @__PURE__ */ __name((value) => !!value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function", "isThenable");
var createRenderApi = /* @__PURE__ */ __name((deps) => {
  const render2 = {
    signal: /* @__PURE__ */ __name((initial) => new Signal(initial), "signal"),
    get: /* @__PURE__ */ __name((signal) => signal.get(), "get"),
    peek: /* @__PURE__ */ __name((signal) => signal.peek(), "peek"),
    set: /* @__PURE__ */ __name((signal, value) => signal.set(value), "set"),
    update_signal: /* @__PURE__ */ __name((signal, updater) => signal.update(updater), "update_signal"),
    memo: /* @__PURE__ */ __name((compute) => new Memo(compute), "memo"),
    memo_get: /* @__PURE__ */ __name((memo) => memo.get(), "memo_get"),
    memo_peek: /* @__PURE__ */ __name((memo) => memo.peek(), "memo_peek"),
    memo_dispose: /* @__PURE__ */ __name((memo) => memo.dispose(), "memo_dispose"),
    effect: /* @__PURE__ */ __name((fn) => new Effect(fn), "effect"),
    dispose_effect: /* @__PURE__ */ __name((effect) => {
      if (!isDisposableLike(effect)) return;
      try {
        effect.dispose();
      } catch {
      }
    }, "dispose_effect"),
    batch: /* @__PURE__ */ __name((fn) => batch(fn), "batch"),
    untrack: /* @__PURE__ */ __name((fn) => untrack(fn), "untrack"),
    component: /* @__PURE__ */ __name((componentFn, props, key) => applyVNodeKey(deps.frameRuntime.component(componentFn, props, key), key), "component"),
    component_keyed: /* @__PURE__ */ __name((componentFn, props, key) => render2.component(componentFn, props, key), "component_keyed"),
    render_app: /* @__PURE__ */ __name((componentFn, props) => deps.appRuntime.renderAppVNode(componentFn, props), "render_app"),
    render_to_string_app: /* @__PURE__ */ __name((componentFn, props) => deps.renderToString(deps.appRuntime.renderAppVNode(componentFn, props)), "render_to_string_app"),
    create_context: deps.frameRuntime.createContext,
    create_required_context: deps.frameRuntime.createRequiredContext,
    with_context: /* @__PURE__ */ __name((context, value, renderChildren) => deps.frameRuntime.withContext(context, value, renderChildren), "with_context"),
    use_context: /* @__PURE__ */ __name((context) => deps.frameRuntime.useContext(context), "use_context"),
    state: /* @__PURE__ */ __name((initial) => deps.frameRuntime.state(initial), "state"),
    remember: /* @__PURE__ */ __name((compute) => deps.frameRuntime.remember(compute), "remember"),
    transition_presence: /* @__PURE__ */ __name((open, props, durationMs, renderChildren) => deps.transitionRuntime.transitionPresence(open, props, durationMs, renderChildren), "transition_presence"),
    resource_create: /* @__PURE__ */ __name((key, loader, options) => new ResourceHandle(resolveResourceRecord(key, loader, options)), "resource_create"),
    resource_status: /* @__PURE__ */ __name((resource) => {
      const handle = asResourceHandle(resource, "render.resource_status");
      ensureResourceCurrent(handle.record);
      return handle.record.status.get();
    }, "resource_status"),
    resource_data: /* @__PURE__ */ __name((resource) => {
      const handle = asResourceHandle(resource, "render.resource_data");
      ensureResourceCurrent(handle.record);
      return handle.record.hasData.get() ? handle.record.data.get() : null;
    }, "resource_data"),
    resource_error: /* @__PURE__ */ __name((resource) => {
      const handle = asResourceHandle(resource, "render.resource_error");
      ensureResourceCurrent(handle.record);
      return handle.record.error.get();
    }, "resource_error"),
    resource_read: /* @__PURE__ */ __name((resource) => {
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
    }, "resource_read"),
    resource_refresh: /* @__PURE__ */ __name((resource) => {
      const handle = asResourceHandle(resource, "render.resource_refresh");
      handle.record.expiresAt = 0;
      return startResourceLoad(handle.record, true);
    }, "resource_refresh"),
    resource_invalidate: /* @__PURE__ */ __name((resource) => {
      const handle = asResourceHandle(resource, "render.resource_invalidate");
      handle.record.expiresAt = 0;
      handle.record.status.set("idle");
      ensureResourceCurrent(handle.record);
      deps.scheduleDevtoolsNotify();
    }, "resource_invalidate"),
    resource_mutate: /* @__PURE__ */ __name((resource, value) => {
      const handle = asResourceHandle(resource, "render.resource_mutate");
      handle.record.data.set(value);
      handle.record.hasData.set(true);
      handle.record.error.set(null);
      handle.record.status.set("success");
      handle.record.expiresAt = handle.record.ttlMs > 0 ? Date.now() + handle.record.ttlMs : Number.POSITIVE_INFINITY;
      deps.scheduleDevtoolsNotify();
      return handle.record.data.get();
    }, "resource_mutate"),
    suspense: /* @__PURE__ */ __name((fallback, renderChildren) => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (!isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === "function" ? fallback() : fallback;
        return coerceRenderableToVNode(resolvedFallback);
      }
    }, "suspense"),
    error_boundary: /* @__PURE__ */ __name((fallback, renderChildren) => {
      try {
        return coerceRenderableToVNode(renderChildren());
      } catch (error) {
        if (isThenable(error)) {
          throw error;
        }
        const resolvedFallback = typeof fallback === "function" ? fallback(error) : fallback;
        return coerceRenderableToVNode(resolvedFallback);
      }
    }, "error_boundary"),
    show: /* @__PURE__ */ __name((condition, renderChildren, fallback) => {
      const resolved = condition instanceof Signal ? condition.get() : condition;
      return resolved ? coerceRenderableToVNode(renderChildren()) : coerceRenderableToVNode(typeof fallback === "function" ? fallback() : fallback);
    }, "show"),
    createResource: /* @__PURE__ */ __name((key, loader, options) => render2.resource_create(key, loader, options), "createResource"),
    renderApp: /* @__PURE__ */ __name((componentFn, props) => render2.render_app(componentFn, props), "renderApp"),
    renderToStringApp: /* @__PURE__ */ __name((componentFn, props) => render2.render_to_string_app(componentFn, props), "renderToStringApp"),
    transitionPresence: /* @__PURE__ */ __name((open, props, durationMs, renderChildren) => render2.transition_presence(open, props, durationMs, renderChildren), "transitionPresence"),
    resourceStatus: /* @__PURE__ */ __name((resource) => render2.resource_status(resource), "resourceStatus"),
    resourceData: /* @__PURE__ */ __name((resource) => render2.resource_data(resource), "resourceData"),
    resourceError: /* @__PURE__ */ __name((resource) => render2.resource_error(resource), "resourceError"),
    resourceRead: /* @__PURE__ */ __name((resource) => render2.resource_read(resource), "resourceRead"),
    resourceRefresh: /* @__PURE__ */ __name((resource) => render2.resource_refresh(resource), "resourceRefresh"),
    resourceInvalidate: /* @__PURE__ */ __name((resource) => render2.resource_invalidate(resource), "resourceInvalidate"),
    resourceMutate: /* @__PURE__ */ __name((resource, value) => render2.resource_mutate(resource, value), "resourceMutate"),
    errorBoundary: /* @__PURE__ */ __name((fallback, renderChildren) => render2.error_boundary(fallback, renderChildren), "errorBoundary"),
    mountApp: /* @__PURE__ */ __name((renderer, container, componentFn, props) => render2.mount_app(renderer, container, componentFn, props), "mountApp"),
    hydrateApp: /* @__PURE__ */ __name((renderer, container, componentFn, props) => render2.hydrate_app(renderer, container, componentFn, props), "hydrateApp"),
    testingCreateDomHarness: /* @__PURE__ */ __name(() => render2.testing_create_dom_harness(), "testingCreateDomHarness"),
    testingMountApp: /* @__PURE__ */ __name((harness, componentFn, props) => render2.testing_mount_app(harness, componentFn, props), "testingMountApp"),
    testingHydrateApp: /* @__PURE__ */ __name((harness, componentFn, props) => render2.testing_hydrate_app(harness, componentFn, props), "testingHydrateApp"),
    testingContainer: /* @__PURE__ */ __name((harness) => render2.testing_container(harness), "testingContainer"),
    testingBody: /* @__PURE__ */ __name((harness) => render2.testing_body(harness), "testingBody"),
    testingGetById: /* @__PURE__ */ __name((harness, id) => render2.testing_get_by_id(harness, id), "testingGetById"),
    testingGetByText: /* @__PURE__ */ __name((scope, value) => render2.testing_get_by_text(scope, value), "testingGetByText"),
    testingGetByRole: /* @__PURE__ */ __name((scope, role) => {
      const matches = render2.testing_query_all_by_role(scope, role);
      return matches[0] ?? null;
    }, "testingGetByRole"),
    testingQueryAllByRole: /* @__PURE__ */ __name((scope, role) => render2.testing_query_all_by_role(scope, role), "testingQueryAllByRole"),
    testingTextContent: /* @__PURE__ */ __name((node) => render2.testing_text_content(node), "testingTextContent"),
    testingClick: /* @__PURE__ */ __name((node) => render2.testing_click(node), "testingClick"),
    testingInput: /* @__PURE__ */ __name((node, value) => render2.testing_input(node, value), "testingInput"),
    testingChangeChecked: /* @__PURE__ */ __name((node, checked) => render2.testing_change_checked(node, checked), "testingChangeChecked"),
    testingKeydown: /* @__PURE__ */ __name((node, key, shiftKey) => render2.testing_keydown(node, key, shiftKey), "testingKeydown"),
    testingSubmit: /* @__PURE__ */ __name((node) => render2.testing_submit(node), "testingSubmit"),
    devtoolsSnapshot: /* @__PURE__ */ __name(() => render2.devtools_snapshot(), "devtoolsSnapshot"),
    installDevtools: /* @__PURE__ */ __name((key) => render2.install_devtools(key), "installDevtools"),
    ssgPage: /* @__PURE__ */ __name((body, options) => render2.ssg_page(body, options), "ssgPage"),
    ssgRenderApp: /* @__PURE__ */ __name((componentFn, props, options) => render2.ssg_render_app(componentFn, props, options), "ssgRenderApp"),
    ssgWritePage: /* @__PURE__ */ __name((filePath, body, options) => render2.ssg_write_page(filePath, body, options), "ssgWritePage"),
    ssgWriteApp: /* @__PURE__ */ __name((filePath, componentFn, props, options) => render2.ssg_write_app(filePath, componentFn, props, options), "ssgWriteApp"),
    devtools_snapshot: /* @__PURE__ */ __name(() => deps.snapshotDevtools(), "devtools_snapshot"),
    install_devtools: /* @__PURE__ */ __name((key) => deps.installLuminaDevtools(key), "install_devtools"),
    ssg_page: /* @__PURE__ */ __name((body, options) => deps.appRuntime.ssgApi.renderPage(body, options), "ssg_page"),
    ssg_render_app: /* @__PURE__ */ __name((componentFn, props, options) => deps.appRuntime.ssgApi.renderAppPage(componentFn, props, options), "ssg_render_app"),
    ssg_write_page: /* @__PURE__ */ __name((filePath, body, options) => deps.appRuntime.ssgApi.writePage(filePath, body, options), "ssg_write_page"),
    ssg_write_app: /* @__PURE__ */ __name((filePath, componentFn, props, options) => deps.appRuntime.ssgApi.writeAppPage(filePath, componentFn, props, options), "ssg_write_app"),
    mountCustomElement: /* @__PURE__ */ __name((host, componentFn, options) => render2.mount_custom_element(host, componentFn, options), "mountCustomElement"),
    defineCustomElement: /* @__PURE__ */ __name((tagName, componentFn, options) => render2.define_custom_element(tagName, componentFn, options), "defineCustomElement"),
    children: /* @__PURE__ */ __name((input) => normalizeVNodeChildren(resolveChildrenInput(input)), "children"),
    slot: /* @__PURE__ */ __name((slotValue, props, fallback = []) => {
      if (typeof slotValue === "function") {
        return coerceRenderableToVNode(slotValue(props));
      }
      if (slotValue === null || slotValue === void 0) {
        return coerceRenderableToVNode(fallback);
      }
      return coerceRenderableToVNode(slotValue);
    }, "slot"),
    slot_or: /* @__PURE__ */ __name((slotValue, props, fallback) => render2.slot(slotValue, props, fallback), "slot_or"),
    compose_handlers: /* @__PURE__ */ __name((left, right) => composeHandlers(left, right), "compose_handlers"),
    portal: /* @__PURE__ */ __name((target, children2 = []) => vnodePortal(target, children2), "portal"),
    portal_body: /* @__PURE__ */ __name((children2 = []) => vnodePortal(null, children2), "portal_body"),
    ...deps.headlessPrimitiveRender,
    selectRoot: /* @__PURE__ */ __name((open, value, renderChildren) => render2.select_root(open, value, renderChildren), "selectRoot"),
    selectPortal: /* @__PURE__ */ __name((children2 = []) => render2.select_portal(children2), "selectPortal"),
    selectTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.select_trigger(props, children2), "selectTrigger"),
    selectContent: /* @__PURE__ */ __name((props, children2 = []) => render2.select_content(props, children2), "selectContent"),
    selectItem: /* @__PURE__ */ __name((value, props, renderChildren) => render2.select_item(value, props, renderChildren), "selectItem"),
    selectIndicator: /* @__PURE__ */ __name((props, children2 = []) => render2.select_indicator(props, children2), "selectIndicator"),
    comboboxRoot: /* @__PURE__ */ __name((open, value, query2, renderChildren) => render2.combobox_root(open, value, query2, renderChildren), "comboboxRoot"),
    comboboxPortal: /* @__PURE__ */ __name((children2 = []) => render2.combobox_portal(children2), "comboboxPortal"),
    comboboxInput: /* @__PURE__ */ __name((props, children2 = []) => render2.combobox_input(props, children2), "comboboxInput"),
    comboboxContent: /* @__PURE__ */ __name((props, children2 = []) => render2.combobox_content(props, children2), "comboboxContent"),
    comboboxItem: /* @__PURE__ */ __name((value, props, renderChildren) => render2.combobox_item(value, props, renderChildren), "comboboxItem"),
    comboboxIndicator: /* @__PURE__ */ __name((props, children2 = []) => render2.combobox_indicator(props, children2), "comboboxIndicator"),
    multiselectRoot: /* @__PURE__ */ __name((open, values, renderChildren) => render2.multiselect_root(open, values, renderChildren), "multiselectRoot"),
    multiselectPortal: /* @__PURE__ */ __name((children2 = []) => render2.multiselect_portal(children2), "multiselectPortal"),
    multiselectTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.multiselect_trigger(props, children2), "multiselectTrigger"),
    multiselectContent: /* @__PURE__ */ __name((props, children2 = []) => render2.multiselect_content(props, children2), "multiselectContent"),
    multiselectItem: /* @__PURE__ */ __name((value, props, renderChildren) => render2.multiselect_item(value, props, renderChildren), "multiselectItem"),
    multiselectIndicator: /* @__PURE__ */ __name((props, children2 = []) => render2.multiselect_indicator(props, children2), "multiselectIndicator"),
    checkboxRoot: /* @__PURE__ */ __name((checked, props, renderChildren) => render2.checkbox_root(checked, props, renderChildren), "checkboxRoot"),
    checkboxIndicator: /* @__PURE__ */ __name((props, children2 = []) => render2.checkbox_indicator(props, children2), "checkboxIndicator"),
    radioGroup: /* @__PURE__ */ __name((value, props, renderChildren) => render2.radio_group(value, props, renderChildren), "radioGroup"),
    radioItem: /* @__PURE__ */ __name((value, props, renderChildren) => render2.radio_item(value, props, renderChildren), "radioItem"),
    radioIndicator: /* @__PURE__ */ __name((props, children2 = []) => render2.radio_indicator(props, children2), "radioIndicator"),
    portalBody: /* @__PURE__ */ __name((children2 = []) => render2.portal_body(children2), "portalBody"),
    tabsRoot: /* @__PURE__ */ __name((value, renderChildren) => render2.tabs_root(value, renderChildren), "tabsRoot"),
    tabsList: /* @__PURE__ */ __name((props, renderChildren) => render2.tabs_list(props, renderChildren), "tabsList"),
    tabsTrigger: /* @__PURE__ */ __name((value, props, children2 = []) => render2.tabs_trigger(value, props, children2), "tabsTrigger"),
    tabsPanel: /* @__PURE__ */ __name((value, props, children2 = []) => render2.tabs_panel(value, props, children2), "tabsPanel"),
    dialogRoot: /* @__PURE__ */ __name((open, renderChildren) => render2.dialog_root(open, renderChildren), "dialogRoot"),
    dialogPortal: /* @__PURE__ */ __name((children2 = []) => render2.dialog_portal(children2), "dialogPortal"),
    dialogTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.dialog_trigger(props, children2), "dialogTrigger"),
    dialogOverlay: /* @__PURE__ */ __name((props) => render2.dialog_overlay(props), "dialogOverlay"),
    dialogContent: /* @__PURE__ */ __name((props, children2 = []) => render2.dialog_content(props, children2), "dialogContent"),
    dialogTitle: /* @__PURE__ */ __name((props, children2 = []) => render2.dialog_title(props, children2), "dialogTitle"),
    dialogDescription: /* @__PURE__ */ __name((props, children2 = []) => render2.dialog_description(props, children2), "dialogDescription"),
    dialogClose: /* @__PURE__ */ __name((props, children2 = []) => render2.dialog_close(props, children2), "dialogClose"),
    popoverRoot: /* @__PURE__ */ __name((open, renderChildren) => render2.popover_root(open, renderChildren), "popoverRoot"),
    popoverPortal: /* @__PURE__ */ __name((children2 = []) => render2.popover_portal(children2), "popoverPortal"),
    popoverTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.popover_trigger(props, children2), "popoverTrigger"),
    popoverContent: /* @__PURE__ */ __name((props, children2 = []) => render2.popover_content(props, children2), "popoverContent"),
    tooltipRoot: /* @__PURE__ */ __name((open, renderChildren) => render2.tooltip_root(open, renderChildren), "tooltipRoot"),
    tooltipPortal: /* @__PURE__ */ __name((children2 = []) => render2.tooltip_portal(children2), "tooltipPortal"),
    tooltipTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.tooltip_trigger(props, children2), "tooltipTrigger"),
    tooltipContent: /* @__PURE__ */ __name((props, children2 = []) => render2.tooltip_content(props, children2), "tooltipContent"),
    menuRoot: /* @__PURE__ */ __name((open, renderChildren) => render2.menu_root(open, renderChildren), "menuRoot"),
    menuPortal: /* @__PURE__ */ __name((children2 = []) => render2.menu_portal(children2), "menuPortal"),
    menuTrigger: /* @__PURE__ */ __name((props, children2 = []) => render2.menu_trigger(props, children2), "menuTrigger"),
    menuContent: /* @__PURE__ */ __name((props, children2 = []) => render2.menu_content(props, children2), "menuContent"),
    menuItem: /* @__PURE__ */ __name((value, props, children2 = []) => render2.menu_item(value, props, children2), "menuItem"),
    text: /* @__PURE__ */ __name((value) => vnodeText(value), "text"),
    live_text: /* @__PURE__ */ __name((signal) => vnodeLiveText(signal), "live_text"),
    liveText: /* @__PURE__ */ __name((signal) => vnodeLiveText(signal), "liveText"),
    index_list: /* @__PURE__ */ __name((itemsSignal, renderItem) => vnodeIndexList(itemsSignal, renderItem), "index_list"),
    indexList: /* @__PURE__ */ __name((itemsSignal, renderItem) => vnodeIndexList(itemsSignal, renderItem), "indexList"),
    for_list: /* @__PURE__ */ __name((itemsSignal, keyOf, renderItem) => vnodeForList(itemsSignal, keyOf, renderItem), "for_list"),
    forList: /* @__PURE__ */ __name((itemsSignal, keyOf, renderItem) => vnodeForList(itemsSignal, keyOf, renderItem), "forList"),
    element: /* @__PURE__ */ __name((tag, props, children2 = []) => vnodeElement(tag, props, children2), "element"),
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
    props_attr: /* @__PURE__ */ __name((name, value) => propsAttr(name, value), "props_attr"),
    props_when: /* @__PURE__ */ __name((condition, props) => propsWhen(condition, props), "props_when"),
    props_merge: /* @__PURE__ */ __name((left, right) => mergeProps(left, right), "props_merge"),
    dom_get_element_by_id: /* @__PURE__ */ __name((id) => {
      const doc = globalThis.document;
      if (!doc || typeof doc.getElementById !== "function") return null;
      return doc.getElementById(id);
    }, "dom_get_element_by_id"),
    fragment: /* @__PURE__ */ __name((children2 = []) => vnodeFragment(children2), "fragment"),
    is_vnode: /* @__PURE__ */ __name((value) => isVNode(value), "is_vnode"),
    serialize: /* @__PURE__ */ __name((node) => serializeVNode(node), "serialize"),
    parse: /* @__PURE__ */ __name((json2) => parseVNode(json2), "parse"),
    create_renderer: /* @__PURE__ */ __name((renderer) => deps.coerceRenderer(renderer), "create_renderer"),
    create_dom_renderer: /* @__PURE__ */ __name((options) => deps.createDomRenderer(options), "create_dom_renderer"),
    create_ssr_renderer: /* @__PURE__ */ __name(() => deps.createSsrRenderer(), "create_ssr_renderer"),
    create_canvas_renderer: /* @__PURE__ */ __name((options) => deps.createCanvasRenderer(options), "create_canvas_renderer"),
    create_terminal_renderer: /* @__PURE__ */ __name(() => deps.createTerminalRenderer(), "create_terminal_renderer"),
    render_to_string: /* @__PURE__ */ __name((node) => deps.renderToString(node), "render_to_string"),
    render_to_terminal: /* @__PURE__ */ __name((node) => deps.renderToTerminal(node), "render_to_terminal"),
    create_root: /* @__PURE__ */ __name((renderer, container) => new deps.RenderRoot(deps.coerceRenderer(renderer), container), "create_root"),
    mount: /* @__PURE__ */ __name((renderer, container, node) => {
      if (container == null) return deps.renderError("Render container is required");
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.mount(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    }, "mount"),
    hydrate: /* @__PURE__ */ __name((renderer, container, node) => {
      if (container == null) return deps.renderError("Render container is required");
      const root = new deps.RenderRoot(deps.coerceRenderer(renderer), container);
      try {
        root.hydrate(node);
        return root;
      } catch (error) {
        return deps.renderError(deps.toRenderErrorMessage(error));
      }
    }, "hydrate"),
    mount_reactive: /* @__PURE__ */ __name((renderer, container, view) => deps.mountReactiveView(renderer, container, view), "mount_reactive"),
    hydrate_reactive: /* @__PURE__ */ __name((renderer, container, view) => deps.hydrateReactiveView(renderer, container, view), "hydrate_reactive"),
    mount_app: /* @__PURE__ */ __name((renderer, container, componentFn, props) => deps.appRuntime.mountReactiveApp(renderer, container, componentFn, props), "mount_app"),
    hydrate_app: /* @__PURE__ */ __name((renderer, container, componentFn, props) => deps.appRuntime.hydrateReactiveApp(renderer, container, componentFn, props), "hydrate_app"),
    testing_create_dom_harness: /* @__PURE__ */ __name(() => deps.appRuntime.testingFacade.testing_create_dom_harness(), "testing_create_dom_harness"),
    testing_mount_app: /* @__PURE__ */ __name((harness, componentFn, props) => deps.appRuntime.testingFacade.testing_mount_app(harness, componentFn, props), "testing_mount_app"),
    testing_hydrate_app: /* @__PURE__ */ __name((harness, componentFn, props) => deps.appRuntime.testingFacade.testing_hydrate_app(harness, componentFn, props), "testing_hydrate_app"),
    testing_container: /* @__PURE__ */ __name((harness) => deps.appRuntime.testingFacade.testing_container(harness), "testing_container"),
    testing_body: /* @__PURE__ */ __name((harness) => deps.appRuntime.testingFacade.testing_body(harness), "testing_body"),
    testing_get_by_id: /* @__PURE__ */ __name((harness, id) => deps.appRuntime.testingFacade.testing_get_by_id(harness, id), "testing_get_by_id"),
    testing_get_by_text: /* @__PURE__ */ __name((scope, value) => deps.appRuntime.testingFacade.testing_get_by_text(scope, value), "testing_get_by_text"),
    testing_query_all_by_role: /* @__PURE__ */ __name((scope, role) => deps.appRuntime.testingFacade.testing_query_all_by_role(scope, role), "testing_query_all_by_role"),
    testing_text_content: /* @__PURE__ */ __name((node) => deps.appRuntime.testingFacade.testing_text_content(node), "testing_text_content"),
    testing_click: /* @__PURE__ */ __name((node) => deps.appRuntime.testingFacade.testing_click(node), "testing_click"),
    testing_input: /* @__PURE__ */ __name((node, value) => deps.appRuntime.testingFacade.testing_input(node, value), "testing_input"),
    testing_change_checked: /* @__PURE__ */ __name((node, checked) => deps.appRuntime.testingFacade.testing_change_checked(node, checked), "testing_change_checked"),
    testing_keydown: /* @__PURE__ */ __name((node, key, shiftKey) => deps.appRuntime.testingFacade.testing_keydown(node, key, shiftKey), "testing_keydown"),
    testing_submit: /* @__PURE__ */ __name((node) => deps.appRuntime.testingFacade.testing_submit(node), "testing_submit"),
    mount_custom_element: /* @__PURE__ */ __name((host, componentFn, options) => deps.appRuntime.mountCustomElementInternal(host, componentFn, options), "mount_custom_element"),
    define_custom_element: /* @__PURE__ */ __name((tagName, componentFn, options) => deps.appRuntime.defineCustomElementInternal(tagName, componentFn, options), "define_custom_element"),
    update: /* @__PURE__ */ __name((root, node) => {
      if (!root || typeof root !== "object") return;
      if (typeof root.update !== "function") return;
      try {
        root.update(node);
      } catch {
      }
    }, "update"),
    unmount: /* @__PURE__ */ __name((root) => {
      if (!isUnmountableLike(root)) return;
      try {
        root.unmount();
      } catch {
      }
    }, "unmount"),
    dispose_reactive: /* @__PURE__ */ __name((root) => {
      if (!isDisposableLike(root)) return;
      try {
        root.dispose();
      } catch {
      }
    }, "dispose_reactive")
  };
  return render2;
}, "createRenderApi");

// src/runtime/transition-runtime.ts
var clearTimerHandle2 = /* @__PURE__ */ __name((handle) => {
  if (handle !== null && handle !== void 0) {
    clearTimeout(handle);
  }
}, "clearTimerHandle");
var createTransitionRuntime = /* @__PURE__ */ __name((hooks) => ({
  transitionPresence: /* @__PURE__ */ __name((open, props, durationMs, children2) => {
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
  }, "transitionPresence")
}), "createTransitionRuntime");

// src/runtime/webgpu-runtime.ts
var getWebGpu = /* @__PURE__ */ __name(() => {
  const nav = globalThis.navigator;
  const gpu = nav?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return null;
  return gpu;
}, "getWebGpu");
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
var normalizeElementType = /* @__PURE__ */ __name((typeHint) => {
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
}, "normalizeElementType");
var elementSize = /* @__PURE__ */ __name((elementType) => {
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
}, "elementSize");
var inferElementType = /* @__PURE__ */ __name((data) => {
  if (data instanceof Uint8Array) return "u8";
  if (data instanceof Uint32Array) return "u32";
  if (data instanceof Float32Array) return "f32";
  if (data instanceof Float64Array) return "f64";
  return "i32";
}, "inferElementType");
var numberArrayToView = /* @__PURE__ */ __name((values, elementType) => {
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
}, "numberArrayToView");
var toTypedArray = /* @__PURE__ */ __name((data, typeHint) => {
  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    const view2 = data;
    const elementType2 = inferElementType(view2);
    const elementCount2 = Math.max(0, Math.floor(view2.byteLength / elementSize(elementType2)));
    return {
      view: view2,
      elementType: elementType2,
      elementCount: elementCount2
    };
  }
  const elementType = normalizeElementType(typeHint);
  const source = Array.isArray(data) ? data.map((value) => Number(value)) : [];
  const view = numberArrayToView(source, elementType);
  const elementCount = Math.max(0, Math.floor(view.byteLength / elementSize(elementType)));
  return {
    view,
    elementType,
    elementCount
  };
}, "toTypedArray");
var readTypedArray = /* @__PURE__ */ __name((buffer, elementType, elementCount) => {
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
}, "readTypedArray");
var resolveWebGpuDevice = /* @__PURE__ */ __name((device) => {
  if (device && typeof device.createBuffer === "function") {
    return device;
  }
  return null;
}, "resolveWebGpuDevice");
var alignTo4 = /* @__PURE__ */ __name((value) => {
  const v = Math.max(4, Math.trunc(value));
  const mod = v % 4;
  return mod === 0 ? v : v + (4 - mod);
}, "alignTo4");
var hasWgslStageEntryPoint = /* @__PURE__ */ __name((source, stage, entryPoint) => {
  const escaped = entryPoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`@${stage}[\\s\\S]*\\bfn\\s+${escaped}\\s*\\(`, "m");
  return pattern.test(source);
}, "hasWgslStageEntryPoint");
var createWebGpuRuntime = /* @__PURE__ */ __name(({ resultOk, resultErr, isEnumLike: isEnumLike2, getEnumTag: getEnumTag2, getEnumPayload: getEnumPayload2 }) => {
  let webgpuNextHandle = 1;
  const webgpuBuffers = /* @__PURE__ */ new Map();
  const webgpuPipelines = /* @__PURE__ */ new Map();
  const webgpuCanvases = /* @__PURE__ */ new Map();
  const newWebGpuHandle = /* @__PURE__ */ __name(() => {
    const handle = webgpuNextHandle;
    webgpuNextHandle += 1;
    return handle;
  }, "newWebGpuHandle");
  const formatError2 = /* @__PURE__ */ __name((error) => {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
  }, "formatError");
  const webgpu2 = {
    GPU_BUFFER_USAGE_STORAGE: WEBGPU_BUFFER_USAGE.STORAGE,
    GPU_BUFFER_USAGE_UNIFORM: WEBGPU_BUFFER_USAGE.UNIFORM,
    GPU_BUFFER_USAGE_VERTEX: WEBGPU_BUFFER_USAGE.VERTEX,
    GPU_BUFFER_USAGE_INDEX: WEBGPU_BUFFER_USAGE.INDEX,
    GPU_BUFFER_USAGE_COPY_SRC: WEBGPU_BUFFER_USAGE.COPY_SRC,
    GPU_BUFFER_USAGE_COPY_DST: WEBGPU_BUFFER_USAGE.COPY_DST,
    is_available: /* @__PURE__ */ __name(() => getWebGpu() !== null, "is_available"),
    request_adapter: /* @__PURE__ */ __name(async () => {
      try {
        const gpu = getWebGpu();
        if (!gpu) return resultErr("WebGPU is not available in this environment");
        const adapter = await gpu.requestAdapter();
        if (!adapter) return resultErr("No WebGPU adapter available");
        return resultOk(adapter);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    }, "request_adapter"),
    request_device: /* @__PURE__ */ __name(async (adapter) => {
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
    }, "request_device"),
    buffer_create: /* @__PURE__ */ __name((device, size, usage) => {
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
    }, "buffer_create"),
    buffer_write: /* @__PURE__ */ __name((device, bufferHandle, data, offset = 0, typeHint = "i32") => {
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
    }, "buffer_write"),
    buffer_read: /* @__PURE__ */ __name(async (device, bufferHandle, size, typeHint = "i32") => {
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
        readDevice.queue.submit([
          encoder.finish()
        ]);
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
    }, "buffer_read"),
    buffer_destroy: /* @__PURE__ */ __name((bufferHandle) => {
      const entry = webgpuBuffers.get(Math.trunc(bufferHandle));
      if (!entry) return;
      entry.buffer.destroy?.();
      webgpuBuffers.delete(Math.trunc(bufferHandle));
    }, "buffer_destroy"),
    uniform_create: /* @__PURE__ */ __name((device, data, typeHint = "f32") => {
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
    }, "uniform_create"),
    uniform_update: /* @__PURE__ */ __name((device, uniformHandle, data, typeHint = "f32") => {
      const entry = webgpuBuffers.get(Math.trunc(uniformHandle));
      if (!entry || entry.kind !== "uniform") return resultErr(`Unknown WebGPU uniform handle ${uniformHandle}`);
      return webgpu2.buffer_write(device, uniformHandle, data, 0, typeHint);
    }, "uniform_update"),
    uniform_destroy: /* @__PURE__ */ __name((uniformHandle) => {
      webgpu2.buffer_destroy(uniformHandle);
    }, "uniform_destroy"),
    vertex_buffer: /* @__PURE__ */ __name((device, data, typeHint = "f32") => {
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
    }, "vertex_buffer"),
    index_buffer: /* @__PURE__ */ __name((device, data, typeHint = "u32") => {
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
    }, "index_buffer"),
    vertex_buffer_destroy: /* @__PURE__ */ __name((handle) => {
      webgpu2.buffer_destroy(handle);
    }, "vertex_buffer_destroy"),
    index_buffer_destroy: /* @__PURE__ */ __name((handle) => {
      webgpu2.buffer_destroy(handle);
    }, "index_buffer_destroy"),
    canvas: /* @__PURE__ */ __name((selector) => {
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
    }, "canvas"),
    canvas_destroy: /* @__PURE__ */ __name((canvasHandle) => {
      webgpuCanvases.delete(Math.trunc(canvasHandle));
    }, "canvas_destroy"),
    present: /* @__PURE__ */ __name((device, canvasHandle, _pipelineHandle) => {
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
    }, "present"),
    render_pipeline: /* @__PURE__ */ __name(async (device, config) => {
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
        const vertexModule = resolvedDevice.createShaderModule({
          code: vertexShader
        });
        const fragmentModule = resolvedDevice.createShaderModule({
          code: fragmentShader
        });
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
          vertex: {
            module: vertexModule,
            entryPoint: "main",
            buffers
          },
          fragment: {
            module: fragmentModule,
            entryPoint: "main",
            targets: [
              {
                format: String(config?.format ?? "bgra8unorm")
              }
            ]
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
    }, "render_pipeline"),
    render_pipeline_destroy: /* @__PURE__ */ __name((pipelineHandle) => {
      webgpuPipelines.delete(Math.trunc(pipelineHandle));
    }, "render_pipeline_destroy"),
    render_frame: /* @__PURE__ */ __name((device, pipelineHandle, config) => {
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
        resolvedDevice.queue.submit([
          encoder.finish()
        ]);
        canvasEntry.hasSubmittedFrame = true;
        return webgpu2.present(resolvedDevice, canvasEntry.id, pipelineHandle);
      } catch (error) {
        return resultErr(formatError2(error));
      }
    }, "render_frame"),
    compute: /* @__PURE__ */ __name(async (wgsl, entryPoint, input, outputLength, workgroupSize = 64, typeHint = "i32") => {
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
        const shaderModule = device.createShaderModule({
          code: shaderSource
        });
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
          compute: {
            module: shaderModule,
            entryPoint: String(entryPoint)
          }
        }) : device.createComputePipeline({
          layout: "auto",
          compute: {
            module: shaderModule,
            entryPoint: String(entryPoint)
          }
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            {
              binding: 0,
              resource: {
                buffer: inputBuffer
              }
            },
            {
              binding: 1,
              resource: {
                buffer: outputBuffer
              }
            }
          ]
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(dispatchCount, 1, 1);
        pass.end();
        encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outBytes);
        device.queue.submit([
          encoder.finish()
        ]);
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
    }, "compute"),
    compute_i32: /* @__PURE__ */ __name(async (wgsl, entryPoint, input, outputLength, workgroupSize = 64) => webgpu2.compute(wgsl, entryPoint, input, outputLength, workgroupSize, "i32"), "compute_i32"),
    __debug_counts: /* @__PURE__ */ __name(() => ({
      buffers: webgpuBuffers.size,
      pipelines: webgpuPipelines.size,
      canvases: webgpuCanvases.size
    }), "__debug_counts")
  };
  return webgpu2;
}, "createWebGpuRuntime");

// src/runtime/render-targets.ts
var resolveCanvasContext = /* @__PURE__ */ __name((container, options) => {
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
}, "resolveCanvasContext");
var setTerminalOutput = /* @__PURE__ */ __name((container, text2) => {
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
}, "setTerminalOutput");
var createRenderTargetsRuntime = /* @__PURE__ */ __name((deps) => {
  const drawCanvasNode = /* @__PURE__ */ __name((ctx, node, state2) => {
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
        y2 = drawCanvasNode(ctx, child, {
          ...state2,
          y: y2
        });
      }
      return y2;
    }
    if (kind === "for_list") {
      let y2 = state2.y;
      for (const child of deps.materializeForListChildren(node, false)) {
        y2 = drawCanvasNode(ctx, child, {
          ...state2,
          y: y2
        });
      }
      return y2;
    }
    if (kind === "fragment" || kind === "portal") {
      let y2 = state2.y;
      for (const child of deps.getChildren(node)) {
        y2 = drawCanvasNode(ctx, child, {
          ...state2,
          y: y2
        });
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
      y = drawCanvasNode(ctx, child, {
        ...state2,
        y
      });
    }
    return y;
  }, "drawCanvasNode");
  const renderNodeToTerminalLines = /* @__PURE__ */ __name((node, depth = 0) => {
    const indent = "  ".repeat(depth);
    const kind = deps.getKind(node);
    if (kind === "text") {
      return [
        `${indent}${deps.getText(node) ?? ""}`
      ];
    }
    if (kind === "live_text") {
      return [
        `${indent}${String(deps.getSignalValue(node) ?? "")}`
      ];
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
    return [
      head,
      ...children2,
      tail
    ];
  }, "renderNodeToTerminalLines");
  const renderToTerminal2 = /* @__PURE__ */ __name((node) => renderNodeToTerminalLines(node).join("\n"), "renderToTerminal");
  const createCanvasRenderer2 = /* @__PURE__ */ __name((options) => {
    let context = options?.context ?? null;
    return {
      mount(node, container) {
        context = resolveCanvasContext(container, options);
        const width = Number(options?.width ?? context.canvas?.width ?? 800);
        const height = Number(options?.height ?? context.canvas?.height ?? 600);
        if (options?.clear !== false && context.clearRect) {
          context.clearRect(0, 0, width, height);
        }
        drawCanvasNode(context, node, {
          x: 8,
          y: 20,
          lineHeight: 20
        });
      },
      patch(_prev, next, container) {
        const ctx = context ?? resolveCanvasContext(container, options);
        context = ctx;
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (options?.clear !== false && ctx.clearRect) {
          ctx.clearRect(0, 0, width, height);
        }
        drawCanvasNode(ctx, next, {
          x: 8,
          y: 20,
          lineHeight: 20
        });
      },
      unmount(container) {
        const ctx = context ?? resolveCanvasContext(container, options);
        const width = Number(options?.width ?? ctx.canvas?.width ?? 800);
        const height = Number(options?.height ?? ctx.canvas?.height ?? 600);
        if (ctx.clearRect) ctx.clearRect(0, 0, width, height);
        context = null;
      }
    };
  }, "createCanvasRenderer");
  const createTerminalRenderer2 = /* @__PURE__ */ __name(() => ({
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
  }), "createTerminalRenderer");
  return {
    createCanvasRenderer: createCanvasRenderer2,
    createTerminalRenderer: createTerminalRenderer2,
    renderToTerminal: renderToTerminal2
  };
}, "createRenderTargetsRuntime");

// src/runtime/ssr-renderer.ts
var htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var escapeHtml = /* @__PURE__ */ __name((value) => String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char), "escapeHtml");
var kebabCase = /* @__PURE__ */ __name((value) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^ms-/, "-ms-"), "kebabCase");
var serializeStyleValue = /* @__PURE__ */ __name((value) => Object.entries(value).filter(([, entry]) => entry !== null && entry !== void 0).map(([key, entry]) => `${kebabCase(key)}:${String(entry)}`).join(";"), "serializeStyleValue");
var serializePropsToHtml = /* @__PURE__ */ __name((props) => {
  if (!props) return "";
  const attrs = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === "key") continue;
    if (key.startsWith("on") && typeof value === "function") continue;
    if (value === false || value === null || value === void 0) continue;
    if (key === "style" && typeof value === "object" && value !== null) {
      const styleText = serializeStyleValue(value);
      if (styleText.length > 0) attrs.push(`style="${escapeHtml(styleText)}"`);
      continue;
    }
    if (value === true) {
      attrs.push(key);
      continue;
    }
    attrs.push(`${key}="${escapeHtml(String(value))}"`);
  }
  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}, "serializePropsToHtml");
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
var setContainerMarkup = /* @__PURE__ */ __name((container, output) => {
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
}, "setContainerMarkup");
var createSsrRuntime = /* @__PURE__ */ __name((deps) => {
  const vnodeToHtml = /* @__PURE__ */ __name((node) => {
    const normalized = deps.normalizeNodeForHtml(node);
    const kind = deps.getKind(normalized);
    if (kind === "text") return escapeHtml(deps.getText(normalized) ?? "");
    if (kind === "live_text") return escapeHtml(String(deps.getSignalValue(normalized) ?? ""));
    const children2 = deps.getChildren(normalized).map((child) => vnodeToHtml(child)).join("");
    if (kind === "fragment" || kind === "portal") return children2;
    const tag = deps.getTag(normalized) ?? "div";
    const attrs = serializePropsToHtml(deps.getProps(normalized));
    if (voidHtmlTags.has(tag.toLowerCase())) {
      return `<${tag}${attrs}>`;
    }
    return `<${tag}${attrs}>${children2}</${tag}>`;
  }, "vnodeToHtml");
  return {
    renderToString: vnodeToHtml,
    createRenderer: /* @__PURE__ */ __name(() => {
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
    }, "createRenderer")
  };
}, "createSsrRuntime");

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
  getOption: /* @__PURE__ */ __name(() => Option2, "getOption"),
  getResult: /* @__PURE__ */ __name(() => Result, "getResult"),
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
configureCollectionsRuntime({
  getOption: /* @__PURE__ */ __name(() => Option2, "getOption"),
  timeSleep: /* @__PURE__ */ __name((ms) => systemRuntime.time.sleep(ms), "timeSleep")
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
  getOption: /* @__PURE__ */ __name(() => Option2, "getOption"),
  getResult: /* @__PURE__ */ __name(() => Result, "getResult"),
  isEnumLike,
  getEnumTag
});
var async_channel = channel;
var concurrencyRuntime = createConcurrencyRuntime({
  getOption: /* @__PURE__ */ __name(() => Option2, "getOption"),
  getResult: /* @__PURE__ */ __name(() => Result, "getResult"),
  getChannel: /* @__PURE__ */ __name(() => channel, "getChannel"),
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
  optionSome: /* @__PURE__ */ __name((value) => Option2.Some(value), "optionSome"),
  optionNone: Option2.None,
  resultOk: /* @__PURE__ */ __name((value) => Result.Ok(value), "resultOk"),
  resultErr: /* @__PURE__ */ __name((message) => Result.Err(message), "resultErr"),
  createHashMap: /* @__PURE__ */ __name(() => HashMap.new(), "createHashMap")
});
var url = browserRuntime.url;
var web_storage = browserRuntime.web_storage;
var dom = browserRuntime.dom;
var router = browserRuntime.router;
var webgpu = createWebGpuRuntime({
  resultOk: /* @__PURE__ */ __name((value) => Result.Ok(value), "resultOk"),
  resultErr: /* @__PURE__ */ __name((message) => Result.Err(message), "resultErr"),
  isEnumLike,
  getEnumTag,
  getEnumPayload
});
var runMicrotask = /* @__PURE__ */ __name((fn) => {
  const queue = globalThis.queueMicrotask;
  if (typeof queue === "function") {
    queue(fn);
    return;
  }
  Promise.resolve().then(fn);
}, "runMicrotask");
var devtools = createDevtoolsController({
  scheduleMicrotask: runMicrotask,
  snapshotRoot: /* @__PURE__ */ __name((root, id) => ({
    id,
    current: root.root.currentNode(),
    frames: [
      ...Array.from(root.frameManager.rootFrame.keyedChildren.values()).map(snapshotComponentFrame),
      ...root.frameManager.rootFrame.unkeyedChildren.map(snapshotComponentFrame)
    ]
  }), "snapshotRoot"),
  snapshotResources: /* @__PURE__ */ __name(() => listResourceRecords().map((record) => ({
    key: record.key,
    status: record.status.peek(),
    hasData: record.hasData.peek(),
    error: record.error.peek()
  })), "snapshotResources")
});
var registerDevtoolsSignal = /* @__PURE__ */ __name((kind, signal) => devtools.registerSignal(kind, signal), "registerDevtoolsSignal");
var unregisterDevtoolsSignal = /* @__PURE__ */ __name((id) => {
  devtools.unregisterSignal(id);
}, "unregisterDevtoolsSignal");
var scheduleDevtoolsNotify = /* @__PURE__ */ __name(() => {
  devtools.scheduleNotify();
}, "scheduleDevtoolsNotify");
configureReactiveCore({
  cloneValue: __lumina_clone,
  equalsValue: runtimeEquals,
  scheduleMicrotask: runMicrotask,
  registerSignal: registerDevtoolsSignal,
  unregisterSignal: unregisterDevtoolsSignal,
  notifyDevtools: scheduleDevtoolsNotify
});
configureResourceCore({
  serializeKey: /* @__PURE__ */ __name((key) => {
    try {
      return toJsonString(key, false);
    } catch {
      return String(key);
    }
  }, "serializeKey"),
  notifyDevtools: scheduleDevtoolsNotify
});
var createDomRenderer2 = /* @__PURE__ */ __name((options) => createDomRenderer(options, runtimeEquals), "createDomRenderer");
var ssrRuntime = createSsrRuntime({
  normalizeNodeForHtml: /* @__PURE__ */ __name((node) => {
    if (node.kind === "index_list") {
      return vnodeElement("lumina-index-list", indexListHostProps, materializeIndexListChildren(node, false));
    }
    if (node.kind === "for_list") {
      return vnodeElement("lumina-for-list", forListHostProps, materializeForListChildren(node, false));
    }
    return node;
  }, "normalizeNodeForHtml"),
  getKind: /* @__PURE__ */ __name((node) => node.kind, "getKind"),
  getTag: /* @__PURE__ */ __name((node) => node.tag, "getTag"),
  getProps: /* @__PURE__ */ __name((node) => node.props, "getProps"),
  getChildren: /* @__PURE__ */ __name((node) => node.children ?? [], "getChildren"),
  getText: /* @__PURE__ */ __name((node) => node.text, "getText"),
  getSignalValue: /* @__PURE__ */ __name((node) => node.signal?.get(), "getSignalValue")
});
var createSsrRenderer = /* @__PURE__ */ __name(() => ssrRuntime.createRenderer(), "createSsrRenderer");
var renderToString = /* @__PURE__ */ __name((node) => ssrRuntime.renderToString(node), "renderToString");
var renderTargetsRuntime = createRenderTargetsRuntime({
  getKind: /* @__PURE__ */ __name((node) => node.kind, "getKind"),
  getTag: /* @__PURE__ */ __name((node) => node.tag, "getTag"),
  getProps: /* @__PURE__ */ __name((node) => node.props, "getProps"),
  getChildren: /* @__PURE__ */ __name((node) => node.children ?? [], "getChildren"),
  getText: /* @__PURE__ */ __name((node) => node.text, "getText"),
  getSignalValue: /* @__PURE__ */ __name((node) => node.signal?.get(), "getSignalValue"),
  materializeIndexListChildren: /* @__PURE__ */ __name((node, tracked) => materializeIndexListChildren(node, tracked), "materializeIndexListChildren"),
  materializeForListChildren: /* @__PURE__ */ __name((node, tracked) => materializeForListChildren(node, tracked), "materializeForListChildren")
});
var frameRuntime = createFrameRuntime({
  coerceRenderable: /* @__PURE__ */ __name((input) => coerceRenderableToVNode(input), "coerceRenderable"),
  createState: /* @__PURE__ */ __name((initial) => new Signal(initial), "createState")
});
var transitionRuntime = createTransitionRuntime({
  state: /* @__PURE__ */ __name((initial) => frameRuntime.state(initial), "state"),
  remember: frameRuntime.remember,
  mergeProps,
  element: vnodeElement,
  fragment: vnodeFragment,
  resolveChildrenInput: /* @__PURE__ */ __name((children2) => normalizeVNodeChildren(resolveChildrenInput(children2)), "resolveChildrenInput"),
  runMicrotask
});
var runWithFrameManager2 = frameRuntime.runWithFrameManager;
var createCanvasRenderer = /* @__PURE__ */ __name((options) => renderTargetsRuntime.createCanvasRenderer(options), "createCanvasRenderer");
var renderToTerminal = /* @__PURE__ */ __name((node) => renderTargetsRuntime.renderToTerminal(node), "renderToTerminal");
var createTerminalRenderer = /* @__PURE__ */ __name(() => renderTargetsRuntime.createTerminalRenderer(), "createTerminalRenderer");
var _RenderRoot2 = class _RenderRoot2 extends RenderRoot {
};
__name(_RenderRoot2, "RenderRoot");
var RenderRoot2 = _RenderRoot2;
var _ReactiveRenderRoot2 = class _ReactiveRenderRoot2 extends ReactiveRenderRoot {
  constructor(root, effect, frameManager) {
    super(root, effect, frameManager, {
      onInit: /* @__PURE__ */ __name((root2) => registerDevtoolsRoot(root2), "onInit"),
      onDispose: /* @__PURE__ */ __name((root2) => unregisterDevtoolsRoot(root2), "onDispose")
    });
    __publicField(this, "root");
    __publicField(this, "effect");
    __publicField(this, "frameManager");
    this.root = root, this.effect = effect, this.frameManager = frameManager;
  }
};
__name(_ReactiveRenderRoot2, "ReactiveRenderRoot");
var ReactiveRenderRoot2 = _ReactiveRenderRoot2;
var registerDevtoolsRoot = /* @__PURE__ */ __name((root) => {
  devtools.registerRoot(root);
}, "registerDevtoolsRoot");
var unregisterDevtoolsRoot = /* @__PURE__ */ __name((root) => {
  devtools.unregisterRoot(root);
}, "unregisterDevtoolsRoot");
var snapshotDevtools = /* @__PURE__ */ __name(() => devtools.snapshot(), "snapshotDevtools");
var installLuminaDevtools = /* @__PURE__ */ __name((key = "__LUMINA_DEVTOOLS__") => devtools.install(key), "installLuminaDevtools");
var toRenderErrorMessage = /* @__PURE__ */ __name((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Canvas renderer requires")) {
    return "Canvas renderer not available in this environment";
  }
  if (message.includes("Terminal renderer")) {
    return "Terminal renderer not available in this environment";
  }
  if (message.toLowerCase().includes("not supported")) {
    return "Canvas renderer not available in this environment";
  }
  return message;
}, "toRenderErrorMessage");
var rootRuntime = createRootRuntime({
  createRenderRoot: /* @__PURE__ */ __name((renderer, container) => new RenderRoot2(renderer, container), "createRenderRoot"),
  createFrameManager: /* @__PURE__ */ __name(() => new FrameManager(), "createFrameManager"),
  runWithFrameManager: runWithFrameManager2,
  createReactiveRoot: /* @__PURE__ */ __name((root, effect, frameManager) => new ReactiveRenderRoot2(root, effect, frameManager), "createReactiveRoot"),
  renderError: /* @__PURE__ */ __name((message) => Result.Err(message), "renderError"),
  toRenderErrorMessage
});
var coerceRenderer3 = /* @__PURE__ */ __name((candidate) => rootRuntime.coerceRenderer(candidate), "coerceRenderer");
var mountReactiveView = /* @__PURE__ */ __name((renderer, container, view) => rootRuntime.mountReactiveView(renderer, container, view), "mountReactiveView");
var hydrateReactiveView = /* @__PURE__ */ __name((renderer, container, view) => rootRuntime.hydrateReactiveView(renderer, container, view), "hydrateReactiveView");
var appRuntime = createAppRuntime({
  createFrameManager: /* @__PURE__ */ __name(() => new FrameManager(), "createFrameManager"),
  runWithFrameManager: runWithFrameManager2,
  component: /* @__PURE__ */ __name((componentFn, props) => applyVNodeKey(frameRuntime.component(componentFn, props), void 0), "component"),
  createDomRenderer: /* @__PURE__ */ __name((options) => createDomRenderer2(options), "createDomRenderer"),
  mountReactive: mountReactiveView,
  hydrateReactive: hydrateReactiveView,
  createSignal: /* @__PURE__ */ __name((initial) => new Signal(initial), "createSignal"),
  getSignal: /* @__PURE__ */ __name((signal) => signal.get(), "getSignal"),
  setSignal: /* @__PURE__ */ __name((signal, value) => {
    signal.set(value);
  }, "setSignal"),
  isDisposableLike,
  disposeReactive: /* @__PURE__ */ __name((root) => {
    if (!isDisposableLike(root)) return;
    root.dispose();
  }, "disposeReactive"),
  getGlobalDocument: /* @__PURE__ */ __name(() => globalThis.document, "getGlobalDocument"),
  isVNode,
  renderToString,
  coerceRenderableToVNode: /* @__PURE__ */ __name((value) => coerceRenderableToVNode(value), "coerceRenderableToVNode"),
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
  renderToTerminal,
  createDomRenderer: createDomRenderer2,
  createSsrRenderer,
  createCanvasRenderer,
  createTerminalRenderer,
  coerceRenderer: coerceRenderer3,
  RenderRoot: RenderRoot2,
  mountReactiveView,
  hydrateReactiveView,
  renderError: /* @__PURE__ */ __name((message) => Result.Err(message), "renderError"),
  toRenderErrorMessage,
  snapshotDevtools,
  installLuminaDevtools,
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
  resourceInvalidate: render.resource_invalidate,
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
  testingQueryAllByRole: render.testing_query_all_by_role,
  devtoolsSnapshot: render.devtools_snapshot,
  installDevtools: render.install_devtools,
  ssgPage: render.ssg_page,
  ssgRenderApp: render.ssg_render_app,
  ssgWritePage: render.ssg_write_page,
  ssgWriteApp: render.ssg_write_app
};
var { createSignal, get, set, createMemo, createEffect, batch: batch2, untrack: untrack2, component, component_keyed, renderApp, renderToStringApp, createContext, create_required_context, withContext, useContext, state, remember, createResource, resourceStatus, resourceData, resourceError, resourceRead, resourceRefresh, resourceInvalidate, resourceMutate, suspense, errorBoundary, show, mountApp, hydrateApp, testingCreateDomHarness, testingMountApp, testingHydrateApp, testingContainer, testingBody, testingGetById, testingTextContent, testingClick, testingInput, testingChangeChecked, testingKeydown, testingSubmit, mountCustomElement, defineCustomElement, children, slot, slot_or, compose_handlers, portal, portalBody, tabsRoot, tabsList, tabsTrigger, tabsPanel, dialogRoot, dialogPortal, dialogTrigger, dialogOverlay, dialogContent, dialogTitle, dialogDescription, dialogClose, popoverRoot, popoverPortal, popoverTrigger, popoverContent, tooltipRoot, tooltipPortal, tooltipTrigger, tooltipContent, toastRoot, toastPortal, toastContent, toastTitle, toastDescription, toastClose, menuRoot, menuPortal, menuTrigger, menuContent, menuItem, selectRoot, selectPortal, selectTrigger, selectContent, selectItem, selectIndicator, comboboxRoot, comboboxPortal, comboboxInput, comboboxContent, comboboxItem, comboboxIndicator, multiselectRoot, multiselectPortal, multiselectTrigger, multiselectContent, multiselectItem, multiselectIndicator, checkboxRoot, checkboxIndicator, radioGroup, radioItem, radioIndicator, vnode, text, liveText, indexList, forList, mount_reactive, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_id, props_style, props_value, props_checked, props_type, props_name, props_placeholder, props_href, props_disabled, props_on_input, props_on_change, props_on_checked_change, props_on_submit, props_key, props_attr, props_when, props_merge, dom_get_element_by_id, transitionPresence, testingGetByText, testingGetByRole, testingQueryAllByRole, devtoolsSnapshot, installDevtools, ssgPage, ssgRenderApp, ssgWritePage, ssgWriteApp } = renderSurface;
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
  devtoolsSnapshot,
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
  renderToString,
  renderToStringApp,
  renderToTerminal,
  resourceData,
  resourceError,
  resourceInvalidate,
  resourceMutate,
  resourceRead,
  resourceRefresh,
  resourceStatus,
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
  testingGetById,
  testingGetByRole,
  testingGetByText,
  testingHydrateApp,
  testingInput,
  testingKeydown,
  testingMountApp,
  testingQueryAllByRole,
  testingSubmit,
  testingTextContent,
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
//# sourceMappingURL=lumina-runtime.js.map