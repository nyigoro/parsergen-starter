"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/lumina-runtime.ts
var lumina_runtime_exports = {};
__export(lumina_runtime_exports, {
  LuminaPanic: () => LuminaPanic,
  Option: () => Option,
  Result: () => Result,
  __set: () => __set,
  formatValue: () => formatValue,
  io: () => io,
  toJsonString: () => toJsonString
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
var supportsColor = /* @__PURE__ */ __name(() => {
  if (typeof window !== "undefined") return false;
  if (typeof process === "undefined") return false;
  const stdout = process.stdout;
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
var colorize = /* @__PURE__ */ __name((text, color, enabled) => {
  if (!enabled || !color) return text;
  return `${color}${text}${colors.reset}`;
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
var io = {
  println: /* @__PURE__ */ __name((...args) => {
    const rendered = args.map((arg) => formatValue(arg));
    console.log(...rendered);
  }, "println"),
  printJson: /* @__PURE__ */ __name((value, pretty = true) => {
    console.log(toJsonString(value, pretty));
  }, "printJson"),
  print: /* @__PURE__ */ __name((...args) => {
    const rendered = args.map((arg) => formatValue(arg));
    console.log(...rendered);
  }, "print")
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
  map: /* @__PURE__ */ __name((opt, fn) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return Option.Some(fn(getEnumPayload(opt)));
    return Option.None;
  }, "map"),
  and_then: /* @__PURE__ */ __name((opt, fn) => {
    const tag = opt && typeof opt === "object" && isEnumLike(opt) ? getEnumTag(opt) : "";
    if (tag === "Some") return fn(getEnumPayload(opt));
    return Option.None;
  }, "and_then"),
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
  map: /* @__PURE__ */ __name((res, fn) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return Result.Ok(fn(getEnumPayload(res)));
    return res;
  }, "map"),
  and_then: /* @__PURE__ */ __name((res, fn) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return fn(getEnumPayload(res));
    return res;
  }, "and_then"),
  unwrap_or: /* @__PURE__ */ __name((res, fallback) => {
    const tag = res && typeof res === "object" && isEnumLike(res) ? getEnumTag(res) : "";
    if (tag === "Ok") return getEnumPayload(res);
    return fallback;
  }, "unwrap_or")
};
function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
__name(__set, "__set");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  LuminaPanic,
  Option,
  Result,
  __set,
  formatValue,
  io,
  toJsonString
});
//# sourceMappingURL=lumina-runtime.cjs.map