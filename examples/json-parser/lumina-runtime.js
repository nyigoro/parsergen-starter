var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/lumina-runtime.ts
import { readFileSync } from "fs";
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
var isNodeRuntime = /* @__PURE__ */ __name(() => typeof process !== "undefined" && typeof process.versions?.node === "string", "isNodeRuntime");
var supportsColor = /* @__PURE__ */ __name(() => {
  if (typeof window !== "undefined") return false;
  if (!isNodeRuntime()) return false;
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
var renderArgs = /* @__PURE__ */ __name((args) => args.map((arg) => formatValue(arg)).join(" "), "renderArgs");
var writeStdout = /* @__PURE__ */ __name((text, newline) => {
  if (isNodeRuntime()) {
    const stdout = process.stdout;
    if (stdout?.write) {
      stdout.write(text + (newline ? "\n" : ""));
      return;
    }
  }
  console.log(text);
}, "writeStdout");
var writeStderr = /* @__PURE__ */ __name((text, newline) => {
  if (isNodeRuntime()) {
    const stderr = process.stderr;
    if (stderr?.write) {
      stderr.write(text + (newline ? "\n" : ""));
      return;
    }
  }
  console.error(text);
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
    const stdin = process.stdin;
    const isTty = stdin?.isTTY;
    if (isTty !== true) {
      try {
        const raw = readFileSync(0, "utf8");
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
  printJson: /* @__PURE__ */ __name((value, pretty = true) => {
    console.log(toJsonString(value, pretty));
  }, "printJson")
};
var str = {
  length: /* @__PURE__ */ __name((value) => value.length, "length"),
  concat: /* @__PURE__ */ __name((a, b) => a + b, "concat"),
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
function __set(obj, prop, value) {
  obj[prop] = value;
  return value;
}
__name(__set, "__set");
export {
  LuminaPanic,
  Option,
  Result,
  __set,
  formatValue,
  io,
  list,
  math,
  str,
  toJsonString
};
//# sourceMappingURL=lumina-runtime.js.map