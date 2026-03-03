"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/lumina-runtime.ts
var lumina_runtime_exports = {};
__export(lumina_runtime_exports, {
  AtomicI32: () => AtomicI32,
  BTreeMap: () => BTreeMap,
  BTreeSet: () => BTreeSet,
  Deque: () => Deque,
  Effect: () => Effect,
  HashMap: () => HashMap,
  HashSet: () => HashSet,
  LuminaPanic: () => LuminaPanic,
  Memo: () => Memo,
  Mutex: () => Mutex,
  Option: () => Option,
  PriorityQueue: () => PriorityQueue,
  ReactiveRenderRoot: () => ReactiveRenderRoot,
  Receiver: () => Receiver,
  RenderRoot: () => RenderRoot,
  Result: () => Result,
  Semaphore: () => Semaphore,
  Sender: () => Sender,
  Signal: () => Signal,
  Thread: () => Thread,
  ThreadHandle: () => ThreadHandle,
  Vec: () => Vec,
  __lumina_array_bounds_check: () => __lumina_array_bounds_check,
  __lumina_array_literal: () => __lumina_array_literal,
  __lumina_clone: () => __lumina_clone,
  __lumina_debug: () => __lumina_debug,
  __lumina_eq: () => __lumina_eq,
  __lumina_fixed_array: () => __lumina_fixed_array,
  __lumina_index: () => __lumina_index,
  __lumina_range: () => __lumina_range,
  __lumina_register_trait_impl: () => __lumina_register_trait_impl,
  __lumina_slice: () => __lumina_slice,
  __lumina_stringify: () => __lumina_stringify,
  __lumina_struct: () => __lumina_struct,
  __set: () => __set,
  applicative: () => applicative,
  async_channel: () => async_channel,
  btreemap: () => btreemap,
  btreeset: () => btreeset,
  channel: () => channel,
  createCanvasRenderer: () => createCanvasRenderer,
  createDomRenderer: () => createDomRenderer,
  createEffect: () => createEffect,
  createMemo: () => createMemo,
  createSignal: () => createSignal,
  createSsrRenderer: () => createSsrRenderer,
  createTerminalRenderer: () => createTerminalRenderer,
  crypto: () => crypto,
  deque: () => deque,
  dom_get_element_by_id: () => dom_get_element_by_id,
  env: () => env,
  foldable: () => foldable,
  formatValue: () => formatValue,
  fs: () => fs,
  functor: () => functor,
  get: () => get,
  hashmap: () => hashmap,
  hashset: () => hashset,
  http: () => http,
  io: () => io,
  isVNode: () => isVNode,
  join_all: () => join_all,
  json: () => json,
  list: () => list,
  math: () => math,
  monad: () => monad,
  mount_reactive: () => mount_reactive,
  parseVNode: () => parseVNode,
  path: () => path,
  priority_queue: () => priority_queue,
  process: () => process,
  props_class: () => props_class,
  props_empty: () => props_empty,
  props_merge: () => props_merge,
  props_on_click: () => props_on_click,
  props_on_click_dec: () => props_on_click_dec,
  props_on_click_delta: () => props_on_click_delta,
  props_on_click_inc: () => props_on_click_inc,
  reactive: () => reactive,
  regex: () => regex,
  render: () => render,
  renderToString: () => renderToString,
  renderToTerminal: () => renderToTerminal,
  serializeVNode: () => serializeVNode,
  set: () => set,
  str: () => str,
  sync: () => sync,
  text: () => text,
  thread: () => thread,
  time: () => time,
  timeout: () => timeout,
  toJsonString: () => toJsonString,
  traversable: () => traversable,
  vec: () => vec,
  vnode: () => vnode,
  vnodeElement: () => vnodeElement,
  vnodeFragment: () => vnodeFragment,
  vnodeText: () => vnodeText
});
module.exports = __toCommonJS(lumina_runtime_exports);
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
var isNodeRuntime = /* @__PURE__ */ __name(() => typeof globalThis.process !== "undefined" && typeof globalThis.process?.versions?.node === "string", "isNodeRuntime");
var getNodeProcess = /* @__PURE__ */ __name(() => {
  const candidate = globalThis.process;
  return candidate ?? null;
}, "getNodeProcess");
var cachedNodeRequire;
var cachedNodePath;
var cachedReadFileSync;
var cachedSpawnSync;
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
var __lumina_index = /* @__PURE__ */ __name((target, index, expectedSize) => {
  if (typeof target === "string" && isRangeValue(index)) {
    const length = target.length;
    const start = index.start == null ? 0 : clampIndex(Math.trunc(index.start), 0, length);
    const endBase = index.end == null ? length : clampIndex(Math.trunc(index.end), 0, length);
    return __lumina_slice(target, start, endBase, index.inclusive);
  }
  if (target && typeof target.get === "function") {
    const result = target.get(Math.trunc(Number(index)));
    const tag = result && typeof result === "object" && isEnumLike(result) ? getEnumTag(result) : "";
    if (tag === "Some") return getEnumPayload(result);
    const err = new LuminaPanic("Index out of bounds", result);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, __lumina_index);
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
var cloneFallback = /* @__PURE__ */ __name((value) => {
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
var toJsonValue = /* @__PURE__ */ __name((value, seen) => {
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
    if (isEnumLike(value)) {
      const tag = getEnumTag(value);
      const payload = getEnumPayload(value);
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
function toJsonString(value, pretty = true) {
  const normalized = toJsonValue(value, /* @__PURE__ */ new WeakSet());
  return JSON.stringify(normalized, null, pretty ? 2 : void 0);
}
__name(toJsonString, "toJsonString");
var renderArgs = /* @__PURE__ */ __name((args) => args.map((arg) => formatValue(arg)).join(" "), "renderArgs");
var writeStdout = /* @__PURE__ */ __name((text2, newline) => {
  if (isNodeRuntime()) {
    const stdout = getNodeProcess()?.stdout;
    if (stdout?.write) {
      stdout.write(text2 + (newline ? "\n" : ""));
      return;
    }
  }
  console.log(text2);
}, "writeStdout");
var writeStderr = /* @__PURE__ */ __name((text2, newline) => {
  if (isNodeRuntime()) {
    const stderr = getNodeProcess()?.stderr;
    if (stderr?.write) {
      stderr.write(text2 + (newline ? "\n" : ""));
      return;
    }
  }
  console.error(text2);
}, "writeStderr");
var stdinCache = null;
var stdinIndex = 0;
var readStdinLines = /* @__PURE__ */ __name(() => {
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
var unwrapOption = /* @__PURE__ */ __name((value) => {
  if (isEnumLike(value)) {
    const tag = getEnumTag(value);
    if (tag === "Some") return {
      isSome: true,
      value: getEnumPayload(value)
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
var io = {
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
      return value2 == null ? Option.None : Option.Some(value2);
    }
    if (typeof globalThis.prompt === "function") {
      const value2 = globalThis.prompt?.();
      return value2 == null ? Option.None : Option.Some(value2);
    }
    const lines = readStdinLines();
    if (stdinIndex >= lines.length) return Option.None;
    const value = lines[stdinIndex++];
    return Option.Some(value);
  }, "readLine"),
  readLineAsync: /* @__PURE__ */ __name(async () => {
    const globalAny = globalThis;
    if (globalAny.__luminaStdin !== void 0) {
      const lines = readStdinLines();
      if (stdinIndex >= lines.length) return Option.None;
      const value = lines[stdinIndex++];
      return Option.Some(value);
    }
    if (isNodeRuntime()) {
      const nodeProcess = getNodeProcess();
      const stdin = nodeProcess?.stdin;
      if (stdin && stdin.isTTY !== true) {
        const lines = readStdinLines();
        if (stdinIndex >= lines.length) return Option.None;
        const value = lines[stdinIndex++];
        return Option.Some(value);
      }
      if (stdin?.isTTY) {
        const readline = await import("readline");
        const rl = readline.createInterface({
          input: nodeProcess?.stdin,
          output: nodeProcess?.stdout
        });
        return await new Promise((resolve) => {
          rl.question("", (answer) => {
            rl.close();
            resolve(Option.Some(answer));
          });
        });
      }
    }
    if (typeof globalThis.prompt === "function") {
      const value = globalThis.prompt?.();
      return value == null ? Option.None : Option.Some(value);
    }
    return Option.None;
  }, "readLineAsync"),
  printJson: /* @__PURE__ */ __name((value, pretty = true) => {
    console.log(toJsonString(value, pretty));
  }, "printJson")
};
var str = {
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
    return __lumina_slice(value, start ?? void 0, end ?? void 0, !!range?.inclusive);
  }, "slice"),
  split: /* @__PURE__ */ __name((value, sep) => value.split(sep), "split"),
  trim: /* @__PURE__ */ __name((value) => value.trim(), "trim"),
  contains: /* @__PURE__ */ __name((haystack, needle) => haystack.includes(needle), "contains"),
  eq: /* @__PURE__ */ __name((a, b) => a === b, "eq"),
  char_at: /* @__PURE__ */ __name((value, index) => {
    if (Number.isNaN(index) || index < 0 || index >= value.length) return Option.None;
    return Option.Some(value.charAt(index));
  }, "char_at"),
  is_whitespace: /* @__PURE__ */ __name((value) => value === " " || value === "\n" || value === "	" || value === "\r", "is_whitespace"),
  is_digit: /* @__PURE__ */ __name((value) => {
    if (!value || value.length === 0) return false;
    const code = value.charCodeAt(0);
    return code >= 48 && code <= 57;
  }, "is_digit"),
  to_int: /* @__PURE__ */ __name((value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? Result.Err(`Invalid int: ${value}`) : Result.Ok(parsed);
  }, "to_int"),
  to_float: /* @__PURE__ */ __name((value) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? Result.Err(`Invalid float: ${value}`) : Result.Ok(parsed);
  }, "to_float"),
  from_int: /* @__PURE__ */ __name((value) => String(Math.trunc(value)), "from_int"),
  from_float: /* @__PURE__ */ __name((value) => String(value), "from_float")
};
var math = {
  abs: /* @__PURE__ */ __name((value) => Math.trunc(Math.abs(value)), "abs"),
  min: /* @__PURE__ */ __name((a, b) => Math.trunc(Math.min(a, b)), "min"),
  max: /* @__PURE__ */ __name((a, b) => Math.trunc(Math.max(a, b)), "max"),
  absf: /* @__PURE__ */ __name((value) => Math.abs(value), "absf"),
  minf: /* @__PURE__ */ __name((a, b) => Math.min(a, b), "minf"),
  maxf: /* @__PURE__ */ __name((a, b) => Math.max(a, b), "maxf"),
  sqrt: /* @__PURE__ */ __name((value) => Math.sqrt(value), "sqrt"),
  pow: /* @__PURE__ */ __name((base, exp) => Math.pow(base, exp), "pow"),
  floor: /* @__PURE__ */ __name((value) => Math.floor(value), "floor"),
  ceil: /* @__PURE__ */ __name((value) => Math.ceil(value), "ceil"),
  round: /* @__PURE__ */ __name((value) => Math.round(value), "round"),
  pi: Math.PI,
  e: Math.E
};
var fs = {
  readFile: /* @__PURE__ */ __name(async (path2) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import("fs/promises");
        const content = await fsPromises.readFile(path2, "utf8");
        return Result.Ok(content);
      }
      if (typeof fetch !== "undefined") {
        const response = await fetch(path2);
        if (!response.ok) {
          return Result.Err(`HTTP ${response.status}: ${response.statusText}`);
        }
        const content = await response.text();
        return Result.Ok(content);
      }
      return Result.Err("No file system available");
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "readFile"),
  writeFile: /* @__PURE__ */ __name(async (path2, content) => {
    try {
      if (isNodeRuntime()) {
        const fsPromises = await import("fs/promises");
        await fsPromises.writeFile(path2, content, "utf8");
        return Result.Ok(void 0);
      }
      return Result.Err("writeFile not supported in browser");
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "writeFile"),
  readDir: /* @__PURE__ */ __name(async (path2) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err("readDir is not supported in browser");
      }
      const fsPromises = await import("fs/promises");
      const entries = await fsPromises.readdir(path2);
      return Result.Ok(entries);
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "readDir"),
  metadata: /* @__PURE__ */ __name(async (path2) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err("metadata is not supported in browser");
      }
      const fsPromises = await import("fs/promises");
      const stats = await fsPromises.stat(path2);
      return Result.Ok({
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: Math.trunc(stats.size),
        modifiedMs: Math.trunc(stats.mtimeMs)
      });
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "metadata"),
  exists: /* @__PURE__ */ __name(async (path2) => {
    try {
      if (!isNodeRuntime()) return false;
      const fsPromises = await import("fs/promises");
      await fsPromises.access(path2);
      return true;
    } catch {
      return false;
    }
  }, "exists"),
  mkdir: /* @__PURE__ */ __name(async (path2, recursive = true) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err("mkdir is not supported in browser");
      }
      const fsPromises = await import("fs/promises");
      await fsPromises.mkdir(path2, {
        recursive: !!recursive
      });
      return Result.Ok(void 0);
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "mkdir"),
  removeFile: /* @__PURE__ */ __name(async (path2) => {
    try {
      if (!isNodeRuntime()) {
        return Result.Err("removeFile is not supported in browser");
      }
      const fsPromises = await import("fs/promises");
      await fsPromises.unlink(path2);
      return Result.Ok(void 0);
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "removeFile")
};
var path = {
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
    if (!ext) return Option.None;
    return Option.Some(ext.startsWith(".") ? ext.slice(1) : ext);
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
var env = {
  var: /* @__PURE__ */ __name((name) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err("Environment variables are not available in this runtime");
    }
    const value = nodeProcess.env?.[String(name)];
    if (value === void 0) {
      return Result.Err(`Environment variable '${name}' is not set`);
    }
    return Result.Ok(String(value));
  }, "var"),
  set_var: /* @__PURE__ */ __name((name, value) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err("Environment variables are not available in this runtime");
    }
    nodeProcess.env[String(name)] = String(value);
    return Result.Ok(void 0);
  }, "set_var"),
  remove_var: /* @__PURE__ */ __name((name) => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err("Environment variables are not available in this runtime");
    }
    delete nodeProcess.env[String(name)];
    return Result.Ok(void 0);
  }, "remove_var"),
  args: /* @__PURE__ */ __name(() => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) return [];
    return nodeProcess.argv.slice(2);
  }, "args"),
  cwd: /* @__PURE__ */ __name(() => {
    const nodeProcess = getNodeProcess();
    if (!nodeProcess) {
      return Result.Err("Current working directory is not available in this runtime");
    }
    return Result.Ok(nodeProcess.cwd());
  }, "cwd")
};
var process = {
  spawn: /* @__PURE__ */ __name((command, args = []) => {
    if (!isNodeRuntime()) {
      return Result.Err("Process spawning is not available in this runtime");
    }
    const commandText = String(command).trim();
    if (!commandText) {
      return Result.Err("Process command must be a non-empty string");
    }
    const argv = toIterableValues(args).map((part) => String(part));
    try {
      const spawn = getNodeSpawnSync();
      if (!spawn) {
        return Result.Err("Process spawning is not available in this runtime");
      }
      const output = spawn(commandText, argv, {
        encoding: "utf8",
        shell: false,
        windowsHide: true
      });
      if (output.error) {
        return Result.Err(output.error.message || String(output.error));
      }
      return Result.Ok({
        status: typeof output.status === "number" ? Math.trunc(output.status) : -1,
        success: output.status === 0,
        stdout: typeof output.stdout === "string" ? output.stdout : String(output.stdout ?? ""),
        stderr: typeof output.stderr === "string" ? output.stderr : String(output.stderr ?? "")
      });
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
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
var json = {
  to_string: /* @__PURE__ */ __name((value) => {
    try {
      return Result.Ok(JSON.stringify(value));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  }, "to_string"),
  to_pretty_string: /* @__PURE__ */ __name((value) => {
    try {
      return Result.Ok(toJsonString(value, true));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  }, "to_pretty_string"),
  from_string: /* @__PURE__ */ __name((source) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  }, "from_string"),
  parse: /* @__PURE__ */ __name((source) => {
    try {
      return Result.Ok(JSON.parse(String(source)));
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
    }
  }, "parse")
};
var http = {
  fetch: /* @__PURE__ */ __name(async (request) => {
    if (typeof fetch !== "function") {
      return Result.Err("Fetch API is not available");
    }
    if (!request || typeof request !== "object") {
      return Result.Err("Invalid request");
    }
    const req = request;
    const rawUrl = typeof req.url === "string" ? req.url : "";
    if (!rawUrl) {
      return Result.Err("Invalid request url");
    }
    let url;
    try {
      url = validateHttpUrl(rawUrl);
    } catch (error) {
      return Result.Err(error instanceof Error ? error.message : String(error));
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
      const response = await fetch(url, {
        method,
        headers,
        body
      });
      const text2 = await response.text();
      const responseHeaders = Array.from(response.headers.entries()).map(([name, value]) => ({
        name,
        value
      }));
      return Result.Ok({
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: text2
      });
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "fetch"),
  get: /* @__PURE__ */ __name(async (url) => await http.fetch({
    url,
    method: "GET",
    headers: Option.None,
    body: Option.None
  }), "get"),
  post: /* @__PURE__ */ __name(async (url, body) => await http.fetch({
    url,
    method: "POST",
    headers: Option.None,
    body: body === void 0 ? Option.None : Option.Some(typeof body === "string" ? body : JSON.stringify(body))
  }), "post"),
  put: /* @__PURE__ */ __name(async (url, body) => await http.fetch({
    url,
    method: "PUT",
    headers: Option.None,
    body: body === void 0 ? Option.None : Option.Some(typeof body === "string" ? body : JSON.stringify(body))
  }), "put"),
  del: /* @__PURE__ */ __name(async (url) => await http.fetch({
    url,
    method: "DELETE",
    headers: Option.None,
    body: Option.None
  }), "del")
};
var getMonotonicNow = /* @__PURE__ */ __name(() => {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}, "getMonotonicNow");
var time = {
  nowMs: /* @__PURE__ */ __name(() => Math.trunc(Date.now()), "nowMs"),
  nowIso: /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso"),
  instantNow: /* @__PURE__ */ __name(() => Math.trunc(getMonotonicNow()), "instantNow"),
  elapsedMs: /* @__PURE__ */ __name((since) => Math.max(0, Math.trunc(getMonotonicNow()) - Math.trunc(since)), "elapsedMs"),
  sleep: /* @__PURE__ */ __name(async (ms) => await new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Math.trunc(ms)));
  }), "sleep")
};
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
var compileRegex = /* @__PURE__ */ __name((pattern, flags = "") => {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}, "compileRegex");
var regex = {
  isValid: /* @__PURE__ */ __name((pattern, flags = "") => compileRegex(pattern, flags) !== null, "isValid"),
  test: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(re.test(text2));
  }, "test"),
  find: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
    const re = compileRegex(pattern, flags);
    if (!re) return Option.None;
    const match = text2.match(re);
    if (!match) return Option.None;
    return Option.Some(match[0]);
  }, "find"),
  findAll: /* @__PURE__ */ __name((pattern, text2, flags = "") => {
    const normalizedFlags = flags.includes("g") ? flags : `${flags}g`;
    const re = compileRegex(pattern, normalizedFlags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${normalizedFlags}`);
    const matches = Array.from(text2.matchAll(re)).map((m) => m[0]);
    return Result.Ok(matches);
  }, "findAll"),
  replace: /* @__PURE__ */ __name((pattern, text2, replacement, flags = "") => {
    const re = compileRegex(pattern, flags);
    if (!re) return Result.Err(`Invalid regex: /${pattern}/${flags}`);
    return Result.Ok(text2.replace(re, replacement));
  }, "replace")
};
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
var crypto = {
  isAvailable: /* @__PURE__ */ __name(async () => await getWebCrypto() !== null, "isAvailable"),
  sha256: /* @__PURE__ */ __name(async (value) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err("Crypto API is not available");
      const digest = await web.subtle.digest("SHA-256", utf8Encode(value));
      return Result.Ok(toHex(new Uint8Array(digest)));
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "sha256"),
  hmacSha256: /* @__PURE__ */ __name(async (key, value) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err("Crypto API is not available");
      const cryptoKey = await web.subtle.importKey("raw", utf8Encode(key), {
        name: "HMAC",
        hash: "SHA-256"
      }, false, [
        "sign"
      ]);
      const signature = await web.subtle.sign("HMAC", cryptoKey, utf8Encode(value));
      return Result.Ok(toHex(new Uint8Array(signature)));
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "hmacSha256"),
  randomBytes: /* @__PURE__ */ __name(async (length) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err("Crypto API is not available");
      const n = Math.max(0, Math.trunc(length));
      const bytes = new Uint8Array(n);
      web.getRandomValues(bytes);
      return Result.Ok(Array.from(bytes).map((b) => b | 0));
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "randomBytes"),
  randomInt: /* @__PURE__ */ __name(async (min, max) => {
    const lower = Math.trunc(Math.min(min, max));
    const upper = Math.trunc(Math.max(min, max));
    const span = upper - lower + 1;
    if (span <= 0) return Result.Err("Invalid range");
    const random = await crypto.randomBytes(4);
    if (!isEnumLike(random) || getEnumTag(random) !== "Ok") return random;
    const bytes = getEnumPayload(random);
    if (!Array.isArray(bytes) || bytes.length < 4) return Result.Err("Failed to generate randomness");
    const packed = new Uint8Array([
      bytes[0],
      bytes[1],
      bytes[2],
      bytes[3]
    ]);
    const value = new DataView(packed.buffer).getUint32(0, false);
    return Result.Ok(lower + value % span);
  }, "randomInt"),
  aesGcmEncrypt: /* @__PURE__ */ __name(async (key, plaintext) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err("Crypto API is not available");
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
      return Result.Ok(toBase64(packed));
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "aesGcmEncrypt"),
  aesGcmDecrypt: /* @__PURE__ */ __name(async (key, payloadBase64) => {
    try {
      const web = await getWebCrypto();
      if (!web) return Result.Err("Crypto API is not available");
      const packed = fromBase64(payloadBase64);
      if (packed.length < 13) return Result.Err("Invalid AES payload");
      const iv = packed.slice(0, 12);
      const cipher = packed.slice(12);
      const aesKey = await deriveAesKey(web, key, "decrypt");
      const plain = await web.subtle.decrypt({
        name: "AES-GCM",
        iv
      }, aesKey, cipher);
      return Result.Ok(utf8Decode(new Uint8Array(plain)));
    } catch (error) {
      return Result.Err(String(error));
    }
  }, "aesGcmDecrypt")
};
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
    return found === void 0 ? Option.None : Option.Some(found);
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
    if (!Number.isFinite(index)) return Option.None;
    const idx = Math.trunc(index);
    return idx >= 0 && idx < this.data.length ? Option.Some(this.data[idx]) : Option.None;
  }
  len() {
    return this.data.length;
  }
  pop() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop();
    return Option.Some(value);
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
    return found === void 0 ? Option.None : Option.Some(found);
  }
  position(predicate) {
    const idx = this.data.findIndex(predicate);
    return idx >= 0 ? Option.Some(idx) : Option.None;
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
  await time.sleep(ms);
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
  enumerate: /* @__PURE__ */ __name((v) => v.enumerate(), "enumerate")
};
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
        return Option.Some(old);
      }
    }
    bucket.push({
      key,
      value
    });
    this.sizeValue += 1;
    return Option.None;
  }
  get(key) {
    const bucket = this.lookupBucket(key);
    if (!bucket) return Option.None;
    for (const entry of bucket) {
      if (runtimeEquals(entry.key, key)) {
        return Option.Some(entry.value);
      }
    }
    return Option.None;
  }
  remove(key) {
    const hash = runtimeHashValue(key);
    const bucket = this.buckets.get(hash);
    if (!bucket || bucket.length === 0) return Option.None;
    for (let i = 0; i < bucket.length; i += 1) {
      if (runtimeEquals(bucket[i].key, key)) {
        const [removed] = bucket.splice(i, 1);
        if (bucket.length === 0) this.buckets.delete(hash);
        this.sizeValue -= 1;
        return Option.Some(removed.value);
      }
    }
    return Option.None;
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
    return result === Option.None;
  }
  contains(value) {
    return this.map.contains_key(value);
  }
  remove(value) {
    const result = this.map.remove(value);
    return result !== Option.None;
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
    if (this.data.length === 0) return Option.None;
    const value = this.data.shift();
    return Option.Some(value);
  }
  pop_back() {
    if (this.data.length === 0) return Option.None;
    const value = this.data.pop();
    return Option.Some(value);
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
var compareBTreeKeys = /* @__PURE__ */ __name((left, right) => {
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
    return left < right ? -1 : 1;
  }
  const leftText = formatValue(left, {
    color: false
  });
  const rightText = formatValue(right, {
    color: false
  });
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
}, "compareBTreeKeys");
var _BTreeMap = class _BTreeMap {
  constructor() {
    __publicField(this, "entries");
    this.entries = [];
  }
  static new() {
    return new _BTreeMap();
  }
  lowerBound(key) {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (compareBTreeKeys(this.entries[mid].key, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  insert(key, value) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const previous = this.entries[idx].value;
      this.entries[idx].value = value;
      return Option.Some(previous);
    }
    this.entries.splice(idx, 0, {
      key,
      value
    });
    return Option.None;
  }
  get(key) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      return Option.Some(this.entries[idx].value);
    }
    return Option.None;
  }
  remove(key) {
    const idx = this.lowerBound(key);
    if (idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0) {
      const [removed] = this.entries.splice(idx, 1);
      return Option.Some(removed.value);
    }
    return Option.None;
  }
  contains_key(key) {
    const idx = this.lowerBound(key);
    return idx < this.entries.length && compareBTreeKeys(this.entries[idx].key, key) === 0;
  }
  len() {
    return this.entries.length;
  }
  clear() {
    this.entries = [];
  }
  keys() {
    const out = Vec.new();
    for (const entry of this.entries) out.push(entry.key);
    return out;
  }
  values() {
    const out = Vec.new();
    for (const entry of this.entries) out.push(entry.value);
    return out;
  }
  entries_vec() {
    const out = Vec.new();
    for (const entry of this.entries) out.push([
      entry.key,
      entry.value
    ]);
    return out;
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
  entries: /* @__PURE__ */ __name((m) => m.entries_vec(), "entries")
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
    const old = this.map.insert(value, void 0);
    return old === Option.None;
  }
  contains(value) {
    return this.map.contains_key(value);
  }
  remove(value) {
    return this.map.remove(value) !== Option.None;
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
  swap(i, j) {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }
  bubbleUp(index) {
    let idx = index;
    while (idx > 0) {
      const parent = idx - 1 >> 1;
      if (compareBTreeKeys(this.heap[parent], this.heap[idx]) <= 0) break;
      this.swap(parent, idx);
      idx = parent;
    }
  }
  bubbleDown(index) {
    let idx = index;
    const size = this.heap.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;
      if (left < size && compareBTreeKeys(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < size && compareBTreeKeys(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      this.swap(idx, smallest);
      idx = smallest;
    }
  }
  push(value) {
    this.heap.push(value);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return Option.None;
    const head = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return Option.Some(head);
  }
  peek() {
    if (this.heap.length === 0) return Option.None;
    return Option.Some(this.heap[0]);
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
var Option = {
  Some: /* @__PURE__ */ __name((value) => ({
    $tag: "Some",
    $payload: value
  }), "Some"),
  None: {
    $tag: "None"
  },
  map: /* @__PURE__ */ __name((fn, opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  }, "map"),
  and_then: /* @__PURE__ */ __name((fn, opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return fn(getEnumPayload(opt));
    return Option.None;
  }, "and_then"),
  or_else: /* @__PURE__ */ __name((fallback, opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return opt;
    return fallback();
  }, "or_else"),
  unwrap_or: /* @__PURE__ */ __name((fallback, opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return getEnumPayload(opt);
    return fallback;
  }, "unwrap_or"),
  is_some: /* @__PURE__ */ __name((opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    return tag === "Some";
  }, "is_some"),
  is_none: /* @__PURE__ */ __name((opt) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    return tag !== "Some";
  }, "is_none"),
  unwrap: /* @__PURE__ */ __name((opt, message) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return getEnumPayload(opt);
    const rendered = formatValue(opt);
    const msg = message ?? `Tried to unwrap None: ${rendered}`;
    const err = new LuminaPanic(msg, opt);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(err, Option.unwrap);
    }
    throw err;
  }, "unwrap")
};
var Result = {
  Ok: /* @__PURE__ */ __name((value) => ({
    $tag: "Ok",
    $payload: value
  }), "Ok"),
  Err: /* @__PURE__ */ __name((error) => ({
    $tag: "Err",
    $payload: error
  }), "Err"),
  map: /* @__PURE__ */ __name((fn, res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return Result.Ok(fn(getEnumPayload(res)));
    return res;
  }, "map"),
  and_then: /* @__PURE__ */ __name((fn, res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return fn(getEnumPayload(res));
    return res;
  }, "and_then"),
  or_else: /* @__PURE__ */ __name((fn, res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return res;
    return fn(getEnumPayload(res));
  }, "or_else"),
  unwrap_or: /* @__PURE__ */ __name((fallback, res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return getEnumPayload(res);
    return fallback;
  }, "unwrap_or"),
  is_ok: /* @__PURE__ */ __name((res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    return tag === "Ok";
  }, "is_ok"),
  is_err: /* @__PURE__ */ __name((res) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    return tag !== "Ok";
  }, "is_err")
};
var isChannelValue = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && "__lumina_channel_value" in value, "isChannelValue");
var isChannelClose = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && value.__lumina_channel_close === true, "isChannelClose");
var isChannelAck = /* @__PURE__ */ __name((value) => !!value && typeof value === "object" && typeof value.__lumina_channel_ack === "number", "isChannelAck");
var resolveMessageChannel = /* @__PURE__ */ __name(() => {
  if (typeof MessageChannel === "function") return MessageChannel;
  return null;
}, "resolveMessageChannel");
var createSenderSharedState = /* @__PURE__ */ __name((port, capacity) => {
  const state = {
    port,
    credits: capacity,
    refs: 1,
    closed: false,
    receiverClosed: false,
    pending: [],
    flushing: false
  };
  return state;
}, "createSenderSharedState");
var senderPostNow = /* @__PURE__ */ __name((state, value) => {
  if (state.closed || state.receiverClosed) return false;
  if (state.credits !== null && state.credits <= 0) return false;
  if (state.credits !== null) {
    state.credits -= 1;
  }
  const payload = {
    __lumina_channel_value: value
  };
  try {
    state.port.postMessage(payload);
    return true;
  } catch {
    state.closed = true;
    return false;
  }
}, "senderPostNow");
var drainPendingSends = /* @__PURE__ */ __name((state) => {
  if (state.flushing) return;
  state.flushing = true;
  try {
    while (state.pending.length > 0) {
      if (state.closed || state.receiverClosed) {
        while (state.pending.length > 0) {
          const item = state.pending.shift();
          if (item) item.resolve(false);
        }
        return;
      }
      if (state.credits !== null && state.credits <= 0) {
        return;
      }
      const next = state.pending.shift();
      if (!next) return;
      next.resolve(senderPostNow(state, next.value));
    }
  } finally {
    state.flushing = false;
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
    if (this.try_send(value)) return Result.Ok(void 0);
    return Result.Err(this.sendFailureReason());
  }
  async send_async_result(value) {
    const ok = await this.send(value);
    if (ok) return Result.Ok(void 0);
    return Result.Err(this.sendFailureReason());
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
        this.flushWaiters(Option.None);
        return;
      }
      if (isChannelAck(data)) {
        return;
      }
      const value = isChannelValue(data) ? data.__lumina_channel_value : data;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(Option.Some(value));
        this.sendAckIfNeeded();
      } else {
        this.queue.push(value);
      }
    };
    this.port.onmessageerror = () => {
      this.closed = true;
      this.errorMessage = "channel message error";
      this.flushWaiters(Option.None);
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
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Promise.resolve(Option.Some(value));
    }
    if (this.closed) {
      return Promise.resolve(Option.None);
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
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Option.Some(value);
    }
    return Option.None;
  }
  async recv_result() {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    const value = await this.recv();
    const tag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (tag === "None" && this.errorMessage) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(value);
  }
  try_recv_result() {
    if (this.errorMessage && this.queue.length === 0) {
      return Result.Err(this.errorMessage);
    }
    return Result.Ok(this.try_recv());
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
    this.flushWaiters(Option.None);
  }
};
__name(_Receiver, "Receiver");
var Receiver = _Receiver;
var channel = {
  is_available: /* @__PURE__ */ __name(() => resolveMessageChannel() !== null, "is_available"),
  new: /* @__PURE__ */ __name(() => {
    return channel.bounded(-1);
  }, "new"),
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
var async_channel = channel;
var isUrlLike = /* @__PURE__ */ __name((specifier) => /^[a-z]+:/i.test(specifier), "isUrlLike");
var resolveNodeWorkerSpecifier = /* @__PURE__ */ __name((specifier) => {
  if (isUrlLike(specifier)) return specifier;
  const nodePath = getNodePath();
  return nodePath ? nodePath.resolve(specifier) : resolvePathBasic(specifier);
}, "resolveNodeWorkerSpecifier");
var createThreadWorker = /* @__PURE__ */ __name(async (specifier) => {
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
var _Thread = class _Thread {
  constructor(entry) {
    __publicField(this, "entry");
    __publicField(this, "queue", []);
    __publicField(this, "waiters", []);
    __publicField(this, "closed", false);
    __publicField(this, "exitCode", null);
    __publicField(this, "joinWaiters", []);
    this.entry = entry;
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
      waiter(Option.Some(value));
      return;
    }
    this.queue.push(value);
  }
  finish(code) {
    if (this.exitCode !== null) return;
    this.exitCode = code | 0;
    this.closed = true;
    this.flushWaiters(Option.None);
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
      return Promise.resolve(Option.Some(this.queue.shift()));
    }
    if (this.closed) {
      return Promise.resolve(Option.None);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
  try_recv() {
    if (this.queue.length > 0) {
      return Option.Some(this.queue.shift());
    }
    return Option.None;
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
  constructor(task) {
    __publicField(this, "result");
    this.result = Promise.resolve().then(() => task()).then((value) => Result.Ok(value), (error) => Result.Err(error instanceof Error ? error.message : String(error)));
  }
  join() {
    return this.result;
  }
};
__name(_ThreadHandle, "ThreadHandle");
var ThreadHandle = _ThreadHandle;
var thread = {
  is_available: /* @__PURE__ */ __name(() => isNodeRuntime() || typeof Worker === "function", "is_available"),
  spawn: /* @__PURE__ */ __name((task) => {
    if (typeof task === "function") {
      return new ThreadHandle(() => task());
    }
    return thread.spawn_worker(task);
  }, "spawn"),
  spawn_worker: /* @__PURE__ */ __name(async (specifier) => {
    if (typeof specifier !== "string" || specifier.length === 0) {
      return Result.Err("Thread specifier must be a non-empty string");
    }
    try {
      const worker = await createThreadWorker(specifier);
      return Result.Ok(new Thread(worker));
    } catch (error) {
      return Result.Err(String(error));
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
var _Mutex = class _Mutex {
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
};
__name(_Mutex, "Mutex");
var Mutex = _Mutex;
var _Semaphore = class _Semaphore {
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
};
__name(_Semaphore, "Semaphore");
var Semaphore = _Semaphore;
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
var sync = {
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
var activeComputation = null;
var pendingEffects = /* @__PURE__ */ new Set();
var effectFlushPending = false;
var batchDepth = 0;
var runMicrotask = /* @__PURE__ */ __name((fn) => {
  const queue = globalThis.queueMicrotask;
  if (typeof queue === "function") {
    queue(fn);
    return;
  }
  Promise.resolve().then(fn);
}, "runMicrotask");
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
  runMicrotask(() => {
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
    __publicField(this, "value");
    this.value = __lumina_clone(initial);
  }
  get() {
    trackReactiveSource(this);
    return __lumina_clone(this.value);
  }
  peek() {
    return __lumina_clone(this.value);
  }
  set(next) {
    const cloned = __lumina_clone(next);
    if (runtimeEquals(this.value, cloned)) return false;
    this.value = cloned;
    notifyReactiveObservers(this);
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
    __publicField(this, "compute");
    __publicField(this, "computation");
    __publicField(this, "value");
    __publicField(this, "ready", false);
    __publicField(this, "stale", true);
    this.compute = compute;
    this.computation = new ReactiveComputation(() => {
      const next = __lumina_clone(this.compute());
      const changed = !this.ready || !runtimeEquals(this.value, next);
      this.value = next;
      this.ready = true;
      this.stale = false;
      if (changed) {
        notifyReactiveObservers(this);
      }
    }, "memo", () => {
      this.stale = true;
      notifyReactiveObservers(this);
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
    return __lumina_clone(this.value);
  }
  peek() {
    this.ensureFresh();
    return __lumina_clone(this.value);
  }
  dispose() {
    this.computation.dispose();
    this.observers.clear();
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
  return candidate.kind === "text" || candidate.kind === "element" || candidate.kind === "fragment";
}, "isVNode");
var vnodeText = /* @__PURE__ */ __name((value) => ({
  kind: "text",
  text: value == null ? "" : String(value)
}), "vnodeText");
var vnodeElement = /* @__PURE__ */ __name((tag, props, children = []) => ({
  kind: "element",
  tag,
  key: typeof props?.key === "string" || typeof props?.key === "number" ? props.key : void 0,
  props: sanitizeProps(props),
  children: normalizeVNodeChildren(children)
}), "vnodeElement");
var vnodeFragment = /* @__PURE__ */ __name((children = []) => ({
  kind: "fragment",
  children: normalizeVNodeChildren(children)
}), "vnodeFragment");
var serializeVNode = /* @__PURE__ */ __name((node) => JSON.stringify(node), "serializeVNode");
var parseVNode = /* @__PURE__ */ __name((json2) => {
  const parsed = JSON.parse(json2);
  if (!isVNode(parsed)) throw new Error("Invalid VNode payload");
  return parsed;
}, "parseVNode");
var getDomDocument = /* @__PURE__ */ __name((options) => {
  if (options?.document) return options.document;
  const doc = globalThis.document;
  if (!doc) {
    throw new Error("DOM renderer requires a document-like object");
  }
  return doc;
}, "getDomDocument");
var asDomChildren = /* @__PURE__ */ __name((node) => node.children ?? [], "asDomChildren");
var isEventProp = /* @__PURE__ */ __name((name) => /^on[A-Z]/.test(name), "isEventProp");
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
    element[name] = value;
    return;
  }
  if (name in element) {
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
}, "updateDomProperties");
var setChildren = /* @__PURE__ */ __name((container, children) => {
  const current = Array.from(container.childNodes);
  for (const child of current) {
    container.removeChild(child);
  }
  for (const child of children) {
    container.appendChild(child);
  }
}, "setChildren");
var vnodeKindTag = /* @__PURE__ */ __name((node) => `${node.kind}:${node.tag ?? ""}`, "vnodeKindTag");
var createDomNode = /* @__PURE__ */ __name((node, documentLike, eventStore) => {
  if (node.kind === "text") {
    return documentLike.createTextNode(node.text ?? "");
  }
  if (node.kind === "fragment") {
    const wrapper = documentLike.createElement("lumina-fragment");
    const children2 = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore));
    setChildren(wrapper, children2);
    return wrapper;
  }
  const element = documentLike.createElement(node.tag ?? "div");
  updateDomProperties(element, {}, node.props, eventStore);
  const children = asDomChildren(node).map((child) => createDomNode(child, documentLike, eventStore));
  setChildren(element, children);
  return element;
}, "createDomNode");
var patchDomNode = /* @__PURE__ */ __name((domNode, prevNode, nextNode, documentLike, eventStore) => {
  if (vnodeKindTag(prevNode) !== vnodeKindTag(nextNode)) {
    const replacement = createDomNode(nextNode, documentLike, eventStore);
    const parent = domNode.parentNode;
    if (parent && parent.replaceChild) {
      parent.replaceChild(replacement, domNode);
      return replacement;
    }
    return replacement;
  }
  if (nextNode.kind === "text") {
    const nextText = nextNode.text ?? "";
    if (domNode.textContent !== nextText) {
      domNode.textContent = nextText;
    }
    return domNode;
  }
  const element = domNode;
  if (nextNode.kind === "element") {
    updateDomProperties(element, prevNode.props, nextNode.props, eventStore);
  }
  const prevChildren = asDomChildren(prevNode);
  const nextChildren = asDomChildren(nextNode);
  const shared = Math.min(prevChildren.length, nextChildren.length);
  for (let i = 0; i < shared; i += 1) {
    const currentChild = element.childNodes[i];
    if (!currentChild) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore));
      continue;
    }
    patchDomNode(currentChild, prevChildren[i], nextChildren[i], documentLike, eventStore);
  }
  if (nextChildren.length > prevChildren.length) {
    for (let i = prevChildren.length; i < nextChildren.length; i += 1) {
      element.appendChild(createDomNode(nextChildren[i], documentLike, eventStore));
    }
  } else if (prevChildren.length > nextChildren.length) {
    for (let i = prevChildren.length - 1; i >= nextChildren.length; i -= 1) {
      const child = element.childNodes[i];
      if (child) element.removeChild(child);
    }
  }
  return element;
}, "patchDomNode");
var createDomRenderer = /* @__PURE__ */ __name((options) => {
  const documentLike = getDomDocument(options);
  const eventStore = /* @__PURE__ */ new Map();
  let currentDom = null;
  let currentVNode = null;
  return {
    mount(node, container) {
      const domContainer = container;
      const domNode = createDomNode(node, documentLike, eventStore);
      setChildren(domContainer, [
        domNode
      ]);
      currentDom = domNode;
      currentVNode = node;
    },
    patch(prev, next, container) {
      const domContainer = container;
      if (!currentDom || !currentVNode || !prev) {
        const domNode = createDomNode(next, documentLike, eventStore);
        setChildren(domContainer, [
          domNode
        ]);
        currentDom = domNode;
        currentVNode = next;
        return;
      }
      const nextDom = patchDomNode(currentDom, prev, next, documentLike, eventStore);
      if (nextDom !== currentDom) {
        setChildren(domContainer, [
          nextDom
        ]);
      }
      currentDom = nextDom;
      currentVNode = next;
    },
    hydrate(node, container) {
      const domContainer = container;
      const existing = domContainer.childNodes?.[0] ?? null;
      if (!existing) {
        const domNode = createDomNode(node, documentLike, eventStore);
        setChildren(domContainer, [
          domNode
        ]);
        currentDom = domNode;
        currentVNode = node;
        return;
      }
      currentDom = existing;
      currentVNode = node;
    },
    unmount(container) {
      const domContainer = container;
      setChildren(domContainer, []);
      currentDom = null;
      currentVNode = null;
      eventStore.clear();
    }
  };
}, "createDomRenderer");
var htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
var escapeHtml = /* @__PURE__ */ __name((value) => value.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char), "escapeHtml");
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
var vnodeToHtml = /* @__PURE__ */ __name((node) => {
  if (node.kind === "text") return escapeHtml(node.text ?? "");
  const children = (node.children ?? []).map((child) => vnodeToHtml(child)).join("");
  if (node.kind === "fragment") return children;
  const tag = node.tag ?? "div";
  const attrs = serializePropsToHtml(node.props);
  if (voidHtmlTags.has(tag.toLowerCase())) {
    return `<${tag}${attrs}>`;
  }
  return `<${tag}${attrs}>${children}</${tag}>`;
}, "vnodeToHtml");
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
var createSsrRenderer = /* @__PURE__ */ __name(() => {
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
}, "createSsrRenderer");
var renderToString = /* @__PURE__ */ __name((node) => vnodeToHtml(node), "renderToString");
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
var drawCanvasVNode = /* @__PURE__ */ __name((ctx, node, state) => {
  if (node.kind === "text") {
    if (ctx.fillText) ctx.fillText(node.text ?? "", state.x, state.y);
    return state.y + state.lineHeight;
  }
  if (node.kind === "fragment") {
    let y2 = state.y;
    for (const child of node.children ?? []) {
      y2 = drawCanvasVNode(ctx, child, {
        ...state,
        y: y2
      });
    }
    return y2;
  }
  const props = node.props ?? {};
  const tag = (node.tag ?? "").toLowerCase();
  if (typeof props.fill === "string") ctx.fillStyle = props.fill;
  if (typeof props.stroke === "string") ctx.strokeStyle = props.stroke;
  if (typeof props.font === "string") ctx.font = props.font;
  if (tag === "rect") {
    const x = Number(props.x ?? state.x);
    const y2 = Number(props.y ?? state.y);
    const width = Number(props.width ?? 50);
    const height = Number(props.height ?? 20);
    if (ctx.fillRect) ctx.fillRect(x, y2, width, height);
    if (ctx.strokeRect) ctx.strokeRect(x, y2, width, height);
    return Math.max(state.y + state.lineHeight, y2 + height + 4);
  }
  if (tag === "circle") {
    const x = Number(props.x ?? state.x);
    const y2 = Number(props.y ?? state.y);
    const radius = Number(props.radius ?? 10);
    if (ctx.beginPath && ctx.arc) {
      ctx.beginPath();
      ctx.arc(x, y2, radius, 0, Math.PI * 2);
      if (ctx.fill) ctx.fill();
      if (ctx.stroke) ctx.stroke();
    }
    return Math.max(state.y + state.lineHeight, y2 + radius + 4);
  }
  if (tag === "text") {
    const value = typeof props.value === "string" ? props.value : (node.children ?? []).map((child) => child.text ?? "").join("");
    const x = Number(props.x ?? state.x);
    const y2 = Number(props.y ?? state.y);
    if (ctx.fillText) ctx.fillText(value, x, y2);
    return Math.max(state.y + state.lineHeight, y2 + state.lineHeight);
  }
  let y = state.y;
  for (const child of node.children ?? []) {
    y = drawCanvasVNode(ctx, child, {
      ...state,
      y
    });
  }
  return y;
}, "drawCanvasVNode");
var createCanvasRenderer = /* @__PURE__ */ __name((options) => {
  let context = options?.context ?? null;
  return {
    mount(node, container) {
      context = resolveCanvasContext(container, options);
      const width = Number(options?.width ?? context.canvas?.width ?? 800);
      const height = Number(options?.height ?? context.canvas?.height ?? 600);
      if (options?.clear !== false && context.clearRect) {
        context.clearRect(0, 0, width, height);
      }
      drawCanvasVNode(context, node, {
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
      drawCanvasVNode(ctx, next, {
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
var vnodeToTerminal = /* @__PURE__ */ __name((node, depth = 0) => {
  const indent = "  ".repeat(depth);
  if (node.kind === "text") {
    return [
      `${indent}${node.text ?? ""}`
    ];
  }
  if (node.kind === "fragment") {
    return (node.children ?? []).flatMap((child) => vnodeToTerminal(child, depth));
  }
  const tag = node.tag ?? "div";
  const head = `${indent}<${tag}>`;
  const children = (node.children ?? []).flatMap((child) => vnodeToTerminal(child, depth + 1));
  const tail = `${indent}</${tag}>`;
  return [
    head,
    ...children,
    tail
  ];
}, "vnodeToTerminal");
var renderToTerminal = /* @__PURE__ */ __name((node) => vnodeToTerminal(node).join("\n"), "renderToTerminal");
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
var createTerminalRenderer = /* @__PURE__ */ __name(() => ({
  mount(node, container) {
    setTerminalOutput(container, renderToTerminal(node));
  },
  patch(_prev, next, container) {
    setTerminalOutput(container, renderToTerminal(next));
  },
  hydrate(node, container) {
    setTerminalOutput(container, renderToTerminal(node));
  },
  unmount(container) {
    setTerminalOutput(container, "");
  }
}), "createTerminalRenderer");
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
  constructor(root, effect) {
    __publicField(this, "root");
    __publicField(this, "effect");
    this.root = root;
    this.effect = effect;
  }
  dispose() {
    this.effect.dispose();
    this.root.unmount();
  }
};
__name(_ReactiveRenderRoot, "ReactiveRenderRoot");
var ReactiveRenderRoot = _ReactiveRenderRoot;
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
var render = {
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
  dispose_effect: /* @__PURE__ */ __name((effect) => effect.dispose(), "dispose_effect"),
  batch: /* @__PURE__ */ __name((fn) => {
    batchDepth += 1;
    try {
      return fn();
    } finally {
      batchDepth = Math.max(0, batchDepth - 1);
      if (batchDepth === 0) {
        flushEffects();
      }
    }
  }, "batch"),
  untrack: /* @__PURE__ */ __name((fn) => {
    const previous = activeComputation;
    activeComputation = null;
    try {
      return fn();
    } finally {
      activeComputation = previous;
    }
  }, "untrack"),
  text: /* @__PURE__ */ __name((value) => vnodeText(value), "text"),
  element: /* @__PURE__ */ __name((tag, props, children = []) => vnodeElement(tag, props, children), "element"),
  props_empty: /* @__PURE__ */ __name(() => ({}), "props_empty"),
  props_class: /* @__PURE__ */ __name((className) => ({
    className
  }), "props_class"),
  props_on_click: /* @__PURE__ */ __name((handler) => ({
    onClick: typeof handler === "function" ? handler : () => void 0
  }), "props_on_click"),
  props_on_click_delta: /* @__PURE__ */ __name((signal, delta) => ({
    onClick: /* @__PURE__ */ __name(() => {
      signal.set(signal.get() + delta);
    }, "onClick")
  }), "props_on_click_delta"),
  props_on_click_inc: /* @__PURE__ */ __name((signal) => ({
    onClick: /* @__PURE__ */ __name(() => {
      signal.set(signal.get() + 1);
    }, "onClick")
  }), "props_on_click_inc"),
  props_on_click_dec: /* @__PURE__ */ __name((signal) => ({
    onClick: /* @__PURE__ */ __name(() => {
      signal.set(signal.get() - 1);
    }, "onClick")
  }), "props_on_click_dec"),
  props_merge: /* @__PURE__ */ __name((left, right) => {
    const lhs = left && typeof left === "object" ? left : {};
    const rhs = right && typeof right === "object" ? right : {};
    return {
      ...lhs,
      ...rhs
    };
  }, "props_merge"),
  dom_get_element_by_id: /* @__PURE__ */ __name((id) => {
    const doc = globalThis.document;
    if (!doc || typeof doc.getElementById !== "function") return null;
    return doc.getElementById(id);
  }, "dom_get_element_by_id"),
  fragment: /* @__PURE__ */ __name((children = []) => vnodeFragment(children), "fragment"),
  is_vnode: /* @__PURE__ */ __name((value) => isVNode(value), "is_vnode"),
  serialize: /* @__PURE__ */ __name((node) => serializeVNode(node), "serialize"),
  parse: /* @__PURE__ */ __name((json2) => parseVNode(json2), "parse"),
  create_renderer: /* @__PURE__ */ __name((renderer) => coerceRenderer(renderer), "create_renderer"),
  create_dom_renderer: /* @__PURE__ */ __name((options) => createDomRenderer(options), "create_dom_renderer"),
  create_ssr_renderer: /* @__PURE__ */ __name(() => createSsrRenderer(), "create_ssr_renderer"),
  create_canvas_renderer: /* @__PURE__ */ __name((options) => createCanvasRenderer(options), "create_canvas_renderer"),
  create_terminal_renderer: /* @__PURE__ */ __name(() => createTerminalRenderer(), "create_terminal_renderer"),
  render_to_string: /* @__PURE__ */ __name((node) => renderToString(node), "render_to_string"),
  render_to_terminal: /* @__PURE__ */ __name((node) => renderToTerminal(node), "render_to_terminal"),
  create_root: /* @__PURE__ */ __name((renderer, container) => new RenderRoot(coerceRenderer(renderer), container), "create_root"),
  mount: /* @__PURE__ */ __name((renderer, container, node) => {
    const root = new RenderRoot(coerceRenderer(renderer), container);
    root.mount(node);
    return root;
  }, "mount"),
  hydrate: /* @__PURE__ */ __name((renderer, container, node) => {
    const root = new RenderRoot(coerceRenderer(renderer), container);
    root.hydrate(node);
    return root;
  }, "hydrate"),
  mount_reactive: /* @__PURE__ */ __name((renderer, container, view) => {
    const root = new RenderRoot(coerceRenderer(renderer), container);
    const fx = new Effect(() => {
      const node = view();
      root.update(node);
    });
    return new ReactiveRenderRoot(root, fx);
  }, "mount_reactive"),
  hydrate_reactive: /* @__PURE__ */ __name((renderer, container, view) => {
    const root = new RenderRoot(coerceRenderer(renderer), container);
    let initialized = false;
    const fx = new Effect(() => {
      const node = view();
      if (!initialized) {
        root.hydrate(node);
        initialized = true;
        return;
      }
      root.update(node);
    });
    return new ReactiveRenderRoot(root, fx);
  }, "hydrate_reactive"),
  update: /* @__PURE__ */ __name((root, node) => root.update(node), "update"),
  unmount: /* @__PURE__ */ __name((root) => root.unmount(), "unmount"),
  dispose_reactive: /* @__PURE__ */ __name((root) => root.dispose(), "dispose_reactive")
};
var createSignal = /* @__PURE__ */ __name((initial) => render.signal(initial), "createSignal");
var get = /* @__PURE__ */ __name((signal) => render.get(signal), "get");
var set = /* @__PURE__ */ __name((signal, value) => render.set(signal, value), "set");
var createMemo = /* @__PURE__ */ __name((compute) => render.memo(compute), "createMemo");
var createEffect = /* @__PURE__ */ __name((fn) => render.effect(fn), "createEffect");
var vnode = /* @__PURE__ */ __name((tag, attrs, children = []) => render.element(tag, attrs, children), "vnode");
var text = /* @__PURE__ */ __name((value) => render.text(value), "text");
var mount_reactive = /* @__PURE__ */ __name((renderer, container, view) => render.mount_reactive(renderer, container, view), "mount_reactive");
var props_empty = /* @__PURE__ */ __name(() => render.props_empty(), "props_empty");
var props_class = /* @__PURE__ */ __name((className) => render.props_class(className), "props_class");
var props_on_click = /* @__PURE__ */ __name((handler) => render.props_on_click(handler), "props_on_click");
var props_on_click_delta = /* @__PURE__ */ __name((signal, delta) => render.props_on_click_delta(signal, delta), "props_on_click_delta");
var props_on_click_inc = /* @__PURE__ */ __name((signal) => render.props_on_click_inc(signal), "props_on_click_inc");
var props_on_click_dec = /* @__PURE__ */ __name((signal) => render.props_on_click_dec(signal), "props_on_click_dec");
var props_merge = /* @__PURE__ */ __name((left, right) => render.props_merge(left, right), "props_merge");
var dom_get_element_by_id = /* @__PURE__ */ __name((id) => render.dom_get_element_by_id(id), "dom_get_element_by_id");
var reactive = {
  createSignal,
  get,
  set,
  createMemo,
  createEffect,
  updateSignal: render.update_signal,
  batch: render.batch,
  untrack: render.untrack
};
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
var functor = {
  map_option: /* @__PURE__ */ __name((value, mapper) => Option.map(mapper, value), "map_option"),
  map_result: /* @__PURE__ */ __name((value, mapper) => Result.map(mapper, value), "map_result"),
  map_vec: /* @__PURE__ */ __name((values, mapper) => vec.map(values, mapper), "map_vec"),
  map_hashmap_values: /* @__PURE__ */ __name((values, mapper) => mapHashMapValues(values, mapper), "map_hashmap_values")
};
var applicative = {
  pure_option: /* @__PURE__ */ __name((value) => Option.Some(value), "pure_option"),
  pure_result: /* @__PURE__ */ __name((value) => Result.Ok(value), "pure_result"),
  pure_vec: /* @__PURE__ */ __name((value) => Vec.from([
    value
  ]), "pure_vec"),
  pure_hashmap: /* @__PURE__ */ __name((key, value) => pureHashMap(key, value), "pure_hashmap"),
  ap_option: /* @__PURE__ */ __name((fns, value) => {
    const fnTag = fns && typeof fns === "object" && isEnumLike(fns) ? getEnumTag(fns) : "";
    const valueTag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (fnTag !== "Some" || valueTag !== "Some") return Option.None;
    const fn = getEnumPayload(fns);
    if (typeof fn !== "function") return Option.None;
    return Option.Some(fn(getEnumPayload(value)));
  }, "ap_option"),
  ap_result: /* @__PURE__ */ __name((fns, value) => {
    const fnTag = fns && typeof fns === "object" && isEnumLike(fns) ? getEnumTag(fns) : "";
    if (fnTag !== "Ok") return fns;
    const valueTag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (valueTag !== "Ok") return value;
    const fn = getEnumPayload(fns);
    if (typeof fn !== "function") return Result.Err("Result ap expected Ok(function)");
    return Result.Ok(fn(getEnumPayload(value)));
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
var monad = {
  flat_map_option: /* @__PURE__ */ __name((value, mapper) => Option.and_then(mapper, value), "flat_map_option"),
  flat_map_result: /* @__PURE__ */ __name((value, mapper) => Result.and_then(mapper, value), "flat_map_result"),
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
  join_option: /* @__PURE__ */ __name((value) => Option.and_then((v) => v, value), "join_option"),
  join_result: /* @__PURE__ */ __name((value) => Result.and_then((v) => v, value), "join_result"),
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
var foldable = {
  fold_option: /* @__PURE__ */ __name((value, init, folder) => {
    const tag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (tag !== "Some") return init;
    return folder(init, getEnumPayload(value));
  }, "fold_option"),
  fold_result: /* @__PURE__ */ __name((value, init, folder) => {
    const tag = value && typeof value === "object" && isEnumLike(value) ? getEnumTag(value) : "";
    if (tag !== "Ok") return init;
    return folder(init, getEnumPayload(value));
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
var traversable = {
  traverse_vec_option: /* @__PURE__ */ __name((values, mapper) => {
    const out = Vec.new();
    for (const value of values) {
      const mapped = mapper(value);
      const tag = mapped && typeof mapped === "object" && isEnumLike(mapped) ? getEnumTag(mapped) : "";
      if (tag !== "Some") return Option.None;
      out.push(getEnumPayload(mapped));
    }
    return Option.Some(out);
  }, "traverse_vec_option"),
  traverse_vec_result: /* @__PURE__ */ __name((values, mapper) => {
    const out = Vec.new();
    for (const value of values) {
      const mapped = mapper(value);
      const tag = mapped && typeof mapped === "object" && isEnumLike(mapped) ? getEnumTag(mapped) : "";
      if (tag !== "Ok") return mapped;
      out.push(getEnumPayload(mapped));
    }
    return Result.Ok(out);
  }, "traverse_vec_result"),
  sequence_vec_option: /* @__PURE__ */ __name((values) => traversable.traverse_vec_option(values, (item) => item), "sequence_vec_option"),
  sequence_vec_result: /* @__PURE__ */ __name((values) => traversable.traverse_vec_result(values, (item) => item), "sequence_vec_result")
};
function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
__name(__set, "__set");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AtomicI32,
  BTreeMap,
  BTreeSet,
  Deque,
  Effect,
  HashMap,
  HashSet,
  LuminaPanic,
  Memo,
  Mutex,
  Option,
  PriorityQueue,
  ReactiveRenderRoot,
  Receiver,
  RenderRoot,
  Result,
  Semaphore,
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
  applicative,
  async_channel,
  btreemap,
  btreeset,
  channel,
  createCanvasRenderer,
  createDomRenderer,
  createEffect,
  createMemo,
  createSignal,
  createSsrRenderer,
  createTerminalRenderer,
  crypto,
  deque,
  dom_get_element_by_id,
  env,
  foldable,
  formatValue,
  fs,
  functor,
  get,
  hashmap,
  hashset,
  http,
  io,
  isVNode,
  join_all,
  json,
  list,
  math,
  monad,
  mount_reactive,
  parseVNode,
  path,
  priority_queue,
  process,
  props_class,
  props_empty,
  props_merge,
  props_on_click,
  props_on_click_dec,
  props_on_click_delta,
  props_on_click_inc,
  reactive,
  regex,
  render,
  renderToString,
  renderToTerminal,
  serializeVNode,
  set,
  str,
  sync,
  text,
  thread,
  time,
  timeout,
  toJsonString,
  traversable,
  vec,
  vnode,
  vnodeElement,
  vnodeFragment,
  vnodeText
});
//# sourceMappingURL=lumina-runtime.cjs.map